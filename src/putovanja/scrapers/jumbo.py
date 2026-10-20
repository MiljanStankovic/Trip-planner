"""Jumbo Travel (jumbo.rs): tropske destinacije, paket aranžmani (let + hotel), cena po osobi "od".

Polazak se bira sam (paket bez fiksnog datuma), pa ponude nemaju datum; vide se po zemljama.
Spisak zemalja čitamo sa stranice /tropske-destinacije/.
"""

from __future__ import annotations

import re
import time

import requests
from bs4 import BeautifulSoup

from ..models import Offer, parse_nights
from .base import BlockedByRobots, ScrapeResult, Scraper, fetch

INDEX = "https://www.jumbo.rs/tropske-destinacije/"


class Jumbo(Scraper):
    source = "jumbo"
    name = "Jumbo Travel"
    delay_s = 1.0
    pages: list[str] = []

    def run(self) -> ScrapeResult:
        res = ScrapeResult(self.source)
        try:
            soup = BeautifulSoup(fetch(INDEX), "html.parser")
        except (requests.RequestException, BlockedByRobots) as e:
            res.errors.append(f"{INDEX}: {e}")
            return res
        self.pages = sorted({a["href"] for a in soup.find_all("a", href=True)
                             if "destinacija_za_tropsko_letovanje/" in a["href"]})
        seen: set[str] = set()
        for i, url in enumerate(self.pages):
            if i:
                time.sleep(self.delay_s)
            try:
                html = fetch(url)
            except (requests.RequestException, BlockedByRobots) as e:
                res.errors.append(f"{url}: {e}")
                continue
            for o in self.parse(html, url):
                if o.url not in seen:
                    seen.add(o.url)
                    res.offers.append(o)
        return res

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        country = url.rstrip("/").rsplit("/", 1)[-1].replace("-", " ").title()
        offers = []
        for it in soup.select(".pt-cv-content-item"):
            a = it.select_one(".pt-cv-title a[href]")
            if not a:
                continue
            title = a.get_text(" ", strip=True)
            opis_el = it.select_one(".pt-cv-ctf-opis_aranzmana")
            opis = opis_el.get_text(" ", strip=True) if opis_el else ""
            cena_el = it.select_one(".pt-cv-ctf-cena_po_osobi")
            m = re.search(r"\d[\d.]*", cena_el.get_text(" ", strip=True)) if cena_el else None
            price = float(m.group(0).replace(".", "")) if m else None
            paket = bool(re.search(r"paket|avio|\blet\b", f"{title} {opis}", re.I))
            if not paket:
                # samo hotel (bez leta): sajt piše „cene po osobi već od 42”, a to je cena smeštaja (verovatno po noćenju), ne aranžmana.
                # Takva cena se ne poredi sa paketima, pa ide u napomenu, a cena ostaje „na upit”.
                napomena = (f"samo smeštaj, bez leta; sajt navodi „od {m.group(0)} € po osobi” (cena smeštaja, ne aranžmana). " if price else "samo smeštaj, bez leta. ") + opis
                offers.append(Offer(
                    source=self.source, title=title, url=a["href"], destination=country,
                    date_from=None, nights=None, transport=None, price=None, note=napomena[:200],
                ))
                continue
            offers.append(Offer(
                source=self.source, title=title, url=a["href"], destination=country,
                date_from=None, nights=parse_nights(opis) or parse_nights(title), transport="avion",
                price=price, note=("paket let + hotel, datum po izboru. " + opis)[:200],
            ))
        return offers
