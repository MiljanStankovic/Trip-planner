"""I Travel (itravel.rs): daleke destinacije (Maldivi, Sejšeli, Mauricijus, Bali, Šri Lanka, Vijetnam, Aruba...).

Na stranicama "best seller" po destinaciji stoje primeri ponuda po mesecima ("MALDIVI 7 noći decembar",
"Decembar 2026.", "2001€"). Datum polaska se bira sam, pa je polazak = početak meseca, uz napomenu.
Spisak tih stranica čitamo iz njihove mape sajta, da nove destinacije uđu same.
"""

from __future__ import annotations

import re
import time
from datetime import date

import requests

from ..models import Offer, parse_nights, parse_price
from .base import BlockedByRobots, ScrapeResult, Scraper, fetch

SITEMAP = "https://itravel.rs/page-sitemap.xml"
MESECI = {"januar": 1, "februar": 2, "mart": 3, "april": 4, "maj": 5, "jun": 6, "jul": 7, "avgust": 8,
          "septembar": 9, "oktobar": 10, "novembar": 11, "decembar": 12}


def mesec_u_datum(label: str, today: date | None = None) -> str | None:
    m = re.search(r"([A-Za-zčćžšđČĆŽŠĐ]+)\s+(\d{4})", label or "")
    if not m or m.group(1).lower() not in MESECI:
        return None
    d = date(int(m.group(2)), MESECI[m.group(1).lower()], 1)
    t = today or date.today()
    if (d.year, d.month) < (t.year, t.month):
        return None
    return max(d, t).isoformat()


class ITravel(Scraper):
    source = "itravel"
    name = "I Travel"
    delay_s = 1.0
    pages: list[str] = []

    def run(self) -> ScrapeResult:
        res = ScrapeResult(self.source)
        try:
            xml = fetch(SITEMAP)
            self.pages = [u for u in re.findall(r"<loc>(.*?)</loc>", xml) if "best-seller" in u]
        except (requests.RequestException, BlockedByRobots) as e:
            res.errors.append(f"{SITEMAP}: {e}")
            return res
        for i, url in enumerate(self.pages):
            if i:
                time.sleep(self.delay_s)
            try:
                html = fetch(url)
            except (requests.RequestException, BlockedByRobots) as e:
                res.errors.append(f"{url}: {e}")
                continue
            res.offers.extend(self.parse(html, url))
        return res

    def parse(self, html: str, url: str) -> list[Offer]:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, "html.parser")
        offers = []
        for it in soup.select(".qode-tours-row-item"):
            link = it.select_one("a[href*='/tour-item/']")
            title_el = it.select_one(".qode-tour-title")
            if not link or not title_el:
                continue
            title = title_el.get_text(" ", strip=True)
            label = it.select_one(".qode-tour-item-label")
            d = mesec_u_datum(label.get_text(" ", strip=True) if label else title)
            if not d:
                continue
            price_el = it.select_one(".qode-tours-item-price")
            cat = next((c[len("tour-category-"):] for c in it.get("class", [])
                        if c.startswith("tour-category-") and "best-seller" not in c), "")
            dest = cat.replace("-", " ").title() or title.split()[0].title()
            offers.append(Offer(
                source=self.source, title=title.title(), url=link["href"], destination=dest,
                date_from=d, nights=parse_nights(title), transport="avion",
                price=parse_price(price_el.get_text(" ", strip=True)) if price_el else None,
                note="primer ponude: dan polaska po izboru u tom mesecu",
            ))
        return offers
