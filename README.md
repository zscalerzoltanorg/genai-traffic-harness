# GenAI Traffic Harness

Config-driven browser automation for generating low-rate, auditable GenAI and embedded-AI SaaS activity from a Windows Server desktop. It is designed for security inspection labs where you want realistic browsing, chat prompts, uploads, downloads, and cleanup without storing credentials in code.

## What It Does

- Opens Chrome or Edge with an optional existing user profile so SSO/browser login state can be reused.
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
   npm run fixtures
   copy config\targets.example.json config\targets.local.json
   ```

3. Edit `config\targets.local.json`.
4. Run with a fresh Playwright Chromium profile:

   ```powershell
   npm run run:dry
   npm run run
   ```

5. To reuse a logged-in Chrome or Edge desktop profile, set `browser.userDataDir` and, when needed, `browser.profileDirectory` in `config\targets.local.json`.

   Common Windows paths:

   ```text
   C:\Users\<you>\AppData\Local\Google\Chrome\User Data
   C:\Users\<you>\AppData\Local\Microsoft\Edge\User Data
   ```

   Use `profileDirectory: "Default"` or `profileDirectory: "Profile 1"` to select the profile inside that folder. A dedicated test browser profile is best. Chrome and Edge lock active profiles, so close that browser before running the harness with the same profile.

## Scheduled Runs

After editing the config:

```powershell
.\scripts\register-scheduled-task.ps1 -ProjectPath C:\path\to\genai-generator -IntervalMinutes 30
```

The task runs `scripts\run-once.ps1`, which calls `npm run run`.

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

Browser automation is the reliable path. For desktop ChatGPT, Claude, or Copilot apps, use `scripts\send-to-window.ps1` as a foreground-window smoke helper only. It uses Windows `SendKeys`, so it is intentionally simple and visible rather than hidden or stealthy.

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
