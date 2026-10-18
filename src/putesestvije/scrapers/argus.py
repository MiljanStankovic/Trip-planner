"""Argus Tours: promo kartice na naslovnoj, redovi tipa "PRAG - 10.11. od 139€"."""

from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..models import Offer, guess_transport, parse_dates, parse_nights, parse_price, upcoming
from .base import Scraper

_LINE = re.compile(r"^(?P<dest>[A-ZČĆŽŠĐ][\wČĆŽŠĐčćžšđ .'-]+?)\s*[-–]\s*(?P<rest>.*\d.*)$")


class Argus(Scraper):
    source = "argus"
    name = "Argus Tours"
    pages = ["https://argus.rs/", "https://argus.rs/last-minute"]

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        offers: list[Offer] = []
        for a in soup.select("a.promo-elements-standard[href], a[href*='/aranzmani/']"):
            href = urljoin(url, a["href"])
            title_el = a.select_one("h5, .naslov")
            if not title_el:
                continue
            section = " ".join(title_el.get_text(" ", strip=True).split())
            p = a.select_one("p")
            lines = [ln.strip() for ln in (p.get_text("\n", strip=True).split("\n") if p else []) if ln.strip()]
            all_text = section + " " + " ".join(lines)
            transport = guess_transport(all_text)
            nights = parse_nights(all_text)

            for ln in lines:
                m = _LINE.match(ln)
                price = parse_price(ln)
                first, rest = upcoming(parse_dates(ln))
                if not price or not first:
                    continue
                dest = (m.group("dest") if m else section).strip().title()
                offers.append(Offer(
                    source=self.source, title=f"{section}: {ln}", url=href, destination=dest,
                    date_from=first, extra_dates=rest, nights=nights,
                    transport=transport, price=price, note="cena 'od'",
                ))
            if not offers or offers[-1].url != href:
                # kartica bez reda "destinacija - datum" (npr. jedna destinacija)
                price = parse_price(all_text)
                first, rest = upcoming(parse_dates(all_text))
                if price and first and not any(o.url == href for o in offers):
                    offers.append(Offer(
                        source=self.source, title=all_text[:120], url=href, destination=section.title(),
                        date_from=first, extra_dates=rest, nights=nights,
                        transport=transport, price=price, note="cena 'od'",
                    ))
        return offers
