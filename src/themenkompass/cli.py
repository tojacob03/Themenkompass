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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="themenkompass", description=__doc__)
    parser.add_argument("--config", type=Path, required=True, help="institution TOML file")
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

    p_aff = sub.add_parser("affiliations", help="show frequent raw affiliation strings")
    p_aff.add_argument("--limit", type=int, default=80)
    p_aff.add_argument("--unmatched", action="store_true", help="only strings no unit matches")

    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s %(name)s: %(message)s",
    )
    logging.getLogger("httpx").setLevel(logging.WARNING)
    config = load_config(args.config)
    commands = {
        "fetch": cmd_fetch,
        "build": cmd_build,
        "run": cmd_run,
        "affiliations": cmd_affiliations,
    }
    return commands[args.command](config, args)


if __name__ == "__main__":
    sys.exit(main())
