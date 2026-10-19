"""Felix Travel: `.tour-box` kartice sa cenom; datumi su na stranici ponude, ne na naslovnoj."""

from __future__ import annotations

from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..models import Offer, guess_transport, parse_nights, parse_price
from .base import Scraper


class Felix(Scraper):
    source = "felix"
    name = "Felix Travel"
    pages = ["https://www.felixtravel.rs/"]

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        offers: list[Offer] = []
        for box in soup.select(".tour-box"):
            a = box.select_one(".tour-title a[href]")
            if not a:
                continue
            title = " ".join(a.get_text(" ", strip=True).split())
            new = box.select_one(".tour-box-item-discount-price")
            prices = [p.get_text(" ", strip=True) for p in box.select(".tour-box-tours-item-price")]
            old = next((p for p in prices if p and (not new or p != new.get_text(" ", strip=True))), None)
            excerpt = box.select_one(".tour-box-standard-item-excerpt")
            href = urljoin(url, a["href"])
            dest = title.upper().replace("PUTOVANJE", "").split("20")[0].split("-")[0].strip(" –").title()
            offers.append(Offer(
                source=self.source, title=title, url=href, destination=dest,
                nights=parse_nights(title),
                transport=guess_transport(title + " " + href),
                price=parse_price(new.get_text(" ", strip=True) if new else None),
                old_price=parse_price(old),
                note=(excerpt.get_text(" ", strip=True)[:120] if excerpt else "") or "datumi na stranici ponude",
            ))
        return offers
