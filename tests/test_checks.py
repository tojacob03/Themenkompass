from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from themenkompass.checks import check_site
from themenkompass.config import Config
from themenkompass.export import RunInfo, update_index, write_all
from themenkompass.model import build

RUN = RunInfo(years=(2022, 2026), retrieved_at="r", generated_at="g")


def export(tmp_path: Path, config: Config, works: list[dict[str, Any]], **kw: Any) -> Path:
    site = tmp_path / "site"
    write_all(
        build(works, config, **kw),
        config,
        RUN,
        parquet_dir=tmp_path / "pq",
        site_dir=site / config.slug,
        current_year=2026,
    )
    update_index(site, config)
    return site


def test_clean_export_passes(tmp_path: Path, config: Config, works: list[dict[str, Any]]) -> None:
    site = export(tmp_path, config, works)
    assert check_site(site, tmp_path / "mappings") == []


def test_detects_excluded_person_and_broken_refs(
    tmp_path: Path, config: Config, works: list[dict[str, Any]]
) -> None:
    site = export(tmp_path, config, works)
    mappings = tmp_path / "mappings"
    mappings.mkdir()
    (mappings / "musteruni.exclude.csv").write_text("# x\nauthor_id\nA101\n")
    works_path = site / "musteruni" / "works.json"
    data = json.loads(works_path.read_text())
    data[0]["tp"].append("T999")
    works_path.write_text(json.dumps(data))
    errors = check_site(site, mappings)
    assert any("excluded person A101 is still listed" in e for e in errors)
    assert any("unknown topic T999" in e for e in errors)


def test_exclusion_round_trip(tmp_path: Path, config: Config, works: list[dict[str, Any]]) -> None:
    mappings = tmp_path / "mappings"
    mappings.mkdir()
    (mappings / "musteruni.exclude.csv").write_text("author_id\nA101\n")
    site = export(tmp_path, config, works, exclude={"A101"})
    assert check_site(site, mappings) == []
