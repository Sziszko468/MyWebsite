# Test results

Part of [Interactive project demos](README.md). Branch `feature/interactive-project-demos` (base `bf83a7d`). Everything below was **executed** on the final code unless a line says otherwise; the
sections say plainly what is automated, what is a measurement, and what was **not** done. Nothing was run against production.

## 0. Summary

| Check | Result |
| --- | --- |
| `npx tsc -b` | passes |
| `npx oxlint` | 0 warnings, 0 errors (three warnings in the new code were found and justified, see §7) |
| `npm run i18n` (check + validate, Hunspell spelling hu/en/nl) | OK: 4578 texts × 3 languages from 85 sources, 0 errors, 0 warnings |
| `npm run build` (tsc, i18n check, vite, prerender) | OK: 112 pages prerendered |
| `npm run check:seo` | OK: 113 files, 82 indexable, 31 noindex; sitemap, hreflang, canonicals, structured data and headers verified |
| Demo unit and CMS tests | **145 / 145** (4 website files: 38 + 19 + 43 + 26, and `server/test/projectDemos.test.ts`: 19) |
| Whole suite (`npx vitest run`, 173 files) | **3724 / 3725**. The one failure is `server/test/analyticsPerformance.test.ts` (a time budget, 6.8 s in a loaded full run); it **passes alone** and has nothing to do with the demos (see §2) |
| Browser journey (`tools/e2e/demos-journey.cjs`, dev server, headless Chrome) | **26 / 26** steps |
| Responsive + accessibility audit (`tools/audit/audit-demos.cjs`, production build with its real CSP) | **180 views, 0 findings** (3 languages × dark/light × 5 widths × 6 pages), with two known, unrelated findings filtered out (§4) |
| Performance (`tools/audit/demos-perf.cjs`) | measured, §5 |
| Real devices, Safari, Firefox, screen readers, production | **not done** |

## 1. Unit and integration tests (automated)

| File | Tests | What it covers |
| --- | --- | --- |
| `src/demos/demos.test.ts` | 38 | eligibility and registration (three types, one real project each, nothing for a project without a page); `parseProjectDemo` on hostile data; the registry is a fixed table (own names only, no dynamic import of a variable); routes, `noindex`, head and titles for the 9 demo pages; the frame, the entry and every state in every language; the owner's instructions drawn as text; all demos draw in every language with labelled controls and no raw keys; every text exists in every language and none claims a real booking / payment / e-mail / customer / metric; source scan: no network, storage, timers, global listeners, analytics, backend or outside link in a demo, no module-level mutable state, every animation behind `prefers-reduced-motion`; the entry is the only change to a project page; the chunk split |
| `src/demos/finance/model.test.ts` | 43 | amount parsing (comma/dot, exponents, zero, negative, too large, too many decimals), validation of every field, filters, search, sort, paging, budget states (80 % / 100 %), integer-cent sums, restart |
| `src/demos/booking/model.test.ts` | 19 | services, working days, deterministic taken times, a long service needs consecutive halves, required-field and e-mail checks, the 40-booking cap, status changes |
| `src/demos/shipments/model.test.ts` | 26 | the workflow table, who may make which move, a reason for cancelling and stepping back, final states stay final, expired papers / workshop / overlap each refused and named, assignment and un-assignment |
| `server/test/projectDemos.test.ts` | 19 | the three-way sync of the closed list (server, website, editor); the admin setting: valid, off by default, unknown type, markup as text, non-text, oversized, unknown fields dropped, no switch-on without a type, eligibility by slug on create and update, hostile values over the wire, duplicate starts without a demo, documents from before demos, permissions (a visitor and a stranger cannot change it), the public answer |

All 145 pass. Together they address the brief's list: eligibility/registration, routing/navigation, reset/restart, state isolation, input validation, localization, loading/failure states, CMS
configuration validation, protection against arbitrary executable content (the source scan plus the hostile-value tests), and regression of existing project pages (the page's bands, paths and ids are
asserted unchanged).

## 2. The whole suite

First full run on the code as the journey and audit had left it: **4 failures** of 3725:

1. `src/styles/motion.audit.test.ts` ×2 (*never transitions layout*, *transitions only compositor or paint properties*): **a real defect of this work.** The budget bars' fill transitioned `width`. **Fixed**: the fill is full
   width and `transform: scaleX()` is transitioned (a compositor property), still only behind `prefers-reduced-motion: no-preference`.
2. `server/test/analyticsPerformance.test.ts` (a time budget) and `server/test/email.test.ts` ("says what the administrator wrote about timing…": an async mail was not there yet): both **load-sensitive**, both pass when run
   alone, neither touches the demos.

Second full run after the fix: **3724 / 3725**, the only failure `analyticsPerformance` (6757 ms; passes alone), which was already known to be load-sensitive from earlier prompts. `email.test.ts` passed in that run. I did not
investigate either timing test further.

## 3. Browser journey (automated, real Chrome, dev server)

`node tools/e2e/demos-journey.cjs` — 26 steps, **26 / 26**, no page error or console error:

* each project page has **one** entry (outside the numbered bands, whose headings are unchanged) for the three projects; Hollandia has none; an unknown project has no demo page;
* entry → demo → back: the three labels, the way back is the project; `noindex, follow`; the real-vs-simulated account has at least six items;
* hu / en / nl: every demo page says what it is in its language, `<html lang>` follows;
* **finance**: a good transaction is added and the month and budgets follow; an empty form marks every wrong field (`aria-invalid`) and names it; filter, search, sort, paging, delete; Restart brings the sample back; five budget
  meters with text values and all three states in words;
* **booking**: an empty form names every field; a complete one books a *sample* booking, says nothing was booked, and lists it; status changes; taken times differ per day (10 of 10 days show some for a 60-minute service);
  a long service needs consecutive free halves;
* **shipments**: the role decides the moves (a driver only forward and only their own; an accountant none); a reason is required to cancel; a final shipment stays final; assignment is refused for expired papers, the
  workshop and an overlap, each named; a good one makes the shipment Assigned;
* **no network request and no storage change** while a demo is used (requests and both storages compared); state lives in the page and a visit starts from the sample;
* **cleanup after leaving**: the stage is gone and, after five more visits, DOM nodes 1344 → 1344, event listeners 293 → 293, documents 2 → 2;
* **failure and fallback states**: a blocked demo chunk shows the failure state with *Try again* and the way back, and retrying loads it; a browser without the required features (feature check) says so, with the way back;
* **full screen**: native on the frame, left by the browser and by the button, left on navigating away; the fallback when the browser has no element full screen and when it refuses: the frame covers the window, Escape leaves,
  the page behind is frozen and released;
* **keyboard**: Tab reaches the back link, the account, Restart, Full screen and the first field with a visible focus ring; Space toggles a chip; Enter submits; the account opens from the keyboard;
* **reduced motion**: all three demos open and work and nothing transitions (the meters' `transition-duration` is `0s`);
* **phone** (390 × 844, touch, device pixel ratio 2): each demo fits the screen, works by touch, the tools are big enough for touch; full screen entered as native.

Earlier, on a production build of an earlier state of this branch, a base-versus-branch comparison of repeated visits (DOM nodes and listeners) showed constant counts on both; **that was not repeated on the final build**.

## 4. Responsive and accessibility audit (automated, production build)

`node tools/audit/audit-demos.cjs dist` on the final build, served with its real headers and Content-Security-Policy: for each project page (with its entry) and each demo page, in hu / en / nl, dark and light, at
1440 × 900, 1024 × 768, 768 × 1024, 390 × 844 (mobile emulation, touch) and 320 × 568:

* the platform's layout checks (no sideways scroll, nothing outside the viewport, text ≥ 11.5 px, targets ≥ 24 px, header controls, upscaled images);
* axe-core 4 with WCAG 2.0/2.1/2.2 A and AA and best-practice rules, **colour contrast included**;
* exactly one `h1` and a main landmark; the three labels, Restart and Full screen present and named in the page language; the full-screen button big enough and inside the viewport; one entry per project page and it links to the demo;
* the same demo pages again with the states that carry the most words and colour: validation errors showing, a selected shipment with a refused assignment, the "real vs simulated" account open;
* no console error.

**Result: 180 views, 0 findings.** Two findings of the *generic* layout/axe checks are deliberately excluded, because they are not caused by the demos and exist on the base commit ([LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md) F):

* `no footer` — the check is for Lab pages; a demo page is an ordinary page that has a footer;
* the project gallery's 2 px-high "Open larger" buttons (checked identical on the base commit, in the three languages).

A third finding appeared in the first full run (axe *target-size* on the Dutch footer's first link at 320 px, serious): the browser keeps the previous page's scroll offset when `goto` opens a new page, so those pages were
measured scrolled to their bottom, where the site's **sticky header covers that footer link**. I reproduced it on the **base commit** and on `/nl/about/` and `/nl/services/` (not the demos). The audit now scrolls every view to the top
before measuring, which is how a new page opens for a visitor; the underlying header/footer overlap is a pre-existing site issue, listed as a follow-up.

A defect the audit **did** find in the demos earlier, and which is fixed: the budget "warning" state used a dark amber text colour that failed contrast in the dark theme. The state's word is now in the page's text colour and the
warning is carried by an amber frame; over budget by the accent.

## 5. Performance (measured)

Method: `node tools/audit/demos-perf.cjs dist --base <dist of bf83a7d>`. Headless system Chrome 157.0.8103.79 on Windows 11, Intel Core i9-13900H (20 threads), served by `tools/audit/serve.cjs` with brotli/gzip and the build's
headers, new browser context per run, **medians of three cold runs**. "Phone" is a 390 × 844 viewport, device pixel ratio 2, touch, and the CPU **slowed 4×**: an emulation, **not a phone**. The base commit's build has no
prerendered pages, so the with/without comparison serves **both builds as the single-page app** (the branch's build copied without its prerendered pages); the branch's real prerendered pages are measured on their own as well.
Every number depends on this machine.

### 5.1 Sizes (bytes; `gzip` = zlib level 9, `br` = brotli default)

| File | raw | gzip | br | Loaded when |
| --- | ---: | ---: | ---: | --- |
| `main` (base `bf83a7d`) | 417,782 | 142,871 | 118,105 | every page |
| `main` (this branch) | 421,919 | 144,276 | 119,158 | every page (**+4,137 raw, +1,405 gzip, +1,053 br**: the page table, the head strings, the routes) |
| `ProjectPage` (base) | 25,762 | 7,503 | 6,751 | project pages |
| `ProjectPage` (this branch) | 26,908 | 7,848 | 7,063 | project pages (**+1,146 raw, +345 gzip, +312 br**: the entry) |
| `useDemoText` (entry texts and hook) | 2,415 | 1,358 | 1,203 | project pages that have an entry |
| `DemoPage` (frame, route, the shell's words) | 22,416 | 8,802 | 7,833 | a demo page |
| `FinanceDemo` | 22,069 | 7,940 | 7,105 | the Spendly demo |
| `BookingDemo` | 15,700 | 6,160 | 5,509 | the BookingHub demo |
| `ShipmentDemo` | 28,756 | 9,760 | 8,747 | the Logistics demo |
| `demoUi.module` | 1,188 | 553 | 469 | a demo page |

(Plus per-demo CSS: 4.1 KB, 1.8 KB, 4.1 KB, and 5.3 KB for the frame, 4.9 KB for the shared pieces, raw.) An earlier build put the shell's long "real vs simulated" lists in the chunk the project page loads (16.9 KB raw on every project page); I
found that by measuring the requests and **split the entry's texts into their own small file** (`content/demos/entry.ts`), which is what the table shows.

### 5.2 The initial load of a project page, with and without the demos (single-page-app mode, both builds)

| Page | JS transferred, base → branch | JS files | requests | DOMContentLoaded (ms) base → branch | First contentful paint (ms) base → branch |
| --- | --- | --- | --- | --- | --- |
| desktop Spendly | 233.4 → 236.2 KB (**+2.8**) | 14 → 16 | 25 → 26 | 998 → 1006 | 1076 → 1096 |
| desktop BookingHub | 233.4 → 236.2 KB | 14 → 16 | 25 → 26 | 1005 → 1006 | 1092 → 1092 |
| desktop Logistics | 233.4 → 236.2 KB | 14 → 16 | 25 → 26 | 999 → 1017 | 1076 → 1100 |
| phone Spendly | 233.4 → 236.2 KB | 14 → 16 | 25 → 26 | 1077 → 1137 | 1336 → 1400 |
| phone BookingHub | 233.4 → 236.2 KB | 14 → 16 | 25 → 26 | 1104 → 1167 | 1404 → 1448 |
| phone Logistics | 233.4 → 236.2 KB | 14 → 16 | 25 → 26 | 1105 → 1115 | 1324 → 1380 |

* The project page loads **about 2.8 KB more JavaScript (+1.2 %), two more files and one more request**, and **no demo code**: the only demo-related file requested is `useDemoText` (the entry's words and the hook). The frame and the demos' chunks are
  not requested on a project page (checked by name in every run).
* The timings: DOMContentLoaded was **later with the demos in all six comparisons** (by 1 to 63 ms), and first contentful paint later in five of six (by 0 to 64 ms; equal in one). With three runs per cell I **cannot say how much of that is
  noise**, but the direction was the same each time, so I would treat it as a real cost of a few tens of milliseconds on the emulated phone, a few milliseconds on desktop.
* The branch's own prerendered project pages (the real hosting shape): DOMContentLoaded 999 / 1001 / 1006 ms and first contentful paint 1072 / 1080 / 1080 ms on desktop; 1148 / 1290 / 1132 ms and 1408 / 1532 / 1440 ms on the emulated phone
  (Spendly / BookingHub / Logistics). There is no base figure for prerendered pages (the base build has none), so these are not compared.

### 5.3 Activating a demo (measured separately)

Time until the demo's first section is on the page, and the JavaScript that activation brought:

| Demo | Cold (a fresh load of the demo URL), desktop | Cold, phone | From the project page (link followed), desktop | From the project page, phone | JS brought by activation from the project page |
| --- | ---: | ---: | ---: | ---: | ---: |
| Spendly (finance) | 1320 ms | 1071 ms | 379 ms | 646 ms | +18.3 KB (5 files) |
| BookingHub (booking) | 890 ms | 1575 ms | 378 ms | 478 ms | +17.6 KB (6 files) |
| Logistics (shipments) | 1313 ms | 1566 ms | 371 ms | 713 ms | +20.7 KB (6 files) |

Cold totals are 245.5 to 248.7 KB of JavaScript for the whole page. The cold figures vary by several hundred milliseconds between cells in a way that does not follow the code (the desktop BookingHub cell is the fastest, the phone Spendly cell
faster than the desktop one), so with three runs each they show the order of magnitude (about a second to a second and a half cold, under 0.75 s from the project page), **not a ranking**.

### 5.4 Interaction latency

Thirty interactions per demo (the finance chips Income/All; the booking service select; opening two shipments in turn), measured from the click to the second animation frame after it (the frame in which the result is painted), the first two dropped:

| | median | 95th percentile | maximum |
| --- | ---: | ---: | ---: |
| desktop Spendly | 4.8 ms | 5.4 ms | 5.5 ms |
| desktop BookingHub | 5.1 ms | 6.3 ms | 6.3 ms |
| desktop Logistics | 5.2 ms | 22.7 ms | 22.8 ms |
| phone (4× CPU) Spendly | 33.2 ms | **413.9 ms** | 435.6 ms |
| phone (4× CPU) BookingHub | 19.2 ms | 38.1 ms | 263.6 ms |
| phone (4× CPU) Logistics | 30.4 ms | **325.0 ms** | 368.4 ms |

The medians are a frame or two. **The slow tail needs an honest reading**: single interactions sometimes take 220 to 490 ms, on desktop too (Logistics) and, in the 4× slowed phone runs, in roughly one of ten interactions. Two checks:

* **Is it the demos' own code?** A `long-animation-frame` trace of 160 desktop Logistics interactions (one run) caught one 473 ms frame in which **no script ran** and whose render phase began only at the very end of the frame (`renderStart` ≈
  duration): the time passed *before* rendering started, not in the demo's scripts and not in style or layout. That points to a stall in frame production in this headless setup, not to the demo's work. I did **not** trace the phone-emulated spikes.
* **Do pages without demos show it?** Yes, at a lower rate: a handler-less button I added to the pages, clicked and followed by two frames, gave one 410 ms spike in 400 clicks on `/en/services/`, none in 400 on `/en/about/`, 268 ms twice in 400 on the
  demo page; a native `<details>` toggle gave one 494 ms spike in 120; idle frames gave none in 120 on either page. The rate on the demos' own interactions in the performance run (about 1 in 20 on Logistics desktop, none in 80 on Spendly desktop)
  was **higher** than in these controls, and different runs gave different rates (1 in 160 in the trace above), so I cannot say the demos add nothing.

So: the evidence says the long frames are not script time in the demo, but I did **not find their cause**, and I do not claim the demos are free of long frames.

## 6. Browser and device coverage

| Covered | Not covered |
| --- | --- |
| Chrome 157 (system Chrome, headless, via Playwright) on Windows 11 | Safari (desktop and iOS), Firefox, Edge, Samsung Internet |
| Viewports 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844 (mobile emulation, touch, DPR 2), 320 × 568 | Any physical phone or tablet; real touch behaviour, real GPU, real network |
| Dark and light themes; hu, en, nl | Screen readers (NVDA, JAWS, VoiceOver, TalkBack) — only axe's automated rules and the accessibility tree |
| `prefers-reduced-motion: reduce` (emulated) | OS-level high-contrast / forced-colors mode (the CSS has a rule; not rendered) |
| CPU slowed 4× (emulation) | A real slow device |
| Keyboard (Tab, Shift+Tab, Space, Enter, Escape) by script | A person using the demos |

**Automated** here means scripts and unit tests; **manual** testing by a person was **not** done.

## 7. Defects found by testing, and what became of them

| # | Found by | Defect | Status |
| --- | --- | --- | --- |
| T1 | full suite (`motion.audit.test.ts`) | budget bars transitioned `width` (the site forbids layout transitions) | **fixed** (`transform: scaleX`) |
| T2 | audit (axe contrast, dark theme) | warning state text colour failed contrast | **fixed** (word in text colour, amber frame) |
| T3 | request listing in the performance run | the project page loaded 16.9 KB raw of demo words it does not use | **fixed** (`content/demos/entry.ts`) |
| T4 | oxlint | two `no-control-regex` (intentional, refusing control characters in typed text) and one `react/static-components` (a memoized lazy component from a fixed table) | **justified in place** with a disable comment and the reason |
| T5 | demo unit tests | Node has no `requestAnimationFrame` / `matchMedia`, so the frame's markup test failed | tests stub them (the unsupported-browser state is tested by its own test) |
| T6 | localization checks | a hard-coded sentence rule, a spelling rule and a number rule rejected sample text | sample data lives in `content/demos/`, which the tooling reads as data; words fixed |
| T7 | the localization inventory test | a stale test cache did not see the two new text files until `inventory.ts` changed | inventory comment updated; the test now reads both |
| T8 | A/B memory comparison | the Lab 2.0 *heap-leak* figures were a measurement artifact (Playwright's `waitForSelector` returns a handle that keeps pages alive) | **claim withdrawn**; PROMPT 34's performance, checklist and test-result documents and `lab2-perf.cjs` corrected **on this branch** ([LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md) F) |
| T9 | audit, first full run | the sticky header covers the Dutch footer's first link at the bottom of the page at 320 px; the gallery's "Open larger" buttons are 2 px high | **not fixed**: both exist on the base commit; listed as follow-ups |
| T10 | performance run | sporadic 220–490 ms interaction spikes (one traced: no script in the frame, the time passed before rendering began); also seen, less often, on pages without demos | **cause not found**; reported as is (§5.4) |
| T11 | full suite | `email.test.ts` and `analyticsPerformance.test.ts` failed under load | pass alone; not investigated further |

## 8. Not done

* No test in production, on a deployed preview, or through the CDN/edge; no Lighthouse run.
* No real device, no Safari/Firefox, no screen reader, no person using the demos.
* The repositories of the three projects were read, not run; the demos were not compared with a running copy of the originals.
* `npm audit` was not run (no dependency changed).
* The performance figures are one run per cell (medians of three cold loads), on one machine.
