# Data sources

Retrieved and checked on **29 September 2026** unless stated otherwise. Re-check the terms
when you set up a new instance; they change.

## OpenAlex (main source)

| | |
|---|---|
| What | Works, authorships (incl. raw affiliation text), topics, institutions |
| URL | https://openalex.org, API https://api.openalex.org |
| Licence | CC0 1.0. “OpenAlex data is made available under the CC0 license.” Attribution is appreciated, not required ([license](https://github.com/ourresearch/openalex-docs/blob/main/license.md)). |
| Terms of service | [OpenAlex Terms of Service](https://openalex.org/OpenAlex_termsofservice.pdf), **last revised 15 August 2026**, read in full by the maintainer on 29 September 2026 (the PDF sits behind a bot check that this project does not bypass). See the notes below. |
| API key | Required for production use since 13 February 2026; free with an OpenAlex account (openalex.org/settings/api). Stored only as the GitHub secret `OPENALEX_API_KEY`. |
| Limits and prices | Free daily allowance: $1 with a key, $0.10 without. Single-entity lookups free, list/filter calls $0.10 per 1,000, search $1 per 1,000, content downloads $10 per 1,000. Max 100 requests per second, max 100 results per page, basic paging up to 10,000 results (cursor paging beyond). Prepaid credit is only drawn after the free allowance ([pricing](https://help.openalex.org/access/pricing/), [authentication](https://help.openalex.org/api/authentication/)). |
| How this project uses it | Only list/filter calls with cursor paging and free single-entity lookups. Priced features are refused in code (`ForbiddenRequestError`). A per-run cap ($0.25) and a reserve on the remaining free allowance stop the run early (`BudgetExceededError`). Responses are cached on disk. A full run for Oldenburg: 187 list requests, $0.0187. The account needs no payment method, so nothing can be billed. |
| Obligations | None under CC0. The site names OpenAlex as its source anyway (footer, data page). |

### Notes on the OpenAlex terms (revised 15 August 2026)

- **Licence vs. terms.** The terms grant a “limited license” to use the free features and
  say that “unauthorized … republication of the Data or Database without Impactstory's
  prior written consent is strictly prohibited”. OpenAlex's own licence statement and
  help centre release the data under CC0, which is such an authorisation. This project
  relies on the CC0 statement. Because the two texts read differently, the maintainer can
  ask OurResearch (team@ourresearch.org) for a short written confirmation; no answer was
  requested yet.
- **Load.** Users must not impose an “unreasonable or disproportionately large load”. The
  pipeline makes about 200 paced requests per month and caches responses.
- **Access restrictions.** Users must not bypass measures that restrict access. This
  project does not scrape openalex.org and does not work around the bot check.
- **Marks.** No OpenAlex/OurResearch logo is used, and the site does not imply an
  affiliation; it names OpenAlex as its source.
- **Personal data.** Corrections or removals of personal data in OpenAlex itself go to
  privacy@openalex.org (see OpenAlex's privacy policy). The site points people there in
  addition to its own removal process.
- **No warranty.** OpenAlex gives no warranty for accuracy or completeness, which the
  site's data quality page reflects.
- **Governing law** is North Carolina, USA, with optional arbitration. Changes to the
  terms take effect when posted; re-read them when setting up a new instance.

## ROR — Research Organization Registry

| | |
|---|---|
| What | Persistent institution ids (the config's `ror`), used to find the OpenAlex institution |
| URL | https://ror.org, API https://api.ror.org/v2/organizations |
| Licence | CC0 1.0; attribution not required ([FAQ](https://ror.org/about/faqs/)) |
| Limits | From Q3 2026, requests without a client id get 50 requests per 5 minutes (with a free client id 2,000). Client id registration was paused at the time of checking ([docs](https://ror.readme.io/docs/client-id)). |
| How this project uses it | Only `find-institution`, a handful of requests when setting up a new university. Not used in the monthly update. |

## ORCID (validation only)

| | |
|---|---|
| What | Public works lists of 20 sampled people, used as their own publication lists |
| URL | https://pub.orcid.org/v3.0/ (public API, anonymous read access) |
| How this project uses it | `check-orcid` reads 20–40 records once per validation run. Only counts and OpenAlex ids are stored (`validation/`), no ORCID content. |
| Note | Many ORCID records are filled automatically from Crossref, the same upstream source OpenAlex uses, so the comparison is not fully independent. |

## Not used, on purpose

- **University web pages** (staff lists, chair pages, publication lists) are not scraped.
  Chairs come only from the optional, reviewed `mappings/<slug>.csv`.
- **Citation counts** are available in OpenAlex but not exported.
- **Google Scholar, ResearchGate** and similar services: their terms do not allow reuse.

## Software and fonts shipped with the site

| | Licence |
|---|---|
| Atkinson Hyperlegible Next (Braille Institute, via Fontsource) | SIL Open Font License 1.1 |
| Observable Plot | ISC |
| Cytoscape.js | MIT |
| MiniSearch | MIT |
