"""Uradi sam: kombinacije prevoz + smeštaj koje Claude istraži i sačuva, da se vide u panou.

Claude (skill uradi-sam) traži letove, autobuse, vozove i smeštaj svojim alatima i čuva
2–3 najbolje kombinacije komandom `pt uradisam sacuvaj <fajl.json>`. Pano ih prikazuje
pored ponuda agencija za istu destinaciju.

Oblik jedne kombinacije (JSON):
{
  "kuda": "Budimpešta", "odakle": "Beograd", "od": "2026-12-05", "do": "2026-12-07", "osoba": 2,
  "naslov": "Voz + hotel u centru",                         # kratko, opciono
  "prevoz":  [{"tip": "voz|bus|avion|auto", "opis": "...", "cena": 60, "valuta": "EUR", "link": "https://..."}],
  "smestaj": [{"naziv": "...", "opis": "2 noći, doručak", "cena": 180, "valuta": "EUR", "ocena": "8.7", "link": "..."}],
  "ostalo":  [{"opis": "gradski prevoz", "cena": 10, "valuta": "EUR"}],
  "napomena": "...", "izvori": ["https://..."]
}
Cene su UKUPNE za sve putnike (ne po osobi). Ukupno se računa ovde.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import datetime

SCHEMA = """
CREATE TABLE IF NOT EXISTS uradisam (
    id TEXT PRIMARY KEY,
    sacuvano TEXT NOT NULL,
    kuda TEXT,
    od TEXT,
    data TEXT NOT NULL
);
"""


def _init(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)


def _eur(x: dict, rsd_per_eur: float) -> float:
    c = float(x.get("cena") or 0)
    return c / rsd_per_eur if (x.get("valuta") or "EUR").upper() in ("RSD", "DIN") else c


def normalizuj(k: dict, rsd_per_eur: float = 117.0) -> dict:
    k = dict(k)
    for f in ("prevoz", "smestaj", "ostalo", "izvori"):
        k[f] = list(k.get(f) or [])
    k["osoba"] = int(k.get("osoba") or 2)
    stavke = k["prevoz"] + k["smestaj"] + k["ostalo"]
    k["ukupno"] = round(sum(_eur(x, rsd_per_eur) for x in stavke), 0)
    k["po_osobi"] = round(k["ukupno"] / max(1, k["osoba"]), 0)
    k["valuta"] = "EUR"
    k["nepotpuno"] = any(x.get("cena") in (None, "", 0) for x in stavke) or not k["prevoz"] or not k["smestaj"]
    if not k.get("id"):
        raw = json.dumps([k.get("kuda"), k.get("od"), k.get("do"), k.get("naslov"), stavke], sort_keys=True, ensure_ascii=False)
        k["id"] = hashlib.sha1(raw.encode()).hexdigest()[:10]
    return k


def sacuvaj(conn: sqlite3.Connection, kombinacije: list[dict], rsd_per_eur: float = 117.0) -> list[str]:
    _init(conn)
    ids = []
    for k in kombinacije:
        k = normalizuj(k, rsd_per_eur)
        k["sacuvano"] = datetime.now().isoformat(timespec="minutes")
        conn.execute("INSERT OR REPLACE INTO uradisam VALUES (?,?,?,?,?)",
                     (k["id"], k["sacuvano"], k.get("kuda"), k.get("od"), json.dumps(k, ensure_ascii=False)))
        ids.append(k["id"])
    conn.commit()
    return ids


def lista(conn: sqlite3.Connection, kuda: str | None = None) -> list[dict]:
    _init(conn)
    rows = conn.execute("SELECT data FROM uradisam ORDER BY sacuvano DESC").fetchall()
    out = [json.loads(r[0]) for r in rows]
    if kuda:
        from .geo import fold
        f = fold(kuda).strip()
        out = [k for k in out if f in fold(k.get("kuda") or "")]
    return out


def obrisi(conn: sqlite3.Connection, kid: str) -> bool:
    _init(conn)
    cur = conn.execute("DELETE FROM uradisam WHERE id LIKE ?", (kid + "%",))
    conn.commit()
    return cur.rowcount > 0
