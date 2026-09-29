# Contributing

Thank you for helping. The most valuable contributions are corrections to who belongs
where, and configurations for further universities.

## Ground rules for data

- Only public, professional, bibliographic information. **Never** add e-mail addresses,
  phone numbers, photos, private details or assessments of people.
- People are identified by **OpenAlex author ids** (`A…`), never by name.
- Removal requests are honoured without discussion. They go to
  `mappings/<slug>.exclude.csv` and are never reverted.
- No scraping of university web pages. Mapping rows need a source a reviewer can check
  (see below).

## Correct or add an assignment (`mappings/<slug>.csv`)

One row per person:

```csv
author_id,unit,chair,note
A5012345678,wire,Chair of Economic Policy,own publication list
```

| Column | Content |
|---|---|
| `author_id` | OpenAlex author id, shown on the person page |
| `unit` | A unit id from `config/<slug>.toml`, or empty to keep the automatic unit |
| `chair` | Chair or working group, as the university names it |
| `note` | Where it comes from: “self-reported”, “own publication list”, “chair page” … |

A mapping row overrides the automatic assignment and also lists people with fewer
works than the threshold. CI validates the file (known unit, valid id, no duplicates).
If OpenAlex merges author profiles, the monthly run warns and follows the new id.

## Add a university

1. `uv run themenkompass find-institution "Name of the University" --slug <slug>`
   prints ROR id, OpenAlex id, sub-institutions and a config skeleton. Save it as
   `config/<slug>.toml`.
2. Add the faculties and set `[site] repository`.
3. `uv run themenkompass --config config/<slug>.toml fetch`, then
   `... affiliations --unmatched` lists the most frequent affiliation strings that no
   unit recognises yet. Add `[[units]]` with regular expressions (English and local
   language), and `institutions = [...]` for OpenAlex sub-institutions. Repeat until the
   remaining strings only name the university itself.
4. `... build`, then `uv run python -m themenkompass.checks` and look at the site with
   `cd web && npm run dev`.
5. Open a pull request. The monthly workflow picks up every `config/*.toml`.

Patterns must only match text that clearly belongs to the unit. When unsure, leave a
string unassigned: an honest gap is better than a wrong assignment.

## Development

```bash
uv sync                       # Python 3.12, installs dev tools
uv run pytest                 # tests use invented data in tests/fixtures, no network
uv run ruff check . && uv run ruff format --check . && uv run mypy
cd web && npm ci && npm test && npm run build
```

- Test data is **fictional** (`tests/fixtures/make_works.py`, `web/src/fixtures.ts`). Do not
  add real people to tests.
- Keep the Python trend rule (`export.trend`) and the TypeScript one (`analysis.trend`) in
  sync; both test suites share the same cases.
- Commit messages in English, imperative mood.

## Reporting problems

Use the issue forms: **Report an error** for wrong data, **Remove me** for removals.
Errors in OpenAlex itself can also be reported to OpenAlex, which helps everyone.
