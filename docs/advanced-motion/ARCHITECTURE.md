# Architecture

Part of [Advanced motion and visual experiences](README.md).

## 1. The audit before the work (what was there)

| Area | State on the base branch |
| --- | --- |
| Motion identity | Durations, curves, distances, stagger and per-scope intensity as tokens (`styles/tokens.css`) mirrored in `motion/config.ts`, held equal by tests; a stylesheet audit (`styles/motion.audit.test.ts`) allows only compositor and paint properties |
| Page frame | One `Suspense` above a keyed `PageTransition` (fade, Lab wipe); `ScrollManager`; an indeterminate loading bar |
| Pointer, scroll | One pooled `IntersectionObserver`, one passive scroll listener; `usePointerField`, `useMagnetic` (large CTAs only), `CursorLabel`, `Reveal`, `KineticText`, `ScrollLinked` |
| 3D | Home hero and intro (R3F, quality tiers, frame pacing, paused off screen and in a hidden tab); the Lab's stages (`LabStage`/`LabScene`, disposal verified by the Lab journey) |
| Reduced motion | Tokens collapse and intensity is 0; scripts checked the setting once, when they started |
| Cleanup | Listeners, frames, observers and timers were counted per file and the uneven ones read; no leak found (one-shot frames and a module-wide storage listener are intended) |

The system was mature. This work **extends it** and adds no layer beside it: no animation library, no new loop, no new renderer.

### Defects the audit found on the base branch (each reproduced in a browser, then fixed)

| # | Defect | Cause | Fix |
| --- | --- | --- | --- |
| 1 | On a page opened directly, the first change of its own address (a letter typed into the archive's search) made the **whole page disappear and fade back in** (lowest opacity 0) | `PageTransition` decided the entrance from the *current* navigation | The arrival is decided once, when the page mounts |
| 2 | After a direct load, **switching the language** rebuilt the page, replayed the entrance and **scrolled to the top** | A direct load arrives at `/en/about/` (the server's folder form), the language link goes to `/hu/about`: the two were taken for different pages | `pageKeyOf`: with or without the final slash it is one page |
| 3 | In a tab that had shown another page, **a page opened by its address landed at the previous page's scroll position** (a layout shift of 0.53–0.59 on the five lazy pages measured) | Every direct load has the router's key `default`, so one saved position served all of them | The key includes the page; a fresh visit starts at the top |
| 4 | A **reload** or the browser's **Back** to a long page ended part way down (611 instead of 1500 px), with the same shift | The position was applied to the half-drawn page and the later content was taken for the visitor's own scroll | It waits (at the top) until the page is tall enough, up to about two seconds |

## 2. Added pieces (`src/motion/`)

| Module | What it is for |
| --- | --- |
| `reducedMotion.ts` | `useReducedMotion()`: the setting followed while the page is open. Used by `CursorLabel`, `useMagnetic`, `useScrollProgress` and the Lab previews' loop, so switching it on mid-visit stops them |
| `indicator.ts` | `useSlidingIndicator`: one marker that glides to the chosen item (transform only). Used by the header's line (the earlier private code, generalised) and the language switcher |
| `navigation.ts` | `pageKeyOf`, `arrivalOf`, `followsHere`: the navigation's small decisions as plain functions |
| `cover.ts` | `coverPage()` / `useCovered()`: the phone menu and the phone assistant say that they cover the page; the hero, the Lab stage and the Lab previews stop drawing meanwhile |
| `scroll.ts` (extended) | `--sp-exit`: 0 while an element's top is on screen, 1 once it has left upwards; for depth that must sit at rest |

## 3. Foundation

* Two interaction tokens, in CSS and in the config: `--motion-lift` (2 px, times the page's intensity) and `--motion-press` (0.985, 1 under reduced motion).
* Mixins `lift`, `press`, `press-card`; they use the individual `translate` and `scale` properties, so they compose with existing transforms (the magnetic pull included).

## 4. Page transitions and navigation

* The header's marker moves to a clicked page **at once** (`data-pending`); `aria-current` stays on the page really shown until the new one replaces it. Only a plain left click counts.
* While a page's code is waited for longer than the loading bar's 140 ms, the page being left **recedes** to 65 % opacity. It stays readable and usable; the last click wins.
* On a navigation (not the first page, not Back or Forward) a page's first screen **arrives in order**: label, sentence, buttons.
* No exit animation delays anything, and the View Transitions API is not used (see §7).

## 5. Interaction and depth

| Where | Added |
| --- | --- |
| Buttons | The hover lift now follows the page's intensity; the press uses the token |
| Project, service-category and gallery cards, the Command Center's doors and Lab tiles | Press; the keyboard gets the cues the mouse gets |
| Choice cards, Lab choices, package tabs, language switcher | Press |
| Language switcher | The gliding marker; forced colours keep their own highlight |
| Section headings | The red stripe draws in when a heading below the fold arrives |
| Page heroes | Lines and glow fall behind the words as the screen leaves (56 px / 24 px at full intensity; half on touch; none under reduced motion) |
| Command Center | Featured pictures drift 16 px against their text; a cursor label on the doors |

## 6. Three.js and the Lab

No scene, shader, control or experience was changed, added or removed: **six experiences**, Generative Objects procedural and local, the design playground outside the six, the hidden screen as it
was. The one change is *when* scenes draw: not while something covers the whole page. The single texture three.js itself keeps after Generative Objects (documented in the Lab's journey since
PROMPT 34) is unchanged.

## 7. Decisions

1. **No animation library.** Everything asked for was possible with the existing engine, CSS and the Web Animations the browser has.
2. **No View Transitions API.** It would add a second transition mechanism, cover the page with an overlay while it runs and need synchronous rendering around lazy pages.
3. **The magnetic pull stays on large calls to action only** (unchanged).
4. **The cart and the request builder stay plain** (their scope's intensity is 0.25 and reveals are off).
5. **Scroll is never intercepted**: no smooth-scroll takeover, no snapping.
