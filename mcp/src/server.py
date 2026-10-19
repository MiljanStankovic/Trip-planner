"""Putovanja za običan Claude chat: MCP server sa prozorom (MCP App).

Prozor je cela aplikacija (ponude po zemljama, detalji, kalendar, praćenje, uradi sam, izvori).
Podatke daje isti alat kao terminal i pano (paket `putovanja`, ugrađen pored ovog fajla),
nad istom bazom na računaru: ~/.local/share/putovanja/putovanja.db.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

from mcp.server.mcpserver import MCPServer

OVDE = Path(__file__).parent
VERZIJA = "0.3.2"
# verzija je u adresi prozora: Claude pamti prozor po adresi, pa nova verzija mora imati novu adresu
PROZOR = f"ui://putovanja/prozor-{VERZIJA}.html"
MIME_PROZORA = "text/html;profile=mcp-app"
SAMO_PROZOR = {"ui": {"visibility": ["app"]}}

# komande alata putovanja koje prozor sme da traži (samo čitanje i praćenje; ništa ne briše van uradi sam)
DOZVOLJENO = {"zemlje", "top", "zemlja", "ponuda", "popusti", "kalendar", "prati", "obavestenja", "izvori", "stanje", "uradisam", "profil"}

server = MCPServer(
    "putovanja",
    instructions=(
        "Putovanja prikazuje ponude domaćih turističkih agencija (Srbija), cene po osobi, u prozoru u razgovoru. "
        "Kad korisnik pita za putovanja, aranžmane, gde da otputuje, ponude za neku zemlju ili šta prati, "
        "pozovi otvori_putovanja (sa zemljom ako je navedena). Prozor je cela aplikacija: korisnik u njemu sam "
        "bira zemlje, otvara ponude, prati cene i pravi 'uradi sam' plan. Za pitanja o jednoj ponudi koristi "
        "detalji_ponude umesto pretrage weba. Odgovaraj kratko, srpskom latinicom. "
        "Kad korisnik pita kako da pokrene ili doda Putovanja u Claude Code (pano pored razgovora), daj tačno ove korake, kratko, bez izmišljanja: 1) Treba Claude Code na računaru: terminal ili Code u aplikaciji Claude. Ako ga nema, instalira se jednom komandom: Windows (PowerShell): irm https://claude.ai/install.ps1 | iex; Mac ili Linux: curl -fsSL https://claude.ai/install.sh | bash. 2) U Claude Code pošalji, jednu pa drugu: /plugin marketplace add MiljanStankovic/Trip-planner i /plugin install putovanja@putovanja. 3) Zatvori i ponovo otvori Claude Code, pa otkucaj /putovanja; pano se otvara pored razgovora. Ništa drugo ne treba (ni Python), ponude stižu sa istog servera kao ovaj konektor. 4) Da pano prati isto što i telefon: u Claude Code otkucaj /putovanja adresa <adresa konektora>. Ako je korisnik u poruci dao svoju adresu konektora, napiši mu tu komandu sa njegovom adresom, spremnu za kopiranje; ako nije, reci da adresu nađe u Podešavanja → Konektori → putovanja. Ako pita sa telefona ili tableta, reci da se ovo radi na računaru; na telefonu već ima prozor."
    ),
)


def _env() -> dict[str, str]:
    env = dict(os.environ)
    env["PYTHONPATH"] = str(OVDE) + os.pathsep + env.get("PYTHONPATH", "")
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    return env


def pt(*argumenti: str, timeout: int = 120) -> Any:
    """Pokreće alat putovanja (--json) i vraća rezultat; greška ide nazad kao {"greska": ...}."""
    r = subprocess.run(
        [sys.executable, "-m", "putovanja.cli", "--json", *argumenti],
        capture_output=True, text=True, encoding="utf-8", timeout=timeout, env=_env(), cwd=str(OVDE),
    )
    if r.returncode != 0:
        poruka = (r.stderr or r.stdout).strip().splitlines()
        return {"greska": poruka[-1] if poruka else f"alat je vratio {r.returncode}"}
    try:
        return json.loads(r.stdout or "null")
    except json.JSONDecodeError:
        return {"greska": "alat nije vratio JSON", "tekst": r.stdout[-400:]}


def _pripremi() -> None:
    """Prvo pokretanje: napravi podešavanja (ista kao za terminal)."""
    cfg = Path.home() / ".config" / "putovanja" / "config.toml"
    if not cfg.exists():
        pt("init")


SKEN: dict[str, Any] = {"radi": False, "pocetak": None, "kraj": None, "greska": None}


def _skeniraj() -> None:
    SKEN.update(radi=True, pocetak=time.time(), kraj=None, greska=None)
    try:
        r = pt("agencije", "skeniraj", timeout=900)
        if isinstance(r, dict) and r.get("greska"):
            SKEN["greska"] = r["greska"]
    except Exception as e:  # noqa: BLE001 - poruka ide u prozor
        SKEN["greska"] = str(e)
    finally:
        SKEN.update(radi=False, kraj=time.time())


def _pocetni_podaci(zemlja: str, prikaz: str) -> dict[str, Any]:
    _pripremi()
    stanje = pt("stanje")
    zemlje = pt("zemlje")
    podaci: dict[str, Any] = {"prikaz": prikaz or "pocetna", "zemlja": zemlja, "stanje": stanje, "zemlje": zemlje,
                              "skeniranje": SKEN}
    if zemlja:
        lista = pt("zemlja", zemlja)
        podaci["lista"] = lista if isinstance(lista, list) else []
    else:
        top = pt("top", "preporuka", "--limit", "60")
        podaci["lista"] = top.get("ponude", []) if isinstance(top, dict) else []
    return podaci


@server.tool(
    name="otvori_putovanja",
    title="Otvori Putovanja",
    description=(
        "Otvara Putovanja u prozoru: ponude domaćih agencija, preporučene ili za jednu zemlju "
        "(npr. 'Grčka', 'Španija'). prikaz: pocetna | kalendar | praceno | uradisam. "
        "Prozor je cela aplikacija, korisnik dalje bira sam."
    ),
    meta={"ui": {"resourceUri": PROZOR}},
    structured_output=True,
)
def otvori_putovanja(zemlja: str = "", prikaz: str = "pocetna") -> dict[str, Any]:
    podaci = _pocetni_podaci(zemlja.strip(), prikaz)
    lista = podaci["lista"]
    podaci["verzija"] = VERZIJA
    podaci["za_model"] = (
        f"Prozor je otvoren ({'zemlja ' + zemlja if zemlja else 'preporučeno'}, {len(lista)} ponuda). "
        + "Prvih pet: " + "; ".join(
            f"{p.get('naziv') or p.get('title')} ({p.get('zemlja')}), {p.get('date_from') or 'datum po izboru'}, "
            f"{p.get('price') or 'na upit'} {p.get('currency', '')}, {p.get('agencija')}" for p in lista[:5])
    )
    return podaci


@server.tool(
    name="detalji_ponude",
    title="Detalji ponude",
    description=(
        "Detalji jedne ponude sa sajta agencije: program, šta cena obuhvata i ne obuhvata, doplate, polasci, "
        "popusti za više osoba i procena ukupne cene za `osoba` putnika. id je iz prozora ili iz otvori_putovanja."
    ),
    structured_output=True,
)
def detalji_ponude(id: str, osoba: int = 2) -> dict[str, Any]:
    r = pt("ponuda", id[:12], "--detalji", "--osobe", str(max(1, min(int(osoba or 2), 10))))
    return r if isinstance(r, dict) else {"greska": "nema podataka"}


@server.tool(
    name="skeniraj_agencije",
    title="Skeniraj agencije",
    description="Pokreće skeniranje sajtova agencija u pozadini (1-3 min). Prozor prikazuje kad se završi.",
    meta={"ui": {"visibility": ["model", "app"]}},
    structured_output=True,
)
def skeniraj_agencije() -> dict[str, Any]:
    if not SKEN["radi"]:
        threading.Thread(target=_skeniraj, daemon=True).start()
        time.sleep(0.2)
    return {"skeniranje": SKEN}


@server.tool(
    name="putovanja_podaci",
    title="Podaci za prozor",
    description="Interno za prozor Putovanja: jedna komanda alata putovanja (zemlje, top, zemlja, ponuda, kalendar, prati...).",
    meta=SAMO_PROZOR,
    structured_output=True,
)
def putovanja_podaci(komanda: str, argumenti: list[str] | None = None) -> dict[str, Any]:
    if komanda not in DOZVOLJENO:
        return {"greska": f"komanda {komanda} nije dozvoljena"}
    arg = [str(a) for a in (argumenti or [])]
    if komanda == "uradisam" and arg and arg[0] not in ("lista", "obrisi"):
        return {"greska": "uradisam: samo lista ili obrisi"}
    rez = pt(komanda, *arg)
    return {"komanda": komanda, "rezultat": rez, "skeniranje": SKEN}


@server.resource(PROZOR, name="Putovanja", description="Prozor aplikacije Putovanja", mime_type=MIME_PROZORA)
def prozor() -> str:
    return (OVDE / "prozor.html").read_text(encoding="utf-8")


def main() -> None:
    server.run("stdio")


if __name__ == "__main__":
    main()
