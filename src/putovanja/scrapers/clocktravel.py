"""Clock Travel (Niš): spisak aranžmana iz `aranzman-sitemap.xml`, pa stranica svakog polaska.

Naslov nosi datum („Toskana – 11.11.2026. OD 109€”), a tabela „Termin putovanja / Cena po osobi” ima povratak i cene po mestu polaska.
"""

from __future__ import annotations

import re
import time
from datetime import date

from bs4 import BeautifulSoup

from ..models import Offer, parse_dates, upcoming
from .base import BlockedByRobots, ScrapeResult, Scraper, fetch

SITE = "https://clocktravel.rs"
_NASLOV = re.compile(r"^(.*?)\s*[–-]\s*(\d{1,2}\.\d{1,2}\.\d{4})\.?\s*(?:OD\s*(\d[\d.]*)\s*€)?", re.I)
_KRAJ = re.compile(r"(\d{1,2})\.(\d{1,2})\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})")


class ClockTravel(Scraper):
    source = "clocktravel"
    name = "Clock Travel"
    pages: list[str] = []
    delay_s = 1.5

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        for x in soup(["script", "style", "nav", "header", "footer"]):
            x.decompose()
        text = " ".join(soup.get_text(" ", strip=True).split())
        m = _NASLOV.search(text[text.find("clocktravelnis@gmail.com") + 24:][:200]) if "clocktravelnis@gmail.com" in text else None
        if not m:
            return []
        ime, datum, cena = m.group(1).strip(), m.group(2), m.group(3)
        dates = parse_dates(datum)
        first, rest = upcoming(dates)
        if not first:
            return []  # polazak je prošao
        kraj = None
        k = _KRAJ.search(text)
        if k:
            try:
                kraj = date(int(k.group(5)), int(k.group(4)), int(k.group(3))).isoformat()
            except ValueError:
                kraj = None
        n = re.search(r"(\d+)\s*no[ćc]enj", text)
        nights = int(n.group(1)) if n else 0 if re.search(r"jednodnevn|izlet", ime, re.I) else None
        t = text[:900].lower()
        transport = "avion" if "avio" in t else "autobus" if "autobusk" in t else None
        price = float(cena.replace(".", "")) if cena else None
        return [Offer(
            source=self.source, title=f"{ime} {first[8:10]}.{first[5:7]}.", url=url, destination=ime,
            date_from=first, date_to=kraj, nights=nights, transport=transport,
            price=price, currency="EUR", note="jednodnevni izlet" if nights == 0 else "cena 'od' (iz Beograda ili najjeftinije mesto polaska)",
        )]

    def run(self) -> ScrapeResult:
        res = ScrapeResult(self.source)
        datum_u_adresi = re.compile(r'href="(https://clocktravel\.rs/[a-z0-9/_-]+-\d{2}-\d{2}-\d{4}/)"')
        podstrane = re.compile(r'href="(https://clocktravel\.rs/(?:evropski-gradovi|aktuelne-ponude)/[a-z0-9-]+/)"')
        adrese: list[str] = []
        try:
            red = [SITE + "/", SITE + "/evropski-gradovi/", SITE + "/aktuelne-ponude/jesenja-putovanja/"]
            gotovo: set[str] = set()
            while red and len(gotovo) < 15:
                u = red.pop(0)
                if u in gotovo:
                    continue
                gotovo.add(u)
                html = fetch(u)
                for a in datum_u_adresi.findall(html):
                    if a not in adrese:
                        adrese.append(a)
                red += [p for p in podstrane.findall(html) if p not in gotovo and p not in red]
                time.sleep(self.delay_s)
        except BlockedByRobots:
            res.errors.append("robots.txt ne dozvoljava čitanje, preskočeno")
            return res
        except Exception as e:  # noqa: BLE001
            res.errors.append(f"spisak: {e}")
            if not adrese:
                return res
        danas = date.today()
        seen: set[str] = set()
        for url in adrese:
            d = re.search(r"-(\d{2})-(\d{2})-(\d{4})/?$", url)
            try:
                if d and date(int(d.group(3)), int(d.group(2)), int(d.group(1))) < danas:
                    continue  # stari polazak, ne treba ga otvarati
            except ValueError:
                pass
            time.sleep(self.delay_s)
            try:
                html = fetch(url)
            except Exception as e:  # noqa: BLE001
                res.errors.append(f"{url}: {e}")
                continue
            for o in self.parse(html, url):
                if o.offer_id not in seen:
                    seen.add(o.offer_id)
                    res.offers.append(o)
        return res
