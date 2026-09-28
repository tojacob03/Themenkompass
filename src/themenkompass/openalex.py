"""A small, cost-aware OpenAlex client.

OpenAlex bills API usage in US dollars with a free daily allowance ($1 with a free key,
$0.10 without). This client makes it hard to spend money by accident:

* only filter/list and single-entity endpoints are allowed - no full-text search,
  no content downloads (both are priced much higher);
* every response's ``X-RateLimit-*`` headers are tracked, and the run stops before the
  per-run cap or the remaining free budget is reached;
* responses are cached on disk, so re-running the pipeline is free.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import logging
import os
import time
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from themenkompass.config import Budget

log = logging.getLogger(__name__)

BASE_URL = "https://api.openalex.org"
ALLOWED_ENDPOINTS = ("works", "authors", "institutions", "topics", "subfields", "fields")
# Price of one list/filter call according to https://help.openalex.org/access/pricing/
LIST_CALL_USD = 0.0001
RETRY_STATUS = {429, 500, 502, 503, 504}

JSON = dict[str, Any]


class BudgetExceededError(RuntimeError):
    """The next request would leave the free allowance or the per-run cap."""


class ForbiddenRequestError(ValueError):
    """The request uses a priced feature this project deliberately avoids."""


@dataclass
class Spend:
    """Running tally of what this run has cost according to OpenAlex's own headers."""

    budget: Budget
    requests: int = 0
    cached: int = 0
    usd: float = 0.0
    remaining_usd: float | None = None

    def check(self, expected_usd: float = LIST_CALL_USD) -> None:
        if self.requests >= self.budget.max_requests_per_run:
            raise BudgetExceededError(
                f"request cap reached ({self.budget.max_requests_per_run} requests)"
            )
        if self.usd + expected_usd > self.budget.max_usd_per_run + 1e-9:
            raise BudgetExceededError(
                f"per-run cap reached (${self.usd:.4f} of ${self.budget.max_usd_per_run:.2f})"
            )
        if (
            self.remaining_usd is not None
            and self.remaining_usd - expected_usd < self.budget.min_remaining_usd - 1e-9
        ):
            raise BudgetExceededError(
                f"free daily allowance nearly used (${self.remaining_usd:.4f} left)"
            )

    def record(self, headers: Mapping[str, str]) -> None:
        self.requests += 1
        cost = _float(headers.get("x-ratelimit-cost-usd"))
        self.usd += cost if cost is not None else LIST_CALL_USD
        remaining = _float(headers.get("x-ratelimit-remaining-usd"))
        if remaining is not None:
            self.remaining_usd = remaining
        prepaid = _float(headers.get("x-ratelimit-prepaid-remaining-usd"))
        if prepaid:
            # Prepaid credit would be drawn once the free allowance is gone. We never
            # want that, so treat the free part as the only budget.
            log.warning("account has prepaid credit; the pipeline will not touch it")

    def summary(self) -> str:
        left = "unknown" if self.remaining_usd is None else f"${self.remaining_usd:.4f}"
        return (
            f"{self.requests} API requests, {self.cached} from cache, "
            f"cost ${self.usd:.4f} (free allowance left today: {left})"
        )


def _float(value: str | None) -> float | None:
    try:
        return float(value) if value is not None else None
    except ValueError:
        return None


@dataclass
class DiskCache:
    directory: Path
    ttl_seconds: float = 20 * 24 * 3600
    clock: Callable[[], float] = field(default=time.time)

    def _path(self, key: str) -> Path:
        digest = hashlib.sha256(key.encode()).hexdigest()
        return self.directory / digest[:2] / f"{digest}.json.gz"

    def get(self, key: str) -> JSON | None:
        path = self._path(key)
        if not path.exists() or self.clock() - path.stat().st_mtime > self.ttl_seconds:
            return None
        with gzip.open(path, "rt", encoding="utf-8") as fh:
            data: JSON = json.load(fh)
        return data

    def set(self, key: str, value: JSON) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        with gzip.open(tmp, "wt", encoding="utf-8") as fh:
            json.dump(value, fh)
        tmp.replace(path)


class OpenAlexClient:
    def __init__(
        self,
        budget: Budget,
        *,
        api_key: str | None = None,
        cache: DiskCache | None = None,
        transport: httpx.BaseTransport | None = None,
        sleep: Callable[[float], None] = time.sleep,
        max_attempts: int = 6,
        min_interval: float = 0.12,
    ) -> None:
        self.api_key = api_key if api_key is not None else os.environ.get("OPENALEX_API_KEY")
        self.spend = Spend(budget)
        self.cache = cache
        self._sleep = sleep
        self._max_attempts = max_attempts
        self._min_interval = min_interval
        self._last_request = 0.0
        headers = {"User-Agent": "themenkompass (+https://github.com/tojacob03/forschungsatlas)"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        self._http = httpx.Client(
            base_url=BASE_URL, headers=headers, timeout=60.0, transport=transport
        )

    def close(self) -> None:
        self._http.close()

    def __enter__(self) -> OpenAlexClient:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    @staticmethod
    def _validate(endpoint: str, params: Mapping[str, str]) -> None:
        root = endpoint.strip("/").split("/")[0]
        if root not in ALLOWED_ENDPOINTS:
            raise ForbiddenRequestError(f"endpoint '{endpoint}' is not used by this project")
        if "search" in params or ".search" in params.get("filter", ""):
            raise ForbiddenRequestError("search queries are priced 10x higher; use filters")
        if "content" in endpoint:
            raise ForbiddenRequestError("content downloads are not used by this project")

    def get(self, endpoint: str, params: Mapping[str, str] | None = None) -> JSON:
        params = dict(params or {})
        self._validate(endpoint, params)
        key = endpoint + "?" + "&".join(f"{k}={v}" for k, v in sorted(params.items()))
        if self.cache and (hit := self.cache.get(key)) is not None:
            self.spend.cached += 1
            return hit
        is_single = "/" in endpoint.strip("/")
        data = self._request(endpoint, params, expected_usd=0.0 if is_single else LIST_CALL_USD)
        if self.cache:
            self.cache.set(key, data)
        return data

    def _request(self, endpoint: str, params: dict[str, str], expected_usd: float) -> JSON:
        delay = 1.0
        for attempt in range(1, self._max_attempts + 1):
            self.spend.check(expected_usd)
            wait = self._min_interval - (time.monotonic() - self._last_request)
            if wait > 0:
                self._sleep(wait)
            self._last_request = time.monotonic()
            try:
                response = self._http.get("/" + endpoint.strip("/"), params=params)
            except httpx.TransportError as exc:
                if attempt == self._max_attempts:
                    raise
                log.warning("transport error (%s), retrying in %.0fs", exc, delay)
                self._sleep(delay)
                delay = min(delay * 2, 60)
                continue

            self.spend.record(response.headers)
            if (
                response.status_code == 429
                and self.spend.remaining_usd is not None
                and self.spend.remaining_usd <= self.spend.budget.min_remaining_usd
            ):
                raise BudgetExceededError("OpenAlex reports the daily allowance is used up")
            if response.status_code in RETRY_STATUS and attempt < self._max_attempts:
                retry_after = _float(response.headers.get("retry-after"))
                pause = min(retry_after if retry_after is not None else delay, 60)
                log.warning("HTTP %s, retrying in %.0fs", response.status_code, pause)
                self._sleep(pause)
                delay = min(delay * 2, 60)
                continue
            response.raise_for_status()
            data: JSON = response.json()
            return data
        raise RuntimeError("unreachable")  # pragma: no cover

    def paginate(
        self,
        endpoint: str,
        params: Mapping[str, str] | None = None,
        *,
        per_page: int = 100,
        max_pages: int = 1000,
    ) -> Iterator[JSON]:
        """Yield every result of a list endpoint using cursor paging."""
        cursor: str | None = "*"
        pages = 0
        while cursor and pages < max_pages:
            page = self.get(
                endpoint, {**(params or {}), "per_page": str(per_page), "cursor": cursor}
            )
            pages += 1
            results = page.get("results", [])
            if pages == 1:
                log.info("%s: %s results", endpoint, page.get("meta", {}).get("count"))
            yield from results
            cursor = page.get("meta", {}).get("next_cursor") if results else None
