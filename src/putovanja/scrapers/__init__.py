"""Registar agencija.

Agencije koje ovde nemaju parser (npr. Filip Travel, čiji sajt odbija skripte,
ili sajtovi koji cene učitavaju JavaScript-om) čita Claude preko WebFetch-a i
ubacuje ih komandom `pt agencije ubaci`.
"""

from .argus import Argus
from .base import BlockedByRobots, ScrapeResult, Scraper
from .belvi import Belvi
from .bigblue import BigBlue
from .felix import Felix
from .fibula import Fibula
from .grandtours import GrandTours
from .plana import Plana
from .ponte import Ponte
from .halotours import HaloTours
from .itravel import ITravel
from .jumbo import Jumbo
from .jungletribe import JungleTribe
from .kontiki import Kontiki
from .lemax import Rapsody, VivaTravel
from .odeon import Odeon
from .travelland import Travelland

SCRAPERS: dict[str, type[Scraper]] = {
    s.source: s for s in (Travelland, Argus, GrandTours, HaloTours, Belvi, Felix, Fibula, JungleTribe, Kontiki, BigBlue, Odeon,
                     VivaTravel, Rapsody, ITravel, Jumbo, Ponte, Plana)
}

# Agencije koje čita Claude (WebFetch), ne Python.
CLAUDE_SOURCES = {
    "filip": {
        "name": "Filip Travel",
        "pages": [
            "https://www.filiptravel.rs/sr/stranica/gradovi-evrope/",
            "https://www.filiptravel.rs/sr/stranica/nova-godina/",
            "https://www.filiptravel.rs/sr/stranica/wellness-i-spa/",
        ],
    },
}

SKIPPED: dict[str, str] = {
    "playtravel": "Play Travel (playtravel.rs): sajtu je istekao bezbednosni sertifikat (HTTPS), pa ga alat ne čita. Proveri ponovo kasnije.",
}

__all__ = ["SCRAPERS", "CLAUDE_SOURCES", "SKIPPED", "Scraper", "ScrapeResult", "BlockedByRobots"]
