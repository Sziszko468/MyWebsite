# Performance

Part of [Advanced motion and visual experiences](README.md). Measured with `tools/audit/motion-perf.cjs`: both production builds (this branch and its base `46ba3d8`), built the same way
(prerendered, no backend address), served with their real headers and compression, in headless Chrome 158 on one Windows machine (i9-13900H). The two take turns run by run; medians of 7 runs.
"Phone" is 390×844, DPR 2, CPU slowed 4×: **not a phone**. Nothing here measures the GPU.

## 1. Bundle sizes (all JavaScript and CSS, administration excluded)

| | Base | Branch | Difference |
| --- | ---: | ---: | ---: |
| JavaScript, brotli | 825.3 kB | 826.2 kB | **+0.86 kB** |
| JavaScript, gzip | 968.2 kB | 969.3 kB | +1.09 kB |
| CSS, brotli | 79.7 kB | 80.5 kB | **+0.72 kB** |
| CSS, gzip | 92.0 kB | 92.8 kB | +0.82 kB |

Largest changes (brotli): main JavaScript +0.63 kB and main CSS +0.23 kB (on every page); a `scroll` chunk of 0.66 kB split out of `ScrollLinked` (which shrank from 0.79 to 0.28 kB), now
loaded by pages with a page hero; the hero's stylesheet +0.21 kB. Every other changed file by under 0.1 kB. No dependency was added.

## 2. Covered scenes: the main thread while the phone menu is open

Share of wall time the main thread was busy, over 3 s (phone viewport, CPU not slowed):

| Page | Scene visible: base / branch | **Menu open: base / branch** |
| --- | --- | --- |
| Home (the 3D hero) | 5.5 % / 5.4 % | **7.7 % / 0.1 %** |
| Lab overview | 16.7 % / 17.9 % | **17.7 % / 0.8 %** |

The browser journey counts the animation frames in the same situation: about 165 a second drawn behind the open menu on the base, 0 on the branch, and about 166 again after closing.

## 3. Initial load

Base / branch.

| Page | FCP desktop (ms) | FCP phone (ms) | Requests | JS transferred (kB) | CSS (kB) |
| --- | ---: | ---: | ---: | ---: | ---: |
| home | 1144 / 1140 | 1584 / 1572 | 25 / 25 | 440.3 / 440.8 | 19.1 / 19.4 |
| about | 1060 / 1064 | 1308 / 1340 | 27 / 28 | 233.0 / 234.7 | 23.0 / 23.5 |
| work | 1072 / 1064 | 1320 / 1368 | 28 / 29 | 232.2 / 233.9 | 21.6 / 22.1 |
| services | 1076 / 1068 | 1356 / 1372 | 47 / 48 | 272.8 / 274.0 | 33.0 / 33.6 |
| project | 1064 / 1056 | 1412 / 1360 | 28 / 29 | 239.2 / 240.4 | 24.5 / 24.8 |
| lab | 1068 / 1064 | 1404 / 1400 | 27 / 27 | 252.5 / 253.2 | 23.4 / 23.6 |
| command-center | 1064 / 1060 | 1400 / 1384 | 35 / 38 | 251.6 / 253.9 | 24.5 / 25.5 |
| cart | 1072 / 1056 | 1388 / 1400 | 37 / 37 | 258.2 / 258.9 | 24.9 / 25.2 |

* First contentful paint differs by at most 52 ms between the builds, in both directions: within the noise of these runs.
* A page now transfers 0.5–2.3 kB more JavaScript and 0.2–1.0 kB more CSS; one to three more requests on pages with a page hero or scroll-linked parts (the split-out `scroll` chunk and, in the
  Command Center, `ScrollLinked`).
* These timed figures are the **second** run: the first overlapped test runs of other sessions on the same machine. In this one another test or build was running during 15 of 77 samples, all in
  the last four minutes of this part (the builds alternate, so both met it alike).

## 4. Interactions

From a click on a footer link until the new page's heading has been painted (two frames), and a language switch until the page is in the new language. Base / branch, ms, medians of
7. No other test or build ran during this part.

| | Desktop | Phone |
| --- | ---: | ---: |
| To About, first visit | 57.8 / 54.2 | 254.4 / 279.9 |
| To Work, first visit | 29.3 / 32.2 | 115.7 / 117.7 |
| Back to About, code loaded | 17.8 / 17.2 | 97.7 / 98.8 |
| Language switch | 22.7 / 23.0 | 105.8 / 108.1 |
| Scrolling a page: frame time, median / 95th percentile | 6.1/6.3 and 6.1/6.3 | 6.1/8.0 and 6.0/8.3 |

* No long task while scrolling in either build.
* The one difference seen in both runs: the **first visit to About on the phone emulation is 20–25 ms (6–10 %) slower** (254 → 280 ms; 325 → 345 ms in the first, loaded run). The likely
  reason, not isolated: its page hero now loads the scroll module. Desktop and the other interactions are equal within a few milliseconds.

## Not measured

Real devices, real networks, a real backend, the GPU, memory over long sessions, Lighthouse, field data, Safari and Firefox.
