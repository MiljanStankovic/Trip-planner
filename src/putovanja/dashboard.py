"""Tabela ponuda za izlaz komandi u terminalu."""

from __future__ import annotations

from rich.table import Table
from rich.text import Text

from .match import Scored



def offer_table(items: list[Scored], title: str, compact: bool = False) -> Table:
    t = Table(title=title, expand=True, show_lines=False, header_style="bold cyan")
    t.add_column("ID", style="dim", no_wrap=True)
    t.add_column("Polazak", no_wrap=True)
    t.add_column("Ponuda")
    t.add_column("Cena", justify="right", no_wrap=True)
    if not compact:
        t.add_column("Zašto", style="green")
    for x in items:
        r = x.row
        cur = "din" if (r["currency"] or "EUR") == "RSD" else "€"
        price = f"{r['price']:.0f} {cur}" if r["price"] else "—"
        if r["old_price"] and r["price"] and r["old_price"] > r["price"]:
            price = f"[strike dim]{r['old_price']:.0f}[/] {price}"
        icon = {"avion": "✈", "autobus": "🚌"}.get(r["transport"] or "", "")
        cells = [
            r["id"][:8],
            (r["date_from"] or "—")[5:] if compact else (r["date_from"] or "—"),
            Text.from_markup(f"{icon} [bold]{r['destination'] or ''}[/] [dim]{r['source']}[/]"
                             + ("" if compact else f"\n{r['title'][:60]}")),
            Text.from_markup(price),
        ]
        if not compact:
            cells.append("; ".join(x.reasons[:2]))
        t.add_row(*cells)
    return t
