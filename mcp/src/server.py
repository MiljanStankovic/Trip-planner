"""Putovanja za običan Claude chat (korak 0, proba).

Lokalni MCP server sa jednim prozorom (MCP App): lista putovanja domaćih agencija.
U probi čita snimak ponuda (demo.json); pravi dodatak će čitati bazu alata putovanja.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from mcp.server.mcpserver import MCPServer

OVDE = Path(__file__).parent
PODACI = json.loads((OVDE / "demo.json").read_text(encoding="utf-8"))
PROZOR = "ui://putovanja/prozor.html"
MIME_PROZORA = "text/html;profile=mcp-app"

server = MCPServer(
    "putovanja",
    instructions=(
        "Putovanja prikazuje ponude domaćih turističkih agencija (Srbija) sa cenama po osobi. "
        "Kad korisnik pita za putovanja, aranžmane, gde da otputuje ili ponude za neku zemlju, "
        "pozovi pokazi_putovanja (sa zemljom ako je navedena). Prozor sam prikazuje listu, "
        "pa ti ukratko, srpskom latinicom, izdvoji 2-3 zanimljive ponude."
    ),
)


def _eur(p: dict) -> float:
    if not p.get("price"):
        return 1e9
    return p["price"] / 117 if p.get("currency") == "RSD" else p["price"]


def _popust(p: dict) -> int:
    s, n = p.get("old_price"), p.get("price")
    return round(100 * (s - n) / s) if s and n and s > n else 0


def _lista(zemlja: str, sortiraj: str) -> list[dict]:
    if zemlja:
        kljuc = next((z for z in PODACI["po_zemlji"] if z.lower() == zemlja.strip().lower()), None)
        ponude = PODACI["po_zemlji"].get(kljuc, []) if kljuc else []
    else:
        ponude = PODACI["top"]
    if sortiraj == "cena":
        ponude = sorted(ponude, key=_eur)
    elif sortiraj == "datum":
        ponude = sorted(ponude, key=lambda p: p.get("date_from") or "9999")
    elif sortiraj == "popust":
        ponude = sorted(ponude, key=lambda p: -_popust(p))
    return ponude


@server.tool(
    name="pokazi_putovanja",
    title="Prikaži putovanja",
    description=(
        "Prikazuje ponude turističkih agencija u prozoru: preporučene (bez zemlje) ili za jednu zemlju. "
        "sortiraj: preporuka | cena | datum | popust. putnika: broj osoba za ukupnu cenu."
    ),
    meta={"ui": {"resourceUri": PROZOR}},
    structured_output=True,
)
def pokazi_putovanja(zemlja: str = "", sortiraj: str = "preporuka", putnika: int = 2) -> dict[str, Any]:
    ponude = _lista(zemlja, sortiraj)
    return {
        "zemlja": zemlja,
        "sortiraj": sortiraj,
        "putnika": max(1, min(int(putnika or 2), 8)),
        "broj": len(ponude),
        "zemlje": PODACI["zemlje"],
        "dostupne_zemlje": list(PODACI["po_zemlji"]),
        "ponude": ponude[:40],
        "za_model": [
            f"{p['naziv']} ({p['zemlja']}), {p.get('date_from') or 'datum po izboru'}, "
            f"{p.get('nights') or '?'} noći, {p.get('transport') or 'prevoz ?'}, {p['agencija']}, "
            f"{p.get('price') or 'na upit'} {p.get('currency')}"
            for p in ponude[:10]
        ],
    }


@server.resource(PROZOR, name="Putovanja", description="Prozor sa listom putovanja", mime_type=MIME_PROZORA)
def prozor() -> str:
    return (OVDE / "prozor.html").read_text(encoding="utf-8")


def main() -> None:
    server.run("stdio")


if __name__ == "__main__":
    main()
