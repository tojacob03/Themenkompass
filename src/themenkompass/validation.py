"""Sample validation: compare the works of randomly chosen people with their own lists.

1. ``themenkompass --config ... sample`` draws a reproducible, faculty-stratified sample
   and writes ``validation/<slug>-sample.csv`` plus a worksheet with each person's works
   in the comparison window (the worksheet stays in .cache, it is not committed).
2. A person fills in the columns reference_url ... note by hand after reading the
   publication list on the person's own page. No page content is stored.
3. ``themenkompass --config ... validation`` summarises the CSV into
   ``web/public/data/<slug>/validation.json`` for the data quality page.
"""

from __future__ import annotations

import csv
import datetime as dt
import json
import random
from collections import defaultdict
from pathlib import Path
from typing import Any

from themenkompass.config import Config
from themenkompass.model import Tables

FIELDS = [
    "author_id",
    "name",
    "unit",
    "faculty",
    "themenkompass_works",
    "reference_url",
    "reference_works",
    "found",
    "missing",
    "extra",
    "wrong",
    "note",
]
MANUAL = ("reference_url", "reference_works", "found", "missing", "extra", "wrong", "note")


MIN_WORKS = 3


def draw_sample(
    tables: Tables, config: Config, years: tuple[int, int], n: int = 20, seed: int = 2026
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """People with a recognised unit and at least three works in the window, spread over
    faculties proportionally. Returns the sample and, per faculty, an ordered reserve
    list: if a sampled person has no own publication list, the next reserve from the
    same faculty takes their place (documented in the note column)."""
    joined = tables.authorships.join(tables.works.select("work_id", "year"), on="work_id")
    counts: dict[str, int] = defaultdict(int)
    for author_id, year in joined.select("author_id", "year").iter_rows():
        if year is not None and years[0] <= year <= years[1]:
            counts[author_id] += 1

    eligible = [
        p
        for p in tables.persons.to_dicts()
        if p["units"] and counts.get(p["author_id"], 0) >= MIN_WORKS
    ]
    by_faculty: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for p in sorted(eligible, key=lambda p: p["author_id"]):
        by_faculty[p["faculties"][0]].append(p)

    rng = random.Random(seed)
    total = sum(len(v) for v in by_faculty.values())
    # proportional allocation, at least one per faculty
    quota = {f: max(1, round(n * len(v) / total)) for f, v in by_faculty.items()}
    while sum(quota.values()) > n:
        biggest = max(quota, key=lambda f: quota[f])
        quota[biggest] -= 1
    while sum(quota.values()) < n:
        smallest_share = min(quota, key=lambda f: quota[f] / len(by_faculty[f]))
        quota[smallest_share] += 1

    def row(p: dict[str, Any], faculty: str) -> dict[str, Any]:
        return {
            "author_id": p["author_id"],
            "name": p["name"],
            "unit": p["units"][0],
            "faculty": faculty,
            "themenkompass_works": counts[p["author_id"]],
            **dict.fromkeys(MANUAL, ""),
        }

    sample: list[dict[str, Any]] = []
    reserves: list[dict[str, Any]] = []
    for faculty in sorted(by_faculty):
        order = rng.sample(by_faculty[faculty], len(by_faculty[faculty]))
        sample += [row(p, faculty) for p in order[: quota[faculty]]]
        reserves += [row(p, faculty) for p in order[quota[faculty] : quota[faculty] + 10]]
    return sample, reserves


def worksheet(
    tables: Tables, author_ids: list[str], years: tuple[int, int]
) -> dict[str, list[str]]:
    """Titles per sampled person in the window, to compare against their own list."""
    joined = tables.authorships.join(tables.works, on="work_id").filter(
        tables.authorships["author_id"].is_in(author_ids)
    )
    out: dict[str, list[str]] = defaultdict(list)
    for row in joined.sort("year", descending=True).iter_rows(named=True):
        if years[0] <= row["year"] <= years[1]:
            out[row["author_id"]].append(f"{row['year']} | {row['title']} | {row['doi'] or ''}")
    return dict(out)


def write_sample(path: Path, rows: list[dict[str, Any]]) -> None:
    """Committed files identify people by OpenAlex id only."""
    rows = [{**r, "name": ""} for r in rows]
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def summarise(path: Path, years: tuple[int, int], notes: dict[str, list[str]]) -> dict[str, Any]:
    with path.open(newline="", encoding="utf-8") as fh:
        rows = [r for r in csv.DictReader(fh) if (r.get("reference_works") or "").strip()]
    if not rows:
        raise ValueError(f"{path}: no evaluated rows yet")

    def total(col: str) -> int:
        return sum(int(r[col] or 0) for r in rows)

    import re

    reasons: dict[str, int] = dict.fromkeys(MISSING_REASONS, 0)
    for r in rows:
        for key, value in re.findall(r"(\w+)=(\d+)", r.get("note") or ""):
            if key in reasons:
                reasons[key] += int(value)
    in_scope = total("reference_works") - reasons["no_affiliation"] - reasons["out_of_scope"]
    return {
        "checkedAt": dt.date.today().isoformat(),
        "source": "ORCID",
        "window": list(years),
        "people": len(rows),
        "replaced": sum((r.get("note") or "").count("replaces ") for r in rows),
        "missingReasons": reasons,
        "inScope": in_scope,
        "reference": total("reference_works"),
        "found": total("found"),
        "missing": total("missing"),
        "extra": total("extra"),
        "wrong": total("wrong"),
        "notes": notes,
    }


def write_summary(path: Path, summary: dict[str, Any]) -> None:
    path.write_text(json.dumps(summary, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------- ORCID check

ORCID_API = "https://pub.orcid.org/v3.0"
# ORCID work types that correspond to the OpenAlex types the site shows.
ORCID_TYPES = {
    "journal-article",
    "book",
    "edited-book",
    "book-chapter",
    "conference-paper",
    "preprint",
    "report",
    "working-paper",
    "dissertation-thesis",
    "review",
    "data-paper",
}
TITLE_MATCH = 0.9


def orcid_works(http: Any, orcid: str, years: tuple[int, int]) -> list[dict[str, Any]]:
    """Works on a person's ORCID record in the window (one entry per ORCID work group)."""
    response = http.get(f"{ORCID_API}/{orcid}/works", headers={"Accept": "application/json"})
    response.raise_for_status()
    works = []
    for group in response.json().get("group", []):
        summary = group["work-summary"][0]
        year_raw = ((summary.get("publication-date") or {}).get("year") or {}).get("value")
        if not year_raw or not years[0] <= int(year_raw) <= years[1]:
            continue
        if summary.get("type") not in ORCID_TYPES:
            continue
        dois = [
            e["external-id-value"].lower().removeprefix("https://doi.org/")
            for e in (summary.get("external-ids") or {}).get("external-id", [])
            if e.get("external-id-type") == "doi" and e.get("external-id-relationship") == "self"
        ]
        title = ((summary.get("title") or {}).get("title") or {}).get("value") or ""
        works.append({"year": int(year_raw), "title": title, "doi": dois[0] if dois else None})
    return works


def normalise_title(title: str) -> str:
    import re

    return re.sub(r"[^a-z0-9äöüß]+", " ", title.casefold()).strip()


def compare(
    reference: list[dict[str, Any]], ours: list[dict[str, Any]]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Match by DOI, then by title similarity. Returns (found, missing, extra)."""
    from difflib import SequenceMatcher

    unmatched = list(ours)
    found, missing = [], []
    for ref in reference:
        match = None
        for candidate in unmatched:
            if ref["doi"] and candidate.get("doi") and ref["doi"] == candidate["doi"].lower():
                match = candidate
                break
        if match is None:
            a = normalise_title(ref["title"])
            for candidate in unmatched:
                b = normalise_title(candidate["title"])
                if a and b and SequenceMatcher(None, a, b).ratio() >= TITLE_MATCH:
                    match = candidate
                    break
        if match is None:
            missing.append(ref)
        else:
            found.append(ref)
            unmatched.remove(match)
    return found, missing, unmatched


MISSING_REASONS = (
    "no_doi",
    "not_in_openalex",
    "other_profile",
    "no_affiliation",
    "out_of_scope",
    "unexplained",
)


def classify_missing(
    lookup: Any, work: dict[str, Any], author_id: str, config: Config, years: tuple[int, int]
) -> str:
    """Why is a work from the person's own list not shown? Uses free single-work lookups.

    no_doi           cannot be checked automatically
    not_in_openalex  OpenAlex does not know the DOI
    other_profile    OpenAlex has the work, but under a different author profile
    no_affiliation   the person is on it, but the university is not named/linked
    out_of_scope     type or year outside what the site shows
    unexplained      should have been found
    """
    if not work["doi"]:
        return "no_doi"
    try:
        record = lookup(work["doi"])
    except Exception:  # 404 or similar: OpenAlex does not know this DOI
        return "not_in_openalex"
    authorships = record.get("authorships") or []
    mine = [a for a in authorships if ((a.get("author") or {}).get("id") or "").endswith(author_id)]
    if not mine:
        return "other_profile"
    linked = any(
        (i.get("id") or "").endswith(config.openalex_id)
        for a in mine
        for i in a.get("institutions", [])
    )
    if not linked:
        return "no_affiliation"
    year = record.get("publication_year") or 0
    if record.get("type") not in config.scope.work_types or not years[0] <= year <= years[1]:
        return "out_of_scope"
    return "unexplained"
