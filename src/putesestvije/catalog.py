"""Katalog ponuda: aktivne ponude sa zemljom i kontinentom, grupisanje i pretraga."""

from __future__ import annotations

import json
import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from . import db
from .config import Config
from .geo import classify, fold
from .match import recommend

AGENCY_NAMES = {
    "travelland": "Travelland", "argus": "Argus Tours", "grandtours": "Grand Tours", "halotours": "Halo Tours",
    "belvi": "Belvi Travel", "felix": "Felix Travel", "fibula": "Fibula", "jungletribe": "Jungle Tribe",
    "kontiki": "Kontiki", "bigblue": "Big Blue", "odeon": "Odeon", "filip": "Filip Travel",
    "ponte": "Ponte Travel", "plana": "Plana Tours",
}

CONTINENT_ORDER = ["Evropa", "Azija", "Afrika", "Karibi i Centralna Amerika", "Severna Amerika",
                   "Južna Amerika", "Okeanija", "Ostalo"]


@dataclass
class Item:
    row: sqlite3.Row
    country: str
    continent: str
    haystack: str = field(repr=False, default="")
    tour: list = field(repr=False, default_factory=list)  # svi polasci istog aranžmana (isti sajt i naziv)

    def __getitem__(self, k):
        return self.row[k]

    @property
    def id(self) -> str:
        return self.row["id"]

    @property
    def agency(self) -> str:
        return AGENCY_NAMES.get(self.row["source"], self.row["source"])

    @property
    def dates(self) -> list[str]:
        extra = json.loads(self.row["extra_dates"] or "[]")
        return [d for d in [self.row["date_from"], *extra] if d]

    def price_str(self) -> str:
        p = self.row["price"]
        if not p:
            return "na sajtu"
        cur = "din" if (self.row["currency"] or "EUR") == "RSD" else "€"
        return f"{p:,.0f} {cur}".replace(",", ".")

    def to_dict(self) -> dict:
        d = dict(self.row)
        d.update(zemlja=self.country, kontinent=self.continent, agencija=self.agency, svi_datumi=self.dates,
                 termini=self.termini())
        return d

    def termini(self) -> list[dict]:
        """Svi polasci ovog aranžmana sa cenom za taj datum, po datumu."""
        out, seen = [], set()
        for it in self.tour or [self]:
            r = it.row
            for dt in it.dates or [None]:
                if (dt, r["price"]) in seen:
                    continue
                seen.add((dt, r["price"]))
                out.append({"id": r["id"], "datum": dt, "noci": r["nights"], "cena": r["price"],
                            "stara": r["old_price"], "valuta": r["currency"] or "EUR"})
        return sorted(out, key=lambda t: t["datum"] or "9999")


def load(conn: sqlite3.Connection, seen_within_days: int = 21) -> list[Item]:
    items = []
    for r in db.active_offers(conn, seen_within_days):
        country, cont = classify(r["destination"] or "", r["title"] or "", r["url"] or "")
        hay = fold(" ".join(str(x) for x in (r["destination"], r["title"], r["source"], country, cont,
                                               AGENCY_NAMES.get(r["source"], ""))))
        items.append(Item(r, country, cont, hay))
    groups: dict[tuple, list[Item]] = defaultdict(list)
    for it in items:
        groups[tour_key(it)].append(it)
    for it in items:
        it.tour = groups[tour_key(it)]
    return items


def tour_key(it: "Item") -> tuple:
    return (it.row["source"], (it.row["url"] or "").split("?")[0].rstrip("/"), (it.row["title"] or "").lower())


def tree(items: list[Item]) -> dict[str, Counter]:
    by: dict[str, Counter] = defaultdict(Counter)
    for it in items:
        by[it.continent][it.country] += 1
    return dict(sorted(by.items(), key=lambda kv: (CONTINENT_ORDER.index(kv[0]) if kv[0] in CONTINENT_ORDER else 99)))


def search(items: list[Item], query: str) -> list[Item]:
    words = fold(query).split()
    return [it for it in items if all(" " + w in it.haystack for w in words)]


def by_country(items: list[Item], name: str) -> list[Item]:
    f = fold(name).strip()
    exact = [it for it in items if fold(it.country).strip() == f]
    return exact or search(items, name)


def recommended(items: list[Item], cfg: Config, limit: int = 30) -> list[Item]:
    by_id = {it.id: it for it in items}
    return [by_id[s.row["id"]] for s in recommend([it.row for it in items], cfg.profile, limit=limit, per_source=4)
            if s.row["id"] in by_id]


def sort_items(items: list[Item], key: str) -> list[Item]:
    if key == "cena":
        def eur(it: Item) -> float:
            p = it.row["price"]
            if p is None:
                return 1e9
            return p / 117 if (it.row["currency"] or "EUR") == "RSD" else p
        return sorted(items, key=eur)
    if key == "popust":
        return sorted(items, key=lambda it: -_discount(it))
    if key == "agencija":
        return sorted(items, key=lambda it: (it.agency, it.row["date_from"] or "9999"))
    return sorted(items, key=lambda it: it.row["date_from"] or "9999")


# ---------- "najbolje ponude" po kriterijumu ----------

def _eur(it: Item) -> float | None:
    p = it.row["price"]
    if p is None:
        return None
    return p / 117 if (it.row["currency"] or "EUR") == "RSD" else p


def _discount(it: Item) -> float:
    r = it.row
    if r["old_price"] and r["price"] and r["old_price"] > r["price"]:
        return 100 * (r["old_price"] - r["price"]) / r["old_price"]
    return 0.0


_SPECIAL_WORDS = ("poslednja mesta", "last minute", "specijal", "hit", "akcija", "best deal", "promo", "first minute")

TOP_CRITERIA = {
    "preporuka": "⭐ Preporučeno za vas",
    "popust": "💸 Najveći popust",
    "jeftino": "💶 Najjeftinije",
    "specijal": "🔥 Specijalne / poslednja mesta",
    "uskoro": "⏰ Polazi uskoro (30 dana)",
    "izlet": "🚌 Izleti i vikendi",
}


def top(items: list[Item], cfg: Config, criterion: str, limit: int = 15) -> list[tuple[Item, str]]:
    """Vraća [(ponuda, kratko zašto)], jedna ponuda po turi."""
    from datetime import date, timedelta

    seen: set[tuple] = set()

    def uniq(seq):
        out = []
        for it, why in seq:
            k = (it.row["source"], it.row["url"].split("?")[0], (it.row["title"] or "").lower())
            if k in seen:
                continue
            seen.add(k)
            out.append((it, why))
            if len(out) >= limit:
                break
        return out

    if criterion == "preporuka":
        rec = recommend([it.row for it in items], cfg.profile, limit=limit * 3, per_source=3)
        by_id = {it.id: it for it in items}
        return uniq((by_id[s.row["id"]], "; ".join(s.reasons[:2])) for s in rec if s.row["id"] in by_id)
    if criterion == "popust":
        seq = sorted((it for it in items if _discount(it) > 0), key=_discount, reverse=True)
        return uniq((it, f"-{_discount(it):.0f}% (bilo {it.row['old_price']:.0f})") for it in seq)
    if criterion == "jeftino":
        seq = sorted((it for it in items if _eur(it)), key=_eur)
        return uniq((it, it.price_str()) for it in seq)
    if criterion == "specijal":
        def is_special(it):
            t = fold(f"{it.row['title']} {it.row['note']}")
            return any(" " + fold(w).strip() in t for w in _SPECIAL_WORDS)
        seq = sorted((it for it in items if is_special(it)), key=lambda it: (-_discount(it), it.row["date_from"] or "9999"))
        return uniq((it, (it.row["note"] or "specijalna ponuda")[:40]) for it in seq)
    if criterion == "uskoro":
        today, lim = date.today().isoformat(), (date.today() + timedelta(days=30)).isoformat()
        seq = sorted((it for it in items if it.row["date_from"] and today <= it.row["date_from"] <= lim and _eur(it)),
                     key=lambda it: it.row["date_from"])
        return uniq((it, f"{it.row['date_from'][5:]} · {it.price_str()}") for it in seq)
    if criterion == "izlet":
        seq = sorted((it for it in items if it.row["nights"] is not None and it.row["nights"] <= 3
                      and it.row["transport"] == "autobus"), key=lambda it: (_eur(it) or 1e9))
        return uniq((it, f"{'izlet' if it.row['nights'] == 0 else str(it.row['nights']) + ' noći'} · {it.price_str()}")
                    for it in seq)
    return []
