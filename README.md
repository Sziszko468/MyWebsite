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
| `src/content/` | The editable data: projects, areas of work, packages, lab experiments. Mostly structure; the words are in the dictionaries, or beside the data in three languages (`tri(hu, en, nl)`). |
| `src/content/lab.ts`, `src/content/labText.ts` | The Lab's list of its five experiments (name, number, status, technology, one-line description) and the words of its pages in three languages. See "The Lab" below. |
| `src/components/lab/` | The Lab: the shared graphics core (`core/`), the interface (`ui/`, `experience/`), the overview page (`page/`), the hidden racing experience (`easter/`), the saved works (`artifacts/`) and one folder per experience (`experiments/`). See "The Lab" below. |
| `src/content/about/` | The About page's personal content: the story and the seven transferable skills (`story.ts`), the four principles (`approach.ts`), the technologies (`skills.ts`), the current focus (`focus.ts`), each with its text in three languages side by side. See "About page" below. |
| `src/content/projectDetails/` | The project pages' content (`spendly.ts`, `bookinghub.ts`, `logistics.ts`), each with its text in Hungarian, English and Dutch side by side (`tri(hu, en, nl)`), and `meta.ts` for their titles and descriptions. See "Project pages" below. |
| `src/components/project/`, `src/pages/ProjectPage.tsx` | One page component for every project: the hero, the eight bands, the architecture diagram, the gallery with its lightbox, the previous/next links. Loaded as its own chunk. |
| `public/projects/<slug>/` | The optimised screenshots (WebP, at most 1440 px wide). |
| `src/content/services/` | The shop's catalogue and its editable content: `ids.ts` (services, needs, plans), `areas.ts` (the four service areas), `detail.ts` (each service's product page: promise, overview, benefits, deliverables, audience, related projects, questions), `addons.ts` (the optional extras), `process.ts` (the five steps, what happens after an inquiry, how we communicate), `faq.ts` (the six questions), each with its text in three languages side by side. The packages are in `src/content/packages.ts`, shared with the home page. See "Shop" below. |
| `src/content/shop/` | The shop's interface words in three languages (`tri(hu, en, nl)`): `common.ts` (names, price wording, announcements), `landing.ts`, `detail.ts`, `configurator.ts`, `cart.ts`, and `meta.ts` (page titles, kept small so the page frame can read them). |
| `src/shop/` | The shop without any screen: the cart (`cart.ts`, `cartStore.ts`), prices (`pricing.ts`), the inquiry's rules and the request that is sent (`inquiry.ts`, `inquiryStore.ts`), search, paths and the way through the builder. Plain functions, tested without a browser. |
| `src/components/shop/`, `src/pages/ServicesPage.tsx`, `ServiceDetailPage.tsx`, `ConfiguratorPage.tsx`, `CartPage.tsx` | The shop's screens: hero, discovery, package selector and comparison, service pages, the request builder, the cart, the header's cart link, the sticky bar. Each page is loaded as its own chunk. |
| `src/components/form/` | The form fields (labels, hints, errors and radio groups wired for assistive technology) and the result panels, shared by the request builder and the contact form. |
| `src/contact/` | The contact message without any screen: the types, the validation rules and the error wording. |
| `src/forms/` | What the forms share: `submit.ts` (the transport that sends a request, or says it cannot), `validate.ts` (e-mail and phone checks), `mailto.ts`. |
| `src/components/about/`, `src/components/contact/`, `src/pages/AboutPage.tsx`, `src/pages/ContactPage.tsx` | The About page's bands and the contact page's hero, doors, form and links. Each page is loaded as its own chunk. |
| `src/components/PageHero/` | The shell of a page's first screen (eyebrow, headline, sentence, buttons over a faint light field), used by the About and contact pages (the shop has its own hero). |
| `src/pages/` | Home, the shop's four pages, About, contact, project pages, the Lab and its experiments, a placeholder page (Work), 404. `DesignSystemPage` exists in dev builds only. |
| `src/config/site.ts` | Brand name, monogram, contact email, social profiles, legal pages. Every `null` is a placeholder. |
| `src/config/links.ts`, `src/config/contact.ts` | The links the contact page shows (read from `site.ts`), and where the contact message is sent. |
| `src/config/quote.ts` | Where the request builder's inquiry is sent (`VITE_QUOTE_ENDPOINT`) and whether the visitor has to tick the acknowledgement of how the data is used. |
| `src/config/intro.ts` | When the intro appears (`first-visit`, `every-session`, `never`), whether visitors can skip it, how long the exit lasts. |

## Conventions

- **Colours:** components use semantic tokens (`--color-*`), never hex values. Raw brand colours (`--brand-*`) are for tokens and decorative art.
- **Themes:** `data-theme="dark|light"` on `<html>`. Dark is the default. The choice is stored in `localStorage` under `theme`; without one, the system setting applies. The semantic token blocks are selected by `[data-theme]` alone, so any element can carry a theme of its own: that is how a band of the home page is light on a dark page (see `Section`).
- **Strings:** every UI string comes from `src/i18n/locales/*`. `hu.ts` defines the shape, so `en.ts` and `nl.ts` fail to compile when a key is missing or extra.
- **URLs:** `/hu/`, `/en/`, `/nl/`; `/` redirects to `/hu/`. Slugs are the same in every language. The language switcher keeps the current page, query and hash; a page with no translation in the chosen language links to that language's home page, and opening such a page directly redirects to its Hungarian version.
- **Adding a page:** add it to `src/routes/pages.ts` and to `PAGE_ELEMENTS` in `src/App.tsx`. Add its label to `nav` in the dictionaries if it belongs in the navigation.
- **Placeholders:** Work currently renders `PlaceholderPage`. Social profiles and legal links without a real address are hidden in production and shown as muted labels in development; they never render as links.
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
| 05 | The Lab (`#lab`) | Three saturated tiles (carbon, Racing Red, deep cobalt), the same in either theme, each a link to its experiment, and a button into the Lab. | Dots swell and turn red, shapes melt into each other, type stretches towards the pointer. |
| 06 | Ways to work together (`#services`) | Build is the large dark card, Launch and Grow flank it, Care is a wider card. | A faint red wash under the pointer. |
| 07 | Closing call to action (`#start`) | "VALÓSÍTSUK MEG." at display size on Racing Red, black type and a black button. | The fan of lines behind it leans. |

**Dark and light rhythm.** `Section` gives a band its own `data-theme`: `base` (the page's), `inverse` (the other one), or fixed `dark`/`light`. From the first band on, every band is the opposite of the one above it in both themes, and the last is Racing Red; `home/rhythm.ts` is the one place that says so and `home.test.ts` checks it. The top edges are cut on the brand's diagonal (`slant`).

**Editing the content.** The words are in the dictionaries under `home.*` (all three languages, checked for equal keys and equal list lengths). The structure is in `src/content/`:

| File | What to edit |
| --- | --- |
| `projects.ts` | Per project: name, status (`live`, `demo`, `in-progress`, `concept`), technology tags, composition, sketch, a real screenshot (`image`), a details route (`detailPath`), a live demo address (`demoUrl`). A card links when `detailPath` or `demoUrl` is set; without a details page it says so in words. A test refuses `live` without a demo address, a demo address on a concept, and a details route that is not a registered page. |
| `offerings.ts` | The areas in "What I build". Remove one to hide its block. |
| `packages.ts` | Launch, Grow, Build, Care: their words (tagline, who it is for, the kinds of project it suits, what it can include), price (`quote` until a real figure exists; `{ kind: 'from', amount, currency }` publishes one), VAT treatment, a note under the price, a deadline range, and which is featured. The home page and the services page both read it. |
| `lab.ts` | The Lab's experiments: number, name, one-line description, status (`ready`, `in-progress`, `concept`), technology. Only a `ready` experiment has a page. |
| `about/` | The About page's story, principles, technologies and focus (see "About page" below), and "what this site is built with", which is read from this site's own `package.json`. The home page's About band no longer carries a story or a skills list of its own: a button leads to the About page. |

**Project facts, and where they came from.** The brief's descriptions were starting points, so the status and technologies were checked against the projects' own repositories next to this one: Spendly (its README calls it WALLEX; a "production-style portfolio project": Django REST, React 19, Expo, PostgreSQL, Docker), BookingHub (`Bookingsite/booking-app`: Next.js 16, React 19, TypeScript, Tailwind; demo credentials and browser-local storage), Logistics Platform (`Logextic`: "a portfolio / demo project, not used in production"; FastAPI, React 19, PostgreSQL, React Native, Docker). None says it is live, so they carry the new `demo` status ("Demóprojekt"), not `live`. No repository for Hollandia Kezdőknek was found, so it stays on the most cautious status (`concept`) with no technology tags until you set them. These mappings are my reading of the folder names: confirm them.

**Pictures.** A project without a screenshot shows a generated concept sketch (line-and-block drawings with no words or numbers in them), captioned "Koncepcióvázlat" so it cannot pass for a screenshot. Real screenshots exist in `Spendly/docs/screenshots` and `Logextic/docs/screenshots`, but they show the names WALLEX and Logextic, so they were not copied: put one in `public/` and set `image` once the names are decided.

**Calls to action.** Every route link goes to a registered page (`/contact`) and every in-page link to a band that exists (`#work`); `home.test.ts` reads the sources and fails on anything else. The package buttons are the exception: they open the quote request on the services page with that package chosen (`/services?package=build#quote`). The home page's client door opens the contact form with a web project chosen (`/contact?for=clients`). The other calls to action go to `/contact`, which is the contact page now; the closing band shows a `mailto:` link as soon as `contact.email` is set in `config/site.ts`. Work is still the translated "coming soon" page; the Lab is built (see "The Lab").

**Interaction rules.** Only a mouse or pen drives the pointer effects (`usePointerField` writes `--mx --my --px --py` on the element, one write per frame); a finger never does, so touch sees every composition at rest with all text, status and tags on screen. Reduced motion switches the pointer effects, the entrance (`Reveal`) and the glide of in-page jumps off. Content that is already on screen is never hidden for an entrance.

**Verified** (embedded Chromium; desktop and emulated phone sizes): no horizontal overflow at 1920, 1440, 1024, 768, 390, 360 and 320 px; no text spilling out of its box or cut by a clipping parent in Hungarian at 320 to 1920 px, in Dutch (the longest text) at 320 to 1920 px and in English at 320 to 1440 px (the first pass of that check missed clipped text, and the strict one then found four real problems, all fixed: a category badge wider than its card, a title wider than its column, a squeezed Care card, a Dutch word breaking mid-word); both themes; the intro followed by the page, with one canvas; the keyboard order (nine real links, no focusable hidden link) and visible focus rings in the light door and on the red band; the `#work` jump and the `/contact` link; hover depth on cards, doors and lab tiles; the production build (no development notes, no console output). The suite is 404 tests; the new ones cover content, tones, contrast, link targets and the pointer maths.

**Not verified.** Safari and Firefox; real phones and touch hardware; screen readers; the `prefers-reduced-motion` CSS (the script side was reasoned, not run, because the embedded browser cannot emulate the setting); forced-colours mode (rules are written, not seen); slow or 60 Hz hardware for the new sections.

## The Lab

An experimental digital playground: **exactly five interactive experiences**, a redesigned overview page, a hidden racing experience that opens somebody else's website, and the visitor's own saved work. Everything in it is real: nothing is a placeholder dressed as a demo, and an experiment that is not ready has no page and no demo (its entry in `content/lab.ts` says so with its status).

**What was removed.** Twice on the owner's orders. First (the brief asked for six and nothing else): Model Studio, Track Architect, Performance Lab, the Racing Experience as a card, and the two experiences added after them (the Generative Art Engine and the Sound Reactive World), together with the Lab's 3D "four zones" home, the experience points and achievements, and every model they exclusively owned. Then, on 2026-11-01, **Generative Objects**: the whole experience (its Quick builder, its AI creation with the Meshy adapter, the prompt writer, voice input and viewer), its server (`server/ai3d/`, the `npm run ai3d` script and the Vite plugin that served it), its dependency (`@anthropic-ai/sdk`), its settings file (`.env.example`), its four pictures, its place on the overview (the featured block and the large tile) and the `creation` kind of saved work. It is in git history (the commit before its removal is `9275457`). Shared code was checked before it was deleted and what the five still use stayed: the graphics core, the saved-works store (now of two kinds: `typography`, `material`), the handoff slot and the local storage helpers. The frame, stage, orbit camera, studio environment, small store and frame context that only the removed experience used (`experience/ExperienceFrame.tsx`, `ExperienceStage.tsx`, `orbit.ts`, `environment.ts`, `store.ts`, `context.ts` and the frame's and stage's styles) went too, on the owner's say-so; `experience/` keeps the handoff slot, the local storage helpers, the small interface pieces and `useMedia`.

### Routes and navigation

| Path | What |
| --- | --- |
| `/:lang/lab` | The overview (below). Keeps the site's own header. |
| `/:lang/lab/<id>` | One experiment: `particle-universe`, `liquid-matter`, `type-in-motion`, `infinite-space`, `chromatic-distortion`. It replaces the site header and footer with the Lab's own navigation (leave for the portfolio, all experiments, previous, next) and carries the language and theme switches. |

There is no route for the racing experience: it is a layer on `/lab` (below). All of it is real routes, so Back and Forward, a new tab and a shared address work.

### How it is built

- **One list drives everything.** `src/content/lab.ts` lists the five; the routes (`routes/pages.ts`), the dock, the previous/next links, the document titles, the overview and the home page's teaser are all derived from it. Words are `tri(hu, en, nl)` triples, so a missing translation fails the build. The experiments' names and the line "MOVE. DISTORT. EXPLORE." stay in English.
- **Page first, scene second.** Each page is plain DOM that loads first; Three.js, the shaders and the scene are further chunks. The overview uses only 2D canvases (no WebGL), so the way into the experiments never waits for a GPU.
- **`components/lab/core/`** is the shared graphics core: one react-three-fiber canvas with a pixel budget, a frame cap, a frame-rate watchdog, context-loss handling and a shader warm-up; the stage (input, still picture, error boundary, pausing off screen and in a hidden tab); one eased pointer/finger/keyboard signal; the live/calm/still views; the quality tiers; `useStageCapture` (a picture drawn again inside a frame, so it is never blank).
- **No React re-render from the pointer, ever.** The pointer, the clock, the palette and each experiment's controls are plain mutable objects the scene reads every frame.
- **The scenes allocate nothing per frame** and release what they own (geometry, materials, textures and render targets are disposed when a scene goes).

### The overview (`/lab`, `components/lab/page/`)

1. **Hero**: carbon black with Racing Red, a field of speed lines (a 2D canvas that leans to the pointer and quickens near it), the headline "ENTER THE EXPERIMENTAL SIDE." (Hungarian "LÉPJ BE A KÍSÉRLETI DIGITÁLIS VILÁGBA.") in letters that stretch and lift towards a mouse (a finger sees it still), the line "Five interactive environments. Endless possibilities. One digital playground." and the way in (`START WITH THE FIRST`, the five experiences). Plain markup: nothing here waits for WebGL.
2. **Discovery**: not five equal cards. The first is large; each of the other four has its own size, its own accent and a live miniature that answers a mouse, a pen or a finger (particles that flee or gather, metaballs that follow, letters that stretch, a tunnel that quickens, red/green/blue that pull apart). The miniatures are small 2D canvases that draw only while on screen and in a visible tab (a single still picture, redrawn only when touched, under reduced motion).
3. **Why a Lab** (six principles), **the visitor's saved works** (below), and the closing band "THE ONLY LIMIT IS WHAT YOU CAN IMAGINE." with `START EXPERIMENTING`.

### The five experiences

| | Experience | What is real |
| --- | --- | --- |
| 01 | Particle Universe | Up to 36,000 particles (tier-scaled; a density slider scales it) simulated on the CPU in typed arrays: springs to a shape (sphere, ring, wave, spiral, a mark), a pointer force that attracts or repels, a flow-field grid the pointer stirs like a fluid, a click burst the structure re-forms from. Controls: shape, attract/repel, **force**, **speed** (the simulation's clock), density, intensity, **five colour palettes**, burst, **randomise**, reset, save image (PNG). |
| 02 | Liquid Matter | A sphere displaced in the vertex shader by noise, the pointer's dent and a travelling wave per click. Four states of matter are one shading model (mirror chrome, soft clay, glass that refracts the studio into three colours, glowing lava). Controls: state, deformation, flow, **colour** (recolours the light the surface gives back, keeping its shadows and glints), light, pulse, **random material**, reset; PNG and keeping the work. |
| 03 | Type in Motion | **Any words** (up to 36 letters, set one word to a line, at most four lines, made safe to set: capitals, no markup or control characters) in four typefaces (wide, condensed, serif, mono), set into a glyph texture, cut into one quad per letter and stacked into layers for real 3D extrusion. Each letter is a spring-driven body that tilts and lifts near the pointer. Controls: text, three ready-made sentences, typeface, **size**, **letter colour**, **six motion presets** (still, drift, wave, pulse, orbit, glitch), **animation speed**, extrusion depth, distortion, break apart, scatter, random style, reset; PNG and keeping the work. |
| 04 | Infinite Space | A tunnel of light streaks, planes, rings and dust positioned in the vertex shader from a wrapped depth. The pointer turns the camera; its speed stretches the streaks and widens the lens; a click sends a pulse. Controls: own drift, **movement intensity**, **pattern** (all, streaks, rings, planes), **palette**, streak length, pulse, **warp jump**, reset, save image. |
| 05 | Chromatic Distortion | One full-screen fragment shader: signed-distance forms evaluated three times, once per colour channel, at different offsets. Controls: channel separation, background waves, lens, **direction of the colour displacement**, **glitch**, **noise**, surge, **randomise**, reset, **screenshot (PNG)**. The glitch only slips horizontal slices sideways, at most three changes a second, and nothing flashes; it is off under reduced motion. |

### The hidden racing experience (`components/lab/easter/`)

Not in the navigation, not in the list, not a seventh card. It takes the visitor to **https://nfsu2.xyz/**, in the same tab, straight after a short transition: there is no screen in between to click through.

- **The transition**: a Racing Red wipe with speed lines covers the screen, says "ENTERING THE PIT LANE" and (small) that it is going to nfsu2.xyz, an external website; after 1.25 s (0.3 s under reduced motion, where it is a plain red screen) the whole tab goes there. It is a modal dialog while it is up: the page behind does not scroll, the focus is on it, Tab stays put. **Escape stays here** (and returns the focus to the red dot), so the visitor can still change their mind within the transition.
- **The way there** (`leaveFor`): a link that is created and clicked, with `rel="noreferrer noopener"`, so the other site is told nothing about where the visitor came from (checked: the navigation request has no `Referer`) and gets no handle on this page. Back from nfsu2.xyz returns to the Lab with the transition put away (also when the browser restores the page from its back-forward cache: a `pageshow` handler closes it); the red dot works again.
- **No frame, on purpose.** nfsu2.xyz answers `x-frame-options: DENY` and a `content-security-policy` with `frame-src 'none'; frame-ancestors 'none'` (read with `curl -I`, 2026-11-01), so no browser will show it inside this page, and this site does not work round that. An earlier version of the experience had a designed fallback screen and a sandboxed frame path; both were removed when the owner asked for the direct transfer, so there is no warning screen and no iframe code left. This site never reads, scripts or proxies the other page.
- **Finding it**: the full stop at the end of the Lab headline is a red button that pulses faster than anything else, with a finger-sized (44 px) hit area; or type N F S U 2 on the Lab page (ignored while typing in a field or with a shortcut key held). A small hint at the end of "Why a Lab?" says one red dot is faster than the rest.

### Saved works (`components/lab/artifacts/`)

The visitor's work, in IndexedDB (a memory store, announced as such, where the browser has none): typography artworks (the words, typeface, size, colour, motion, speed, depth, distortion, broken or not) and material presets (state, deformation, flow, light, colour). No account, no server. Each has a picture, can be renamed, opened in its experiment (the settings travel through a one-slot handoff, read without being emptied and emptied by the page in an effect), downloaded as JSON (and PNG), and deleted after a confirmation. Every reader clamps numbers, drops unknown fields and refuses what it does not know; version 1 typography works (one of three sentences) and material presets (no colour) still open. A browser that kept 3D creations from the removed experience still holds them in IndexedDB; the store no longer lists or opens them (a work of an unknown kind is dropped when it is read).

### Quality, performance and the fallbacks

- **Three views** (the Display switch): *Live*, *Calm* (the default under `prefers-reduced-motion`: smaller motion, nothing moves by itself, the canvas draws only while something changes, and every control still works) and *Still* (no WebGL: a picture and the page's text).
- **Adaptive:** the first tier comes from the device and the frame-time watchdog corrects it (resolution first, then the tier; at the lowest tier a scene that cannot hold a frame rate gives way to the still view with a button to try again). Shadows are off on the lowest tier. When the stage restarts after a tier change, its api is waited for, so a click on *Save* or *GLB* in that moment is not lost.
- **Fallbacks:** no WebGL 2 → the still view with a notice; a scene that throws or a chunk that does not load → the still picture or a way back; a lost context → a notice and automatic restore.
- **Development switches** (ignored in production): `?lab=still|high|medium|low`.

### Accessibility

Real links and native inputs throughout; every control has a visible label; the stage is a focusable group (arrow keys and + − move the camera); focus is visible; the canvas is never the only source of information (Type in Motion gives its sentence as text); live regions announce a save and an export; the hero headline has one accessible name and its decorative letters are hidden; dialogs trap focus and close with Escape; touch targets are at least 44 px on coarse pointers.

### Tests and checks

**Automated** (`npx vitest run`: 852 tests in 39 files, all passing; `tsc -b`, `oxlint` and `npm run build` are clean; the production bundle was searched for the removed experience's words and for any engine or key name: none): the saved-work readers (round trips, damage, clamping, refusal of what they do not know); the type text helpers and motion presets (bounded, finite, the glitch at most three changes a second); the particle, liquid, space and chromatic controls; the hidden experience (the destination, the transition's length, the link it leaves through, the keyboard sequence, the words); the Lab's list (exactly five, in order, the removed ones nowhere), the routes and the three languages of every text.

**In Chrome** (Playwright with the system Chrome, headless, on software WebGL and on this PC's graphics card): the new controls of the five experiences, each saving a non-blank picture; the rest of the portfolio again after this removal (every page in three languages with no console output, the header, Back, the language switch on the overview and on an experiment, the theme switch, the overview offering exactly five ways in, each of the five opening with its title and a canvas, the dock walking 05 to 01, **the seven removed addresses, `generative-objects` among them, now the 404 page**, no failed request); a layout matrix of 11 sizes (1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 430×932, 390×844, 360×800, 320×568, and 844×390 and 932×430 lying down) for the overview in three languages and both themes (66 states: horizontal overflow, clipped text, a word cut in two, overlapping regions and small targets, all clean); the hidden experience (21 checks: the transition and its words in three languages, no buttons or links in it, the whole tab going to the real nfsu2.xyz after about 1.2 s with no referrer, Back returning to the Lab with the page scrolling again and the dot working a second time, Escape staying and returning the focus, the keyboard sequence, a field ignoring it, reduced motion, 390×844, 320×568, 844×390 and 768×1024; run before this removal and untouched by it).

**Found by these checks and fixed:** Escape did not close the hidden layer during its transition (the focus was outside it): it listens on the document and takes the focus from the first moment; the red full stop was far smaller than a finger: it has an invisible 44 px hit area; a mouse click on a button laid over a 3D stage never arrived (the camera controller captured the pointer): it now ignores presses that start on a button, link or field.

**Not verified** (be aware): real phones and tablets and real touch hardware (touch was emulated, taps were synthetic); frame rates on real devices (the checks ran in headless Chrome on a desktop PC, on its graphics card or on software WebGL); Safari and Firefox; a screen reader; any physical device. Under software rendering the Lab's frame-rate watchdog now and then swaps the stage for "The live view stopped"; that is the watchdog doing its job, and the browser scripts press Try again as a visitor would.

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

## Shop

The services page grew into a small shop for services (PROMPT 09, "Premium Shop 2.0"). It sells nothing by itself: **the checkout is an inquiry**. There is no payment provider and no price anywhere, because none has been approved; every package, service and add-on reads "Custom Quote" (`Egyedi ajánlat`, `Offerte op maat`), and the cart is the way to put an inquiry together.

### Pages

| Address | Page |
| --- | --- |
| `/hu/services`, `/en/services`, `/nl/services` | **The front page.** A hero ("BUILD SOMETHING THAT MATTERS." / "ALKOSSUNK VALAMI MARADANDÓT." / the Dutch line, two buttons, and the four services as tiles that are also links), **discovery** (`#services`: the four services as cards, one search over services, packages and add-ons with a filter by type, "clear all filters" and an empty state), **the four packages** (`#packages`), **a way into the request builder** (`#configure`), **process, what happens after an inquiry, how we communicate** (`#process`), **support options** (`#support`), **real work** (`#work`), **the questions** (`#faq`) and the closing call (`#start`). The bands alternate dark and light and the last one is Racing Red (`components/shop/rhythm.ts`, checked by `shop.test.ts`). |
| `/services/website`, `/webapp`, `/ui`, `/integrations` | **A product page per service**, with the eleven sections of the brief in order: hero, overview, what you get, key features, who it is for, how it works, available add-ons, related projects, questions, pricing or custom quote, closing call. On a phone a sticky "Request a quote" bar follows (see below). |
| `/services/configure` | **The request builder**: six steps (need, package, extras, details, review, request). |
| `/services/cart` | **The cart.** |

All four are separate chunks (`App.tsx`); none loads Three.js or any 3D code, and none opens with the intro (`shouldShowIntro` skips it for any address under `/services`, without using it up: the next visit to the home page still shows it).

### What is edited where

| What | Where |
| --- | --- |
| The four packages: words, price, VAT, deadline, what they suit, main deliverables, scope, customisation, support, which add-ons they allow | `src/content/packages.ts` (also read by the home page) |
| The four services: name, summary, what they can include, an example | `src/content/services/areas.ts` |
| Each service's product page: promise, overview, benefits, typical projects, what you get, who it is for, the note in "how it works", packages first offered, related projects, its own questions | `src/content/services/detail.ts` |
| The add-ons: name, summary, which needs they apply to, price | `src/content/services/addons.ts` |
| The five steps, what happens after an inquiry, communication and collaboration | `src/content/services/process.ts` |
| The questions (shared ones are picked per service by id) | `src/content/services/faq.ts` |
| All interface words (labels, validation messages, cart and confirmation texts) | `src/content/shop/*.ts`, three languages side by side (`tri(hu, en, nl)`); a missing translation is a build error |
| Where the inquiry is sent, and whether the acknowledgement box is required | `src/config/quote.ts` (`VITE_QUOTE_ENDPOINT`) |
| The privacy notice's page, the e-mail address | `src/config/site.ts` (`legal`, `contact.email`) |

**Prices are configuration.** To publish one, in `packages.ts` (or `addons.ts`):

```ts
price: { kind: 'from', amount: 1200, currency: 'EUR' },   // 'EUR' or 'HUF'
vat: 'excluded',                                          // 'excluded' | 'included' | 'exempt'
quoteRequired: true,                                      // keeps "the exact amount is given in the quote"
timeline: { kind: 'estimate', min: 2, max: 4, unit: 'weeks' }, // optional; shown as an estimate the quote confirms
```

The cart then tells the parts apart without any other change: a line whose package has a published price is a **fixed-price product** (its own group, a cobalt edge and label, its amount in the summary, totals per currency with the VAT wording or "mixed"), every other line is a **custom-quoted service**, and an add-on is labelled **add-on**. A test (`shop.test.ts`, "what the cart is worth") exercises that with invented prices that are not in the shipped content. Another reads every text of the shop in three languages and refuses a currency amount, a percentage, a stated length of time, "guarantee", "unlimited", superlatives, "testimonial" and "most popular".

### The package selector and the comparison

Four tiles (radio buttons, so the arrow keys move between them) choose which package the stage below presents in full: who it is for, main deliverables, what can be included, what it suits, optional extras, price status, timeline and the way to start. Each package has its own mark and accent (Launch and Build in Racing Red, Grow in Cobalt, Care neutral); Build carries more visual weight and the page says that it is design, not popularity. A custom project is offered for anything that fits none. **Compare packages** opens a comparison (included services, project scope, customisation, available extras, support, price, timeline) in which any packages can be switched off down to two. It is one markup restyled by width: columns from 64 rem, and on a phone one card per topic with the package's name on every cell. There is no table wider than the screen.

### The request builder

Six steps, one question group per screen on a phone: **need** (new website, web application, existing website improvement, UI implementation, API integration, not sure yet; several may be chosen), **package** (Launch, Grow, Build, Care or a custom project, per service, with the packages that suit a service marked "suggested"), **extras** (only the add-ons that apply to the chosen service), **details** (the description is the only required question; main goal, existing site, timing and requirements are optional), **review** (every selection with a way to change it, "add another service") and **request** (name, e-mail, optional phone, acknowledgement). A progress line and bar (steps listed from 48 rem) and Back/Next are always there; the finished steps are buttons. The choices are the cart's: they survive going back, another page, a reload and a language change. The answers (description, name, e-mail…) live in memory only (`inquiryStore.ts`): no storage, no cookie, nothing in the address bar. A step is checked when the visitor moves on; the first wrong answer takes focus and every message is a sentence with an icon tied to its field. Back and Next sit at the end of each step, in the flow of the card (on a narrow phone Back is the arrow alone, so Next has room for its words); they are deliberately not stuck to the screen, because a fixed bar sits on top of the fields it belongs to (the layout matrix found exactly that).

**Sending is the one place that decides what is true** (`src/forms/submit.ts`, shared with the contact form):

- With no endpoint configured (today's state), the builder says so before the first question, and its last step offers the summary to copy (and, once `contact.email` is set, to open as an e-mail draft that only leaves when the visitor sends it there). It shows no success message, ever, because nothing was sent.
- With `VITE_QUOTE_ENDPOINT` set at build time to an https address, the request is POSTed there as JSON, version 2: `{ form: 'quote', version: 2, language, items: [{ need, plan, extras }], description, objective, reference, timing, requirements, name, email, phone }` (empty answers are `null`; no cookies, no referrer). **This replaces the earlier single `projectType` / `package` / `budget` payload**; a handler written for that one has to be updated. Only a 2xx answer counts as sent; any other answer, a network failure or no answer within 12 seconds is reported as a failure, the answers and the cart stay, and the page says which. After a real success the cart and the answers are cleared and the page says what happens next. The handler must allow cross-origin POSTs from this site (CORS) and should validate and rate-limit on its side.

### The cart

The cart (`shop/cart.ts`, `cartStore.ts`) holds lines: a service (or "existing website improvement", or "not sure yet"), a package or custom project, and its add-ons; a service appears once. It is kept in this browser's `localStorage` under one key (`cc-shop-cart-v1`), read defensively and shared between tabs; it holds choices only, never a name or a message. Add a service from a card or a product page (the button then says "In your cart" with a tick and links to the cart; a screen reader is told by a live region), change its package and add-ons in place, remove it ("removed, Undo" for nine seconds), clear the cart (asks first, inline), continue browsing, or proceed to the inquiry (the builder opens on the next open question). Lines are grouped by price class. On a wide screen the summary is a sticky panel beside the lines; on a phone it is a collapsible block on top and the main action is a bar at the bottom that leaves when the footer comes into view. No payment is taken or imitated.

### Mobile

Not a scaled desktop: the header shows the cart (when it has something, and always inside the shop) beside the menu button; the mobile menu carries the four categories, packages, the builder, search (opens the search box with the cursor in it) and the cart, then the theme and language switches, all at least 44 px tall; breadcrumbs collapse to one obvious back link with an arrow; choices are 56 px cards, not small check boxes or drop-downs; the product page has a sticky "Request a quote" bar that appears only after the hero, leaves while the price band, the closing band or the footer is on screen, clears the home indicator (`env(safe-area-inset-bottom)`), is inert while hidden, and widens `scroll-padding-bottom` while shown so a focused field is never behind it.

### Motion and loading

Fast and purposeful: the headline's two lines rise in 0.4 s (the words are in the page from the first paint), a chosen package's stage slides in, accordions open on a grid-row transition, a ticked choice pops, the cart count nudges, a new cart line slides in, a pointer leans the hero tiles and cards a few pixels. All durations are the tokens in `tokens.css`, which collapse to nothing under `prefers-reduced-motion`; a test reads the stylesheets for it. While a page's code arrives a slim moving bar shows (`ShopFallback`) and the submit button says "Sending…". There are no photographs in the shop (the drawings are the same small SVGs as the home page), so there is nothing to size, serve responsively or lazy-load; the pages themselves are lazy chunks.

### Before launch

The owner has to decide or supply: the prices, VAT treatment and any deadline range; whether each service, package and add-on is something they will take on (the lists are starting copy built from the brief and from what the portfolio projects show, and the words about "what you get", "who it is for" and the questions are to be read and confirmed); **whether to offer a CMS integration** (the brief listed it, nothing on the portfolio shows it, so it is not offered; add an entry in `addons.ts` and to the packages that allow it); the endpoint or form service (and updating its handler to the version 2 payload); the privacy notice (its page, `legal` in `site.ts`, whether the acknowledgement box is required, and whether a note about the cart's `localStorage` belongs in it); the e-mail address; the brand name, which is still "Your Name".

### Tests and what was checked

All browser checks below are **Chrome driven by Playwright on one PC: emulated viewports and synthetic touch, not physical devices.** No physical phone or tablet, Safari, Firefox or screen reader was used.

**Unit and render tests** (`npm test`, 914 tests in 39 files; 852 before this work): the cart's rules (one line per service, add-ons only where they apply, undo, defensive reading of a saved cart), prices with invented published prices (the shipped content has none), search in each language (accents, case, ranking, filters), the inquiry's validation, request shape and summary, the content guards (no price, percentage, duration, guarantee, superlative or testimonial in any of the three languages; the same placeholders in every language), every shop page rendered to markup in three languages (a service page ×4, each builder step, the cart with items), the page registry, document titles, the intro skip for shop addresses, the contrast of the colour pairs the shop uses in both themes, and a read of the sources and stylesheets (no storage but the cart's, no console output, no 3D import, durations that collapse under reduced motion).

**The customer journey** (23 steps, against a dev server whose endpoint is a local stand-in that can answer 200, answer 500, drop the connection or never answer): open the shop; browse the categories (search, type filter, clear all, empty state); open a service page (all eleven sections); change language (HU, NL, EN) and see the document language follow; change theme; choose a package and add-ons; add to cart (button state, badge, saved cart, the screen-reader announcement); selections survive a reload and a language change; modify the cart (package, add-ons, summary); remove, undo, clear with confirmation; back and forward in the browser; review in the builder and change an answer from the review; validation errors (message, `aria-invalid`, focus, going away once fixed, nothing sent while invalid); a real submission (the payload is checked field by field, the confirmation appears only after the 200, the cart is cleared only then); a 500 and a dropped connection (honest message, answers and cart kept, no success, a retry works); a request that never answers (the page says so after 12 s); keyboard (Space, Tab, Enter, arrow keys in a radio group, a visible focus ring, focus moves to the new step's heading); a first-time visitor on a shop address gets no intro and loads no 3D code, while the home page still shows the intro; on a phone: the menu with the shop group, search with the cursor in the box, one back link, the sticky "Request a quote" bar (hidden at the top, shown mid-page, hidden over the price band and at the footer), the whole builder by touch up to a real send, the cart (no horizontal scroll, remove and change package by touch). Result: 23 of 23 (two earlier runs lost steps to the dev server being busy and to assertions that read the old page while a lazy page was still arriving; both were fixed in the script, not in the shop).

**Responsive matrix** (552 checks: 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 1024×1366, 430×932, 390×844, 360×800, 320×640, and landscape 844×390 and 932×430; both themes; the front page, two service pages and the cart in Hungarian, English and Dutch; the builder's six steps in English at every size and in all three languages at 1440 and at 430 px and below): **no horizontal overflow, nothing past the viewport edge, no clipped text, no text under 12 px, no touch target under 32 px.** What it found and what was done: the builder's sticky Back/Next bar sat on top of fields on phones (now in the flow of the card); link targets of 21 to 30 px (breadcrumb, card titles, project names, language switch in the menu: now 44 px); a 15 to 27 letter word broken in the middle in Hungarian and Dutch headings, buttons and cart lines (a second check that looks for words split across two lines found 86 of them; after shortening a few labels, sizing the service title and card names to their longest word, letting the cart line wrap and making Back an arrow on a narrow phone there are none at 320 and 360 px, and none were found at 390, 430 and 768 px). What it still lists is measurement noise or by design: the visually hidden skip link and links that have scrolled under the sticky header after a step change, and on a 320×640 screen the cart's mobile bar over the first line's Remove button until the page is scrolled (the bar leaves when the footer comes into view).

**Accessibility, automated:** axe-core 4.11.1 with the WCAG 2.0, 2.1 and 2.2 A and AA and best-practice rules, 76 audits (front page, service page, cart and every builder step, including the error states, in English; the first builder step in Hungarian and Dutch; both themes; 1440 and 390 px): no violations, after fixing one it found (two navigation landmarks named "Language", in the header and the footer; the footer's now has its own name). axe finds only part of the problems: it says nothing about how a screen reader sounds.

**Production build** (`vite preview`): the seven shop addresses in three languages, 21 pages: a title and description in the page's language, `og:title` equal to the title, `lang`, exactly one `h1`, no console output of any kind, no failed or 4xx request, no intro dialog, no Three.js request. Page chunks (gzip): front page 6.5 kB, service page 3.2 kB, builder 4.1 kB, cart 2.8 kB, the shop's words in three languages 14.5 kB (shared); the main bundle is 129 kB gzip.

**Speed, emulated** (4× CPU slowdown, about 1.6 Mbit/s and 150 ms latency, production build): largest contentful paint about 2.7 to 3.3 s, cumulative layout shift 0.002 to 0.062 (it was 0.14 to 0.28 until the loading placeholder was made a screen tall, so the footer no longer jumps when the page arrives), longest task 90 to 310 ms. These are numbers from one PC, not from a phone.

**An unknown address** under `/services` (for example `/services/nothing-here`) shows the site's 404 page.

**Motion:** the headline rises in 0.42 s, a package's stage in 0.24 s; under `prefers-reduced-motion` every duration is 0.01 ms (checked in the browser, and by a test over the stylesheets).

**Not verified.** A physical phone or tablet (the sticky bars and the on-screen keyboard in particular); Safari and Firefox; a screen reader (the markup uses native radios, checkboxes, fieldsets, labels, live regions and a button-controlled region, but it was not listened to); forced-colours mode (the decorative layers are removed, not seen); a real endpoint (none exists; the stand-in is a script); the Hungarian and Dutch copy by a native reader (it was written alongside the English and has not been proofread).

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
