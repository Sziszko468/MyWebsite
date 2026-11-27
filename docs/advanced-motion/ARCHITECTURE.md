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

## 8. Leaving a history entry without losing its place (PROMPT 38.1)

### Root cause

A position was taken down only by an animation frame requested from a scroll event. Leaving an entry meant React cleaning up the scroll manager's effect, which **cancelled a waiting frame and
wrote the older value**. Reproduced on the production build of `93b385a` (`left at` → `came back to`):

| Way of leaving | Result before |
| --- | --- |
| The scroll event had arrived, its frame had not run (frames held back) | 1400 → **600** |
| Scroll and a link in one task, the next page's code already loaded (the browser had not even announced the scroll) | 1400 → **600**, 5 of 5 |
| The same with `history.forward()` | 1400 → **600**, 3 of 3 |
| A page left again **while its restore was still waiting** for it to grow: the wait at the top was recorded over the saved place | 1400 → **0**, 3 of 3 |

When the next page's code still had to be fetched, the frame usually ran during the wait and nothing was lost. Reading the window in the effect's cleanup would not have been a fix: by then the
document shows the next page, and a shorter one has already pulled the window back.

### The lifecycle now

1. `trackEntry` (`scrollRestoration.ts`) owns one entry's passive listener and frame.
2. `LeaveWatch` (in `ScrollManager.tsx`) calls `leave` from `getSnapshotBeforeUpdate`: React has the next page ready and **has not touched the document yet**. This is why it is a class.
3. `leave` cancels the waiting frame, reads `window.scrollY` itself, writes the store and closes the entry: no event or late frame can write under that key again.
4. Only then does React change the page; the effect's cleanup removes the listeners, and the next entry gets its own tracker.
5. When the whole language frame goes away (no link of the site does this), the same reading happens in `componentWillUnmount`, while the page that follows in the tree is still in the document.

| Rule | Why |
| --- | --- |
| A restore that is still waiting **holds** its entry (`createScrollMemory().hold`): nothing is recorded there until it is placed, or the visitor moves the page by more than 2 px | The window does not show where the visitor was. Also protects a reload during the wait |
| **No reading after a REPLACE** | That entry is gone from history; reading it would let a typed search (one entry per letter) push real positions out of the sixty |
| **No reading on the way to a plain `<a href="#…">` entry** (`readsOnLeave`) | The browser follows such a link itself. Followed from a script, Chrome has already jumped when the page frame hears of it (measured: 6545 would have been stored instead of 700); after a real click it jumps later. What scrolling recorded is kept |

Unchanged: the stored form and key, the sixty-entry cap, `history.scrollRestoration = 'manual'` only while mounted, and what a navigation does (top, keep, restore, fragment). One difference in
what is stored: every entry that is left by a push, Back or Forward now has a position, also one that was never scrolled.

### Limits that remain

* On the way to a plain `#link` entry, and on any step to an entry without a router key whose address has a fragment, there is no final reading: a scroll made in the last frame before it can be
  missed.
* Entries made by plain `#links` share their page's key (`default <page>`), so they also share one remembered position with a typed visit of the same page (as before).
* The wait for a page to grow is **120 frames, not a time**: about 2 s on a 60 Hz screen, about 1 s at 120 Hz, about 0.7 s at 165 Hz. A page that takes longer is scrolled as far as it goes,
  and that shorter position then replaces the saved one. As before; not changed here.
* In the development server (React's StrictMode runs effects twice) a reload does not restore the position. The previous code behaved the same there; production builds are not affected.
* Verified in headless Chrome only. The order in which a browser jumps to a fragment and tells the page may differ elsewhere; the rule above does not depend on it.
