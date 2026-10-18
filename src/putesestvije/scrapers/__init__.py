"""Registar agencija.

Agencije koje ovde nemaju parser (npr. Filip Travel, čiji sajt odbija skripte,
ili sajtovi koji cene učitavaju JavaScript-om) čita Claude preko WebFetch-a i
ubacuje ih komandom `pt agencije ubaci`.
"""

from .argus import Argus
from .base import BlockedByRobots, ScrapeResult, Scraper
from .bigblue import BigBlue
from .felix import Felix
from .fibula import Fibula
from .grandtours import GrandTours
from .kontiki import Kontiki
from .odeon import Odeon
from .travelland import Travelland

SCRAPERS: dict[str, type[Scraper]] = {
    s.source: s for s in (Travelland, Argus, GrandTours, Felix, Fibula, Kontiki, BigBlue, Odeon)
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
    "ponte": {"name": "Ponte Travel", "pages": ["https://www.ponte.rs/"]},
    "plana": {"name": "Plana Tours", "pages": ["https://www.planatours.rs/"]},
}

SKIPPED: dict[str, str] = {}

__all__ = ["SCRAPERS", "CLAUDE_SOURCES", "SKIPPED", "Scraper", "ScrapeResult", "BlockedByRobots"]
