"""Grand Tours: `article.tour_item` sa terminom i cenom u opisu (EUR ili dinari). Ima i jednodnevne izlete."""

from __future__ import annotations

import re

from bs4 import BeautifulSoup

from ..models import Offer, guess_transport, parse_dates, parse_nights, parse_price, upcoming
from .base import Scraper

_RANGE = re.compile(r"(?<!\d)(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})\.?(\d{4})?")
_RSD = re.compile(r"(\d[\d.]*)\s*din", re.I)


class GrandTours(Scraper):
    source = "grandtours"
    name = "Grand Tours"
    pages = ["https://grandtours.rs/"]

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        offers: list[Offer] = []
        for art in soup.select("article.tour_item"):
            link = art.select_one("h3 a[href]")
            if not link:
                continue
            title = " ".join(link.get_text(" ", strip=True).split())
            addr = art.select_one(".address")
            place = addr.get_text(" ", strip=True) if addr else ""
            desc_el = art.select_one(".description")
            desc = " ".join(desc_el.get_text(" ", strip=True).split()) if desc_el else ""

            # "11-14.11.2026" -> polazak 11.11.2026, povratak 14.11.2026
            date_from = date_to = None
            extra: list[str] = []
            m = _RANGE.search(desc)
            if m:
                d1, d2, mon, yr = m.groups()
                start = parse_dates(f"{d1}.{mon}.{yr or ''}")
                end = parse_dates(f"{d2}.{mon}.{yr or ''}")
                date_from = start[0] if start else None
                date_to = end[0] if end else None
            else:
                date_from, extra = upcoming(parse_dates(desc))

            price, currency = parse_price(desc), "EUR"
            if price is None:
                r = _RSD.search(desc)
                if r:
                    price, currency = float(r.group(1).replace(".", "")), "RSD"

            is_daytrip = "izlet" in title.lower()
            offers.append(Offer(
                source=self.source, title=f"{title} – {desc}"[:160], url=link["href"],
                destination=place.split(",")[0].strip() or title,
                date_from=date_from, date_to=date_to, extra_dates=extra,
                nights=0 if is_daytrip else parse_nights(title + " " + desc),
                transport=guess_transport(title + " " + desc) or "autobus",
                price=price, currency=currency,
                note="jednodnevni izlet" if is_daytrip else "",
            ))
        return offers
