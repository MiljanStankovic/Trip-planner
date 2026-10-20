"""Izvoz baze u male JSON fajlove za server (Cloudflare čita ove fajlove, ne bazu).

    python server/izvezi.py <izlazni-folder> [--detalji N] [--niti 6]

Fajlovi su mali namerno: besplatan Cloudflare dozvoljava malo računanja po pozivu,
pa server čita samo ono što mu treba (jednu zemlju, jednu ponudu, jedan mesec).

  zemlje.json, top.json, izvori.json, stanje.json
  fajlovi.json            ime zemlje → ime fajla
  zemlja/<fajl>.json      ponude jedne zemlje (isto što pano dobija od `pt zemlja`)
  kalendar/<YYYY-MM>.json polasci po danima
  ponuda/<id>.json        ponuda sa detaljima sa sajta i procenom ukupne cene za 1–4 osobe
"""

from __future__ import annotations

import hashlib
import json
import sys
import threading
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


def ime_fajla(naziv: str) -> str:
    t = unicodedata.normalize("NFKD", naziv.replace("đ", "dj").replace("Đ", "Dj")).encode("ascii", "ignore").decode().lower()
    t = "".join(c if c.isalnum() else "-" for c in t).strip("-")
    return (t or "x")[:40] + "-" + hashlib.sha1(naziv.encode()).hexdigest()[:6]


def main() -> int:
    izlaz = Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "podaci")
    arg = lambda ime, pod: int(sys.argv[sys.argv.index(ime) + 1]) if ime in sys.argv else pod
    n_detalja, niti = arg("--detalji", 0), arg("--niti", 6)

    from putovanja import catalog, cli, db, details, ukupno, watch
    from putovanja.config import load as ucitaj_cfg

    cfg = ucitaj_cfg()
    conn = db.connect()
    stavke = catalog.load(conn)
    for d in ("zemlja", "kalendar", "ponuda"):
        (izlaz / d).mkdir(parents=True, exist_ok=True)

    def pisi(ime: str, x: object) -> None:
        (izlaz / ime).write_text(json.dumps(x, ensure_ascii=False, default=str, separators=(",", ":")), encoding="utf-8")

    # zemlje i lista po zemlji
    stablo = {k: dict(v.most_common()) for k, v in catalog.tree(stavke).items()}
    pisi("zemlje.json", stablo)
    fajlovi = {}
    indeks = []
    for zemlje in stablo.values():
        for z in zemlje:
            fajlovi[z] = ime_fajla(z)
            redovi = [it.to_dict() for it in catalog.sort_items(catalog.by_country(stavke, z), "datum")]
            redovi = cli._dodaj_popuste(conn, redovi)
            pisi(f"zemlja/{fajlovi[z]}.json", redovi)
            indeks += redovi
    pisi("fajlovi.json", fajlovi)
    # za pretragu: sve ponude u jednom fajlu, samo polja koja trebaju listi
    # (mali fajl: server ga čita za svaku pretragu, a besplatni Cloudflare daje malo procesorskog vremena)
    POLJA = ("id", "title", "naziv", "destination", "zemlja", "agencija", "price", "old_price", "currency",
             "date_from", "nights", "transport", "url", "svi_datumi")
    pisi("indeks.json", [{k: (r.get(k)[:12] if k == "svi_datumi" else r.get(k)) for k in POLJA if r.get(k) not in (None, [], "")}
                         for r in indeks])

    top = [{**it.to_dict(), "zasto": why} for it, why in catalog.top(stavke, cfg, "preporuka", limit=60)]
    pisi("top.json", {"ponude": cli._dodaj_popuste(conn, top)})
    (izlaz / "top").mkdir(parents=True, exist_ok=True)
    for k in catalog.TOP_CRITERIA:
        po = [{**it.to_dict(), "zasto": why} for it, why in catalog.top(stavke, cfg, k, limit=60)]
        pisi(f"top/{k}.json", {"ponude": cli._dodaj_popuste(conn, po)})

    # kalendar po mesecima
    prvi = watch.kalendar(stavke, None)
    for m in prvi["meseci"]:
        pisi(f"kalendar/{m['mesec']}.json", watch.kalendar(stavke, m["mesec"]))

    # ponude: detalji sa sajta (paralelno; uspešni se pamte u bazi, pa sledeći sken čita samo nove)
    lokalno = threading.local()

    def veza():
        if not hasattr(lokalno, "c"):
            lokalno.c = db.connect()
            lokalno.c.execute("PRAGMA busy_timeout=20000")
        return lokalno.c

    def jedna(it, sa_detaljima: bool) -> bool:
        c = veza()
        d = it.to_dict()
        d["sa_sajta"] = details.get(c, it.id, it.row["url"]) if sa_detaljima else None
        d["ukupno_po"] = {str(n): ukupno.proceni(d, d.get("sa_sajta"), n) for n in (1, 2, 3, 4)}
        cli._dodaj_popuste(c, [d])
        pisi(f"ponuda/{it.id}.json", d)
        return bool(d["sa_sajta"] and not d["sa_sajta"].get("greska"))

    sa = {it.id for it in stavke[:n_detalja]} if n_detalja >= 0 else set()
    with ThreadPoolExecutor(niti) as ex:
        ok = sum(ex.map(lambda it: jedna(it, it.id in sa), stavke))

    for ime, args in [("izvori.json", ["izvori"]), ("stanje.json", ["stanje"])]:
        import subprocess
        r = subprocess.run([sys.executable, "-m", "putovanja.cli", "--json", *args], capture_output=True, text=True, encoding="utf-8")
        pisi(ime, json.loads(r.stdout or "null"))

    print(f"ponuda: {len(stavke)}, zemalja: {len(fajlovi)}, meseci: {len(prvi['meseci'])}, detalja sa sajta: {ok}/{len(sa)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
