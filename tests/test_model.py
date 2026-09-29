from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from themenkompass.config import Config
from themenkompass.model import (
    MappingRow,
    build,
    institution_strings,
    load_exclusions,
    load_mapping,
    match_faculties,
    match_units,
)


def person(tables: Any, author_id: str) -> dict[str, Any]:
    rows = tables.persons.filter(tables.persons["author_id"] == author_id).to_dicts()
    assert rows, f"{author_id} not listed"
    row: dict[str, Any] = rows[0]
    return row


def test_unit_matching_prefers_child_units(config: Config) -> None:
    assert match_units("Department of Economics, Example University", config) == ["econ"]
    assert match_units("Data Economics Group, Department of Economics", config) == ["data"]
    assert match_units("Somewhere else entirely", config) == []
    assert match_faculties("Faculty One, Musteruniversität", config) == ["f1"]


def test_institution_strings_use_openalex_linkage(config: Config) -> None:
    authorship = {
        "affiliations": [
            {
                "raw_affiliation_string": "Dept A, Musteruni",
                "institution_ids": ["https://openalex.org/I1"],
            },
            {
                "raw_affiliation_string": "Other place",
                "institution_ids": ["https://openalex.org/I2"],
            },
        ]
    }
    assert institution_strings(authorship, config) == ["Dept A, Musteruni"]
    legacy = {"raw_affiliation_strings": ["Institute X, Example University", "Other place"]}
    assert institution_strings(legacy, config) == ["Institute X, Example University"]


def test_build_tables(config: Config, works: list[dict[str, Any]]) -> None:
    t = build(works, config)
    # W11 has no internal author and is dropped
    assert "W11" not in t.works["work_id"].to_list()
    assert t.works.height == 12
    w1 = t.works.filter(t.works["work_id"] == "W1").row(0, named=True)
    assert w1["title"] == "Wages on imaginary islands"  # markup stripped
    assert w1["doi"] == "10.0000/w1"
    # primary topic first
    ranks = t.work_topics.filter(t.work_topics["work_id"] == "W4").sort("rank")
    assert ranks["topic_id"].to_list() == ["T2", "T1"]
    assert set(t.topics["field"]) >= {"Economics, Econometrics and Finance"}
    assert set(t.institutions["institution_id"]) == {"I2", "I3"}


def test_persons_threshold_units_and_sources(config: Config, works: list[dict[str, Any]]) -> None:
    t = build(works, config)
    ids = set(t.persons["author_id"])
    assert "A105" not in ids  # only one work
    assert "A900" not in ids  # external
    alma = person(t, "A101")
    assert alma["units"] == ["econ"]
    assert alma["unit_source"] == "affiliation"
    assert alma["orcid"] == "0000-0000-0000-0001"
    assert (alma["first_year"], alma["last_year"], alma["n_works"]) == (2022, 2025, 4)
    bruno = person(t, "A102")
    assert bruno["units"][0] == "data"  # most frequent unit first
    assert set(bruno["units"]) == {"data", "econ"}
    dario = person(t, "A104")
    assert (dario["units"], dario["faculties"], dario["unit_source"]) == ([], ["f1"], "faculty")
    frieda = person(t, "A106")
    assert (frieda["units"], frieda["faculties"], frieda["unit_source"]) == ([], [], "none")


def test_mapping_overrides_and_lists_people_below_threshold(
    config: Config, works: list[dict[str, Any]]
) -> None:
    mapping = {
        "A105": MappingRow("A105", "bio", "AG Plankton", "own publication list"),
        "A106": MappingRow("A106", "econ", None, None),
    }
    t = build(works, config, mapping=mapping)
    emil = person(t, "A105")
    assert (emil["units"], emil["chair"], emil["unit_source"]) == (
        ["bio"],
        "AG Plankton",
        "mapping",
    )
    assert person(t, "A106")["faculties"] == ["f1"]


def test_exclusion_removes_person_and_their_solo_works(
    config: Config, works: list[dict[str, Any]]
) -> None:
    t = build(works, config, exclude={"A107"})
    assert "A107" not in set(t.persons["author_id"])
    assert "A107" not in set(t.authorships["author_id"])
    assert "Greta" not in " ".join(t.authorships["name"].to_list())
    # W9 had A107 as the only internal author -> gone; W7 keeps its other author
    assert "W9" not in set(t.works["work_id"])
    assert "W7" in set(t.works["work_id"])


def test_load_mapping_and_exclusions(tmp_path: Path, config: Config) -> None:
    m = tmp_path / "m.csv"
    m.write_text("# comment\nauthor_id,unit,chair,note\nA101,econ,Chair X,own list\nA102,,,\n")
    rows = load_mapping(m, config)
    assert rows["A101"].chair == "Chair X"
    assert rows["A102"].unit is None
    e = tmp_path / "e.csv"
    e.write_text("# opt-out\nauthor_id\nA107\n")
    assert load_exclusions(e) == {"A107"}
    assert load_mapping(tmp_path / "missing.csv", config) == {}


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("author_id,unit\nX1,econ\n", "invalid author_id"),
        ("author_id,unit\nA1,nope\n", "unknown unit"),
        ("author_id,unit\nA1,econ\nA1,bio\n", "duplicate"),
    ],
)
def test_mapping_validation(tmp_path: Path, config: Config, content: str, message: str) -> None:
    m = tmp_path / "m.csv"
    m.write_text(content)
    with pytest.raises(ValueError, match=message):
        load_mapping(m, config)


def test_sub_institutions_are_internal(config: Config, works: list[dict[str, Any]]) -> None:
    t = build(works, config)
    hanna = person(t, "A108")
    # affiliated only with I5, a sub-institution of I1 (OpenAlex lineage)
    assert hanna["units"] == ["bio"]
    assert "I5" not in set(t.institutions["institution_id"])
    assert "W13" in set(t.works["work_id"])
