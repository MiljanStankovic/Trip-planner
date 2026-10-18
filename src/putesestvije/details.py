"""Detalji ponude sa stranice agencije: opis, program, šta cena obuhvata i ne obuhvata, termini.

Radi za bilo koju agenciju (traži naslove sekcija po ključnim rečima), uz keš u bazi.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta

from bs4 import BeautifulSoup, Tag

from . import db
from .scrapers.base import BlockedByRobots, fetch

SECTIONS = {
    "program": ("program putovanja", "plan putovanja", "itinerer", "program"),
    "obuhvata": ("cena obuhvata", "aranžman obuhvata", "aranzman obuhvata", "u cenu je uključeno",
                 "cena uključuje", "uključeno u cenu", "ukljuceno"),
    "ne_obuhvata": ("cena ne obuhvata", "aranžman ne obuhvata", "nije uključeno", "ne uključuje",
                    "doplate", "fakultativ"),
    "termini": ("termini", "polasci", "datumi polaska", "cenovnik"),
    "napomene": ("napomena", "važne napomene", "uslovi putovanja", "dokumenta"),
}
MAX_SECTION = 1500


def _text(el: Tag) -> str:
    return re.sub(r"[ \t]+", " ", el.get_text("\n", strip=True)).strip()


def _collect_after(head: Tag, limit: int = MAX_SECTION) -> str:
    """Tekst posle naslova do sledećeg naslova istog ili višeg nivoa."""
    out: list[str] = []
    level = int(head.name[1]) if re.fullmatch(r"h[1-6]", head.name or "") else 6
    for sib in head.find_all_next():
        if sib is head:
            continue
        if re.fullmatch(r"h[1-6]", sib.name or "") and int(sib.name[1]) <= level:
            break
        if sib.name in ("p", "li", "td"):
            t = _text(sib)
            if t and t not in out:
                out.append(t)
        if sum(len(x) for x in out) > limit:
            break
    return "\n".join(out)[:limit]


def extract(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    meta = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    for t in soup(["script", "style", "noscript", "nav", "header", "footer", "form", "svg"]):
        t.decompose()
    h1 = soup.find("h1")
    out: dict = {
        "naslov": _text(h1) if h1 else "",
        "opis": (meta.get("content") or "").strip() if meta else "",
    }
    heads = soup.find_all(re.compile(r"^(h[1-6]|strong|b)$"))
    for key, words in SECTIONS.items():
        for h in heads:
            label = h.get_text(" ", strip=True).lower()
            if len(label) < 60 and any(w in label for w in words):
                body = _collect_after(h)
                if len(body) > 30:
                    out[key] = body
                    break
    if len(out) <= 2:
        main = soup.find("main") or soup.find("article") or soup.body
        if main:
            lines = [ln for ln in _text(main).split("\n") if len(ln) > 25]
            out["tekst"] = "\n".join(lines)[:MAX_SECTION]
    return out


def get(conn, offer_id: str, url: str, max_age_h: int = 24, refresh: bool = False) -> dict:
    conn.execute("CREATE TABLE IF NOT EXISTS details (offer_id TEXT PRIMARY KEY, fetched_at TEXT, data TEXT)")
    row = conn.execute("SELECT fetched_at, data FROM details WHERE offer_id=?", (offer_id,)).fetchone()
    if row and not refresh and datetime.fromisoformat(row[0]) > datetime.now() - timedelta(hours=max_age_h):
        return json.loads(row[1])
    try:
        data = extract(fetch(url))
    except BlockedByRobots:
        data = {"greska": "sajt ne dozvoljava automatsko čitanje ove stranice"}
    except Exception as e:  # mreža, 403...
        data = {"greska": f"stranica nije dostupna ({e.__class__.__name__})"}
    data["provereno"] = datetime.now().isoformat(timespec="minutes")
    conn.execute("INSERT OR REPLACE INTO details VALUES (?,?,?)",
                 (offer_id, data["provereno"], json.dumps(data, ensure_ascii=False)))
    conn.commit()
    return data


__all__ = ["extract", "get", "db"]
