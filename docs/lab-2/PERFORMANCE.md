# Lab 2.0: performance

Measurements, not claims. Everything below was measured by `tools/audit/lab2-perf.cjs` (and one A/B script described in "What is left after leaving") on the **production build**
(`npm run build`, served from `dist` with its own headers, so the real CSP applies). **No before/after comparison of load time or frame rate was made, so no improvement is claimed**:
Lab 2.0 adds a small amount of code (a full-screen controller, two small components, four controls, one uniform) and changes no budget, tier or loop.

## Test conditions

| | |
| --- | --- |
| Machine | Windows 11 (10.0.26300), 13th Gen Intel Core i9-13900H (20 threads), 32 GB RAM |
| GPU | Intel Iris Xe Graphics (integrated), through ANGLE / Direct3D 11 |
| Browser | Chrome 157.0.8103.79, headless, system install, `--ignore-gpu-blocklist` |
| Desktop run | 1440 × 900 window, device pixel ratio 1, dark theme, intro already seen |
| "Phone" run | 390 × 844 touch context, device pixel ratio 2, **CPU slowed 4×** (`Emulation.setCPUThrottlingRate`) |
| Network | Local static server, no throttling (so load times below are CPU and parsing, not a mobile network) |
| Repetitions | Load and activation: median of 3 runs (a fresh browser context each). Rendering: one 5-second sample per experience. |

**Phone emulation is a slowed CPU and a small screen. It is not a phone's GPU**, and a throttled CPU does not slow the integrated GPU the scenes actually run on. It is a relative check
that the main thread keeps up, not a device test. The display's refresh rate caps every frame figure at 60 fps, so "60" means *held*, not "headroom".

## 1. Initial load of the Lab overview (`/en/lab/`, cold)

| Metric | Median of 3 |
| --- | --- |
| DOMContentLoaded / load | 995 ms / 995 ms |
| First contentful paint | 1,084 ms |
| Requests | 25 (16 JavaScript files) |
| JavaScript transferred | 248 KB |
| Everything transferred | 360 KB |
| Three.js loaded | **no**: the overview's previews are 2D canvas; the 3D engine loads only when an experience is opened |

## 2. Activating an experience (time until the live canvas has drawn its first frame)

| Experience | Cold: page load of its URL | From the overview (client-side navigation) | JavaScript on a cold load |
| --- | --- | --- | --- |
| Particle Universe | 1,701 ms | 757 ms | 456 KB |
| Liquid Matter | 1,704 ms | 751 ms | 459 KB |
| Type in Motion | 1,745 ms | 776 ms | 458 KB |
| Infinite Space | 1,721 ms | 752 ms | 457 KB |
| Chromatic Distortion | 1,718 ms | 754 ms | 453 KB |
| Generative Objects | 1,759 ms | 807 ms | 477 KB |

("From the overview" opens the experience from the tile on a loaded overview; the engine and the experience's chunk are fetched then, in a fresh context, so it is not a warm cache.) The poster
(the experience's SVG picture) is on screen from the first paint; the canvas fades in over it when the first frame is drawn.

## 3. Rendering, five seconds per experience

| | Tier at the end | Canvas (px) | fps | Median / p95 frame | Frames over 33 ms |
| --- | --- | --- | --- | --- | --- |
| Desktop, all six | high | 1008 × 900 | 60 | 16.7 / 16.9 ms | 0 of ~298 |
| "Phone" (4× CPU), Particle, Liquid, Type, Space, Generative | medium | 585 × 1266 (device ratio 2, scaled by the Lab's pixel budget) | 60 | 16.7 / 16.9 (Generative 17.0) ms | 0 of ~298 |
| "Phone" (4× CPU), Chromatic Distortion | medium | 448 × 970 (its own, lower pixel ceiling: the shader pays for every pixel three times) | 60 | 16.7 / 16.9 ms | 0 of ~298 |

The tier is the Lab's own choice from the device's hints (`labProfile.ts`): high on the desktop, medium for the phone context. The canvas is smaller than the window times the device ratio because
of the pixel budget (`chooseDpr`); that is the Lab's existing behaviour, unchanged.

## 4. Visibility, lifecycle, cleanup (development build, `tools/e2e/lab2-journey.cjs`)

| Check | Result |
| --- | --- |
| Frames per second while visible / stage wholly scrolled out of view / back in view | 60 / **0** / 60 |
| After leaving an experience (client-side navigation to the overview) | the canvas is detached, the WebGL context is lost and released, **0 frames drawn** in the following second, `window.__labGl` removed |
| GPU geometries and textures, after leaving | **0 and 0** for Particle, Liquid, Infinite Space, Chromatic; Type in Motion: before 1 geometry and 1 texture, after 0 and 0 |
| Generative Objects | before 79 geometries, 3 textures, 7 programs; after **0 geometries, 1 texture**. One texture in three.js' own counter exists from the moment it mounts without the Lab code creating it (with the studio-light environment taken out it is still one before and one after); it does **not** grow (25 rebuilds and four material changes: 3 textures throughout) and the lost context frees it. The source was not identified; it is a known, harmless loose end. |
| A lost context | announced (`role="status"`), the canvas hides, the picture stays; on restore the canvas returns (checked with `WEBGL_lose_context`) |
| Returning (browser back) | exactly one canvas, a new renderer |
| No WebGL (browser started without it) | all six: Still view, the picture, the explanation, the controls; no page error |
| Reduced motion | all six open in the Calm view; with nobody touching the stage the picture does not change (mean pixel difference 0.000 of 255 over 0.9 s); a pointer move changes it (0.5 to 36 of 255) |

## 5. What is left after leaving: the JavaScript heap

**Correction (PROMPT 35).** The first version of this section reported a heap that grew by about 0.13 MB for every experience opened and left, with no levelling off, and
called it a slow growth that "exists without Lab 2.0". **That was a measurement artifact, and the claim is withdrawn.** The script waited for each page with
`page.waitForSelector(...)`, which returns an element handle that Playwright keeps alive inside the page; every handle kept the page it was taken from, with its
canvas and its DOM, from being collected. Any page looks like it leaks under that method (the same loop on the Contact and About pages, which the script's author had
no reason to suspect, showed no growth only because those loops did not take a handle). `lab2-perf.cjs` now waits with locators (`page.locator(...).first().waitFor()`),
which keep nothing.

Heap used (MB, after two forced garbage collections) before, then after each round of "open every experience, come back to the overview", **measured with locator waits**
(production build, one run of eight rounds):

| Start | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4.58 | 11.50 | 12.50 | 12.88 | 13.11 | 13.38 | 13.55 | 13.68 | 13.78 |

The first round's jump (about +7 MB) is the engine and the six experiences' code arriving. After that the growth per round falls: +1.0, +0.4, +0.2, +0.3, +0.2, +0.1, +0.1 MB.
That is what caches and compiled code filling up looks like, not a leak, but **eight rounds do not prove the curve is flat**; the series is not extended further here. The DOM does not
grow at all: after the same kind of round trip the page's node and listener counts are identical from one round to the next (see the interactive demos' test results for the method). No
base-commit comparison is reported for the heap any more: the one that was made used the faulty method.

## What adapts, and where it lives (unchanged by Lab 2.0, relied on by it)

| Mechanism | Where | What it does |
| --- | --- | --- |
| Quality tiers high / medium / low | `core/labProfile.ts`, `useLabView` | Particle counts, geometry detail, pixel budget and shader layers per tier, from the device's cores, memory and screen. |
| Pixel ratio ceiling | `chooseDpr`, per-experience `dprCap` | Never above the tier's budget; Chromatic Distortion has a lower one. |
| Frame pacer | `hero/framePacing` | Skips frames on 120/144 Hz screens. |
| Watchdog and governor | `core/frameWatchdog.ts`, `hero/qualityGovernor` | Lowers resolution first, then the tier, then falls back to the Still view; raises them again when the frame rate is steady. |
| Visibility | `LabStage` (IntersectionObserver, `visibilitychange`) | `frameloop: 'never'` while the stage is off screen or the tab is hidden. |
| On-demand drawing | `LabCanvas` | The Calm view draws only while something changes; Lab 2.0 makes sure it still draws its first frames and every panel change. |
| Disposal | `useDisposable`, `Composed.dispose`, R3F unmount | Geometries, materials, textures and render targets are released on unmount; the context is then lost on purpose. |
| Lazy engine | `LabCanvas` / `registry.tsx` | Three.js and each experience are their own chunks. |

## Known limitations

* One machine, one browser, an integrated GPU, no real phone. The numbers say how this build behaves *here*.
* Phone emulation does not slow the GPU. A mid-range phone's GPU is the likelier limit for Particle Universe and Liquid Matter; the tiers and the watchdog exist for that and were not exercised on one.
* The frame-rate figures are capped by a 60 Hz display; they cannot show headroom.
* No Safari, no Firefox, no memory-pressure or background-tab behaviour on a phone.
* The heap was measured over eight rounds only (section 5), and Generative Objects' single three.js-internal texture in section 4 was not traced to its source.
* The measurements were taken once (loads and activations: the median of three). They are not a statistical study.
