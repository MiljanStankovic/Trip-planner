"""SQLite baza ponuda i istorije cena."""

from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

from .config import data_dir
from .models import Offer

SCHEMA = """
CREATE TABLE IF NOT EXISTS offers (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    destination TEXT,
    date_from TEXT,
    date_to TEXT,
    nights INTEGER,
    transport TEXT,
    price REAL,
    old_price REAL,
    currency TEXT,
    extra_dates TEXT,
    note TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    min_price REAL,
    status TEXT DEFAULT 'nova'          -- nova / vidjeno / u_trellu / odbijeno
);
CREATE TABLE IF NOT EXISTS price_history (
    offer_id TEXT NOT NULL,
    seen_at TEXT NOT NULL,
    price REAL,
    PRIMARY KEY (offer_id, seen_at)
);
CREATE TABLE IF NOT EXISTS runs (
    started_at TEXT PRIMARY KEY,
    source TEXT,
    offers INTEGER,
    errors TEXT
);
"""


def connect(path: Path | None = None) -> sqlite3.Connection:
    conn = sqlite3.connect(path or data_dir() / "putesestvije.db")
    conn.row_factory = sqlite3.Row
    conn.executescript(SCHEMA)
    return conn


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def upsert(conn: sqlite3.Connection, offers: list[Offer]) -> dict[str, int]:
    """Upisuje ponude. Vraća broj novih, pojeftinjenih i poznatih."""
    stats = {"nove": 0, "pojeftinile": 0, "poznate": 0}
    now = _now()
    for o in offers:
        row = conn.execute("SELECT price, min_price FROM offers WHERE id=?", (o.offer_id,)).fetchone()
        if row is None:
            conn.execute(
                """INSERT INTO offers (id, source, title, url, destination, date_from, date_to, nights,
                   transport, price, old_price, currency, extra_dates, note, first_seen, last_seen, min_price)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (o.offer_id, o.source, o.title, o.url, o.destination, o.date_from, o.date_to, o.nights,
                 o.transport, o.price, o.old_price, o.currency, json.dumps(o.extra_dates), o.note,
                 now, now, o.price),
            )
            stats["nove"] += 1
        else:
            dropped = o.price is not None and row["price"] is not None and o.price < row["price"]
            min_price = min(p for p in (o.price, row["min_price"]) if p is not None) if (o.price or row["min_price"]) else None
            conn.execute(
                """UPDATE offers SET title=?, price=?, old_price=?, note=?, last_seen=?, min_price=?,
                   extra_dates=?, status=CASE WHEN ? THEN 'nova' ELSE status END WHERE id=?""",
                (o.title, o.price, o.old_price, o.note, now, min_price, json.dumps(o.extra_dates),
                 dropped, o.offer_id),
            )
            stats["pojeftinile" if dropped else "poznate"] += 1
        if o.price is not None:
            conn.execute("INSERT OR IGNORE INTO price_history VALUES (?,?,?)", (o.offer_id, now, o.price))
    conn.commit()
    return stats


def log_run(conn: sqlite3.Connection, source: str, n: int, errors: list[str]) -> None:
    conn.execute("INSERT OR REPLACE INTO runs VALUES (?,?,?,?)", (_now(), source, n, json.dumps(errors, ensure_ascii=False)))
    conn.commit()


def active_offers(conn: sqlite3.Connection, seen_within_days: int = 14) -> list[sqlite3.Row]:
    """Ponude viđene skoro, sa polaskom danas ili kasnije (ili bez datuma)."""
    since = (datetime.now() - timedelta(days=seen_within_days)).isoformat(timespec="seconds")
    today = date.today().isoformat()
    return conn.execute(
        """SELECT * FROM offers WHERE last_seen >= ? AND (date_from IS NULL OR date_from >= ?)
           AND status != 'odbijeno' ORDER BY date_from""",
        (since, today),
    ).fetchall()


def new_since(conn: sqlite3.Connection, days: int) -> list[sqlite3.Row]:
    since = (datetime.now() - timedelta(days=days)).isoformat(timespec="seconds")
    today = date.today().isoformat()
    return conn.execute(
        "SELECT * FROM offers WHERE first_seen >= ? AND (date_from IS NULL OR date_from >= ?) ORDER BY date_from",
        (since, today),
    ).fetchall()


def price_history(conn: sqlite3.Connection, offer_id: str) -> list[sqlite3.Row]:
    return conn.execute("SELECT seen_at, price FROM price_history WHERE offer_id=? ORDER BY seen_at", (offer_id,)).fetchall()


def set_status(conn: sqlite3.Connection, offer_id: str, status: str) -> bool:
    cur = conn.execute("UPDATE offers SET status=? WHERE id=?", (status, offer_id))
    conn.commit()
    return cur.rowcount > 0


def get(conn: sqlite3.Connection, offer_id: str) -> sqlite3.Row | None:
    return conn.execute("SELECT * FROM offers WHERE id=?", (offer_id,)).fetchone()
