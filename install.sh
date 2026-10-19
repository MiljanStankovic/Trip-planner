#!/usr/bin/env bash
# Putovanja: instalacija i ažuriranje jednom komandom (macOS / Linux)
#
#   curl -fsSL https://raw.githubusercontent.com/MiljanStankovic/Trip-planner/main/install.sh | bash
#
# Šta radi: instalira uv (on sam donese Python), doda Putovanja u Claude Code (marketplace + plugin),
# instalira alat "putovanja" (skraćeno pt), napravi podešavanja i skenira agencije.
# Ponovno pokretanje iste komande ažurira sve.
#
# Opcije (promenljive okruženja):
#   PUTOVANJA_GRANA=ime-grane   instaliraj sa druge grane (proba pre spajanja u main)
#   PUTOVANJA_BEZ_SKENA=1       preskoči prvo skeniranje agencija
#   PUTOVANJA_TRELLO=1          uključi i dodatak putovanja-trello
set -euo pipefail
REPO="MiljanStankovic/Trip-planner"
GRANA="${PUTOVANJA_GRANA:-}"

korak() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
ok() { printf '   %s\n' "$1"; }
greska() { printf '\033[31mX %s\033[0m\n' "$1"; exit 1; }

korak "Claude Code"
command -v claude >/dev/null || greska "Nema Claude Code-a. Instaliraj ga: curl -fsSL https://claude.ai/install.sh | bash  (pa pokreni ovo ponovo)"
ok "claude OK"

korak "uv (donosi Python, ne moraš da ga instaliraš)"
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | sh >/dev/null
fi
command -v uv >/dev/null || greska "uv se nije instalirao (curl -LsSf https://astral.sh/uv/install.sh | sh)"
ok "$(uv --version)"

korak "Putovanja u Claude Code-u"
if [[ -n "$GRANA" ]]; then
  command -v git >/dev/null || greska "Za instalaciju sa grane treba git."
  IZVOR="$HOME/.putovanja/izvor"
  if [[ -d "$IZVOR/.git" ]]; then
    git -C "$IZVOR" fetch --quiet origin "$GRANA"
    git -C "$IZVOR" checkout --quiet "$GRANA"
    git -C "$IZVOR" reset --quiet --hard "origin/$GRANA"
  else
    git clone --quiet --branch "$GRANA" "https://github.com/$REPO.git" "$IZVOR"
  fi
  MARKETPLACE="$IZVOR"
  ok "grana: $GRANA ($IZVOR)"
else
  MARKETPLACE="$REPO"
fi
if ! claude plugin marketplace list 2>/dev/null | grep -q putovanja; then
  claude plugin marketplace add "$MARKETPLACE" >/dev/null 2>&1 || greska "Ne mogu da dodam marketplace $MARKETPLACE (treba git)"
fi
claude plugin marketplace update putovanja >/dev/null 2>&1 || true
claude plugin install putovanja@putovanja >/dev/null 2>&1 || true
claude plugin update putovanja@putovanja >/dev/null 2>&1 || true
claude plugin list 2>/dev/null | grep -q "putovanja@putovanja" || greska "Plugin putovanja se nije instalirao (probaj u Claude Code-u: /plugin)"
ok "plugin putovanja OK"
if [[ "${PUTOVANJA_TRELLO:-0}" == "1" ]]; then
  claude plugin install putovanja-trello@putovanja >/dev/null 2>&1 || true
  claude plugin enable putovanja-trello@putovanja >/dev/null 2>&1 || true
  ok "dodatak putovanja-trello uključen"
fi

korak "Alat putovanja (pt)"
if [[ -n "$GRANA" ]]; then PAKET="$IZVOR"; else PAKET="https://github.com/$REPO/archive/refs/heads/main.zip"; fi
uv tool install --force --quiet --python 3.12 "$PAKET" >/dev/null 2>&1 || greska "uv tool install nije uspeo"
PT="$(uv tool dir --bin)/putovanja"
[[ -x "$PT" ]] || greska "Nema $PT posle instalacije"
VER="$("$PT" --version 2>&1)" || { echo "$VER"; greska "Alat putovanja ne radi (vidi grešku iznad)"; }
ok "putovanja $VER"
case ":$PATH:" in *":$(uv tool dir --bin):"*) ;; *) uv tool update-shell >/dev/null 2>&1 || true;; esac
CFG="$HOME/.config/putovanja/config.toml"
if [[ ! -f "$CFG" ]]; then "$PT" init >/dev/null; ok "podešavanja: $CFG"; fi

if [[ "${PUTOVANJA_BEZ_SKENA:-0}" != "1" ]]; then
  korak "Skeniram agencije (1-2 min)"
  "$PT" agencije skeniraj
fi

printf '\n\033[32mGotovo. Otvori novi terminal, pokreni claude i ukucaj:  /putovanja\033[0m\n'
echo "Ažuriranje kasnije: ista komanda kao za instalaciju."
