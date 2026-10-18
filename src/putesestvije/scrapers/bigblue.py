"""Big Blue: linkovi `/location/` i `/tour/` sa datumima u tekstu. Cene se učitavaju JavaScript-om."""

from __future__ import annotations

import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from ..models import Offer, guess_transport, parse_dates, upcoming
from .base import Scraper


def _fix_lang(u: str) -> str:
    """Relativni linkovi ("../location/x") u meniju gube /sr/ prefiks."""
    u = re.sub(r"^(https://(?:www\.)?(?:bigblue|kontiki)\.rs)/(location|tour)/", r"\1/sr/\2/", u)
    return u.replace("/sr/sr/", "/sr/")


class BigBlue(Scraper):
    source = "bigblue"
    name = "Big Blue"
    pages = [
        "https://bigblue.rs/sr/evropske-metropole",
        "https://bigblue.rs/sr/zima-2026-27/",
    ]

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        offers: list[Offer] = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if not re.search(r"/(location|tour)/", href):
                continue
            text = a.get_text(" ", strip=True)
            dates = parse_dates(text)
            if not dates:
                continue
            first, rest = upcoming(dates)
            if not first:
                continue
            name = re.split(r"\s[-–]\s", text, maxsplit=1)[0].strip()
            offers.append(
                Offer(
                    source=self.source,
                    title=text,
                    url=_fix_lang(urljoin(url, href)),
                    destination=name,
                    date_from=first,
                    extra_dates=rest,
                    transport=guess_transport(text) or ("avion" if "metropole" in url else None),
                    note="cena na sajtu (JavaScript)",
                )
            )
        return offers
