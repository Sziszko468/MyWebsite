# Controlled Chaos — portfolio

React + TypeScript + Vite. Racing Red edition: Dark and Light themes, three languages (hu default, en, nl).

```bash
npm run dev        # dev server; /hu/design-system shows every token and component
npm run build      # type-check + production build
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm test           # vitest: contrast, i18n parity, page registry, language switching, theme, hero logic and geometry
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
| `src/components/hero/` | The Home hero ("Velocity Engine"): HTML layer, static fallback and the lazily loaded Three.js scene. See below. |
| `src/pages/` | Home, placeholder pages, 404. `DesignSystemPage` exists in dev builds only. |
| `src/config/site.ts` | Brand name, monogram, contact email, social profiles, legal pages. Every `null` is a placeholder. |

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

## The hero ("Velocity Engine")

`src/components/hero/`. Headline, description and both buttons are plain HTML above the scene, so they read and work from the first paint. Strings are in `hero.*` of the dictionaries; the second button reuses `cta.startProject`; both buttons are real links (`/work`, `/contact`).

| File | Role |
| --- | --- |
| `VelocityHero.tsx`, `.module.scss` | The section: HTML layer, scrim, layout, mode decision (scene or fallback), quality tier, watchdog callbacks. |
| `VelocityHeroFallback.tsx` | Static SVG version of the same world. Shows while the scene loads, with no WebGL 2, on reduced motion, after a failure or context loss. |
| `VelocityHeroScene.tsx` | The R3F canvas, the master clock (`Runtime`), palette easing, frame-rate watchdog, context-loss handling. Lazy-loaded: Three.js is its own chunk. |
| `Track`, `RacingLines`, `ParticleField`, `RacingCar`, `EnvironmentLighting`, `RacingCamera`, `Bloom` | Scene parts. Each builds its Three.js objects once per quality tier and frees them on unmount (`usePart`). |
| `velocityHeroConfig.ts` | Everything tunable: quality tiers, camera poses, track path, light streaks, composition. |
| `heroTimeline.ts` | The choreography as a pure function of time: ignition, launch, acceleration, cruise, plus the scroll transition. |
| `heroPalette.ts`, `heroUniforms.ts` | Reads the `--scene-*` tokens for the active theme and eases the scene towards them. |
| `heroGeometry.ts`, `heroShaders.ts`, `heroMaterials.ts` | Ribbon and loft builders, GLSL, shared materials and textures. |
| `capabilities.ts`, `useHeroInputs.ts` | WebGL 2 and reduced-motion detection; cursor, scroll and click written to a ref, never to state. |

- **Theme:** the scene reads the one global theme (`useTheme`) and the `--scene-*` tokens in `tokens.css`. A theme change eases colours, light levels and the additive/alpha blend; it does not restart the run or reset the camera.
- **Layout:** CSS decides (`--hero-layout`): stacked below `lg` (text first, the scene as its own stage below it), full from `lg` up (scene behind the text, car to the right). The camera reads it back.
- **Quality:** `pickQuality` chooses high, medium or low from cores, memory, pointer type, width and save-data. A watchdog lowers the tier after two slow windows of frames and gives up (static fallback) if even the lowest tier is unusable. Bloom is high tier only.
- **Pausing:** rendering stops while the hero is off screen or the tab is hidden, and resumes on return.
- **Reduced motion:** the scene is not mounted at all; the static graphic stays. It reacts live if the setting changes.
- **Development aids** (stripped from production): `?hero=fallback` forces the static graphic, `?hero=high|medium|low` forces a tier, and `window.__hero` exposes the rig, camera and renderer.
- **Assets:** none. The car, the track, the environment and the textures are generated in code; no model, texture or HDR image is downloaded.

