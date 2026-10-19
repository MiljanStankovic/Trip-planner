"""Kalendar polazaka i praćenje cena.

Praćenje je po aranžmanu (isti sajt i naziv), ne po jednom datumu: prati se najniža cena svih
polazaka tog aranžmana. Obaveštenja: pad cene ispod poslednje javljene, aranžman nestao sa sajta,
i nove ponude koje odgovaraju željama iz profila (likes) od poslednjeg pregleda.
"""

from __future__ import annotations

import calendar as _cal
import sqlite3
from datetime import date, datetime, timedelta

from . import catalog
from .config import Config
from .geo import fold

SCHEMA = """
CREATE TABLE IF NOT EXISTS pracenje (
    kljuc TEXT PRIMARY KEY,
    offer_id TEXT NOT NULL,
    naslov TEXT,
    agencija TEXT,
    url TEXT,
    valuta TEXT,
    cena_pocetna REAL,
    javljena_cena REAL,
    dodato TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stanje (k TEXT PRIMARY KEY, v TEXT);
"""


def _init(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)


def _key(it: catalog.Item) -> str:
    return "|".join(catalog.tour_key(it))


def _min_cena(it: catalog.Item) -> float | None:
    c = [t["cena"] for t in it.termini() if t["cena"]]
    return min(c) if c else None


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


# ---------- kalendar ----------

def pravoslavni_uskrs(godina: int) -> date:
    a, b, c = godina % 4, godina % 7, godina % 19
    d = (19 * c + 15) % 30
    e = (2 * a + 4 * b - d + 34) % 7
    mesec, dan = divmod(d + e + 114, 31)
    return date(godina, mesec, dan + 1) + timedelta(days=13)  # julijanski → gregorijanski (1900–2099)


def praznici(godina: int) -> dict[str, str]:
    """Neradni državni praznici u Srbiji (sa prenosom na ponedeljak kad padnu u nedelju)."""
    out: dict[str, str] = {}

    def dodaj(d: date, ime: str, prenos: bool = True):
        out[d.isoformat()] = ime
        if prenos and d.weekday() == 6:
            out[(d + timedelta(days=1)).isoformat()] = ime + " (prenos)"

    for dd, ime in [((1, 1), "Nova godina"), ((1, 2), "Nova godina"), ((2, 15), "Sretenje"), ((2, 16), "Sretenje"),
                    ((5, 1), "Praznik rada"), ((5, 2), "Praznik rada"), ((11, 11), "Dan primirja")]:
        dodaj(date(godina, *dd), ime)
    dodaj(date(godina, 1, 7), "Božić", prenos=False)
    u = pravoslavni_uskrs(godina)
    for k, ime in [(-2, "Veliki petak"), (-1, "Velika subota"), (0, "Uskrs"), (1, "Uskršnji ponedeljak")]:
        dodaj(u + timedelta(days=k), ime, prenos=False)
    return out

def kalendar(items: list[catalog.Item], mesec: str | None = None, meseci_napred: int = 12) -> dict:
    """{mesec, meseci: [{mesec, broj}], dani: {datum: [ponude]}}; jedan red po aranžmanu i datumu."""
    today = date.today()
    mesec = mesec or today.strftime("%Y-%m")
    brojac: dict[str, int] = {}
    dani: dict[str, list[dict]] = {}
    seen: set[tuple] = set()
    for it in items:
        k = catalog.tour_key(it)
        for t in it.termini():
            d = t["datum"]
            if not d or d < today.isoformat() or (k, d) in seen:
                continue
            seen.add((k, d))
            brojac[d[:7]] = brojac.get(d[:7], 0) + 1
            if d[:7] == mesec:
                x = it.to_dict()
                x.pop("termini", None)
                x.update(id=t["id"], date_from=d, price=t["cena"], old_price=t["stara"], currency=t["valuta"],
                         nights=t["noci"], broj_termina=len(it.termini()),
                         ceo_mesec="po izboru" in (it.row["note"] or ""))
                dani.setdefault(d, []).append(x)
    meseci = []
    y, m = today.year, today.month
    for _ in range(meseci_napred):
        key = f"{y:04d}-{m:02d}"
        meseci.append({"mesec": key, "broj": brojac.get(key, 0)})
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    for d in dani:
        dani[d].sort(key=lambda x: (x["price"] is None, (x["price"] or 0) / (117 if x["currency"] == "RSD" else 1)))
    pr = {**praznici(int(mesec[:4])), **praznici(int(mesec[:4]) + 1)}
    return {"mesec": mesec, "praznici": {d: n for d, n in pr.items() if d[:7] == mesec}, "dana_u_mesecu": _cal.monthrange(int(mesec[:4]), int(mesec[5:]))[1],
            "meseci": meseci, "dani": dict(sorted(dani.items()))}


# ---------- praćenje ----------

def prati(conn: sqlite3.Connection, it: catalog.Item) -> bool:
    """Uključi/isključi praćenje aranžmana. Vraća True ako se sada prati."""
    _init(conn)
    k = _key(it)
    if conn.execute("SELECT 1 FROM pracenje WHERE kljuc=?", (k,)).fetchone():
        conn.execute("DELETE FROM pracenje WHERE kljuc=?", (k,))
        conn.commit()
        return False
    c = _min_cena(it)
    conn.execute("INSERT INTO pracenje VALUES (?,?,?,?,?,?,?,?,?)",
                 (k, it.id, it.row["title"], it.agency, it.row["url"], it.row["currency"] or "EUR", c, c, _now()))
    conn.commit()
    return True


def pracene_kljuceve(conn: sqlite3.Connection) -> set[str]:
    _init(conn)
    return {r[0] for r in conn.execute("SELECT kljuc FROM pracenje")}


def je_praceno(conn: sqlite3.Connection, it: catalog.Item) -> bool:
    return _key(it) in pracene_kljuceve(conn)


def pracenje(conn: sqlite3.Connection, items: list[catalog.Item]) -> list[dict]:
    """Praćeni aranžmani sa današnjom najnižom cenom i promenom od dodavanja."""
    _init(conn)
    po_kljucu: dict[str, catalog.Item] = {}
    for it in items:
        k = _key(it)
        if k not in po_kljucu or (it.row["date_from"] or "9") < (po_kljucu[k].row["date_from"] or "9"):
            po_kljucu[k] = it
    out = []
    for r in conn.execute("SELECT * FROM pracenje ORDER BY dodato DESC").fetchall():
        it = po_kljucu.get(r["kljuc"])
        sada = _min_cena(it) if it else None
        d = it.to_dict() if it else {"id": r["offer_id"], "title": r["naslov"], "agencija": r["agencija"],
                                     "url": r["url"], "currency": r["valuta"], "termini": []}
        d.update(kljuc=r["kljuc"], dodato=r["dodato"], cena_pocetna=r["cena_pocetna"], cena_sada=sada,
                 javljena_cena=r["javljena_cena"], aktivno=it is not None,
                 promena=(sada - r["cena_pocetna"]) if sada and r["cena_pocetna"] else None)
        out.append(d)
    return out


def obavestenja(conn: sqlite3.Connection, items: list[catalog.Item], cfg: Config, procitano: bool = False) -> dict:
    """Šta je novo za korisnika: padovi cena praćenih, nestali praćeni, nove ponude po željama."""
    _init(conn)
    padovi, nestali = [], []
    for p in pracenje(conn, items):
        if not p["aktivno"]:
            nestali.append(p)
        elif p["cena_sada"] and p["javljena_cena"] and p["cena_sada"] < p["javljena_cena"]:
            padovi.append(p)
    row = conn.execute("SELECT v FROM stanje WHERE k='pregledano'").fetchone()
    od = row[0] if row else None
    if od is None:  # prvi put: od sada se broji šta je novo
        conn.execute("INSERT OR REPLACE INTO stanje VALUES ('pregledano', ?)", (_now(),))
        conn.commit()
    zelje = [fold(w).strip() for w in cfg.profile.likes if w.strip()]
    nove, vidjeno = [], set()
    if od and zelje:
        for it in items:
            if it.row["first_seen"] <= od or catalog.tour_key(it) in vidjeno:
                continue
            pogodak = next((w for w, fw in zip(cfg.profile.likes, zelje) if " " + fw in it.haystack), None)
            if pogodak:
                vidjeno.add(catalog.tour_key(it))
                d = it.to_dict()
                d["zelja"] = pogodak
                nove.append(d)
    if procitano:
        for p in padovi:
            conn.execute("UPDATE pracenje SET javljena_cena=? WHERE kljuc=?", (p["cena_sada"], p["kljuc"]))
        for p in nestali:
            conn.execute("UPDATE pracenje SET javljena_cena=NULL WHERE kljuc=?", (p["kljuc"],))
        conn.execute("INSERT OR REPLACE INTO stanje VALUES ('pregledano', ?)", (_now(),))
        conn.commit()
    nestali = [p for p in nestali if p["javljena_cena"] is not None]
    return {"padovi": padovi, "nestali": nestali, "nove_po_zeljama": nove[:30],
            "ukupno": len(padovi) + len(nestali) + len(nove), "od": od}
