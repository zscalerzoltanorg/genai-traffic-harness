param(
  [string]$ProjectPath = (Resolve-Path "$PSScriptRoot\..").Path,

  [int]$Sessions = 40,

  [int]$RepeatDelayMinutes = 20,

  [int]$StartupDelaySeconds = 180,

  [int]$RestartDelaySeconds = 60,

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

"Starting background harness at $(Get-Date -Format o)" | Out-File -FilePath $logFile -Encoding utf8
"ProjectPath=$ProjectPath" | Out-File -FilePath $logFile -Append -Encoding utf8
"Sessions=$Sessions RepeatDelayMinutes=$RepeatDelayMinutes StartupDelaySeconds=$StartupDelaySeconds RestartDelaySeconds=$RestartDelaySeconds" | Out-File -FilePath $logFile -Append -Encoding utf8

if ($StartupDelaySeconds -gt 0) {
  "Startup delay: waiting $StartupDelaySeconds second(s) for Windows, networking, and browser profile services." | Out-File -FilePath $logFile -Append -Encoding utf8
  Start-Sleep -Seconds $StartupDelaySeconds
}

$cycle = 0

while ($true) {
  $cycle += 1
  $nodeArgs = @(
    "src/runner.mjs",
    "--sessions=$Sessions"
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

  "" | Out-File -FilePath $logFile -Append -Encoding utf8
  "Supervisor cycle $cycle started at $(Get-Date -Format o)" | Out-File -FilePath $logFile -Append -Encoding utf8
  "node $($nodeArgs -join ' ')" | Out-File -FilePath $logFile -Append -Encoding utf8

  try {
    & node @nodeArgs *>> $logFile
    $exitCode = if ($null -eq $global:LASTEXITCODE) { 0 } else { $global:LASTEXITCODE }
  } catch {
    $exitCode = 1
    "PowerShell wrapper caught error: $($_.Exception.Message)" | Out-File -FilePath $logFile -Append -Encoding utf8
  }

  "Supervisor cycle $cycle ended at $(Get-Date -Format o) with exit code $exitCode" | Out-File -FilePath $logFile -Append -Encoding utf8

  if ($exitCode -eq 0) {
    "Waiting $RepeatDelayMinutes minute(s) before next cycle." | Out-File -FilePath $logFile -Append -Encoding utf8
    Start-Sleep -Seconds ($RepeatDelayMinutes * 60)
  } else {
    "Runner exited unexpectedly; waiting $RestartDelaySeconds second(s) before retry." | Out-File -FilePath $logFile -Append -Encoding utf8
    Start-Sleep -Seconds $RestartDelaySeconds
  }
}
