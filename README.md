# GenAI Traffic Harness

Config-driven browser automation for generating low-rate, auditable GenAI and embedded-AI SaaS activity from a Windows Server desktop. It is designed for security inspection labs where you want realistic browsing, chat prompts, uploads, downloads, and cleanup without storing credentials in code.

## What It Does

- Opens Chrome or Edge with a dedicated automation profile so browser login state can be reused safely.
- Randomly visits GenAI and embedded-AI SaaS targets from `config/targets.local.json`.
- Sends varied chat prompts where a target exposes an editable textbox.
- Optionally uploads synthetic fixture files through normal browser file chooser flows.
- Optionally downloads files and deletes them after inspection.
- Writes JSONL run logs for auditability.
- Avoids credential handling, login bypasses, CAPTCHA bypasses, or stealth techniques.

## Windows Quick Start

1. Install Node.js 20+ on the EC2 instance.
2. From this folder, run:

   ```powershell
   npm install
   npm run setup:chrome
   npm run fixtures
   ```

3. Optional but recommended: seed the automation profile from your existing Chrome login state:

   ```powershell
   taskkill /IM chrome.exe /F
   npm run clone:chrome
   ```

   This copies your current Chrome `Default` profile into the dedicated automation profile. It only works reliably on the same Windows user, with Chrome fully closed, and some sites may still ask for MFA or fresh consent.

4. Optional fallback: open the automation Chrome profile and log into the AI apps you most care about:

   ```powershell
   npm run login:chrome
   ```

   This opens Google Accounts plus the main chat apps in the dedicated automation profile. Sign into Google first, then visit only the app tabs you care about and use their normal "Continue with Google" flow once. You do not need to authenticate every target; unauthenticated chat apps are skipped or tried in guest mode where available, and the broad browse catalog still creates usage. Close that Chrome window after logging in. The automation profile is separate from your regular Chrome profile because recent Chrome builds block Playwright remote debugging against the real default profile.

5. Run a quick dry run, then run browser automation:

   ```powershell
   npm run run:dry
   npm run run
   ```

To prove a specific app works before using the random pool:

```powershell
npm run run:chatgpt
```

If ChatGPT shows a human-verification or login page, this command keeps Chrome open and waits. Complete the browser prompt manually, then press Enter in the terminal so the runner can retry the chat input.

You can also target any configured app by name:

```powershell
npm run run -- --target=ChatGPT --sessions=1
npm run run -- --target="Claude Web" --sessions=1
npm run run -- --kind=chat --sessions=5
npm run run -- --kind=chat-like --sessions=5
```

For faster testing with shorter waits:

```powershell
npm run run:quick
```

For prompt-heavy testing that focuses on real chat apps:

```powershell
npm run run:prompts
```

For prompt-heavy testing biased toward the chat apps that have been most reliable in practice:

```powershell
npm run run:stable-prompts
```

For AI-related discovery browsing with generated search queries:

```powershell
npm run run:ai-discovery
```

For a larger mixed run that keeps most traffic AI/app related while also varying search and browse destinations:

```powershell
npm run run:ai-mix
```

For a long-running foreground repeat loop:

```powershell
npm run run -- --repeat --sessions=40 --repeat-delay-minutes=20 --fast
```

To touch each normal chat target once:

```powershell
npm run run:prompt-targets
```

To touch every enabled target once, shuffled, with shorter waits:

```powershell
npm run run:all-targets
```

This can take a while because the default catalog contains dozens of sites. To cap an all-targets run:

```powershell
npm run run -- --all-targets --fast --sessions=15
```

6. To run browser automation and desktop app automation in one pass:

   ```powershell
   npm run run:all
   ```

`npm run setup:chrome` copies `config\targets.chrome-default.json` to `config\targets.local.json`. That default enables ChatGPT, Claude Web, Perplexity, DeepSeek, Gemini, Poe, You.com, Mistral Le Chat, HuggingChat, Meta AI, generated AI discovery search, and dozens of AI/embedded-AI SaaS browse targets. Microsoft Copilot desktop is not used; Microsoft Copilot Studio is included as a normal web browse target. It uses:

```json
"channel": "chrome",
"userDataDir": "%USERPROFILE%/.genai-traffic-harness/chrome-profile",
"profileDirectory": ""
```

To reset your local config later:

```powershell
.\scripts\setup-chrome-default.ps1 -Force
```

To use a different automation profile, change `userDataDir` in `config\targets.local.json`.

To use Edge instead, set `browser.channel` to `"msedge"` and use a dedicated Edge automation profile folder for `browser.userDataDir`.

   Common Windows paths:

   ```text
   C:\Users\<you>\AppData\Local\Google\Chrome\User Data
   C:\Users\<you>\AppData\Local\Microsoft\Edge\User Data
   ```

Do not point Playwright at your real Chrome or Edge `Default` profile. Browser vendors increasingly block remote debugging against default profiles, and active profiles are also locked by running browser windows.

## Scheduled Runs

After editing the config:

```powershell
.\scripts\register-scheduled-task.ps1 -ProjectPath C:\path\to\genai-generator -IntervalMinutes 30
```

The task runs `scripts\run-once.ps1`, which calls `npm run run`.

For a repeating background task that starts now and again at user logon:

```powershell
npm run background:register
```

That registers `GenAI Traffic Harness Background`, runs `scripts\run-repeating.ps1`, and writes logs under `logs\background-*.log`. By default it waits 3 minutes after logon, runs 40 randomized sessions, waits 20 minutes, then starts the next batch. The PowerShell wrapper supervises the runner forever, so if a batch exits or crashes it logs the exit and starts the next batch after a short retry delay.

To check the task state and the latest background log:

```powershell
npm run background:status
```

To stop it without deleting the task:

```powershell
npm run background:stop
```

To stop and remove it:

```powershell
npm run background:remove
```

The background task is intentionally a Scheduled Task running as the interactive user, not a Windows Service. A true Windows Service runs in session 0 and is not reliable for logged-in Chrome profile automation. The task can run without a visible PowerShell window, but Chrome may still open in the desktop session because these sites are more reliable in headed Chrome than headless Chrome.

Important Windows behavior: this headed Chrome task starts after the Windows user logs on. If the EC2 instance boots at 6am but nobody has logged in yet, there is no interactive desktop session for visible Chrome automation to use. For unattended pre-login traffic, use the Amazon Linux/headless deployment or create a separate headless Windows task with a dedicated browser profile. The logged-in Chrome profile workflow is strongest after the desktop session exists.

## What Runs

`npm run run` runs browser automation only. With the Chrome default config, it randomly chooses among enabled chat, browse, and download targets.

Plain `npm run run` does not visit every configured target. It runs the configured number of random sessions. Use `npm run run:all-targets` when you want one pass across every enabled target.

Random runs are weighted toward real chat targets and AI discovery targets, so most traffic should stay AI/app related. For the highest prompt volume, use `npm run run:stable-prompts` or `npm run run:prompts`. For broader AI SaaS/category coverage, use `npm run run:ai-mix`.

Each target failure is logged to `runs.jsonl` and the runner continues to the next target. If Chrome itself closes or crashes, the runner closes any stale context and relaunches Chrome for the next target. In repeat mode, each cycle picks a fresh randomized target plan.

The chat-style default targets are ChatGPT, Claude Web, Perplexity, DeepSeek, Google Gemini, Poe, You.com, Mistral Le Chat, HuggingChat, and Meta AI. Chat sessions are intentionally varied: most are one prompt, some become short 2-3 turn conversations, and file upload is decided once per session. When an upload happens, it is attached only before the first prompt so later follow-ups look like a normal conversation.

Some chat apps require accounts. The scalable approach is to manually authenticate only the few chat apps where you need real prompt and file-upload coverage. For everything else, the runner will attempt guest entry points such as "Try it first" when configured, or log `authRequired` and move on.

For chat apps with a visible "Continue with Google" button, the runner can try that button when `auth.googleSelectors` is configured. If a Google account picker appears, it clicks the first visible account by default. To prefer a specific account without committing it to Git, add `"googleAccount": "you@example.com"` under that target's local `auth` object in `config\targets.local.json`.

The browse-style default targets include OpenAI Platform, Anthropic Docs, Google AI Mode search, Google Agent Builder, Google Agentspace, Azure AI Foundry, AWS Bedrock Agents, NVIDIA Embedded AI, Hugging Face, GitHub Copilot, Cursor, Windsurf, Replit AI, Sourcegraph Cody, Tabnine, Devin, Cohere, Together AI, Fireworks AI, LangChain, LlamaIndex, Pinecone, Snowflake Cortex AI, Databricks Mosaic AI, Salesforce Agentforce, Salesforce AI, HubSpot AI, Zendesk AI, Intercom Fin, ServiceNow AI Agents, Microsoft Copilot Studio, IBM watsonx, Oracle AI, SAP Business AI, Workday AI, Glean, Moveworks, Ada, LivePerson, Notion AI, Canva Magic Studio, Grammarly AI, Atlassian Rovo, Slack AI, Zoom AI Companion, Figma AI, Adobe Firefly, Runway, Midjourney, Ideogram, ElevenLabs, Jasper, Copy.ai, Gamma, Synthesia, HeyGen, Descript AI, Airtable AI, Box AI, Dropbox Dash, Zapier AI, Make AI, Lindy AI, NotebookLM, and GroqCloud.

`scripts\run-desktop-clients.ps1` runs desktop app automation only. By default it sends prompts to open Claude Desktop and ChatGPT Desktop windows. Codex is present as a disabled optional entry in `config\desktop-clients.local.json`; enable it only if you have a visible Codex app/window where pasted prompts make sense.

`npm run run:all` runs `npm run run` first, then runs `scripts\run-desktop-clients.ps1`. It still exits when the configured browser and desktop sessions finish. If browser automation fails to launch, `run:all` warns and still tries desktop automation.

Upload and conversation behavior can be tuned in `config\targets.local.json`:

```json
"uploadProbability": 0.28,
"conversation": {
  "multiTurnProbability": 0.5,
  "maxTurns": 3
}
```

The scheduled task created by `scripts\register-scheduled-task.ps1` runs browser automation only. If you also want thick-client activity on a schedule, create a separate scheduled task for `scripts\run-desktop-clients.ps1`.

## RDP, Login, and Robot Checks

Visible browser and desktop automation is most reliable while the Windows desktop session is active and unlocked. If you disconnect from RDP, Windows may leave the session running, but GUI automation can become flaky, especially for `SendKeys`-based desktop clients. For unattended runs, prefer browser automation and test your exact RDP/session behavior before relying on it.

The harness does not bypass CAPTCHA, "are you a robot" checks, MFA, paywalls, or access-control prompts. It can try ordinary "Continue with Google" buttons when configured, but any fresh consent, MFA, CAPTCHA, or blocked access still needs manual handling. If a page asks for login, either clone your existing Chrome profile with `npm run clone:chrome`, authenticate it once using `npm run login:chrome`, let the runner skip it, or disable that target. During normal runs, chat targets that still show login screens are logged as `authRequired` in `runs.jsonl` instead of receiving prompts. If a guest path is configured, the runner tries that too.

## Target Types

- `browse`: Opens a page, scrolls, clicks safe links, and idles briefly.
- `generated-browse`: Builds an AI-related search URL from configured query pools, opens it, scrolls, clicks safe links, and idles briefly.
- `chat`: Opens a page, finds a textbox/contenteditable input, and sends prompts.
- `isolated-chat`: Opens a browser-isolated page, clicks an approximate input location, types with keyboard events, and presses Enter. This is for pixel-streamed pages where the app DOM is not available locally.
- `embedded-chat`: Opens a SaaS page, clicks a chat launcher, then sends prompts.
- `download`: Opens a page and clicks configured download selectors or links.

The example config includes placeholders and common SaaS categories. You should enable only targets you are allowed to test under your organization’s policies and the site’s terms.

## DLP Fixtures

`npm run fixtures` creates synthetic files in `fixtures/generated`. These are intentionally test data, not real secrets. Some strings resemble common DLP detectors, such as sample credit card numbers and clearly labeled fake identifiers.

If you generate approved test files from DLptest or another internal test-data source, place them in `fixtures/generated`; the harness will include them in the upload pool. Keep those files clearly labeled as synthetic/test content.

Do not put real customer data, credentials, tokens, private keys, or regulated data into fixtures.

## Thick Clients

Browser automation is the reliable path. For desktop ChatGPT, Claude, or Copilot apps, use `scripts\run-desktop-clients.ps1` or `scripts\send-to-window.ps1` as foreground-window smoke helpers only. They use Windows `SendKeys`, so they are intentionally simple and visible rather than hidden or stealthy.

The setup step creates `config\desktop-clients.local.json` from `config\desktop-clients.example.json`. By default it enables Claude Desktop and ChatGPT Desktop. Open the apps first, make sure you are logged in, then run:

```powershell
.\scripts\run-desktop-clients.ps1
```

If the window title is different on your machine, edit `windowTitle` in `config\desktop-clients.local.json`.

Example:

```powershell
.\scripts\send-to-window.ps1 -WindowTitle "ChatGPT" -Text "Summarize how edge AI differs from cloud AI."
```

## Guardrails

- Use test accounts and test tenants when possible.
- Keep concurrency low and add jitter.
- Do not automate sign-up, payment, scraping, CAPTCHA solving, or access-control workarounds.
- Respect robots, terms, and internal approvals.
- Keep logs and fixtures auditable.
