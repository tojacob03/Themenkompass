"""Institution configuration: everything institution-specific lives in a TOML file."""

from __future__ import annotations

import datetime as dt
import re
import tomllib
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

OPENALEX_INSTITUTION_RE = re.compile(r"^I\d+$")
ROR_RE = re.compile(r"^0[a-z0-9]{6}\d{2}$")

DEFAULT_WORK_TYPES = (
    "article",
    "book",
    "book-chapter",
    "conference-paper",
    "preprint",
    "review",
    "report",
    "dissertation",
    "data-paper",
    "letter",
)


class ConfigError(ValueError):
    """Raised when a configuration file is incomplete or inconsistent."""


@dataclass(frozen=True)
class Faculty:
    id: str
    name_de: str
    name_en: str
    patterns: tuple[str, ...] = ()

    def compiled(self) -> list[re.Pattern[str]]:
        return [re.compile(p, re.IGNORECASE) for p in self.patterns]


@dataclass(frozen=True)
class Unit:
    """An organisational unit (department, institute) recognised from affiliation text."""

    id: str
    faculty: str
    name_de: str
    name_en: str
    patterns: tuple[str, ...]
    parent: str | None = None

    def compiled(self) -> list[re.Pattern[str]]:
        return [re.compile(p, re.IGNORECASE) for p in self.patterns]


@dataclass(frozen=True)
class Budget:
    """Hard limits that keep a run inside OpenAlex's free daily allowance."""

    max_usd_per_run: float = 0.25
    min_remaining_usd: float = 0.02
    max_requests_per_run: int = 2000


@dataclass(frozen=True)
class Scope:
    window_years: int = 10
    work_types: tuple[str, ...] = DEFAULT_WORK_TYPES
    min_works_per_person: int = 2
    max_authors_for_network: int = 25
    recent_years: int = 5

    def year_range(self, today: dt.date | None = None) -> tuple[int, int]:
        """Rolling window ending in the current year, e.g. 2017-2026 for ten years."""
        year = (today or dt.date.today()).year
        return year - self.window_years + 1, year


@dataclass(frozen=True)
class Config:
    slug: str
    ror: str
    openalex_id: str
    name_de: str
    name_en: str
    # A raw affiliation string only counts as evidence for a unit if it also names the
    # institution itself; this keeps "Department of Economics, University of X" out.
    aliases: tuple[str, ...]
    scope: Scope = field(default_factory=Scope)
    budget: Budget = field(default_factory=Budget)
    faculties: tuple[Faculty, ...] = ()
    units: tuple[Unit, ...] = ()
    source_path: Path | None = None

    def unit(self, unit_id: str) -> Unit:
        for unit in self.units:
            if unit.id == unit_id:
                return unit
        raise KeyError(unit_id)

    @property
    def mapping_path(self) -> Path:
        return self._sibling("mappings", f"{self.slug}.csv")

    @property
    def exclude_path(self) -> Path:
        return self._sibling("mappings", f"{self.slug}.exclude.csv")

    def _sibling(self, directory: str, name: str) -> Path:
        root = self.source_path.parent.parent if self.source_path else Path.cwd()
        return root / directory / name


def _require(table: dict[str, object], key: str, where: str) -> str:
    value = table.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ConfigError(f"{where}: '{key}' must be a non-empty string")
    return value.strip()


def load_config(path: Path) -> Config:
    with path.open("rb") as fh:
        raw = tomllib.load(fh)
    return parse_config(raw, source_path=path)


def parse_config(raw: dict[str, object], source_path: Path | None = None) -> Config:
    inst = raw.get("institution")
    if not isinstance(inst, dict):
        raise ConfigError("missing [institution] table")

    ror = _require(inst, "ror", "[institution]").removeprefix("https://ror.org/")
    if not ROR_RE.match(ror):
        raise ConfigError(f"[institution]: '{ror}' is not a valid ROR id")
    openalex_id = _require(inst, "openalex_id", "[institution]").removeprefix(
        "https://openalex.org/"
    )
    if not OPENALEX_INSTITUTION_RE.match(openalex_id):
        raise ConfigError(f"[institution]: '{openalex_id}' is not an OpenAlex institution id")

    aliases = inst.get("aliases", [])
    if not isinstance(aliases, list) or not aliases or not all(isinstance(a, str) for a in aliases):
        raise ConfigError("[institution]: 'aliases' must be a non-empty list of strings")

    scope_raw = raw.get("scope", {})
    budget_raw = raw.get("budget", {})
    if not isinstance(scope_raw, dict) or not isinstance(budget_raw, dict):
        raise ConfigError("[scope] and [budget] must be tables")
    scope = Scope(
        window_years=int(scope_raw.get("window_years", Scope.window_years)),
        work_types=tuple(scope_raw.get("work_types", DEFAULT_WORK_TYPES)),
        min_works_per_person=int(scope_raw.get("min_works_per_person", Scope.min_works_per_person)),
        max_authors_for_network=int(
            scope_raw.get("max_authors_for_network", Scope.max_authors_for_network)
        ),
        recent_years=int(scope_raw.get("recent_years", Scope.recent_years)),
    )
    if not 1 <= scope.window_years <= 30:
        raise ConfigError("[scope]: 'window_years' must be between 1 and 30")
    budget = Budget(
        max_usd_per_run=float(budget_raw.get("max_usd_per_run", Budget.max_usd_per_run)),
        min_remaining_usd=float(budget_raw.get("min_remaining_usd", Budget.min_remaining_usd)),
        max_requests_per_run=int(
            budget_raw.get("max_requests_per_run", Budget.max_requests_per_run)
        ),
    )
    if budget.max_usd_per_run > 1.0:
        raise ConfigError("[budget]: 'max_usd_per_run' above the free $1/day allowance")

    faculties = tuple(
        Faculty(
            id=_require(f, "id", "[[faculties]]"),
            name_de=_require(f, "name_de", "[[faculties]]"),
            name_en=_require(f, "name_en", "[[faculties]]"),
            patterns=tuple(_strings(f, "patterns")),
        )
        for f in _tables(raw, "faculties")
    )
    for faculty in faculties:
        _compile_or_fail(faculty.compiled, f"faculty '{faculty.id}'")
    faculty_ids = {f.id for f in faculties}
    units: list[Unit] = []
    for u in _tables(raw, "units"):
        unit = Unit(
            id=_require(u, "id", "[[units]]"),
            faculty=_require(u, "faculty", "[[units]]"),
            name_de=_require(u, "name_de", "[[units]]"),
            name_en=_require(u, "name_en", "[[units]]"),
            patterns=tuple(_strings(u, "patterns")),
            parent=str(u["parent"]) if u.get("parent") else None,
        )
        if unit.faculty not in faculty_ids:
            raise ConfigError(f"unit '{unit.id}' refers to unknown faculty '{unit.faculty}'")
        if not unit.patterns:
            raise ConfigError(f"unit '{unit.id}' needs at least one pattern")
        _compile_or_fail(unit.compiled, f"unit '{unit.id}'")
        units.append(unit)
    ids = [u.id for u in units]
    if len(ids) != len(set(ids)):
        raise ConfigError("unit ids must be unique")
    for unit in units:
        if unit.parent and unit.parent not in ids:
            raise ConfigError(f"unit '{unit.id}' has unknown parent '{unit.parent}'")

    return Config(
        slug=_require(inst, "slug", "[institution]"),
        ror=ror,
        openalex_id=openalex_id,
        name_de=_require(inst, "name_de", "[institution]"),
        name_en=_require(inst, "name_en", "[institution]"),
        aliases=tuple(aliases),
        scope=scope,
        budget=budget,
        faculties=faculties,
        units=tuple(units),
        source_path=source_path,
    )


def _strings(table: dict[str, object], key: str) -> list[str]:
    value = table.get(key, [])
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ConfigError(f"'{key}' must be a list of strings")
    return value


def _compile_or_fail(compile_fn: Callable[[], object], where: str) -> None:
    try:
        compile_fn()
    except re.error as exc:
        raise ConfigError(f"{where}: invalid pattern ({exc})") from exc


def _tables(raw: dict[str, object], key: str) -> list[dict[str, object]]:
    value = raw.get(key, [])
    if not isinstance(value, list) or not all(isinstance(v, dict) for v in value):
        raise ConfigError(f"'{key}' must be an array of tables")
    return value
