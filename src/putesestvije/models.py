"""Zajednički model ponude i pomoćne funkcije za datume i cene."""

from __future__ import annotations

import hashlib
import re
from dataclasses import asdict, dataclass, field
from datetime import date
from urllib.parse import urlsplit, urlunsplit


@dataclass
class Offer:
    source: str
    title: str
    url: str
    destination: str = ""
    date_from: str | None = None  # ISO yyyy-mm-dd
    date_to: str | None = None
    nights: int | None = None
    transport: str | None = None  # avion / autobus / sopstveni / None
    price: float | None = None  # po osobi, u valuti `currency`
    old_price: float | None = None
    currency: str = "EUR"
    extra_dates: list[str] = field(default_factory=list)
    note: str = ""

    @property
    def offer_id(self) -> str:
        parts = urlsplit(self.url)
        base = urlunsplit((parts.scheme, parts.netloc, parts.path.rstrip("/"), "", ""))
        key = f"{self.source}|{base}|{self.date_from or ''}|{self.title.lower()}"
        return hashlib.sha1(key.encode()).hexdigest()[:16]

    @property
    def discount_pct(self) -> float | None:
        if self.price and self.old_price and self.old_price > self.price:
            return round(100 * (self.old_price - self.price) / self.old_price, 1)
        return None

    def to_dict(self) -> dict:
        d = asdict(self)
        d["id"] = self.offer_id
        d["discount_pct"] = self.discount_pct
        return d


_DATE_RE = re.compile(r"(?<!\d)(\d{1,2})\.\s?(\d{1,2})\.?(?:\s?(\d{4}))?")
_PRICE_RE = re.compile(r"(?:€|EUR|eur)\s*([\d.,]+)|([\d.,]+)\s*(?:€|EUR|eur)")


def parse_price(text: str | None) -> float | None:
    if not text:
        return None
    m = _PRICE_RE.search(text)
    if not m:
        return None
    raw = (m.group(1) or m.group(2)).strip(".,")
    # 1.195 ili 1,195 -> hiljade; 99,50 -> decimale
    if re.fullmatch(r"\d{1,3}([.,]\d{3})+", raw):
        raw = re.sub(r"[.,]", "", raw)
    else:
        raw = raw.replace(",", ".")
    try:
        return float(raw)
    except ValueError:
        return None


def parse_dates(text: str, today: date | None = None) -> list[str]:
    """Izvlači datume tipa '11.11, 29.12 i 30.12.2026.' u ISO listu.

    Datum bez godine dobija sledeću godinu koja se pojavi u tekstu; ako je nema,
    tekuću godinu, osim ako je prošao pre više od 60 dana (onda sledeću).
    """
    today = today or date.today()
    found = [(int(d), int(m), int(y) if y else None) for d, m, y in _DATE_RE.findall(text)]
    found = [(d, m, y) for d, m, y in found if 1 <= d <= 31 and 1 <= m <= 12]
    out: list[str] = []
    for i, (d, m, y) in enumerate(found):
        if y is None:
            y = next((yy for _, _, yy in found[i + 1:] if yy), None)
        if y is None:
            y = today.year
            try:
                if (today - date(y, m, d)).days > 60:
                    y += 1
            except ValueError:
                continue
        try:
            out.append(date(y, m, d).isoformat())
        except ValueError:
            continue
    return out


def parse_nights(text: str) -> int | None:
    m = re.search(r"(\d{1,2})\s*no[ćc]", text, re.I)
    return int(m.group(1)) if m else None


def guess_transport(text: str) -> str | None:
    t = text.lower()
    if "✈" in text or "avion" in t or "plane" in t:
        return "avion"
    if "autobus" in t or "bus" in t:
        return "autobus"
    if "sopstven" in t:
        return "sopstveni"
    return None


def upcoming(dates: list[str], today: date | None = None) -> tuple[str | None, list[str]]:
    """Prvi budući datum i ostali budući; prošli termini se odbacuju."""
    t = (today or date.today()).isoformat()
    fut = sorted(d for d in dates if d >= t)
    return (fut[0], fut[1:]) if fut else (None, [])


_SR_MONTHS = {"jan": 1, "feb": 2, "mar": 3, "apr": 4, "maj": 5, "jun": 6, "jul": 7,
              "avg": 8, "aug": 8, "sep": 9, "okt": 10, "oct": 10, "nov": 11, "dec": 12}


def parse_month_words(text: str, today: date | None = None) -> list[str]:
    """Datumi tipa '21 okt', '05 dec 2026' u ISO."""
    out = []
    for d, mon, y in re.findall(r"(\d{1,2})\.?\s+([A-Za-zčćžšđ]{3})[a-zčćžšđ]*\.?\s*(\d{4})?", text):
        m = _SR_MONTHS.get(mon.lower()[:3])
        if m:
            out += parse_dates(f"{int(d)}.{m}.{y}", today=today)
    return out
