# Performance

Part of the [Command Center and Digital Archive](README.md). Measured on 2026-11-25 with `tools/audit/archive-perf.cjs` on the **production build**, served with its real headers and brotli
compression by `tools/audit/serve.cjs`, in headless Chrome 158 on one development machine (Windows 11, i9-13900H). The measured build had **no backend address** (`VITE_API_URL` not set), so no
request for projects was made and the website's own content was there at once. (Corrected in PROMPT 37.1: this said a request failed. The layout-shift figures below therefore saw no loading state.)
"Phone" is 390×844, DPR 2, CPU slowed 4×: **not a phone**. Compared with the base commit `9d39cc6` (PROMPT 36), built the same way (prerendered). These are one machine's
numbers, not a promise.

## 1. Chunks

| File | Raw | Gzip | Brotli | Loaded |
| --- | ---: | ---: | ---: | --- |
| `useArchive` JS (model, hook, words) | 15.73 kB | 6.24 kB | 5.61 kB | only on the two pages |
| `useArchive` CSS | 2.19 kB | 0.79 kB | 0.64 kB | only on the two pages |
| `ArchivePage` JS | 7.50 kB | 2.82 kB | 2.56 kB | `/archive` |
| `ArchivePage` CSS | 6.13 kB | 1.67 kB | 1.43 kB | `/archive` |
| `CommandCenterPage` JS | 8.48 kB | 2.48 kB | 2.25 kB | `/command-center` |
| `CommandCenterPage` CSS | 9.09 kB | 1.94 kB | 1.69 kB | `/command-center` |
| main JS, branch (base) | 419.68 (415.70) kB | 144.13 (142.82) kB | 118.92 (117.97) kB | every page: **+0.95 kB brotli** |
| main CSS, branch (base) | 90.26 (87.33) kB | 15.79 (15.39) kB | 13.84 (13.50) kB | every page |

The main bundle gains the two route entries, the head's titles, descriptions and breadcrumbs, and the footer's two links. The main stylesheet grows by what **moved into it**: the base's separate
`Sketch` stylesheet (2.9 kB raw: the concept sketches and the status badge) is no longer a request of its own, and the CSS a page transfers is 0.7–0.8 kB **smaller** than on the base. The Lab's still
artwork (`LabArt`, 2.5 kB gzip) became a chunk of its own, shared with the archive.

## 2. Initial load of pages that have nothing to do with it

Seven cold loads of each, the two builds taking turns; medians, branch / base.

| Page | FCP desktop (ms) | FCP phone (ms) | Requests | JS transferred (kB) | CSS (kB) | Archive chunks requested |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Home | 1128 / 1140 | 1532 / 1532 | 25 / 27 | 440.4 / 440.2 | 19.1 / 19.9 | none |
| Work | 1056 / 1068 | 1296 / 1296 | 28 / 30 | 232.2 / 232.1 | 21.6 / 22.4 | none |
| Lab overview | 1056 / 1072 | 1292 / 1296 | 27 / 28 | 252.6 / 252.0 | 23.4 / 24.1 | none |
| Project page | 1060 / 1068 | 1288 / 1296 | 28 / 29 | 239.3 / 238.8 | 24.5 / 25.3 | none |

* No difference beyond the noise of the runs (single runs vary by far more than the medians differ). `DOMContentLoaded` medians were within 18 ms of the base's, in both directions.
* JavaScript: **+0.1 to +0.6 kB** per page. The chunk graph changed with the shared modules: `Sketch.module.js` (0.8 kB) is gone; the Lab overview gains an `entry` chunk (0.8 kB), the project page one
  of 1.4 kB while `useDemoText` shrinks by 1.0 kB. One or two requests **fewer** per page.
* The home page's first run transfers ~249 kB and later runs ~440 kB in **both** builds: its deferred 3D scene arrives at an idle moment.
* A first comparison against a base **without** prerendering (both served as the single-page app) showed the branch 4–40 ms later; with both builds prepared the same way the difference is gone.

## 3. Arriving at the two pages (three runs, medians)

| | Cold, ready (ms) | JS / CSS (kB) | Layout shift (CLS) | From the home page's footer (ms) | JS added by that step (kB) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Command Center, desktop | 1379 | 251.4 / 24.5 | 0 | 95 | 217.3 ¹ |
| Command Center, phone | 1759 | 251.4 / 24.5 | 0 | 425 | 22.2 |
| Archive, desktop | 1377 | 253.2 / 25.7 | 0 | 92 | 24.0 |
| Archive, phone | 1782 | 253.2 / 25.7 | 0 | 487 | 24.0 |

¹ Includes 195 kB of the **home page's** deferred 3D scene, which happened to arrive during the step; the Command Center itself loads no 3D code (see its cold load).

"Ready" is the first sector or entry on the page.

## 4. Search, filters and sort

Time from the change of a control to two animation frames later, when the new list has been painted (14 entries; the first pass not counted).

| Control | Desktop median / p95 (ms) | Phone median / p95 (ms) |
| --- | ---: | ---: |
| Typing in the search | 10.2 / 13.2 | 21.7 / 64.4 |
| Kind rail | 10.9 / 14.6 | 31.9 / 75.2 |
| Category | 11.0 / 11.5 | 56.2 / 63.0 |
| Status | 11.3 / 13.1 | 60.5 / 66.4 |
| Sort (whole list reordered) | 11.5 / 13.3 | 59.2 / 68.2 |

The longest single change was 77 ms (phone emulation). Rows are memoized, so a keystroke redraws only what changed. The list is not virtualized: at hundreds of entries it would have to be.

## 5. Left behind

After four round trips between the two pages the journey counts the same DOM nodes, event listeners and documents as before them (exact figures in [TEST_RESULTS](TEST_RESULTS.md)). The new code starts
no timer, observer or animation loop and adds no event listener itself; the entrances and the pointer light are the site's existing components.

## Not measured

No real device, network throttling, real backend or slow API (so neither the time to data nor the layout shift while a slow answer is awaited), no Lighthouse, no field data, no Safari or Firefox.
