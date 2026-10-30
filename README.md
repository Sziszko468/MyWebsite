# Controlled Chaos — portfolio

React + TypeScript + Vite. Racing Red edition: Dark and Light themes, three languages (hu default, en, nl).

```bash
npm run dev        # dev server; /hu/design-system shows every token and component
npm run build      # type-check + production build
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm test           # vitest: contrast, i18n parity, page registry, language switching, theme, hero input logic, geometry, intro policy and transition, home-page content, rhythm and link targets, project-page content, pictures and meta, services content and wording, quote-form validation and sending, the services, About and contact pages rendered in three languages, the About content's honesty rules, the contact form's validation and sending, the configured links
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
| `src/components/home/` | The home page's sections after the hero (path chooser, selected work, what I build, about, lab, packages, closing call to action) and their drawings. See "The home page" below. |
| `src/components/Section/`, `src/components/motion/` | `Section` (a band that wears its own theme), `Reveal` (arrive-once on scroll), `usePointerField` (pointer variables for CSS). |
| `src/content/` | The editable data: projects, areas of work, packages, lab experiments. No words in here, only structure; the words are in the dictionaries. |
| `src/content/about/` | The About page's personal content: the story and the seven transferable skills (`story.ts`), the four principles (`approach.ts`), the technologies (`skills.ts`), the current focus (`focus.ts`), each with its text in three languages side by side. See "About page" below. |
| `src/content/projectDetails/` | The project pages' content (`spendly.ts`, `bookinghub.ts`, `logistics.ts`), each with its text in Hungarian, English and Dutch side by side (`tri(hu, en, nl)`), and `meta.ts` for their titles and descriptions. See "Project pages" below. |
| `src/components/project/`, `src/pages/ProjectPage.tsx` | One page component for every project: the hero, the eight bands, the architecture diagram, the gallery with its lightbox, the previous/next links. Loaded as its own chunk. |
| `public/projects/<slug>/` | The optimised screenshots (WebP, at most 1440 px wide). |
| `src/content/services/` | The services page's editable content: `areas.ts` (the four service areas), `process.ts` (the five steps), `faq.ts` (the six questions), each with its text in three languages side by side. The packages are in `src/content/packages.ts`, shared with the home page. See "Services page" below. |
| `src/components/services/`, `src/components/form/`, `src/pages/ServicesPage.tsx` | The services page's bands, the package picker, the quote form and its steps, and the form fields (labels, hints, errors and radio groups wired for assistive technology). Loaded as its own chunk. |
| `src/quote/`, `src/contact/` | The quote request and the contact message without any screen: the types, the validation rules, the summary text and the error wording of each. |
| `src/forms/` | What the two forms share: `submit.ts` (the transport that sends a request, or says it cannot) and `useDraft.ts` (the answers, kept in memory only). |
| `src/components/about/`, `src/components/contact/`, `src/pages/AboutPage.tsx`, `src/pages/ContactPage.tsx` | The About page's bands and the contact page's hero, doors, form and links. Each page is loaded as its own chunk. |
| `src/components/PageHero/` | The shell of a page's first screen (eyebrow, headline, sentence, buttons over a faint light field), used by the services, About and contact pages. |
| `src/pages/` | Home, services, About, contact, project pages, placeholder pages (Work, Lab), 404. `DesignSystemPage` exists in dev builds only. |
| `src/config/site.ts` | Brand name, monogram, contact email, social profiles, legal pages. Every `null` is a placeholder. |
| `src/config/links.ts`, `src/config/contact.ts` | The links the contact page shows (read from `site.ts`), and where the contact message is sent. |
| `src/config/quote.ts` | Where the quote request is sent (`VITE_QUOTE_ENDPOINT`) and whether the visitor has to tick the acknowledgement of how the data is used. |
| `src/config/intro.ts` | When the intro appears (`first-visit`, `every-session`, `never`), whether visitors can skip it, how long the exit lasts. |

## Conventions

- **Colours:** components use semantic tokens (`--color-*`), never hex values. Raw brand colours (`--brand-*`) are for tokens and decorative art.
- **Themes:** `data-theme="dark|light"` on `<html>`. Dark is the default. The choice is stored in `localStorage` under `theme`; without one, the system setting applies. The semantic token blocks are selected by `[data-theme]` alone, so any element can carry a theme of its own: that is how a band of the home page is light on a dark page (see `Section`).
- **Strings:** every UI string comes from `src/i18n/locales/*`. `hu.ts` defines the shape, so `en.ts` and `nl.ts` fail to compile when a key is missing or extra.
- **URLs:** `/hu/`, `/en/`, `/nl/`; `/` redirects to `/hu/`. Slugs are the same in every language. The language switcher keeps the current page, query and hash; a page with no translation in the chosen language links to that language's home page, and opening such a page directly redirects to its Hungarian version.
- **Adding a page:** add it to `src/routes/pages.ts` and to `PAGE_ELEMENTS` in `src/App.tsx`. Add its label to `nav` in the dictionaries if it belongs in the navigation.
- **Placeholders:** Work and Lab currently render `PlaceholderPage`. Social profiles and legal links without a real address are hidden in production and shown as muted labels in development; they never render as links.
- **Header:** sticky, `--header-height` tall. Pages own their vertical padding (`<main>` adds none), and anchors respect the header via `scroll-padding-top`.
- **Scene layer:** the hero's 3D canvas lives inside `SceneLayer` (behind content, never captures input, isolated by an error boundary). A section that should run under the header uses the `under-header` mixin from `_mixins.scss`.
- **Hosting:** the site is a single-page app, so the host must serve `index.html` for every path.

## The hero ("Velocity Field")

`src/components/hero/`. An abstract, generative field of light that the visitor moves: streaks rush out of a vanishing point, curved trails wind through it, dust parts around the cursor and a wireframe floor and ceiling rise and roll. There is no car and no scripted scene: the cursor, clicks and scroll change the picture. Headline, description and both buttons are plain HTML above the scene, so they read and work from the first paint. Strings are in `hero.*` of the dictionaries; the first button scrolls to the Selected work section of the same page (`#work`), the second opens `/contact`.

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

## The home page

`src/pages/HomePage.tsx` stacks the hero and seven bands from `src/components/home/`, in this order. Each has its own composition; nothing is a card grid of equals.

| # | Band (anchor) | Composition | What the pointer does |
| --- | --- | --- | --- |
| 0 | Hero | The Velocity Field scene behind the headline "Digitális élmények. Valódi hatással." and two buttons (`#work`, `/contact`). | The hero's own cursor, click and scroll reactions. |
| 01 | Choose your path (`#path`) | Two doors of different width, height and temperature: a narrow paper one for careers, a wide carbon one for clients. Each is dark or light whatever the page is. | A blueprint grid and crosshair under the pointer on the career door; a red streak that leans after the pointer on the client door. |
| 02 | Selected work (`#work`) | Four projects, uneven: a large lead, a lower second card, a compact third, a wide fourth. | The picture tilts and its three drawing layers slide against each other. Text never moves. |
| 03 | What I build (`#build`) | Four blocks of different shape and tint, each with a drawing of its own. | Websites fan out, the application's flow runs, the phone is tapped, the integrations pass data. |
| 04 | About (`#about`) | One statement, three words in outline, the owner's sentence, the tools this site is built with. | A red spotlight lights the letters of the word under the pointer. |
| 05 | The Lab (`#lab`) | Three saturated tiles (carbon, Racing Red, deep cobalt), the same in either theme. | Dots swell and turn red, shapes melt into each other, five easings chase the pointer. |
| 06 | Ways to work together (`#services`) | Build is the large dark card, Launch and Grow flank it, Care is a wider card. | A faint red wash under the pointer. |
| 07 | Closing call to action (`#start`) | "VALÓSÍTSUK MEG." at display size on Racing Red, black type and a black button. | The fan of lines behind it leans. |

**Dark and light rhythm.** `Section` gives a band its own `data-theme`: `base` (the page's), `inverse` (the other one), or fixed `dark`/`light`. From the first band on, every band is the opposite of the one above it in both themes, and the last is Racing Red; `home/rhythm.ts` is the one place that says so and `home.test.ts` checks it. The top edges are cut on the brand's diagonal (`slant`).

**Editing the content.** The words are in the dictionaries under `home.*` (all three languages, checked for equal keys and equal list lengths). The structure is in `src/content/`:

| File | What to edit |
| --- | --- |
| `projects.ts` | Per project: name, status (`live`, `demo`, `in-progress`, `concept`), technology tags, composition, sketch, a real screenshot (`image`), a details route (`detailPath`), a live demo address (`demoUrl`). A card links when `detailPath` or `demoUrl` is set; without a details page it says so in words. A test refuses `live` without a demo address, a demo address on a concept, and a details route that is not a registered page. |
| `offerings.ts` | The areas in "What I build". Remove one to hide its block. |
| `packages.ts` | Launch, Grow, Build, Care: their words (tagline, who it is for, the kinds of project it suits, what it can include), price (`quote` until a real figure exists; `{ kind: 'from', amount, currency }` publishes one), VAT treatment, a note under the price, a deadline range, and which is featured. The home page and the services page both read it. |
| `lab.ts` | The experiments, their status and, once one really works, its `demoUrl`. |
| `about/` | The About page's story, principles, technologies and focus (see "About page" below), and "what this site is built with", which is read from this site's own `package.json`. The home page's About band no longer carries a story or a skills list of its own: a button leads to the About page. |

**Project facts, and where they came from.** The brief's descriptions were starting points, so the status and technologies were checked against the projects' own repositories next to this one: Spendly (its README calls it WALLEX; a "production-style portfolio project": Django REST, React 19, Expo, PostgreSQL, Docker), BookingHub (`Bookingsite/booking-app`: Next.js 16, React 19, TypeScript, Tailwind; demo credentials and browser-local storage), Logistics Platform (`Logextic`: "a portfolio / demo project, not used in production"; FastAPI, React 19, PostgreSQL, React Native, Docker). None says it is live, so they carry the new `demo` status ("Demóprojekt"), not `live`. No repository for Hollandia Kezdőknek was found, so it stays on the most cautious status (`concept`) with no technology tags until you set them. These mappings are my reading of the folder names: confirm them.

**Pictures.** A project without a screenshot shows a generated concept sketch (line-and-block drawings with no words or numbers in them), captioned "Koncepcióvázlat" so it cannot pass for a screenshot. Real screenshots exist in `Spendly/docs/screenshots` and `Logextic/docs/screenshots`, but they show the names WALLEX and Logextic, so they were not copied: put one in `public/` and set `image` once the names are decided.

**Calls to action.** Every route link goes to a registered page (`/contact`) and every in-page link to a band that exists (`#work`); `home.test.ts` reads the sources and fails on anything else. The package buttons are the exception: they open the quote request on the services page with that package chosen (`/services?package=build#quote`). The home page's client door opens the contact form with a web project chosen (`/contact?for=clients`). The other calls to action go to `/contact`, which is the contact page now; the closing band shows a `mailto:` link as soon as `contact.email` is set in `config/site.ts`. Work and Lab are still the translated "coming soon" page.

**Interaction rules.** Only a mouse or pen drives the pointer effects (`usePointerField` writes `--mx --my --px --py` on the element, one write per frame); a finger never does, so touch sees every composition at rest with all text, status and tags on screen. Reduced motion switches the pointer effects, the entrance (`Reveal`) and the glide of in-page jumps off. Content that is already on screen is never hidden for an entrance.

**Verified** (embedded Chromium; desktop and emulated phone sizes): no horizontal overflow at 1920, 1440, 1024, 768, 390, 360 and 320 px; no text spilling out of its box or cut by a clipping parent in Hungarian at 320 to 1920 px, in Dutch (the longest text) at 320 to 1920 px and in English at 320 to 1440 px (the first pass of that check missed clipped text, and the strict one then found four real problems, all fixed: a category badge wider than its card, a title wider than its column, a squeezed Care card, a Dutch word breaking mid-word); both themes; the intro followed by the page, with one canvas; the keyboard order (nine real links, no focusable hidden link) and visible focus rings in the light door and on the red band; the `#work` jump and the `/contact` link; hover depth on cards, doors and lab tiles; the production build (no development notes, no console output). The suite is 404 tests; the new ones cover content, tones, contrast, link targets and the pointer maths.

**Not verified.** Safari and Firefox; real phones and touch hardware; screen readers; the `prefers-reduced-motion` CSS (the script side was reasoned, not run, because the embedded browser cannot emulate the setting); forced-colours mode (rules are written, not seen); slow or 60 Hz hardware for the new sections.

## Project pages

`/hu/work/spendly`, `/hu/work/bookinghub` and `/hu/work/logistics-platform` (and the same under `/en/` and `/nl/`) are written from the projects' own repositories next to this one, not from the brief. Hollandia Kezdőknek has no page: no repository for it was found, so its card on the home page says "the details page is not ready yet" and links nowhere, and the previous/next links skip it.

**Every page has the same eight bands, in the same order** (overview, the challenge, the approach, technical architecture, key features, design decisions, lessons and next steps, gallery), alternating dark and light like the home page; a band with nothing behind it is left out. What differs is each project's identity: its accent (Spendly red, BookingHub cobalt, Logistics ink), its hero composition (a tilted screenshot bleeding off the right, a wide screenshot under the name, a smaller one floating over a route) and a backdrop drawn from the subject (rising bars, a month grid, a route with stops). The picture leans towards a mouse, as on the home page; a finger never moves it.

**What a page says, and how it is kept honest**

- Features are *built*, *partly working* or *planned*, told apart by an outline and a word, not by colour. A part of the architecture or a connection that is only a plan is dashed and says so; every part appears in at least one connection (a test), and the connections are also written out as the diagram's text version.
- Each challenge names where it is documented in the project (for example `docs/code-review.md · H1`). Only problems that the repositories document are shown, with the fix they document.
- A list of what the project does not do comes from its own limitations or its code. "What I learned" is empty on purpose: it is the owner's to write (a test asserts it is empty, so adding some is a deliberate edit). The role line says "a single-author project", which is what the git history of each repository shows (one author in all of them).
- Spendly is called WALLEX in its repository and screenshots (Spendly was its earlier name); the page says so. The Logistics Platform is called Logextic there.
- Tests refuse invented figures (10K+, 99.9 %, ratings), demo credentials, key-like strings, a `live` project without an address and a demo link on a concept.

**Where the facts came from, and where the code disagrees with a README.** Spendly and the Logistics Platform: their READMEs and `docs/` (code review, design system, architecture, known limitations), checked against the code's structure; their test suites were not re-run. BookingHub: its code and git history, because its README overstates: it says "Next.js 15" (it is 16), says the theme follows the system setting (it only remembers a toggle), lists an `/api/test` route (there is none) and calls the sign-in secure (it is a fixed demo account checked in the browser). BookingHub's pictures are screenshots of a *copy* of the running app (with no e-mail key, so nothing could be sent), and its landing page is left out on purpose: its "10K+ users, 99.9 % uptime, 4.9/5" are placeholder marketing text.

**Editing.** Change a page in `content/projectDetails/<name>.ts`: every text is a `tri(hu, en, nl)`, so a missing translation does not compile. To publish a project, add its file, register it in `projectDetails/index.ts` and `meta.ts`, and give the project in `content/projects.ts` a `detailPath` (`/work/<slug>`); the route, the previous/next links, the language switch and the title all follow. A real screenshot goes in `public/projects/<slug>/` as WebP; `projectDetails.test.ts` reads each file's header and fails if its size differs from what the data says or if it is over 300 KB (a gallery over 1 MB fails too). Open Graph tags are written by script per page and language (`routes/documentMeta.ts`); a crawler that does not run scripts sees only the site-wide tags in `index.html`.

**Verified** (Chrome driven by Playwright against the dev server and the production build, plus the embedded browser): no horizontal overflow, text spilling or clipping on any of the three pages in Hungarian, English and Dutch at 320, 360, 390, 768, 1024, 1120, 1440 and 1920 px, in both themes (it found and fixed one: a Dutch heading wider than a 320 px screen); the lightbox by keyboard (Enter, arrows, Escape, focus returns to the thumbnail) and by tap and click outside; every control in the page has an accessible name and stays in the tab order; previous/next, back to the portfolio and the language switch keep the project and its page (the intro does not return); Work stays current in the header on a project page; reduced motion (nothing hidden for an entrance, no pointer tilt, no transitions, no gliding jumps); a touch screen; the pictures blocked (text intact, no script error); no WebGL on these pages; the production build (deep links, all pictures load with alt text, no failed request, no development notes). 472 tests.

**Not verified.** Safari, Firefox, real phones and a screen reader; that the projects' claims are *true* beyond what their documentation and code structure show (their tests and apps were not run, except BookingHub's app, whose screens were opened); forced-colours mode (written, not seen).

## Services page

`/hu/services`, `/en/services`, `/nl/services`: seven bands under the page's own hero, in this order, each reachable by its anchor: the hero, **the four areas of work** (`#areas`), **the four packages** (`#packages`), **the quote request** (`#quote`), **how we work** (`#process`), **the questions** (`#faq`) and the closing call to action (`#start`). They alternate dark and light like the home page and the last one is Racing Red (`components/services/rhythm.ts`, checked by `services.test.ts`). The hero's light field is a few SVG lines and a gradient, not the WebGL scene: nothing plays by itself, a mouse makes it lean a little, a finger or "reduce motion" leaves it still.

**What is edited where**

| What | Where |
| --- | --- |
| The four packages: words, price, VAT, deadline | `src/content/packages.ts` (also read by the home page) |
| The four service areas: name, summary, the list of what they can include, an example project | `src/content/services/areas.ts` |
| The five steps and the note under them | `src/content/services/process.ts` |
| The six questions and answers | `src/content/services/faq.ts` |
| The page's labels, the form's questions, hints and error messages | `servicesPage.*` in `src/i18n/locales/*.ts` (types make a missing translation a build error) |
| Where the request is sent, and whether the acknowledgement box is required | `src/config/quote.ts` |
| The privacy notice's page, the e-mail address | `src/config/site.ts` (`legal`, `contact.email`) |

**Prices are configuration.** Every package asks for a custom quote ("The price depends on the scope of the project.") until you decide otherwise. To publish one, in `packages.ts`:

```ts
price: { kind: 'from', amount: 1200, currency: 'EUR' },   // 'EUR' or 'HUF'
vat: 'excluded',                                          // 'excluded' | 'included' | 'exempt'
quoteRequired: true,                                      // keeps "the exact amount is given in the quote"
priceNote: tri('…', '…', '…'),                            // optional sentence under the price
timeline: { kind: 'estimate', min: 2, max: 4, unit: 'weeks' }, // optional; shown as an estimate the quote confirms
```

A test refuses a published price whose VAT treatment is `unspecified`. The wording is the same on the home page's cards. No discount, original price, percentage or "most popular" exists anywhere, and a test reads all the page's text in three languages to keep it so (it also refuses a stated length of time, "guarantee", "unlimited" and superlatives).

**The package picker** is one group of radio buttons: the whole card is the target, the arrow keys move between cards, and the chosen card changes its frame, shows a tick and says "Chosen" in words, so colour is not the only signal. Every card carries the same five rows in the same order (who it is for, what it suits, what it can include, price, timeline); on wide screens CSS subgrid lines the rows up across the four cards. Build carries more weight (a red edge, a raised face) and no claim about popularity. Nothing is shown only on hover; hover lifts a card by 2 px at most.

**The quote request** asks the seven questions of the brief in four steps (project and package; description and an existing site; budget and timing, both optional; name, e-mail and an optional phone number, with a summary and the acknowledgement). What is asked is the minimum: a first name and an e-mail address. A step is checked when the visitor moves on; the first wrong answer takes focus, every message is a sentence with an icon and is tied to its field, and a message goes away as soon as the answer is right. Answers survive going back and forth, and survive a language switch. They are held in memory only: no storage, no cookie, nothing in the address bar (a test reads the sources for it). The package chosen in the picker, the kind of project chosen in a service block and a package in the address (`?package=build`, which the home page's buttons use) all arrive in the form already filled in.

**Sending is the one place that decides what is true** (`src/forms/submit.ts`, shared with the contact form):

- With no endpoint configured (today's state), the form says so before the first question, and its last step offers the summary to copy (and, once `contact.email` is set, to open as an e-mail draft that only leaves when the visitor sends it there). It shows no success message, ever, because nothing was sent.
- With `VITE_QUOTE_ENDPOINT` set at build time to an https address, the request is POSTed there as JSON (`language`, `projectType`, `package`, `description`, `reference`, `budget`, `timing`, `name`, `email`, `phone`; no cookies, no referrer). Only a 2xx answer counts as sent; any other answer, a network failure or no answer within 12 seconds is reported as a failure, the answers stay in the form, and the page says which. A double click sends once. After a real success the draft is cleared. The handler must allow cross-origin POSTs from this site (CORS) and should validate and rate-limit on its side.

**Before launch** the owner has to decide or supply: the prices, VAT treatment and any deadline range; whether each service's list and each package's contents are what they will take on (they are starting copy built from the brief's lists and from what the portfolio projects show); the answers in the FAQ (kept general on purpose); the endpoint or form service, and where the requests are received; the privacy notice (its page, `legal` in `site.ts`, and whether the acknowledgement box is required); the e-mail address; and a decision about the brand name, which is still "Your Name".

**Verified** (Chrome driven by Playwright against the dev server and the production build; a local stand-in for the endpoint for the sending paths): no horizontal overflow, text spilling or clipping at 320, 360, 390, 768, 1024, 1120, 1440 and 1920 px in Hungarian, English and Dutch, in both themes; the picker by mouse, arrow keys and touch; the whole form by keyboard and mouse (errors, focus, going back, the summary and the copy button); a real POST, a 500, a 422, a request that never answers (given up after 12 s) and a double click against the stand-in; the language switch (query, hash and answers kept); the hand-over from the home page; reduced motion; the production build in all three languages (titles, descriptions and Open Graph tags, deep links, no console output, no failed request, no development notes). The suite is 602 tests, including the whole page rendered in three languages.

**Not verified.** Safari and Firefox; real phones; a screen reader (the markup uses native radios, fieldsets, labels and `details`, but it was not listened to); forced-colours mode (written, not seen); a real form service or backend (none exists yet); the Open Graph tags for a crawler that does not run scripts, which sees only the site-wide ones in `index.html`.

## About page

`/hu/about`, `/en/about`, `/nl/about`: the statement ("Nem csak kódot írok. Digitális élményeket építek."), then four bands and a closing call to action, each reachable by its anchor: **the story** (`#story`), **how I work** (`#approach`), **the technologies** (`#skills`), **the current focus** (`#focus`) and the closing band (`#start`, Racing Red, a static composition: it does not repeat the intro). The bands alternate dark and light like the other pages (`components/about/rhythm.ts`, checked by `about.test.ts`). The hero's second line is drawn in outline and a mouse over it lights a red disc inside the letters; the speed lines behind it are the faint echo of the Velocity Field. A touch screen and "reduce motion" see them still.

**What is edited where**

| What | Where |
| --- | --- |
| The working title, the three paragraphs, the closing thought and the seven transferable skills | `src/content/about/story.ts` |
| The four principles (Understand, Design, Build, Refine) and the sentence about the loop | `src/content/about/approach.ts` |
| The technologies, their groups and (optionally) a level word for each | `src/content/about/skills.ts` |
| The current focus topics, each switched on or off with `active` | `src/content/about/focus.ts` |
| The page's labels and the hero and closing words | `aboutPage.*` in `src/i18n/locales/*.ts` |

**Honesty rules.** The story rests on two facts the owner gave: they worked in logistics and turned to IT and software development on purpose. It names no employer, no period, no result and no anecdote, and the seven skills (problem solving, seeing the whole process, organisation, client communication, teamwork, systems thinking, continuous learning) are described as ways of working, not achievements. Tests refuse a year, a number of years, a percentage, a score, a certificate, an exam, an employer's legal form and a claimed result in any language, and any e-mail address or link in the words. The technologies are shown as names only: no bar, no percentage, no years. `level` is `null` for every one, so no level appears; set `'learning'`, `'working'` or `'confident'` on a technology and the matching word ("Learning", "Working with it", "Confident with it") appears beside its name (a test expects `null` until you decide, and says so). There are no logos: they would need the makers' artwork in one consistent style, used as each allows; a test keeps the data to a name and a level. The focus lists directions, not mastery: `data` ("data-driven solutions") ships hidden because nothing in the portfolio shows it clearly; the other six are backed by the projects in `content/projectDetails/`, and the owner has the last word.

## Contact page

`/hu/contact`, `/en/contact`, `/nl/contact`: a hero ("Van egy jó ötleted?") with **two doors**, for employers and for clients, and **one form** (`#message`) that both lead to. The doors are the same pieces as the home page's two doors (`components/home/PathDoors.tsx`), with new words. A door jumps to the form and starts it on its topic (a job opportunity, a web development project) with a subject to begin from; the subject follows the topic and the language until the visitor writes their own, and is never overwritten after that. `?for=employers` and `?for=clients` in the address do the same, and the home page's client door uses it. The answers are kept in memory only, so they survive a language switch and are gone on reload. No storage, no cookie.

**The form** asks for a name, an e-mail address, what it is about (a job opportunity, collaboration, a web development project, something else), a subject, a message and, where `config/contact.ts` says so, an acknowledgement of how the data is used (linked to the privacy notice once `legal` in `site.ts` has a path). It is checked when it is sent; the first wrong answer takes focus, each message is a sentence tied to its field, and it goes away as soon as the answer is right. While sending, the button is disabled and the form is marked busy.

**Whether it really sends** is decided by one place, `src/forms/submit.ts`, the same transport as the quote request's:

- With no endpoint (today), the form says so before the first field, and its button reads "Prepare summary": it shows what would have been sent, to copy (and, once `contact.email` is set, to open as an e-mail draft that only leaves when the visitor sends it). No success message appears, because nothing was sent.
- With `VITE_CONTACT_ENDPOINT` set at build time to an https address, the message is POSTed there as JSON (`form: 'contact'`, `language`, `kind`, `name`, `email`, `subject`, `message`; no cookies, no referrer). Only a 2xx answer counts as sent; any other answer, a network failure or no answer within 12 seconds is a failure that keeps the message and says so. A double click sends once. Both forms may use the same address: every payload names its form (`'contact'` or `'quote'`).

**Links.** `src/config/links.ts` turns `site.ts` into the links the page shows: the e-mail address first (a `mailto:`), then each profile that has an address. Nothing is shown for an entry that is still `null`; in development a muted note says where to set them. A profile opens in a new tab with `rel="noopener noreferrer"` and says so to screen readers. To add a professional profile, add `{ id, label, url }` to `social` in `site.ts`; it then appears here and in the footer. No address, profile id or URL is written anywhere in the code or the words (tests read the sources and the dictionaries for it).

**Before launch** the owner has to supply: the real name (still "Your Name"), the e-mail address, the GitHub and LinkedIn addresses, any other professional profile, the endpoint that receives the messages, the privacy notice (its page, and whether the acknowledgement box is required), their confirmation of the story, the technology levels and which focus topics are current, and a photograph if one is wanted (none is shown).

**Verified** (Chrome driven by Playwright against the dev server and the production build; a local stand-in for the endpoint for the sending paths): no horizontal overflow, text spilling or clipping on the home, services, About and contact pages at 320, 360, 390, 768, 1024, 1120, 1440 and 1920 px in Hungarian, English and Dutch, in both themes (it found and fixed one: the contact doors' sentence-length titles spilled out of their doors); the doors, the form, the errors and focus, the language switch with the draft and the subject, a real POST, a 500, a double click, the deep links, reduced motion and a touch screen; the production build in all three languages (titles, descriptions, Open Graph tags, no console output, no failed request, no development notes); the configured links (checked once with example addresses set temporarily, then removed). The suite covers the About content's honesty rules, the form's validation, the transport, the links and both pages rendered in three languages.

**Not verified.** Safari and Firefox; real phones; a screen reader (the markup uses native radios, fieldsets, labels and lists, but it was not listened to); forced-colours mode (written, not seen); a real form service or backend (none exists yet); the Open Graph tags for a crawler that does not run scripts.
