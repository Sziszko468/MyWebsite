# Lab 2.0: architecture

PROMPT 34, branch `feature/lab-2-creative-universe`. This document is about *how the Lab is built*; what a visitor can do is in
[README.md](README.md), how it behaves under load in [PERFORMANCE.md](PERFORMANCE.md).

Lab 2.0 is an upgrade of the Lab that already existed (six procedural, local experiences, a shared stage, quality tiers, a Calm and a
Still view, a hidden NFSU2 egg), not a rebuild. Nothing was removed; the shared shell grew three parts and three experiences grew a control.
No dependency, backend route, database table, provider or model was added.

## The layers

```
content/lab.ts, labText.ts, labMeta.ts        what exists: the six, their names, words (hu/en/nl), how each is steered
pages/LabPage.tsx, LabExperimentPage.tsx      the overview and one experience's page (CrashBoundary + Suspense)
components/lab/page/                          the overview: hero, the six tiles (Discovery), previews, philosophy
components/lab/ui/ExperimentFrame.tsx         the shell of one experience: stage, chrome, panel, dock, details
components/lab/core/                          the engine shared by all six (stage, canvas, clock, pointer, quality, view)
components/lab/experiments/<name>/            one experience: its controls object, its panel, its scene, its shaders
components/lab/registry.tsx                   one lazy component per LabId
```

An experience is one default-exported component that renders `<ExperimentFrame id scene panel camera …/>`. The frame owns *everything that
must be identical across the six*: the canvas and its loop, the input, the three views (Live, Calm, Still), the quality tier, the notices
(loading, context lost, no WebGL, failed), the chrome, full screen, and the way out. An experience owns its controls object, its panel and
its scene, and never its own canvas, `requestAnimationFrame`, renderer or global listener (a test enforces that:
`lab2.test.ts` → "no experience is left out of the cleanup rules").

## What is new in the shell

| Part | Where | What it does |
| --- | --- | --- |
| Full screen | `core/fullscreen.ts` (controller), `core/useFullscreen.ts` (hook), `ui/LabFullscreen.tsx` (button + status line), styles in `ExperimentFrame.module.scss` | Browser full screen on the frame's own element, with an *expanded* CSS fallback. One way out in both modes. |
| How to use it | `ui/LabHelp.tsx` (a native `<details>`), words in `experimentText[id].interactions` and `labText.details.keyboard` | The experience's own list of ways to interact and the keyboard line, in the panel, ahead of the controls. |
| What steers it | `LabExperiment.inputs` in `content/lab.ts`, rendered by `page/Discovery.tsx`, words in `page/pageText.ts` | Every tile says it is interactive (the state badge) and lists its inputs (pointer, touch, keys, your own words). |
| Keyboard on the stage | `applyStageKey` in `core/useLabInput.ts`, `LabPointer.nudge` | Arrow keys, Home (recentre), Enter and Space (a click), as pure functions that tests can drive. |

### Full screen

`createFullscreenController(document, element, onChange)` is DOM-free apart from the few members it names, so a test stands fakes in for both
(`lab2.test.ts`, 9 tests). Modes:

* `native`: `element.requestFullscreen()` on the *frame* (`[data-lab-experiment]`), so the panel, the dock and the way out are inside it.
  The browser's own exit (Escape, its UI) comes back as `fullscreenchange`, and the state follows; the button and the status line never disagree.
* `expanded`: the same frame laid over the viewport by CSS (`position: fixed; inset: 0; z-index: var(--z-overlay)`), used where there is no
  Fullscreen API for an element (an iPhone's Safari), where the page may not use it (`fullscreenEnabled` false) and where the request is refused.
  `useFullscreen` adds Escape for this mode (the browser does it for the native one) and sets `data-lab-expanded` on `<html>` so the page behind
  does not scroll.
* `dispose()` removes the listener and leaves native full screen. The hook calls it on unmount, so following a link out of full screen never
  leaves the browser in full screen with nothing to show, and the next experience starts in the normal view.

The theme switch, the language switch, the panel and the dock are inside the frame and keep working in both modes (the journey checks it).
The "way down to the details" is hidden while full screen is on; nothing else is.

### Why the experiences differ in their controls

Controls are *not* a shared generic panel. Each experience declares its own controls object (one mutable object read every frame, never React
state), its own text (`tri(hu, en, nl)` beside the code), and builds its panel from the shared, accessible parts in `ui/LabControls.tsx`
(`LabSlider`, `LabChoice`, `LabToggle`, `LabAction`, `LabTextField`, `LabColour`). The parts are native inputs (range, radio, checkbox, button,
text, colour) dressed in the Lab's language: keyboard, touch and screen readers get what the platform provides.

## The six, and the interaction model of each

| # | Experience | Primary interaction | Controls (changed in Lab 2.0 in bold) |
| --- | --- | --- | --- |
| 01 | Particle Universe | Pointer attracts or repels; a click blasts the structure apart and it re-forms | shape, palette, attract/repel, **arrangement (0–99, deterministic)**, strength, speed, density, intensity, burst, randomise, reset |
| 02 | Liquid Matter | Pointer deforms a liquid body; a click sends a pulse | matter (four states), deformation, flow, tint, light, pulse, reset |
| 03 | Type in Motion | Pointer lifts and tilts the letters; the words are the visitor's own | text, ready-made sentences, font, size, colour, motion preset, speed, depth, distortion, break apart, scatter, reset |
| 04 | Infinite Space | Pointer steers; **a drag turns the view and it stays where you let go**; a click is a pulse | drift, intensity, pattern, palette, streak length, pulse, warp, **recentre view**, reset |
| 05 | Chromatic Distortion | Pointer pulls the colour channels apart; a click is a surge | **mode (mixed / linear / radial)**, separation, waves, lens, direction (not in radial), glitch, noise, surge, randomise, reset |
| 06 | Generative Objects | Words become an object (a fixed word list and procedural parts, **no AI**) | description, make, surprise, example, another version, **seed (typed, deterministic)**, **reset**, material, light, size, spin |

Generative Objects stays procedural and local; `labScope.test.ts` keeps proving it (no AI client, no network, no microphone, no server folder).

### Particle Universe: arrangements

`generateShape(shape, count, arrangement = 0)` seeds its generator with `1013 + shapeIndex·7919 + arrangement·104729`, so the same number is
always the same cloud, `0` is exactly the cloud the shapes always were, and every arrangement stays inside the shapes' bounding box (tested for
0, 1, 50 and 99 on every shape). `ParticleSim.setShape(shape, arrangement)` moves the homes; the springs carry the particles there loosely, with
no jump. Randomise picks a random arrangement; Reset returns to `#1`.

### Chromatic Distortion: modes

One extra uniform, `uMode` (0 mixed, 1 linear, 2 radial), changes how the *offset of the red and blue channels* is built:

```
mixed   offset = drift·global + radial·local              (the original look, unchanged)
linear  offset = drift·global·1.5                          (clean, parallel fringes, no lens)
radial  offset = radial·global + radial·local              (outwards from the pointer; the direction is ignored)
```

The effect is one full-screen shader on the canvas: no page text is ever drawn into it, so the page's words, the panel and the buttons are never
distorted (a test checks the scene never creates a text texture).

### Infinite Space: a look that stays

The camera used to follow the pointer's *position* and fall back to straight ahead when the pointer left, so there was nothing to reset. Now a drag
(`LabPointer.takeDrag`) accumulates a *look* (`lookAfterDrag` in `spaceControls.ts`) that stays after release, inside a cone the tunnel still reads in
(±1.0 rad sideways, ±0.55 rad up and down; a drag across the whole stage turns about 35°), and eases towards its target. While a button is down the
pointer's own steering is switched off so the two never add up. **Recentre view** (and Reset, and the Home key for the virtual pointer) bring it back.

## Lifecycle: what runs, and when it stops

* The canvas exists only while the view is Live or Calm and the global intro has gone (`LabStage`).
* `frameloop` is `'always'` while Live and visible, `'demand'` while Calm (drawing only while something changes), `'never'` while the stage is off screen
  (IntersectionObserver) or the tab is hidden (visibilitychange).
* Leaving the page unmounts the canvas; React Three Fiber disposes the renderer and forces context loss; every geometry and material an experience
  makes is created through `useDisposable` and disposed with it. `window.__labGl` (development only) is removed. `lab2-journey.cjs` measures it:
  after leaving, the renderer's canvas is detached, its context is lost, no frame is drawn, and the GPU geometry and texture counts are zero.
* `useFullscreen` and `useLabInput` register listeners in effects and remove them in the cleanup; `LabStage` disconnects its observer and its
  visibility listener.
* A context loss is announced (`role="status"`), the canvas is hidden until `webglcontextrestored`, and the picture underneath stays.
* A scene that throws is caught by `StageBoundary`; a page that fails to load is caught by `CrashBoundary`. Both leave the rest of the Lab working.

## Quality and motion (unchanged, and relied on)

`labProfile.ts` (tiers high / medium / low from the device's hints), `FramePacer`, `QualityGovernor` and `FrameWatchdog` adapt resolution first, then the tier,
and fall back to the Still view at the floor; the visitor can pin a quality. `prefers-reduced-motion` selects the Calm view by default (interactive,
nothing moves by itself). The Lab reuses the site's motion system for its page frame and does not add another.

## Files added or changed

See the commit; the new files are `core/fullscreen.ts`, `core/useFullscreen.ts`, `ui/LabFullscreen.{tsx,module.scss}`, `ui/LabHelp.{tsx,module.scss}`,
`lab2.test.ts`, `lab2.fixtures.tsx`, `tools/e2e/lab2-journey.cjs`, `tools/audit/audit-lab2.cjs`, `tools/audit/lab2-perf.cjs` and this folder.
