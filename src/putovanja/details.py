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
    "program": ("program putovanja", "plan putovanja", "plan puta", "itinerer", "program"),
    "obuhvata": ("cena obuhvata", "aranžman obuhvata", "aranzman obuhvata", "aranžmana obuhvata", "aranzmana obuhvata", "u cenu je uključeno",
                 "cena uključuje", "uključeno u cenu", "ukljuceno"),
    "ne_obuhvata": ("cena ne obuhvata", "aranžman ne obuhvata", "aranžmana ne obuhvata", "aranzmana ne obuhvata", "nije uključeno", "ne uključuje",
                    "doplate"),
    "termini": ("termini", "polasci", "datumi polaska", "cenovnik"),
    "napomene": ("napomena", "važne napomene", "uslovi putovanja", "dokumenta"),
}
MAX_SECTION = 1500
VERZIJA = 3  # povećaj kad se promeni izvlačenje, da se keš osveži


def _text(el: Tag) -> str:
    return re.sub(r"[ \t]+", " ", el.get_text("\n", strip=True)).strip()


def _labela(el: Tag) -> str:
    return " ".join(el.get_text(" ", strip=True).lower().split())


def _cenovni_naslov(el: Tag) -> bool:
    """„Cena (ne) obuhvata” i slično: tu sigurno počinje nova sekcija, čak i kad je samo podebljano."""
    t = _labela(el)
    return len(t) < 60 and any(w in t for k in ("obuhvata", "ne_obuhvata") for w in SECTIONS[k])


def _collect_after(head: Tag, limit: int = MAX_SECTION) -> str:
    """Tekst posle naslova do sledećeg naslova istog ili višeg nivoa."""
    if head.name in ("strong", "b"):
        # podebljan naslov sa tekstom u istom pasusu: „CENA OBUHVATA: – prevoz … NE OBUHVATA: …”
        delovi = []
        for sib in head.next_siblings:
            if isinstance(sib, Tag) and sib.name in ("strong", "b") and (_cenovni_naslov(sib) or _labela(sib).endswith(":")):
                break
            t = _text(sib) if isinstance(sib, Tag) else str(sib).strip()
            if t:
                delovi.append(t)
        tekst = "\n".join(delovi).strip(" :\n")
        if len(tekst) > 30:
            return tekst[:limit]
    out: list[str] = []
    level = int(head.name[1]) if re.fullmatch(r"h[1-6]", head.name or "") else 6
    for sib in head.find_all_next():
        if sib is head:
            continue
        if sib.name in ("strong", "b") and _cenovni_naslov(sib) and _labela(sib) != _labela(head):
            break
        if re.fullmatch(r"h[1-6]", sib.name or "") and int(sib.name[1]) <= level:
            dan = _text(sib)
            if not re.match(r"\d{1,2}\.\s*dan\b", dan, re.I):
                break
            if dan not in out:  # „1. DAN / BEOGRAD” je deo programa, ne nova sekcija
                out.append(dan)
        if sib.name in ("p", "li", "td"):
            t = _text(sib)
            if t and t not in out:
                out.append(t)
        if sum(len(x) for x in out) > limit:
            break
    return "\n".join(out)[:limit]


_DATUM = re.compile(r"\d{1,2}\.\s?\d{1,2}\.|\d{4}-\d{2}-\d{2}|\b\d{1,2}\s*(jan|feb|mar|apr|maj|jun|jul|avg|sep|okt|nov|dec)", re.I)


def _dmy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}.{m}.{y}."


def _polasci(soup: BeautifulSoup) -> str:
    """Polasci zapisani kao data-dateFrom/dateTo (Travelland i slični), bez kartica 'možda vam se sviđa'."""
    out, seen = [], set()
    for el in soup.find_all(attrs={"data-datefrom": True}):
        if el.get("data-href") or el.find_parent("a"):
            continue
        a, b = el.get("data-datefrom"), el.get("data-dateto")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", a or "") or (a, b) in seen:
            continue
        seen.add((a, b))
        out.append(f"{_dmy(a)} – {_dmy(b)}" if b and re.fullmatch(r"\d{4}-\d{2}-\d{2}", b) else _dmy(a))
    return "\n".join(out)


def _sobe(soup: BeautifulSoup) -> str:
    """Cene po tipu sobe za izabrani polazak (Travelland: div.unit)."""
    out = []
    for u in soup.select("div.unit"):
        t = u.find(["h2", "h3", "h4", "h5"])
        tot = u.select_one(".unit-price-total")
        if not t or not tot or not tot.get("data-unitpricetotal"):
            continue
        old = u.select_one(".unit-price-old")
        line = f"{t.get_text(' ', strip=True)}: {tot['data-unitpricetotal']} po osobi"
        if old and old.get("data-unitpriceold") and old["data-unitpriceold"] != tot["data-unitpricetotal"]:
            line += f" (bilo {old['data-unitpriceold']})"
        out.append(line)
    return "\n".join(out)


def extract(html: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    polasci, sobe = _polasci(soup), _sobe(soup)
    meta = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", attrs={"property": "og:description"})
    for t in soup(["script", "style", "noscript", "nav", "header", "footer", "form", "svg"]):
        t.decompose()
    h1 = soup.find("h1")
    out: dict = {
        "naslov": _text(h1) if h1 else "",
        "opis": (meta.get("content") or "").strip() if meta else "",
    }
    heads = soup.find_all(re.compile(r"^(h[1-6]|strong|b)$"))
    # pravi naslovi (h1–h6) pre podebljanog teksta: „Napomena:” usred programa nije sekcija napomena
    labels = sorted(((h, " ".join(h.get_text(" ", strip=True).lower().split())) for h in heads),
                    key=lambda x: 0 if re.fullmatch(r"h[1-6]", x[0].name or "") else 1)
    for key, words in SECTIONS.items():
        # reči su poređane po pouzdanosti: „cena ne uključuje” pre „doplate”, „plan puta” pre opšteg „program”
        for w in words:
            body = ""
            for h, label in labels:
                if len(label) >= 60 or w not in label:
                    continue
                if key == "program" and "fakultativ" in label:
                    continue  # „fakultativni program” nije plan puta
                body = _collect_after(h)
                if len(body) > 30:
                    out[key] = body
                    break
            if key in out:
                break
    # ista sekcija pod dva naslova (npr. napomene = obuhvata): ostavi prvu
    for k in list(out):
        if k not in ("naslov", "opis") and any(out[k][:200] == out[j][:200] for j in out if j != k and list(out).index(j) < list(out).index(k)):
            del out[k]
    # "termini" bez ijednog datuma (samo cene) ne znače ništa: zameni pravim polascima ili izbaci
    if "termini" in out and not _DATUM.search(out["termini"]):
        del out["termini"]
    if polasci:
        out["termini"] = polasci
    if sobe:
        out["sobe"] = sobe
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
        cached = json.loads(row[1])
        if cached.get("v") == VERZIJA:
            return cached
    try:
        data = extract(fetch(url))
    except BlockedByRobots:
        data = {"greska": "sajt ne dozvoljava automatsko čitanje ove stranice"}
    except Exception as e:  # mreža, 403...
        data = {"greska": f"stranica nije dostupna ({e.__class__.__name__})"}
    data["v"] = VERZIJA
    data["provereno"] = datetime.now().isoformat(timespec="minutes")
    if "greska" in data:
        return data  # greška se ne pamti, da sledeće otvaranje proba ponovo
    conn.execute("INSERT OR REPLACE INTO details VALUES (?,?,?)",
                 (offer_id, data["provereno"], json.dumps(data, ensure_ascii=False)))
    conn.commit()
    return data


__all__ = ["extract", "get", "db"]
