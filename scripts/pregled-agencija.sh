#!/usr/bin/env bash
# Izveštaj o ponudama agencija (macOS / Linux): preporuke, promene cena, predlozi.
# Pokreće Claude Code bez interfejsa i čuva izveštaj u izvestaji/. Nije potrebno za rad aplikacije:
# ponude se same osvežavaju svako jutro na serveru; ovo je samo zakazani izveštaj na tvom računaru.
#
# cron (npr. svake nedelje u 09:47):
#   47 9 * * 0  /putanja/do/Trip-planner/scripts/pregled-agencija.sh
# na dve nedelje: PT_SVAKE_DVE=1 (preskače neparne nedelje).

set -euo pipefail
cd "$(dirname "$0")/.."

if [[ "${PT_SVAKE_DVE:-0}" == "1" ]] && (( 10#$(date +%V) % 2 == 1 )); then
  echo "Neparna nedelja, preskačem."; exit 0
fi

mkdir -p izvestaji logs
[[ -f .venv/bin/activate ]] && source .venv/bin/activate

claude -p "/putovanja:pregled auto" \
  --allowedTools "Bash(pt:*)" "WebFetch" "WebSearch" "Read" "Write(izvestaji/**)" "mcp__trello" \
  >> "logs/pregled-$(date +%F).log" 2>&1

echo "Gotovo: izvestaji/$(date +%F).md"
