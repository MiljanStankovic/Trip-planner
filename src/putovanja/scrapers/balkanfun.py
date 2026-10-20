"""Balkan Fun: kartice `article.node--type-putovanje` na /putovanja. Cena „od” (stara pa nova) i polasci kao raspon datuma."""

from __future__ import annotations

import re
from datetime import date

from bs4 import BeautifulSoup

from ..models import Offer
from .base import Scraper

_RASPON = re.compile(r"(\d{1,2})\.(\d{1,2})\.(\d{4})\.?\s*-\s*(\d{1,2})\.(\d{1,2})\.(\d{4})")
_EUR = re.compile(r"(\d[\d.]*)\s*EUR", re.I)


class BalkanFun(Scraper):
    source = "balkanfun"
    name = "Balkan Fun"
    pages = ["https://balkanfun.travel/putovanja"]

    def parse(self, html: str, url: str) -> list[Offer]:
        soup = BeautifulSoup(html, "html.parser")
        today = date.today().isoformat()
        out: list[Offer] = []
        for card in soup.select("article.node--type-putovanje"):
            tekst = " ".join(card.get_text(" ", strip=True).split())
            if "NIJE AKTIVNO" in tekst:
                continue
            a = card.select_one("h2")
            link = card.select_one("a[href*='/putovanj']")
            if not a or not link:
                continue
            title = " ".join(a.get_text(" ", strip=True).split())

            polasci: list[tuple[str, str]] = []
            for d1, m1, y1, d2, m2, y2 in _RASPON.findall(tekst):
                try:
                    od, do = date(int(y1), int(m1), int(d1)).isoformat(), date(int(y2), int(m2), int(d2)).isoformat()
                except ValueError:
                    continue
                if od >= today and (od, do) not in polasci:
                    polasci.append((od, do))
            if _RASPON.search(tekst) and not polasci:
                continue  # svi termini su prošli
            polasci.sort()

            cene = [float(c.replace(".", "")) for c in _EUR.findall((card.select_one(".price-content") or card).get_text(" ", strip=True))]
            price = cene[-1] if cene else None
            old = cene[0] if len(cene) > 1 and cene[0] > cene[-1] else None
            if price is None and not polasci:
                continue  # bez cene i bez termina nema šta da se pokaže
            godine = [int(g) for g in re.findall(r"\b(20\d\d)\b", title)]
            if not polasci and godine and max(godine) <= date.today().year:
                continue  # sezona iz naslova („leto 2026”) je prošla, a termina nema

            od, do = polasci[0] if polasci else (None, None)
            nights = (date.fromisoformat(do) - date.fromisoformat(od)).days if od and do else None
            avion = bool(re.search(r"avion", tekst, re.I))
            bus = bool(re.search(r"autobus|bus", tekst, re.I))
            href = link["href"]
            out.append(Offer(
                source=self.source, title=title, url=href if href.startswith("http") else "https://balkanfun.travel" + href,
                destination=re.sub(r"\s*(leto|jesen|nova godina|doček|letovanje).*$", "", title, flags=re.I).strip() or title,
                date_from=od, date_to=do, extra_dates=[p[0] for p in polasci[1:]], nights=nights,
                transport="avion" if avion else "autobus" if bus else "autobus",
                price=price, old_price=old, currency="EUR", note="cena 'od'",
            ))
        return out
