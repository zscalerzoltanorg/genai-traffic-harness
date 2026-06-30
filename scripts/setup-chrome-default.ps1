param(
  [string]$ProjectPath = (Resolve-Path "$PSScriptRoot\..").Path,
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$targetsSource = Join-Path $ProjectPath "config\targets.chrome-default.json"
$targetsDest = Join-Path $ProjectPath "config\targets.local.json"
if ((Test-Path $targetsDest) -and -not $Force) {
  Write-Host "Keeping existing $targetsDest. Use -Force to overwrite it."
} else {
  Copy-Item $targetsSource $targetsDest -Force
  Write-Host "Wrote $targetsDest from Chrome automation profile default."
}

Write-Host ""
Write-Host "Next:"
Write-Host "  npm run fixtures"
Write-Host "  npm run login:chrome"
Write-Host "  npm run run:dry"
Write-Host "  npm run run"
