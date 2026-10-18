"""Registar agencija.

Agencije koje ovde nemaju parser (npr. Filip Travel, čiji sajt odbija skripte)
čita Claude preko WebFetch-a i ubacuje ih komandom `pt agencije ubaci`.
Kontiki zabranjuje automatsko čitanje u robots.txt, pa se ne čita.
"""

from .base import BlockedByRobots, ScrapeResult, Scraper
from .bigblue import BigBlue
from .odeon import Odeon
from .travelland import Travelland

SCRAPERS: dict[str, type[Scraper]] = {
    s.source: s for s in (Travelland, BigBlue, Odeon)
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

SKIPPED = {
    "kontiki": "Kontiki: robots.txt zabranjuje automatsko čitanje, otvori kontiki.rs ručno",
}

__all__ = ["SCRAPERS", "CLAUDE_SOURCES", "SKIPPED", "Scraper", "ScrapeResult", "BlockedByRobots"]
