param(
  [string]$ProjectPath = (Resolve-Path "$PSScriptRoot\..").Path,

  [string]$TaskName = "GenAI Traffic Harness Background",

  [int]$Sessions = 40,

  [int]$RepeatDelayMinutes = 20,

  [int]$StartupDelaySeconds = 180,

  [int]$RestartDelaySeconds = 60,

  [string]$Target = "",

  [string]$Kind = "",

  [switch]$NoFast,

  [switch]$StartNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $ProjectPath "scripts\run-repeating.ps1"
$argumentParts = @(
  "-NoProfile",
  "-WindowStyle Hidden",
  "-ExecutionPolicy Bypass",
  "-File `"$scriptPath`"",
  "-ProjectPath `"$ProjectPath`"",
  "-Sessions $Sessions",
  "-RepeatDelayMinutes $RepeatDelayMinutes",
  "-StartupDelaySeconds $StartupDelaySeconds",
  "-RestartDelaySeconds $RestartDelaySeconds"
)

if ($Target.Trim().Length -gt 0) {
  $argumentParts += "-Target `"$Target`""
}

if ($Kind.Trim().Length -gt 0) {
  $argumentParts += "-Kind `"$Kind`""
}

if ($NoFast) {
  $argumentParts += "-NoFast"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument ($argumentParts -join " ")
$triggers = @(
  (New-ScheduledTaskTrigger -AtLogOn),
  (New-ScheduledTaskTrigger -AtStartup)
)
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description "Runs the GenAI traffic harness in repeat mode as the logged-in desktop user." -Force

if ($StartNow) {
  Start-ScheduledTask -TaskName $TaskName
}

Write-Host "Registered scheduled task '$TaskName'."
Write-Host "It runs at startup/logon as $env:USERDOMAIN\$env:USERNAME, waits $StartupDelaySeconds second(s), and then supervises repeated harness cycles."
Write-Host "Logs are written to: $(Join-Path $ProjectPath "logs")"
if (-not $StartNow) {
  Write-Host "Start it now with: Start-ScheduledTask -TaskName `"$TaskName`""
}
