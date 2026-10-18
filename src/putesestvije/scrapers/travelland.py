"""Travelland: kartice `a.card-list-item` sa cenom u statičnom HTML-u."""

from __future__ import annotations

import re
from datetime import date
from urllib.parse import parse_qs, urljoin, urlsplit

from bs4 import BeautifulSoup

from ..models import Offer, guess_transport, parse_dates, parse_nights, parse_price
from .base import Scraper


class Travelland(Scraper):
    source = "travelland"
    name = "Travelland"
    pages = [
        "https://www.travelland.rs/",  # HIT ponude sa cenama
        "https://www.travelland.rs/specijalna-ponuda/",
        "https://www.travelland.rs/praznici/",
    ]

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        offers: list[Offer] = []
        for a in soup.select("a.card-list-item[href]"):
            href = urljoin(url, a["href"].split("#")[0])
            q = parse_qs(urlsplit(href).query)
            d_from = (q.get("dateFrom") or [None])[0]
            d_to = (q.get("dateTo") or [None])[0]

            title_el = a.select_one(".title")
            title = title_el.get_text(" ", strip=True) if title_el else a.get_text(" ", strip=True)[:120]
            bold = a.select_one(".fw-bold")
            heading = bold.get_text(" ", strip=True) if bold else ""
            full_title = f"{heading} – {title}" if heading else title

            price_el = a.select_one(".unit-price-total")
            old_el = a.select_one(".unit-price-old")
            icon = a.select_one("i[class*='la-']")
            icon_cls = " ".join(icon.get("class", [])) if icon else ""
            if "plane" in icon_cls:
                transport = "avion"
            elif "bus" in icon_cls:
                transport = "autobus"
            else:
                transport = guess_transport(full_title)

            if not d_from:
                dep = a.select_one(".departure")
                dates = parse_dates(dep.get_text(" ", strip=True)) if dep else []
                d_from = dates[0] if dates else None

            nights = parse_nights(full_title)
            if nights is None and d_from and d_to:
                try:
                    nights = (date.fromisoformat(d_to) - date.fromisoformat(d_from)).days
                except ValueError:
                    pass

            dest = ""
            if heading:
                # "EGIPAT - Hurgada 6 noći" -> "Hurgada"
                part = re.split(r"\s[-–]\s", heading)[-1]
                dest = re.sub(r"\s*\d+\s*no[ćc]i?.*$", "", part, flags=re.I).strip()
            if not dest:
                path_parts = [p for p in urlsplit(href).path.split("/") if p]
                dest = path_parts[1].replace("-", " ").title() if len(path_parts) > 1 else ""

            offers.append(
                Offer(
                    source=self.source,
                    title=full_title,
                    url=href,
                    destination=dest,
                    date_from=d_from,
                    date_to=d_to,
                    nights=nights,
                    transport=transport,
                    price=parse_price(price_el.get_text(" ", strip=True) if price_el else None),
                    old_price=parse_price(old_el.get_text(" ", strip=True) if old_el else None),
                )
            )
        return offers
