param(
  [string]$ProjectPath = (Resolve-Path "$PSScriptRoot\..").Path,
  [switch]$SkipDesktop,
  [switch]$StopOnBrowserFailure
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $ProjectPath

Write-Host "Running browser automation..."
npm run run
$browserExitCode = $LASTEXITCODE

if ($browserExitCode -ne 0) {
  Write-Warning "Browser automation exited with code $browserExitCode."
  if ($StopOnBrowserFailure) {
    exit $browserExitCode
  }
}

if ($SkipDesktop) {
  Write-Host "Skipping desktop client automation."
  exit 0
}

Write-Host "Running desktop client automation..."
& (Join-Path $ProjectPath "scripts\run-desktop-clients.ps1") -ProjectPath $ProjectPath
