# Case study: Themenkompass

## Problem

Students who look for a thesis topic, a seminar or a student assistant position need to
know who at their university works on what. That information is scattered: chair pages
are maintained by hand and look different everywhere, university-wide search does not
work across departments, and person-centred platforms rank people by citations. The
open catalogue OpenAlex has the publications, but it knows universities, not faculties or
chairs, and it is built for researchers rather than students.

The question behind the project: **Who at my university researches which topic, how
actively, and with whom?** The answer had to run at zero cost, work for any university,
and treat the people it shows fairly.

## Approach

1. **Checked sources and terms first.** OpenAlex data is CC0. Since February 2026 the API
   needs a free key and bills usage against a free daily allowance. That shaped the
   design: filter and cursor-paging calls only, free single-entity lookups where
   possible, and a budget guard in code.
2. **Measured before modelling.** A first fetch of the University of Oldenburg (all works
   2017–2026) showed that filtering by discipline pulls in the wrong people (health
   services research under “economics”) and that the reliable signal is the raw
   affiliation text on each paper, e.g. “Department of Business Administration, Economics
   and Law”.
3. **Modelled honestly.** Units are recognised with reviewed regular expressions per
   unit, stored in a public config file; OpenAlex sub-institutions count as internal;
   a curated mapping file fills the gaps by pull request; people are identified only by
   OpenAlex ids. Every person page says how its assignment was made.
4. **Found and fixed a structural error.** The first version counted university
   institutes that OpenAlex models as separate institutions (a marine research institute,
   the institute for economic education) as external partners, and missed works that
   named only those institutes. Fetching by OpenAlex lineage fixed both: 764 more works
   and 233 more people.
5. **Built a static site that asks the question directly.** The search field completes
   the sentence “Who at the university works on …?”. Topic map, search, person pages and
   network run entirely in the browser from about 11 MB of JSON. No rankings, no citation
   counts, no contact details.
6. **Validated against an independent list.** 20 people, drawn at random and stratified
   by faculty, were compared with their own ORCID records, and every missing work was
   classified with free OpenAlex lookups.
7. **Automated and documented.** Monthly GitHub Action, CI with typed Python and
   TypeScript, a fictional test dataset, a data quality page for non-specialists, issue
   forms for corrections and removals.

## Result

- A working instance for Oldenburg: 18,278 works and 3,600 people from 2017 to 2026,
  across six faculties.
- 73 % of the university's authorships are assigned to a unit from affiliation text alone;
  10 % of listed people cannot be placed in any faculty, which is stated openly.
- Validation (2023–2025): 94 of 96 works within the site's scope found, no misattributed
  works. The larger gap is structural: 44 of 141 ORCID works do not link the person to
  the university in OpenAlex.
- Cost of a monthly update: 187 OpenAlex list requests, $0.0187 of a free $1 daily
  allowance. Hosting and CI are free.
- A second university needs one config file; a helper command finds its ids and
  sub-institutions.

## Transferable skills

- **API work under constraints**: pagination, retries with backoff, caching, cost
  tracking from response headers, refusing expensive calls by design.
- **Data modelling**: turning nested JSON into tidy tables (polars), stable identifiers,
  deterministic exports, Parquet for analysis and compact JSON for delivery.
- **Data quality as a deliverable**: measuring coverage, finding a structural bias
  (institution hierarchy), validating against an independent source and classifying
  errors by cause instead of reporting one headline number.
- **Network analysis**: co-authorship graphs with sensible filters (team size, period,
  topic) and an accessible table alternative.
- **Engineering hygiene**: tests with fictional data, strict typing in Python and
  TypeScript, CI on every push, scheduled automation, reproducible sampling.
- **Responsible use of personal data**: purpose limitation, no ranking, opt-out without
  discussion, privacy notice, and communicating limits to a non-technical audience.
