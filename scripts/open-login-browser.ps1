param(
  [string]$ProfilePath = "$env:USERPROFILE\.genai-traffic-harness\chrome-profile"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$chromePaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chrome = $chromePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  throw "Could not find chrome.exe. Install Google Chrome or edit this script with the correct path."
}

New-Item -ItemType Directory -Path $ProfilePath -Force | Out-Null

$urls = @(
  "https://accounts.google.com/",
  "https://chatgpt.com/",
  "https://claude.ai/",
  "https://www.perplexity.ai/",
  "https://gemini.google.com/app",
  "https://poe.com/",
  "https://you.com/"
)

$chromeArgs = @("--user-data-dir=$ProfilePath", "--no-first-run", "--new-window") + $urls
Start-Process -FilePath $chrome -ArgumentList $chromeArgs
Write-Host "Opened Chrome with automation profile: $ProfilePath"
Write-Host "Log into the AI apps in this window, then close Chrome before running npm run run."
