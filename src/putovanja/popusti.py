"""Popusti i doplate za više osoba, izvučeni iz teksta ponude (opis, napomene, šta cena ne obuhvata).

Vraća kratke oznake za pano, npr. "3. osoba: −10 €", "deca do 12 god.: −20 €", "1/1 soba: +50%",
"rani booking". Ako agencija ništa od toga ne piše, lista je prazna: ništa se ne izmišlja.
Cene fakultativnih izleta ("40 € / 30 € deca") se ne računaju kao popust.
"""

from __future__ import annotations

import re

_IZNOS = r"(\d+(?:[.,]\d+)?)\s*(%|€|eur|evra|din)"
_SEKCIJE = ("ne_obuhvata", "napomene", "sobe", "termini", "obuhvata", "opis", "tekst")
_FAKULTATIV = re.compile(r"fakultativ|izlet|ulaznic|obilazak|večer|vece|tura\b|krstarenje brodom", re.I)


def _iznos(s: str) -> str:
    m = re.search(_IZNOS, s, re.I)
    if not m:
        return ""
    broj, jed = m.group(1).replace(",", "."), m.group(2).lower()
    try:
        f = float(broj)
        broj = str(int(f)) if f == int(f) else f"{f:g}"
    except ValueError:
        pass
    return f"{broj}{'%' if jed == '%' else ' €' if jed in ('€', 'eur', 'evra') else ' din'}"


def _uzrast(s: str) -> str:
    m = re.search(r"od\s*(\d{1,2})\s*(?:do|-)\s*(\d{1,2})", s, re.I) or re.search(r"(\d{1,2})\s*-\s*(\d{1,2})\s*god", s, re.I)
    if m:
        return f"{m.group(1)}–{m.group(2)} god."
    m = re.search(r"do\s*(\d{1,2})\s*(?:\.|god|g\b)", s, re.I)
    return f"do {m.group(1)} god." if m else ""


def _redovi(tekst: str) -> list[str]:
    return [r.strip(" -*•\t") for r in re.split(r"[\n;]|(?<=\.)\s+(?=[A-ZČĆŠĐŽ])", tekst or "") if r.strip()]


def iz_teksta(tekst: str) -> list[str]:
    out: list[str] = []

    def dodaj(x: str) -> None:
        if x and x not in out:
            out.append(x)

    for r in _redovi(tekst):
        low = r.lower()
        if len(low) > 260:
            continue
        ima_popust = re.search(r"popust|umanjen|plaća(ju)?\s*\d|besplatn|gratis|free", low)
        if re.search(r"(treć[aei]|\b3\.)\s*(odrasl\w*\s*)?(osob|lic|odrasl)", low) and ima_popust:
            iz = _iznos(low)
            dodaj(f"3. osoba: −{iz}" if iz else "popust za 3. osobu")
            continue
        if re.search(r"\b(dec[aeiu]|dete|deteta|dečij\w*)\b", low) and ima_popust and not _FAKULTATIV.search(low) \
                and not re.search(r"\d+\s*€\s*/\s*\d+\s*€", low):
            if re.search(r"besplatn|gratis|free", low) and not re.search(r"plaća(ju)?\s*\d|popust", low):
                uz = _uzrast(low)
                dodaj(f"deca {uz} besplatno".replace("  ", " ") if uz else "deca besplatno")
            else:
                uz, iz = _uzrast(low), _iznos(low)
                if "plaća" in low and iz.endswith("%"):
                    dodaj(f"deca {uz}: {iz} cene".replace("  ", " ").replace("deca :", "deca:"))
                else:
                    dodaj((f"deca {uz}: −{iz}" if iz else f"popust za decu {uz}").replace("  ", " ").strip().replace("deca :", "deca:"))
            continue
        if re.search(r"1/1|jednokrevet", low) and re.search(r"doplat", low):
            iz = _iznos(low)
            dodaj(f"1/1 soba: +{iz}" if iz else "doplata za 1/1 sobu")
            continue
        if re.search(r"grup", low) and ima_popust and not _FAKULTATIV.search(low):
            dodaj("popust za grupe")
            continue
    for r in _redovi(tekst):
        low = r.lower()
        if re.search(r"first\s*minute|rani\s*booking|early\s*booking|ranu\s*uplat", low):
            dodaj("rani booking")
            break
    return out[:5]


def iz_soba(sobe: str) -> list[str]:
    """Iz cena po tipu sobe: doplata za jednokrevetnu i popust za pomoćni ležaj / treći krevet."""
    cene: dict[str, float] = {}
    for r in _redovi(sobe):
        low = r.lower()
        m = re.search(r"(?:€|eur)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:€|eur)", low)
        if not m:
            continue
        broj = m.group(1) or m.group(2)
        broj = broj.replace(".", "") if re.fullmatch(r"\d{1,3}(\.\d{3})+", broj) else broj.replace(",", ".")
        v = float(broj)
        tip = "1/1" if re.search(r"jednokrevet|1/1", low) else "pom" if re.search(r"pomoćn|pomocn|treći krevet|1/2\+1|trokrevet", low) \
            else "2" if re.search(r"dvokrevet|1/2|francusk|twin", low) else ""
        if tip and tip not in cene:
            cene[tip] = v
    out = []
    dvo = cene.get("2")
    if dvo and cene.get("1/1", 0) > dvo:
        out.append(f"1/1 soba: +{round(cene['1/1'] - dvo)} €")
    if dvo and 0 < cene.get("pom", dvo) < dvo:
        out.append(f"pomoćni ležaj: −{round(dvo - cene['pom'])} €")
    return out


def iz_detalja(detalji: dict | None) -> list[str]:
    if not detalji:
        return []
    tekst = "\n".join(str(detalji.get(k) or "") for k in _SEKCIJE if k != "sobe")
    out = iz_teksta(tekst)
    for x in iz_soba(str(detalji.get("sobe") or "")):
        if x.startswith("1/1"):
            if any(y.startswith("1/1") for y in out):
                continue
            out = [y for y in out if y != "doplata za 1/1 sobu"]
        if x not in out:
            out.append(x)
    return out[:5]


def iz_ponude(note: str, title: str = "") -> list[str]:
    """Oznake koje se vide već sa liste (bez otvaranja ponude)."""
    s = f"{note or ''} {title or ''}".lower()
    out = []
    if re.search(r"first\s*minute|rani\s*booking|early\s*booking", s):
        out.append("rani booking")
    if re.search(r"poslednj\w* mest|last\s*minute", s):
        out.append("poslednja mesta")
    return out
