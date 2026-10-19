#!/usr/bin/env bash
# Putovanja: instalacija i ažuriranje jednom komandom (macOS / Linux)
#
#   Prvi put:   git clone https://github.com/MiljanStankovic/Trip-planner.git ~/Putesestvije && ~/Putesestvije/install.sh
#   Ažuriranje: ~/Putesestvije/install.sh
#
# Opcije: --bez-skena (preskoči prvo skeniranje agencija)
set -euo pipefail
REPO="${PT_REPO:-https://github.com/MiljanStankovic/Trip-planner.git}"
FOLDER="${PT_FOLDER:-$HOME/Putesestvije}"
BEZ_SKENA=0
[[ "${1:-}" == "--bez-skena" ]] && BEZ_SKENA=1

korak() { printf '\n\033[36m==> %s\033[0m\n' "$1"; }
greska() { printf '\033[31mX %s\033[0m\n' "$1"; exit 1; }

korak "Provera: git, Python 3.11+, Claude Code"
command -v git >/dev/null || greska "Nema git-a."
PY=""
for c in python3.13 python3.12 python3.11 python3; do
  if command -v "$c" >/dev/null && "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)'; then PY="$c"; break; fi
done
[[ -n "$PY" ]] || greska "Treba Python 3.11 ili noviji."
command -v claude >/dev/null || greska "Nema Claude Code-a: https://docs.claude.com/en/docs/claude-code/overview"
echo "   git OK, $PY OK, claude OK"

SKRIPTA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [[ -n "$SKRIPTA_DIR" && -f "$SKRIPTA_DIR/pyproject.toml" ]]; then
  FOLDER="$SKRIPTA_DIR"
elif [[ ! -d "$FOLDER/.git" ]]; then
  korak "Kloniram $REPO u $FOLDER"
  git clone "$REPO" "$FOLDER"
fi
cd "$FOLDER"
korak "Povlačim najnoviji kod"
git pull --ff-only || echo "   (git pull nije prošao: lokalne izmene? nastavljam sa postojećim kodom)"

korak "Python okruženje i alat pt"
[[ -x .venv/bin/python ]] || "$PY" -m venv .venv
.venv/bin/python -m pip install --quiet --upgrade pip
.venv/bin/python -m pip install --quiet -e .
PT="$FOLDER/.venv/bin/pt"
echo "   pt: $PT"
CFG="${PT_CONFIG:-$HOME/.config/putovanja/config.toml}"
if [[ ! -f "$CFG" ]]; then "$PT" init >/dev/null; echo "   podešavanja: $CFG"; fi
mkdir -p "$HOME/.local/bin" && ln -sf "$PT" "$HOME/.local/bin/pt"
case ":$PATH:" in *":$HOME/.local/bin:"*) ;; *) echo "   dodaj ~/.local/bin u PATH da bi 'pt' radio iz bilo kog foldera";; esac

korak "Claude Code: marketplace i pluginovi"
claude plugin marketplace add "$FOLDER" >/dev/null 2>&1 || true
claude plugin marketplace update putovanja >/dev/null
for p in putovanja putovanja; do
  claude plugin install "$p@putovanja" >/dev/null 2>&1 || true
  claude plugin update "$p@putovanja" >/dev/null 2>&1 || true
  claude plugin list 2>/dev/null | grep -q "$p@putovanja" || greska "Plugin $p se nije instalirao (probaj u Claude Code-u: /plugin)"
  echo "   $p OK"
done
printf '{"ptPath":"%s"}' "$PT" | claude plugin configure "putovanja@putovanja" --values-stdin >/dev/null
echo "   pano podešen: ptPath = $PT"

if [[ $BEZ_SKENA -eq 0 ]]; then
  korak "Skeniram agencije (1–2 min)"
  "$PT" agencije skeniraj
fi

printf '\n\033[32mGotovo. Otvori (ili restartuj) Claude Code i ukucaj:  /putovanja\033[0m\n'
echo "Ažuriranje kasnije: $FOLDER/install.sh"
