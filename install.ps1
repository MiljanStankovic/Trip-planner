# Putovanja: instalacija i ažuriranje jednom komandom (Windows / PowerShell)
#
#   irm https://raw.githubusercontent.com/MiljanStankovic/Trip-planner/main/install.ps1 | iex
#
# Šta radi: instalira uv (on sam donese Python), doda Putovanja u Claude Code (marketplace + plugin),
# instalira alat "putovanja" (skraćeno pt), napravi podešavanja i skenira agencije.
# Ponovno pokretanje iste komande ažurira sve. Ništa se ne briše i ne menja van ovoga.
#
# Opcije (preko promenljivih okruženja, jer irm | iex ne prima parametre):
#   $env:PUTOVANJA_GRANA = "ime-grane"   instaliraj sa druge grane (za probu pre spajanja u main)
#   $env:PUTOVANJA_BEZ_SKENA = "1"       preskoči prvo skeniranje agencija
#   $env:PUTOVANJA_TRELLO = "1"          uključi i dodatak putovanja-trello

$ErrorActionPreference = "Continue"   # native komande pišu na stderr; greške proveravamo preko $LASTEXITCODE
$Repo = "MiljanStankovic/Trip-planner"
$Grana = $env:PUTOVANJA_GRANA
function Korak($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Ok($t) { Write-Host "   $t" }
function Ima($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Greska($t) { Write-Host "X $t" -ForegroundColor Red; throw "Instalacija prekinuta" }

try {

Korak "Claude Code"
if (-not (Ima claude)) {
    Greska "Nema Claude Code-a. Instaliraj ga ovom komandom, otvori novi PowerShell i pokreni ovu instalaciju ponovo:`n   irm https://claude.ai/install.ps1 | iex"
}
Ok "claude OK"

Korak "uv (donosi Python, ne moraš da ga instaliraš)"
$uvBin = Join-Path $HOME ".local\bin"
if (-not (Ima uv)) {
    if (Test-Path (Join-Path $uvBin "uv.exe")) {
        $env:Path = "$uvBin;$env:Path"
    } else {
        powershell -ExecutionPolicy ByPass -NoProfile -Command "irm https://astral.sh/uv/install.ps1 | iex"
        $env:Path = "$uvBin;$env:Path"
    }
}
if (-not (Ima uv)) { Greska "uv se nije instalirao. Probaj ručno: powershell -ExecutionPolicy ByPass -c `"irm https://astral.sh/uv/install.ps1 | iex`"" }
Ok ("uv " + ((uv --version) -replace '^uv ', ''))

Korak "Putovanja u Claude Code-u"
if ($Grana) {
    # proba sa grane: lokalna kopija repoa, marketplace iz tog foldera
    if (-not (Ima git)) { Greska "Za instalaciju sa grane treba git: winget install --id Git.Git -e" }
    $izvor = Join-Path $HOME ".putovanja\izvor"
    if (Test-Path (Join-Path $izvor ".git")) {
        git -C $izvor fetch --quiet origin $Grana
        git -C $izvor checkout --quiet $Grana
        git -C $izvor reset --quiet --hard "origin/$Grana"
    } else {
        git clone --quiet --branch $Grana "https://github.com/$Repo.git" $izvor
    }
    if ($LASTEXITCODE) { Greska "Ne mogu da preuzmem granu $Grana" }
    $marketplace = $izvor
    Ok "grana: $Grana ($izvor)"
} else {
    $marketplace = $Repo
}
$lista = claude plugin marketplace list 2>$null | Out-String
if ($lista -notmatch "putovanja") {
    claude plugin marketplace add $marketplace 2>&1 | Out-Null
    if ($LASTEXITCODE) {
        if (-not (Ima git)) { Greska "Claude Code ne može da preuzme plugin bez git-a. Instaliraj ga (winget install --id Git.Git -e), otvori novi PowerShell i pokreni ponovo." }
        Greska "Ne mogu da dodam marketplace $marketplace"
    }
}
claude plugin marketplace update putovanja 2>&1 | Out-Null
claude plugin install "putovanja@putovanja" 2>&1 | Out-Null
claude plugin update "putovanja@putovanja" 2>&1 | Out-Null
$plugini = claude plugin list 2>$null | Out-String
if ($plugini -notmatch "putovanja@putovanja") { Greska "Plugin putovanja se nije instalirao (probaj u Claude Code-u: /plugin)" }
Ok "plugin putovanja OK"
if ($env:PUTOVANJA_TRELLO -eq "1") {
    claude plugin install "putovanja-trello@putovanja" 2>&1 | Out-Null
    claude plugin enable "putovanja-trello@putovanja" 2>&1 | Out-Null
    Ok "dodatak putovanja-trello uključen"
}

Korak "Alat putovanja (pt)"
if ($Grana) { $paket = $izvor } else { $paket = "https://github.com/$Repo/archive/refs/heads/main.zip" }
uv tool install --force --quiet --python 3.12 $paket 2>&1 | Out-Null
if ($LASTEXITCODE) { Greska "uv tool install nije uspeo" }
$toolBin = (uv tool dir --bin).Trim()
$pt = Join-Path $toolBin "putovanja.exe"
if (-not (Test-Path $pt)) { Greska "Nema $pt posle instalacije" }
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not ($userPath -split ";" | Where-Object { $_ -eq $toolBin })) {
    [Environment]::SetEnvironmentVariable("Path", (($userPath.TrimEnd(";")) + ";" + $toolBin).TrimStart(";"), "User")
}
$ver = & $pt --version 2>&1 | Out-String
if ($LASTEXITCODE) { Write-Host $ver; Greska "Alat putovanja ne radi (vidi grešku iznad)" }
Ok ("putovanja " + $ver.Trim())
$cfg = Join-Path $HOME ".config\putovanja\config.toml"
if (-not (Test-Path $cfg)) { & $pt init | Out-Null; Ok "podešavanja: $cfg" }

if ($env:PUTOVANJA_BEZ_SKENA -ne "1") {
    Korak "Skeniram agencije (1-2 min)"
    & $pt agencije skeniraj
}

Korak "Terminal"
if ($env:WT_SESSION -or (Ima wt)) {
    Ok "Windows Terminal OK"
} else {
    Write-Host "   Pano najbolje izgleda u Windows Terminal-u (boje, ivice). Instalacija: winget install --id Microsoft.WindowsTerminal -e" -ForegroundColor Yellow
}

Write-Host "`nGotovo. Otvori novi terminal, pokreni claude i ukucaj:  /putovanja" -ForegroundColor Green
Write-Host "Ažuriranje kasnije: ista komanda kao za instalaciju."

} catch {
    Write-Host "`nInstalacija nije završena. Popravi ono što piše iznad i pokreni komandu ponovo." -ForegroundColor Red
}
