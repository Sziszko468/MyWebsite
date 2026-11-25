# Test results

Part of the [Command Center and Digital Archive](README.md). All runs on 2026-11-25, on one Windows 11 machine, on `feature/command-center-digital-archive` (base `9d39cc6`). Only what was actually
run is listed.

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
sorting, address, Back, reload and direct links; the preview flag (**no API request made by the pages**, nothing stored); the theme; the keyboard; motion and reduced motion; hu / en / nl; 390 and
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
