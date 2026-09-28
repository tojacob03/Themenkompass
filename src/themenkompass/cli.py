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
from themenkompass.fetch import fetch_works
from themenkompass.model import institution_strings, load_snapshot, match_faculties, match_units
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
    }
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(payload, fh)
    log.info("wrote %s (%d works)", path, len(works))
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="themenkompass", description=__doc__)
    parser.add_argument("--config", type=Path, required=True, help="institution TOML file")
    parser.add_argument("-v", "--verbose", action="store_true")
    sub = parser.add_subparsers(dest="command", required=True)

    p_fetch = sub.add_parser("fetch", help="download works from OpenAlex")
    p_fetch.add_argument("--cache-days", type=float, default=20)

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
    commands = {"fetch": cmd_fetch, "affiliations": cmd_affiliations}
    return commands[args.command](config, args)


if __name__ == "__main__":
    sys.exit(main())
