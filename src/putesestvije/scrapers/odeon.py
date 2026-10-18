"""Odeon World Travel: galerije `.HorizontalImageGallery` sa naslovom i datumom polaska."""

from __future__ import annotations

from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..models import Offer, guess_transport, parse_dates, parse_nights, parse_price, upcoming
from .base import Scraper


class Odeon(Scraper):
    source = "odeon"
    name = "Odeon World Travel"
    pages = [
        "https://www.odeontravel.rs/stranica/gradovi-evrope",
        "https://www.odeontravel.rs/stranica/kruzne-ture",
        "https://www.odeontravel.rs/stranica/wellness-and-spa",
    ]

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        offers: list[Offer] = []
        for item in soup.select(".HorizontalImageGallery li"):
            title_el = item.select_one(".title")
            link = item.select_one("a[href]")
            if not title_el or not link or "{" in link["href"]:
                continue
            title = title_el.get_text(" ", strip=True)
            content_el = item.select_one(".content")
            content = " ".join((content_el.get_text(" ", strip=True) if content_el else "").split())
            title = " ".join(title.split())
            dates = parse_dates(content)
            first, rest = upcoming(dates)
            if dates and not first:
                continue  # svi termini prošli
            offers.append(
                Offer(
                    source=self.source,
                    title=f"{title} {content}".strip(),
                    url=urljoin(url, link["href"]),
                    destination=title.replace("✈", "").strip().title(),
                    date_from=first,
                    extra_dates=rest,
                    nights=parse_nights(content),
                    transport=guess_transport(title + " " + content),
                    price=parse_price(content),
                    note="" if parse_price(content) else "cena na sajtu",
                )
            )
        return offers
