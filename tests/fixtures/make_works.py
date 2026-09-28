"""Regenerate works.json: a tiny, entirely fictional OpenAlex-shaped dataset.

Run: uv run python tests/fixtures/make_works.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

OA = "https://openalex.org/"

TOPICS = {
    "T1": (
        "Labour Market Dynamics",
        ("2002", "Economics and Econometrics"),
        ("20", "Economics, Econometrics and Finance"),
        ("2", "Social Sciences"),
    ),
    "T2": (
        "Data Markets and Platforms",
        ("2002", "Economics and Econometrics"),
        ("20", "Economics, Econometrics and Finance"),
        ("2", "Social Sciences"),
    ),
    "T3": (
        "Coastal Plankton Ecology",
        ("1105", "Ecology, Evolution, Behavior and Systematics"),
        ("11", "Agricultural and Biological Sciences"),
        ("1", "Life Sciences"),
    ),
    "T4": (
        "Survey Methodology",
        ("3312", "Sociology and Political Science"),
        ("33", "Social Sciences"),
        ("2", "Social Sciences"),
    ),
}

PEOPLE = {
    "A101": "Alma Beispiel",
    "A102": "Bruno Testmann",
    "A103": "Clara Fiktiv",
    "A104": "Dario Platzhalter",
    "A105": "Emil Einmal",
    "A106": "Frieda Ohnetext",
    "A107": "Greta Austritt",
    "A900": "Xaver Extern",
    "A901": "Yara Auswärts",
}

INSTITUTIONS = {
    "I1": ("Musteruniversität", "DE", "education", "0zzzzzz00"),
    "I2": ("Beispiel-Hochschule", "DE", "education", "0yyyyyy00"),
    "I3": ("Fantasia Research Institute", "NL", "facility", None),
}

AFF = {
    "econ": "Department of Economics, Musteruniversität, Musterstadt",
    "data": "Data Economics Group, Department of Economics, Example University",
    "bio": "Institute of Biology, Example University, Musterstadt",
    "fac1": "Faculty One, Musteruniversität",
    "bare": "Example University",
    "ext2": "Beispiel-Hochschule, Anderswo",
    "ext3": "Fantasia Research Institute, Nirgendwo",
}


def authorship(author: str, inst: str, aff: str) -> dict[str, Any]:
    name, cc, kind, ror = INSTITUTIONS[inst]
    return {
        "author_position": "middle",
        "author": {
            "id": OA + author,
            "display_name": PEOPLE[author],
            "orcid": "https://orcid.org/0000-0000-0000-000" + author[-1]
            if author == "A101"
            else None,
        },
        "institutions": [
            {
                "id": OA + inst,
                "display_name": name,
                "ror": f"https://ror.org/{ror}" if ror else None,
                "country_code": cc,
                "type": kind,
            }
        ],
        "raw_affiliation_strings": [AFF[aff]],
        "affiliations": [{"raw_affiliation_string": AFF[aff], "institution_ids": [OA + inst]}],
    }


def topic(tid: str, score: float) -> dict[str, Any]:
    name, sub, field, dom = TOPICS[tid]
    return {
        "id": OA + tid,
        "display_name": name,
        "score": score,
        "subfield": {"id": OA + "subfields/" + sub[0], "display_name": sub[1]},
        "field": {"id": OA + "fields/" + field[0], "display_name": field[1]},
        "domain": {"id": OA + "domains/" + dom[0], "display_name": dom[1]},
    }


def work(
    wid: str,
    title: str,
    year: int,
    authors: list[tuple[str, str, str]],
    topics: list[tuple[str, float]],
    wtype: str = "article",
) -> dict[str, Any]:
    tlist = [topic(t, s) for t, s in topics]
    return {
        "id": OA + wid,
        "doi": f"https://doi.org/10.0000/{wid.lower()}",
        "display_name": title,
        "publication_year": year,
        "type": wtype,
        "language": "en",
        "primary_location": {
            "source": {"id": OA + "S1", "display_name": "Journal of Invented Results"}
        },
        "authorships": [authorship(*a) for a in authors],
        "primary_topic": tlist[0] if tlist else None,
        "topics": tlist,
    }


WORKS = [
    work(
        "W1",
        "Wages on <i>imaginary</i> islands",
        2022,
        [("A101", "I1", "econ"), ("A102", "I1", "econ")],
        [("T1", 0.99), ("T4", 0.5)],
    ),
    work(
        "W2",
        "Pricing data that does not exist",
        2023,
        [("A102", "I1", "data"), ("A900", "I2", "ext2")],
        [("T2", 0.97)],
    ),
    work(
        "W3",
        "A second look at invented labour markets",
        2024,
        [("A101", "I1", "econ"), ("A900", "I2", "ext2"), ("A901", "I3", "ext3")],
        [("T1", 0.95)],
    ),
    work(
        "W4",
        "Platforms for pretend data",
        2025,
        [("A102", "I1", "data"), ("A101", "I1", "econ")],
        [("T2", 0.9), ("T1", 0.4)],
    ),
    work(
        "W5",
        "Plankton in a made-up bay",
        2024,
        [("A103", "I1", "bio"), ("A104", "I1", "fac1")],
        [("T3", 0.99)],
    ),
    work(
        "W6",
        "More plankton, still fictional",
        2026,
        [("A103", "I1", "bio"), ("A104", "I1", "fac1"), ("A105", "I1", "bio")],
        [("T3", 0.98)],
    ),
    work(
        "W7",
        "Surveying nobody in particular",
        2025,
        [("A106", "I1", "bare"), ("A107", "I1", "econ")],
        [("T4", 0.9)],
    ),
    work(
        "W8",
        "Asking the same nobody again",
        2026,
        [("A106", "I1", "bare"), ("A107", "I1", "econ")],
        [("T4", 0.92)],
    ),
    work(
        "W9",
        "Only an opted-out author wrote this",
        2026,
        [("A107", "I1", "econ"), ("A901", "I3", "ext3")],
        [("T4", 0.9)],
    ),
    work(
        "W10",
        "A very large invented consortium paper",
        2023,
        [
            ("A101", "I1", "econ"),
            ("A103", "I1", "bio"),
            ("A900", "I2", "ext2"),
            ("A901", "I3", "ext3"),
            ("A102", "I1", "econ"),
        ],
        [("T1", 0.6)],
    ),
    work("W11", "Undated fragment", 2021, [("A900", "I2", "ext2")], [("T2", 0.5)]),
]

if __name__ == "__main__":
    out = Path(__file__).with_name("works.json")
    out.write_text(json.dumps(WORKS, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {out} ({len(WORKS)} works)")
