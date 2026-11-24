# Test results

Part of the [Design System Playground](README.md). Branch `feature/design-system-playground` (base `23e5904`). Everything below was **executed** on the final code unless a line says otherwise;
the sections say plainly what is automated, what is a measurement, and what was **not** done. Nothing was run against production.

## 0. Summary

| Check | Result |
| --- | --- |
| `npx tsc -b` | passes |
| `npx oxlint` | 0 warnings, 0 errors |
| `npm run i18n` (check + validate, Hunspell spelling hu/en/nl) | OK: 4876 texts × 3 languages from 89 sources, 0 errors, 0 warnings, 0 words not found |
| `npm run build` (tsc, i18n check, vite, prerender) | OK: 115 pages prerendered (three of them the playground) |
| `npm run check:seo` | OK: 116 files, 85 indexable, 31 noindex; sitemap, hreflang reciprocity, canonicals, structured data and headers verified |
| Playground unit and rendering tests | **121 / 121** (`model.test.ts` 66 + `playground.test.ts` 55) |
| Whole suite (`npx vitest run`, 175 files) | **3845 / 3846**. The one failure is `server/test/analyticsPerformance.test.ts` (a time budget; 7.1 s in a loaded full run); it **passes alone** (12 / 12) and has nothing to do with the playground (§2) |
| Browser journey (`tools/e2e/playground-journey.cjs`, dev server, headless Chrome) | **26 / 26** steps |
| Existing journeys, to show the Lab and the demos still work (`lab2-journey.cjs`, `demos-journey.cjs`) | **37 / 37** and **26 / 26** |
| Responsive + accessibility audit (`tools/audit/audit-playground.cjs --components`, production build with its real CSP) | **72 views, 0 findings** |
| Performance (`tools/audit/playground-perf.cjs`) | measured, [PERFORMANCE](PERFORMANCE.md) |
| Real devices, Safari, Firefox, screen readers, production | **not done** |

## 1. Unit and rendering tests (automated)

`src/playground/model.test.ts` — the pure rules, 66 tests:

| Group | Tests | What it covers |
| --- | --- | --- |
| the brand palette | 2 | the five colours **equal the brand tokens of `tokens.css`** (the file is read); a new object every time; knowing when it is untouched |
| reading a HEX colour | 19 | `#fff`, `FF161F`, `  #AbCdEf `, `0a0`; refused with the reason: empty, `#`, `#gg0000`, `red`, `#12`, `#12345`, `#1234567`, `#ff161f00`, `rgb(1,2,3)`, `<script>`, full-width digits; never throws on 5000 characters, NUL, `0x123456`, ligatures; rgb round trip |
| contrast | 5 | black on white 21:1; the published reference pairs (`#767676` 4.54, `#777777` 4.48 on white); the brand pairs; the WCAG lines exactly (4.5 passes, 4.4999 does not; 3; 7); a ratio is **cut, never rounded up** (4.499 shows 4.49) |
| mixing and reading colours | 3 | mixing inside 0–1; moving a colour only as far as it must to be readable; the best of the candidates |
| what a palette makes inside the preview | 6 | the original palette makes **nothing** (the preview is the site's own tokens); a changed palette makes custom properties only, plain hex; dark reads paper on black and light black on paper; the roles are readable whenever the palette allows it; 60 random palettes never produce an invalid value; the CSS of a palette |
| typography | 9 | only the three project families; starts from the site's weights, line height and spacing (read from `tokens.css`); every bound; snapping; weights per family and no width axis for the others; a family or a ratio not offered is refused (including `url(https://…)`); the cleaning of the words (control characters, one line, 80/400/80 by code point, markup stays as text); the three sizes; the copied CSS |
| layout | 7 | every bound and step; the alignments; **every preset width stays exactly as it is** (768 must not become 770); fewer columns in a narrower frame (a phone, a tablet, a desktop); a card never narrower than the minimum, over a grid of widths, gaps and wanted columns; the container in a frame; the copied CSS |
| motion | 5 | the defaults are the site's own duration, curve, distance and stagger (read from `tokens.css`) and each literal curve equals its token; every bound; **reduced motion (the system's or the visitor's) takes every duration, distance and delay out**; the curves; no custom property refers to itself |
| the playground's state | 10 | a valid colour is taken at once, a wrong one keeps the last valid colour and records why; unknown ids and non-colours are ignored; a pasted novel is cut; every other change goes through its model's bounds; a component's own properties only (right keys, right types); **reset of one section and of everything**; replay counters; **no two visits share anything**; an unknown action does nothing |

`src/playground/playground.test.ts` — the page, 55 tests:

| Group | Tests | What it covers |
| --- | --- | --- |
| how the playground is registered | 5 | one page at `/lab/design-system`, in every language, indexable; **not a seventh experience** (the Lab still has exactly six, and the page is in none of their lists; its id does not start with `lab-`); the Lab's motion scope; a title and a description of its own per language; linked from the Lab by a band of its own |
| what the page says, in every language | 6 | per language: one `h1`, a labelled navigation to the five laboratories, the way back to the Lab, a reset, a status region; a heading per laboratory and no raw key, placeholder or `undefined` |
| the colour laboratory | 6 | five fields with the brand names and tokens, picker, copy, "original" marked; a changed colour marked as a **temporary change** with the original beside it and a way back; a wrong field names the reason and keeps the last valid colour; a palette that fails WCAG AA is said to fail, and one that passes is said to pass |
| the preview stage | 11 | its own theme and custom properties; the **real** components (the files are imported, and nothing in the playground is named like one of the site's); each of the eight component previews in every language; nothing from the administration or the security code |
| the other laboratories | 11 | type: a dark and a light stage, the words limited, only the three typefaces, no width control for the monospace stack; layout: six real cards and the three presets; motion: six replayable examples, the switch, and the reduced-motion note with the timings removed |
| the playground's words | 5 | every text in every language, none empty, **the languages ask for the same values**; announcements and errors exist; no price, customer, result or metric is made up |
| the playground stays inside its page | 8 | **source scan**: no network call, no storage or cookie, no analytics, no secret, **no write to the site's theme, the root or the body**, no code made from text, no link out; reads the site's theme and never writes it; custom properties only through a stage's own style; every timer, observer and listener has a way out; no loop, no animation frame; only compositor properties and no literal duration; reduced motion answered in every stylesheet that animates; the code stays out of the main bundle (only the lazy route and the head's small file are read by the main code; the Lab reads only the band's small words) |
| keyboard and structure | 3 | native controls only (no `role="button"`, no click handler on a `div` or `span`, no `tabindex` above 0); the one scrollable box is a labelled, focusable region; every picker has a name and every palette row a legend |

All 121 pass. The demos' and the site's tests that read the same sources (the motion audit, the mobile audit, the localization inventory, the route, head and SEO tests) pass in the whole-suite run.

## 2. The whole suite

`npx vitest run`: 175 files, **3845 passed, 1 failed**. The failure is `server/test/analyticsPerformance.test.ts > communication answers in good time for 30 days, a year and the longest allowed range`, a **time budget**
(7.1 s in the loaded run). It passes when run alone (12 / 12) and was already known to be load-sensitive in earlier work (it also failed in PROMPT 35's full runs); it does not touch the playground. I did not investigate it further.

Earlier full runs on this branch showed one more failure, `src/i18n/quality/quality.test.ts` ("reads every file that writes texts with `tri()`"): the inventory's `import.meta.glob` did not see the three new files in `content/playground/`
until the inventory's own file changed (a stale transform cache of the test runner). The inventory now names `content/playground/*.ts` explicitly, which is also what the file's comment asks a new content folder to do; the test passes.

## 3. The browser journey (automated, real Chrome, dev server)

`node tools/e2e/playground-journey.cjs` — **26 / 26**, no page error or console error:

* **the Lab and the page**: the Lab links to the playground from a band of its own, and the experiences are still six; one `h1`, a labelled navigation, five laboratories each with an `h2`, an indexable head, the way back;
* **colour**: starts from the five brand tokens, all marked original, the default pair is 17.30:1 and every role passes; a valid HEX reaches the stage **and nothing outside it** (the site's own header button keeps its red, the site's tokens, `<html>` and storage are unchanged); a wrong value says why, is `aria-invalid`, and the preview keeps the last valid colour;
  a three-digit HEX becomes its six-digit colour; the native picker sets the field; Restore brings the original back; **copy** puts the value on the real clipboard and says so; black on black fails all five levels, paper on black passes all five, Racing Red on Warm Paper is said to fail AA text; the report lists nine roles and says in words which fail for a flat grey palette;
* **the preview theme**: Light and Dark change the previews (one dark and one light stage in the type laboratory) and **never the site** (`data-theme`, tokens, header background and the theme colour meta are unchanged), and it is announced;
* **type**: the three typefaces only; the heading is 35.2 px (18 × 1.25³) and 46.9 px after a body size of 24; weight, width, line height and **letter spacing** reach the heading; monospace drops the width control and sets the heading in a monospace stack; a visitor's own words — `<img src=x onerror=…>` and a line break — are shown as **text**, no element is made, no script runs, the field is limited to 80, nothing is stored, nothing is requested; reset clears them;
* **components**: all eight draw; the real button's variant, size and outcome reach it, and pressing it shows its real loading state; badges, fields (four controls, the invalid state reaches three), links, navigation, section heading, service card (its price is the site's *by quote*, no amount), project card; **a link in a preview never navigates** (the address is unchanged after clicking a link, a text button, a navigation link and the project card); reset restores a disabled button; the list holds nothing from the administration;
* **layout**: the columns at the phone / tablet / desktop presets are **1 / 3 / 3** (the desktop preset of 1280 px is capped by the 901 px the page gives the preview in this window; a phone's 360 px gives one column, and no card is ever narrower than the minimum); every slider is bounded as documented; alignment, radius and gap reach the grid and the real cards; the page does not scroll sideways; reset restores the gap;
* **motion**: the duration (0.6 s), distance and stagger (0.2 s on the third card) reach the examples; Replay starts a running animation and is announced; **no animation of the motion stage loops**; the chosen curve is the site's; button feedback waits (`aria-busy`) then shows success; scrolling the box reveals items; the next screen of the page-transition concept appears; **the reduced-motion switch** takes durations, distance and stagger out and says so, and **the system's reduced-motion setting** is read and said;
* **isolation**: after playing in every laboratory, the site's theme, root style, tokens, header and theme colour are the same, storage is the same, and **no request was made**;
* **reset**: one section resets only itself; "Reset everything" restores colour, type, layout and motion and is announced; the page says whether anything differs from the original;
* **keyboard**: a visible focus on a section link; Tab moves on; the arrow keys choose a theme; Space turns a switch on; an arrow key moves a slider by one step; Enter on Reset everything resets; the scroll box is focusable; **Tab from the last control reaches the footer** (no trap);
* **languages**: hu, en and nl each speak their language in every section, no raw key or placeholder, an error message in the page's language;
* **a phone** (390 × 844, touch) and **320 px**: no sideways scroll, controls a finger wide, every section usable after play;
* **leaving**: the playground starts from the originals on return, nothing of it was stored, and after four more round trips through the app's own navigation the document's nodes (1978 → 1978), listeners (368 → 368) and documents (1 → 1) are unchanged.

## 4. Responsive and accessibility audit (automated, production build)

`node tools/audit/audit-playground.cjs dist --components` on the final build, served with its real headers and Content-Security-Policy: the page in hu / en / nl, dark and light, at 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844 (mobile emulation, touch)
and 320 × 568 — each **before and after play** (a wrong HEX showing its message, a changed colour, the contrast report open, the light preview theme, the monospace typeface, the phone width in the layout laboratory, reduced motion on) —,
the Lab's overview with its band at the same sizes, and the eight components one by one in English at 1440 and 320 px in both themes. Layout checks (no sideways scroll, nothing outside the viewport, text and targets big enough), axe-core 4 with
WCAG 2.0/2.1/2.2 A and AA and best-practice rules (colour contrast included), exactly one `h1`, a `main`, labelled navigation, one `h2` per laboratory, six experiences in the Lab, none of them the playground, no console error.

**Result: 72 views, 0 findings.** Details and decisions: [ACCESSIBILITY](ACCESSIBILITY.md).

## 5. Existing pages (regression)

* The Lab 2.0 journey (`lab2-journey.cjs`): **37 / 37** — the overview keeps its header, the six experiences keep their immersive frame, the hidden NFSU2 egg is still its own thing.
* The demos journey (`demos-journey.cjs`): **26 / 26**.
* The Lab's overview in the audit (10 views): six experiences, the band, no finding.
* The motion, mobile, content, route, head, SEO and Lab-scope tests of the existing suite pass (§2).
* Initial load of the home page, the Lab's overview and a project page, with and without the playground: see [PERFORMANCE](PERFORMANCE.md) §2 (the playground's chunk is never requested; the cost is two small shared chunks, +2.6–3.2 KB, +2–3 requests).

## 6. Browser and device coverage

| Covered | Not covered |
| --- | --- |
| Chrome 157 (system Chrome, headless, via Playwright) on Windows 11 | Safari (desktop and iOS), Firefox, Edge, Samsung Internet |
| Viewports 1440 × 900, 1024 × 768, 768 × 1024, 390 × 844 (mobile emulation, touch, DPR 2), 320 × 568 | Any physical phone or tablet; real touch, a real GPU, a real network |
| Dark and light themes of the site, and of the previews; hu, en, nl | Screen readers (NVDA, JAWS, VoiceOver, TalkBack): only axe's rules, the accessibility tree through Playwright's role queries and the markup |
| `prefers-reduced-motion: reduce` (emulated) and the page's own switch; CPU slowed 4× (emulation) | Forced-colours mode, browser zoom of 200 % / 400 %, voice control |
| Keyboard (Tab, arrows, Space, Enter) by script; the real clipboard (permission granted to the test) | A person using the page; the clipboard on a page without permission |

**Automated** here means scripts and unit tests; **manual** testing by a person was **not** done.

## 7. Defects found by testing, and what became of them

| # | Found by | Defect | Status |
| --- | --- | --- | --- |
| T1 | the **journey in a real browser** (the entrance duration read 0 s) | The motion stage set `--ease-out: var(--ease-out)`, a **cycle** that made every use of `--ease-out` invalid, so the animations did not run and the real button's transitions were invalid. The first unit test passed because it compared strings. | **fixed** (the stage uses the curve itself); a test that no custom property refers to itself, and one that each literal curve equals `tokens.css` |
| T2 | the journey (a chosen preset did not stay chosen) | The preview width's step of 10 turned the tablet preset 768 into 770, so no preset stayed selected. | **fixed** (step 8: 360, 768 and 1280 sit on the grid); a test that every preset survives the clamp unchanged |
| T3 | the journey (letter spacing read −1.4 px) | The site's own rule for headings sets family, spacing and line height on the element, so the typography controls **did not reach the heading**. | **fixed** (the three styles set their own); the journey asserts spacing, weight, width, size and family on the heading |
| T4 | `npm run check:seo` | All three languages had the same title, which the SEO check calls "untranslated". | **fixed** (a title per language) |
| T5 | `npm run i18n` | A hard-coded sentence rule (the font stacks, "Aa", the product name in the hero), the Hungarian glossary (*ajánlat*, not *árajánlat*), 63 spelling findings (English words, Dutch compounds, "Eén"). | **fixed**: data in `content/playground/stacks.ts`, words from the dictionary, "Één"; the product name, *monospace*, *easing*, *archivo* and *labra* added to the allow-list with the reason |
| T6 | review of the first screenshots | The theme radios repeated their help text per option; the bar stacked the two theme chips and was tall; the "original/changed" sentence appeared twice; the "Device" and "Preview width" labels were the same word. | **fixed** |
| T7 | oxlint | `react/set-state-in-effect` on three effects that reset an example's state. | **fixed** (the example is mounted afresh by its replay counter instead) |
| T8 | the journey (buttons could not be found by their expected names) | The names were built from the visible word and a visually hidden suffix ("Copy" + ": Copy the value of …"), and were not what the text suggested. | **fixed** (an `aria-label` that starts with the visible word, WCAG 2.5.3) |
| T9 | the full suite | The localization inventory did not see the new files (a stale glob cache). | **fixed** (explicit entry) |
| T10 | the build | None of the playground's chunk leaks into other pages, but the bundler now writes two small shared chunks (`areas`, `Sketch.module`) that every page loads. | **not fixed**; measured and documented ([PERFORMANCE](PERFORMANCE.md) §2) |
| T11 | the full suite | `analyticsPerformance.test.ts` failed under load. | passes alone; not investigated |

## 8. Not done

* No test in production, on a deployed preview, or through the CDN/edge; no Lighthouse run.
* No real device, no Safari/Firefox, no screen reader, no person using the page.
* No comparison of the contrast *report* with a second implementation of WCAG 2 (the arithmetic is checked against published reference pairs).
* `npm audit` was not run (no dependency was added or changed).
* The performance figures are medians of three cold loads, on one machine.
