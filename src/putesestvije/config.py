"""Podešavanja: profil putnika, agencije i Trello. Fajl: config.toml."""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_CONFIG_PATHS = [
    Path(os.environ["PT_CONFIG"]) if os.environ.get("PT_CONFIG") else None,
    Path.cwd() / "config.toml",
    Path.home() / ".config" / "putesestvije" / "config.toml",
]


def data_dir() -> Path:
    d = Path(os.environ.get("PT_DATA", Path.home() / ".local" / "share" / "putesestvije"))
    d.mkdir(parents=True, exist_ok=True)
    return d


@dataclass
class Profile:
    home_airport: str = "BEG"
    alt_airports: list[str] = field(default_factory=lambda: ["BUD", "TSR", "INI"])
    currency: str = "EUR"
    budget_per_person: float | None = None  # gornja granica za jedan aranžman/put
    transport: list[str] = field(default_factory=lambda: ["avion", "autobus", "sopstveni"])
    min_days_ahead: int = 5
    max_days_ahead: int = 180
    min_nights: int = 1
    max_nights: int = 10
    likes: list[str] = field(default_factory=list)  # ključne reči: "pariz", "wellness", "advent"
    dislikes: list[str] = field(default_factory=list)  # "krstarenje", "daleka putovanja"
    rsd_per_eur: float = 117.0  # za poređenje dinarskih cena sa budžetom u EUR


@dataclass
class TrelloCfg:
    board_id: str = "6ad4cd042c7e038b9e1d453a"
    lists: dict[str, str] = field(
        default_factory=lambda: {
            "predlozi": "6ad4ddb45b18aa1da56cf30c",
            "izleti": "6ad4cd052c7e038b9e1d4540",
            "hrana": "6ad4cd88c023955397f0020b",
            "aktivnosti": "6ad4cd72dcd94f45f11d6fc3",
            "kod_kuce": "6ad4cdc023bd8ce7ee5b57a1",
            "kupovina": "6ad4d798709bba5c7617e093",
            "planirano": "6ad4d799dd62ee3c9ce31628",
            "zavrseno": "6ad4d79bfae47066fd4417ae",
            "bucketlist": "6ad4cf4c5fff27c26a3fff07",
        }
    )
    # Ključ i token se čitaju iz okruženja: TRELLO_KEY, TRELLO_TOKEN
    @property
    def key(self) -> str | None:
        return os.environ.get("TRELLO_KEY")

    @property
    def token(self) -> str | None:
        return os.environ.get("TRELLO_TOKEN")


@dataclass
class Config:
    profile: Profile = field(default_factory=Profile)
    trello: TrelloCfg = field(default_factory=TrelloCfg)
    agencies: list[str] = field(default_factory=lambda: [
        "travelland", "argus", "grandtours", "halotours", "belvi", "felix", "fibula", "jungletribe", "kontiki", "bigblue", "odeon"])
    path: Path | None = None


def load() -> Config:
    for p in DEFAULT_CONFIG_PATHS:
        if p and p.is_file():
            raw = tomllib.loads(p.read_text(encoding="utf-8-sig"))
            cfg = Config(path=p)
            for k, v in raw.get("profil", {}).items():
                if hasattr(cfg.profile, k):
                    setattr(cfg.profile, k, v)
            t = raw.get("trello", {})
            if "board_id" in t:
                cfg.trello.board_id = t["board_id"]
            cfg.trello.lists.update(t.get("lists", {}))
            if "agencije" in raw:
                cfg.agencies = raw["agencije"].get("ukljucene", cfg.agencies)
            return cfg
    return Config()
