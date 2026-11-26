# Test results

Part of [Advanced motion and visual experiences](README.md). Only what was actually run is listed. 2026-11-26, branch `feature/advanced-motion-visuals` (base `46ba3d8`), Windows 11 (10.0.26300),
Intel i9-13900H, Node 22.23.1, Vitest 5.0.5, headless system Chrome. No physical device. A backend was used only for the two shop journeys (a throw-away local one).

## 1. Project checks, on the final code

| Command | Result |
| --- | --- |
| `npx vitest run` | **3977 of 3977 passed** (181 files), 137 s |
| `npx tsc -b` | passed |
| `npx oxlint` | passed, no findings |
| `npm run i18n` | passed: 4976 texts × 3 languages, spelling HU / EN / NL 0 not found, 0 errors, 0 warnings (no new visitor-facing text) |
| `npm run build` | passed: 121 pages, `404.html`, `robots.txt`, `sitemap.xml` and `_headers` written |
| `npm run check:seo` | passed: 122 files, 91 indexable, 31 noindex; sitemap, `hreflang`, canonicals, structured data and headers verified |

The only file changed after the `vitest`, `tsc` and `i18n` runs is the browser journey `tools/e2e/playground-journey.cjs` (section 6); the build, the SEO check and the lint were run again after it.

## 2. New tests

`src/motion/advanced.test.ts` (27 tests): the tokens and mixins and that the shared controls use them; the reduced-motion hook's subscription and its use by every script that moves something; the
cover counter and who says and hears it; the sliding marker's box and its markup; page keys, arrivals and which clicks count; the receding page; the first-screen choreography's reduced-motion
guard; scroll entry keys, fresh and returning visits; the exit-depth maths; no animation library and six experiences. The checks of what scripts and stylesheets say read the sources; what the
browser does is in the journey. No existing unit test was changed, skipped or removed. One existing browser journey was corrected (section 6).

## 3. The browser journey (`tools/e2e/motion-journey.cjs`, production build)

**Branch, final build: 20 of 20 steps passed.** **Base build, same journey: 5 of 20** (the final journey differs from the one run on the base only in how the arrival step samples; that step fails on
the base for the missing choreography). The base failures include the four defects of [ARCHITECTURE](ARCHITECTURE.md) §1 (lowest page opacity 0 while typing; scrolled to the top on a language
switch; opened at 611 px by address; layout shift 0.53–0.59) and 165–167 animation frames a second still drawn behind the open phone menu; on the branch: 0, and about 166 again after closing.
Cumulative layout shift on six pages of the branch: 0.

Covered: arrivals and Back/Forward, a held-back page (marker in two frames, dimming, a second click winning), keyboard during a wait, a modified click, direct addresses, reload, the markers, the
stripe, the depth at rest and moving, press and keyboard states, the cursor label, reduced motion and switching it mid-visit, touch, the covered scenes, layout shift on six pages, console errors.

## 4. Audits (production build), compared with the base build

| Audit | Branch | Compared with the base |
| --- | --- | --- |
| `audit-a11y.cjs` (every page, 3 languages, 2 themes) | axe: 0 violations; 11 structure notes | identical list |
| `audit-matrix.cjs` (870 loads, 320 / 390 / 768 / 1024 / 1440, 2 themes, 3 languages) | 192 lines: 180 "no footer" on the six full-screen experiences (intended), 12 about the small hidden-screen button | not run on the base; both kinds are of long-standing parts |
| `audit-keyboard.cjs` (desktop, phone) | 33 and 21 lines | identical lists |
| `audit-archive.cjs` (150 views) | 0 findings | — |
| `audit-lab2.cjs --quick`, `audit-playground.cjs --quick`, `audit-demos.cjs --quick` | 0 findings | — |
| `audit-shop3.cjs` | 0 findings | — |
| `audit-shop4.cjs` | 5 findings (`target-size` on a package-finder button partly scrolled under the sticky header) | identical list |
| `audit-design.cjs` | 2 findings (the hidden-screen button's size) | identical list |

**No audit finding is new** (for the matrix, which was not run on the base, that rests on the kind of its findings). The listed ones are existing and were not fixed here.

## 5. Existing journeys

| Journey | Server | Result |
| --- | --- | --- |
| `archive-journey.cjs` | development | 21 / 21 |
| `demos-journey.cjs` | development | 26 / 26 |
| `lab2-journey.cjs` | development | 37 / 37 |
| `playground-journey.cjs` | development | first run **23 / 26**; **26 / 26** after the correction of section 6 |
| `shop-journey.cjs` (comparison, FULL EXPERIENCE, administration) | fresh local backend, build with `VITE_API_URL=/` | 41 / 41 |
| `shop4-journey.cjs --only=ABCDE` (add-ons, package finder, size guide, languages, phone) | fresh local backend, same build | 31 / 31 |

The two shop journeys run with reduced motion on (their own setting), so they check the flows through the restyled choices, not the movement; the movement is in section 3.

## 6. Failures and intermittent behaviour

**`playground-journey.cjs`, 3 steps, first run on this branch** ("a valid HEX reaches the preview…", "the preview theme…", "isolation…"): *the site's headerBg changed from `rgba(0, 0, 0, 0)` to a
filled colour*.

* **Cause:** the journey, not the playground. The header is clear at the top of a page and filled further down. The journey read it just after opening the page and again after using controls that
  scroll the page. It had passed because opening the same address again in a used tab kept the previous scroll position (defect 3, fixed here), so both readings happened to be taken scrolled down.
  Measured on both builds, reopening the playground in one tab: base opens at 588 px with the filled header, branch at 0 px with the clear one.
* **Correction (harness only):** the header is now read at one fixed, scrolled position (600 px) and the page is put back where it was. What is compared did not change: every value, the header's
  included, must still be the same before and after.
* **Checked:** two readings from different positions are equal; with the header's own colour token deliberately changed in the page, the new reading differs. Rerun: 26 / 26.

**During development** (fixed in the product code before the final runs, no test changed for them): `contact.test.ts` failed twice, because the new depth rules had been placed in separate style blocks
and the glow's `aria-hidden` had moved; `tsc` found a missing import; `oxlint` asked for two helpers to move into a module of their own and rejected one construct in the new test. The new motion
journey's first versions had measurement faults of their own (timing of the held-back page, a header selector that also matched the phone menu, when the arrival was sampled), corrected in the journey.

**Known intermittent tests (not seen in the run above):** the base branch has an e-mail confirmation test that can fail now and then, and a few related ones. Their fixes are on separate branches of
other sessions, **none merged into this one**. The earlier timing-sensitive group runs on its own since PROMPT 37.1.

## 7. Not tested

Production or staging; Safari, Firefox; physical phones or tablets; screen readers; Windows high contrast; Lighthouse; `npm audit`; the GPU. Scenarios F and G of the shop journey (security over plain
HTTP and the rate limit) and the journeys for booking, quotations, the client portal, the administration and the assistant were not run: no backend or business code changed; in the assistant only the
panel changed, which now tells the scenes when it covers a phone's screen.
