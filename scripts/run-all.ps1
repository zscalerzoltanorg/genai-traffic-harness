param(
  [string]$ProjectPath = (Resolve-Path "$PSScriptRoot\..").Path,
  [switch]$SkipDesktop
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $ProjectPath

Write-Host "Running browser automation..."
npm run run

if ($SkipDesktop) {
  Write-Host "Skipping desktop client automation."
  exit 0
}

Write-Host "Running desktop client automation..."
& (Join-Path $ProjectPath "scripts\run-desktop-clients.ps1") -ProjectPath $ProjectPath
