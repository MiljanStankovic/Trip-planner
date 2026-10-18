"""Jungle Tribe: javni JSON koji koristi i njihov sajt (/api/v2/tours/cached), sa svim polascima.

Daleka i neobična putovanja (Azija, Afrika, Karibi, Južna Amerika...) i individualni hoteli sa letom.
"""

from __future__ import annotations

import json
import time
from datetime import date

import requests

from ..models import Offer
from .base import USER_AGENT, BlockedByRobots, ScrapeResult, Scraper, allowed_by_robots

API = "https://www.jungletribe.rs/api/v2/tours/cached"
SITE = "https://www.jungletribe.rs/"


class JungleTribe(Scraper):
    source = "jungletribe"
    name = "Jungle Tribe"
    page_size = 100
    max_pages = 20

    def parse(self, html: str, url: str) -> list[Offer]:
        data = json.loads(html).get("data", [])
        return [self.to_offer(x) for x in data if x.get("startDate")]

    @staticmethod
    def to_offer(x: dict) -> Offer:
        slug = x.get("slug", "")
        parts = slug.split("/")
        # destinacije/<region>/<zemlja>/<tura>
        country = parts[2].replace("-", " ").title() if len(parts) > 2 else ""
        price = float(x["price"]) if x.get("price") else None
        disc = float(x["discount"]) if x.get("discount") else None
        nights = None
        try:
            nights = (date.fromisoformat(x["endDate"]) - date.fromisoformat(x["startDate"])).days
        except (KeyError, TypeError, ValueError):
            pass
        note = []
        if x.get("lastPlaces"):
            note.append("poslednja mesta")
        if x.get("isBestDeal"):
            note.append("best deal")
        return Offer(
            source="jungletribe",
            title=x.get("name", ""),
            url=SITE + slug,
            destination=country,
            date_from=x.get("startDate"),
            date_to=x.get("endDate"),
            nights=nights,
            transport="avion",
            price=disc if disc else price,
            old_price=price if disc and price and price > disc else None,
            currency=x.get("currency") or "EUR",
            note=", ".join(note),
        )

    def run(self) -> ScrapeResult:
        res = ScrapeResult(self.source)
        if not allowed_by_robots(API):
            res.errors.append(f"{API}: robots.txt ne dozvoljava čitanje")
            return res
        seen: set[str] = set()
        for page in range(self.max_pages):
            if page:
                time.sleep(self.delay_s)
            try:
                r = requests.get(API, params={"page": page, "limit": self.page_size},
                                 headers={"User-Agent": USER_AGENT, "Accept": "application/json"}, timeout=30)
                r.raise_for_status()
                batch = self.parse(r.text, API)
            except (requests.RequestException, ValueError) as e:
                res.errors.append(f"strana {page}: {e}")
                break
            for o in batch:
                if o.offer_id not in seen:
                    seen.add(o.offer_id)
                    res.offers.append(o)
            if len(batch) < self.page_size:
                break
        return res


__all__ = ["JungleTribe", "BlockedByRobots"]
