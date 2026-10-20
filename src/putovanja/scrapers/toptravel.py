"""Top Travel (Novi Sad): stranica svake ture (`/evropski-gradovi/<zemlja>/<naziv>/`, `/daleke_destinacije/grupna-putovanja/<naziv>/`).

Na stranici piše „TERMINI : 26.09. / 10.10. …” i „CENA ARANŽMANA PO OSOBI: … 2.300,00 dinara”.
"""

from __future__ import annotations

import re
import time
from datetime import date

from bs4 import BeautifulSoup

from ..models import Offer, guess_transport, parse_dates, upcoming
from .base import BlockedByRobots, ScrapeResult, Scraper, fetch

SITE = "https://toptravel.rs"
SEEDS = [SITE + "/evropski-gradovi/", SITE + "/daleke_destinacije/"]
_LINK = re.compile(r'href="(?:https://toptravel\.rs)?(/(?:evropski-gradovi|daleke_destinacije)/[a-z0-9_-]+/[a-z0-9_-]+/)"')
_RASPON = re.compile(r"(\d{1,2})\.(\d{1,2})\.\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})")
_CENA = re.compile(r"(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\s*(dinara|din\b|rsd|€|eur)", re.I)


def _iznos(raw: str) -> float | None:
    try:
        return float(raw.replace(".", "").replace(",", "."))
    except ValueError:
        return None


class TopTravel(Scraper):
    source = "toptravel"
    name = "Top Travel"
    pages: list[str] = list(SEEDS)
    delay_s = 3.0

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        for x in soup(["script", "style", "nav", "header", "footer"]):
            x.decompose()
        text = " ".join(soup.get_text(" ", strip=True).split())
        tt = BeautifulSoup(html, "html.parser").title
        title = (tt.get_text().split("–")[0].strip() if tt else "") or ""
        if not title:
            return []

        seg = re.search(r"TERMIN[IA]?\s*:?\s*(.{0,220}?)(?:SIGURAN|POLAZAK|PROGRAM|CENA|$)", text)
        dates = list(dict.fromkeys(parse_dates(seg.group(1)))) if seg else []
        if not dates:  # „08.10. - 11.10.2026. / 12.11. - 15.11.2026.”: polazak pre crtice, godina uz povratak
            for d1, m1, d2, m2, y in _RASPON.findall(text[:900]):
                try:
                    pocetak = date(int(y) - (1 if int(m1) > int(m2) else 0), int(m1), int(d1)).isoformat()
                except ValueError:
                    continue
                if pocetak not in dates:
                    dates.append(pocetak)
        first, rest = upcoming(dates)
        if dates and not first:
            return []  # svi termini su prošli

        p = re.search(r"CENA ARAN[ZŽ]MANA PO OSOBI\s*:?(.{0,400})", text, re.I)
        cene = [(_iznos(a), v.lower()) for a, v in _CENA.findall(p.group(1))] if p else []
        cene = [(a, v) for a, v in cene if a and a >= 10]
        if not first:
            return []  # bez termina nema šta da se pokaže
        price, cur = (min(cene) if cene else (None, "eur"))
        currency = "RSD" if cur in ("dinara", "din", "rsd") else "EUR"

        head = text[:700]
        dnevni = bool(re.search(r"jednodnevn|izlet", title + " " + head[:200], re.I))
        n = re.search(r"(\d+)\s*no[ćc]", head, re.I)
        nights = 0 if dnevni else int(n.group(1)) if n else None
        return [Offer(
            source=self.source, title=title, url=url, destination=re.sub(r"\s*\d{4}\s*$", "", title).strip() or title,
            date_from=first, extra_dates=rest, nights=nights,
            transport=guess_transport(head) or ("avion" if re.search(r"avio", title, re.I) else "autobus"),
            price=price, currency=currency, note="jednodnevni izlet" if nights == 0 else "cena po osobi" if price else "cena na upit",
        )]

    def run(self) -> ScrapeResult:
        res = ScrapeResult(self.source)
        adrese: list[str] = []
        try:
            for s in SEEDS:
                for p in _LINK.findall(fetch(s)):
                    if SITE + p not in adrese:
                        adrese.append(SITE + p)
                time.sleep(self.delay_s)
        except BlockedByRobots:
            res.errors.append("robots.txt ne dozvoljava čitanje, preskočeno")
            return res
        except Exception as e:  # noqa: BLE001
            res.errors.append(f"spisak: {e}")
            if not adrese:
                return res
        seen: set[str] = set()
        for url in adrese:
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
