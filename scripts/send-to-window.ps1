param(
  [Parameter(Mandatory = $true)]
  [string]$WindowTitle,

  [Parameter(Mandatory = $true)]
  [string]$Text,

  [int]$DelaySeconds = 2
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
$shell = New-Object -ComObject WScript.Shell

if (-not $shell.AppActivate($WindowTitle)) {
  throw "Could not activate a window matching '$WindowTitle'. Open the app and try again."
}

Start-Sleep -Seconds $DelaySeconds
[System.Windows.Forms.Clipboard]::SetText($Text)
$shell.SendKeys("^v")
Start-Sleep -Milliseconds 300
$shell.SendKeys("{ENTER}")
