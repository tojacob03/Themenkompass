from __future__ import annotations

from pathlib import Path
from typing import Any

import httpx
import pytest

from themenkompass.config import Config
from themenkompass.model import build
from themenkompass.validation import (
    classify_missing,
    compare,
    draw_sample,
    orcid_works,
    summarise,
    write_sample,
)


def test_compare_matches_doi_then_title() -> None:
    reference = [
        {"year": 2024, "title": "Wages on imaginary islands", "doi": "10.0000/w1"},
        {"year": 2024, "title": "Pricing Data That Does Not Exist!", "doi": None},
        {"year": 2025, "title": "Something only on ORCID", "doi": "10.0000/zz"},
    ]
    ours = [
        {"year": 2024, "title": "A different title, same DOI", "doi": "10.0000/W1"},
        {"year": 2024, "title": "Pricing data that does not exist", "doi": "10.0000/w2"},
        {"year": 2025, "title": "Only in Themenkompass", "doi": None},
    ]
    found, missing, extra = compare(reference, ours)
    assert [f["doi"] for f in found] == ["10.0000/w1", None]
    assert [m["title"] for m in missing] == ["Something only on ORCID"]
    assert [e["title"] for e in extra] == ["Only in Themenkompass"]


def test_orcid_works_filters_years_and_types() -> None:
    def summary(year: str, kind: str, title: str) -> dict[str, Any]:
        return {
            "work-summary": [
                {
                    "type": kind,
                    "title": {"title": {"value": title}},
                    "publication-date": {"year": {"value": year}},
                    "external-ids": {
                        "external-id": [
                            {
                                "external-id-type": "doi",
                                "external-id-value": "10.1/ABC",
                                "external-id-relationship": "self",
                            }
                        ]
                    },
                }
            ]
        }

    body = {
        "group": [
            summary("2024", "journal-article", "In"),
            summary("2019", "journal-article", "Too old"),
            summary("2024", "conference-poster", "Poster"),
        ]
    }
    http = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=body)))
    works = orcid_works(http, "0000-0000-0000-0001", (2023, 2025))
    assert works == [{"year": 2024, "title": "In", "doi": "10.1/abc"}]


@pytest.mark.parametrize(
    ("record", "expected"),
    [
        (None, "not_in_openalex"),
        ({"authorships": [{"author": {"id": "https://openalex.org/A999"}}]}, "other_profile"),
        (
            {
                "authorships": [
                    {"author": {"id": "https://openalex.org/A101"}, "institutions": [{"id": "I2"}]}
                ]
            },
            "no_affiliation",
        ),
        (
            {
                "type": "dataset",
                "publication_year": 2024,
                "authorships": [
                    {"author": {"id": "A101"}, "institutions": [{"id": "https://openalex.org/I1"}]}
                ],
            },
            "out_of_scope",
        ),
        (
            {
                "type": "article",
                "publication_year": 2024,
                "authorships": [
                    {"author": {"id": "A101"}, "institutions": [{"id": "https://openalex.org/I1"}]}
                ],
            },
            "unexplained",
        ),
    ],
)
def test_classify_missing(config: Config, record: dict[str, Any] | None, expected: str) -> None:
    def lookup(doi: str) -> dict[str, Any]:
        if record is None:
            raise RuntimeError("404")
        return record

    work = {"year": 2024, "title": "x", "doi": "10.0000/x"}
    assert classify_missing(lookup, work, "A101", config, (2023, 2025)) == expected
    assert classify_missing(lookup, {**work, "doi": None}, "A101", config, (2023, 2025)) == "no_doi"


def test_draw_sample_is_reproducible(config: Config, works: list[dict[str, Any]]) -> None:
    tables = build(works, config)
    a, _ = draw_sample(tables, config, (2022, 2026), n=2, seed=1)
    b, _ = draw_sample(tables, config, (2022, 2026), n=2, seed=1)
    assert a == b
    # eligible: >= 3 works in the window and a unit; one per faculty
    assert {r["author_id"] for r in a} <= {"A101", "A102", "A103"}
    assert sorted(r["faculty"] for r in a) == ["f1", "f2"]


def test_summary_and_written_sample_have_no_names(tmp_path: Path) -> None:
    path = tmp_path / "s.csv"
    write_sample(
        path,
        [
            {
                "author_id": "A1",
                "name": "Alma Beispiel",
                "unit": "econ",
                "faculty": "f1",
                "themenkompass_works": 3,
                "reference_url": "x",
                "reference_works": 4,
                "found": 3,
                "missing": 1,
                "extra": 0,
                "wrong": 0,
                "note": "replaces A9 (no ORCID works); no_doi=1",
            }
        ],
    )
    assert "Alma" not in path.read_text()
    s = summarise(path, (2023, 2025), {"de": [], "en": []})
    assert (s["reference"], s["found"], s["replaced"], s["inScope"]) == (4, 3, 1, 4)
    assert s["missingReasons"]["no_doi"] == 1
