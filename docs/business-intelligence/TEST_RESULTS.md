# Test results

## PROMPT 32.2 — final fixes (the reason of every figure that is empty by definition; the launch checklist)

Branch `feature/business-intelligence-final-fixes`, base `f8b1655` (`feature/business-intelligence-refinement`). Same machine as the sections below (Windows 11, `node:sqlite`, system Chrome through Playwright). **Development verification only**: synthetic rows in throw-away databases; nothing was run against production data or a production database, nothing was deployed or merged, and no real Anthropic call was made. No server file, API field, calculation, dictionary entry or CSV changed in this step (`git diff --name-only -- server` is empty): it changes how the screen writes a reason the server already sent, and the documentation.

### Automated checks (commands actually run; results as they came out)

| Command | Result |
| --- | --- |
| `npx tsc -b` (typecheck, frontend and backend) | exit 0, no output |
| `npx oxlint` (lint) | exit 0, clean |
| `npx vitest run server/test/analyticsProjectFilter.test.ts` (the existing filter tests, unchanged) | **18 / 18** passed |
| `npx vitest run src/admin/analytics` (cards, charts, tables, the dictionary in **all three languages**) | **59 / 59** passed (was 51; **8 new**) |
| `npx vitest run src/admin src/i18n/quality` | 16 files, **416** tests passed |
| `npx vitest run server/test/analytics.test.ts analyticsPeriod.test.ts analyticsPerformance.test.ts aiAdminTools.test.ts aiAdminApi.test.ts` | 5 files, **132** tests passed |
| `npx vitest run` (the whole suite, run alone) | **164 files, 3,458 tests, all passed** (3,450 + the 8 new; 121.9 s) |
| `npm run build` (= `tsc -b` + `i18n:check` + `vite build` + SEO prerender) | exit 0 — `i18n:check` OK (4,225 texts × 3 languages from 79 sources), 103 pages prerendered |
| `npm run i18n:validate` | OK — 0 errors, 0 warnings; spelling HU / EN / NL 0 words not found; "blank on purpose in all languages: 4" (unchanged, listed) |
| `npm run check:seo` | OK — 104 files, 82 indexable, 22 noindex |
| `npm audit` | found 0 vulnerabilities |
| secrets scan of `dist` | no key, token or private key; the match is the **name** `ANTHROPIC_API_KEY` (4 times) in the administration's pre-existing AI settings text, no value |
| `node tools/e2e/analytics-journey.cjs` (fresh scratch server, synthetic rows) | **16 / 16** steps — the project-status step now also checks, in the real page, that the *Tasks by status* chart and the *Workload* and *Deadlines* tables say **why** they are empty, that the card says its reason **once**, and that the table region points at the reason |
| `node tools/audit/audit-analytics.cjs --extra=projectStatus=completed --sections=executive,projects,alerts,financial` | **120 views, 0 findings** (4 sections × 1440 / 1024 / 768 / 390 / 320 × dark / light × hu / en / nl); **390 notes of figures empty by definition inspected**, every one with a visible reason |
| `… --extra=projectStatus=cancelled --sections=projects` | **30 views, 0 findings** (5 widths × dark / light × 3 languages); 300 notes inspected |
| `… --extra=projectStatus=development` (every section) | **270 views, 0 findings** (regression; 30 notes inspected: the *Projects on hold* card) |
| `… ` (no status selected, every section) | **270 views, 0 findings** (regression; 0 notes, as it must be) |
| `python mutate-analytics.py` for the 6 new rules and the 4 earlier rules that touch the edited files | **10 / 10 caught**; the files were restored byte for byte |

What the audits check, per view (automated): sideways scrolling, elements outside the viewport, controls under 24 × 24 px, unnamed controls, exactly one `h1`, **axe-core WCAG 2.0 / 2.1 / 2.2 A and AA + best practice with the page's real CSP (this includes colour contrast, in dark and light)**, that the section drew figures and every chart opens its table, no raw key / `undefined` / `NaN`, no console error, reduced motion (the pages are loaded with reduced motion on and nothing may animate), and — new in this step — that **every note of a figure that is empty by definition has a visible reason sentence** (its own on an unavailable card, the note's on a chart, breakdown or table), and that a status outside "active" really produces such figures in *Projects* (so the check cannot pass on an empty page).

**The 8 new frontend tests** (`src/admin/analytics/analytics.test.ts`, "PROMPT 32.2"): the reason appears under the badge of a breakdown and of two tables in English, Hungarian and Dutch, from the dictionary of the language on the screen · an unavailable card (and the *Projects on hold* card) writes its reason **once** and its note keeps the badge only, while a note whose reason the figure does not write itself is not left without one · an empty line, bar, donut, bar-list and funnel chart each show the reason · an empty series of a section shows it · a filtered and a not-filtered figure say exactly what they said before, no reason added or lost, no `aria-describedby` · the focusable table region points at its reason by `aria-describedby` · both reason codes have a finished sentence, without a placeholder, in all three languages · the note component holds no sentence of its own (every string literal in it is a code, every child an expression).

### Visual inspection (screenshots taken with Playwright and the system Chrome, then looked at by eye; **not** an automated check)

*Projects* with *Completed* selected, on the scratch server with synthetic rows:

| What was looked at | Seen |
| --- | --- |
| full page, 1440 px, dark, English | each unavailable card: its own sentence once, badge below it; *Tasks by status*: badge, then the reason line, then "Nothing to show here."; *Workload* and *Deadlines*: badge and reason above the empty table; "Filtered" and "Not filtered" figures unchanged |
| full page, 1024 px, light, Hungarian | the same, in Hungarian; the *Projects on hold* card says it counts only projects On hold |
| full page, 390 px, light, English (a phone) | no sideways scroll; the reason wraps under the badge |
| crop of the chart, 768 px, dark, Dutch · of the chart, 320 px, dark, Hungarian · of the table, 390 px, light, English · of a card, 1440 px, light, English | the reason is legible, wraps inside the box (no clipping at 320 px), reads as body text, not as a faint caption |
| computed style of the reason | 14 px / line height 21 px; colour `rgb(11, 11, 13)` in light and `rgb(244, 240, 232)` in dark (the body text colours) |

768 px and 320 px were looked at only as the two chart crops above (their full-page images were taken but not viewed), and the English / Hungarian / Dutch and dark / light pairs shown are a sample, not every combination: every width, both themes and all three languages were covered by the automated audits, not by eye.

### Not verified

* No staging or production data, no deployment, no live model.
* The assistant journey (`admin-assistant-journey.cjs`), the other regression journeys (discovery, visitor AI, quote lifecycle, portal, booking, communication) and `audit-admin.cjs` were **not re-run**: this step changes only the dashboard's note component, a table attribute, one style rule and documentation; the full unit suite, which contains their tests, passed.
* Screen readers and a printed sheet were not tried; `aria-describedby` on the table region is checked as markup (unit test, journey), not heard.
* The *alerts* section does not single out the alert kinds a status can never produce (see "Limitations" in [FILTER_SEMANTICS.md](FILTER_SEMANTICS.md)).

---

## PROMPT 32.1 — refinement (project status filter, localization audit)

Branch `feature/business-intelligence-refinement`, base `7756d72` (the pushed `feature/business-intelligence`). Same machine as below (Windows 11, `node:sqlite`, system Chrome through Playwright); nothing was run against production data, no real Anthropic call was made (the model was a scripted model in tests and the local stand-in in the browser checks).

**Commands actually run, and what they showed**

| Command | Result |
| --- | --- |
| `npx tsc -b` | clean |
| `npx oxlint` | clean (0 warnings) |
| `npm run build` (= `tsc -b` + `i18n:check` + `vite build` + SEO prerender; the backend has no build step: it runs from TypeScript and is type-checked by `tsc -b`) | OK — `i18n:check`: 4,225 texts × 3 languages, 4,221 complete, **4 blank on purpose** (listed), 0 errors, 0 warnings; 103 pages prerendered |
| `npm run i18n:validate` | OK — 0 errors, 0 warnings, spelling HU / EN / NL: 0 words not found |
| `npm run check:seo` | OK — 104 files, 82 indexable, 22 noindex |
| `npm audit` | 0 vulnerabilities |
| secrets scan of `dist` | no key, token or private key; the one match is still the **name** `ANTHROPIC_API_KEY` in the administration's pre-existing AI settings text |
| `npx vitest run` (the whole suite, run alone) | **164 files, 3,450 tests, all passed** (≈ 116 s) — see "two timing failures" below |
| `npx vitest run server/test/analyticsProjectFilter.test.ts` | **18 / 18** (new) |
| `npx vitest run server/test/analytics.test.ts server/test/analyticsPeriod.test.ts` | 31 + 14 passed (the earlier regressions, unchanged) |
| `npx vitest run server/test/analyticsPerformance.test.ts` | 12 / 12 |
| `npx vitest run server/test/aiAdminTools.test.ts server/test/aiAdminApi.test.ts` | 44 + 31 passed (the assistant's analytics reader: permissions, context, no `projectStatus` input) |
| `npx vitest run src/admin/analytics` | **51 / 51** (was 42; 9 new: filter notes, summaries, plural rules, platform language rules over the dashboard dictionary, administration vocabulary) |
| `npx vitest run src/admin` | 369 passed, including the isolation tests (one narrow, tests-only exception added: a test inside the administration may run the platform's language rules) |
| `npx vitest run src/i18n/quality` | 39 passed (two new: an undocumented blank text is an error; the blank texts equal the documented four) |
| `node tools/e2e/analytics-journey.cjs` (fresh scratch server, synthetic rows) | **16 / 16** (new step: the project status filter), run twice |
| `node tools/audit/audit-analytics.cjs --extra=projectStatus=development` | **270 views, 0 findings** — 9 sections × 1440 / 1024 / 768 / 390 / 320 × dark / light × hu / en / nl |
| `node tools/audit/audit-analytics.cjs --extra=projectStatus=completed --sections=executive,projects,alerts,financial --sizes=1440x900,390x844,320x640` | **72 views, 0 findings** (a status outside "active": the "empty by definition" notes) |
| `node tools/e2e/admin-assistant-journey.cjs` (regression) | **30 / 30** |
| `python mutate-analytics.py` | see "Mutation checks" below |

The audits check, per view, sideways scrolling, elements outside the viewport, controls under 24 × 24 px, unnamed controls, exactly one `h1`, axe-core WCAG 2.2 A/AA + best practice with the page's real CSP, that the section drew figures and every chart opens its table, no raw key / `undefined` / `NaN`, no console error, and reduced motion (the audits load every page with reduced motion on, and check that nothing animates). Keyboard navigation is covered by the journey (the section tabs with the arrow keys, Home and End; filters are native controls reached with Tab) and by axe; dark and light by the audits.

**Two timing failures in full runs, and what was done**

* The first full run failed one test: the 90-request test of `analytics.test.ts` took 5.08 s against the default 5 s timeout on a loaded machine (it takes ≈ 4 s alone). Its timeout is now explicit (60 s); the assertions are unchanged.
* The second full run failed one test of `analyticsPerformance.test.ts`: a *wall-clock* ceiling on the communication section (0.8 s alone) was exceeded while 160 other files ran. The test now asserts the **CPU time** of the synchronous queries (load-independent) and prints the wall time beside it; the ceilings are unchanged. The third full run — the one in the table — passed.

**The project-status filter tests** (`analyticsProjectFilter.test.ts`, 18): with no status selected nothing changes and no section, metric, series, breakdown or table carries a note; with *Development* selected the figures about projects as they are now are scoped and say so (active, delayed, overdue milestones, tasks in progress / blocked, customer actions, the milestone completion rate, the breakdowns, the workload and deadline tables); the **events of the period are not reinterpreted** (completed projects 2, tasks completed 1, average duration 23.5 days, the completed-projects series, for every status — including a project completed in the period that is back in development); *On hold* is unavailable for any other status and applied for itself; for *Completed* and *Cancelled* every active-only figure is **unavailable with a reason, never a zero**, the lists are empty with the note, while the milestones, the breakdown by status and the events still answer; the overview follows the filter for its project KPIs and declares every other figure and every money card `not_project_data`, leaves a figure the role may not read untouched, and says nothing for it; the alerts about projects follow the filter (and their references are those of the selected status), the others do not; every other section says the filter does not apply and none of its figures changes; a role without access gets no figure and no summary whatever filter is asked; the API refuses an unknown status, an injection string and a wrong case with a 422, answers the editor the same, refuses the AI section for them; the CSV has the note line, the `[filter-scope]` block (including the alert kinds), no private text, and a `403` for a section the role cannot read; the assistant's analytics tools reject a `projectStatus` input.

**Mutation checks** — `mutate-analytics.py` breaks one rule at a time and requires the tests to fail, then restores the file. 14 new rules for this task (active projects ignore the status; an event reinterpreted by today's status; a status outside "active" giving a zero; an event not marked; non-project figures not declared in the overview; project alerts ignoring the status; the CSV dropping the scope; another section not told; a note not shown; an unused filter dropped silently; the overview not offering the filter; undocumented blank texts allowed; "1 days" back in the dictionary; a different Hungarian word for "on hold"): **14 / 14 caught** on their own run. The **whole script was then re-run** (the 27 rules of PROMPT 32 and the 14 new ones, 41 in all) against the final code: **41 / 41 caught**, every file restored.

**Not verified**

* No production data, no deployment, no live model (as before).
* The other regression journeys of the platform (discovery, visitor AI, quote lifecycle, portal, booking, communication) were not re-run; the full suite, which includes their tests, passed. The administration-wide audit (`audit-admin.cjs`) was not re-run: nothing in the shared navigation or shell changed in this task (its three known findings on the Media and AI screens are listed in the original results below).
* Screen readers and a printed sheet on paper were not tried.

---

# PROMPT 32 — the original results

PROMPT 32, branch `feature/business-intelligence`, run on the development machine (Windows 11, Node with the built-in `node:sqlite`, system Chrome through Playwright). Nothing here was run against production data, and no real Anthropic call was made (the model was a scripted model in tests and a local stand-in in the browser checks).

The kinds of evidence are kept apart, as the brief asks:

| Kind | What it covers |
| --- | --- |
| **Automated tests** | unit and integration tests (backend over HTTP with real endpoints; frontend rendered without a browser) |
| **Source review** | static rules that read the source (SQL rule, no-money-arithmetic, no raw colour, no sentence in the markup) |
| **Synthetic performance** | the timings in [PERFORMANCE.md](PERFORMANCE.md), on a generated dataset in memory |
| **Real-browser checks (scripted)** | journey and audit scripts in Chrome against a scratch backend holding labelled SYNTHETIC rows |
| **Manual checks** | screenshots looked at by me (executive and financial in dark, funnel in Dutch in light, alerts on a phone in Hungarian) |
| **Production verification** | **none** |

## Final validation (the whole branch, run once, in order)

| Check | Result |
| --- | --- |
| `tsc -b` (inside `npm run build`) | clean |
| `oxlint` | clean (0 warnings) |
| `npm run i18n:check` (inside the build) | clean |
| `npm run i18n:validate` | OK — 4,221 of 4,225 strings complete in all languages (as the validator reports it; not broken down further here), spelling HU/EN/NL: 0 words not found, 0 errors, 0 warnings |
| production build + SEO prerender | OK — 103 pages |
| `npm run check:seo` | OK — 104 files, 82 indexable, 22 noindex; sitemap, hreflang, canonicals, structured data, headers |
| `npm audit` | 0 vulnerabilities |
| secrets scan of `dist` | no key, token or private key. One match: the **name** of the environment variable `ANTHROPIC_API_KEY` in the administration's pre-existing AI settings text (it tells the owner which variable to set; no value) |
| **full `vitest run`** (alone) | **163 files, 3,421 tests, all passed** (≈ 103 s) |

## Backend (automated)

| File | Tests | What it proves |
| --- | ---: | --- |
| `server/test/analyticsPeriod.test.ts` | 14 | presets, whole local days, daylight-saving days (23 and 25 hours), previous equivalent periods (like-for-like months and years), bucket edges, custom-range limits, invalid input |
| `server/test/analytics.test.ts` | 31 | every section for every preset and a custom range in one shape; counts checked against what was put in through the real endpoints (requests, quotations in EUR and HUF, projects, tasks, milestones, consultations, conversations, AI ledger); **EUR and HUF kept apart and exact in minor units**; a quotation priced in words counted but never valued (even with an amount on the row); recorded revenue / receivables / budget amount / country / source `unavailable`, never 0; snapshot vs period; the cohort funnel from real timestamps and events; decline reasons counted, text never shown; segments by exact rules; response-time from messages; **private notes and message text never in any section**; visitor vs administrator AI usage and the estimate label; alerts deduplicated with severity, reason, reference, date, next action and nothing changed; **permissions** (editor, second administrator, no session, a permission taken away mid-way); **the service decides by the access it is given** (all-false access builds nothing; each section opens only for its own permission; alerts built only for the areas the access reads); 422 for unknown parameter, wrong value, bad range and SQL-injection strings; service/package filters as values; CSV with period, zone, filters and notes, audited without content, formula-injection defused |
| `server/test/aiAdminTools.test.ts` | 44 | the assistant's 34 tools: the set is closed (34 names); strict inputs; **no tool writes** (every analytics tool called, business tables digest unchanged); the three analytics tools give exactly the dashboard's figures (compared with the API), are out of context in a record conversation, apply the **current** permissions per call (and mid-answer), refuse bad/odd periods (`invalid`) and hand over no name, address, reference or key |
| `server/test/aiAdminApi.test.ts` | 31 | the gateway sends the model its instructions and the 34 tools (and nothing of the browser's) |
| static SQL rule (existing, `server/test`) | — | every statement in the analytics module is parameterised; interpolated fragments are named constants |

## Synthetic performance (automated, in memory)

`server/test/analyticsPerformance.test.ts` — 12 tests on 25,000 quote requests, 150,000 messages, 70,000 AI rows and the rest of [PERFORMANCE.md](PERFORMANCE.md): every section for 30 days, a year and five years under generous ceilings (all nine sections in 17–1,550 ms), the accepted value per currency and the funnel's stages equal direct SQL on the stored rows, a five-year CSV renders in 1 ms, alert lists are bounded.

## Frontend (automated, rendered without a browser; source review)

`src/admin/analytics/analytics.test.ts` — 42 tests: three languages with identical keys and placeholders, nothing empty or untranslated; **a word for everything the server can send** (metrics, money, series, breakdowns, tables and their columns, 33 limitations, unavailable reasons, funnel stages, alert kinds/reasons/steps, every status) read from the server's source; money/percent/duration/day formats per language; permissions per role; filters from the address (hostile values dropped), written back, range problems; which filters each section sends; figures that do not exist are never drawn as zero; snapshots have no arrow; money per currency and **never added**; every chart type draws its description, summary and **table**, and says so in words when empty; the section views (funnel cohort, alerts, breakdown rings vs lists, one line chart per currency); every section renders in hu/en/nl without a raw key. **Source rules**: no sentence of its own in the markup, no arithmetic on money (only the decimal point of one currency), no HTML injection, no fetch but the one CSV `GET`, no raw colour (but black/white for print), no animation, print and Blob download as designed. `src/admin/assistant/assistant.test.ts` (48) — names for all 34 tools. The platform's localization rules (`src/i18n/quality/localization23.test.ts`, 19 tests) pass with the analytics code in the scan.

## Mutation checks (automated, one rule broken at a time)

`mutate-analytics.py` breaks one rule in the source, runs the matching tests and requires them to **fail**, then restores the file byte for byte. **27 rules, 27 caught** (after the first run exposed four gaps — money in words in the sums, the service-level permission, alert areas, private notes among administrators' messages — for which tests were added; the four were then re-run and caught). The rules: two currencies added; accepted value by the wrong time; a quotation in words valued; revenue as zero; a section built for a role without permission; the AI section for a role without `system:read`; an alert for an area the role may not read; export of a section the role cannot read; export not audited; answer cacheable; CSV formula not defused; unknown parameter accepted; custom range of any length; period end off by one day; a snapshot presented as a comparison; private notes counted; visitor and administrator AI not kept apart; the assistant's tools working from one record's context / without the permission / with a fixed role; the forint with cents; a missing figure drawn as zero; a snapshot with an arrow; an unknown currency accepted from the address; an alert linking anywhere; a role offered a section it cannot read; the "never added" note dropped.

## Real-browser checks (scripted, Chrome, scratch backend with labelled SYNTHETIC rows)

| Script | Result |
| --- | --- |
| `tools/e2e/analytics-journey.cjs` (15 steps) | **15/15**, run twice (also on the final build, fresh server): the screen shows the server's own figures; the answer is `no-store`/`noindex`; period in the address, survives reload and back; bad custom ranges refused before the server is asked; hostile addresses dropped/refused (422/404); the currency filter separates money; Hungarian and Dutch with their number formats and a remembered choice; tab keyboard; **drill-down opens the named page with the named filter** (communications start filtered); every chart has its table; alerts have rule and next step; **CSV** (byte order mark, period, zone, time, kinds, limits, filters, nothing private); **print** marks one section, shows its header, hides navigation and buttons, black on white, cleans up; refresh; an editor sees no AI section and cannot export it; nobody signed out can read or export |
| `tools/audit/audit-analytics.cjs`, full matrix | **270 views, 0 findings** — 9 sections × 5 widths (1440, 1024, 768, 390, 320) × dark/light × hu/en/nl: no sideways scrolling, no tiny or unnamed control, one `h1`, **axe-core WCAG 2.2 A/AA + best practice with the page's real CSP**, the section drew figures, every chart opens its table, no raw key/`undefined`/`NaN`, no console error, no animation |
| the same, final build, reduced matrix | **162 views, 0 findings** (1440, 390, 320) |
| `tools/e2e/admin-assistant-journey.cjs` (regression) | **30/30** (its expectation was updated from 31 to 34 tools) |
| `tools/audit/audit-admin.cjs`, reduced matrix (regression, 608 views) | **50 findings, none in the analytics screen and none introduced by this branch**: `/admin/media` (a long storage path in a `code` element widens the page on phones; two small inputs), `/admin/ai` (axe `landmark-unique`), `/admin/ai?tab=settings` (axe `heading-order`), each in every language/theme/width, plus a theme view-transition console error when the audit resizes the viewport. **The same three findings reproduce on the base commit** `c64cf75` (exported and built separately, same audit on the same screens). The files of those screens are unchanged by this branch. Not fixed (out of scope): listed as follow-ups |

## Manual checks

Screenshots read by me, full page: overview (dark, 1440), financial pipeline (dark), funnel in Dutch (light, 1440), alerts on a phone in Hungarian (light, 390). They led to three fixes (amounts broken across lines → kept on one line; long series names in the grouped quotation chart → short names; the alerts table clipped on phones → cards). I did not test with a screen reader, and I did not look at the printed sheet on paper: print was checked by computed styles in print media (visibility, display, colour) and by the marking/clean-up cycle.

## Not verified

* **No production data and no deployment.** Figures were compared with direct SQL on synthetic and test data, not with the real database. The launch checklist asks the owner to do that comparison.
* **No live model.** The assistant's analytics tools were exercised with a scripted model, the real tool code and a local stand-in; whether the real model quotes figures faithfully is untested (the prompt and the tool note instruct it to; the tools return only server-computed figures).
* **Other regression journeys** (discovery, visitor AI, quote lifecycle, portal, booking, communication) were **not re-run**; their unit/integration tests are in the full suite, which passed. The only change touching them is that `CommunicationsPage` starts from `?filter=`, verified by the analytics journey's drill-down step.
* **Performance on production hardware or data** — measured on a development machine with generated data.
* Hungarian formatting (`1234,56 EUR`, grouping from five digits) follows the platform's ICU data; whether the owner prefers a different look is their call.
