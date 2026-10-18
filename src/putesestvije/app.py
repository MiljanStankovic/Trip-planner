"""Interaktivni pregledač ponuda: kontinenti → zemlje → ponude → detalji.

Pokretanje: `pt` (ili `pt app`). Radi i mišem i tastaturom.
"""

from __future__ import annotations

import json
import webbrowser

from textual import on, work
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Horizontal, Vertical, VerticalScroll
from textual.widgets import DataTable, Footer, Header, Input, Markdown, OptionList, Select, Tree
from textual.widgets.option_list import Option

from . import catalog, db, details
from .config import load as load_config

ICON = {"avion": "✈", "autobus": "🚌", "sopstveni": "🚗"}
SECTION_TITLES = {
    "opis": "Ukratko", "program": "Program", "obuhvata": "Cena obuhvata",
    "ne_obuhvata": "Cena ne obuhvata / doplate", "termini": "Termini i cene", "napomene": "Napomene",
    "tekst": "Sa stranice",
}


def _fmt_date(d: str | None) -> str:
    if not d:
        return "—"
    y, m, dd = d.split("-")
    return f"{dd}.{m}.{y}."


class PutesestvijeApp(App):
    TITLE = "Putešestvije"
    SUB_TITLE = "ponude domaćih agencija"
    CSS = """
    #search { dock: top; margin: 0 1; }
    #left { width: 40; }
    #tree { height: 1fr; border: round $primary-darken-2; }
    #topsel { margin: 0 0; }
    #top { height: 18; border: round $warning; }
    #table { width: 1fr; border: round $primary-darken-2; }
    #detail { width: 56; border: round $accent; padding: 0 1; }
    #tree:focus, #table:focus { border: round $accent; }
    """
    BINDINGS = [
        Binding("slash", "focus_search", "Traži"),
        Binding("d", "load_details", "Detalji sa sajta"),
        Binding("o", "open_link", "Otvori link"),
        Binding("t", "toggle_pick", "Za Trello"),
        Binding("s", "cycle_sort", "Sortiraj"),
        Binding("escape", "clear_search", "Poništi", show=False),
        Binding("q", "quit", "Izlaz"),
    ]

    def __init__(self) -> None:
        super().__init__()
        self.cfg = load_config()
        self.conn = db.connect()
        self.items = catalog.load(self.conn)
        self.by_id = {it.id: it for it in self.items}
        self.current: list[catalog.Item] = []
        self.current_title = ""
        self.sort_key = "datum"
        self.selected: catalog.Item | None = None
        self.groups: dict[str, list[catalog.Item]] = {}

    # ---------- izgled ----------
    def compose(self) -> ComposeResult:
        yield Header()
        yield Input(placeholder="Traži zemlju, grad ili agenciju (npr. tajland, advent, budimpešta)…  [/]", id="search")
        with Horizontal():
            with Vertical(id="left"):
                yield Tree("Sve ponude", id="tree")
                yield Select([(v, k) for k, v in catalog.TOP_CRITERIA.items()], value="preporuka",
                             allow_blank=False, id="topsel")
                yield OptionList(id="top")
            yield DataTable(id="table", cursor_type="row", zebra_stripes=True)
            with VerticalScroll(id="detail"):
                yield Markdown("Izaberi ponudu da vidiš detalje.", id="md")
        yield Footer()

    def on_mount(self) -> None:
        t = self.query_one("#table", DataTable)
        t.add_columns("Polazak", "Destinacija", "Zemlja", "Noći", "", "Cena/os.", "Agencija", "★")
        self.build_tree()
        if not self.items:
            self.query_one("#md", Markdown).update(
                "## Baza je prazna\n\nU terminalu pokreni:\n\n`pt agencije skeniraj`\n\npa ponovo `pt`.")
        self.show_list(catalog.recommended(self.items, self.cfg), "⭐ Preporuke")
        self.fill_top("preporuka")

    def fill_top(self, criterion: str) -> None:
        ol = self.query_one("#top", OptionList)
        ol.clear_options()
        ol.border_title = "Najbolje ponude"
        for it, why in catalog.top(self.items, self.cfg, criterion, limit=25):
            name = it.row["destination"] or it.row["title"] or ""
            if name == it.country:
                name = it.row["title"] or name
            ol.add_option(Option(f"{name[:22]} · {it.agency[:10]}\n  [dim]{why[:34]}[/]", id=it.id))

    @on(Select.Changed, "#topsel")
    def top_changed(self, ev: Select.Changed) -> None:
        self.fill_top(str(ev.value))

    @on(OptionList.OptionHighlighted, "#top")
    def top_highlighted(self, ev: OptionList.OptionHighlighted) -> None:
        it = self.by_id.get(ev.option.id or "")
        if it:
            self.selected = it
            self.groups.setdefault(it.id, [m for m in self.items if self._group_key(m) == self._group_key(it)])
            self.render_detail(it, cached_only=True)

    @on(OptionList.OptionSelected, "#top")
    def top_selected(self, ev: OptionList.OptionSelected) -> None:
        self.top_highlighted(ev)  # type: ignore[arg-type]
        self.action_load_details()

    def build_tree(self) -> None:
        tree = self.query_one("#tree", Tree)
        tree.clear()
        tree.root.expand()
        picked = db.picked_ids(self.conn)
        tree.root.add_leaf("⭐ Preporuke", data=("rec", None))
        tree.root.add_leaf("🆕 Novo (7 dana)", data=("new", None))
        tree.root.add_leaf(f"📌 Za Trello ({len(picked)})", data=("picked", None))
        tree.root.add_leaf(f"🌍 Sve ({len(self.items)})", data=("all", None))
        for cont, countries in catalog.tree(self.items).items():
            node = tree.root.add(f"{cont} ({sum(countries.values())})", data=("continent", cont))
            for country, n in sorted(countries.items(), key=lambda kv: -kv[1]):
                node.add_leaf(f"{country} ({n})", data=("country", country))
            if cont == "Evropa":
                node.expand()

    @staticmethod
    def _group_key(it: catalog.Item) -> tuple:
        url = it.row["url"].split("?")[0].split("#")[0].rstrip("/")
        return (it.row["source"], url, (it.row["title"] or "").lower())

    def show_list(self, items: list[catalog.Item], title: str) -> None:
        self.current = items
        self.current_title = title
        t = self.query_one("#table", DataTable)
        t.clear()
        picked = db.picked_ids(self.conn)
        ordered = items if title == "⭐ Preporuke" else catalog.sort_items(items, self.sort_key)
        groups: dict[tuple, list[catalog.Item]] = {}
        for it in ordered:
            groups.setdefault(self._group_key(it), []).append(it)
        self.groups = {}
        for members in groups.values():
            members_by_date = sorted(members, key=lambda m: m.row["date_from"] or "9999")
            it = members[0]  # prvi po izabranom sortiranju
            self.groups[it.id] = members_by_date
            r = it.row
            n_dates = len({d for m in members for d in m.dates})
            more = f" +{n_dates - 1}" if n_dates > 1 else ""
            prices = [m.row["price"] for m in members if m.row["price"]]
            price = it.price_str()
            if len(prices) > 1 and min(prices) != max(prices):
                cur = "din" if (r["currency"] or "EUR") == "RSD" else "€"
                price = f"od {min(prices):,.0f} {cur}".replace(",", ".")
            elif r["old_price"] and r["price"] and r["old_price"] > r["price"]:
                price += f"  (-{100 * (r['old_price'] - r['price']) / r['old_price']:.0f}%)"
            name = r["destination"] or ""
            if not name or name == it.country:
                name = r["title"] or name
            t.add_row(_fmt_date(r["date_from"]) + more, name[:32], it.country,
                      "izlet" if r["nights"] == 0 else (r["nights"] or ""), ICON.get(r["transport"] or "", ""),
                      price, it.agency, "📌" if any(m.id in picked for m in members) else "", key=it.id)
        t.border_title = f"{title} · {len(self.groups)} ponuda ({len(items)} polazaka) · sort: {self.sort_key}"

    # ---------- događaji ----------
    @on(Tree.NodeSelected, "#tree")
    def tree_selected(self, ev: Tree.NodeSelected) -> None:
        kind, val = ev.node.data or (None, None)
        if kind == "rec":
            self.show_list(catalog.recommended(self.items, self.cfg), "⭐ Preporuke")
        elif kind == "new":
            ids = {r["id"] for r in db.new_since(self.conn, 7)}
            self.show_list([it for it in self.items if it.id in ids], "🆕 Novo")
        elif kind == "picked":
            ids = db.picked_ids(self.conn)
            self.show_list([it for it in self.items if it.id in ids], "📌 Za Trello")
        elif kind == "all":
            self.show_list(self.items, "Sve")
        elif kind == "continent":
            self.show_list([it for it in self.items if it.continent == val], val)
        elif kind == "country":
            self.show_list([it for it in self.items if it.country == val], val)

    @on(Input.Changed, "#search")
    def search_changed(self, ev: Input.Changed) -> None:
        q = ev.value.strip()
        if len(q) >= 2:
            self.show_list(catalog.search(self.items, q), f"🔎 {q}")

    @on(Input.Submitted, "#search")
    def search_done(self) -> None:
        self.query_one("#table", DataTable).focus()

    @on(DataTable.RowHighlighted, "#table")
    def row_highlighted(self, ev: DataTable.RowHighlighted) -> None:
        if ev.row_key and ev.row_key.value in self.by_id:
            self.selected = self.by_id[ev.row_key.value]
            self.render_detail(self.selected, cached_only=True)

    @on(DataTable.RowSelected, "#table")
    def row_selected(self, ev: DataTable.RowSelected) -> None:
        if ev.row_key and ev.row_key.value in self.by_id:
            self.selected = self.by_id[ev.row_key.value]
            self.action_load_details()

    # ---------- detalji ----------
    def render_detail(self, it: catalog.Item, site: dict | None = None, cached_only: bool = False) -> None:
        r = it.row
        if site is None and cached_only:
            row = self.conn.execute("SELECT data FROM details WHERE offer_id=?", (it.id,)).fetchone()
            site = json.loads(row[0]) if row else None
        hist = db.price_history(self.conn, it.id)
        lines = [f"## {r['destination'] or r['title']}", f"**{it.country}** · {it.continent} · **{it.agency}**", ""]
        lines.append(f"**{r['title']}**\n")
        group = self.groups.get(it.id, [it])
        lines.append(f"- **Polazak:** {_fmt_date(r['date_from'])}" + (f" → {_fmt_date(r['date_to'])}" if r["date_to"] else ""))
        lines.append(f"- **Noći:** {'jednodnevni izlet' if r['nights'] == 0 else (r['nights'] or 'na sajtu')}")
        lines.append(f"- **Prevoz:** {ICON.get(r['transport'] or '', '')} {r['transport'] or 'na sajtu'}")
        price = it.price_str() + " po osobi"
        if r["old_price"] and r["price"] and r["old_price"] > r["price"]:
            price += f" (bilo {r['old_price']:.0f})"
        lines.append(f"- **Cena:** {price}")
        if r["note"]:
            lines.append(f"- **Napomena:** {r['note']}")
        if len(hist) > 1:
            lines.append("- **Kretanje cene:** " + " → ".join(f"{h['price']:.0f}" for h in hist[-6:]))
        lines.append(f"- **Viđeno:** prvi put {r['first_seen'][:10]}, poslednji {r['last_seen'][:10]} · ID `{it.id[:8]}`")
        all_dates = [(m, d) for m in group for d in m.dates]
        if len(all_dates) > 1:
            lines.append(f"\n### Svi termini ({len(all_dates)})\n")
            lines.append("| Polazak | Povratak | Noći | Cena |\n|---|---|---|---|")
            for m, d in sorted(all_dates, key=lambda x: x[1]):
                mr = m.row
                pr = m.price_str()
                if mr["old_price"] and mr["price"] and mr["old_price"] > mr["price"]:
                    pr += f" ~~{mr['old_price']:.0f}~~"
                back = _fmt_date(mr["date_to"]) if d == mr["date_from"] and mr["date_to"] else ""
                lines.append(f"| {_fmt_date(d)} | {back} | {mr['nights'] if mr['nights'] is not None else ''} | {pr} |")
        lines.append(f"\n[{r['url']}]({r['url']})\n")
        if any(m.id in db.picked_ids(self.conn) for m in self.groups.get(it.id, [it])):
            lines.append("📌 **Označeno za Trello**\n")
        if site:
            if site.get("greska"):
                lines.append(f"> ⚠️ {site['greska']}")
            for key, title in SECTION_TITLES.items():
                if site.get(key):
                    body = site[key].replace("\n", "\n- ")
                    lines.append(f"### {title}\n- {body}" if key != "opis" else f"### {title}\n{site[key]}")
            lines.append(f"\n_Sa sajta agencije, provereno {site.get('provereno', '')}_")
        else:
            lines.append("_Enter ili `d` za program, šta cena obuhvata i termine sa sajta agencije._")
        self.query_one("#md", Markdown).update("\n".join(lines))

    @work(thread=True, exclusive=True)
    def fetch_details(self, it: catalog.Item) -> None:
        conn = db.connect()
        data = details.get(conn, it.id, it.row["url"])
        self.call_from_thread(self._details_ready, it, data)

    def _details_ready(self, it: catalog.Item, data: dict) -> None:
        if self.selected and self.selected.id == it.id:
            self.render_detail(it, data)

    # ---------- akcije ----------
    def action_load_details(self) -> None:
        if self.selected:
            self.query_one("#md", Markdown).update(f"## {self.selected.row['destination']}\n\nUčitavam detalje sa sajta {self.selected.agency}…")
            self.fetch_details(self.selected)

    def action_open_link(self) -> None:
        if self.selected:
            webbrowser.open(self.selected.row["url"])

    def action_toggle_pick(self) -> None:
        if not self.selected:
            return
        on_ = db.toggle_pick(self.conn, self.selected.id)
        self.notify(("📌 Označeno za Trello. " if on_ else "Uklonjeno iz liste za Trello. ")
                    + ("U Claude Code-u: /putesestvije:u-trello" if on_ else ""), timeout=4)
        self.build_tree()
        self.show_list(self.current, self.current_title)
        self.render_detail(self.selected, cached_only=True)

    def action_cycle_sort(self) -> None:
        order = ["datum", "cena", "popust", "agencija"]
        self.sort_key = order[(order.index(self.sort_key) + 1) % len(order)]
        self.show_list(self.current, self.current_title)

    def action_focus_search(self) -> None:
        self.query_one("#search", Input).focus()

    def action_clear_search(self) -> None:
        inp = self.query_one("#search", Input)
        inp.value = ""
        self.query_one("#tree", Tree).focus()


def run() -> None:
    PutesestvijeApp().run()
