# Putovanja: instalacija i ažuriranje jednom komandom (Windows / PowerShell)
#
#   Prvi put:   git clone https://github.com/MiljanStankovic/Trip-planner.git $HOME\Putesestvije
#               powershell -ExecutionPolicy Bypass -File $HOME\Putesestvije\install.ps1
#   Ažuriranje: ista druga komanda (povuče izmene i osveži sve).
#
# Šta radi: povuče najnoviji kod, napravi Python okruženje i instalira alat pt, napravi
# podešavanja (ako ih nema), doda pt u PATH, instalira oba Claude Code plugina
# (putovanja + pano /putovanja) i upiše im putanju do pt, pa skenira agencije.
param(
    [switch]$BezSkena,                                   # preskoči prvo skeniranje agencija
    [string]$Folder = "$HOME\Putesestvije",              # gde da klonira ako se skripta ne pokreće iz repoa
    [string]$Repo = "https://github.com/MiljanStankovic/Trip-planner.git"
)
$ErrorActionPreference = "Continue"   # native komande (git, claude) pišu na stderr; greške proveravamo preko $LASTEXITCODE
function Korak($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Ima($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Greska($t) { Write-Host "X $t" -ForegroundColor Red; exit 1 }

# --- 0. preduslovi ---
Korak "Provera: git, Python 3.11+, Claude Code"
if (-not (Ima git)) { Greska "Nema git-a. Instaliraj: winget install Git.Git  (pa otvori novi PowerShell)" }
$py = $null
foreach ($k in @("py -3", "python", "python3")) {
    $exe, $arg = $k.Split(" ", 2)
    if (Ima $exe) {
        $v = & $exe $(if ($arg) { $arg }) -c "import sys;print('%d.%d'%sys.version_info[:2])" 2>$null
        if ($v -and [version]$v -ge [version]"3.11") { $py = $k; break }
    }
}
if (-not $py) { Greska "Treba Python 3.11 ili noviji. Instaliraj: winget install Python.Python.3.12  (pa otvori novi PowerShell)" }
if (-not (Ima claude)) { Greska "Nema Claude Code-a. Uputstvo: https://docs.claude.com/en/docs/claude-code/overview" }
Write-Host "   git OK, Python ($py) OK, claude OK"

# --- 1. kod ---
$Folder = [System.IO.Path]::GetFullPath($Folder)
$ovde = if ($PSScriptRoot -and (Test-Path (Join-Path $PSScriptRoot "pyproject.toml"))) { $PSScriptRoot } else { $null }
if ($ovde) {
    $Folder = $ovde
} elseif (-not (Test-Path (Join-Path $Folder ".git"))) {
    Korak "Kloniram $Repo u $Folder"
    git clone $Repo $Folder
    if ($LASTEXITCODE) { Greska "git clone nije uspeo (privatni repo traži pristup na GitHub-u)" }
}
Set-Location $Folder
Korak "Povlačim najnoviji kod"
git pull --ff-only
if ($LASTEXITCODE) { Write-Host "   (git pull nije prošao: lokalne izmene? nastavljam sa postojećim kodom)" -ForegroundColor Yellow }

# --- 2. Python alat pt ---
Korak "Python okruženje i alat pt"
$naWindows = $env:OS -eq "Windows_NT"
$venvBin = if ($naWindows) { Join-Path $Folder ".venv\Scripts" } else { Join-Path $Folder ".venv/bin" }
$venvPy = Join-Path $venvBin $(if ($naWindows) { "python.exe" } else { "python" })
if (-not (Test-Path $venvPy)) {
    $exe, $arg = $py.Split(" ", 2)
    & $exe $(if ($arg) { $arg }) -m venv .venv
    if ($LASTEXITCODE) { Greska "Ne mogu da napravim Python okruženje (.venv)" }
}
& $venvPy -m pip install --quiet --upgrade pip
& $venvPy -m pip install --quiet -e .
if ($LASTEXITCODE) { Greska "pip install nije uspeo" }
$pt = Join-Path $venvBin $(if ($naWindows) { "pt.exe" } else { "pt" })
if (-not (Test-Path $pt)) { Greska "Nema $pt posle instalacije" }
Write-Host "   pt: $pt"

$cfg = Join-Path $HOME ".config\putovanja\config.toml"
if (-not (Test-Path $cfg)) { & $pt init | Out-Null; Write-Host "   podešavanja: $cfg (otvori i upiši šta volite, budžet...)" }

# pt u PATH (za nove terminale), da radi i "pt ..." iz bilo kog foldera
$bin = Split-Path $pt
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($naWindows -and -not ($userPath -split ";" | Where-Object { $_ -eq $bin })) {
    [Environment]::SetEnvironmentVariable("Path", (($userPath.TrimEnd(";")) + ";" + $bin).TrimStart(";"), "User")
    Write-Host "   pt dodat u PATH (važi u novim terminalima)"
}

# --- 3. Claude Code pluginovi ---
Korak "Claude Code: marketplace i pluginovi"
claude plugin marketplace add $Folder 2>$null | Out-Null
claude plugin marketplace update putovanja 2>$null | Out-Null
if ($LASTEXITCODE) { Greska "Ne mogu da dodam marketplace iz $Folder (claude plugin marketplace add)" }
foreach ($p in @("putovanja", "putovanja")) {
    claude plugin install "$p@putovanja" 2>$null | Out-Null
    claude plugin update "$p@putovanja" 2>$null | Out-Null
    $lista = claude plugin list 2>$null | Out-String
    if ($lista -notmatch [regex]::Escape("$p@putovanja")) { Greska "Plugin $p se nije instalirao (probaj u Claude Code-u: /plugin)" }
    Write-Host "   $p OK"
}
# pano zna gde je pt (bez obzira na PATH)
@{ ptPath = $pt } | ConvertTo-Json -Compress | claude plugin configure "putovanja@putovanja" --values-stdin 2>$null | Out-Null
if ($LASTEXITCODE) { Write-Host "   (nisam upisao ptPath; u Claude Code-u ukucaj: /putovanja pt $pt)" -ForegroundColor Yellow }
Write-Host "   pano podešen: ptPath = $pt"

# --- 4. prvo skeniranje ---
if (-not $BezSkena) {
    Korak "Skeniram agencije (1–2 min)"
    & $pt agencije skeniraj
}

Write-Host "`nGotovo. Otvori (ili restartuj) Claude Code i ukucaj:  /putovanja" -ForegroundColor Green
Write-Host ("Ažuriranje kasnije: powershell -ExecutionPolicy Bypass -File " + (Join-Path $Folder "install.ps1"))
