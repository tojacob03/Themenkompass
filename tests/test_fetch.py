from __future__ import annotations

import httpx

from themenkompass.config import Config
from themenkompass.fetch import fetch_works, resolve_authors, works_filter
from themenkompass.openalex import OpenAlexClient

FREE = {"x-ratelimit-cost-usd": "0.0001", "x-ratelimit-remaining-usd": "0.9"}


def test_works_filter(config: Config) -> None:
    f = works_filter(config, (2022, 2026))
    assert "authorships.institutions.lineage:I1" in f
    assert "publication_year:2022-2026" in f
    assert "is_retracted:false" in f
    assert "type:article|" in f


def test_fetch_works_deduplicates(config: Config) -> None:
    pages = {
        "*": {"meta": {"next_cursor": "b"}, "results": [{"id": "W1"}, {"id": "W2"}]},
        "b": {"meta": {"next_cursor": None}, "results": [{"id": "W2"}, {"id": "W3"}]},
    }
    client = OpenAlexClient(
        config.budget,
        api_key="k",
        min_interval=0,
        transport=httpx.MockTransport(
            lambda r: httpx.Response(200, json=pages[r.url.params["cursor"]], headers=FREE)
        ),
    )
    assert [w["id"] for w in fetch_works(client, config, (2022, 2026))] == ["W1", "W2", "W3"]


def test_resolve_authors_follows_merges(config: Config) -> None:
    merged = {"A1": "A1", "A2": "A9"}
    client = OpenAlexClient(
        config.budget,
        api_key="k",
        min_interval=0,
        transport=httpx.MockTransport(
            lambda r: httpx.Response(
                200,
                json={"id": "https://openalex.org/" + merged[r.url.path.rsplit("/", 1)[-1]]},
                headers={"x-ratelimit-cost-usd": "0"},
            )
        ),
    )
    assert resolve_authors(client, ["A2", "A1"]) == {"A1": "A1", "A2": "A9"}
