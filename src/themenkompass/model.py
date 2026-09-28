"""Turn raw OpenAlex works into tidy tables.

Tables (polars DataFrames):

* ``works``           one row per work
* ``work_topics``     work -> topic (up to three, rank 0 is the primary topic)
* ``topics``          topic hierarchy: domain > field > subfield > topic
* ``authorships``     work -> author, with the units recognised from affiliation text
* ``persons``         internal authors shown on the site
* ``institutions``    external institutions of co-authors
* ``work_institutions`` work -> external institution

People are identified by OpenAlex author ids only. Names are display values.
"""

from __future__ import annotations

import csv
import gzip
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import polars as pl

from themenkompass.config import Config
from themenkompass.fetch import short_id

AUTHOR_ID_RE = re.compile(r"^A\d+$")
# OpenAlex returns at most 100 authorships per work in list responses.
AUTHOR_LIST_LIMIT = 100
# A unit is attributed to a person if it accounts for at least this share of the
# person's unit evidence (the most frequent unit always qualifies).
UNIT_SHARE = 0.25


@dataclass(frozen=True)
class MappingRow:
    author_id: str
    unit: str | None
    chair: str | None
    note: str | None


@dataclass
class Tables:
    works: pl.DataFrame
    work_topics: pl.DataFrame
    topics: pl.DataFrame
    authorships: pl.DataFrame
    persons: pl.DataFrame
    institutions: pl.DataFrame
    work_institutions: pl.DataFrame

    def as_dict(self) -> dict[str, pl.DataFrame]:
        return {
            "works": self.works,
            "work_topics": self.work_topics,
            "topics": self.topics,
            "authorships": self.authorships,
            "persons": self.persons,
            "institutions": self.institutions,
            "work_institutions": self.work_institutions,
        }


def load_snapshot(path: Path) -> dict[str, Any]:
    with gzip.open(path, "rt", encoding="utf-8") as fh:
        data: dict[str, Any] = json.load(fh)
    return data


# --------------------------------------------------------------------------- mappings


def load_mapping(path: Path, config: Config) -> dict[str, MappingRow]:
    """Optional curated file: author_id,unit,chair,note (one row per person)."""
    if not path.exists():
        return {}
    unit_ids = {u.id for u in config.units}
    rows: dict[str, MappingRow] = {}
    with path.open(newline="", encoding="utf-8") as fh:
        for line_no, row in enumerate(csv.DictReader(_skip_comments(fh)), start=2):
            author_id = (row.get("author_id") or "").strip()
            if not AUTHOR_ID_RE.match(author_id):
                raise ValueError(f"{path}:{line_no}: invalid author_id '{author_id}'")
            unit = (row.get("unit") or "").strip() or None
            if unit and unit not in unit_ids:
                raise ValueError(f"{path}:{line_no}: unknown unit '{unit}'")
            if author_id in rows:
                raise ValueError(f"{path}:{line_no}: duplicate author_id '{author_id}'")
            rows[author_id] = MappingRow(
                author_id=author_id,
                unit=unit,
                chair=(row.get("chair") or "").strip() or None,
                note=(row.get("note") or "").strip() or None,
            )
    return rows


def load_exclusions(path: Path) -> set[str]:
    """Opt-out list: author ids that must not appear anywhere on the site."""
    if not path.exists():
        return set()
    ids: set[str] = set()
    with path.open(newline="", encoding="utf-8") as fh:
        for line_no, row in enumerate(csv.DictReader(_skip_comments(fh)), start=2):
            author_id = (row.get("author_id") or "").strip()
            if not AUTHOR_ID_RE.match(author_id):
                raise ValueError(f"{path}:{line_no}: invalid author_id '{author_id}'")
            ids.add(author_id)
    return ids


def _skip_comments(lines: Any) -> Any:
    return (line for line in lines if not line.lstrip().startswith("#"))


# --------------------------------------------------------------------------- matching


def mentions_institution(raw_affiliation: str, aliases: tuple[str, ...]) -> bool:
    text = raw_affiliation.casefold()
    return any(alias.casefold() in text for alias in aliases)


def institution_strings(authorship: dict[str, Any], config: Config) -> list[str]:
    """Raw affiliation strings that OpenAlex linked to the configured institution.

    Older records lack the ``affiliations`` list; for those we fall back to raw strings
    that contain one of the configured institution names.
    """
    affiliations = authorship.get("affiliations")
    if affiliations:
        return [
            a["raw_affiliation_string"]
            for a in affiliations
            if any(short_id(i) == config.openalex_id for i in a.get("institution_ids", []))
        ]
    return [
        s
        for s in authorship.get("raw_affiliation_strings", [])
        if mentions_institution(s, config.aliases)
    ]


def match_units(raw_affiliation: str, config: Config) -> list[str]:
    """Unit ids whose patterns match; a matching child unit replaces its parent."""
    hits = [
        unit.id for unit in config.units if any(p.search(raw_affiliation) for p in unit.compiled())
    ]
    parents = {config.unit(h).parent for h in hits}
    return [h for h in hits if h not in parents]


def match_faculties(raw_affiliation: str, config: Config) -> list[str]:
    return [f.id for f in config.faculties if any(p.search(raw_affiliation) for p in f.compiled())]


# --------------------------------------------------------------------------- build


def build(
    works_raw: list[dict[str, Any]],
    config: Config,
    *,
    mapping: dict[str, MappingRow] | None = None,
    exclude: set[str] | None = None,
) -> Tables:
    mapping = mapping or {}
    exclude = exclude or set()
    unit_faculty = {u.id: u.faculty for u in config.units}

    work_rows: list[dict[str, Any]] = []
    topic_rows: dict[str, dict[str, Any]] = {}
    work_topic_rows: list[dict[str, Any]] = []
    authorship_rows: list[dict[str, Any]] = []
    institution_rows: dict[str, dict[str, Any]] = {}
    work_inst_rows: list[dict[str, Any]] = []

    for work in works_raw:
        work_id = short_id(work["id"])
        authorships = work.get("authorships") or []
        internal_rows: list[dict[str, Any]] = []
        external: set[str] = set()
        for position, authorship in enumerate(authorships):
            author = authorship.get("author") or {}
            if not author.get("id"):
                continue
            author_id = short_id(author["id"])
            inst_ids = [
                short_id(i["id"]) for i in authorship.get("institutions", []) if i.get("id")
            ]
            is_internal = config.openalex_id in inst_ids
            for inst in authorship.get("institutions", []):
                iid = short_id(inst.get("id") or "")
                if iid and iid != config.openalex_id:
                    external.add(iid)
                    institution_rows.setdefault(
                        iid,
                        {
                            "institution_id": iid,
                            "name": inst.get("display_name") or iid,
                            "country_code": inst.get("country_code"),
                            "type": inst.get("type"),
                            "ror": (inst.get("ror") or "").removeprefix("https://ror.org/") or None,
                        },
                    )
            if not is_internal or author_id in exclude:
                continue
            strings = institution_strings(authorship, config)
            units = sorted({u for s in strings for u in match_units(s, config)})
            faculties = sorted(
                {f for s in strings for f in match_faculties(s, config)}
                | {unit_faculty[u] for u in units}
            )
            orcid = (author.get("orcid") or "").removeprefix("https://orcid.org/") or None
            internal_rows.append(
                {
                    "work_id": work_id,
                    "author_id": author_id,
                    "name": author.get("display_name") or "",
                    "orcid": orcid,
                    "position": position,
                    "units": units,
                    "faculties": faculties,
                    "has_affiliation_text": bool(strings),
                }
            )

        if not internal_rows:
            # Either nobody from the institution is on the (truncated) author list, or
            # every internal author opted out. Nothing on the site may point to them.
            continue

        location = work.get("primary_location") or {}
        source = location.get("source") or {}
        doi = (work.get("doi") or "").removeprefix("https://doi.org/") or None
        work_rows.append(
            {
                "work_id": work_id,
                "title": _clean_title(work.get("display_name") or ""),
                "year": work.get("publication_year"),
                "type": work.get("type"),
                "doi": doi,
                "venue": source.get("display_name"),
                "language": work.get("language"),
                "n_authors": len(authorships),
                "authors_truncated": len(authorships) >= AUTHOR_LIST_LIMIT,
            }
        )
        authorship_rows.extend(internal_rows)
        work_inst_rows.extend({"work_id": work_id, "institution_id": i} for i in sorted(external))

        primary = (work.get("primary_topic") or {}).get("id")
        topics = sorted(
            work.get("topics") or [],
            key=lambda t: (t.get("id") != primary, -(t.get("score") or 0)),
        )
        for rank, topic in enumerate(topics[:3]):
            tid = short_id(topic["id"])
            work_topic_rows.append(
                {"work_id": work_id, "topic_id": tid, "rank": rank, "score": topic.get("score")}
            )
            topic_rows.setdefault(tid, _topic_row(tid, topic))

    works = pl.DataFrame(work_rows, schema=WORK_SCHEMA).unique("work_id", keep="first")
    authorships_df = pl.DataFrame(authorship_rows, schema=AUTHORSHIP_SCHEMA)
    persons = _persons(authorships_df, works, config, mapping)
    return Tables(
        works=works.sort("work_id"),
        work_topics=pl.DataFrame(work_topic_rows, schema=WORK_TOPIC_SCHEMA),
        topics=pl.DataFrame(list(topic_rows.values()), schema=TOPIC_SCHEMA).sort("topic_id"),
        authorships=authorships_df,
        persons=persons,
        institutions=pl.DataFrame(list(institution_rows.values()), schema=INSTITUTION_SCHEMA).sort(
            "institution_id"
        ),
        work_institutions=pl.DataFrame(work_inst_rows, schema=WORK_INST_SCHEMA),
    )


def _clean_title(title: str) -> str:
    # OpenAlex titles sometimes carry HTML markup such as <i>...</i>.
    return re.sub(r"<[^>]+>", "", title).strip()


def _topic_row(tid: str, topic: dict[str, Any]) -> dict[str, Any]:
    def part(key: str) -> tuple[str, str]:
        node = topic.get(key) or {}
        return short_id(node.get("id") or ""), node.get("display_name") or ""

    subfield_id, subfield = part("subfield")
    field_id, field = part("field")
    domain_id, domain = part("domain")
    return {
        "topic_id": tid,
        "name": topic.get("display_name") or tid,
        "subfield_id": subfield_id,
        "subfield": subfield,
        "field_id": field_id,
        "field": field,
        "domain_id": domain_id,
        "domain": domain,
    }


def _persons(
    authorships: pl.DataFrame,
    works: pl.DataFrame,
    config: Config,
    mapping: dict[str, MappingRow],
) -> pl.DataFrame:
    unit_faculty = {u.id: u.faculty for u in config.units}
    years = dict(zip(works["work_id"], works["year"], strict=True))
    by_author: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in authorships.iter_rows(named=True):
        by_author[row["author_id"]].append(row)

    rows: list[dict[str, Any]] = []
    for author_id, items in by_author.items():
        work_ids = {r["work_id"] for r in items}
        mapped = mapping.get(author_id)
        if len(work_ids) < config.scope.min_works_per_person and mapped is None:
            continue
        items.sort(key=lambda r: years.get(r["work_id"]) or 0, reverse=True)
        work_years = sorted(years[w] for w in work_ids if years.get(w) is not None)

        unit_counts: Counter[str] = Counter()
        faculty_counts: Counter[str] = Counter()
        latest_unit_year: dict[str, int] = {}
        for r in items:
            for u in r["units"]:
                unit_counts[u] += 1
                latest_unit_year.setdefault(u, years.get(r["work_id"]) or 0)
            for f in r["faculties"]:
                faculty_counts[f] += 1

        if mapped and mapped.unit:
            units = [mapped.unit]
            unit_source = "mapping"
        elif unit_counts:
            top = unit_counts.most_common(1)[0][1]
            units = sorted(
                (u for u, n in unit_counts.items() if n >= max(1, UNIT_SHARE * top)),
                key=lambda u: (-unit_counts[u], -latest_unit_year[u], u),
            )
            unit_source = "affiliation"
        else:
            units = []
            unit_source = "none"

        faculties = list(dict.fromkeys(unit_faculty[u] for u in units))
        if not faculties and faculty_counts:
            top_f = faculty_counts.most_common(1)[0][1]
            faculties = sorted(
                (f for f, n in faculty_counts.items() if n >= max(1, UNIT_SHARE * top_f)),
                key=lambda f: -faculty_counts[f],
            )
            unit_source = "faculty"

        rows.append(
            {
                "author_id": author_id,
                "name": items[0]["name"],
                "orcid": next((r["orcid"] for r in items if r["orcid"]), None),
                "n_works": len(work_ids),
                "first_year": work_years[0] if work_years else None,
                "last_year": work_years[-1] if work_years else None,
                "units": units,
                "faculties": faculties,
                "unit_source": unit_source,
                "unit_evidence": sum(1 for r in items if r["units"]),
                "chair": mapped.chair if mapped else None,
            }
        )
    return pl.DataFrame(rows, schema=PERSON_SCHEMA).sort("author_id")


def _schema(columns: dict[str, Any]) -> pl.Schema:
    return pl.Schema(columns)


WORK_SCHEMA = _schema(
    {
        "work_id": pl.String,
        "title": pl.String,
        "year": pl.Int32,
        "type": pl.String,
        "doi": pl.String,
        "venue": pl.String,
        "language": pl.String,
        "n_authors": pl.Int32,
        "authors_truncated": pl.Boolean,
    }
)
WORK_TOPIC_SCHEMA = _schema(
    {
        "work_id": pl.String,
        "topic_id": pl.String,
        "rank": pl.Int8,
        "score": pl.Float64,
    }
)
TOPIC_SCHEMA = _schema(
    {
        "topic_id": pl.String,
        "name": pl.String,
        "subfield_id": pl.String,
        "subfield": pl.String,
        "field_id": pl.String,
        "field": pl.String,
        "domain_id": pl.String,
        "domain": pl.String,
    }
)
AUTHORSHIP_SCHEMA = _schema(
    {
        "work_id": pl.String,
        "author_id": pl.String,
        "name": pl.String,
        "orcid": pl.String,
        "position": pl.Int32,
        "units": pl.List(pl.String),
        "faculties": pl.List(pl.String),
        "has_affiliation_text": pl.Boolean,
    }
)
PERSON_SCHEMA = _schema(
    {
        "author_id": pl.String,
        "name": pl.String,
        "orcid": pl.String,
        "n_works": pl.Int32,
        "first_year": pl.Int32,
        "last_year": pl.Int32,
        "units": pl.List(pl.String),
        "faculties": pl.List(pl.String),
        "unit_source": pl.String,
        "unit_evidence": pl.Int32,
        "chair": pl.String,
    }
)
INSTITUTION_SCHEMA = _schema(
    {
        "institution_id": pl.String,
        "name": pl.String,
        "country_code": pl.String,
        "type": pl.String,
        "ror": pl.String,
    }
)
WORK_INST_SCHEMA = _schema({"work_id": pl.String, "institution_id": pl.String})
