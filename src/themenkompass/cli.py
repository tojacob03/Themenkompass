"""Command line entry point: ``uv run themenkompass <command> --config config/uol.toml``."""

from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import logging
import sys
from collections import Counter
from pathlib import Path
from typing import Any

from themenkompass.config import Config, load_config
from themenkompass.export import RunInfo, quality_stats, update_index, write_all
from themenkompass.fetch import fetch_works, resolve_authors
from themenkompass.model import (
    MappingRow,
    build,
    institution_strings,
    load_exclusions,
    load_mapping,
    load_snapshot,
    match_faculties,
    match_units,
)
from themenkompass.openalex import BudgetExceededError, DiskCache, OpenAlexClient
from themenkompass.validation import (
    classify_missing,
    compare,
    draw_sample,
    orcid_works,
    summarise,
    worksheet,
    write_sample,
    write_summary,
)

log = logging.getLogger("themenkompass")

CACHE_DIR = Path(".cache")


def snapshot_path(config: Config) -> Path:
    return CACHE_DIR / config.slug / "works.json.gz"


def cmd_fetch(config: Config, args: argparse.Namespace) -> int:
    years = config.scope.year_range()
    cache = DiskCache(CACHE_DIR / "openalex", ttl_seconds=args.cache_days * 24 * 3600)
    with OpenAlexClient(config.budget, cache=cache) as client:
        if not client.api_key:
            log.warning("OPENALEX_API_KEY not set: using the smaller keyless allowance")
        try:
            works = fetch_works(client, config, years)
        except BudgetExceededError as exc:
            log.error("stopped to stay within the free allowance: %s", exc)
            log.error(client.spend.summary())
            return 2
        log.info(client.spend.summary())
    path = snapshot_path(config)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "retrieved_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "years": list(years),
        "works": works,
        "spend": {
            "requests": client.spend.requests,
            "cached": client.spend.cached,
            "usd": round(client.spend.usd, 4),
            "keyed": bool(client.api_key),
        },
    }
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(payload, fh)
    log.info("wrote %s (%d works)", path, len(works))
    return 0


def cmd_build(config: Config, args: argparse.Namespace) -> int:
    snapshot = load_snapshot(snapshot_path(config))
    mapping = load_mapping(config.mapping_path, config)
    exclude = load_exclusions(config.exclude_path)
    if (mapping or exclude) and not args.offline:
        mapping, exclude = _canonicalise_ids(config, mapping, exclude)
    tables = build(snapshot["works"], config, mapping=mapping, exclude=exclude)
    first, last = snapshot["years"]
    run = RunInfo.now((first, last), snapshot["retrieved_at"])
    sizes = write_all(
        tables,
        config,
        run,
        parquet_dir=args.parquet_dir / config.slug,
        site_dir=args.site_dir / config.slug,
    )
    update_index(args.site_dir, config)
    q = quality_stats(tables)
    run_report = {
        "retrieved_at": snapshot["retrieved_at"],
        "years": snapshot["years"],
        "openalex": snapshot.get("spend"),
        "works": q["works"],
        "persons": q["persons"],
        "share_with_unit": q["shareWithUnit"],
    }
    report_path = args.parquet_dir / config.slug / "run.json"
    report_path.write_text(json.dumps(run_report, indent=1) + "\n", encoding="utf-8")
    for path, size in sorted(sizes.items()):
        log.info("%8.1f kB  %s", size / 1024, path)
    log.info("total %.1f MB", sum(sizes.values()) / 1024 / 1024)
    log.info(
        "%d works, %d people listed, %.0f%% of authorships assigned to a unit",
        q["works"],
        q["persons"],
        100 * q["shareWithUnit"],
    )
    return 0


def _canonicalise_ids(
    config: Config, mapping: dict[str, MappingRow], exclude: set[str]
) -> tuple[dict[str, MappingRow], set[str]]:
    """Follow OpenAlex author merges so curated files keep working (free lookups)."""
    cache = DiskCache(CACHE_DIR / "openalex", ttl_seconds=7 * 24 * 3600)
    with OpenAlexClient(config.budget, cache=cache) as client:
        resolved = resolve_authors(client, [*mapping, *exclude])
    for old, new in resolved.items():
        if old != new:
            log.warning("author %s was merged into %s - please update the mapping files", old, new)
    new_mapping = {
        resolved[a]: MappingRow(resolved[a], r.unit, r.chair, r.note) for a, r in mapping.items()
    }
    # Exclusions apply to both ids, in case the merge is ever undone.
    return new_mapping, exclude | {resolved[a] for a in exclude}


def cmd_run(config: Config, args: argparse.Namespace) -> int:
    return cmd_fetch(config, args) or cmd_build(config, args)


VALIDATION_YEARS = (2023, 2025)  # three complete years


def _tables_from_snapshot(config: Config) -> Any:
    snapshot = load_snapshot(snapshot_path(config))
    exclude = load_exclusions(config.exclude_path)
    mapping = load_mapping(config.mapping_path, config)
    return build(snapshot["works"], config, mapping=mapping, exclude=exclude)


def cmd_sample(config: Config, args: argparse.Namespace) -> int:
    tables = _tables_from_snapshot(config)
    rows, reserves = draw_sample(tables, config, VALIDATION_YEARS, n=args.n, seed=args.seed)
    path = Path("validation") / f"{config.slug}-sample.csv"
    if path.exists() and not args.force:
        log.error("%s exists; use --force to draw a new sample", path)
        return 1
    write_sample(path, rows)
    write_sample(path.with_name(f"{config.slug}-reserves.csv"), reserves)
    sheet = worksheet(tables, [r["author_id"] for r in rows + reserves], VALIDATION_YEARS)
    sheet_path = CACHE_DIR / config.slug / "validation-worksheet.json"
    sheet_path.write_text(json.dumps(sheet, ensure_ascii=False, indent=1), encoding="utf-8")
    log.info("wrote %s (%d people) and %s", path, len(rows), sheet_path)
    return 0


def cmd_check_orcid(config: Config, args: argparse.Namespace) -> int:
    """Fill the sample CSV from ORCID records; replace people without a usable record."""
    import csv

    import httpx

    tables = _tables_from_snapshot(config)
    persons = {p["author_id"]: p for p in tables.persons.to_dicts()}
    joined = tables.authorships.join(tables.works, on="work_id")
    sample_path = Path("validation") / f"{config.slug}-sample.csv"
    with sample_path.open(encoding="utf-8") as fh:
        sample = list(csv.DictReader(fh))
    with sample_path.with_name(f"{config.slug}-reserves.csv").open(encoding="utf-8") as fh:
        reserves = list(csv.DictReader(fh))
    details: dict[str, Any] = {}
    result: list[dict[str, Any]] = []
    reasons_total: Counter[str] = Counter()
    cache = DiskCache(CACHE_DIR / "openalex", ttl_seconds=30 * 24 * 3600)
    openalex = OpenAlexClient(config.budget, cache=cache)

    def lookup(doi: str) -> dict[str, Any]:
        return openalex.get(f"works/doi:{doi}", {"select": "id,publication_year,type,authorships"})

    with httpx.Client(timeout=30, headers={"User-Agent": "themenkompass-validation"}) as http:
        queue = list(sample)
        while queue:
            row = queue.pop(0)
            orcid = persons.get(row["author_id"], {}).get("orcid")
            reference = orcid_works(http, orcid, VALIDATION_YEARS) if orcid else []
            if not reference:
                replacement = next((r for r in reserves if r["faculty"] == row["faculty"]), None)
                log.info("%s: no ORCID works in window -> replaced", row["author_id"])
                if replacement:
                    reserves.remove(replacement)
                    # keep the whole chain so every replacement is counted
                    replacement["note"] = "; ".join(
                        filter(
                            None, [row.get("note"), f"replaces {row['author_id']} (no ORCID works)"]
                        )
                    )
                    queue.insert(0, replacement)
                continue
            ours = [
                {"year": r["year"], "title": r["title"], "doi": r["doi"]}
                for r in joined.filter(joined["author_id"] == row["author_id"]).iter_rows(
                    named=True
                )
                if VALIDATION_YEARS[0] <= r["year"] <= VALIDATION_YEARS[1]
            ]
            found, missing, extra = compare(reference, ours)
            reasons = Counter(
                classify_missing(lookup, m, row["author_id"], config, VALIDATION_YEARS)
                for m in missing
            )
            reasons_total.update(reasons)
            row["note"] = "; ".join(
                filter(
                    None,
                    [
                        row.get("note", ""),
                        ", ".join(f"{k}={v}" for k, v in sorted(reasons.items())),
                    ],
                )
            )
            row.update(
                reference_url=f"https://orcid.org/{orcid}",
                reference_works=len(reference),
                found=len(found),
                missing=len(missing),
                extra=len(extra),
                themenkompass_works=len(ours),
            )
            row.setdefault("wrong", "")
            row["name"] = ""  # the published sample lists ids only
            details[row["author_id"]] = {"missing": missing, "extra": extra}
            result.append(row)
    openalex.close()
    write_sample(sample_path, result)
    log.info("missing works by reason: %s (%s)", dict(reasons_total), openalex.spend.summary())
    out = CACHE_DIR / config.slug / "validation-details.json"
    out.write_text(json.dumps(details, ensure_ascii=False, indent=1), encoding="utf-8")
    log.info("wrote %s and %s", sample_path, out)
    return 0


def cmd_validation(config: Config, args: argparse.Namespace) -> int:
    notes_path = Path("validation") / f"{config.slug}-notes.json"
    notes = (
        json.loads(notes_path.read_text("utf-8")) if notes_path.exists() else {"de": [], "en": []}
    )
    summary = summarise(Path("validation") / f"{config.slug}-sample.csv", VALIDATION_YEARS, notes)
    out = args.site_dir / config.slug / "validation.json"
    write_summary(out, summary)
    log.info("wrote %s: %s", out, {k: v for k, v in summary.items() if k != "notes"})
    return 0


def cmd_affiliations(config: Config, args: argparse.Namespace) -> int:
    """List frequent raw affiliation strings - the starting point for a new unit config."""
    snapshot = load_snapshot(snapshot_path(config))
    counts: Counter[str] = Counter()
    for work in snapshot["works"]:
        for authorship in work.get("authorships", []):
            for raw in institution_strings(authorship, config):
                if args.unmatched and (match_units(raw, config) or match_faculties(raw, config)):
                    continue
                counts[raw.strip()] += 1
    for text, n in counts.most_common(args.limit):
        print(f"{n:5d}  {text}")
    return 0


def cmd_find_institution(args: argparse.Namespace) -> int:
    import httpx

    from themenkompass.config import Budget
    from themenkompass.setup import config_skeleton, openalex_institution, search_ror

    with httpx.Client(timeout=30) as http:
        hits = search_ror(http, args.name)
    if not hits:
        log.error("no ROR match for %r", args.name)
        return 1
    for i, hit in enumerate(hits):
        print(f"[{i}] {hit['ror']}  {hit['name']} ({hit['city']}) {hit['status']}")
    choice = hits[args.pick]
    with OpenAlexClient(Budget()) as client:
        info = openalex_institution(client, choice["ror"])
    print(f"\nOpenAlex {info['openalex_id']}: {info['name']}, {info['works']} works")
    print(config_skeleton(args.slug or "new", choice["ror"], info))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="themenkompass", description=__doc__)
    parser.add_argument("--config", type=Path, help="institution TOML file")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    p_fetch = sub.add_parser("fetch", help="download works from OpenAlex")
    p_fetch.add_argument("--cache-days", type=float, default=20)

    p_build = sub.add_parser("build", help="build tables and site data from the snapshot")
    p_run = sub.add_parser("run", help="fetch + build")
    p_run.add_argument("--cache-days", type=float, default=20)
    for p in (p_build, p_run):
        p.add_argument("--parquet-dir", type=Path, default=Path("data"))
        p.add_argument("--site-dir", type=Path, default=Path("web/public/data"))
        p.add_argument("--offline", action="store_true", help="skip resolving merged ids")

    p_sample = sub.add_parser("sample", help="draw the validation sample")
    p_sample.add_argument("-n", type=int, default=20)
    p_sample.add_argument("--seed", type=int, default=2026)
    p_sample.add_argument("--force", action="store_true")
    sub.add_parser("check-orcid", help="compare the sample with the people's ORCID records")
    p_val = sub.add_parser("validation", help="summarise the evaluated validation sample")
    p_val.add_argument("--site-dir", type=Path, default=Path("web/public/data"))

    p_aff = sub.add_parser("affiliations", help="show frequent raw affiliation strings")
    p_aff.add_argument("--limit", type=int, default=80)
    p_aff.add_argument("--unmatched", action="store_true", help="only strings no unit matches")

    p_find = sub.add_parser(
        "find-institution", help="look up ROR and OpenAlex ids for a new config"
    )
    p_find.add_argument("name")
    p_find.add_argument("--pick", type=int, default=0, help="which ROR match to use")
    p_find.add_argument("--slug")

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if args.command == "find-institution":
        return cmd_find_institution(args)
    if args.config is None:
        parser.error("--config is required for this command")
    config = load_config(args.config)
    commands = {
        "fetch": cmd_fetch,
        "build": cmd_build,
        "run": cmd_run,
        "affiliations": cmd_affiliations,
        "sample": cmd_sample,
        "validation": cmd_validation,
        "check-orcid": cmd_check_orcid,
    }
    return commands[args.command](config, args)


if __name__ == "__main__":
    sys.exit(main())
