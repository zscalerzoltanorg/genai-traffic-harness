import { chromium } from "playwright";
import { appendFile, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const noDelay = args.has("--no-delay");
const sessionOverride = getArgValue("--sessions");

const configPath = path.resolve("config/targets.local.json");
const fallbackConfigPath = path.resolve("config/targets.example.json");
const promptsPath = path.resolve("config/prompts.json");

const config = await readJson(configPath).catch(() => readJson(fallbackConfigPath));
const prompts = await readJson(promptsPath);

const enabledTargets = config.targets.filter((target) => target.enabled !== false);
if (enabledTargets.length === 0) {
  throw new Error("No enabled targets found. Edit config/targets.local.json and enable at least one target.");
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

const downloadDir = path.resolve(runConfig.downloadDir);
await mkdir(downloadDir, { recursive: true });

const context = dryRun ? null : await launchContext(config.browser ?? {}, downloadDir);

try {
  for (let session = 0; session < runConfig.sessions; session += 1) {
    const target = choice(enabledTargets);
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
    } catch (error) {
      event.ok = false;
      event.error = error.message;
      console.warn(`Target failed: ${target.name}: ${error.message}`);
    }

    await appendJsonLine(runConfig.logFile, event);
    await cleanupDownloads(downloadDir, runConfig.deleteDownloads);

    if (!noDelay && session < runConfig.sessions - 1) {
      await delay(randomInt(runConfig.minDelayMs, runConfig.maxDelayMs));
    }
  }
} finally {
  if (context) {
    await context.close();
  }
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
    acceptDownloads: true,
    downloadsPath,
    viewport: browserConfig.viewport ?? { width: 1440, height: 950 },
    timeout: runConfig.defaultTimeoutMs,
    args
  });
}

async function runTarget(context, target) {
  const page = await context.newPage();
  page.setDefaultTimeout(runConfig.defaultTimeoutMs);

  try {
    await page.goto(target.url, { waitUntil: "domcontentloaded" });
    await humanPause();

    if (target.kind === "browse") {
      return await browse(page, target);
    }

    if (target.kind === "chat") {
      return await chat(page, target);
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
  const authState = await detectAuthRequired(page);
  if (authState.authRequired) {
    return authState;
  }

  const prompt = buildPrompt(target);
  const uploaded = await maybeUpload(page, target);

  const input = await findFirstVisible(page, target.selectors?.input ?? defaultInputSelectors());
  await typeIntoInput(input, prompt);

  const sentByButton = await clickFirstAvailable(page, target.selectors?.send ?? []);
  if (!sentByButton) {
    await input.press(process.platform === "darwin" ? "Meta+Enter" : "Control+Enter").catch(async () => {
      await input.press("Enter");
    });
  }

  await humanPause(4000, 12000);
  return { promptCategory: prompt.category, uploaded };
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

async function typeIntoInput(locator, prompt) {
  await locator.click();
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
  if (target.kind === "chat" || target.kind === "embedded-chat") {
    const prompt = buildPrompt(target);
    return { promptCategory: prompt.category, prompt: prompt.text };
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
  await delay(randomInt(min, max));
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
