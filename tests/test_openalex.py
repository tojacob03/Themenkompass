from __future__ import annotations

import gzip
import json
from pathlib import Path

import httpx
import pytest

from themenkompass.config import Budget
from themenkompass.openalex import (
    BudgetExceededError,
    DiskCache,
    ForbiddenRequestError,
    OpenAlexClient,
)

FREE = {"x-ratelimit-cost-usd": "0.0001", "x-ratelimit-remaining-usd": "0.9"}


def page(results: list[int], next_cursor: str | None) -> dict[str, object]:
    return {
        "meta": {"count": 5, "next_cursor": next_cursor},
        "results": [{"id": f"https://openalex.org/W{i}"} for i in results],
    }


def make_client(
    handler: httpx.MockTransport, budget: Budget | None = None, **kwargs: object
) -> tuple[OpenAlexClient, list[float]]:
    sleeps: list[float] = []
    client = OpenAlexClient(
        budget or Budget(),
        api_key="test-key",
        transport=handler,
        sleep=sleeps.append,
        min_interval=0,
        **kwargs,  # type: ignore[arg-type]
    )
    return client, sleeps


def test_cursor_pagination_collects_all_pages() -> None:
    pages = {
        "*": page([1, 2], "c2"),
        "c2": page([3, 4], "c3"),
        "c3": page([5], "c4"),
        "c4": page([], None),
    }
    seen: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=pages[request.url.params["cursor"]], headers=FREE)

    client, _ = make_client(httpx.MockTransport(handle))
    ids = [w["id"] for w in client.paginate("works", {"filter": "institutions.id:I1"})]
    assert ids == [f"https://openalex.org/W{i}" for i in range(1, 6)]
    assert seen[0].headers["Authorization"] == "Bearer test-key"
    assert seen[0].url.params["per_page"] == "100"
    assert client.spend.requests == 4


def test_retries_on_429_and_5xx_with_retry_after() -> None:
    responses = iter(
        [
            httpx.Response(503, headers=FREE),
            httpx.Response(429, headers={**FREE, "retry-after": "3"}),
            httpx.Response(200, json=page([1], None), headers=FREE),
        ]
    )
    client, sleeps = make_client(httpx.MockTransport(lambda r: next(responses)))
    assert client.get("works", {"filter": "x"})["results"]
    assert sleeps == [1.0, 3.0]


def test_retries_transport_errors_then_gives_up() -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline", request=request)

    client, sleeps = make_client(httpx.MockTransport(handle), max_attempts=3)
    with pytest.raises(httpx.ConnectError):
        client.get("works")
    assert sleeps == [1.0, 2.0]


def test_stops_when_free_allowance_is_nearly_used() -> None:
    remaining = [0.0205]

    def handle(request: httpx.Request) -> httpx.Response:
        remaining[0] -= 0.0001
        headers = {
            "x-ratelimit-cost-usd": "0.0001",
            "x-ratelimit-remaining-usd": f"{remaining[0]:.4f}",
        }
        return httpx.Response(200, json=page([1], "next"), headers=headers)

    client, _ = make_client(
        httpx.MockTransport(handle), Budget(max_usd_per_run=0.5, min_remaining_usd=0.02)
    )
    with pytest.raises(BudgetExceededError, match="allowance"):
        list(client.paginate("works"))
    # 0.0205 left before the run: five calls fit, the reserve of 0.02 is never touched
    assert client.spend.requests == 5
    assert client.spend.remaining_usd == pytest.approx(0.02)


def test_stops_at_per_run_cap() -> None:
    client, _ = make_client(
        httpx.MockTransport(lambda r: httpx.Response(200, json=page([1], "n"), headers=FREE)),
        Budget(max_usd_per_run=0.0003, min_remaining_usd=0.0),
    )
    with pytest.raises(BudgetExceededError, match="per-run cap"):
        list(client.paginate("works"))
    assert client.spend.requests == 3


def test_daily_limit_429_is_not_retried() -> None:
    headers = {"x-ratelimit-remaining-usd": "0", "x-ratelimit-cost-usd": "0"}
    client, sleeps = make_client(
        httpx.MockTransport(lambda r: httpx.Response(429, headers=headers)),
        Budget(min_remaining_usd=0.0),
    )
    with pytest.raises(BudgetExceededError, match="used up"):
        client.get("works")
    assert sleeps == []


@pytest.mark.parametrize(
    ("endpoint", "params"),
    [
        ("works", {"search": "economics"}),
        ("works", {"filter": "title.search:economics"}),
        ("works/W1/content", {}),
        ("text", {}),
    ],
)
def test_priced_features_are_refused(endpoint: str, params: dict[str, str]) -> None:
    client, _ = make_client(httpx.MockTransport(lambda r: httpx.Response(500)))
    with pytest.raises(ForbiddenRequestError):
        client.get(endpoint, params)


def test_single_entity_lookups_do_not_need_list_budget() -> None:
    client, _ = make_client(
        httpx.MockTransport(
            lambda r: httpx.Response(
                200, json={"id": "https://openalex.org/A2"}, headers={"x-ratelimit-cost-usd": "0"}
            )
        ),
        Budget(max_usd_per_run=0.0, min_remaining_usd=0.0),
    )
    assert client.get("authors/A1")["id"].endswith("A2")
    assert client.spend.usd == 0


def test_disk_cache_avoids_repeat_requests(tmp_path: Path) -> None:
    calls = 0

    def handle(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, json=page([1], None), headers=FREE)

    for _ in range(2):
        client, _ = make_client(httpx.MockTransport(handle), cache=DiskCache(tmp_path))
        client.get("works", {"filter": "x"})
    assert calls == 1
    assert client.spend.cached == 1
    # the key never lands in the cache
    for path in tmp_path.rglob("*.gz"):
        with gzip.open(path, "rt") as fh:
            assert "test-key" not in fh.read()


def test_disk_cache_expires(tmp_path: Path) -> None:
    now = [1_000_000.0]
    cache = DiskCache(tmp_path, ttl_seconds=10, clock=lambda: now[0])
    cache.set("k", {"a": 1})
    import os

    for p in tmp_path.rglob("*.gz"):
        os.utime(p, (now[0], now[0]))
    assert cache.get("k") == {"a": 1}
    now[0] += 11
    assert cache.get("k") is None


def test_keyless_client_sends_no_authorization(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENALEX_API_KEY", raising=False)
    seen: list[httpx.Request] = []

    def handle(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json=json.loads(json.dumps(page([], None))), headers=FREE)

    client = OpenAlexClient(Budget(), transport=httpx.MockTransport(handle), min_interval=0)
    client.get("works")
    assert "Authorization" not in seen[0].headers
