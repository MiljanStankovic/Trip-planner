"""Ponte Travel: spisak aranžmana iz sitemapa (`onesystem_package-sitemap.xml`), pa svaka stranica posebno.

Naslov nosi datum i trajanje ("... 30.12.2026.-06.01.2027. 8 DANA/ 7 NOćI"), a cena stoji u tabeli
"Prices are in EUR per/person ... Po osobi u dvokrevetnoj sobi 1,390.00".
"""

from __future__ import annotations

import re
import time
from datetime import date

from bs4 import BeautifulSoup

from ..models import Offer, guess_transport, parse_dates, parse_nights, upcoming
from .base import BlockedByRobots, ScrapeResult, Scraper, fetch

SITEMAP = "https://www.ponte.rs/onesystem_package-sitemap.xml"
_PO_OSOBI = re.compile(r"Po osobi[^\d]{0,60}([\d][\d.,]*)", re.I)
_POLAZAK = re.compile(r"Polazak\s+(\d{1,2})/(\d{1,2})(?:/(\d{4}))?", re.I)
_SLUG_DATUM = re.compile(r"(\d{2})-(\d{2})-(\d{4})")


def _iznos(raw: str) -> float | None:
    raw = raw.strip(".,")
    if re.fullmatch(r"\d{1,3}(,\d{3})+(\.\d+)?", raw):  # 1,390.00
        raw = raw.replace(",", "")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+(,\d+)?", raw):  # 1.390,00
        raw = raw.replace(".", "").replace(",", ".")
    else:
        raw = raw.replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def _polasci(tekst: str, today: date) -> list[str]:
    """'Polazak 30/12' bez godine: prvi datum koji nije u prošlosti."""
    out: list[str] = []
    for d, m, y in _POLAZAK.findall(tekst):
        godine = [int(y)] if y else [today.year, today.year + 1]
        for g in godine:
            try:
                iso = date(g, int(m), int(d)).isoformat()
            except ValueError:
                continue
            if iso >= today.isoformat():
                if iso not in out:
                    out.append(iso)
                break
    return out


def _prevoz(title: str, text: str) -> str | None:
    t = text.lower()
    if "avionski prevoz" in t or "avionom" in title.lower():
        return "avion"
    if "autobuski prevoz" in t or "autobusom" in t:
        return "autobus"
    return guess_transport(title)


class Ponte(Scraper):
    source = "ponte"
    name = "Ponte Travel"
    pages: list[str] = []
    delay_s = 1.5

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        for x in soup(["script", "style"]):
            x.decompose()
        h = soup.select_one("h1") or soup.select_one("title")
        title = " ".join((h.get_text(" ", strip=True) if h else "").split())
        text = " ".join(soup.get_text(" ", strip=True).split())
        if not title or title.lower().startswith("tour packages"):
            m = re.search(r"([A-ZŠĐČĆŽ][A-ZŠĐČĆŽ .&/-]{6,}\s+\d{1,2}\.\d{1,2}\.[^.]{0,40}?(?:NO[ĆC]I|noći))", text)
            title = m.group(1).strip() if m else ""
        if not title:
            return []

        today = date.today()
        # cena samo iz cenovnika ("Prices are in EUR per/person ... Po osobi u dvokrevetnoj sobi 1,390.00")
        i = text.find("Prices are in")
        m = _PO_OSOBI.search(text[i:i + 1500]) if i >= 0 else None
        price = _iznos(m.group(1)) if m else None
        if price is not None and price < 20:
            price = None  # ne liči na cenu aranžmana

        dates = parse_dates(title)
        if not dates:
            s = _SLUG_DATUM.search(url)
            if s:
                dates = [f"{s.group(3)}-{s.group(2)}-{s.group(1)}"]
        kraj = dates[1] if len(dates) == 2 else None  # "30.12.2026.-06.01.2027."
        if dates:
            first, rest = upcoming(dates[:1] if kraj else dates)
            if not first:
                return []  # termin je prošao (stare stranice ostaju u sitemapu)
        else:
            more = _polasci(text[i:i + 1500], today) if i >= 0 else []
            first, rest = (more[0], more[1:]) if more else (None, [])
        if not first and price is None:
            return []  # sezonska stranica bez termina i cene: nema šta da se pokaže

        dest = re.split(r"\s+\d", title, maxsplit=1)[0].strip(" -").title() or title
        return [Offer(
            source=self.source, title=title[:160], url=url, destination=dest,
            date_from=first, date_to=kraj if first else None, extra_dates=rest,
            nights=parse_nights(title),
            transport=_prevoz(title, text),
            price=price, currency="EUR", note="po osobi u dvokrevetnoj sobi" if price else "cena na upit",
        )]

    def _adrese(self) -> list[str]:
        xml = fetch(SITEMAP)
        urls = re.findall(r"<loc>\s*(https://www\.ponte\.rs/aranzmani/[^<\s]+/)\s*</loc>", xml)
        return list(dict.fromkeys(urls))

    def run(self) -> ScrapeResult:
        res = ScrapeResult(self.source)
        try:
            adrese = self._adrese()
        except BlockedByRobots:
            res.errors.append("sitemap: robots.txt ne dozvoljava čitanje")
            return res
        except Exception as e:  # noqa: BLE001 - mrežna greška ne sme da obori ceo sken
            res.errors.append(f"sitemap: {e}")
            return res
        seen: set[str] = set()
        for i, url in enumerate(adrese):
            if i:
                time.sleep(self.delay_s)
            try:
                html = fetch(url)
            except Exception as e:  # noqa: BLE001
                res.errors.append(f"{url}: {e}")
                continue
            for o in self.parse(html, url):
                if o.offer_id not in seen:
                    seen.add(o.offer_id)
                    res.offers.append(o)
        return res
