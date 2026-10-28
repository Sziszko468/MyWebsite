# Controlled Chaos — portfolio

React + TypeScript + Vite. Racing Red edition: Dark and Light themes, three languages (hu default, en, nl).

```bash
npm run dev        # dev server; /hu/design-system shows every token and component
npm run build      # type-check + production build
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm test           # vitest: contrast, i18n parity, page registry, language switching, theme, hero input logic, geometry, intro policy and transition
```

## Where things live

| Path | What |
| --- | --- |
| `src/styles/tokens.css` | The design tokens. Brand palette, scales, and one semantic colour block per theme. Change values here only. |
| `src/styles/global.scss`, `_mixins.scss` | Reset, global focus ring, theme-transition rule; breakpoints and interaction mixins. |
| `src/theme/` | `ThemeProvider`, `useTheme`, storage and resolution logic. `index.html` holds the matching pre-paint script. |
| `src/i18n/` | `config.ts` (languages), `locales/*.ts` (dictionaries), `paths.ts` (URL helpers), `I18nProvider`. |
| `src/routes/pages.ts` | The page registry: which pages exist, their paths and languages. Router, navigation, footer, titles and the language switcher all read it. |
| `src/routes/` | `LanguageLayout` (`/:lang/*` guard, providers, shell) and `languageSwitch.ts`. |
| `src/components/` | UI kit (Button, Container, SectionHeading, Badge, ProjectCard, ServiceCard) and the global frame: `AppShell`, `SiteHeader`, `MainNav`, `BrandMark`, `MobileMenu`, `SiteFooter`, `MainContent`, `SceneLayer`, `ThemeToggle`, `LanguageSwitcher`. |
| `src/components/hero/` | The Home hero ("Velocity Field"): kinetic headline, input drivers, generated SVG fallback and the lazily loaded Three.js scene. It is also the engine of the intro. See below. |
| `src/components/intro/` | The fullscreen opening ("Velocity Intro"): state machine, show/skip policy, exit transition, the dialog and its entry button. See below. |
| `src/pages/` | Home, placeholder pages, 404. `DesignSystemPage` exists in dev builds only. |
| `src/config/site.ts` | Brand name, monogram, contact email, social profiles, legal pages. Every `null` is a placeholder. |
| `src/config/intro.ts` | When the intro appears (`first-visit`, `every-session`, `never`), whether visitors can skip it, how long the exit lasts. |

## Conventions

- **Colours:** components use semantic tokens (`--color-*`), never hex values. Raw brand colours (`--brand-*`) are for tokens and decorative art.
- **Themes:** `data-theme="dark|light"` on `<html>`. Dark is the default. The choice is stored in `localStorage` under `theme`; without one, the system setting applies.
- **Strings:** every UI string comes from `src/i18n/locales/*`. `hu.ts` defines the shape, so `en.ts` and `nl.ts` fail to compile when a key is missing or extra.
- **URLs:** `/hu/`, `/en/`, `/nl/`; `/` redirects to `/hu/`. Slugs are the same in every language. The language switcher keeps the current page, query and hash; a page with no translation in the chosen language links to that language's home page, and opening such a page directly redirects to its Hungarian version.
- **Adding a page:** add it to `src/routes/pages.ts` and to `PAGE_ELEMENTS` in `src/App.tsx`. Add its label to `nav` in the dictionaries if it belongs in the navigation.
- **Placeholders:** Work, Services, About, Lab and Contact currently render `PlaceholderPage`. Social profiles and legal links without a real address are hidden in production and shown as muted labels in development; they never render as links.
- **Header:** sticky, `--header-height` tall. Pages own their vertical padding (`<main>` adds none), and anchors respect the header via `scroll-padding-top`.
- **Scene layer:** the hero's 3D canvas lives inside `SceneLayer` (behind content, never captures input, isolated by an error boundary). A section that should run under the header uses the `under-header` mixin from `_mixins.scss`.
- **Hosting:** the site is a single-page app, so the host must serve `index.html` for every path.

## The hero ("Velocity Field")

`src/components/hero/`. An abstract, generative field of light that the visitor moves: streaks rush out of a vanishing point, curved trails wind through it, dust parts around the cursor and a wireframe floor and ceiling rise and roll. There is no car and no scripted scene: the cursor, clicks and scroll change the picture. Headline, description and both buttons are plain HTML above the scene, so they read and work from the first paint. Strings are in `hero.*` of the dictionaries; the second button reuses `cta.startProject`; both buttons are real links (`/work`, `/contact`).

| File | Role |
| --- | --- |
| `VelocityHero.tsx`, `.module.scss` | The section: layers, scrim, layout, mode decision (scene or fallback), quality tier, watchdog callbacks, the bridge to the next section. |
| `KineticTypography.tsx` | The headline as masked, layered, moving type. Real words in the DOM; CSS-only motion driven by the CSS variables below. |
| `CursorController.ts` | Pure. Turns the pointer into an eased position, a velocity (direction and speed), an `energy` that drains away at rest, and a ring of click waves. |
| `ScrollTransition.ts` | Pure. Eases the scroll position and maps it to a pose (roll, pitch, focal-point shift, speed, brightness). |
| `HeroDriver.ts`, `useHeroDriver.ts` | The only code that touches the page: passive pointer, scroll and visibility listeners, one small loop that sleeps when everything has settled, CSS variables for the typography and fallback. Never calls `preventDefault`. |
| `VelocityHeroScene.tsx` | The R3F canvas and the master clock (`Runtime`): writes a handful of uniforms per frame, eases the theme palette, runs the frame-rate watchdog, reports context loss. Lazy-loaded: Three.js is its own chunk. |
| `VelocityField`, `LightTrails`, `DistortionField`, `ReactiveParticles` | The four systems: instanced streaks, curved trail ribbons, deforming grid surfaces, dust. Built once per quality tier, freed on unmount (`usePart`). Each is one or two draw calls. |
| `FieldCamera.tsx`, `Bloom.tsx` | Camera (cursor lean, scroll roll and pitch, composition) and the optional bloom (off in every tier; development only, `?bloom=1`). |
| `framePacing.ts` | Pure: `FramePacer` (draws every Nth frame so 120/144/240 Hz screens do not cost two or three times a 60 Hz one) and the adaptive-resolution steps. |
| `threeConsole.ts` | Drops one known warning from a dependency (`THREE.Clock: This module has been deprecated`, printed by react-three-fiber 9.x's own render-loop clock since three r183) through three's `setConsoleFunction` hook; every other three message still reaches the console. Remove it when react-three-fiber moves to `THREE.Timer`. |
| `fieldShaders.ts`, `fieldGeometry.ts`, `fieldUniforms.ts` | GLSL (one shared force function: ambient swirl, cursor, click waves), geometry builders, shared uniforms and palette easing. |
| `GenerativeHeroFallback.tsx` | The same world as a generated SVG: shows while the scene loads, with no WebGL 2, on reduced motion, after a failure or context loss. |
| `velocityHeroConfig.ts` | Everything tunable: quality tiers, field size, input time constants, composition. |

**What the visitor changes**

- **Cursor:** the flow parts around the pointer and is dragged along its motion; streaks lengthen and the world speeds up with the pointer's speed; the surfaces rise under it; the headline's lines lean a few pixels and their faint outlined echo trails just behind (offsets are in `em`, capped at about 3% of the type size, and the echo only brightens with the pointer's energy; at 88 px type the echo used to slide ~26 px and the lines ~22 px, which read as a doubled, glitching headline). The effect follows `energy`, which rises at once and drains away with a 0.6 s half-life once the pointer rests. The scene never sees the raw pointer, only an eased position.
- **Click** on the hero background (not on links or buttons; on touch, a quick tap): a ring travels outwards through the field, pushing streaks, trails, dust and surfaces, and fades over 2.4 s. Up to four can overlap.
- **Scroll:** the eased scroll progress rolls and pitches the view so the lines turn, sinks the focal point towards the next section, speeds the world up and fades the light; the headline's lines part; three hairlines grow out of the hero's lower edge. Scrolling is never intercepted.
- **Touch:** dragging moves the field and scrolling speeds it up; a drag never produces a wave, a quick tap does.

**Variables** written on the hero's root element (only while motion is allowed): `--hero-cx`, `--hero-cy` (eased pointer, -1..1), `--hero-energy`, `--hero-progress` (eased scroll-out, 0..1).

- **Theme:** the scene reads the one global theme (`useTheme`) and the `--scene-*` tokens in `tokens.css`. A theme change eases colours, light levels and the additive/alpha blend; it does not restart the scene. On dark the lights add to the image; on light they are painted over it (graphite lines, red and blue strokes).
- **Layout:** CSS decides (`--hero-layout`): stacked below `lg` (text first, the scene as its own stage below it), full from `lg` up (scene behind the text, focal point to the right). The camera reads it back.
- **Quality:** `pickQuality` chooses high, medium or low from cores, memory, pointer type, width and save-data. When the frame rate cannot hold, a watchdog (two slow windows of frames) first shrinks the canvas's resolution, in steps of 25% down to half the budget, and only then drops the tier; it gives up (static fallback) if even the lowest tier is unusable. No tier uses bloom or multisampling (see Performance on every platform below).
- **Pausing:** rendering and the driver's loop stop while the hero is off screen or the tab is hidden, and resume on return.
- **Reduced motion:** the scene is not mounted, no listeners are attached, no CSS variables are written, the headline's animation is off. The generated SVG stays, still. It reacts live if the setting changes.
- **Development aids** (stripped from production): `?hero=fallback` forces the SVG, `?hero=high|medium|low` forces a tier, `?bloom=0|1` forces bloom, `?aa=0|1` forces multisampling, `window.__hero` exposes the rig, uniforms, driver, camera and renderer, and `window.__heroRenderFrame()` renders one frame for benchmarking. The intro's scene has its own slots, `window.__intro` and `window.__introRenderFrame()`, because both scenes can exist at once.
- **Assets:** none. All geometry, shaders and the SVG are generated in code; nothing is downloaded.

### Performance on every platform

What makes the scene cheap and the same everywhere, in order of how much each one saves:

- **No multisampling in any tier.** Every primitive has a soft edge made in its own shader (ribbons, streak and trail profiles, round dust, the overlay), so MSAA adds nothing you can see, but with thousands of overdrawn additive quads it multiplied the blending bandwidth by four. Measured on the intro at 2481×1052 on an integrated GPU, GPU-synchronised, one frame: **MSAA on 17.8 ms, MSAA off 0.9 ms**. It also means the canvas's context is the same for every tier, so a tier change never re-creates the canvas (that used to flash).
- **No bloom in any tier.** It needs a half-float render target and several full-screen passes, is the least portable part of a WebGL pipeline, and one NaN pixel in it blacks out the whole frame. With the bloom on (and no MSAA) the same frame cost 9.7 ms. The glow now comes from additive blending and the trail halos. `?bloom=1` still switches it on in development, and a sanitising pass guards it.
- **Frame-rate cap by display.** `FramePacer` measures the screen's frame interval and draws every frame up to ~100 Hz, every second on 120/144/165 Hz and every third on 240 Hz, always a whole multiple so the rhythm stays even. Verified live on a 151.6 Hz display: 76 frames a second drawn, exactly half.
- **Adaptive resolution before a tier drop.** Slow frames shrink the pixel ratio (×0.75, twice) first; rebuilding the scene at a lower tier is the last resort.
- **`powerPreference: 'default'`.** Forcing the discrete GPU on a hybrid laptop means copying every frame across to the integrated GPU that drives the screen.
- **One WebGL context at a time.** The hero's scene is mounted only after the intro, exit included, is gone.
- **Parallel shader compilation** (`compileAsync`) where the browser supports it, so the first frame does not compile the programs one by one.
- **No work for waves that are not there.** The click-wave loop in the shared force function is skipped unless a wave is in flight (`uWaves`).
- **Still at rest, paused when hidden.** The intro draws nothing when nothing changes; the hero stops while off screen or in a hidden tab.

Measured on the default pipeline (Intel Iris Xe, embedded Chromium, 2000×841 viewport at 1.25 DPR → 2481×1052 canvas): intro **0.94 ms** per frame, hero **0.76 ms**. Before: 13.7–25 ms for the intro, depending on the GPU's clock. Zero blank frames in 300 stress frames with random pointer state, live click waves and the exit starburst.

## The intro ("Velocity Intro")

`src/components/intro/`, texts in `intro.*` of the dictionaries. A fullscreen, interactive opening on a visitor's first visit: the same field of light as the hero, but still until it is touched. It is not a loading screen and not an animation that plays by itself. Move the pointer and the field answers; click (or tap the button) and it flies apart onto the home page that is already waiting underneath.

| File | Role |
| --- | --- |
| `VelocityIntro.tsx`, `.module.scss` | A modal `<dialog>`: the browser makes the page behind it inert, traps focus and puts it above the header. Scene, scrim, headline, entry button, language and theme controls, "don't show again". |
| `IntroProvider.tsx`, `introContext.ts`, `useIntro.ts` | The state `ready → active → exiting → completed`, held above the router so it survives navigation and language changes. Guards make the entry fire once. |
| `introPolicy.ts` | Pure: whether to show the intro, and what to remember (`localStorage`/`sessionStorage`, both guarded; blocked storage means "show"). |
| `introTransition.ts`, `useIntroExit.ts` | Pure easing, and the hook that writes one eased number (`--intro-exit`) to a CSS variable and to the scene's signal each frame. No React state per frame. |
| `IntroEntryButton.tsx` | A real `<button>`, independent of WebGL. |
| `../hero/fieldMotion.ts` | Pure: how the field moves for the hero (always flowing) and for the intro (still at rest, driven by pointer energy), and for the exit. |
| `../hero/PointerBeam.tsx` | The light beam through the pointer, stretching with speed. |
| `../hero/PointerHud.tsx` | One full-screen quad that draws the pointer's reticle, the click shock rings and the exit starburst. Hidden (not drawn) unless one of them is showing. |
| `../hero/TunnelRings.tsx` | Concentric ring gates rushing down the tunnel, in four families. One draw call. |
| `../hero/useSceneHealth.ts` | The scene-or-fallback decision, tier and watchdog, shared by hero and intro. |
| `../hero/velocityHeroConfig.ts` | `INTRO_QUALITY`: the intro's own, much denser quality profiles; `profileFor(mode, tier)` picks them. |

**Configuration** (`src/config/intro.ts`): `frequency` is `'first-visit'` (default, remembered in `localStorage` as `intro:seen`), `'every-session'` (`sessionStorage`) or `'never'`; `allowSkip` adds a "don't show again" checkbox (`localStorage` `intro:skip`) that wins over `frequency`; `exitMs` (1000) and `exitMsReduced` (320). The decision is made on every page load and in-app navigation never restarts the intro. Development only: `?intro=1` forces it, `?intro=0` hides it; production ignores the query.

**What the visitor changes**

- **Pointer:** position, direction, speed and distance all matter. The flow parts around the pointer and swirls with the direction of travel (left→right differs from right→left); faster movement means longer beams, stronger distortion and a faster world; slow, close movement shows fine dust around the pointer. Everything is eased and returns to rest gradually (energy half-life 0.6 s), and the page renders no frames at rest.
- **Entry:** a click on the background with a mouse or pen, a tap on the button, Enter or Space on the button, or Escape. The transition lasts 1000 ms: the click point becomes an impulse, the world rushes past, the field spreads towards the edges, the view widens and rolls, the light fades and a hole opens from the click point onto the page. Entry fires once; later clicks are ignored.
- **Touch:** a finger on the background (a drag, a tap) never enters, so scrolling-by-habit cannot dismiss it; the button is full width and at least 60 px tall. There is no simulated mouse.
- **Language and theme** can be changed inside the intro; texts and colours change, the scene is not restarted.
- **Reticle:** while the pointer moves (and for about a second after) a fine targeting reticle follows it: dashed rings, ticks and a gapped cross that swell with speed and burn brightest on the side the pointer is travelling towards.
- **Shock rings:** a click sends a bright ring and three echoes outwards, broken into dashes with short spokes riding the front, on the same front that pushes the field.
- **Exit starburst:** fine spokes in three densities radiate from the click point behind a bright band and rings in its wake; the layers fly apart at different rates (hairlines fastest) for depth. Its envelope is zero at both ends, so nothing flashes.

**Detail.** The intro runs the hero's engine with several times the detail (`INTRO_QUALITY`; the hero's own profiles and look are unchanged):

| Layer | Hero, high | Intro, high | Intro, medium | Intro, low |
| --- | --- | --- | --- | --- |
| Streaks (+ hairline layer: thinner, shorter, fainter, with bright tips) | 2600 | 3000 + 9000 | 1700 + 3600 | 800 + 1500 |
| Dust (mostly 1–2 px specks, few large motes) | 2000 | 9000 | 3600 | 1500 |
| Trails (main + hair-thin; halos only under the main ones) | 24 | 28 + 40 | 18 + 18 | 10 + 10 |
| Surface grid lines (every 4th strong, the rest fine) | 1× | 2× | 1.5× | 1× |
| Tunnel rings (rows per family, four families) | – | 12 | 8 | 5 |
| Overlay (reticle, shock rings, starburst) | – | yes | yes | yes |
| Pixel budget | 3.4 M | 2.8 M | 1.5 M | 0.9 M |

**Loading and failure.** Headline and button are HTML and usable from the first paint, over the generated SVG graphic. The WebGL scene fades in after its first frame. With no WebGL 2, after a failure or context loss, or on reduced motion, the SVG stays and entry still works (with a CSS-only version of the exit; on reduced motion a plain 320 ms fade, no pointer-driven motion). The home page's text and its generated graphic wait behind the intro (no input, headline animation held); its own WebGL scene is mounted only once the intro, exit included, is gone, so there is never more than one context, and fades in over the graphic. After entry the intro's canvas unmounts, its WebGL context is released and nothing keeps running.

**Layout.** Over 1440 px: a left-aligned editorial block, the field's focal point to the right. 1024–1439 and 768–1023: the same block scaled by viewport width. Below 768: headline at the top, the entry row at the bottom within thumb reach; the headline is sized by width and capped by height so the longest word ("dimenziójában.") fits at 320 px. Short landscape screens (phones held sideways) put headline and entry side by side so the button is on screen without scrolling. Dynamic viewport units (`dvh`) are used throughout.

**Type.** The headline is modest on purpose, the field is the show: about 50 px at 1440 px wide (31% of the width), 67 px at 1920, 37 px at 1024, 25 px at 390 and 21.6 px at 320; the supporting line is 14–18 px and the entry label 13–16 px. Each text block carries a soft plate in the page colour (`.copy::before`, `.entry::before`) so it stays readable over the brightest part of a busy field without dimming the field elsewhere.

**Measured** (Intel Iris Xe, embedded Chromium; see Performance on every platform above for the frame cost):

| What | Result |
| --- | --- |
| Frames rendered while at rest | 0 in 1.5 s |
| Exit transition | 1057 ms, from the entry button's centre |
| Canvases alive at once, from the first frame to the hand-off | 1 (the intro's scene is gone by ~0.9 s, the hero's appears at ~1.4 s) |
| After entry | context lost (released), geometries 0, dev slot removed |

GPU clocks on this machine drift by up to 2× between runs, and the embedded browser's `requestAnimationFrame` rate varied between 30 and 150 Hz across the session, so figures that depend on the clock are given as A/B comparisons made in one call, and live frame pacing on slower or 60 Hz hardware is unconfirmed.

**Pixel budget fix.** `PixelBudget` lowers the canvas's pixel ratio on big screens, but React Three Fiber puts its own `dpr` prop back whenever the canvas's parent re-renders (for example when the intro goes from `ready` to `active`), which silently undid the budget. It now re-applies itself whenever the ratio has drifted, not only when the size changes.

**Flicker and glitches (found by testing in Chromium).** Four causes, each fixed and each guarded:

| Cause | Symptom | Fix |
| --- | --- | --- |
| `pow()` of a number that had rounded to a hair below zero (an interpolated 0..1 varying at a quad's edge; `pow(x, 2.0)` in the exit starburst). Undefined in GLSL: NaN on most GPUs. | About 13% of frames came out completely black in a test run (8 of 60), 0 after the fix. | Every base is clamped non-negative; `fieldShaderSafety.test.ts` fails if a `pow()` base is not provably non-negative, if `smoothstep` edges are reversed, or if `atan` is called outside its guarded helper. |
| One NaN or overflowed pixel in the bloom's half-float target, which the blur spreads over the whole frame. | A black frame for as long as the bad pixel lasts. | The bloom is off by default now; where it is switched on (`?bloom=1`), `Bloom.tsx` has a sanitising pass before it: NaN or overflow becomes 0, everything else is capped at 32. Tested by putting NaN in every hairline pixel: the frame stays lit. |
| Raw GL lines (the surface grid, the tunnel rings) are one aliased device pixel wide. | Thin, dense, moving lines crawl and twinkle, worst on a 1× display. | Lines are drawn as screen-space ribbons of 1.1 CSS px with a smooth edge (`createRibbonGeometry`, `RIBBON` in `fieldShaders.ts`). Their total light is steady to about 0.1% between tiny steps, like the smooth trails. |
| Streaks, trails and dust thinner than a pixel crossing the pixel grid. | Twinkling. | The detailed intro never draws them thinner than 1.1 px (dust: 1.8 px) and dims them in proportion, so the light is the same but steady. |
| `html:has(dialog[open]) { overflow: hidden }` removed the classic scrollbar (Windows Chromium), so the page behind the intro was 16 px wider while it was open and snapped narrower when it closed. | The whole hero reflowed at the moment of the hand-off. | `scrollbar-gutter: stable` on `html` (also fixes the mobile menu). Verified by forcing a 17 px scrollbar: the page is 1238 px wide before, during and after. |

Layout was measured in the DOM (headline word extents, button box, overlaps, horizontal overflow) at 1920×1080, 1440×900, 1024×768, 768×1024, 390×844, 360×800, 320×640, 844×390, 667×375, 568×320 and 1440×480, in all three languages where noted: no horizontal overflow, the headline always inside the viewport, the button at least 44×44 px and visible without scrolling.

**Not tested** (be aware): real phones and real touch hardware (touch was checked by emulating the viewport and dispatching `pointerType: 'touch'` events), Safari and Firefox (only an embedded Chromium was available), screen readers, genuinely slow devices (the quality tiers and watchdog are the same as the hero's), and a browser that really lacks WebGL (the fallback was forced with `?hero=fallback`). Reduced motion was simulated by overriding `matchMedia` in the page, so the CSS-side `@media (prefers-reduced-motion)` rule (it only switches the text's rise-in animation off) was not exercised.
