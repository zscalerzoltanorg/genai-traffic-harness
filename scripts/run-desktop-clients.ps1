param(
  [string]$ProjectPath = (Resolve-Path "$PSScriptRoot\..").Path,
  [string]$ConfigPath = "",
  [string]$PromptsPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
$shell = New-Object -ComObject WScript.Shell

if ([string]::IsNullOrWhiteSpace($ConfigPath)) {
  $ConfigPath = Join-Path $ProjectPath "config\desktop-clients.local.json"
}

if (-not (Test-Path $ConfigPath)) {
  $ConfigPath = Join-Path $ProjectPath "config\desktop-clients.example.json"
}

if ([string]::IsNullOrWhiteSpace($PromptsPath)) {
  $PromptsPath = Join-Path $ProjectPath "config\prompts.json"
}

$config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
$prompts = Get-Content $PromptsPath -Raw | ConvertFrom-Json
$clients = @($config.clients | Where-Object { $_.enabled -ne $false })

if ($clients.Count -eq 0) {
  throw "No enabled desktop clients found in $ConfigPath."
}

for ($i = 0; $i -lt [int]$config.sessions; $i++) {
  $client = $clients | Get-Random
  $categories = @($config.promptCategories | Where-Object { $null -ne $prompts.$_ })
  $category = $categories | Get-Random
  $prompt = @($prompts.$category) | Get-Random
  $text = "$prompt`r`n`r`nKeep the answer concise and practical."

  Write-Host "[$(Get-Date -Format o)] $($client.name): $category"

  if (-not (Activate-ClientWindow $client)) {
    Write-Warning "Could not activate a window matching '$($client.windowTitle)'. Open the app and try again."
    continue
  }

  Start-Sleep -Seconds 2
  [System.Windows.Forms.Clipboard]::SetText($text)
  [System.Windows.Forms.SendKeys]::SendWait("^v")
  Start-Sleep -Milliseconds 300
  [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")

  $delay = Get-Random -Minimum ([int]$config.minDelaySeconds) -Maximum ([int]$config.maxDelaySeconds + 1)
  Start-Sleep -Seconds $delay
}

function Activate-ClientWindow {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Client
  )

  $patterns = @()
  if ($Client.PSObject.Properties.Name -contains "windowTitlePatterns") {
    $patterns += @($Client.windowTitlePatterns)
  }
  if ($Client.PSObject.Properties.Name -contains "windowTitle") {
    $patterns += [string]$Client.windowTitle
  }

  foreach ($pattern in ($patterns | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)) {
    if ($shell.AppActivate([string]$pattern)) {
      return $true
    }
  }

  return $false
}
