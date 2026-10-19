"""Podešavanja: profil putnika, agencije i Trello. Fajl: config.toml."""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

DEFAULT_CONFIG_PATHS = [
    Path(os.environ["PT_CONFIG"]) if os.environ.get("PT_CONFIG") else None,
    Path.cwd() / "config.toml",
    Path.home() / ".config" / "putovanja" / "config.toml",
]


def data_dir() -> Path:
    d = Path(os.environ.get("PT_DATA", Path.home() / ".local" / "share" / "putovanja"))
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
    odraslih: int = 2  # koliko odraslih putuje
    dece: int = 0  # koliko dece putuje
    uzrast_dece: list[int] = field(default_factory=list)  # godine dece, za popuste

    @property
    def putnika(self) -> int:
        return max(1, self.odraslih + self.dece)


@dataclass
class TrelloCfg:
    board_id: str = ""
    lists: dict[str, str] = field(default_factory=dict)
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
    excluded: list[str] = field(default_factory=list)
    path: Path | None = None

    @property
    def agencies(self) -> list[str]:
        """Sve agencije koje alat zna, osim isključenih; nove agencije se uključuju same."""
        from .scrapers import SCRAPERS
        return [s for s in SCRAPERS if s not in self.excluded]


def load() -> Config:
    for p in DEFAULT_CONFIG_PATHS:
        if p and p.is_file():
            raw = tomllib.loads(p.read_text(encoding="utf-8-sig"))
            cfg = Config(path=p)
            for k, v in raw.get("profil", {}).items():
                if k == "putnika":  # stari ključ: broj odraslih
                    cfg.profile.odraslih = int(v)
                elif hasattr(cfg.profile, k) and k != "putnika":
                    setattr(cfg.profile, k, v)
            t = raw.get("trello", {})
            if "board_id" in t:
                cfg.trello.board_id = t["board_id"]
            cfg.trello.lists.update(t.get("lists", {}))
            if "agencije" in raw:
                cfg.excluded = list(raw["agencije"].get("iskljucene", []))
            return cfg
    return Config()
