param(
  [string]$SourceUserDataDir = "$env:LOCALAPPDATA\Google\Chrome\User Data",
  [string]$SourceProfile = "Default",
  [string]$DestUserDataDir = "$env:USERPROFILE\.genai-traffic-harness\chrome-profile",
  [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$sourceProfileDir = Join-Path $SourceUserDataDir $SourceProfile
$destProfileDir = Join-Path $DestUserDataDir "Default"

if (-not (Test-Path $sourceProfileDir)) {
  throw "Source Chrome profile not found: $sourceProfileDir"
}

$chromeProcesses = @(Get-Process chrome -ErrorAction SilentlyContinue)
if ($chromeProcesses.Count -gt 0) {
  throw "Chrome is running. Close Chrome first, or run: taskkill /IM chrome.exe /F"
}

if ((Test-Path $DestUserDataDir) -and -not $Force) {
  throw "Destination exists: $DestUserDataDir. Rerun with -Force to replace the automation profile."
}

if (Test-Path $DestUserDataDir) {
  Remove-Item $DestUserDataDir -Recurse -Force
}

New-Item -ItemType Directory -Path $DestUserDataDir -Force | Out-Null

$localStateSource = Join-Path $SourceUserDataDir "Local State"
if (Test-Path $localStateSource) {
  Copy-Item $localStateSource (Join-Path $DestUserDataDir "Local State") -Force
}

$excludeDirs = @(
  "Cache",
  "Code Cache",
  "GPUCache",
  "GrShaderCache",
  "ShaderCache",
  "Crashpad",
  "BrowserMetrics",
  "OptimizationHints",
  "Safe Browsing",
  "PnaclTranslationCache"
)

$excludeFiles = @(
  "LOCK",
  "SingletonCookie",
  "SingletonLock",
  "SingletonSocket",
  "lockfile"
)

robocopy $sourceProfileDir $destProfileDir /MIR /XD $excludeDirs /XF $excludeFiles /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Host
$code = $LASTEXITCODE
if ($code -gt 7) {
  throw "robocopy failed with exit code $code"
}

Write-Host "Cloned Chrome profile:"
Write-Host "  From: $sourceProfileDir"
Write-Host "  To:   $destProfileDir"
Write-Host ""
Write-Host "Next:"
Write-Host "  npm run run:dry"
Write-Host "  npm run run -- --sessions=3"
