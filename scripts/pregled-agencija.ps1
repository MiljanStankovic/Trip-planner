# Izveštaj o ponudama agencija (Windows). Zakazivanje (npr. nedeljom):
#   schtasks /Create /SC WEEKLY /D SUN /ST 09:47 /TN "Putovanja pregled agencija" /TR "powershell -File C:\putanja\Trip-planner\scripts\pregled-agencija.ps1"
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")
New-Item -ItemType Directory -Force izvestaji, logs | Out-Null
if (Test-Path .venv\Scripts\Activate.ps1) { . .venv\Scripts\Activate.ps1 }
$log = "logs\pregled-$(Get-Date -Format yyyy-MM-dd).log"
claude -p "/putovanja:pregled auto" --allowedTools "Bash(pt:*)" "WebFetch" "WebSearch" "Read" "Write(izvestaji/**)" "mcp__trello" *>> $log
