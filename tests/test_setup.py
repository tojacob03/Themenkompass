from __future__ import annotations

import tomllib

import httpx

from themenkompass.config import Budget
from themenkompass.openalex import OpenAlexClient
from themenkompass.setup import config_skeleton, openalex_institution, search_ror


def test_search_ror() -> None:
    body = {
        "items": [
            {
                "id": "https://ror.org/0zzzzzz00",
                "status": "active",
                "names": [{"value": "Musteruniversität", "types": ["ror_display", "label"]}],
                "locations": [{"geonames_details": {"name": "Musterstadt"}}],
            }
        ]
    }
    http = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=body)))
    assert search_ror(http, "muster") == [
        {"ror": "0zzzzzz00", "name": "Musteruniversität", "city": "Musterstadt", "status": "active"}
    ]


def test_openalex_institution_and_skeleton() -> None:
    def handle(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("ror:0zzzzzz00"):
            return httpx.Response(
                200,
                json={
                    "id": "https://openalex.org/I1",
                    "display_name": "Musteruni",
                    "works_count": 5,
                },
            )
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "id": "https://openalex.org/I1",
                        "display_name": "Musteruni",
                        "type": "education",
                    },
                    {
                        "id": "https://openalex.org/I5",
                        "display_name": "Musterinstitut",
                        "type": "facility",
                    },
                ]
            },
        )

    client = OpenAlexClient(
        Budget(), api_key="k", transport=httpx.MockTransport(handle), min_interval=0
    )
    info = openalex_institution(client, "0zzzzzz00")
    assert info["openalex_id"] == "I1"
    assert info["children"] == [{"id": "I5", "name": "Musterinstitut", "type": "facility"}]
    text = config_skeleton("muster", "0zzzzzz00", info)
    parsed = tomllib.loads(text)
    assert parsed["institution"]["openalex_id"] == "I1"
    assert '# institutions = ["I5"]' in text
