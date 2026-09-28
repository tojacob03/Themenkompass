"""Write the model as Parquet (for analysis) and compact JSON (for the static site).

The JSON files are the site's only data source. They use short keys because they are
downloaded by every visitor; ``web/src/data.ts`` documents the same shapes in TypeScript.
Citation counts are deliberately not exported: the site does not rank people.
"""

from __future__ import annotations

import datetime as dt
import json
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import polars as pl

from themenkompass import __version__
from themenkompass.config import Config
from themenkompass.model import Tables

SCHEMA_VERSION = 1
MAX_EXTERNAL_PER_WORK = 30
TOP_N = 8
# Trend: compare the last `TREND_YEARS` complete years with the ones before.
TREND_YEARS = 3
TREND_MIN_WORKS = 5
TREND_THRESHOLD = 0.25


@dataclass(frozen=True)
class RunInfo:
    years: tuple[int, int]
    retrieved_at: str
    generated_at: str

    @staticmethod
    def now(years: tuple[int, int], retrieved_at: str) -> RunInfo:
        return RunInfo(
            years=years,
            retrieved_at=retrieved_at,
            generated_at=dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        )


def trend(counts: list[int], years: tuple[int, int], current_year: int) -> str:
    """'up', 'down', 'stable' or 'few' - comparing complete years only."""
    by_year = dict(zip(range(years[0], years[1] + 1), counts, strict=True))
    last_complete = min(years[1], current_year - 1)
    recent = sum(
        by_year.get(y, 0) for y in range(last_complete - TREND_YEARS + 1, last_complete + 1)
    )
    before = sum(
        by_year.get(y, 0)
        for y in range(last_complete - 2 * TREND_YEARS + 1, last_complete - TREND_YEARS + 1)
    )
    if max(recent, before) < TREND_MIN_WORKS:
        return "few"
    if before == 0:
        return "up"
    change = (recent - before) / before
    if change >= TREND_THRESHOLD:
        return "up"
    if change <= -TREND_THRESHOLD:
        return "down"
    return "stable"


def topic_trends(tables: Tables, run: RunInfo, current_year: int) -> pl.DataFrame:
    """Works per primary topic and year across the whole institution, with a trend label."""
    years = list(range(run.years[0], run.years[1] + 1))
    primary = tables.work_topics.filter(pl.col("rank") == 0).join(
        tables.works.select("work_id", "year"), on="work_id"
    )
    counts: dict[str, list[int]] = defaultdict(lambda: [0] * len(years))
    for topic_id, year in primary.select("topic_id", "year").iter_rows():
        if run.years[0] <= year <= run.years[1]:
            counts[topic_id][year - run.years[0]] += 1
    rows = [
        {
            "topic_id": tid,
            "total": sum(c),
            "per_year": c,
            "trend": trend(c, run.years, current_year),
        }
        for tid, c in counts.items()
    ]
    schema: dict[str, Any] = {
        "topic_id": pl.String,
        "total": pl.Int32,
        "per_year": pl.List(pl.Int32),
        "trend": pl.String,
    }
    return pl.DataFrame(rows, schema=schema).sort("total", "topic_id", descending=[True, False])


def _work_units(tables: Tables) -> dict[str, tuple[list[str], list[str]]]:
    """Units and faculties of a work: affiliation evidence plus its listed people."""
    person_units = {
        r["author_id"]: (r["units"], r["faculties"]) for r in tables.persons.iter_rows(named=True)
    }
    units: dict[str, set[str]] = defaultdict(set)
    faculties: dict[str, set[str]] = defaultdict(set)
    for r in tables.authorships.iter_rows(named=True):
        units[r["work_id"]].update(r["units"])
        faculties[r["work_id"]].update(r["faculties"])
        if r["author_id"] in person_units:
            pu, pf = person_units[r["author_id"]]
            units[r["work_id"]].update(pu)
            faculties[r["work_id"]].update(pf)
    return {w: (sorted(units[w]), sorted(faculties[w])) for w in set(units) | set(faculties)}


def site_payload(tables: Tables, config: Config, run: RunInfo, current_year: int) -> dict[str, Any]:
    """All JSON documents for the site, keyed by file name."""
    years = run.years
    n_years = years[1] - years[0] + 1
    listed = set(tables.persons["author_id"])
    network_cap = config.scope.max_authors_for_network

    topics_by_work: dict[str, list[str]] = defaultdict(list)
    for w, t in (
        tables.work_topics.sort("work_id", "rank").select("work_id", "topic_id").iter_rows()
    ):
        topics_by_work[w].append(t)
    authors_by_work: dict[str, list[str]] = defaultdict(list)
    for w, a in (
        tables.authorships.sort("work_id", "position").select("work_id", "author_id").iter_rows()
    ):
        if a in listed and a not in authors_by_work[w]:
            authors_by_work[w].append(a)
    ext_by_work: dict[str, list[str]] = defaultdict(list)
    for w, i in tables.work_institutions.select("work_id", "institution_id").iter_rows():
        ext_by_work[w].append(i)
    work_units = _work_units(tables)

    works_json: list[dict[str, Any]] = []
    n_authors: dict[str, int] = {}
    work_year: dict[str, int] = {}
    for r in tables.works.sort("year", "work_id", descending=[True, False]).iter_rows(named=True):
        wid = r["work_id"]
        n_authors[wid] = r["n_authors"]
        work_year[wid] = r["year"]
        units, faculties = work_units.get(wid, ([], []))
        item: dict[str, Any] = {
            "i": wid,
            "t": r["title"],
            "y": r["year"],
            "ty": r["type"],
            "n": r["n_authors"],
            "tp": topics_by_work.get(wid, []),
            "a": authors_by_work.get(wid, []),
            "u": units,
            "f": faculties,
        }
        if r["doi"]:
            item["d"] = r["doi"]
        if r["venue"]:
            item["v"] = r["venue"]
        if ext_by_work.get(wid):
            item["x"] = ext_by_work[wid][:MAX_EXTERNAL_PER_WORK]
        if r["authors_truncated"]:
            item["tr"] = 1
        works_json.append(item)

    # Per person: activity by year, topics, co-authors, partner institutions.
    per_year: dict[str, list[int]] = defaultdict(lambda: [0] * n_years)
    person_topics: dict[str, Counter[str]] = defaultdict(Counter)
    coauthors: dict[str, Counter[str]] = defaultdict(Counter)
    partners: dict[str, Counter[str]] = defaultdict(Counter)
    for wid, authors in authors_by_work.items():
        year = work_year.get(wid)
        small_team = n_authors.get(wid, 0) <= network_cap
        for a in authors:
            if year is not None and years[0] <= year <= years[1]:
                per_year[a][year - years[0]] += 1
            person_topics[a].update(topics_by_work.get(wid, []))
            if small_team:
                coauthors[a].update(b for b in authors if b != a)
                partners[a].update(ext_by_work.get(wid, []))

    persons_json = []
    for r in tables.persons.sort("name", "author_id").iter_rows(named=True):
        a = r["author_id"]
        item = {
            "i": a,
            "n": r["name"],
            "u": r["units"],
            "f": r["faculties"],
            "s": r["unit_source"],
            "w": r["n_works"],
            "l": r["last_year"],
            "y": per_year[a],
            "tp": [[t, n] for t, n in _top(person_topics[a])],
            "ca": [[b, n] for b, n in _top(coauthors[a])],
            "xi": [[i, n] for i, n in _top(partners[a], 5)],
        }
        if r["orcid"]:
            item["o"] = r["orcid"]
        if r["chair"]:
            item["c"] = r["chair"]
        persons_json.append(item)

    trends = topic_trends(tables, run, current_year)
    trend_by_topic = {r["topic_id"]: r["trend"] for r in trends.iter_rows(named=True)}
    topics = tables.topics
    topics_json = {
        "domains": {r[0]: r[1] for r in topics.select("domain_id", "domain").unique().iter_rows()},
        "fields": {
            r[0]: [r[1], r[2]]
            for r in topics.select("field_id", "field", "domain_id").unique().iter_rows()
        },
        "subfields": {
            r[0]: [r[1], r[2]]
            for r in topics.select("subfield_id", "subfield", "field_id").unique().iter_rows()
        },
        "topics": {
            r["topic_id"]: [r["name"], r["subfield_id"], trend_by_topic.get(r["topic_id"], "few")]
            for r in topics.iter_rows(named=True)
        },
    }

    used_institutions = {i for w in works_json for i in w.get("x", [])} | {
        i for p in persons_json for i, _ in p["xi"]
    }
    institutions_json = {
        r["institution_id"]: [r["name"], r["country_code"], r["type"]]
        for r in tables.institutions.filter(pl.col("institution_id").is_in(used_institutions))
        .sort("institution_id")
        .iter_rows(named=True)
    }

    meta = {
        "schema": SCHEMA_VERSION,
        "version": __version__,
        "institution": {
            "slug": config.slug,
            "ror": config.ror,
            "openalex": config.openalex_id,
            "name": {"de": config.name_de, "en": config.name_en},
        },
        "repository": config.repository,
        "legal": config.legal,
        "years": list(years),
        "currentYear": current_year,
        "retrievedAt": run.retrieved_at,
        "generatedAt": run.generated_at,
        "recentYears": config.scope.recent_years,
        "networkCap": network_cap,
        "minWorks": config.scope.min_works_per_person,
        "faculties": [
            {"id": f.id, "name": {"de": f.name_de, "en": f.name_en}} for f in config.faculties
        ],
        "units": [
            {
                "id": u.id,
                "faculty": u.faculty,
                "parent": u.parent,
                "name": {"de": u.name_de, "en": u.name_en},
            }
            for u in config.units
        ],
        "quality": quality_stats(tables),
    }
    return {
        "meta.json": meta,
        "works.json": works_json,
        "persons.json": persons_json,
        "topics.json": topics_json,
        "institutions.json": institutions_json,
    }


def quality_stats(tables: Tables) -> dict[str, Any]:
    a = tables.authorships
    p = tables.persons
    n_auth = max(a.height, 1)
    return {
        "works": tables.works.height,
        "persons": p.height,
        "internalAuthors": a["author_id"].n_unique(),
        "authorships": a.height,
        "authorshipsWithUnit": int((a["units"].list.len() > 0).sum()),
        "authorshipsWithFaculty": int((a["faculties"].list.len() > 0).sum()),
        "authorshipsWithoutText": int((~a["has_affiliation_text"]).sum()),
        "shareWithUnit": round(float((a["units"].list.len() > 0).sum()) / n_auth, 3),
        "personsBySource": {str(k): int(v) for k, v in p["unit_source"].value_counts().iter_rows()},
        "truncatedWorks": int(tables.works["authors_truncated"].sum()),
        "worksWithoutTopic": tables.works.height - tables.work_topics["work_id"].n_unique(),
    }


def _top(counter: Counter[str], n: int = TOP_N) -> list[tuple[str, int]]:
    return sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[:n]


def write_all(
    tables: Tables,
    config: Config,
    run: RunInfo,
    *,
    parquet_dir: Path,
    site_dir: Path,
    current_year: int | None = None,
) -> dict[str, int]:
    """Write Parquet and JSON; return file sizes in bytes."""
    current_year = current_year or dt.date.today().year
    parquet_dir.mkdir(parents=True, exist_ok=True)
    site_dir.mkdir(parents=True, exist_ok=True)
    sizes: dict[str, int] = {}
    frames = {**tables.as_dict(), "topic_trends": topic_trends(tables, run, current_year)}
    for name, frame in frames.items():
        path = parquet_dir / f"{name}.parquet"
        frame.write_parquet(path, compression="zstd", statistics=False)
        sizes[str(path)] = path.stat().st_size
    for name, doc in site_payload(tables, config, run, current_year).items():
        path = site_dir / name
        path.write_text(
            json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8"
        )
        sizes[str(path)] = path.stat().st_size
    return sizes


def update_index(site_root: Path, config: Config) -> None:
    """data/index.json lists every institution the site can show."""
    path = site_root / "index.json"
    entries: dict[str, Any] = {}
    if path.exists():
        entries = {e["slug"]: e for e in json.loads(path.read_text("utf-8"))["institutions"]}
    entries[config.slug] = {
        "slug": config.slug,
        "name": {"de": config.name_de, "en": config.name_en},
    }
    default = config.slug
    if path.exists():
        default = json.loads(path.read_text("utf-8")).get("default", config.slug)
    doc = {"default": default, "institutions": sorted(entries.values(), key=lambda e: e["slug"])}
    path.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
