"""Shared fixtures. All people, works and institutions here are invented."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from themenkompass.config import Config, load_config

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def config() -> Config:
    return load_config(FIXTURES / "musteruni.toml")


@pytest.fixture
def works() -> list[dict[str, Any]]:
    data: list[dict[str, Any]] = json.loads((FIXTURES / "works.json").read_text("utf-8"))
    return data
