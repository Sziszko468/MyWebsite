# Architecture

Part of the [Design System Playground](README.md). Everything below is in the repository on `feature/design-system-playground`.

## 1. The shape of it

```
/{lang}/lab                              /{lang}/lab/design-system
┌──────────────────────────┐   link     ┌────────────────────────────────────────────────────────────┐
│ LabPage (existing chunk) │──────────▶ │ DesignPlaygroundPage  (lazy chunk, loaded only here)       │
│  └ DesignToolBand (small)│            │  useReducer(reducer, siteTheme, initialState)              │
│    reads content/        │            │  ├ PageHero + facts            ┌ ColorLab      (color slice) │
│    playground/entry.ts   │            │  ├ bar: sections · theme · reset ├ TypeLab      (type slice)  │
└──────────────────────────┘            │  └ five memoized laboratories ├ ComponentLab (components)   │
                                        │       each draws PreviewStage(s)  ├ LayoutLab    (layout)    │
                                        │                                   └ MotionLab    (motion)    │
                                        └────────────────────────────────────────────────────────────┘
```

* **Models** (`src/playground/{color,typography,layout,motion,state}.ts`) are plain functions and data: parsing, WCAG arithmetic, bounds, the reducer. No React, no DOM,
  so every rule has a unit test (`model.test.ts`).
* **`PreviewStage`** is the one place visitor choices become pixels (§3).
* **The laboratories** are `memo` components that receive only their own slice of the state, the stable `dispatch`, the localized words and an `announce` function, so a change in one
  laboratory does not draw the others (measured: see [PERFORMANCE](PERFORMANCE.md) §4).
* **Controls** are the Lab's own (`components/lab/ui/LabControls`: `LabSlider`, `LabChoice`, `LabToggle`) and the site's form fields (`components/form/fields`: `TextField`, `SelectField`,
  `CheckboxField`); **actions** are the site's `Button`. No control was written for the playground.

## 2. The state

One value, `PlaygroundState`, in one `useReducer` in the page's component:

```
theme       'dark' | 'light'   the theme the PREVIEWS carry (starts as the site's, never writes it)
color       draft (what is typed) · palette (last valid, #rrggbb) · errors · the pair
type        family, size, weights, line height, tracking, width, ratio, three texts
layout      container, columns, gap, padding, radius, alignment, preview width
motion      duration, easing, distance, stagger, simulateReduced
components  selected + the properties of each of the eight components
replay      one counter per animation example (a new number restarts it) + one for the components' own state
```

* **Every change passes the model's bounds.** `type/set`, `layout/set` and `motion/set` run the merged state through `clampType` / `clampLayout` / `clampMotion`: numbers are cut to the
  range and snapped to the step (NaN, Infinity, strings and unknown ids fall back to the original), a family or a ratio that is not offered is refused, texts are cleaned
  (control characters out, one line, cut to the limit by code point). `components/set` accepts only keys the component has and only values of the type it has.
* **A typed colour** is kept as typed in `draft` and parsed on every change: a valid HEX updates `palette` at once; a wrong one records *why* (`empty`, `characters`, `length`) and
  leaves `palette` as the last valid colour, so the preview never shows a half-typed value.
* **Reset** is `initialState` again: a new object every time, nothing shared. `reset all` also takes the *current* site theme as the previews' theme and bumps every replay counter;
  `reset <section>` touches only its slice.
* **Nothing is stored.** There is no `useEffect` that writes the state anywhere; there is no `localStorage` / `sessionStorage` / cookie / IndexedDB / `fetch` / analytics call in
  `src/playground/` or the page (a source-scan test fails on any), and the journey compares storage and requests before and after play.

## 3. Isolation: how a change reaches the components and nothing else

`PreviewStage` renders `<div data-theme="dark|light" style="--…">`. `tokens.css` was written so that *any element can carry a theme* (its semantic blocks are selected by `[data-theme]`,
not `:root[data-theme]`), and every real component reads `var(--color-…)`. So:

* **The theme** of a preview is the stage's `data-theme`; the site's `<html data-theme>` is read (to start the previews in the site's theme) and never written. The page imports
  `useTheme` and reads `theme` only; a test fails if the page (or anything in `src/playground/`) mentions `setTheme`, `toggleTheme`, `applyTheme`, `documentElement`, or sets a style or an
  attribute on `<html>` / `<body>`.
* **The palette.** For the *original* palette `previewTokens()` returns `{}`: the stage sets **nothing**, and the previews are the site's own tokens exactly. Once a colour is changed it
  returns the five `--brand-*` tokens plus every semantic token (`--color-bg`, `--color-surface*`, `--color-text*`, `--color-border*`, `--color-accent*`, `--color-on-accent`,
  `--color-secondary*`, `--color-focus`, `--color-disabled-*`) worked out from them for the stage's theme: dark reads Warm Paper on Carbon Black, light the other way round; surfaces and
  borders are mixes of background and text; the accent and secondary *text* colours are moved only as far toward the text colour as they must be to reach 4.5:1 on the background; the label
  colours on the accent and secondary buttons are whichever of black / paper / white reads best. These go on the stage element's inline style only.
* **A real component inside a stage** therefore changes with the stage. A component that sets a theme of its own (the site's `Section` does, and reads the site's theme) would reset the
  semantic tokens on its own element, so it is **not** shown in the component laboratory.
* **Links** in a preview never navigate: the stage prevents the default of a click or middle-click on `a[href]` in the *capture* phase, before React Router's handler, which then sees a
  prevented click. (The previews contain real links on purpose: they are real components.)
* **Custom-property cycles.** The motion stage overrides `--ease-out` (and `--dur-base`, `--dur-fast`) so the real `Button` follows the visitor's parameters. The override must be the curve
  *itself*: `--ease-out: var(--ease-out)` is a cycle that makes every use of the property invalid, so animations silently did not run. That was found in a real browser, not by the first
  unit test; there is now a test that no custom property in `motionVars` refers to itself, and a test that each literal curve equals the one in `tokens.css`.

## 4. What is derived, and what is the site's

The five brand tokens and the motion defaults are **read from `tokens.css` by a test** (the playground cannot drift from the site: `--brand-*`, `--dur-base`, `--ease-*`,
`--motion-distance-md`, `--motion-stagger`, `--fw-*`, `--lh-normal`, `--ls-normal`). The *semantic* colours of a changed palette are the playground's own derivation (§3), because the
site's semantic tokens are hand-picked hex values that cannot be recomputed from a different palette. The contrast report is computed from the derived roles, which is why its numbers can
differ slightly from the live site's for the original palette; the page says so.

## 5. Loading and bundle

* `App.tsx` imports the page with `lazyRoute(() => import('./pages/DesignPlaygroundPage'))`: the page, the five laboratories, the models and `text.ts` are **one chunk** requested only when
  the route is opened. The main code reads **only** two small things: the route table entry (`routes/pages.ts`) and the head's strings (`content/playground/meta.ts`). A test checks
  that nothing in `src/playground/` is imported by `App.tsx`, `pages.ts`, `documentMeta.ts`, `jsonLd.ts` or `motion/config.ts`.
* The Lab's band reads `content/playground/entry.ts` (a few sentences), not `text.ts`.
* The Lab's overview, the home page and every project page do **not** request the playground's chunk (measured in [PERFORMANCE](PERFORMANCE.md)).

## 6. Routing, head and SEO

* `routes/pages.ts`: `PLAYGROUND_PAGES = [page('design-playground', '/lab/design-system')]` — **indexable**, in every language, in no menu, in the sitemap with its three alternates.
  The id does not start with `lab-`: code that takes a `lab-…` id for an experiment (`labIdOfPage`, the immersive shell, the experiment route) never sees it, so the page keeps the
  site's header and footer (it is not an immersive page). The motion scope is the Lab's (`scopeOfPage`).
* Head: title `Design System Playground, <a design tool> — Lab — <brand>` (a description of its own per language, so the SEO check's "same title in two languages" rule holds), a description,
  canonical and hreflang from the generic pipeline, a breadcrumb *Home › Lab › Design System Playground* in the structured data. The page is prerendered as a shell by the existing
  prerender (`115` pages in the build; the check says `116 files, 85 indexable, 31 noindex`).

## 7. Localization

Every word is a `tri()` in `src/content/playground/` (the brand colours' and typefaces' names and the components' source paths are proper nouns, written once in the components). Numbers
and units (`px`, `ms`, `em`, `%`) are formatted in code. `i18n:check` and `i18n:validate` (completeness, spelling with Hunspell, hard-coded sentences, forbidden foreign words, glossary) include
`content/playground/`; the product name and two technical words were added to the spelling allow-list with the reason (`allowedWords.ts`), and words the dictionaries did not know were
rephrased rather than allowed.

## 8. Motion and cleanup

* The motion laboratory plays **one-shot** CSS animations and transitions driven by `--pg-*` custom properties; nothing loops (`animation-iteration-count: infinite` and
  `requestAnimationFrame` are forbidden by a test). Every time value comes from a custom property; the only literal time is `0.01ms`, the reduced-motion answer.
* **Reduced motion**: the system's (`useReducedMotion`, which listens to `prefers-reduced-motion` and stops on unmount) or the visitor's switch sets every duration, distance and
  stagger to nothing on the stage (`motionVars`); the stylesheet says the same in a `@media (prefers-reduced-motion: reduce)` block.
* **Timers** (`setTimeout` for the button feedback and the held hover) are kept in a list that is cleared on unmount and on restart; there is no `setInterval`. **Observers** (`ResizeObserver`
  for the layout frame, `IntersectionObserver` for the scroll reveal and for the bar's current-section marker) are disconnected in the effect's cleanup. A source test counts them.
* **Leaving the page** drops the component, so the reducer state, the timers and the observers go with it; the journey leaves and returns five times and compares the document's nodes,
  listeners and documents (equal).

## 9. Decisions not to undo

1. **A tool, not an experiment.** Separate id, separate band, a test that the Lab has exactly six.
2. **Stages, not the global theme.** The site's tokens are never written; the original palette overrides nothing.
3. **Real components only.** Nothing in the playground is named like one of the site's components (a test); the previews import them from `src/components`.
4. **No persistence and no network, by rule** (a test scans for them).
5. **Bounded everything.** Every number has a min, a max and a step in the model; presets sit on the slider's grid (a preview width step of 8 keeps 360, 768 and 1280 exactly).
6. **Words, not only colour.** Original vs changed, pass vs fail, and every error are said in text and shape.

## 10. Adding to it

* **A component**: add its id to `COMPONENT_IDS` (`state.ts`) with its defaults in `originalComponents`, a control panel and a preview in `ComponentLab.tsx`, its words in `text.ts`
  (`components.names`, `about`, `props`), and a line in `SOURCES`. The tests iterate `COMPONENT_IDS`, so it is rendered in every language automatically.
* **A laboratory**: a model with bounds and a clamp, a slice in `state.ts` with `reset`, a memoized component, words, a `SECTIONS` entry in the page, and tests.
