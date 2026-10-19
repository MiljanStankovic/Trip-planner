"""Belvi Travel: kartice polazaka `a.izp-pol` (datum, destinacija, noćenja, prevoz, cena) i slajdovi sa praznicima."""

from __future__ import annotations

from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..models import (Offer, guess_transport, parse_dates, parse_month_words, parse_nights,
                      parse_price, upcoming)
from .base import Scraper


class Belvi(Scraper):
    source = "belvi"
    name = "Belvi Travel"
    pages = ["https://www.belvi.rs/"]

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        offers: list[Offer] = []
        for a in soup.select("a.izp-pol[href]"):
            for p in a.select("picture, img"):
                p.decompose()
            parts = [p for p in a.get_text("|", strip=True).split("|") if p.strip()]
            # [dan, mesec, destinacija, "2 noćenja / 5 dana, Zemlja", "Autobusom", "od", "€114"]
            if len(parts) < 5:
                continue
            first, rest = upcoming(parse_month_words(f"{parts[0]} {parts[1]}"))
            if not first:
                continue
            dest = parts[2]
            info = next((p for p in parts if "noć" in p or "dan" in p), "")
            price = parse_price(next((p for p in parts if "€" in p), None))
            offers.append(Offer(
                source=self.source, title=f"{dest} – {info}", url=urljoin(url, a["href"]),
                destination=dest, date_from=first, nights=parse_nights(info),
                transport=guess_transport(" ".join(parts)), price=price, note="cena 'od'",
            ))
        for s in soup.select(".izp-slajd__tekst"):
            link = s.select_one("a[href]")
            h2 = s.select_one("h2")
            badge = s.select_one(".izp-slajd__badge")
            if not link or not h2:
                continue
            rows = " ".join(sp.get_text(" ", strip=True) for sp in s.select(".izp-slajd__redovi span"))
            first, rest = upcoming(parse_dates(rows))
            title = h2.get_text(" ", strip=True)
            offers.append(Offer(
                source=self.source, title=f"{title} – {rows}"[:150], url=urljoin(url, link["href"]),
                destination=title.title(), date_from=first, extra_dates=rest,
                nights=parse_nights(rows), transport=guess_transport(rows),
                price=parse_price(badge.get_text(" ", strip=True) if badge else None), note="cena 'od'",
            ))
        return offers
