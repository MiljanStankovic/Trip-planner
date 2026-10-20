"""Oktopod Travel: evropski gradovi i praznici (stranice `/sr/evropski-gradovi/<naziv>/<id>`), linkovi sa početne.

Letovanje po hotelima (`/sr/putovanje/...`) se preskače: cena je po noćenju, ne aranžman.
Detalj: „Prevoz: Autobusom  6 dana | 3 noći  Cena po osobi: od 269€”, polasci u programu („1. dan 29.12.2026.”).
"""

from __future__ import annotations

import re
import time
from datetime import date, timedelta

from bs4 import BeautifulSoup

from ..models import Offer, parse_dates, parse_price, upcoming
from .base import BlockedByRobots, ScrapeResult, Scraper, fetch

SITE = "https://www.oktopod.rs"
_LINK = re.compile(r'href="(/sr/evropski-gradovi/[a-z0-9-]+/\d+)"')
_PRVI_DAN = re.compile(r"\b1\.\s*dan\s+(\d{1,2})\.(\d{1,2})\.(\d{4})")
_TRAJANJE = re.compile(r"(\d+)\s*dana?\s*\|\s*(\d+)\s*no[ćc]", re.I)


class Oktopod(Scraper):
    source = "oktopod"
    name = "Oktopod Travel"
    pages: list[str] = [SITE + "/"]
    delay_s = 1.5

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        h1 = soup.select_one("h1")
        title = " ".join(h1.get_text(" ", strip=True).split()) if h1 else ""
        for x in soup(["script", "style"]):
            x.decompose()
        text = " ".join(soup.get_text(" ", strip=True).split())
        if not title or "Strana ne postoji" in text[:300]:
            return []

        i = text.find("Prevoz:")
        glava = text[i:i + 400] if i >= 0 else ""
        polasci: list[str] = []
        seg = re.search(r"Polasci:(.*?)Cena po osobi", glava)
        if seg:
            polasci = list(dict.fromkeys(parse_dates(seg.group(1))))
        if not polasci:  # u programu: „1. dan 29.12.2026.”
            for d, m, y in _PRVI_DAN.findall(text):
                try:
                    iso = date(int(y), int(m), int(d)).isoformat()
                except ValueError:
                    continue
                if iso not in polasci:
                    polasci.append(iso)
        first, rest = upcoming(polasci)
        if polasci and not first:
            return []  # svi polasci su prošli

        tr = _TRAJANJE.search(glava)
        nights = int(tr.group(2)) if tr else 0 if re.search(r"izlet|jednodnev", title, re.I) else None
        m = re.search(r"Cena po osobi:\s*od\s*([\d.,]+)\s*€", glava or text)
        price = parse_price(f"€{m.group(1)}") if m else None
        if price is None and not first:
            return []

        prevoz = "avion" if re.search(r"avion", glava, re.I) else "autobus" if re.search(r"autobus", glava + title, re.I) else None
        end = (date.fromisoformat(first) + timedelta(days=nights)).isoformat() if first and nights else None
        return [Offer(
            source=self.source, title=title, url=url, destination=re.sub(r"\s*(autobusom|avionom).*$", "", title, flags=re.I).strip() or title,
            date_from=first, date_to=end, extra_dates=rest, nights=nights, transport=prevoz,
            price=price, currency="EUR", note="jednodnevni izlet" if nights == 0 else "cena 'od'",
        )]

    def run(self) -> ScrapeResult:
        res = ScrapeResult(self.source)
        try:
            adrese = list(dict.fromkeys(SITE + p for p in _LINK.findall(fetch(SITE + "/"))))
        except BlockedByRobots:
            res.errors.append("robots.txt ne dozvoljava čitanje, preskočeno")
            return res
        except Exception as e:  # noqa: BLE001
            res.errors.append(f"početna: {e}")
            return res
        seen: set[str] = set()
        for url in adrese:
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
