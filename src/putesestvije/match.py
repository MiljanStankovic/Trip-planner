"""Bodovanje ponuda prema profilu. Jednostavna, objašnjiva pravila."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import date

from .config import Profile


@dataclass
class Scored:
    row: sqlite3.Row
    score: float
    reasons: list[str]

    def to_dict(self) -> dict:
        d = dict(self.row)
        d["score"] = round(self.score, 1)
        d["razlozi"] = self.reasons
        return d


def score(row: sqlite3.Row, p: Profile, today: date | None = None) -> Scored | None:
    """Vraća None ako ponuda ne prolazi tvrde filtere."""
    today = today or date.today()
    reasons: list[str] = []
    s = 50.0
    text = f"{row['title']} {row['destination'] or ''}".lower()

    if any(w.lower() in text for w in p.dislikes):
        return None
    if "rasprodato" in text or "sold out" in text:
        return None
    if "poslednja mesta" in text:
        reasons.append("poslednja mesta")
    if row["transport"] and p.transport and row["transport"] not in p.transport:
        return None
    if row["nights"] is not None and not (p.min_nights <= row["nights"] <= p.max_nights):
        return None
    if row["date_from"]:
        days = (date.fromisoformat(row["date_from"]) - today).days
        if days < p.min_days_ahead or days > p.max_days_ahead:
            return None
        if days <= 30:
            s += 5
            reasons.append(f"polazak za {days} dana")

    price = row["price"]
    if price is not None and p.budget_per_person:
        if price > p.budget_per_person:
            return None
        s += 15 * (1 - price / p.budget_per_person)
        reasons.append(f"{price:.0f} € u okviru budžeta {p.budget_per_person:.0f} €")
    elif price is None:
        s -= 5
        reasons.append("cena nije poznata")

    if row["old_price"] and price and row["old_price"] > price:
        pct = 100 * (row["old_price"] - price) / row["old_price"]
        s += min(pct, 40) * 0.6
        reasons.append(f"sniženo {pct:.0f}%")
    if row["min_price"] and price and price <= row["min_price"] and row["first_seen"] != row["last_seen"]:
        s += 5
        reasons.append("najniža cena do sada")

    hits = [w for w in p.likes if w.lower() in text]
    if hits:
        s += 12 * len(hits)
        reasons.append("volite: " + ", ".join(hits))

    if row["status"] == "nova":
        s += 3
    order = ("volite", "sniženo", "najniža", "poslednja", "polazak", "cena nije", )
    reasons.sort(key=lambda r: next((i for i, k in enumerate(order) if r.startswith(k)), len(order)))
    return Scored(row, s, reasons)


def recommend(rows: list[sqlite3.Row], p: Profile, limit: int = 10) -> list[Scored]:
    scored = [x for x in (score(r, p) for r in rows) if x]
    # jedna ponuda po destinaciji i agenciji, najbolje bodovana
    best: dict[tuple, Scored] = {}
    for x in scored:
        key = (x.row["source"], (x.row["destination"] or x.row["title"]).lower())
        if key not in best or x.score > best[key].score:
            best[key] = x
    return sorted(best.values(), key=lambda x: x.score, reverse=True)[:limit]
