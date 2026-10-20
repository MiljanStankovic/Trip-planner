"""Trello REST (opciono). Treba TRELLO_KEY i TRELLO_TOKEN u okruženju.

Ključ: https://trello.com/power-ups/admin -> napravi Power-Up -> API key, pa iz njega token.
Claude u Claude Code-u koristi zvanični Trello MCP; ovaj modul služi CLI-ju (tabla, dodavanje predloga).
"""

from __future__ import annotations

import requests

from .config import TrelloCfg

API = "https://api.trello.com/1"


class TrelloError(Exception):
    pass


class Trello:
    def __init__(self, cfg: TrelloCfg):
        if not cfg.key or not cfg.token:
            raise TrelloError("Nema TRELLO_KEY/TRELLO_TOKEN u okruženju (vidi README, sekcija Trello).")
        self.cfg = cfg
        self.auth = {"key": cfg.key, "token": cfg.token}

    def _req(self, method: str, path: str, **params) -> object:
        r = requests.request(method, f"{API}{path}", params={**self.auth, **params}, timeout=20)
        if r.status_code >= 400:
            raise TrelloError(f"Trello {r.status_code}: {r.text[:200]}")
        return r.json()

    def board(self) -> list[dict]:
        """Liste sa otvorenim karticama."""
        lists = self._req("GET", f"/boards/{self.cfg.board_id}/lists", cards="open", card_fields="name,due,url")
        return lists  # type: ignore[return-value]

    def add_card(self, list_key: str, name: str, desc: str = "", due: str | None = None, url: str | None = None) -> dict:
        list_id = self.cfg.lists.get(list_key, list_key)
        params = {"idList": list_id, "name": name, "desc": desc, "pos": "top"}
        if due:
            params["due"] = due
        card = self._req("POST", "/cards", **params)
        if url:
            self._req("POST", f"/cards/{card['id']}/attachments", url=url)  # type: ignore[index]
        return card  # type: ignore[return-value]
