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

3. Open the automation Chrome profile and log into the AI apps you want to test:

   ```powershell
   npm run login:chrome
   ```

   This opens Google Accounts plus the main chat apps in the dedicated automation profile. Sign into Google first, then visit each app tab and use its normal "Continue with Google" flow once. Close that Chrome window after logging in. The automation profile is separate from your regular Chrome profile because recent Chrome builds block Playwright remote debugging against the real default profile.

4. Run a quick dry run, then run browser automation:

   ```powershell
   npm run run:dry
   npm run run
   ```

5. To run browser automation and desktop app automation in one pass:

   ```powershell
   npm run run:all
   ```

`npm run setup:chrome` copies `config\targets.chrome-default.json` to `config\targets.local.json`. That default enables ChatGPT, Claude Web, Perplexity, DeepSeek, Gemini, Poe, You.com, Mistral Le Chat, HuggingChat, Meta AI, and dozens of AI/embedded-AI SaaS browse targets. Microsoft Copilot is included in the file but disabled by default. It uses:

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

## What Runs

`npm run run` runs browser automation only. With the Chrome default config, it randomly chooses among enabled chat, browse, and download targets.

The chat-style default targets are ChatGPT, Claude Web, Perplexity, DeepSeek, Google Gemini, Poe, You.com, Mistral Le Chat, HuggingChat, and Meta AI. Chat targets have higher upload probabilities than browse targets so file inspection gets regular exercise when the app exposes a normal file picker.

The browse-style default targets include OpenAI Platform, Anthropic Docs, Azure AI, NVIDIA Embedded AI, Hugging Face, GitHub Copilot, Cursor, Windsurf, Replit AI, Sourcegraph Cody, Tabnine, Salesforce AI, HubSpot AI, Zendesk AI, Intercom Fin, ServiceNow AI Agents, Notion AI, Canva Magic Studio, Grammarly AI, Atlassian Rovo, Slack AI, Zoom AI Companion, Figma AI, Adobe Firefly, Runway, Midjourney, Ideogram, ElevenLabs, Jasper, Copy.ai, Gamma, Synthesia, NotebookLM, and GroqCloud.

`scripts\run-desktop-clients.ps1` runs desktop app automation only. By default it sends prompts to open Claude Desktop and ChatGPT Desktop windows. Codex is present as a disabled optional entry in `config\desktop-clients.local.json`; enable it only if you have a visible Codex app/window where pasted prompts make sense.

`npm run run:all` runs `npm run run` first, then runs `scripts\run-desktop-clients.ps1`. It still exits when the configured browser and desktop sessions finish. If browser automation fails to launch, `run:all` warns and still tries desktop automation.

The scheduled task created by `scripts\register-scheduled-task.ps1` runs browser automation only. If you also want thick-client activity on a schedule, create a separate scheduled task for `scripts\run-desktop-clients.ps1`.

## RDP, Login, and Robot Checks

Visible browser and desktop automation is most reliable while the Windows desktop session is active and unlocked. If you disconnect from RDP, Windows may leave the session running, but GUI automation can become flaky, especially for `SendKeys`-based desktop clients. For unattended runs, prefer browser automation and test your exact RDP/session behavior before relying on it.

The harness does not bypass CAPTCHA, "are you a robot" checks, sign-in flows, MFA, paywalls, or access-control prompts. If a page asks for login, run `npm run login:chrome`, log into Google in the automation profile, use each app's normal "Continue with Google" flow once, close Chrome, then rerun the harness. During normal runs, chat targets that still show login screens are logged as `authRequired` in `runs.jsonl` instead of receiving prompts. If a robot check appears, handle it manually or disable that target.

## Target Types

- `browse`: Opens a page, scrolls, clicks safe links, and idles briefly.
- `chat`: Opens a page, finds a textbox/contenteditable input, and sends prompts.
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
