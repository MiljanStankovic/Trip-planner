"""Lider Travel: kalendar putovanja na početnoj (`a.ltcal__row`): datum, naziv | trajanje, cena „od N€” ili „na upit”."""

from __future__ import annotations

import re
from datetime import date, datetime, timezone

from bs4 import BeautifulSoup

from ..models import Offer, parse_price, upcoming
from .base import Scraper

_KRAJ = re.compile(r"-\s*(\d{1,2})\.(\d{1,2})")


class Lider(Scraper):
    source = "lider"
    name = "Lider Travel"
    pages = ["https://lidertravel.rs/"]

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        offers: list[Offer] = []
        for row in soup.select("a.ltcal__row"):
            strong = row.select_one(".ltcal__destination-copy strong")
            if not strong or not row.get("href"):
                continue
            naslov = " ".join(strong.get_text(" ", strip=True).split())
            ime, _, trajanje = naslov.rpartition("|")
            ime = ime.strip(" |") or naslov
            try:
                start = datetime.fromtimestamp(int(row["data-start"]), timezone.utc).date()
            except (KeyError, ValueError):
                continue
            first, _ = upcoming([start.isoformat()])
            if not first:
                continue  # polazak je prošao
            kraj = None
            m = _KRAJ.search(row.select_one(".ltcal__date").get_text(" ", strip=True)) if row.select_one(".ltcal__date") else None
            if m:
                d, mo = int(m.group(1)), int(m.group(2))
                try:
                    k = date(start.year + (1 if mo < start.month else 0), mo, d)
                    kraj = k.isoformat() if k >= start else None
                except ValueError:
                    kraj = None
            n = re.search(r"(\d+)\s*no[ćc]", trajanje, re.I)
            nights = int(n.group(1)) if n else 0 if re.search(r"bez\s+no[ćc]", trajanje, re.I) else None
            cena = row.select_one(".ltcal__price")
            price = parse_price(cena.get_text(" ", strip=True)) if cena else None
            transport = "avion" if re.search(r"avion", naslov, re.I) else "autobus"
            offers.append(Offer(
                source=self.source, title=ime, url=row["href"], destination=ime,
                date_from=first, date_to=kraj, nights=nights, transport=transport,
                price=price, currency="EUR",
                note=("jednodnevni izlet" if nights == 0 else "cena 'od'") if price else "cena na upit",
            ))
        return offers
