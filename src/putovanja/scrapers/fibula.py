"""Fibula Air Travel: kartice hotela sa letom (polazak, noći, cena po osobi u linku i tekstu)."""

from __future__ import annotations

from urllib.parse import parse_qs, urljoin, urlsplit, urlunsplit

from bs4 import BeautifulSoup

from ..models import Offer, parse_nights, parse_price
from .base import Scraper


class Fibula(Scraper):
    source = "fibula"
    name = "Fibula Air Travel"
    pages = ["https://www.fibula.rs/"]

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        offers: list[Offer] = []
        for a in soup.find_all("a", href=True):
            if "departureDate" not in a["href"]:
                continue
            href = urljoin(url, a["href"])
            q = parse_qs(urlsplit(href).query)
            parts = [p for p in a.get_text("|", strip=True).split("|") if p.strip()]
            text = " ".join(parts)
            place = next((p for p in parts if "," in p and not p.startswith("€")), "")
            hotel_idx = parts.index(place) - 1 if place in parts else -1
            hotel = parts[hotel_idx] if hotel_idx >= 0 else ""
            board = next((p for p in parts if "Board" in p or "Inclusive" in p or "Bed" in p), "")
            price_txt = next((p for p in parts if "€" in p), None)
            # kraći, stabilan link (bez correlationId)
            clean = urlunsplit((*urlsplit(href)[:3], "departureDate=" + q.get("departureDate", [""])[0], ""))
            offers.append(Offer(
                source=self.source,
                title=f"{place.split(',')[0]} – {hotel} ({board})".strip(" –()"),
                url=clean,
                destination=place.split(",")[0].strip(),
                date_from=q.get("departureDate", [None])[0],
                date_to=q.get("returnDate", [None])[0],
                nights=parse_nights(text),
                transport="avion",
                price=parse_price(price_txt),
                note="cena po osobi, 2 odrasle osobe",
            ))
        return offers
