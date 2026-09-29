"""Download the raw OpenAlex records an institution needs."""

from __future__ import annotations

import logging
from collections.abc import Iterable

from themenkompass.config import Config
from themenkompass.openalex import JSON, OpenAlexClient

log = logging.getLogger(__name__)

WORK_FIELDS = (
    "id",
    "doi",
    "display_name",
    "publication_year",
    "type",
    "language",
    "primary_location",
    "authorships",
    "is_authors_truncated",
    "primary_topic",
    "topics",
)


def works_filter(config: Config, years: tuple[int, int]) -> str:
    return ",".join(
        [
            # lineage also finds works of sub-institutions that OpenAlex models separately
            f"authorships.institutions.lineage:{config.openalex_id}",
            f"publication_year:{years[0]}-{years[1]}",
            "type:" + "|".join(config.scope.work_types),
            "is_retracted:false",
        ]
    )


def fetch_works(client: OpenAlexClient, config: Config, years: tuple[int, int]) -> list[JSON]:
    """All works of the institution in the window, de-duplicated by OpenAlex id."""
    params = {"filter": works_filter(config, years), "select": ",".join(WORK_FIELDS)}
    seen: dict[str, JSON] = {}
    for work in client.paginate("works", params):
        seen[work["id"]] = work
    log.info("fetched %d works (%s)", len(seen), client.spend.summary())
    return list(seen.values())


def resolve_authors(client: OpenAlexClient, author_ids: Iterable[str]) -> dict[str, str]:
    """Map author ids to their current canonical id.

    OpenAlex merges duplicate author profiles from time to time; the old id then
    redirects to the surviving one. Single-entity lookups are free.
    """
    resolved: dict[str, str] = {}
    for author_id in sorted(set(author_ids)):
        record = client.get(f"authors/{author_id}", {"select": "id"})
        resolved[author_id] = short_id(record["id"])
    return resolved


def short_id(openalex_url: str) -> str:
    """'https://openalex.org/A123' -> 'A123'."""
    return openalex_url.rsplit("/", 1)[-1]
