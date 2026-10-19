"""Pravi prozor (ugradi MCP Apps SDK u HTML) i pakuje Putovanja.mcpb.

    python mcp/napravi.py            # samo prozor.html
    python mcp/napravi.py --paket    # i .mcpb (treba npx)

SDK (@modelcontextprotocol/ext-apps, app-with-deps.js) se ugrađuje u stranicu, jer prozor
u Claude-u nema pristup internetu ni drugim fajlovima.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

OVDE = Path(__file__).parent
SDK_VERZIJA = "2.0.3"


def sdk() -> str:
    kes = OVDE / ".sdk" / f"app-with-deps-{SDK_VERZIJA}.js"
    if not kes.exists():
        kes.parent.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory() as t:
            subprocess.run(["npm", "pack", f"@modelcontextprotocol/ext-apps@{SDK_VERZIJA}", "--silent"], cwd=t, check=True)
            tgz = next(Path(t).glob("*.tgz"))
            subprocess.run(["tar", "xzf", tgz.name], cwd=t, check=True)
            shutil.copy(Path(t) / "package/dist/src/app-with-deps.js", kes)
    kod = kes.read_text(encoding="utf-8")
    # poslednji "export{a as B,...}" pretvori u window.__mcpApps = {B: a, ...}
    m = list(re.finditer(r"export\s*\{([^}]*)\};?\s*$", kod))
    if not m:
        sys.exit("SDK nema export na kraju; proveri verziju")
    parovi = []
    for deo in m[-1].group(1).split(","):
        deo = deo.strip()
        if not deo:
            continue
        lok, _, ime = deo.partition(" as ")
        parovi.append(f"{(ime or lok).strip()}:{lok.strip()}")
    return kod[: m[-1].start()] + "window.__mcpApps={" + ",".join(parovi) + "};"


def paket_putovanja() -> None:
    """Alat putovanja (isti kao za terminal) ide u paket pored servera."""
    cilj = OVDE / "src" / "putovanja"
    if cilj.exists():
        shutil.rmtree(cilj)
    shutil.copytree(OVDE.parent / "src" / "putovanja", cilj, ignore=shutil.ignore_patterns("__pycache__"))


def prozor() -> Path:
    src = (OVDE / "ui" / "prozor.src.html").read_text(encoding="utf-8")
    izlaz = OVDE / "src" / "prozor.html"
    izlaz.write_text(src.replace("/*SDK*/", sdk()), encoding="utf-8")
    return izlaz


def paket() -> Path:
    dist = OVDE / "dist"
    dist.mkdir(exist_ok=True)
    cilj = dist / "Putovanja.mcpb"
    with tempfile.TemporaryDirectory() as t:
        p = Path(t) / "putovanja"
        p.mkdir()
        for f in ["manifest.json", "pyproject.toml", "icon.png"]:
            if (OVDE / f).exists():
                shutil.copy(OVDE / f, p / f)
        shutil.copytree(OVDE / "src", p / "src", ignore=shutil.ignore_patterns("__pycache__", "demo.json"))
        subprocess.run(["npx", "-y", "@anthropic-ai/mcpb@2.1.2", "pack", str(p), str(cilj)], check=True)
    return cilj


if __name__ == "__main__":
    paket_putovanja()
    print("prozor:", prozor())
    if "--paket" in sys.argv:
        print("paket:", paket())
