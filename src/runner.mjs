import { chromium } from "playwright";
import { appendFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const noDelay = args.has("--no-delay");
const pauseOnAuth = args.has("--pause-on-auth");
const fastMode = args.has("--fast");
const allTargetsMode = args.has("--all-targets");
const sessionOverride = getArgValue("--sessions");
const targetFilter = getArgValue("--target");
const kindFilter = getArgValue("--kind");

const configPath = path.resolve("config/targets.local.json");
const fallbackConfigPath = path.resolve("config/targets.example.json");
const promptsPath = path.resolve("config/prompts.json");

const config = await readJson(configPath).catch(() => readJson(fallbackConfigPath));
const prompts = await readJson(promptsPath);
const targetFilters = targetFilter
  ? targetFilter.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean)
  : [];

const enabledTargets = config.targets.filter((target) => {
  if (target.enabled === false) return false;
  if (kindFilter === "chat-like" && !["chat", "isolated-chat", "embedded-chat"].includes(target.kind)) return false;
  if (kindFilter && kindFilter !== "chat-like" && target.kind !== kindFilter) return false;
  if (targetFilters.length > 0 && !targetFilters.some((filter) => target.name.toLowerCase().includes(filter))) return false;
  return true;
});
if (enabledTargets.length === 0) {
  throw new Error("No enabled targets found for the requested filters. Check --target, --kind, or config/targets.local.json.");
}

const runConfig = {
  sessions: 1,
  minDelayMs: 2500,
  maxDelayMs: 9000,
  defaultTimeoutMs: 20000,
  downloadDir: "downloads",
  deleteDownloads: true,
  allowUploads: false,
  uploadProbability: 0.2,
  multiTurnProbability: 0.35,
  maxChatTurns: 3,
  promptCategories: Object.keys(prompts),
  logFile: "runs.jsonl",
  ...(config.run ?? {})
};

if (sessionOverride) {
  const parsedSessions = Number.parseInt(sessionOverride, 10);
  if (Number.isInteger(parsedSessions) && parsedSessions > 0) {
    runConfig.sessions = parsedSessions;
  }
}

if (fastMode) {
  runConfig.minDelayMs = Math.min(runConfig.minDelayMs, 1000);
  runConfig.maxDelayMs = Math.min(runConfig.maxDelayMs, 3000);
}

const plannedTargets = allTargetsMode
  ? shuffle(enabledTargets).slice(0, sessionOverride ? runConfig.sessions : enabledTargets.length)
  : Array.from({ length: runConfig.sessions }, () => chooseWeightedTarget(enabledTargets));

const downloadDir = path.resolve(runConfig.downloadDir);
await mkdir(downloadDir, { recursive: true });

const summary = {
  ok: 0,
  failed: 0,
  byKind: {},
  prompts: 0,
  uploads: 0,
  authRequired: 0,
  gated: 0
};

const context = dryRun ? null : await launchContext(config.browser ?? {}, downloadDir);
if (context) {
  await closeInitialBlankPages(context);
}

try {
  for (let session = 0; session < plannedTargets.length; session += 1) {
    const target = plannedTargets[session];
    const event = {
      ts: new Date().toISOString(),
      dryRun,
      session: session + 1,
      target: target.name,
      kind: target.kind
    };

    console.log(`[${event.ts}] ${dryRun ? "DRY " : ""}${target.kind}: ${target.name}`);

    try {
      if (dryRun) {
        event.action = previewAction(target);
      } else {
        event.action = await runTarget(context, target);
      }
      event.ok = true;
      updateSummary(summary, event);
    } catch (error) {
      event.ok = false;
      event.error = error.message;
      console.warn(`Target failed: ${target.name}: ${error.message}`);
      updateSummary(summary, event);
    }

    await appendJsonLine(runConfig.logFile, event);
    await cleanupDownloads(downloadDir, runConfig.deleteDownloads);

    if (!noDelay && session < plannedTargets.length - 1) {
      await delay(randomInt(runConfig.minDelayMs, runConfig.maxDelayMs));
    }
  }
} finally {
  if (context) {
    await context.close();
  }
  printSummary(summary);
}

async function launchContext(browserConfig, downloadsPath) {
  const channel = browserConfig.channel || "msedge";
  const userDataDir = browserConfig.userDataDir?.trim()
    ? path.resolve(expandConfigPath(browserConfig.userDataDir))
    : path.resolve(".browser-profile");

  const args = [];
  if (browserConfig.profileDirectory?.trim()) {
    args.push(`--profile-directory=${browserConfig.profileDirectory.trim()}`);
  }

  return chromium.launchPersistentContext(userDataDir, {
    channel,
    headless: browserConfig.headless ?? false,
    chromiumSandbox: browserConfig.chromiumSandbox ?? true,
    acceptDownloads: true,
    downloadsPath,
    viewport: browserConfig.viewport ?? { width: 1440, height: 950 },
    timeout: runConfig.defaultTimeoutMs,
    args: ["--test-type", ...args]
  });
}

async function closeInitialBlankPages(context) {
  for (const page of context.pages()) {
    if (page.url() === "about:blank") {
      await page.close().catch(() => {});
    }
  }
}

async function runTarget(context, target) {
  const page = await context.newPage();
  page.setDefaultTimeout(runConfig.defaultTimeoutMs);

  try {
    await page.goto(target.url, { waitUntil: "domcontentloaded" });
    await humanPause();
    await dismissOverlays(page);

    if (target.kind === "browse") {
      return await browse(page, target);
    }

    if (target.kind === "chat") {
      return await chat(page, target);
    }

    if (target.kind === "isolated-chat") {
      return await isolatedChat(page, target);
    }

    if (target.kind === "embedded-chat") {
      await clickFirstAvailable(page, target.selectors?.launcher ?? []);
      await humanPause();
      return await chat(page, target);
    }

    if (target.kind === "download") {
      return await download(page, target);
    }

    throw new Error(`Unsupported target kind: ${target.kind}`);
  } finally {
    await page.close().catch(() => {});
  }
}

async function browse(page, target) {
  const maxClicks = target.maxClicks ?? 1;

  for (let i = 0; i < randomInt(2, 5); i += 1) {
    await page.mouse.wheel(0, randomInt(250, 900));
    await humanPause();
  }

  let clicks = 0;
  const links = page.locator("a[href^='http'], a[href^='/']");
  const count = await links.count().catch(() => 0);
  for (let i = 0; i < count && clicks < maxClicks; i += 1) {
    const link = links.nth(randomInt(0, Math.max(0, count - 1)));
    const href = await link.getAttribute("href").catch(() => "");
    if (!href || href.startsWith("mailto:") || href.includes("logout")) continue;
    await link.click({ timeout: 3000 }).catch(() => {});
    await page.waitForLoadState("domcontentloaded", { timeout: 8000 }).catch(() => {});
    await humanPause();
    clicks += 1;
  }

  return { browsed: true, clicks };
}

async function chat(page, target) {
  const gateState = await detectAccessGate(page);
  if (gateState.gated) {
    if (!(await pauseForManualResolution(page, target, gateState))) {
      return gateState;
    }
  }

  const authState = await detectAuthRequired(page);
  if (authState.authRequired) {
    const googleAccess = await tryGoogleAuth(page, target);
    if (googleAccess) {
      return await chat(page, target);
    }

    const guestAccess = await tryGuestAccess(page, target);
    if (!guestAccess) {
      if (await pauseForManualResolution(page, target, authState)) {
        return await chat(page, target);
      }
      return authState;
    }
  }

  const turns = chooseChatTurnCount(target);
  const firstPrompt = buildPrompt(target);
  const uploaded = await maybeUpload(page, target);
  const promptCategories = [firstPrompt.category];

  await sendChatPrompt(page, target, firstPrompt);
  await humanPause(5000, 14000);

  for (let turn = 2; turn <= turns; turn += 1) {
    const followUp = buildFollowUpPrompt(firstPrompt.category, turn);
    promptCategories.push(followUp.category);
    await sendChatPrompt(page, target, followUp);
    await humanPause(6000, 18000);
  }

  return { promptCategories, turns, uploaded };
}

async function isolatedChat(page, target) {
  const prompt = buildPrompt(target);
  const viewport = page.viewportSize() ?? { width: 1440, height: 950 };
  const clickPoint = target.isolation?.inputClick ?? { xRatio: 0.5, yRatio: 0.86 };
  const settleMs = target.isolation?.settleMs ?? 12000;

  await delay(settleMs);
  await page.mouse.click(
    Math.round(viewport.width * clickPoint.xRatio),
    Math.round(viewport.height * clickPoint.yRatio)
  );
  await humanPause(800, 1800);
  await page.keyboard.type(prompt.text, { delay: randomInt(10, 40) });
  await humanPause(400, 1200);
  await page.keyboard.press("Enter");
  await humanPause(4000, 12000);

  return {
    promptCategory: prompt.category,
    isolated: true,
    uploaded: false
  };
}

async function sendChatPrompt(page, target, prompt) {
  await dismissOverlays(page);
  try {
    const input = await findFirstVisible(page, target.selectors?.input ?? defaultInputSelectors());
    await typeIntoInput(input, prompt);

    const sentByButton = await clickFirstAvailable(page, target.selectors?.send ?? []);
    if (!sentByButton) {
      await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter").catch(async () => {
        await input.press("Enter");
      });
    }
  } catch (error) {
    if (!target.keyboardFallback?.enabled) throw error;
    await sendPromptWithKeyboardFallback(page, target, prompt);
  }
}

async function sendPromptWithKeyboardFallback(page, target, prompt) {
  const viewport = page.viewportSize() ?? { width: 1440, height: 950 };
  const clickPoint = target.keyboardFallback?.inputClick ?? { xRatio: 0.5, yRatio: 0.85 };

  await page.mouse.click(
    Math.round(viewport.width * clickPoint.xRatio),
    Math.round(viewport.height * clickPoint.yRatio)
  );
  await humanPause(500, 1200);
  await page.keyboard.type(prompt.text, { delay: randomInt(8, 35) });
  await humanPause(300, 900);
  await page.keyboard.press("Enter");
}

async function dismissOverlays(page) {
  await page.keyboard.press("Escape").catch(() => {});

  const selectors = [
    "button[aria-label*='close' i]",
    "button[title*='close' i]",
    "[role='button'][aria-label*='close' i]",
    "button:has-text('Accept all')",
    "button:has-text('Accept')",
    "button:has-text('I agree')",
    "button:has-text('Got it')",
    "button:has-text('Maybe later')",
    "button:has-text('Not now')",
    "button:has-text('Skip')"
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    await locator.click({ timeout: 1500 }).catch(() => {});
    await humanPause(300, 900);
  }
}

async function detectAccessGate(page) {
  const url = page.url();
  const title = await page.title().catch(() => "");
  const gateSelectors = [
    "text=/verify you are human/i",
    "text=/checking your browser/i",
    "text=/just a moment/i",
    ".cf-turnstile",
    "iframe[src*='challenges.cloudflare.com']"
  ];

  if (/just a moment/i.test(title)) {
    return { gated: true, challengeRequired: true, title, url };
  }

  for (const selector of gateSelectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) > 0 && (await locator.isVisible().catch(() => false))) {
      return { gated: true, challengeRequired: true, title, url };
    }
  }

  return { gated: false };
}

async function pauseForManualResolution(page, target, state) {
  if (!pauseOnAuth) return false;

  console.warn(`Manual action needed for ${target.name}: ${state.challengeRequired ? "human verification" : "login/auth"}.`);
  console.warn("Complete it in the browser window, then press Enter here to retry. Press Ctrl+C to stop.");

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    await rl.question("");
  } finally {
    rl.close();
  }

  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await humanPause();

  const gateState = await detectAccessGate(page);
  if (gateState.gated) return false;

  const authState = await detectAuthRequired(page);
  return !authState.authRequired;
}

async function tryGoogleAuth(page, target) {
  const selectors = target.auth?.googleSelectors ?? [];
  if (selectors.length === 0) return false;

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;

    await locator.click({ timeout: 5000 }).catch(() => {});
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await humanPause();
    await clickLikelyGoogleAccount(page, target.auth?.googleAccount);
    await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
    await humanPause();

    const authState = await detectAuthRequired(page);
    return !authState.authRequired;
  }

  return false;
}

async function clickLikelyGoogleAccount(page, accountHint) {
  const candidates = accountHint
    ? [`text=${accountHint}`, `div:has-text('${accountHint}')`, `li:has-text('${accountHint}')`]
    : ["[data-identifier]", "[role='link']:has-text('@')", "li:has-text('@')", "div:has-text('@gmail.com')"];

  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    await locator.click({ timeout: 5000 }).catch(() => {});
    return true;
  }

  return false;
}

async function tryGuestAccess(page, target) {
  const selectors = target.auth?.guestSelectors ?? [];
  if (selectors.length === 0) return false;

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;

    await locator.click({ timeout: 5000 }).catch(() => {});
    await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
    await humanPause();

    const authState = await detectAuthRequired(page);
    return !authState.authRequired;
  }

  return false;
}

async function detectAuthRequired(page) {
  const url = page.url();
  const authUrlPatterns = [
    /\/auth\//i,
    /\/login/i,
    /\/signin/i,
    /\/sign-in/i,
    /accounts\.google\.com/i
  ];

  if (authUrlPatterns.some((pattern) => pattern.test(url))) {
    return { authRequired: true, url };
  }

  const authSelectors = [
    "text=/continue with google/i",
    "text=/log in/i",
    "text=/sign in/i",
    "text=/sign up/i",
    "button:has-text('Continue with Google')",
    "button:has-text('Log in')",
    "button:has-text('Sign in')"
  ];

  for (const selector of authSelectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) > 0 && (await locator.isVisible().catch(() => false))) {
      return { authRequired: true, url };
    }
  }

  return { authRequired: false };
}

async function download(page, target) {
  const selectors = target.selectors?.downloadLinks ?? ["a[href$='.pdf']", "a[href$='.csv']", "a[href$='.xlsx']", "a[href$='.docx']"];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) continue;

    const downloadPromise = page.waitForEvent("download", { timeout: 10000 }).catch(() => null);
    await locator.click().catch(() => {});
    const downloadEvent = await downloadPromise;
    if (downloadEvent) {
      const suggested = downloadEvent.suggestedFilename();
      const saveTo = path.join(downloadDir, suggested);
      await downloadEvent.saveAs(saveTo);
      return { downloaded: suggested };
    }
  }

  return { downloaded: false };
}

async function maybeUpload(page, target) {
  const uploadProbability = target.uploadProbability ?? runConfig.uploadProbability;
  if (!runConfig.allowUploads || Math.random() > uploadProbability) return false;

  const fixtures = await listFixtureFiles();
  if (fixtures.length === 0) return false;

  const file = choice(fixtures);
  const fileInputs = page.locator("input[type='file']");
  if ((await fileInputs.count().catch(() => 0)) > 0) {
    await fileInputs.first().setInputFiles(file);
    await humanPause();
    return true;
  }

  const attachSelectors = target.selectors?.attach ?? [];
  for (const selector of attachSelectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) === 0) continue;

    const chooserPromise = page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null);
    await locator.click().catch(() => {});
    const chooser = await chooserPromise;
    if (!chooser) continue;
    await chooser.setFiles(file);
    await humanPause();
    return true;
  }

  return false;
}

function buildPrompt(target) {
  const categories = target.promptCategories?.length ? target.promptCategories : runConfig.promptCategories;
  const availableCategories = categories.filter((name) => prompts[name]?.length);
  const category = choice(availableCategories.length ? availableCategories : Object.keys(prompts));
  const prompt = choice(prompts[category]);
  const suffixes = [
    "Keep the answer concise.",
    "Use a practical enterprise example.",
    "Mention any assumptions.",
    "Give the answer as bullet points."
  ];

  return {
    category,
    text: `${prompt}\n\n${choice(suffixes)}`
  };
}

function buildFollowUpPrompt(category, turn) {
  const followUps = {
    genai: [
      "Can you compare that with a second approach?",
      "What would make this safer for an enterprise rollout?",
      "Give me a short example I could use in a meeting."
    ],
    "embedded-ai": [
      "What would change if this had to run offline?",
      "What hardware constraints matter most here?",
      "Summarize the deployment risks in plain English."
    ],
    business: [
      "Turn that into a concise executive summary.",
      "What objections might a buyer raise?",
      "Give me three practical next steps."
    ],
    software: [
      "What edge cases should I test?",
      "Can you turn that into implementation steps?",
      "What logs or metrics would help debug this?"
    ],
    policy: [
      "Make that more concise and policy-friendly.",
      "What should be explicitly prohibited?",
      "Add a short exception-handling section."
    ],
    creative: [
      "Give me a few more options with a different tone.",
      "Make it shorter and more direct.",
      "Which option is strongest and why?"
    ]
  };

  const options = followUps[category] ?? [
    "Can you elaborate with a practical example?",
    "Summarize that in a shorter form.",
    "What should I consider next?"
  ];

  return {
    category,
    text: `${choice(options)}\n\nKeep this as follow-up ${turn} in the same conversation.`
  };
}

function chooseChatTurnCount(target) {
  const maxTurns = Math.max(1, target.conversation?.maxTurns ?? runConfig.maxChatTurns ?? 1);
  const multiTurnProbability = target.conversation?.multiTurnProbability ?? runConfig.multiTurnProbability ?? 0;
  if (maxTurns <= 1 || Math.random() > multiTurnProbability) return 1;
  return randomInt(2, maxTurns);
}

async function typeIntoInput(locator, prompt) {
  await locator.click({ timeout: 5000 }).catch(async () => {
    await locator.focus();
  });
  await locator.fill(prompt.text).catch(async () => {
    await locator.evaluate((node, value) => {
      if ("value" in node) {
        node.value = value;
      } else {
        node.textContent = value;
      }
      node.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    }, prompt.text);
  });
}

async function findFirstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).last();
    if ((await locator.count().catch(() => 0)) === 0) continue;
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  throw new Error(`No visible input found from selectors: ${selectors.join(", ")}`);
}

async function clickFirstAvailable(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if ((await locator.count().catch(() => 0)) === 0) continue;
    if (!(await locator.isVisible().catch(() => false))) continue;
    await locator.click({ timeout: 5000 }).catch(() => {});
    return true;
  }
  return false;
}

function defaultInputSelectors() {
  return ["textarea", "[contenteditable='true']", "[role='textbox']"];
}

async function listFixtureFiles() {
  const dir = path.resolve("fixtures/generated");
  const entries = await readdir(dir).catch(() => []);
  const files = [];

  for (const entry of entries) {
    const full = path.join(dir, entry);
    const info = await stat(full).catch(() => null);
    if (info?.isFile()) files.push(full);
  }

  return files;
}

async function cleanupDownloads(dir, enabled) {
  if (!enabled) return;
  const entries = await readdir(dir).catch(() => []);
  for (const entry of entries) {
    await rm(path.join(dir, entry), { recursive: true, force: true }).catch(() => {});
  }
}

function previewAction(target) {
  if (target.kind === "chat" || target.kind === "embedded-chat" || target.kind === "isolated-chat") {
    const prompt = buildPrompt(target);
    return { promptCategory: prompt.category, prompt: prompt.text, possibleTurns: chooseChatTurnCount(target) };
  }
  return { url: target.url };
}

async function readJson(file) {
  const body = await import("node:fs/promises").then((fs) => fs.readFile(file, "utf8"));
  return JSON.parse(body);
}

async function appendJsonLine(file, event) {
  await appendFile(path.resolve(file), `${JSON.stringify(event)}\n`, "utf8");
}

async function humanPause(min = runConfig.minDelayMs, max = runConfig.maxDelayMs) {
  const bounds = fastMode
    ? { min: Math.min(min, 1000), max: Math.min(max, 3500) }
    : { min, max };
  await delay(randomInt(bounds.min, Math.max(bounds.min, bounds.max)));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function choice(values) {
  return values[randomInt(0, values.length - 1)];
}

function chooseWeightedTarget(targets) {
  const weighted = targets.map((target) => ({
    target,
    weight: Math.max(1, target.weight ?? defaultTargetWeight(target))
  }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let pick = Math.random() * total;

  for (const item of weighted) {
    pick -= item.weight;
    if (pick <= 0) return item.target;
  }

  return weighted.at(-1).target;
}

function defaultTargetWeight(target) {
  if (target.kind === "chat" || target.kind === "embedded-chat") return 5;
  if (target.kind === "isolated-chat") return 2;
  if (target.kind === "download") return 1;
  return 1;
}

function shuffle(values) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function expandConfigPath(value) {
  return value
    .replace(/^~(?=$|[\\/])/, process.env.USERPROFILE || process.env.HOME || "~")
    .replace(/%([^%]+)%/g, (_, name) => process.env[name] ?? `%${name}%`)
    .replace(/\$env:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => process.env[name] ?? `$env:${name}`);
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : "";
}

function updateSummary(stats, event) {
  if (event.ok) stats.ok += 1;
  else stats.failed += 1;

  stats.byKind[event.kind] = (stats.byKind[event.kind] ?? 0) + 1;

  const action = event.action ?? {};
  if (action.authRequired) stats.authRequired += 1;
  if (action.gated) stats.gated += 1;
  if (action.uploaded) stats.uploads += 1;
  if (Array.isArray(action.promptCategories)) stats.prompts += action.promptCategories.length;
  else if (action.promptCategory) stats.prompts += 1;
}

function printSummary(stats) {
  const kinds = Object.entries(stats.byKind)
    .map(([kind, count]) => `${kind}:${count}`)
    .join(", ");

  console.log("");
  console.log(`Summary: ok=${stats.ok} failed=${stats.failed} prompts=${stats.prompts} uploads=${stats.uploads} authRequired=${stats.authRequired} gated=${stats.gated}`);
  if (kinds) console.log(`By kind: ${kinds}`);
}
