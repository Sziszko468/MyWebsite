# Test results

Part of the [Command Center and Digital Archive](README.md). Only what was actually run is listed. Part A is PROMPT 37.1 (the current state); part B is the record of PROMPT 37.

# A. PROMPT 37.1 — 2026-11-26, `feature/archive-data-integrity`

Environment: Windows 11 (10.0.26300), Intel i9-13900H (14 cores, 20 threads), Node 22.23.1, Vitest 5.0.5 (forks, 19 workers), headless system Chrome. `.env` sets `VITE_SITE_URL` only (no backend
address) except where the backend build is named.

## A1. Commands, on the final code

| Command | Result |
| --- | --- |
| `npx vitest run src/archive` | 90 of 90 passed (2 files) |
| `npx vitest run server/test/analyticsPerformance.test.ts` | 12 of 12 passed |
| `npx vitest run`, four times | runs 2 and 4: **3950 of 3950 passed** (180 files). Runs 1 and 3: **3949 passed, 1 failed**, the same test of `server/test/email.test.ts` (below) |
| `npx tsc -b` | passed |
| `npx oxlint` | passed, no findings |
| `npm run i18n` | passed: 4976 texts × 3 languages from 91 sources, spelling HU / EN / NL 0 not found, 0 errors, 0 warnings |
| `npm run build` | passed, 121 pages prerendered |
| `npm run check:seo` | passed: 122 files, 91 indexable, 31 noindex |

**The remaining failure:** `email.test.ts` › "says what the administrator wrote about timing …" (`Cannot read properties of undefined` on the Hungarian e-mail). Not the timing test of this task,
not touched by it, and **not fixed**: the untouched test fails 3 of 5 times run on its own (`npx vitest run server/test/email.test.ts -t "says what the administrator wrote"`), while
`npx vitest run server/test/email.test.ts` passed 5 of 5. Details: [DATA_INTEGRITY](DATA_INTEGRITY.md) §6. **The full suite is therefore not reliably green.** (In this agent environment Vitest uses its
compact reporter, which prints a file's console output only when it fails; the timing figures come from runs with `--reporter=default`.) *Later the same day that test was fixed; the figures of the
follow-up are in [DATA_INTEGRITY](DATA_INTEGRITY.md) §6.*

## A2. In a browser

| Check | Result |
| --- | --- |
| `node tools/e2e/archive-backend-check.cjs` on a build with `VITE_API_URL=/`, real server, scratch database | **27 of 27** ([DATA_INTEGRITY](DATA_INTEGRITY.md) §5). Earlier runs: 7 of 27 (the script read the browser's 30 s cache; fixed in the script), then 24 of 27 (the lost query; a real defect, fixed) |
| `node tools/e2e/archive-journey.cjs` (development server, built-in content) | 21 of 21 steps passed |
| `node tools/audit/audit-archive.cjs dist` (production build, 150 views) | 150 views, 0 findings |

## A3. Reproductions before changing code

| What | Result on the unchanged code |
| --- | --- |
| `npx vitest run`, three times | 3 of 3 failed one timing test (timeout once, CPU budget twice) |
| The timing file under controlled load | passes alone and beside compute-only load; **fails** beside memory-heavy load ([DATA_INTEGRITY](DATA_INTEGRITY.md) §6) |
| `src/archive/integrity.test.ts` | 35 of 50 failed |
| `server/test/projectCategories.test.ts` | 1 of 5 failed (HTTP 500) |
| `server/test/staticRedirect.test.ts` | 4 of 6 failed (written after the browser check found the defect) |
| `server/test/testScheduling.test.ts` against three deliberately broken configurations | each caught |

New tests: `integrity.test.ts` 50, `projectCategories.test.ts` 5, `staticRedirect.test.ts` 6, `testScheduling.test.ts` 3. No test was skipped, removed, quarantined or loosened; the only edits to
existing tests are two new fields in a fixture of `archive.test.ts` and a corrected comment in `analyticsPerformance.test.ts`.

## A4. Known from reading the code, not from a test run

That a late preview answer could reach the **Work page** drafts for the administrator who asked for them (the store behaviour is tested; the page was not driven); that the Work page shows an empty
chip for an unnamed category; that the Cloudflare Workers configuration was not exercised.

## A5. Not tested

Production, staging or the production database; Cloudflare in front of the server; CI; Linux; physical phones; Safari; Firefox; screen readers; Lighthouse; `npm audit`. The performance
measurements of part B were not repeated (the `useArchive` chunk grew from 15.7 to 16.7 kB, 6.3 to 6.7 kB gzip; the main file by 0.04 kB). The Lab, demo and playground journeys were not repeated:
their code did not change.

# B. PROMPT 37 — 2026-11-25, `feature/command-center-digital-archive` (base `9d39cc6`)

## 1. Project checks

| Command | Result |
| --- | --- |
| `npx tsc -b` | passed |
| `npx oxlint` | passed, no findings |
| `npm run i18n` | passed: 4974 texts × 3 languages from 91 sources, spelling HU / EN / NL 0 not found, 0 errors, 0 warnings |
| `npx vitest run` | **3885 of 3886 passed, 1 failed** (175 of 176 files) |
| `npx vitest run server/test/analyticsPerformance.test.ts` | the file with the failure, alone: 12 of 12 passed |
| `npm run build` | passed, 121 pages prerendered |
| `npm run check:seo` | passed: 122 files, 91 indexable, 31 noindex |

**The failure of the full run:** `analyticsPerformance.test.ts` › "communication answers in good time …": 1704 ms against a budget of 1500 ms. It is a timing budget of server code that this branch does not
touch (nothing under `server/` changed), it passes alone, and the same file failed only under the load of the full suite in earlier work. It is reported, not fixed.

## 2. Unit tests of this feature

`src/archive/archive.test.ts`, **40 tests**: building the entries (counts, anchors, order, categories, only real fields, languages), public / private separation (drafts, invalid records,
duplicates, demos without a page, the administrator's preview, a source scan for private imports, requests, storage and the theme), search (accents, case, every word), filters, sorting in the
language's collation, empty results, the address and direct links (sanitising), both pages in three languages, routes, titles and descriptions, the footer and the system bar, lazy loading, the motion
and control rules, and the words. They include that the Lab still has six experiences and the header navigation six pages. Breadcrumbs and structured data are covered by `check:seo`.

## 3. Journey in a real browser

`tools/e2e/archive-journey.cjs`, headless Chrome against the development server.

**21 of 21 steps passed:** the footer's links; the Command Center's sectors, bands and every link (27 distinct internal links, all reached a page); the archive's entries, search, filters,
sorting, address, Back, reload and direct links; the preview flag (no API request made by the pages, nothing stored; **that run had no backend address, so none could be made**: see A2); the theme; the keyboard; motion and reduced motion; hu / en / nl; 390 and
320 px with touch; the existing pages (work, a project, its demo, the Lab's six, the playground, services, about, contact); and leaving (after four more round trips: DOM nodes 2486 → 2486, event
listeners 300 → 300, documents 2 → 2); no page or console error.

## 4. Responsive and accessibility audit

`tools/audit/audit-archive.cjs` on the production build: 5 views (Command Center, archive, filtered, empty, direct link) × 3 languages × dark and light × 1440 / 1024 / 768 / 390 / 320 px =
**150 views**; layout checks, axe-core (WCAG 2.0–2.2 A/AA and best practice), structure, entry counts, console errors.

**Final run: 150 views, 0 findings.**

An earlier run of the matrix reported **2 findings** (axe `target-size` on the footer's "Lab" link, 320 px, Hungarian, direct-link view, dark and light). The cause was the audit, not the page: it
measured where its scroll walk had ended, with the link half under the sticky header (a probe showed the header covering every footer link at some scroll position, also on an unchanged page). The audit
now returns to the top, or to the linked entry, before measuring.

## 5. Regression journeys (existing features)

| Journey | Result |
| --- | --- |
| `tools/e2e/lab2-journey.cjs` (the six official Lab experiences) | 37 of 37 steps passed |
| `tools/e2e/demos-journey.cjs` (interactive project demos) | 26 of 26 steps passed |
| `tools/e2e/playground-journey.cjs` (Design System Playground) | 26 of 26 steps passed |

No file of the Lab experiences, the demos or the playground was changed. Journeys of the shop, the booking, the quotations, the client portal, the administration and the assistant were **not** run:
this branch changes none of their code (the shared changes are listed in [README](README.md)).

## 6. Defects found while testing, and fixed

| Found by | Defect | Fix |
| --- | --- | --- |
| Browser | Search and filter controls bound to the address lost keystrokes and "did not change their state" (the router applies a new address in a transition) | Local state, mirrored to the address |
| Browser, 390 px | The Command Center scrolled sideways (pictures arriving from the side) | The featured list clips horizontally |
| Browser, phone | Title links were 26 px high | Padding on the heading links |
| Looking | A hole in the map's grid; the design tool listed among the demos; "Commandocentrum" broken mid-word in the system bar | New spans; a line of its own under the Lab; wrapping rules |
| `i18n` | "Center" is not British English | Allowed, with the reason beside it (it is the page's name) |
| `oxlint` | A control-character expression and a state update inside an effect | Justified comment; the update moved into rendering |

## 7. Not tested

Production or a staging server; a real backend or CMS data in a browser (the pages ran on the website's built-in content; CMS-shaped data is covered by unit tests only); physical phones; Safari;
Firefox; screen readers; browser zoom and forced colours; Lighthouse; `npm audit`.
