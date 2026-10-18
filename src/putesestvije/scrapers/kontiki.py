"""Kontiki: ista platforma kao Big Blue (meni sa linkovima /tour/ i /location/ i datumima)."""

from __future__ import annotations

import re

from .bigblue import BigBlue


class Kontiki(BigBlue):
    source = "kontiki"
    name = "Kontiki"
    pages = ["https://kontiki.rs/sr/"]

    def parse(self, html, url):
        offers = super().parse(html, url)
        for o in offers:
            o.source = self.source
            o.url = re.sub(r"^https://bigblue\.rs/", "https://kontiki.rs/", o.url).replace("/sr/sr/", "/sr/")
            # "Andaluzijska tura (27.12.2026.)" -> "Andaluzijska tura"
            o.destination = re.sub(r"\s*\(.*$", "", o.destination).strip()
        return offers
