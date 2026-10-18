"""Halo Tours: kartice aranžmana (adventi, vikend ture) sa terminom i cenom u € ili dinarima."""

from __future__ import annotations

import re

from bs4 import BeautifulSoup

from ..models import Offer, parse_month_words, parse_price
from .base import Scraper


class HaloTours(Scraper):
    source = "halotours"
    name = "Halo Tours"
    pages = ["https://www.halotours.rs/"]

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        offers: list[Offer] = []
        for g in soup.select(".gdl-package-grid2, .gdl-package-grid"):
            link = g.select_one(".package-title a[href]")
            if not link:
                continue
            title = link.get_text(" ", strip=True)
            price_txt = (g.select_one(".package-price") or g).get_text(" ", strip=True)
            date_txt = g.select_one(".package-date")
            dates = parse_month_words(date_txt.get_text(" ", strip=True)) if date_txt else []
            price, currency = parse_price(price_txt), "EUR"
            if price is None:
                m = re.search(r"(\d[\d.]*)\s*din", price_txt, re.I)
                if m:
                    price, currency = float(m.group(1).replace(".", "")), "RSD"
            slug = link["href"].rstrip("/").split("/")[-1].replace("-", " ")
            nights = None
            if len(dates) >= 2:
                from datetime import date as _d
                nights = (_d.fromisoformat(dates[1]) - _d.fromisoformat(dates[0])).days
            offers.append(Offer(
                source=self.source, title=f"{slug.capitalize()} – {title}", url=link["href"],
                destination=title, date_from=dates[0] if dates else None,
                date_to=dates[1] if len(dates) > 1 else None, nights=nights,
                transport="autobus", price=price, currency=currency,
            ))
        return offers
