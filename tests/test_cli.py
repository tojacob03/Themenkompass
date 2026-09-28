from __future__ import annotations

import gzip
import json
from pathlib import Path
from typing import Any

import pytest

from themenkompass.cli import main

FIXTURE_CONFIG = Path(__file__).parent / "fixtures" / "musteruni.toml"


@pytest.fixture
def snapshot(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, works: list[dict[str, Any]]) -> Path:
    monkeypatch.chdir(tmp_path)
    path = tmp_path / ".cache" / "musteruni" / "works.json.gz"
    path.parent.mkdir(parents=True)
    with gzip.open(path, "wt") as fh:
        json.dump(
            {"retrieved_at": "2026-09-01T00:00:00+00:00", "years": [2022, 2026], "works": works}, fh
        )
    return tmp_path


def test_build_offline(snapshot: Path) -> None:
    code = main(
        [
            "--config",
            str(FIXTURE_CONFIG),
            "build",
            "--offline",
            "--parquet-dir",
            "pq",
            "--site-dir",
            "site",
        ]
    )
    assert code == 0
    meta = json.loads((snapshot / "site" / "musteruni" / "meta.json").read_text())
    assert meta["retrievedAt"] == "2026-09-01T00:00:00+00:00"
    assert (snapshot / "pq" / "musteruni" / "works.parquet").exists()


def test_affiliations_report(snapshot: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["--config", str(FIXTURE_CONFIG), "affiliations", "--unmatched"]) == 0
    out = capsys.readouterr().out
    assert "Example University" in out
    assert "Department of Economics" not in out
