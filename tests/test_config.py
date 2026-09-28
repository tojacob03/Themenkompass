from __future__ import annotations

import datetime as dt
from pathlib import Path
from typing import Any

import pytest

from themenkompass.config import Config, ConfigError, parse_config

ROOT = Path(__file__).parent.parent


def minimal(**overrides: Any) -> dict[str, Any]:
    raw: dict[str, Any] = {
        "institution": {
            "slug": "x",
            "ror": "0zzzzzz00",
            "openalex_id": "I1",
            "name_de": "X",
            "name_en": "X",
            "aliases": ["X"],
        },
        "faculties": [{"id": "f", "name_de": "F", "name_en": "F"}],
        "units": [{"id": "u", "faculty": "f", "name_de": "U", "name_en": "U", "patterns": ["U"]}],
    }
    raw.update(overrides)
    return raw


def test_fixture_config_loads(config: Config) -> None:
    assert config.slug == "musteruni"
    assert [u.id for u in config.units] == ["econ", "data", "bio"]
    assert config.unit("data").parent == "econ"
    assert config.mapping_path.name == "musteruni.csv"


def test_real_configs_are_valid() -> None:
    from themenkompass.config import load_config

    for path in (ROOT / "config").glob("*.toml"):
        cfg = load_config(path)
        assert cfg.units, path


def test_year_range_is_rolling(config: Config) -> None:
    assert config.scope.year_range(dt.date(2026, 3, 1)) == (2022, 2026)


def test_accepts_full_urls_for_ids() -> None:
    raw = minimal()
    raw["institution"]["ror"] = "https://ror.org/0zzzzzz00"
    raw["institution"]["openalex_id"] = "https://openalex.org/I1"
    cfg = parse_config(raw)
    assert (cfg.ror, cfg.openalex_id) == ("0zzzzzz00", "I1")


@pytest.mark.parametrize(
    ("path", "value", "message"),
    [
        (("institution", "ror"), "not-a-ror", "valid ROR"),
        (("institution", "openalex_id"), "A123", "OpenAlex institution"),
        (("institution", "aliases"), [], "aliases"),
        (("budget", "max_usd_per_run"), 5.0, "free"),
    ],
)
def test_rejects_bad_values(path: tuple[str, str], value: object, message: str) -> None:
    raw = minimal(budget={})
    raw[path[0]][path[1]] = value
    with pytest.raises(ConfigError, match=message):
        parse_config(raw)


def test_rejects_unknown_faculty_and_parent() -> None:
    raw = minimal()
    raw["units"][0]["faculty"] = "nope"
    with pytest.raises(ConfigError, match="unknown faculty"):
        parse_config(raw)
    raw = minimal()
    raw["units"][0]["parent"] = "nope"
    with pytest.raises(ConfigError, match="unknown parent"):
        parse_config(raw)


def test_rejects_invalid_regex() -> None:
    raw = minimal()
    raw["units"][0]["patterns"] = ["(unclosed"]
    with pytest.raises(ConfigError, match="invalid pattern"):
        parse_config(raw)
