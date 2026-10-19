"""Izvoz baze u JSON fajlove za server (Cloudflare čita ove fajlove, ne bazu).

    python server/izvezi.py <izlazni-folder> [--detalji N]

Pravi:
  katalog.json   sve aktivne ponude (isto što pano dobija od `pt zemlja`)
  zemlje.json    kontinenti → zemlje → broj ponuda
  top.json       preporučene ponude (podrazumevani profil)
  izvori.json    stanje agencija posle skena
  stanje.json    kad je sken, koliko ponuda
  detalji.json   detalji ponuda sa sajtova (obuhvata, doplate, popusti), za prvih N ponuda
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def pt(*args: str) -> object:
    r = subprocess.run([sys.executable, "-m", "putovanja.cli", "--json", *args], capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        print(f"pt {' '.join(args)}: {r.stderr.strip()[-300:]}", file=sys.stderr)
        return None
    return json.loads(r.stdout or "null")


def main() -> int:
    izlaz = Path(sys.argv[1] if len(sys.argv) > 1 else "podaci")
    izlaz.mkdir(parents=True, exist_ok=True)
    n_detalja = int(sys.argv[sys.argv.index("--detalji") + 1]) if "--detalji" in sys.argv else 0

    from putovanja import catalog, db

    conn = db.connect()
    ponude = [it.to_dict() for it in catalog.load(conn)]
    pisi = lambda ime, x: (izlaz / ime).write_text(json.dumps(x, ensure_ascii=False, default=str), encoding="utf-8")
    pisi("katalog.json", ponude)
    for ime, args in [("zemlje.json", ["zemlje"]), ("top.json", ["top", "preporuka", "--limit", "60"]),
                      ("izvori.json", ["izvori"]), ("stanje.json", ["stanje"])]:
        pisi(ime, pt(*args))

    detalji: dict[str, object] = {}
    if n_detalja:
        for p in ponude[:n_detalja]:
            d = pt("ponuda", p["id"][:12], "--detalji", "--osobe", "1")
            if isinstance(d, dict):
                detalji[p["id"]] = {k: d.get(k) for k in ("sa_sajta", "ukupno", "popusti")}
        pisi("detalji.json", detalji)

    greske = sum(1 for d in detalji.values() if (d.get("sa_sajta") or {}).get("greska"))  # type: ignore[union-attr]
    print(f"ponuda: {len(ponude)}, detalja: {len(detalji)} (sa greškom {greske})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
