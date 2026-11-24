# Performance

Part of the [Design System Playground](README.md). **Measurements, not claims**, made with `node tools/audit/playground-perf.cjs dist --base <dist of the base commit>` on the
production build served by `tools/audit/serve.cjs` with its real headers and brotli/gzip, in headless system Chrome 157.0.8103.79 on Windows 11 (Intel Core i9-13900H, 20 threads),
**medians of three cold runs** (a new browser context each). "Phone" is a 390 × 844 viewport, device pixel ratio 2, touch, and the CPU slowed **4×**: an emulation, **not a phone**.
The base commit is `23e5904` (the demos branch). Its build has no prerendered pages, so the with/without comparison serves **both builds as the single-page app** (this build copied without
its prerendered pages); the playground's own page is measured on this build's real prerendered files. Every number depends on this machine.

## 1. What the build adds

| File | raw | gzip | brotli | Loaded when |
| --- | ---: | ---: | ---: | --- |
| `DesignPlaygroundPage` (page, five laboratories, models, words) `.js` | 79,292 | 26,380 | 23,391 | only at `/lab/design-system` |
| `DesignPlaygroundPage` `.css` | 17,912 | 3,546 | 3,153 | only at `/lab/design-system` |
| `main` `.js` (base → branch) | 421,900 → 415,701 | 144,246 → 142,824 | 119,116 → 117,969 | every page |
| `main` `.css` (base → branch) | 90,259 → 87,331 | 15,794 → 15,394 | 13,843 → 13,495 | every page |
| `LabPage` `.js` (base → branch) | 29,349 → 30,936 | 11,444 → 11,982 | 10,038 → 10,516 | the Lab's overview (the band) |
| `LabPage` `.css` (base → branch) | 21,215 → 22,001 | 4,449 → 4,544 | 3,968 → 4,051 | the Lab's overview |
| `areas` `.js` (new shared chunk) | 6,851 | — | ≈ 2.9 KB | every page (see §2) |
| `Sketch.module` `.js` and `Sketch` `.css` (new shared chunks) | 1,143 and 2,929 | — | ≈ 0.8 KB and — | every page (see §2) |

The playground itself is 23.4 KB of JavaScript and 3.2 KB of CSS **in brotli**, and it is **one chunk**: the five laboratories, the models and all three languages of the words arrive together,
once, when the page is opened. The main bundle **shrank** (−6.2 KB raw, −1.1 KB brotli): the main code reads only the route entry and the head's strings (`content/playground/meta.ts`).

## 2. The initial load of pages that must not pay for it

The playground's chunk was **never requested** on the home page, the Lab's overview or a project page, in any of the 18 cold loads of this build (`playgroundChunksRequested` is empty in every cell).

What *did* change on those pages is a side effect of code splitting: because the playground's chunk imports modules the main code already uses (the navigation's services data, the project
mockup), the bundler now writes two of them as **shared chunks** that every page loads:

| Page | JS transferred (KB, base → branch) | JS files | requests | files that differ |
| --- | --- | --- | --- | --- |
| Home | the hero's 3D chunk loads in some runs of **both** builds (the cells vary 226–440 KB run to run), so the totals are not comparable; the differing files below are | 14 → 17 | 22 → 26 | `areas` +2.9 KB, `Sketch.module` +0.8 KB, `main` −1.1 KB: **net +2.6 KB** |
| Lab overview | 248.8 → 252.0 | 17 → 19 | 25 → 28 | `areas` +2.9, `Sketch.module` +0.8, `main` −1.1, `LabPage` +0.5: **net +3.2 KB** |
| Project page | 236.2 → 238.8 | 16 → 18 | 26 → 29 | `areas` +2.9, `Sketch.module` +0.8, `main` −1.1: **net +2.6 KB** |

So the cost to every other page is **about 2.6–3.2 KB of JavaScript (+1 %) and two or three more requests** (two small JavaScript files and a small stylesheet). Timings
(DOMContentLoaded / first contentful paint, ms, base → branch):

| | Home | Lab | Project |
| --- | --- | --- | --- |
| desktop | 975 → 1022 / 1116 → 1176 | 952 → 998 / 1016 → 1068 | 1004 → 988 / 1068 → 1064 |
| phone (4× CPU) | 1186 → 1167 / 1940 → 1972 | 1130 → 775 / 1392 → 1044 | 1157 → 1197 / 1404 → 1616 |

These differences go in **both directions** and the same cell differs by up to a few hundred milliseconds (the Lab on the phone emulation was *faster* on the branch by 355 ms, which is
noise, not a gain), so with three runs per cell **I cannot attribute any timing difference to the playground**. What I can attribute is the +2.6–3.2 KB and the +2–3 requests above.
I believe the split comes from the playground importing the real `MainNav` (which reaches the services data) and `ProjectMockup` (the project card's sketch), both of which the main code also
uses; that is an inference from the names of the new chunks, **not tested** (I did not build a variant without them). If those requests matter on the real host, that is where to look; keeping
them out would mean showing fewer real components, and I judged that the wrong trade for a design-system tool.

## 3. Activating the playground

| | Cold (a fresh load of the URL, prerendered), until the first laboratory is on the page | From the Lab's overview (the band's link followed) | JavaScript the activation brought |
| --- | ---: | ---: | --- |
| desktop | 1415 ms (264.4 KB of JavaScript for the whole page) | **134 ms** | +27.8 KB in 5 files (`DesignPlaygroundPage` 23.1, `fields` 1.5, `LabControls` 1.4, `PageHero` 0.9, `SpeedLines` 0.8) |
| phone (4× CPU) | 1973 ms | **703 ms** | the same |

The cold figure includes the whole page's ordinary load (about a second of it is the site's own start-up, as for every page); the figure that is the playground's own cost is the second column.

## 4. Interacting

Thirty changes of a control, each measured from the change to the frame in which its result has been painted (two animation frames later), the first two dropped:

| Control | desktop median / 95th / max (ms) | phone (4× CPU) median / 95th / max (ms) |
| --- | --- | --- |
| a HEX typed (a new colour every time) | 11.7 / 11.9 / 12.0 | 26.6 / 33.7 / 42.6 |
| the body size (type) | 5.7 / 11.7 / 12.3 | 25.5 / 32.0 / 32.6 |
| the columns (layout) | 5.4 / 6.4 / 6.4 | 8.0 / 10.0 / 10.3 |
| the preview width (layout) | 5.9 / 12.1 / 13.2 | 10.6 / 15.5 / 21.6 |
| the duration (motion) | 5.8 / 6.6 / 6.6 | 15.9 / 19.5 / 20.8 |

The slowest single interaction, with a 4× slower CPU, is 42.6 ms. **No long frame appeared in these runs** (the interactions of PROMPT 35's demos showed sporadic 200–500 ms frames in headless
Chrome; none appeared here, in 300 measured changes; I did not investigate why they did there and not here).

### Which part of the page draws again

A `MutationObserver` on each of the five laboratories counted what the browser touched while one control was dragged thirty times:

| Control dragged | #color | #type | #components | #layout | #motion |
| --- | ---: | ---: | ---: | ---: | ---: |
| the body size (type) | **0** | 1920 | **0** | **0** | **0** |
| the columns (layout) | **0** | **0** | **0** | 1541 | **0** |
| the preview width (layout) | **0** | **0** | **0** | 2820 | **0** |
| the duration (motion) | **0** | **0** | **0** | **0** | 1662 |
| a HEX typed (colour) | 1616 | **0** | 2129 | 1457 | 1553 |

Only the laboratory that owns a control draws again (each is a `memo` component that receives only its own slice of the state). The one exception is a colour: three stages use the visitor's
palette (components, layout and motion), so they follow it by design; the type laboratory, which does not use the palette, is not touched (0).

## 5. What is left after leaving

The journey (`tools/e2e/playground-journey.cjs`) leaves the playground and returns through the app's own navigation four more times and compares the document with Chrome's own counters:
**nodes 1978 → 1978, event listeners 368 → 368, documents 1 → 1**. A reload or a return starts from the originals. Timers (button feedback, the held hover) are cleared on unmount,
observers are disconnected, and there is no `setInterval`, no animation frame loop and no infinite animation (a test fails on any, and the journey asked the browser for the running animations of the motion
stage: none looped).

## 6. Not measured

* Real devices, real networks, the CDN's own compression and caching, Lighthouse, a cold cache against the real host. Safari and Firefox.
* Memory over a long session (the heap), and the cost of the six motion examples running at the same time on a slow phone.
* The effect of the two extra shared chunks on a real connection (one extra request each).
