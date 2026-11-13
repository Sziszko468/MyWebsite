# Frontend audit

Scope: `src/` (666 tracked files), `worker/`, `scripts/`, build configuration. Method: reading the structure, running the project's own gates (typecheck, lint, i18n, 2 149 tests, production build, `check:seo`) and its browser audits (layout matrix, no-WebGL, axe) against the **built** site in a real Chrome. Numbers are from 2026-11-13.

## Architecture

| Topic | Finding |
| --- | --- |
| Structure | `components/` 346 files, `admin/` 86, `content/` 63, `pages/` 34, `i18n/` 24, `shop/` 19, `motion/` 16, `seo/` 11, `config/` 8, `styles/` 7, `analytics/` 7, `routes/` 6, `projects/` 6, `ai/` 6 |
| TypeScript | strict project references (`tsconfig.app.json`, `.node`, `.server`, `.worker`); `tsc -b` exit 0 |
| Build | Vite 8; `npm run build` = `tsc -b` → `i18n:check` → `vite build` → `build:seo` (an SSR build + `scripts/prerender.mjs` writes **91 pages, 404.html, robots.txt, sitemap.xml, `_headers`, `_redirects`**). Build time ≈ 3.5 s for the client bundle |
| Routing | React Router 8.5; `/hu`, `/en`, `/nl` prefixes through `routes/LanguageLayout.tsx`; every page is prerendered, so the site works as static files too |
| State | no state library (no Redux, Zustand, …): React context and hooks, small external stores (cart, request builder, theme). A deliberate fit for this size |
| Styling | SCSS modules, design tokens in `src/styles`, a dark/light theme (`data-theme`, `theme.ts`); Racing Red, Carbon Black, Cobalt Blue, Warm Paper, Graphite all present in the token files |
| Localization | own i18n layer: **2 587 texts × 3 languages from 62 sources**, 2 583 with three different wordings (the other 4 are identical in all three languages on purpose, listed in `src/i18n/quality/allowances.ts`), spelling checked with Hunspell (HU 4 343, EN 2 192, NL 2 761 distinct words, **0 unknown**), a rule that fails CI when a customer-facing word is hard-coded in a component, a placeholder-loss check |
| Animation | `src/motion` (scopes, kinetic type, page frame, magnetic buttons); `prefers-reduced-motion` honoured (audits run with it both ways) |
| Three.js / WebGL | lazy: the shop, About, project pages and the Lab overview load **no** Three.js; the home page loads only the hero scene; one Lab experience loads only its own scene (verified by `webgl.cjs`) |
| Images | responsive variants (`tools/images/make-variants.cjs`), `srcset`, lazy loading, hashed names under `/assets` served `public, max-age=31536000, immutable` (checked live) |
| API communication | `src/config/api.ts` (`VITE_API_URL`; empty = same origin), forms post JSON with a consent flag; the catalogue reaches the site at build time (`npm run catalog:pull`) so static pages stay fast |
| Error handling | `RouteErrorBoundary`, `LanguageLayout`, `AdminApp`, `LabStage`, `SceneLayer` and `LabExperimentPage` have boundaries; a customer page with an unusable link shows "Could not load this page" (observed) |
| Loading states | suspense fallbacks per lazy route, scene posters while WebGL loads; forms show sending / error / success |
| Accessibility | axe-core (WCAG 2.0/2.1/2.2 A and AA) run per page and theme, see [TEST_RESULTS.md](TEST_RESULTS.md); focus rings and keyboard order covered by `audit-keyboard-strict.cjs` in earlier passes |

## Browser results (this audit)

| Check | Result |
| --- | --- |
| Layout matrix, 9 widths (320, 360, 390, 430, 768, 1024, 1366, 1440, 1920) × every page, en, dark | **252 page loads, no horizontal overflow, no element outside the viewport, no console or CSP error**. Two informational lines repeat: "no footer" on the five immersive Lab experience pages (by design: full-screen stage) and one 13–16 px button on `/lab` (the hidden NFSU2 trigger, below) |
| Layout matrix, hu + nl, 320 and 390, light | **112 page loads**, the same two informational lines and nothing else |
| No WebGL at all | **28/28 pages render content**, the hero falls back to a static graphic, the Lab page keeps 1 560 characters of content and controls, the intro opens and lets the visitor in |
| WebGL context loss and restore | hero and a Lab experiment survive: static graphic takes over, no uncaught error, the canvas is live again after restore |
| Where Three.js loads | exactly where intended (see Architecture) |

## Findings

| ID | Severity | Finding | Evidence | Safe to fix now? |
| --- | --- | --- | --- | --- |
| F-1 | Low | The hidden NFSU2 trigger on `/lab` is a 13–16 px target (WCAG 2.5.8 asks for 24 px). It is a deliberate, tiny easter-egg entry (a red full stop); keyboard and typed-sequence access exist | matrix output | No: a design decision of the owner |
| F-2 | Low | 69 hard-coded hex colours outside the token files: mostly `#000` gradient stops, Lab artwork (`LabArt.module.scss`) and the admin's status colours (`admin.css`) | `audit-structure.cjs` | No: refactor with a design pass, no user impact |
| F-3 | Low | Four source files nothing reaches: `src/pages/PlaceholderPage.tsx`, `src/content/profileExport.ts`, `src/content/textsExport.ts`, `src/i18n/quality/run.ts` (`PlaceholderPage.tsx` came in with the first AppShell commit and nothing imports it now; the exports and `run.ts` are probably started by path from `scripts/` or `npm run`, not verified). Ten more are reached only by tests (the i18n quality tooling) | `audit-structure.cjs` | **Not removed**: the brief forbids deleting code that merely looks unused; references by script path were not verified |
| F-4 | Info | `@types/nspell` is reported as an unused dependency; it types `nspell`, which the i18n tooling imports. A false positive | | n/a |
| F-5 | Info | Largest chunks: `events-*.js` 907 kB (240 kB gzip, three.js / R3F), `admin-*.js` 388 kB (109 kB gzip), `main-*.js` 342 kB (121 kB gzip), `PlanPanel-*.js` 263 kB (74 kB gzip, the assistant panel), `ThemeProvider-*.js` 257 kB (82 kB gzip). The large 3D and admin chunks are lazy; the visitor pays for them only on the pages that need them | `npm run build` | n/a |
| F-6 | Info | Direct `localStorage` use is limited to the theme and the admin's collapsed-sidebar flag, both wrapped for private-mode failures | grep | n/a |
| F-7 | Medium | The language of `/` on production is the prerendered Hungarian page for everybody: the edge Worker that would pick the language by country does not run in front of Render (see [INFRASTRUCTURE_AUDIT.md](INFRASTRUCTURE_AUDIT.md)) | live `GET /` with `Accept-Language: en` / `nl` → `<html lang="hu">` | No: a hosting decision |
| F-8 | Medium | **Every page's body is rendered in the browser**: the build prerenders the `<head>` (SEO checks pass) but the body is an empty `<div id="root">` plus a `<noscript>` notice (live `/hu/` is 7 190 bytes, no `<h1>`). A visitor without JavaScript sees only the notice; the first paint and LCP wait for script ([PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md) P-1) | `curl` of the live page, `dist/hu/index.html` | No: a larger change to the SSR entry (own prompt) |

No broken route was found: every built page loaded in the matrix; the 404 page answers status 404 for unknown paths locally and live. No missing translation (the checker fails the build on one).

## What was not verified

Real phones and Safari/Firefox (only desktop Chrome, emulated phone viewports), screen-reader behaviour, the cookie / analytics consent flow against a real endpoint, `VITE_ANALYTICS_ENDPOINT` (unset in the audit), and the second theme's contrast outside the pages axe visited.
