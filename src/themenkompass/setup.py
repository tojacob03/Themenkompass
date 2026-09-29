"""Help set up a new institution: find its ROR and OpenAlex ids and sub-institutions.

    uv run themenkompass find-institution "University of Example"

ROR (https://ror.org, CC0) is only used here, a few requests per setup. Without a ROR
client id the API allows 50 requests per 5 minutes, which is plenty.
"""

from __future__ import annotations

from typing import Any

import httpx

from themenkompass.fetch import short_id
from themenkompass.openalex import OpenAlexClient

ROR_API = "https://api.ror.org/v2/organizations"


def search_ror(http: httpx.Client, name: str, limit: int = 5) -> list[dict[str, str]]:
    response = http.get(ROR_API, params={"query": name})
    response.raise_for_status()
    out = []
    for item in response.json().get("items", [])[:limit]:
        names = item.get("names") or []
        label = next((n["value"] for n in names if "ror_display" in n.get("types", [])), None)
        city = ((item.get("locations") or [{}])[0].get("geonames_details") or {}).get("name", "")
        out.append(
            {
                "ror": short_id(item["id"]),
                "name": label or (names[0]["value"] if names else item["id"]),
                "city": city,
                "status": item.get("status", ""),
            }
        )
    return out


def openalex_institution(client: OpenAlexClient, ror: str) -> dict[str, Any]:
    """OpenAlex id and sub-institutions (free single-entity lookups plus one list call)."""
    record = client.get(f"institutions/ror:{ror}", {"select": "id,display_name,works_count"})
    oid = short_id(record["id"])
    children = client.get(
        "institutions",
        {"filter": f"lineage:{oid}", "select": "id,display_name,type", "per_page": "50"},
    ).get("results", [])
    return {
        "openalex_id": oid,
        "name": record.get("display_name"),
        "works": record.get("works_count"),
        "children": [
            {"id": short_id(c["id"]), "name": c.get("display_name"), "type": c.get("type")}
            for c in children
            if short_id(c["id"]) != oid
        ],
    }


def config_skeleton(slug: str, ror: str, info: dict[str, Any]) -> str:
    lines = [
        f"# Themenkompass configuration: {info['name']}",
        "",
        "[institution]",
        f'slug = "{slug}"',
        f'ror = "{ror}"',
        f'openalex_id = "{info["openalex_id"]}"',
        f'name_de = "{info["name"]}"',
        f'name_en = "{info["name"]}"',
        f'aliases = ["{info["name"]}"]',
        "",
        "[site]",
        'repository = "https://github.com/<you>/<repo>"',
        "",
        "[[faculties]]",
        'id = "f1"',
        'name_de = "..."',
        'name_en = "..."',
        "patterns = []",
        "",
        "# Build units from: uv run themenkompass --config config/<slug>.toml affiliations",
    ]
    for child in info["children"]:
        lines += [
            "",
            f"# OpenAlex sub-institution: {child['name']} ({child['type']})",
            "# [[units]]",
            f'# institutions = ["{child["id"]}"]',
        ]
    return "\n".join(lines) + "\n"
