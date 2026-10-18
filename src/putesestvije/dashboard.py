"""Terminal prikaz: Trello tabla levo, preporuke desno, nove ponude dole."""

from __future__ import annotations

from rich.columns import Columns
from rich.console import Console, Group
from rich.layout import Layout
from rich.panel import Panel
from rich.table import Table
from rich.text import Text

from . import db
from .config import Config
from .match import Scored, recommend
from .trello import Trello, TrelloError


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


def trello_panel(cfg: Config) -> Panel:
    try:
        lists = Trello(cfg.trello).board()
    except TrelloError as e:
        return Panel(f"[yellow]{e}[/]\n\nU Claude Code-u Trello radi preko MCP-a: [bold]/putesestvije:tabla[/]",
                     title="Trello", border_style="yellow")
    cols = []
    for lst in lists:
        cards = lst.get("cards", [])
        body = "\n".join(f"• {c['name']}" + (f" [dim]({c['due'][:10]})[/]" if c.get("due") else "") for c in cards[:8])
        if len(cards) > 8:
            body += f"\n[dim]… još {len(cards) - 8}[/]"
        cols.append(Panel(body or "[dim]prazno[/]", title=f"{lst['name']} ({len(cards)})", width=30))
    return Panel(Columns(cols), title="Trello · Putešestvije", border_style="blue")


def show(cfg: Config, console: Console | None = None) -> None:
    console = console or Console()
    conn = db.connect()
    recs = recommend(db.active_offers(conn), cfg.profile, limit=8)
    fresh = recommend(db.new_since(conn, 7), cfg.profile, limit=6)
    last = conn.execute("SELECT started_at FROM runs ORDER BY started_at DESC LIMIT 1").fetchone()

    layout = Layout()
    layout.split_column(Layout(name="top", ratio=3), Layout(name="bottom", ratio=2))
    tp = trello_panel(cfg)
    no_trello = tp.border_style == "yellow"
    layout["top"].split_row(Layout(tp, name="trello", ratio=2 if no_trello else 3),
                            Layout(Panel(offer_table(recs, "", compact=not no_trello) if recs else "[dim]Nema preporuka. Pokreni: pt agencije skeniraj[/]",
                                         title="⭐ Preporuke", border_style="green"), name="recs", ratio=3 if no_trello else 2))
    footer = f"Poslednje skeniranje: {last['started_at'] if last else 'nikad'} · pt agencije skeniraj · pt preporuke · pt trello predlog <ID>"
    layout["bottom"].update(Panel(Group(offer_table(fresh, "") if fresh else Text("Nema novih ponuda u poslednjih 7 dana.", style="dim"),
                                        Text(footer, style="dim")), title="🆕 Novo ove nedelje", border_style="magenta"))
    console.print(layout, height=max(console.height, 40))
