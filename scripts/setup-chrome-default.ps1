param(
  [string]$ProjectPath = (Resolve-Path "$PSScriptRoot\..").Path,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$targetsSource = Join-Path $ProjectPath "config\targets.chrome-default.json"
$targetsDest = Join-Path $ProjectPath "config\targets.local.json"
$desktopSource = Join-Path $ProjectPath "config\desktop-clients.example.json"
$desktopDest = Join-Path $ProjectPath "config\desktop-clients.local.json"

if ((Test-Path $targetsDest) -and -not $Force) {
  Write-Host "Keeping existing $targetsDest. Use -Force to overwrite it."
} else {
  Copy-Item $targetsSource $targetsDest -Force
  Write-Host "Wrote $targetsDest from Chrome logged-in default."
}

if ((Test-Path $desktopDest) -and -not $Force) {
  Write-Host "Keeping existing $desktopDest. Use -Force to overwrite it."
} else {
  Copy-Item $desktopSource $desktopDest -Force
  Write-Host "Wrote $desktopDest for desktop clients."
}

Write-Host ""
Write-Host "Next:"
Write-Host "  npm run fixtures"
Write-Host "  npm run run:dry"
Write-Host "  npm run run"
Write-Host ""
Write-Host "For desktop apps, open Claude or ChatGPT first, then run:"
Write-Host "  .\scripts\run-desktop-clients.ps1"
