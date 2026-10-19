"""Zajedničko preuzimanje stranica: poštuje robots.txt, jedan pokušaj po stranici."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from urllib import robotparser
from urllib.parse import urljoin, urlsplit

import requests

from ..models import Offer

USER_AGENT = "Mozilla/5.0 (putesestvije-cli; licni planer putovanja)"
_robots_cache: dict[str, robotparser.RobotFileParser | None] = {}


class BlockedByRobots(Exception):
    pass


def allowed_by_robots(url: str) -> bool:
    parts = urlsplit(url)
    root = f"{parts.scheme}://{parts.netloc}"
    if root not in _robots_cache:
        rp = robotparser.RobotFileParser()
        try:
            r = requests.get(urljoin(root, "/robots.txt"), headers={"User-Agent": USER_AGENT}, timeout=15)
            if r.status_code >= 400:
                _robots_cache[root] = None  # nema robots.txt -> dozvoljeno
            else:
                rp.parse(r.text.splitlines())
                _robots_cache[root] = rp
        except requests.RequestException:
            _robots_cache[root] = None
    rp = _robots_cache[root]
    return True if rp is None else rp.can_fetch(USER_AGENT, url)


def fetch(url: str, timeout: int = 30) -> str:
    if not allowed_by_robots(url):
        raise BlockedByRobots(url)
    r = requests.get(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
                                    "Accept-Language": "sr,en;q=0.8"}, timeout=timeout)
    r.raise_for_status()
    r.encoding = r.apparent_encoding or r.encoding
    return r.text


@dataclass
class ScrapeResult:
    source: str
    offers: list[Offer] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


class Scraper:
    """Osnovna klasa. Podklase daju `source`, `pages` i `parse(html, url)`."""

    source: str = ""
    name: str = ""
    pages: list[str] = []
    delay_s: float = 1.5

    def parse(self, html: str, url: str) -> list[Offer]:  # pragma: no cover
        raise NotImplementedError

    def run(self) -> ScrapeResult:
        res = ScrapeResult(self.source)
        seen: set[str] = set()
        for i, url in enumerate(self.pages):
            if i:
                time.sleep(self.delay_s)
            try:
                html = fetch(url)
            except BlockedByRobots:
                res.errors.append(f"{url}: robots.txt ne dozvoljava čitanje, preskočeno")
                continue
            except requests.RequestException as e:
                res.errors.append(f"{url}: {e}")
                continue
            for o in self.parse(html, url):
                if o.offer_id not in seen:
                    seen.add(o.offer_id)
                    res.offers.append(o)
        return res
