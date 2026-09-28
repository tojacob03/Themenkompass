"""Consistency checks for the committed data files (run in CI and after every update).

uv run python -m themenkompass.checks
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Any

MAX_TOTAL_BYTES = 30 * 1024 * 1024
FORBIDDEN_KEYS = ("cited", "citation", "h_index", "email", "phone")


def check_site(site_root: Path, mappings: Path) -> list[str]:
    errors: list[str] = []
    index_path = site_root / "index.json"
    if not index_path.exists():
        return [f"{index_path} missing"]
    index = json.loads(index_path.read_text("utf-8"))
    for entry in index["institutions"]:
        errors += check_institution(site_root / entry["slug"], mappings, entry["slug"])
    return errors


def check_institution(directory: Path, mappings: Path, slug: str) -> list[str]:
    def load(name: str) -> Any:
        return json.loads((directory / name).read_text("utf-8"))

    errors: list[str] = []
    meta, works, persons = load("meta.json"), load("works.json"), load("persons.json")
    topics, institutions = load("topics.json"), load("institutions.json")
    person_ids = {p["i"] for p in persons}
    unit_ids = {u["id"] for u in meta["units"]}
    faculty_ids = {f["id"] for f in meta["faculties"]}
    first, last = meta["years"]

    for w in works:
        if not first <= w["y"] <= last:
            errors.append(f"{slug}: work {w['i']} outside window ({w['y']})")
        errors += [
            f"{slug}: work {w['i']} unknown person {a}" for a in w["a"] if a not in person_ids
        ]
        errors += [
            f"{slug}: work {w['i']} unknown topic {t}" for t in w["tp"] if t not in topics["topics"]
        ]
        errors += [f"{slug}: work {w['i']} unknown unit {u}" for u in w["u"] if u not in unit_ids]
        errors += [
            f"{slug}: work {w['i']} unknown institution {i}"
            for i in w.get("x", [])
            if i not in institutions
        ]
    for p in persons:
        errors += [f"{slug}: person {p['i']} unknown unit {u}" for u in p["u"] if u not in unit_ids]
        errors += [
            f"{slug}: person {p['i']} unknown faculty {f}" for f in p["f"] if f not in faculty_ids
        ]
        errors += [
            f"{slug}: person {p['i']} unknown co-author {b}"
            for b, _ in p["ca"]
            if b not in person_ids
        ]
        if len(p["y"]) != last - first + 1:
            errors.append(f"{slug}: person {p['i']} activity has wrong length")
    for tid, (_, subfield, _trend) in topics["topics"].items():
        if subfield not in topics["subfields"]:
            errors.append(f"{slug}: topic {tid} unknown subfield {subfield}")

    raw = "".join((directory / n).read_text("utf-8") for n in ("works.json", "persons.json"))
    for key in FORBIDDEN_KEYS:
        if f'"{key}' in raw:
            errors.append(f"{slug}: forbidden key '{key}' in site data")

    exclude_file = mappings / f"{slug}.exclude.csv"
    if exclude_file.exists():
        lines = [
            line
            for line in exclude_file.read_text("utf-8").splitlines()
            if not line.startswith("#")
        ]
        excluded = {row["author_id"].strip() for row in csv.DictReader(lines)}
        leaked = excluded & person_ids
        errors += [f"{slug}: excluded person {a} is still listed" for a in sorted(leaked)]
        errors += [
            f"{slug}: excluded person {a} appears in {name}"
            for name in ("works.json", "persons.json")
            for a in sorted(excluded)
            if f'"{a}"' in (directory / name).read_text("utf-8")
        ]
    return errors


def total_size(*roots: Path) -> int:
    return sum(
        p.stat().st_size for root in roots if root.exists() for p in root.rglob("*") if p.is_file()
    )


def main() -> int:
    root = Path.cwd()
    site, parquet, mappings = root / "web/public/data", root / "data", root / "mappings"
    errors = check_site(site, mappings)
    size = total_size(site, parquet)
    if size > MAX_TOTAL_BYTES:
        errors.append(f"data files total {size / 1e6:.1f} MB, above the 30 MB budget")
    for e in errors[:50]:
        print("ERROR", e)
    print(f"{len(errors)} problems, data size {size / 1024 / 1024:.1f} MB")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
