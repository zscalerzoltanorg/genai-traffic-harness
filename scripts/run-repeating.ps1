param(
  [string]$ProjectPath = (Resolve-Path "$PSScriptRoot\..").Path,

  [int]$Sessions = 40,

  [int]$RepeatDelayMinutes = 20,

  [string]$Target = "",

  [string]$Kind = "",

  [switch]$NoFast
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $ProjectPath

$logDir = Join-Path $ProjectPath "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logFile = Join-Path $logDir "background-$timestamp.log"

$nodeArgs = @(
  "src/runner.mjs",
  "--repeat",
  "--sessions=$Sessions",
  "--repeat-delay-minutes=$RepeatDelayMinutes"
)

if (-not $NoFast) {
  $nodeArgs += "--fast"
}

if ($Target.Trim().Length -gt 0) {
  $nodeArgs += "--target=$Target"
}

if ($Kind.Trim().Length -gt 0) {
  $nodeArgs += "--kind=$Kind"
}

"Starting background harness at $(Get-Date -Format o)" | Out-File -FilePath $logFile -Encoding utf8
"ProjectPath=$ProjectPath" | Out-File -FilePath $logFile -Append -Encoding utf8
"node $($nodeArgs -join ' ')" | Out-File -FilePath $logFile -Append -Encoding utf8

& node @nodeArgs *>> $logFile
