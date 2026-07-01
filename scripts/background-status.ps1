param(
  [string]$ProjectPath = (Resolve-Path "$PSScriptRoot\..").Path,

  [string]$TaskName = "GenAI Traffic Harness Background",

  [int]$Tail = 40
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "Scheduled task '$TaskName' was not found."
  exit 0
}

$info = Get-ScheduledTaskInfo -TaskName $TaskName
Write-Host "Task: $TaskName"
Write-Host "State: $($task.State)"
Write-Host "LastRunTime: $($info.LastRunTime)"
Write-Host "LastTaskResult: $($info.LastTaskResult)"
Write-Host "NextRunTime: $($info.NextRunTime)"
Write-Host ""

$logDir = Join-Path $ProjectPath "logs"
if (-not (Test-Path $logDir)) {
  Write-Host "No log directory found at $logDir"
  exit 0
}

$latestLog = Get-ChildItem -Path $logDir -Filter "background-*.log" -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $latestLog) {
  Write-Host "No background log files found in $logDir"
  exit 0
}

Write-Host "Latest log: $($latestLog.FullName)"
Write-Host ""
Get-Content -Path $latestLog.FullName -Tail $Tail
