# Lab 2.0: test results

PROMPT 34, branch `feature/lab-2-creative-universe`, base `4761c8e` (`feature/controlled-ai-automation`). Run on the development machine (Windows 11, Node 22.23, system Chrome 157 through Playwright, an integrated Intel
Iris Xe GPU). **Development verification only**: nothing was run on a physical phone or tablet, in Safari or Firefox, with a screen reader, or against production; nothing was deployed or merged. The commands and numbers are
what was actually run, in this state of the code.

## Commands, and what they showed

| Command | Result |
| --- | --- |
| `npx tsc -b` (typecheck: frontend, backend, tests) | exit 0, no output |
| `npx oxlint` (lint) | exit 0, clean |
| `npx vitest run src/components/lab` (the Lab's own test files) | **11 files, 253 tests passed**, of which `lab2.test.ts` is new: 41 tests |
| `npx vitest run` (the whole suite) | **168 files, 3,580 tests: 3,579 passed, 1 failed**, in two full runs out of two. The failure is `server/test/analyticsPerformance.test.ts` ("communication answers in good time…"): a CPU-time ceiling of 1.5 s, measured 2.5 s best of three **under the whole suite's load on a shared machine**. The same file **passes alone, 12 of 12 in 15 s**. Nothing in this branch touches the server. The Lab suite and every other file pass. Before this task: 167 files, 3,539 tests (+1 file, +41 tests). |
| `npm run build` (= `tsc -b` + `i18n:check` + `vite build` + SEO prerender) | exit 0: `i18n:check` OK (4,248 texts × 3 languages), 103 pages prerendered |
| `npm run i18n:validate` | OK: 0 errors, 0 warnings; spelling HU, EN and NL: 0 words not found |
| `npm run check:seo` | OK: 104 files, 82 indexable, 22 noindex; sitemap, hreflang, canonicals, structured data and headers verified |
| Production bundle | no `__labGl` or `__labView` in any `dist/**/*.js` (both are development-only handles) |
| `node tools/e2e/lab2-journey.cjs` (development server, real Chrome, GPU) | **37 / 37 steps** (the last full run, on the final code) |
| `node tools/audit/audit-lab2.cjs dist` (production build, real CSP, axe-core WCAG 2.0/2.1/2.2 A + AA + best practice) | **210 views: 0 findings**, as two runs: dark theme 105 views and light theme 105 views (3 languages × 5 widths × 7 pages each, with the panel and "how to use it" open as well) |
| `node tools/audit/audit-lab-overlap.cjs dist` | 252 experience screens (6 experiences × 3 languages × 7 sizes × reduced and normal motion): **no overlap** (run on the build before the last style change, the underline on the how-to's hover, which is not one of the elements it compares) |
| `node tools/audit/lab2-perf.cjs dist` | see [PERFORMANCE](PERFORMANCE.md) |

What the audit checks per view (automated): sideways scrolling, elements outside the viewport, text under 11.5 px, targets under 24 px, one `h1` and a `main`, the stage as a named group, the panel toggle's `aria-expanded`,
the full-screen button (present, named in the page language, on screen, 44 px on a phone), every tile naming what steers it, axe-core with the page's real CSP (colour contrast included), and no console error. Two findings of the platform's
generic layout check are not findings on these pages and are filtered by name in the script: "no footer" on an immersive experience page and the overview's red full stop (the hidden egg's button, whose `::after` makes a 44 px target).

## What the brief asked to test, and where it is tested

| Area | Where |
| --- | --- |
| Exactly six standard experiences | `labScope.test.ts` (already there, still green: the six, in order, each ready, each with a component, a page, words in three languages and a picture; the walk visits all six; the overview links each once); `lab2.test.ts` ("the six experiences say how they are steered": the same six, each with pointer, touch and keys; two take words); journey: overview × 3 languages (six tiles, ids, inputs, badge, links) |
| Navigation between experiences | journey "navigation": open from a tile, next through all six and wrap, previous, back to the overview by "All experiments" and by the "← Lab" crumb; the title and the "NN / 06" dock at each stop |
| Reset and regenerate | journey, every experience: a slider changed with the keyboard and **Reset** returns it; Particle (arrangement, Randomise, Reset), Chromatic (mode, Reset), Space (Centre view, Reset), Generative (Another version changes the seed, a description changes it, **Reset** returns to the start), Type (own words, Reset). Unit: `parseSeed`, `seedFieldText`, `startControls`, arrangements |
| Parameter controls | `lab2.test.ts`: the panel controls are real labelled form controls (labels, `<output>`, `aria-valuetext`, fieldset/legend/radio, `role="switch"`, `type="button"`); journey: sliders, radios, text fields in every experience |
| Localization hu / en / nl | `texts.test.ts` (every table, every language: the same values, none empty), `lab2.test.ts` (every new text in all three languages; the tiles, the how-to and the full-screen button rendered in each), `npm run i18n:check` / `i18n:validate` (hardcoded text, placeholders, spelling), journey "three languages": **no English control or notice left on any Hungarian or Dutch experience page** and the language switch keeps the experience |
| Keyboard accessibility | `lab2.test.ts` (`applyStageKey`: arrows, Home, Enter, Space, other keys ignored, clamping, two keys in a frame add up); journey: Tab order (skip link → stage), arrows/Enter/Space/Home, the full-screen button by keyboard with a visible focus ring, focus kept on it, the how-to opened and closed with Enter, sliders with End; audit: axe |
| Reduced motion | `labCore.test.ts` (view rules, existing); journey: all six open in Calm, say so, **idle pixel difference 0.000 of 255**, and still answer the pointer (0.5 to 36 of 255) |
| Full screen and fallback | `lab2.test.ts` (controller, 9 tests with fake document and element: native enter/exit, the browser leaving by itself, refused request, no API, `fullscreenEnabled` false or unknown, repeated calls, another element's full screen, dispose); journey: native (the frame is the full-screen element, fills the 1440 × 900 window, panel, dock, theme and language switches inside; the browser's exit and the visible Exit button both return; a link out of it leaves the browser out of full screen), **two fallbacks** (API removed; request refused) with the frame `position: fixed` covering exactly the window, Escape leaving, the page behind frozen and released, and a link out leaving nothing frozen; phone (touch emulation) end to end |
| WebGL unsupported and context loss | journey: a browser started without WebGL: all six show the Still view, the picture, the explanation, the controls and a way onward, no page error; `WEBGL_lose_context`: the notice appears, the canvas hides, and the canvas returns on restore |
| Cleanup when leaving | journey, all six: after leaving, the canvas is detached, the context is lost, **0 frames in the next second**, the handle is gone, GPU geometries 0 (textures 0, except Generative Objects' one, see PERFORMANCE); coming back builds exactly one new canvas and a new renderer; a stage scrolled out of view draws **0 frames per second**, and 60 again when back. `lab2.test.ts`: no experience owns a canvas, a loop or a global listener |
| Responsive behaviour | audit at 1440 / 1024 / 768 / 390 / 320 (above); journey phone step at 390 × 844 with touch: the panel starts closed, the full-screen button (44 px) and dock fit, a tap is an interaction, no sideways scroll, in all six |
| Existing Lab routes and the NFSU2 egg | `labScope.test.ts` (no seventh experience, no route, same link); journey: typing `n f s u 2` on the overview offers a link to `https://nfsu2.xyz/` with `target="_blank"` and `rel="noopener noreferrer"` and **no iframe** on the page |
| Global navigation and the theme system | journey: the overview keeps the site header, each experience its immersive frame with one `h1` and a `main`; the theme switch works inside full screen; the language switch keeps the experience; `npm run build`, SEO check, the whole suite for everything else |

## Defects found by running it in a browser, and fixed

All of these were found by the journey, the audit or by looking at a screenshot, **not** by the unit tests (which passed throughout):

1. **The Calm view never showed its canvas when nothing touched the stage.** An on-demand canvas drew one frame and stopped, but the stage counts as ready on the second; for the default of every visitor with reduced motion, the picture stayed a still poster with "Loading the live view…" until the pointer moved over it. *(Existing before Lab 2.0.)* Fixed: the first frames are always asked for.
2. **A change in the panel was not drawn in the Calm view** (the controls live in a plain object the scene reads each frame, and a canvas that draws on demand only draws when asked). A keyboard or touch visitor would see no effect. *(Existing.)* Fixed: any input, change or click in the panel asks the stage for a frame. Chromatic's mode switch: pixel difference 0.00 before, 2.28 after.
3. **My own wrapper `div` around the panel moved it into the middle of the stage** (seen on a screenshot after the Space drag step failed: the panel lay over the centre). Fixed by putting the listeners on the existing container; a test fixes the exact markup, and the journey now asserts the panel is at the side and the middle of the stage is free in every experience.
4. **Two arrow keys pressed within a frame cancelled each other** (the second key moved the goal from the *eased* position, overwriting the first). *(Existing.)* Fixed with a goal-based `nudge`.
5. **The expanded full screen was 15 px short** on a desktop with classic scrollbars (the site reserves a scrollbar gutter). Fixed.
6. **The new full-screen button crowded the "← Lab" link at 320 px** (axe `target-size`, serious: the link was half covered). Fixed: the crumb keeps its width and the switches wrap.
7. **"How to use it" turned red on hover, 3.43:1 on paper** (axe `color-contrast`, serious, light theme only). Fixed: an underline instead of a colour change.
8. The platform's own checks refused three things: literal text in a test fixture component (words now come from the test), the English "Recentre" (now "Centre view") and the key names "Home" and "Esc" in Hungarian (added to the spell checker's technical word list, next to "ctrl" and "cmd").

Harness defects (mine, in the journey; not product bugs): a step that chose the Calm view left every later step in it, because the choice is remembered for the session; an uppercase `innerText` comparison; reading the page right after the URL changed (the router keeps the old page up until the new one's code has arrived); a link name that appears twice (the dock and the details); pressing Escape in headless Chrome does not leave native full screen, so the browser's exit is simulated with `document.exitFullscreen()`, which fires the same event.

## Visual inspection (screenshots looked at by eye; **not** an automated check)

Seen: the overview tiles at 1440 px (the "Interactive" badge and the input tags on the first two tiles), Chromatic Distortion at 1440 px in the normal, full-screen (Exit button) and Radial-mode states with "how to use it" open, and Infinite Space twice (which is how defect 3 was found). Not looked at by eye: the other four experiences' new panel, the light theme (axe only), the Hungarian and Dutch pages (journey and axe only), the phone and 320 px layouts (layout checks and axe only), the full-screen fallback (geometry measured, not seen).

## Not verified

* **A physical phone or tablet, Safari (macOS or iOS), Firefox**: not run. Phone testing was a 390 × 844 touch emulation with a slowed CPU in desktop Chrome.
* **The full-screen fallback as an iPhone gets it**: it was exercised by removing the Fullscreen API and by making the request fail in Chrome.
* **A screen reader**, switch access, voice control, forced-colours mode, a magnifier.
* **Native proofreading** of the new Hungarian and Dutch wording (rules and spell checker only).
* **Production or any hosted environment**; load under real network conditions; a long-running session on a real device.
* **Before/after performance**: no comparison with the base commit was made for load or frame rate (only for the heap, see PERFORMANCE §5); no improvement is claimed.
