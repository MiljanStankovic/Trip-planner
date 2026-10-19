"""Ulazna tačka: `pt`.

  pt                               pomoć (pregled ponuda je pano /putovanja u Claude Code-u)
  pt zemlje                        broj ponuda po kontinentu i zemlji
  pt top [kriterijum]              najbolje ponude: preporuka, popust, jeftino, specijal, uskoro, izlet
  pt zemlja NAZIV                  sve ponude za zemlju (ili grad, npr. "budimpešta")
  pt ponuda ID [--detalji]         sve o jednoj ponudi; --detalji čita program i cene sa sajta
  pt izabrano [--poslato ID...]    ponude označene za Trello (u pregledaču taster t)
  pt agencije skeniraj [--samo X]  skini ponude agencija i sačuvaj istoriju cena
  pt agencije nove [--dana 7]      ponude prvi put viđene u poslednjih N dana
  pt agencije ubaci FAJL.json      ubaci ponude koje je Claude pročitao (npr. Filip Travel)
  pt agencije istorija ID          istorija cene jedne ponude
  pt agencije odbij ID             ne predlaži više ovu ponudu
  pt preporuke [--limit 10]        najbolje ponude po profilu
  pt trello tabla                  liste i kartice
  pt trello predlog ID             ponudu kao karticu u "📬 Predlozi"
  pt trello dodaj --lista izleti --naslov "..." [--opis ...] [--rok 2026-11-08]
  pt profil                        prikaži podešavanja
  pt init                          napravi config.toml

Dodaj --json na komande za mašinski izlaz (za Claude komande).
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from rich.console import Console

from . import catalog, db, details, diy, ukupno, watch
from .config import Config, load
from .dashboard import offer_table
from .match import recommend
from .models import Offer
from .scrapers import CLAUDE_SOURCES, SCRAPERS, SKIPPED
from .trello import Trello, TrelloError

console = Console()
TZ = ZoneInfo("Europe/Belgrade")


def _out(data, as_json: bool, render=None) -> None:
    if as_json:
        print(json.dumps(data, ensure_ascii=False, indent=2, default=str))
    elif render:
        render()


def cmd_scan(cfg: Config, args) -> int:
    conn = db.connect()
    sources = args.samo or cfg.agencies
    summary = {"agencije": {}, "preskoceno": SKIPPED, "za_claude": CLAUDE_SOURCES}
    for src in sources:
        if src not in SCRAPERS:
            summary["agencije"][src] = {"greska": "nema parsera; čita ga Claude (vidi za_claude)"}
            continue
        if not args.json:
            console.print(f"[cyan]→ {SCRAPERS[src].name}[/] …")
        res = SCRAPERS[src]().run()
        stats = db.upsert(conn, res.offers)
        db.log_run(conn, src, len(res.offers), res.errors)
        summary["agencije"][src] = {"ponuda": len(res.offers), **stats, "greske": res.errors}
        if not args.json:
            console.print(f"   {len(res.offers)} ponuda · nove {stats['nove']} · pojeftinile {stats['pojeftinile']}"
                          + (f" · [red]{len(res.errors)} grešaka[/]" if res.errors else ""))
            for e in res.errors:
                console.print(f"   [red]{e}[/]")
    if not args.json:
        for k, v in SKIPPED.items():
            console.print(f"[dim]{v}[/]")
        console.print("[dim]Filip Travel, Ponte i Plana čita Claude komandom /putesestvije:agencije[/]")
    _out(summary, args.json)
    return 0


def cmd_new(cfg: Config, args) -> int:
    conn = db.connect()
    items = recommend(db.new_since(conn, args.dana), cfg.profile, limit=100, per_source=100) if not args.sve else None
    rows = [x.to_dict() for x in items] if items is not None else [dict(r) for r in db.new_since(conn, args.dana)]
    _out(rows, args.json, lambda: console.print(offer_table(items or [], f"Nove ponude, poslednjih {args.dana} dana")) if items is not None
         else console.print_json(data=rows))
    return 0


def cmd_ingest(cfg: Config, args) -> int:
    data = json.loads(Path(args.fajl).read_text(encoding="utf-8"))
    offers = []
    for d in data if isinstance(data, list) else data.get("ponude", []):
        d = {k: v for k, v in d.items() if k in Offer.__dataclass_fields__}
        if not d.get("source") or not d.get("title") or not d.get("url"):
            continue
        offers.append(Offer(**d))
    conn = db.connect()
    stats = db.upsert(conn, offers)
    db.log_run(conn, ",".join(sorted({o.source for o in offers})) or "ubaci", len(offers), [])
    _out({"ubaceno": len(offers), **stats}, args.json, lambda: console.print(f"Ubačeno {len(offers)}: {stats}"))
    return 0


def cmd_history(cfg: Config, args) -> int:
    conn = db.connect()
    row = _find_offer(conn, args.id)
    if not row:
        console.print("[red]Nema te ponude.[/]")
        return 1
    hist = [dict(h) for h in db.price_history(conn, row["id"])]
    _out({"ponuda": dict(row), "istorija": hist}, args.json,
         lambda: [console.print(f"[bold]{row['title']}[/] {row['url']}")] + [console.print(f"  {h['seen_at']}  {h['price']} €") for h in hist])
    return 0


def _find_offer(conn, prefix: str):
    rows = conn.execute("SELECT * FROM offers WHERE id LIKE ?", (prefix + "%",)).fetchall()
    return rows[0] if len(rows) == 1 else None


def cmd_reject(cfg: Config, args) -> int:
    conn = db.connect()
    row = _find_offer(conn, args.id)
    ok = bool(row) and db.set_status(conn, row["id"], "odbijeno")
    _out({"ok": ok}, args.json, lambda: console.print("Odbijeno." if ok else "[red]Nema te ponude.[/]"))
    return 0 if ok else 1


def cmd_recommend(cfg: Config, args) -> int:
    conn = db.connect()
    items = recommend(db.active_offers(conn), cfg.profile, limit=args.limit, per_source=args.po_agenciji)
    _out([x.to_dict() for x in items], args.json, lambda: console.print(offer_table(items, "⭐ Preporuke")))
    return 0


def cmd_board(cfg: Config, args) -> int:
    try:
        lists = Trello(cfg.trello).board()
    except TrelloError as e:
        console.print(f"[yellow]{e}[/]")
        return 1
    _out(lists, args.json, lambda: [console.print(f"[bold]{l['name']}[/] ({len(l.get('cards', []))})\n"
                                                    + "\n".join(f"  • {c['name']}" for c in l.get("cards", [])))
                                     for l in lists])
    return 0


def _offer_desc(row) -> str:
    lines = [
        f"**Agencija:** {row['source']}",
        f"**Polazak:** {row['date_from'] or 'TBC'}" + (f" (+ {', '.join(json.loads(row['extra_dates']))})" if row["extra_dates"] and row["extra_dates"] != "[]" else ""),
        f"**Noćenja:** {row['nights'] or 'TBC'} · **Prevoz:** {row['transport'] or 'TBC'}",
        f"**Cena po osobi:** {str(int(row['price'])) + ' €' if row['price'] else 'na sajtu'}"
        + (f" (bilo {int(row['old_price'])} €)" if row["old_price"] else ""),
        f"**Link:** {row['url']}",
        f"_Provereno {datetime.fromisoformat(row['last_seen']).date()} · pt id {row['id'][:8]}_",
    ]
    return "\n".join(lines)


def cmd_suggest(cfg: Config, args) -> int:
    conn = db.connect()
    row = _find_offer(conn, args.id)
    if not row:
        console.print("[red]Nema te ponude (proveri ID iz `pt preporuke`).[/]")
        return 1
    try:
        card = Trello(cfg.trello).add_card("predlozi", f"{row['destination'] or row['title'][:40]} · {row['source']}",
                                           _offer_desc(row), url=row["url"])
    except TrelloError as e:
        console.print(f"[yellow]{e}[/]")
        return 1
    db.set_status(conn, row["id"], "u_trellu")
    _out(card, args.json, lambda: console.print(f"Dodato u 📬 Predlozi: {card['url']}"))
    return 0


def cmd_add(cfg: Config, args) -> int:
    due = None
    if args.rok:
        due = datetime.fromisoformat(args.rok + "T09:00").replace(tzinfo=TZ).astimezone(ZoneInfo("UTC")).isoformat()
    try:
        card = Trello(cfg.trello).add_card(args.lista, args.naslov, args.opis or "", due=due, url=args.link)
    except TrelloError as e:
        console.print(f"[yellow]{e}[/]")
        return 1
    _out(card, args.json, lambda: console.print(f"Kartica napravljena: {card['url']}"))
    return 0


def cmd_profile(cfg: Config, args) -> int:
    data = {"config": str(cfg.path) if cfg.path else "(podrazumevano, nema config.toml)",
            "profil": cfg.profile.__dict__, "agencije": cfg.agencies, "trello_board": cfg.trello.board_id,
            "trello_kljuc": bool(cfg.trello.key and cfg.trello.token)}
    _out(data, args.json, lambda: console.print_json(data=data))
    return 0


def cmd_init(cfg: Config, args) -> int:
    target = Path.home() / ".config" / "putesestvije" / "config.toml"
    src = Path(__file__).resolve().parent / "config.example.toml"
    if target.exists() and not args.force:
        console.print(f"Već postoji: {target} (dodaj --force za prepis)")
        return 1
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, target)
    console.print(f"Napravljeno: {target}. Otvori i podesi profil.")
    return 0


def cmd_countries(cfg: Config, args) -> int:
    tree = catalog.tree(catalog.load(db.connect()))
    data = {k: dict(v.most_common()) for k, v in tree.items()}

    def render():
        for cont, countries in data.items():
            console.print(f"[bold]{cont}[/] ({sum(countries.values())})")
            console.print("   " + ", ".join(f"{c} {n}" for c, n in countries.items()))
    _out(data, args.json, render)
    return 0


def cmd_country(cfg: Config, args) -> int:
    items = catalog.sort_items(catalog.by_country(catalog.load(db.connect()), " ".join(args.naziv)), "datum")
    rows = [it.to_dict() for it in items]

    def render():
        from rich.table import Table
        t = Table(title=f"{' '.join(args.naziv)} · {len(items)} ponuda", header_style="bold cyan")
        for c in ("ID", "Polazak", "Destinacija", "Zemlja", "Noći", "Cena", "Agencija"):
            t.add_column(c)
        for it in items:
            t.add_row(it.id[:8], it["date_from"] or "—", (it["destination"] or "")[:28], it.country,
                      str(it["nights"] if it["nights"] is not None else ""), it.price_str(), it.agency)
        console.print(t)
    _out(rows, args.json, render)
    return 0


def cmd_offer(cfg: Config, args) -> int:
    conn = db.connect()
    row = _find_offer(conn, args.id)
    if not row:
        console.print("[red]Nema te ponude.[/]")
        return 1
    it = next((i for i in catalog.load(conn, 3650) if i.id == row["id"]), None)
    data = it.to_dict() if it else dict(row)
    data["istorija_cene"] = [dict(h) for h in db.price_history(conn, row["id"])]
    data["pratim"] = bool(it and watch.je_praceno(conn, it))
    if args.detalji:
        data["sa_sajta"] = details.get(conn, row["id"], row["url"], refresh=args.osvezi)
    data["ukupno"] = ukupno.proceni(data, data.get("sa_sajta"), cfg.profile.putnika)
    _out(data, args.json, lambda: console.print_json(data=data))
    return 0


def cmd_picked(cfg: Config, args) -> int:
    conn = db.connect()
    for pid in args.poslato or []:
        row = _find_offer(conn, pid)
        if row:
            db.mark_sent(conn, row["id"])
    items = {i.id: i for i in catalog.load(conn, 3650)}
    rows = [items[r["id"]].to_dict() if r["id"] in items else dict(r) for r in db.picked(conn)]

    def render():
        if not rows:
            console.print("Nema označenih ponuda. U pregledaču (`pt`) označi ponudu tasterom [bold]t[/].")
        for r in rows:
            console.print(f"📌 {r['id'][:8]}  {r.get('date_from') or '—'}  {r.get('destination')}  ({r.get('agencija', r['source'])})  {r['url']}")
    _out(rows, args.json, render)
    return 0


def cmd_top(cfg: Config, args) -> int:
    items = catalog.load(db.connect())
    out = []
    for it, why in catalog.top(items, cfg, args.kriterijum, limit=args.limit):
        d = it.to_dict()
        d["zasto"] = why
        out.append(d)
    _out({"kriterijumi": catalog.TOP_CRITERIA, "ponude": out}, args.json,
         lambda: [console.print(f"{d['id'][:8]}  {d.get('date_from') or '—'}  {d['destination']}  ({d['agencija']})  {d['zasto']}") for d in out])
    return 0


def cmd_diy(cfg: Config, args) -> int:
    conn = db.connect()
    if args.sub == "sacuvaj":
        raw = sys.stdin.read() if args.fajl == "-" else Path(args.fajl).read_text(encoding="utf-8-sig")
        data = json.loads(raw)
        ids = diy.sacuvaj(conn, data if isinstance(data, list) else [data], cfg.profile.rsd_per_eur)
        _out({"sacuvano": ids}, args.json, lambda: console.print(f"Sačuvano: {', '.join(ids)}"))
    elif args.sub == "obrisi":
        ok = diy.obrisi(conn, args.id)
        _out({"obrisano": ok}, args.json, lambda: console.print("Obrisano." if ok else "Nema te kombinacije."))
    else:
        data = diy.lista(conn, " ".join(args.kuda) if args.kuda else None)
        _out(data, args.json, lambda: [console.print(
            f"{k['id']}  {k.get('kuda')}  {k.get('od')}–{k.get('do')}  {k.get('naslov') or ''}  ukupno ~{k['ukupno']:.0f} €")
            for k in data])
    return 0


def cmd_state(cfg: Config, args) -> int:
    conn = db.connect()
    last = conn.execute("SELECT MAX(started_at) FROM runs").fetchone()[0]
    n = len(catalog.load(conn))
    from datetime import datetime
    dana = (datetime.now() - datetime.fromisoformat(last)).days if last else None
    data = {"poslednji_sken": last, "pre_dana": dana, "ponuda": n, "agencija": len(SCRAPERS),
            "putnika": cfg.profile.putnika}
    _out(data, args.json, lambda: console.print(f"Poslednji sken: {last or 'nikad'} · {n} ponuda"))
    return 0


def cmd_calendar(cfg: Config, args) -> int:
    data = watch.kalendar(catalog.load(db.connect()), args.mesec)

    def render():
        console.print(" · ".join(f"{m['mesec']} ({m['broj']})" for m in data["meseci"]))
        for d, lst in data["dani"].items():
            console.print(f"[bold]{d}[/]")
            for x in lst[:8]:
                console.print(f"   {x['id'][:8]}  {(x['destination'] or '')[:30]:30}  {x['agencija']:14}  {x['price'] or '—'}")
    _out(data, args.json, render)
    return 0


def cmd_watch(cfg: Config, args) -> int:
    conn = db.connect()
    items = catalog.load(conn)
    if args.id:
        row = _find_offer(conn, args.id)
        it = next((i for i in items if row and i.id == row["id"]), None)
        if not it:
            console.print("[red]Nema te ponude među aktivnim.[/]")
            return 1
        on = watch.prati(conn, it)
        _out({"id": it.id, "pratim": on}, args.json,
             lambda: console.print(("👁 Pratim: " if on else "Više ne pratim: ") + it.row["title"]))
        return 0
    data = watch.pracenje(conn, items)
    _out(data, args.json, lambda: [console.print(
        f"{d['id'][:8]}  {d['title'][:40]:40}  {d['agencija']:14}  {d['cena_pocetna']} → {d['cena_sada'] or 'nema'}")
        for d in data])
    return 0


def cmd_alerts(cfg: Config, args) -> int:
    conn = db.connect()
    data = watch.obavestenja(conn, catalog.load(conn), cfg, procitano=args.procitano)

    def render():
        for p in data["padovi"]:
            console.print(f"📉 {p['title'][:50]}  {p['javljena_cena']:.0f} → {p['cena_sada']:.0f}  ({p['agencija']})")
        for p in data["nestali"]:
            console.print(f"⚠️ nestalo sa sajta: {p['title'][:50]} ({p['agencija']})")
        for p in data["nove_po_zeljama"]:
            console.print(f"🆕 [{p['zelja']}] {p['title'][:50]}  {p.get('date_from') or ''}  ({p['agencija']})")
        if not data["ukupno"]:
            console.print("Nema novih obaveštenja.")
    _out(data, args.json, render)
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="pt", description="Putešestvije: planer putovanja")
    p.add_argument("--json", action="store_true", help="mašinski izlaz")
    sub = p.add_subparsers(dest="cmd")

    ag = sub.add_parser("agencije", help="ponude agencija").add_subparsers(dest="sub", required=True)
    s = ag.add_parser("skeniraj"); s.add_argument("--samo", nargs="*"); s.set_defaults(fn=cmd_scan)
    s = ag.add_parser("nove"); s.add_argument("--dana", type=int, default=7); s.add_argument("--sve", action="store_true", help="bez filtera profila"); s.set_defaults(fn=cmd_new)
    s = ag.add_parser("ubaci"); s.add_argument("fajl"); s.set_defaults(fn=cmd_ingest)
    s = ag.add_parser("istorija"); s.add_argument("id"); s.set_defaults(fn=cmd_history)
    s = ag.add_parser("odbij"); s.add_argument("id"); s.set_defaults(fn=cmd_reject)

    s = sub.add_parser("preporuke"); s.add_argument("--limit", type=int, default=10)
    s.add_argument("--po-agenciji", type=int, default=3, help="najviše ponuda po agenciji"); s.set_defaults(fn=cmd_recommend)

    tr = sub.add_parser("trello", help="Trello tabla").add_subparsers(dest="sub", required=True)
    s = tr.add_parser("tabla"); s.set_defaults(fn=cmd_board)
    s = tr.add_parser("predlog"); s.add_argument("id"); s.set_defaults(fn=cmd_suggest)
    s = tr.add_parser("dodaj"); s.add_argument("--lista", required=True); s.add_argument("--naslov", required=True)
    s.add_argument("--opis"); s.add_argument("--rok", help="YYYY-MM-DD"); s.add_argument("--link"); s.set_defaults(fn=cmd_add)

    s = sub.add_parser("zemlje"); s.set_defaults(fn=cmd_countries)
    s = sub.add_parser("top"); s.add_argument("kriterijum", nargs="?", default="preporuka",
                                              choices=list(catalog.TOP_CRITERIA))
    s.add_argument("--limit", type=int, default=12); s.set_defaults(fn=cmd_top)
    s = sub.add_parser("zemlja"); s.add_argument("naziv", nargs="+"); s.set_defaults(fn=cmd_country)
    s = sub.add_parser("ponuda"); s.add_argument("id"); s.add_argument("--detalji", action="store_true")
    s.add_argument("--osvezi", action="store_true"); s.set_defaults(fn=cmd_offer)
    us = sub.add_parser("uradisam", help="kombinacije prevoz + smeštaj (uradi sam)").add_subparsers(dest="sub", required=True)
    s = us.add_parser("lista"); s.add_argument("kuda", nargs="*"); s.set_defaults(fn=cmd_diy)
    s = us.add_parser("sacuvaj", help="JSON fajl (ili - za stdin) sa jednom kombinacijom ili listom")
    s.add_argument("fajl"); s.set_defaults(fn=cmd_diy)
    s = us.add_parser("obrisi"); s.add_argument("id"); s.set_defaults(fn=cmd_diy)
    s = sub.add_parser("stanje", help="kad je bio poslednji sken, koliko ponuda"); s.set_defaults(fn=cmd_state)
    s = sub.add_parser("kalendar", help="polasci po danima za mesec"); s.add_argument("mesec", nargs="?", help="YYYY-MM")
    s.set_defaults(fn=cmd_calendar)
    s = sub.add_parser("prati", help="uključi/isključi praćenje cene; bez ID-a: spisak praćenih")
    s.add_argument("id", nargs="?"); s.set_defaults(fn=cmd_watch)
    s = sub.add_parser("obavestenja", help="pad cene praćenih, nove ponude po željama")
    s.add_argument("--procitano", action="store_true", help="označi kao viđeno"); s.set_defaults(fn=cmd_alerts)
    s = sub.add_parser("izabrano"); s.add_argument("--poslato", nargs="*"); s.set_defaults(fn=cmd_picked)

    s = sub.add_parser("profil"); s.set_defaults(fn=cmd_profile)
    s = sub.add_parser("init"); s.add_argument("--force", action="store_true"); s.set_defaults(fn=cmd_init)
    return p


def main(argv: list[str] | None = None) -> int:
    # Windows: izlaz ka panou i terminalu uvek u UTF-8 (č, ć, đ, emoji), ne u cp1252.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    argv = list(sys.argv[1:] if argv is None else argv)
    as_json = "--json" in argv
    argv = [a for a in argv if a != "--json"]
    args = build_parser().parse_args(argv)
    args.json = as_json
    cfg = load()
    if not getattr(args, "fn", None):
        build_parser().print_help()
        print("\nPregled ponuda: u Claude Code-u ukucaj /putovanja")
        return 0
    return args.fn(cfg, args)


if __name__ == "__main__":
    sys.exit(main())
