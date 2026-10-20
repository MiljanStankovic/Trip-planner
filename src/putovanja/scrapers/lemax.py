"""Agencije na istoj platformi kao Travelland (/putovanja/<dest>/<naziv>/<id>/).

Njihov sajt učitava listu ponuda sa `/services/list/` (JSON sa gotovim HTML-om kartica),
pa čitamo isto to: jedna strana sa svim putovanjima, svaka kartica sa polascima i cenom "od".
"""

from __future__ import annotations

import json
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..models import Offer, guess_transport, parse_nights, parse_price, upcoming
from .base import Scraper

_ISO = re.compile(r"\d{4}-\d{2}-\d{2}")


def _num(text: str) -> float | None:
    m = re.search(r"(\d[\d.,]*)", text or "")
    if not m:
        return None
    v = m.group(1).replace(".", "").replace(",", ".")
    try:
        return float(v)
    except ValueError:
        return None


class LemaxList(Scraper):
    """Podklase daju `source`, `name` i `site` (npr. https://www.vivatravel.rs)."""

    site = ""
    groups = (6,)  # 6 = putovanja (ture, gradovi, praznici)
    delay_s = 1.0

    @property
    def pages(self) -> list[str]:  # type: ignore[override]
        return [f"{self.site}/services/list/?objectGroupId={g}&perPage=100&_page={p}"
                for g in self.groups for p in (1, 2)]

    def parse(self, html: str, url: str) -> list[Offer]:
        try:
            data = json.loads(html)
        except ValueError:
            return []
        return self.parse_cards(data.get("html") or "", self.site + "/")

    def parse_cards(self, html: str, base: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        offers: list[Offer] = []
        for a in soup.select("a[href*='/putovanja/']"):
            if "card" not in " ".join(a.get("class", [])):
                continue
            href = urljoin(base, a["href"].split("#")[0])
            head = a.find(["h2", "h3", "h4", "h5"])
            title = head.get_text(" ", strip=True) if head else ""
            if not title:
                continue
            text = a.get_text(" ", strip=True)

            dates: list[str] = []
            for el in a.select("[data-datefrom], [data-href*='dateFrom']"):
                d = el.get("data-datefrom") or ""
                if not _ISO.fullmatch(d):
                    m = re.search(r"dateFrom=(\d{4}-\d{2}-\d{2})", el.get("data-href", ""))
                    d = m.group(1) if m else ""
                if d and d not in dates:
                    dates.append(d)
            first, rest = upcoming(dates)
            if dates and not first:
                continue  # svi polasci prošli

            price_el = a.select_one(".unit-price-total") or a.select_one("span.h4, .text-danger")
            old_el = a.select_one("del")
            price_txt = price_el.get_text(" ", strip=True) if price_el else ""
            price = parse_price(price_txt) or _num(price_txt)
            old = _num(old_el.get_text(" ", strip=True)) if old_el else None
            currency = "RSD" if re.search(r"din|rsd", price_txt, re.I) else "EUR"

            icon = " ".join(" ".join(i.get("class", [])) for i in a.select("i[class*='la-']"))
            transport = "avion" if "la-plane" in icon else "autobus" if "la-bus" in icon else guess_transport(text)

            parts = [p for p in href.split("/putovanja/", 1)[-1].split("/") if p]
            dest = parts[0].replace("-", " ").title() if parts else title

            offers.append(Offer(
                source=self.source, title=title, url=href, destination=dest,
                date_from=first, extra_dates=rest, nights=parse_nights(text), transport=transport,
                price=price, old_price=old if old and price and old > price else None, currency=currency,
                note="cena 'od'",
            ))
        return offers


class VivaTravel(LemaxList):
    source = "viva"
    name = "Viva Travel"
    site = "https://www.vivatravel.rs"


class Rapsody(LemaxList):
    source = "rapsody"
    name = "Rapsody Travel"
    site = "https://www.rapsodytravel.rs"


class Go2(LemaxList):
    source = "go2"
    name = "Go2 Travelling"
    site = "https://go2travelling.net"
