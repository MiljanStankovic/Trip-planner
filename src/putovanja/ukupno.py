"""Procena ukupne cene aranžmana za sve putnike: osnovna cena + takse i obavezne doplate.

Čita tekst "cena ne obuhvata" i napomene sa sajta agencije i traži iznose sa jedinicom
(po osobi, po noćenju, dnevno). Ovo je procena: agencije pišu različito, pa se uvek
prikazuje i odakle je koja stavka, a fakultativno se ne sabira.
"""

from __future__ import annotations

import re
from datetime import date

_IZNOS = re.compile(r"(?:(?:€|eur)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:€|eur\b|evra))", re.I)
_DIN = re.compile(r"(\d[\d.]*(?:,\d+)?)\s*(?:din|rsd)", re.I)

# deca, treća osoba i jednokrevetna soba ne važe za par koji deli sobu
ZA_DRUGE = ("dete ", "deca", "decu", "dece", "treća", "treca", "3. osoba", "1/1", "jednokrevet", "infant", "beb")
PRESKOCI = ("polis", "garanc", "insolvent", "depozit", "rata", "ratama", "uplat", "prazan ležaj", "prazan lezaj",
            "suma osiguranja do", "kurs", "nbs", "otkaz", "penal")


def _broj(s: str) -> float:
    return float(s.replace(".", "").replace(",", ".")) if s.count(".") and "," in s else float(s.replace(",", "."))


def _dani(offer: dict) -> int | None:
    if offer.get("_dani"):
        return offer["_dani"]
    try:
        if offer.get("date_from") and offer.get("date_to"):
            return (date.fromisoformat(offer["date_to"]) - date.fromisoformat(offer["date_from"])).days + 1
    except ValueError:
        pass
    return offer["nights"] + 1 if offer.get("nights") is not None else None


def _stavka(line: str, offer: dict, osobe: int, kontekst: str) -> dict | None:
    low = line.lower()
    m0 = _IZNOS.search(line) or _DIN.search(line)
    pre = low[: m0.start()] if m0 else low
    if any(w in low for w in PRESKOCI) or any(w in pre for w in ZA_DRUGE):
        return None
    m = _IZNOS.search(line)
    valuta = "EUR"
    if m:
        iznos = _broj(m.group(1) or m.group(2))
    else:
        d = _DIN.search(line)
        if not d:
            return None
        iznos, valuta = _broj(d.group(1).replace(".", "")), "RSD"
    if iznos <= 0 or iznos > 5000:
        return None

    if "taks" in low or kontekst == "taksa":
        tip = "obavezno"
    elif "osigur" in low:
        tip = "obavezno" if "obavez" in low else "preporučeno"
    elif "administrativ" in low or "obrade rezerv" in low or "obavezn" in low:
        tip = "obavezno"
    elif kontekst == "fakultativno" or "fakultativ" in low or "izlet" in low or "ulaznic" in low:
        tip = "opciono"
    elif "doplat" in low or "1/1" in low or "jednokrevet" in low:
        tip = "opciono"
    else:
        tip = "opciono"

    noci, dani = offer.get("nights"), _dani(offer)
    puta, racun = 1, f"{iznos:g} {'€' if valuta == 'EUR' else 'din'}"
    if tip != "opciono" and re.search(r"po\s*(no[ćc]enju|no[ćc]i)|/\s*no[ćc]", low) and noci:
        puta *= noci
        racun += f" × {noci} noći"
    elif tip != "opciono" and re.search(r"dnevno|po\s*danu|/\s*dan|na\s*dan", low) and dani:
        puta *= dani
        racun += f" × {dani} dana"
    if "po sobi" not in low and "po apartmanu" not in low and "po rezervacij" not in low:
        puta *= osobe
        racun += f" × {osobe} os."
    naziv = re.sub(r"^[\s•*\-–]+", "", line).strip()
    naziv = _IZNOS.sub("", naziv)
    naziv = re.sub(r"\b(po\s+(osobi|no[ćc]enju|no[ćc]i|danu|sobi)|dnevno|u iznosu od|iznosi|od)\b|/", " ", naziv, flags=re.I)
    naziv = re.sub(r"\s*\([^)]*\d[^)]*\)?", "", naziv)
    naziv = re.split(r"\.\s|\s*suma\b|;", naziv, flags=re.I)[0]
    naziv = re.sub(r"[,.;]{2,}|,\s*$", "", naziv)
    naziv = re.sub(r"\s{2,}", " ", naziv).strip(" –-:,")
    if kontekst == "taksa" and "taks" not in naziv.lower():
        naziv = "Boravišna taksa (" + naziv[:30] + ")"
    naziv = re.split(r"[:(,–-]\s|\s(?:u iznosu|od)\s", naziv)[0].strip()[:48] or "stavka"
    if any(w in naziv.lower() for w in ZA_DRUGE + ("vrtić", "vrtic")):
        return None
    return {"naziv": naziv[0].upper() + naziv[1:], "iznos": round(iznos * puta, 2), "valuta": valuta,
            "racun": racun, "tip": tip, "izvor": line.strip()[:160]}


def proceni(offer: dict, detalji: dict | None, osobe: int = 2) -> dict | None:
    if not offer.get("price"):
        return None
    # trajanje sa sajta (npr. "21.10.2026. – 25.10.2026."), jer autobuske ture imaju noćnu vožnju
    if detalji and offer.get("date_from"):
        y, m, d = offer["date_from"].split("-")
        mm = re.search(rf"{d}\.{m}\.{y}\.\s*–\s*(\d\d)\.(\d\d)\.(\d{{4}})", detalji.get("termini", ""))
        if mm:
            try:
                kraj = date(int(mm.group(3)), int(mm.group(2)), int(mm.group(1)))
                offer = {**offer, "_dani": (kraj - date.fromisoformat(offer["date_from"])).days + 1}
            except ValueError:
                pass
    valuta = offer.get("currency") or "EUR"
    osnovno = offer["price"] * osobe
    stavke: list[dict] = []
    vidjeno: set[str] = set()
    tekst = "\n".join((detalji or {}).get(k, "") for k in ("ne_obuhvata", "napomene"))
    kontekst = ""
    for line in tekst.split("\n"):
        low = line.lower().strip()
        if not low or low in vidjeno:
            continue
        vidjeno.add(low)
        if not _IZNOS.search(line) and not _DIN.search(line):
            # naslov bloka: menja kontekst za redove ispod njega
            if "fakultativ" in low:
                kontekst = "fakultativno"
            elif "taks" in low:
                kontekst = "taksa"
            elif low.endswith(":"):
                kontekst = ""
            continue
        s = _stavka(line, offer, osobe, kontekst)
        if not s:
            continue
        if kontekst == "taksa" and any(x["tip"] == "obavezno" and x["naziv"].startswith("Boravišna") for x in stavke):
            continue  # od više stopa takse uzmi prvu (zavisi od hotela)
        if not any(x["naziv"] == s["naziv"] and x["iznos"] == s["iznos"] for x in stavke):
            stavke.append(s)
    obavezne = [x for x in stavke if x["tip"] != "opciono"]
    stavke = obavezne + [x for x in stavke if x["tip"] == "opciono"][:8]

    def zbir(tipovi):
        return round(osnovno + sum(s["iznos"] for s in stavke if s["tip"] in tipovi and s["valuta"] == valuta), 2)

    return {
        "osobe": osobe, "valuta": valuta, "osnovno": round(osnovno, 2),
        "stavke": stavke[:14],
        "ukupno": zbir({"obavezno"}),
        "ukupno_sa_preporucenim": zbir({"obavezno", "preporučeno"}),
        "napomena": "procena iz teksta sa sajta agencije; fakultativno nije uračunato"
                    + ("" if detalji else "; detalji sa sajta još nisu pročitani"),
    }
