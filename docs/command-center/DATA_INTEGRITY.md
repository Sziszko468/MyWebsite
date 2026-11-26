# Data integrity

PROMPT 37.1, branch `feature/archive-data-integrity`, based on `feature/command-center-digital-archive` (`92a3b7e`). Part of the [Command Center and Digital Archive](README.md). No feature, page
design, database, migration, endpoint, dependency or service was added.

## 1. What was found, and fixed

Items 1–10 were first reproduced by tests against the unchanged code (`src/archive/integrity.test.ts`: 35 of its 50 tests failed; `server/test/projectCategories.test.ts`: 1 of 5 failed). Item 11
was found by the check against a real backend (§5) and then reproduced by `server/test/staticRedirect.test.ts` (4 of its 6 tests failed).

| # | Found | Effect | Fix |
| --- | --- | --- | --- |
| 1 | A category without a name fell back to its **key** (`categoryName(key) \|\| key`) | A visitor read an internal identifier (missing list, record or name) | Neutral words in the page's language (§2) |
| 2 | A name of spaces or invisible characters counted as a name | An empty label and a nameless filter choice | A name must hold a readable character |
| 3 | Of duplicate category records the **last** won, even if empty | A valid name was lost | The first record with a readable name in the language counts |
| 4 | A missing or malformed key on a project | A second choice with the value of "All", or the malformed text shown | The project is listed without a category |
| 5 | A CMS key equal to the archive's own (`creative-coding`, `design-tools`) | The CMS category was merged with the Lab's or the tool's | Kept apart as `project.<key>` |
| 6 | A project record sent twice, or one without a name in the language | Shown twice (or nameless) among the featured work; its demo listed twice | One rule for both pages: `publicProjects` |
| 7 | The backend listed the projects but a project's detail failed: the website's **own copy** answered | A demo the CMS had switched off could be listed | With a backend list, only a backend detail switches a demo on |
| 8 | A demo's detail was checked only for a registered, suitable type | Listed although the detail said draft, no page, or not available in the language | Those, and the detail's address, are checked in `useArchive` |
| 9 | A late answer replaced the list of the other mode (preview ↔ public) | The archive could wait for ever; a page without the preview flag could receive the drafts (**only for the administrator who had asked for them**; found by reading the code, reproduced at the store) | An answer counts only while its mode is still the one asked for (`projects/store.ts`) |
| 10 | One stored category record that is not a category (`null`, …) | `GET /api/projects` answered **500**, so the website fell back to its built-in copy | `categories()` leaves such records out; a name that is not text reads as empty |
| 11 | The server redirected an address without the final slash to the slash form **without its query** | A shared or reloaded filtered address (`/en/archive?category=apps`) opened the whole, unfiltered archive when the website is served by this server | The redirect carries the query (`modules/system/static.ts`) |

Items 7, 9, 10 and 11 are in code other pages use too (the project store; the server's category reader and static files). Their behaviour for valid data is unchanged, except that every redirect to
the slash form now keeps its query.

## 2. Category labels

The **key** is the filter's value and stays in the address; only the **label** is per language. A key is never shown or read out, and a search does not find it. (It is necessarily present in the
address and in the select's `value` attribute.)

| The CMS data | Row | Filter and address |
| --- | --- | --- |
| A readable name in the language | The name **exactly as supplied** | `category=<key>` |
| No readable name in the language: no list, no record, no label, empty, blank, invisible, not text | *Névtelen kategória* / *Unnamed category* / *Naamloze categorie*; with several such categories each gets a number (1, 2, … in key order) | `category=<key>`, as with a name |
| Several records for one key | The first readable name in the language | One choice |
| A project without a usable key: missing, empty, not text, characters outside `a–z 0–9 -`, longer than 40 | No category on the row | Not offered; such a value in an address is ignored |
| A CMS key equal to `creative-coding` or `design-tools` | The CMS's name (or the neutral words) | A choice of its own: `category=project.<key>`; `category=creative-coding` still means the Lab |

Deliberately **not** done:

* No name is borrowed from another language (the website's rule everywhere).
* The website's built-in category names are not used when a backend answered: the CMS is the source of truth, and an old built-in name for a renamed key would be a silent mapping.
* No category was added, renamed or merged. The three CMS categories and the archive's two are as before; the neutral words are a fallback label, not a category.

## 3. Public and private

**Read:** the public project list (`/api/projects`), the public detail of the three projects that can have a demo (`/api/projects/<slug>`), the website's own content when the backend gives no
answer, and the Lab, demo, playground and service registries.

| Layer | What it refuses |
| --- | --- |
| Server (its public rules are as before; see #10) | Anything unpublished; categories only unpublished projects use; a demo that is off or does not suit the project |
| Store | An answer of the mode no longer asked for |
| `useArchive` | A preview list (even if already loaded); a project not available in the language; a demo whose detail is a preview, a draft, about another project, without a page, not in the language, or (with a backend list) not from the backend |
| `publicProjects` / `buildEntries` | Drafts, bad addresses, nameless records, unknown states, duplicates |

**Never reached:** a test walks everything the two pages import, directly or indirectly, and fails if any module is in `admin`, `portal`, `quotes`, `booking`, `ai` or the portal, consultation,
contact and assistant components or words. The walk does reach the website's own cart and consent-based visitor measurement through shared components (`Button`): they hold the visitor's own
browser state, are on every page, and are not the business-intelligence data (which lives under `src/admin`). Neither page calls them.

The six Lab experiences and the design tool come from the website's own registries: nothing the CMS sends changes their number or turns the tool into an experience (tested).

## 4. CMS edge cases covered by tests

`src/archive/integrity.test.ts` puts backend-shaped answers through the website's own parser and store and reads what the two pages draw:

* names supplied exactly (punctuation, `&`, spacing) in HU, EN and NL; unknown keys in the three languages; several unnamed categories, in either project order;
* names that are empty, blank, invisible, a number or absent; a label that is not an object; records that are not records; a list that is not a list or is missing; duplicates;
* project keys that are missing, empty, not text, with spaces, in capitals, markup or too long; keys colliding with the archive's own;
* the address and the filter for named, unnamed, colliding and malformed keys; search by key finds nothing;
* duplicate, draft, nameless, unavailable and malformed project records; the six experiences and one tool with look-alike records;
* demos: on, off, unregistered, another project's, no page, other language, another project's answer, draft, gone (404), detail failing or unreachable, backend silent, duplicate record;
* preview answers arriving before, after and instead of the public one; a non-administrator; the import boundary.

`server/test/projectCategories.test.ts`: malformed stored categories, names passed on exactly, an unreadable or non-list value, categories of unpublished projects absent.
`server/test/staticRedirect.test.ts`: the redirect keeps filters, encodings and the `project.` category, and nothing in a query can add a header.

## 5. Checked against a real backend

`tools/e2e/archive-backend-check.cjs`: the production build served by the project's own server with a new scratch database, headless Chrome. After reading the seeded site, the script damages and
changes that database (a `null` and a text among the categories, a name missing in Hungarian and Dutch for the first record, an unknown key, a CMS category under the Lab's key, a draft, one demo
switched off) and reads both pages in HU, EN and NL as a new visitor. **27 of 27 checks passed**: 200 from the public list, no key readable, the neutral words, the first readable name, the separate
colliding category, the draft gone, only the demos switched on, the filtered address surviving a reload, no admin, portal, preview, quote or booking address asked for, no page or console error.
Before item 11 was fixed, the three checks of shared addresses failed. A browser may show the previous public answer for 30 seconds after a change (the server's existing `Cache-Control`).

## 6. The full-suite timing failure

`server/test/analyticsPerformance.test.ts` › "communication answers in good time …": three section builds (30 days, this year, five years) over 150,000 synthetic messages, measured as the
process's CPU time (`process.cpuUsage`), best of up to three, against 1500 / 2500 / 4000 ms, inside Vitest's default 5 s test timeout.

### Reproduced before any change

Three full runs of the unchanged branch: **3 of 3 failed** that one test (3885 of 3886 passed). Run 1: *test timed out in 5000 ms* (every CPU budget met: 1390 / 1891 / 2328 ms). Runs 2 and 3:
CPU budget exceeded, 1656 and 1702 ms against 1500.

### Conditions compared (unchanged code; CPU / wall ms; i9-13900H, 6 performance and 8 efficiency cores)

| Condition | 30 days | This year | 5 years | Building the data | Result |
| --- | --- | --- | --- | --- | --- |
| The file alone, 3 runs | 625–641 / 625–643 | 875–891 | 1343–1439 | 6.9–7.0 s | passes; test 2.9–3.0 s |
| + 19 unrelated processes that only compute, 2 runs | 734–750 | 953 | 1438–1516 | 7.1–7.2 s | passes |
| Pinned to performance cores, one thread each | 609 | 859 | 1359 | 6.8 s | passes |
| Pinned to efficiency cores | 813 / 852 | 1219 | 2031 | 12.1 s | passes; test 4.2 s |
| + 19 unrelated processes that compete for **memory** (64 MB each, random access), 2 runs | **1344–1453** / 1500–1520 | 1813–2078 | 2641–2938 | 12.7–15.8 s | **fails**: timeout, test 6.3–6.9 s |
| Full suite, 3 runs | **1390–1845** | 1891 (one run reached it) | 2328 (one run) | 20.4–22.6 s | **fails** |

### Conclusion

* **Not a regression.** The analytics code, its schema and the test are unchanged since PROMPT 33 (`git diff 4761c8e..92a3b7e` over them is empty); alone it is no slower than recorded when
  written (750 / 1047 / 1687 ms).
* **Not shared state.** Each test file runs in its own process (`pool: forks`, isolated, 19 workers) with its own in-memory database.
* **Contention for the machine.** Unrelated processes competing for memory reproduce it: the CPU time itself roughly doubles and the test times out. (The likely mechanism, not measured
  further: shared memory bandwidth and cache, shared and slower cores.) Their budgets were not exceeded in those two runs, only approached; in the full suite they were.
  `process.cpuUsage` removes time spent waiting for a processor, not this. The test's comment and the business-intelligence note said a loaded machine could not make it fail: that was wrong, and
  both are corrected.

### The fix: scheduling only

`vitest.timed.ts` lists the files with a time budget; `vite.config.ts` runs everything else first and then these, one file at a time. **No assertion, budget, timeout, retry or test was changed,
skipped or removed.** `server/test/testScheduling.test.ts` fails if the timed file goes back beside the others, if another CPU-time test is not declared, or if any test file would be lost or run
twice (checked by breaking the configuration three ways: each was caught).

### After the change

Three full runs: **3 of 3 passed**, 179 files, 3944 tests.

| Run | 30 days (CPU / wall ms) | This year | 5 years | The test | Overlap with other files |
| --- | --- | --- | --- | --- | --- |
| 1 | 625 / 636 | 953 / 972 | 1812 / 1842 | 3.5 s | none |
| 2 | 609 / 611 | 843 / 855 | 1298 / 1337 | 2.8 s | none |
| 3 | 563 / 605 | 875 / 878 | 1328 / 1324 | 2.8 s | none |

The test runner's own report shows the timed file's first test starting 7.3–7.8 s after the last other file had ended: that is its data being built (6.8–7.3 s), after everything else. Those runs
took 122–128 s (the ones before: 98–106 s): the timed file no longer runs beside the others. In four further full runs on the final code the timed file passed all four times (two of the four runs
failed on a different test, see below).

### What this does not solve

* The five-second timeout covers all three periods together: alone the test takes about 2.9 s here, 4.2 s on the efficiency cores. **On a machine about 1.7× slower than this one (a small CI runner
  may be) it can time out even alone.** Raising the timeout was ruled out for this task. If CI shows it, splitting the three periods into tests of their own, or another decision about the budgets,
  is the owner's call.
* The budgets are absolute numbers chosen on this class of machine, and anything else the machine does during the run counts against them.
* **A second intermittent test remains**, in another area and **not changed**: `server/test/email.test.ts` › "says what the administrator wrote about timing …". It failed in 2 of 4 full runs on the
  final code (it passed in the three runs before and the three after of this section, and had failed once in earlier work). It also fails **on its own**: 3 of 5 runs of the untouched test with
  `-t "says what the administrator wrote"`, and 9 of 9 for a temporary copy with a slower mail stub (removed afterwards), although the whole file alone passed 5 of 5. So it is not the load: the test can
  look before the Hungarian e-mail has been sent. From reading the code (not proven): several callers of `Notifier.processDue` can run at once and a run skips what another is sending, so the test's
  waiting step returns early. The test and the notification code are as on the base branch. Left as a follow-up: fixing it means changing communication code or its tests, outside this task.

## 7. Remaining limitations

* Only the website's own server was checked for the redirect. A deployment of the static files elsewhere (the Cloudflare Workers configuration in `wrangler.jsonc`) was not run.
* With **no answer** from the backend the website shows its built-in content (existing behaviour, unchanged): it can include a project or a demo the administrator has since changed.
* A project's own page and a demo's page still fall back to the built-in copy when their request fails; only the archive and the Command Center now refuse that for demos.
* The **Work page** shows an empty filter chip for a category without a name (not a key; outside this task).
* Two categories given the same name by the CMS appear as two choices with the same text.
* The number of an unnamed category can change when another unnamed category appears before it in key order; its address does not.
* Nothing here was verified in production or against the production database. Manual steps: [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md).
