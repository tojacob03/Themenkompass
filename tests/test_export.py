from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from themenkompass.config import Config
from themenkompass.export import RunInfo, site_payload, trend, update_index, write_all
from themenkompass.model import build

RUN = RunInfo(years=(2022, 2026), retrieved_at="2026-09-01T00:00:00+00:00", generated_at="x")


@pytest.fixture
def payload(config: Config, works: list[dict[str, Any]]) -> dict[str, Any]:
    return site_payload(build(works, config), config, RUN, current_year=2026)


@pytest.mark.parametrize(
    ("counts", "expected"),
    [
        # years 2017..2026, current year 2026 -> compare 2023-25 with 2020-22
        ([0, 0, 0, 1, 1, 1, 5, 5, 5, 9], "up"),
        ([0, 0, 0, 5, 5, 5, 1, 1, 1, 0], "down"),
        ([0, 0, 0, 4, 4, 4, 4, 4, 5, 0], "stable"),
        ([0, 0, 0, 1, 0, 1, 1, 0, 1, 40], "few"),  # the running year is ignored
        ([0, 0, 0, 0, 0, 0, 2, 2, 2, 0], "up"),
    ],
)
def test_trend(counts: list[int], expected: str) -> None:
    assert trend(counts, (2017, 2026), current_year=2026) == expected


def test_works_json(payload: dict[str, Any]) -> None:
    works = {w["i"]: w for w in payload["works.json"]}
    w3 = works["W3"]
    assert w3["a"] == ["A101"]
    assert w3["x"] == ["I2", "I3"]
    assert w3["u"] == ["econ"]
    assert w3["f"] == ["f1"]
    assert works["W4"]["tp"] == ["T2", "T1"]
    # newest first
    years = [w["y"] for w in payload["works.json"]]
    assert years == sorted(years, reverse=True)
    # nothing that could rank people
    assert not any("cited" in json.dumps(w) for w in payload["works.json"])


def test_persons_json(payload: dict[str, Any]) -> None:
    persons = {p["i"]: p for p in payload["persons.json"]}
    alma = persons["A101"]
    assert alma["y"] == [1, 1, 1, 1, 0]  # 2022..2026
    assert alma["tp"][0] == ["T1", 4]
    # W10 has 5 authors, above the network cap of 4: not counted as co-authorship
    assert alma["ca"] == [["A102", 2]]
    assert alma["xi"] == [["I2", 1], ["I3", 1]]
    assert "A105" not in persons
    names = [p["n"] for p in payload["persons.json"]]
    assert names == sorted(names)  # alphabetical, never ranked


def test_topics_and_meta(payload: dict[str, Any]) -> None:
    topics = payload["topics.json"]
    assert topics["topics"]["T1"][1] == "2002"
    assert topics["subfields"]["2002"][1] == "20"
    assert topics["fields"]["20"][1] == "2"
    meta = payload["meta.json"]
    assert meta["institution"]["ror"] == "0zzzzzz00"
    assert meta["years"] == [2022, 2026]
    assert {u["id"] for u in meta["units"]} == {"econ", "data", "bio"}
    assert meta["quality"]["works"] == 10


def test_write_all_and_index(tmp_path: Path, config: Config, works: list[dict[str, Any]]) -> None:
    sizes = write_all(
        build(works, config),
        config,
        RUN,
        parquet_dir=tmp_path / "pq",
        site_dir=tmp_path / "site" / "musteruni",
        current_year=2026,
    )
    assert (tmp_path / "pq" / "persons.parquet").exists()
    assert json.loads((tmp_path / "site" / "musteruni" / "meta.json").read_text())["schema"] == 1
    assert sum(sizes.values()) < 200_000
    update_index(tmp_path / "site", config)
    index = json.loads((tmp_path / "site" / "index.json").read_text())
    assert index["default"] == "musteruni"
    assert index["institutions"][0]["name"]["en"] == "Example University"
