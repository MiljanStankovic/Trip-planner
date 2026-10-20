"""Plan A Travel (planatravel.rs, ranije planatours.rs): kartice `article.pt-travel-card` na stranicama po zemljama.

Kartica ima polaske (dan + mesec), naziv, zemlju, broj dana i noćenja, prevoz (slika) i cenu u uglu slike.
"""

from __future__ import annotations

import re
import time
from datetime import date

from bs4 import BeautifulSoup

from ..models import Offer, _SR_MONTHS, parse_price, upcoming
from .base import BlockedByRobots, ScrapeResult, Scraper, fetch

SITE = "https://www.planatravel.rs"
_ZEMLJE = re.compile(r'href="(/putovanja/(?:evropa|daleke-destinacije)/[a-z0-9-]+\.html)"')


def _broj(el) -> int | None:
    m = re.search(r"\d+", el.get_text(" ", strip=True)) if el else None
    return int(m.group()) if m else None


def _datum(dan: str, mesec: str, today: date) -> str | None:
    m = _SR_MONTHS.get(mesec.strip().lower()[:3])
    if not m or not dan.strip().isdigit():
        return None
    for g in (today.year, today.year + 1):
        try:
            iso = date(g, m, int(dan)).isoformat()
        except ValueError:
            return None
        if iso >= today.isoformat():
            return iso
    return None


class Plana(Scraper):
    source = "plana"
    name = "Plan A Travel"
    pages: list[str] = [f"{SITE}/putovanja/evropa.html", f"{SITE}/putovanja/daleke-destinacije.html"]
    delay_s = 1.5

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        today = date.today()
        out: list[Offer] = []
        for card in soup.select("article.pt-travel-card"):
            a = card.select_one("h2 a[href]")
            if not a:
                continue
            title = " ".join(a.get_text(" ", strip=True).split())
            dates = []
            for d in card.select(".pt-travel-card__date"):
                dan, mes = d.select_one(".pt-travel-card__date-day"), d.select_one(".pt-travel-card__date-month")
                iso = _datum(dan.get_text(strip=True), mes.get_text(strip=True), today) if dan and mes else None
                if iso and iso not in dates:
                    dates.append(iso)
            if card.select(".pt-travel-card__date") and not dates:
                continue
            first, rest = upcoming(dates)
            dest_el = card.select_one(".pt-travel-card__destination")
            dest = dest_el.get_text(" ", strip=True) if dest_el else ""
            nights = _broj(card.select_one(".nocenja"))
            alt = " ".join((i.get("alt") or "") for i in card.select(".pt-travel-card__transport img")).lower()
            transport = "avion" if "avion" in alt else "autobus" if "autobus" in alt else None
            price_el = card.select_one(".doledesno")
            price = parse_price(price_el.get_text(" ", strip=True)) if price_el else None
            href = a["href"]
            out.append(Offer(
                source=self.source, title=title, url=href if href.startswith("http") else SITE + href,
                destination=title, date_from=first, extra_dates=rest, nights=nights, transport=transport,
                price=price, currency="EUR", note=(f"{dest}, " if dest else "") + ("cena 'od'" if price else "cena na upit"),
            ))
        return out

    def run(self) -> ScrapeResult:
        res = ScrapeResult(self.source)
        pages = list(self.pages)
        try:
            for url in list(pages):
                for p in _ZEMLJE.findall(fetch(url)):
                    if SITE + p not in pages:
                        pages.append(SITE + p)
                time.sleep(self.delay_s)
        except BlockedByRobots:
            res.errors.append("robots.txt ne dozvoljava čitanje, preskočeno")
            return res
        except Exception as e:  # noqa: BLE001
            res.errors.append(f"spisak zemalja: {e}")
        seen: set[str] = set()
        for url in pages[2:]:  # prve dve su spiskovi zemalja
            try:
                html = fetch(url)
            except Exception as e:  # noqa: BLE001
                res.errors.append(f"{url}: {e}")
                continue
            for o in self.parse(html, url):
                if o.offer_id not in seen:
                    seen.add(o.offer_id)
                    res.offers.append(o)
            time.sleep(self.delay_s)
        return res
