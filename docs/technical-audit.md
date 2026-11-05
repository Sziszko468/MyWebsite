# Technical audit: search, speed, accessibility, security (PROMPT 11)

Done on 2026-11-02 against the production build. This file says what was found, what was changed, what was measured and what could **not** be checked. Every number below was produced by a script in `tools/audit/` (see its README) or by `npm test` / `npm run build` / `npm run check:seo`; none is estimated, and no Lighthouse score is quoted because Lighthouse was not run (see "Limits").

**Read this first.** Three things the brief assumed are not true of this repository, and were not "fixed" by inventing them:

- There is **no Meshy integration, no backend, no AI generation and no "generative object" event.** The Generative Objects experience was deleted on 2026-11-01 (README, "The Lab"), and with it the Meshy server code. The Lab has **five** experiences, not six. The key-exposure review therefore found no key anywhere (the built files were searched for key patterns); authentication, rate limiting, upload endpoints, CORS configuration and AI-provider security do not exist here to be reviewed, and the checklist in the README says where they must be handled (on the form handler the owner connects).
- The "hidden Racing Experience" **was**, when this audit was made (2026-11-02), a link that took the whole tab to `https://nfsu2.xyz/` with `noreferrer noopener` (since the PROMPT 15 pass it shows a screen with OPEN NFSU2, a new-tab link, and a way back: see the README, "The hidden racing experience"); the site never frames it (that site forbids framing, and the Content-Security-Policy would refuse a frame anyway).
- The brand is still "Your Name", no domain is configured and no contact address is set. SEO output that needs them (canonical addresses, hreflang, sitemap, structured data about a person) is **switched on by configuration**, not guessed: set `VITE_SITE_URL`. Until then every page says `noindex, nofollow`.

## 1. Issues found

| # | Finding | Evidence | Status |
| --- | --- | --- | --- |
| 1 | Every route was served the same `index.html`: one Hungarian title and description, no canonical address, no `hreflang`, no Open Graph image, no structured data; the per-page head existed only after script ran. | Read `index.html`, `routes/LanguageLayout.tsx`. | Fixed: one HTML file per page and language with its own head (§2). |
| 2 | No sitemap, no robots.txt, no social image, no way to say where the site lives. | `public/` held only a favicon and screenshots. | Fixed. |
| 3 | **Stale claims about a deleted feature**: the Lab's meta description (all three languages) and the home page's Lab paragraph still advertised "six experiences" and "a generator that builds a 3D object from one sentence". | Found while reading `content/labText.ts`; grep for "six", "generator". | Fixed in hu/en/nl; a test refuses these words in the Lab and home descriptions. |
| 4 | The Lab experiments' meta descriptions were their taglines (30–60 characters); the Work placeholder reused the home page's description (duplicate); both are poor search snippets. | Unit test over every page and language (`seo/seo.test.ts`). | Fixed: one-sentence summaries (`content/labMeta.ts`); Work is `noindex` while it is a placeholder. |
| 5 | The intro (a full-screen modal with a 3D scene) opened on the first visit to **any** page except the shop: a visitor arriving on a project or the About page from a search result got a modal, and paid about 250 kB (gzip) of Three.js code and a long task for it. | `vitals.cjs`, first-visit profile (§3). | Fixed: opens only on the home page (`config/intro.ts` `onlyOnHome`, switchable). |
| 6 | The home hero's scene was requested the moment the page mounted and competed with the first screen. | Experiment: with the scene's code blocked, largest paint came ~0.5 s sooner and blocking time fell by a third (emulated phone). | Fixed: it waits until the first screen has settled (`hero/startDeferral.ts`). |
| 7 | No error boundary above the pages: a lazy page whose code fails to arrive (a connection that drops, or files replaced by a new deployment while the page is open) leaves a blank app. | Read `App.tsx`, `routes/LanguageLayout.tsx`. | Fixed: `RouteErrorBoundary` with a localized panel and a reload (verified in the browser, §4). |
| 8 | The 404 page offered only "back home". | Read `pages/NotFoundPage.tsx`. | Fixed: lists the main pages; says `noindex`. |
| 9 | No privacy or cookie notice: the footer's privacy link was `null` and the contact form's consent line linked to nothing. | `config/site.ts`. | Fixed: `/privacy` in three languages, listing every item kept in the browser (a test reads the sources to keep the list true). |
| 10 | No measurement architecture, and no security headers, CSP or caching rules anywhere. | — | Added: consent-gated, provider-independent analytics (off by default); `dist/_headers` with a CSP (§2). |
| 11 | Interaction latency: the theme toggle took 1.15–1.66 s to respond on an emulated phone (a colour transition on every element). | `inp.cjs`, `themeclick.cjs` (§3). | Fixed: View Transitions cross-fade, with fallback. |
| 12 | Contact page: an `<aside>` nested in a landmark (axe best practice), a heading that jumped from `h1` to `h3`, a 21 px-tall "Privacy notice" link (WCAG 2.5.8), and an English line on Hungarian/Dutch pages without `lang`. | axe, the matrix, manual read. | Fixed. |

## 2. What was built

See the README section "Search, speed, accessibility and security" for how each part works and is configured. In short: `src/seo/` (one head function used by the browser and by the build), `scripts/prerender.mjs` and `scripts/check-seo.mjs`, `src/security/headers.ts`, `src/analytics/` and `components/Consent/`, `components/ErrorBoundary/`, `pages/PrivacyPage.tsx`, `hero/startDeferral.ts`, `public/og/default.png`.

## 3. Measured results

Method (all in `tools/audit/vitals.cjs`; each comparison measures the old build and the new one **alternately** on the same quiet machine, two rounds of three runs, because a first baseline taken while other work was running on the machine turned out to be inflated by 10–30 % and was discarded): Chrome 156 (system install) driven by Playwright; "phone" = 390×844 touch emulation, 4× CPU slowdown, 1.6 Mbit/s with 150 ms latency (the same shape as Lighthouse's mobile preset, but **not** Lighthouse), cold cache, median of 3 runs; "desktop" = 1440×900, no throttling. FCP/LCP/CLS from the browser's paint and layout-shift timing; blocking time = the sum of long-task time over 50 ms after first paint (a proxy for Total Blocking Time). Bytes are what crossed the wire, gzip-compressed (the test server speaks plain http, where Chrome does not ask for Brotli; over https with Brotli the script and style figures would be about 15 % smaller). The machine's other load, GPU clocks and timers make single runs vary by a few percent: **differences under about 5 % are noise.**

**Phone, return visit (the intro was seen before)** (emulated phone: 390×844 touch, 4× CPU slowdown, 1.6 Mbit/s and 150 ms; cold cache; the two builds measured alternately, 2 rounds × 3 runs, medians; FCP and longest task are the mean of the two rounds)

| Page | FCP (ms) | LCP (ms) | Blocking time (ms) | Longest task (ms) | JS (kB) | Total (kB) | CLS (max) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/hu/` | 3468 → 3558 | 4524 → 4136 (-9%) | 210 → 277 | 735 → 791 | 405 → 406 | 597 → 599 | 0 → 0 |
| `/hu/services/` | 2968 → 3002 | 4076 → 4140 (+2%) | 441 → 414 | 393 → 391 | 188 → 190 | 389 → 391 | 0 → 0 |
| `/hu/about/` | 2980 → 2998 | 3500 → 3456 (-1%) | 208 → 194 | 335 → 288 | 154 → 156 | 350 → 352 | 0 → 0 |
| `/hu/contact/` | 3052 → 2986 | 3356 → 3356 (+0%) | 123 → 100 | 340 → 286 | 158 → 159 | 355 → 357 | 0 → 0 |
| `/hu/work/spendly/` | 3002 → 2982 | 4120 → 3992 (-3%) | 529 → 420 | 453 → 401 | 198 → 199 | 444 → 446 | 0 → 0 |

**Phone, first visit (the old site opens the intro on every page, the new one only on the home page)** (same method; measured at slash-less addresses, where the static host redirects the new build to the canonical slash form: one extra round trip of ~150 ms is in its FCP and LCP, so these figures are conservative)

| Page | FCP (ms) | LCP (ms) | Blocking time (ms) | Longest task (ms) | JS (kB) | Total (kB) | CLS (max) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/hu/` | 3634 → 3604 | 4696 → 4252 (-9%) | 272 → 251 | 851 → 805 | 405 → 406 | 597 → 599 | 0 → 0 |
| `/hu/about` | 3094 → 3188 | 3548 → 3644 (+3%) | 454 → 203 | 402 → 294 | 408 → 156 | 604 → 352 | 0 → 0 |
| `/hu/lab` | 3126 → 3168 | 4208 → 3596 (-15%) | 439 → 209 | 417 → 313 | 421 → 175 | 617 → 372 | 0 → 0 |
| `/hu/work/spendly` | 3122 → 3172 | 4344 → 4212 (-3%) | 643 → 420 | 414 → 421 | 452 → 199 | 698 → 446 | 0 → 0 |
| `/hu/services` | 3016 → 3176 | 4132 → 4364 (+6%) | 450 → 486 | 400 → 425 | 188 → 190 | 389 → 391 | 0 → 0 |

**Desktop (1440×900, no throttling)** (3 runs, medians)

| Page | FCP (ms) | LCP (ms) | Blocking time (ms) | Longest task (ms) | JS (kB) | Total (kB) | CLS (max) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/hu/` | 1136 → 1156 | 1136 → 1156 (+2%) | 0 → 0 | 178 → 144 | 405 → 406 | 597 → 599 | 0 → 0 |
| `/hu/services` | 1044 → 1032 | 1376 → 1368 (-1%) | 13 → 10 | 69 → 66 | 188 → 190 | 389 → 391 | 0 → 0 |
| `/hu/work/spendly` | 1032 → 1040 | 1376 → 1356 (-1%) | 16 → 15 | 66 → 69 | 198 → 199 | 444 → 446 | 0 → 0 |

What these say, in plain words:

- The first screen on an emulated slow phone takes about 3.1–3.5 s to first paint and 3.5–4.2 s to the largest paint on every page, before and after. Most of that is bytes and script: the main bundle is about 132 kB over the wire as gzip (about 116 kB with Brotli), plus the stylesheet and the preloaded brand font (88 kB), and nothing in this audit changed that much. The largest paint is the page's lead paragraph, which the motion system fades in 0.55–1 s after the headline on purpose; shortening that choreography would lower the number and is a design decision that was **not** made here.
- Where the changes show, honestly: **bytes and blocking time on a first visit to a deep page** (the old site opened the intro, and loaded its Three.js scene, on every page; now it does not: about 250 kB less to download on About, Contact, the Lab overview and a project page, blocking time down by about 55 % on About and the Lab overview and 35 % on a project page, largest paint −15 % on the Lab overview); and **the home page** (largest paint −9 % in both measurement sets; blocking time and the longest task unchanged within noise). **Return visits to every other page are unchanged within noise** (±3 % on largest paint, 0–70 ms on first paint, JavaScript +2 kB): this work did not make those pages faster and does not claim to. Layout shift is 0 everywhere. On desktop everything is within noise.
- **Interaction latency** (what INP measures) was read from real clicks and key presses: on ten pages (up to 14 controls and a few key presses each), the worst interaction was **120 ms on desktop** (a key press on the home page; every other page ≤ 64 ms) and **128 ms on the emulated phone** (opening the menu); the "good" threshold is 200 ms. The one slow control found was the **theme toggle**: 192–208 ms on desktop and **1.15–1.66 s on the emulated phone** before, 32–64 ms and 128–160 ms after. It put a colour transition on every element (about 1300–1600 of them) and restyled them all every frame; it now cross-fades two pictures of the page through the View Transitions API (`theme/theme.ts`), with the old behaviour as the fallback and an instant switch under reduced motion.
- The main bundle grew by about 5 kB (Brotli) for the SEO head, error boundary, consent and analytics code and was brought back by moving the Lab's text out of the page frame (`content/labMeta.ts`): the JavaScript on a typical page is within 2 kB of before. (The Lab's own text moved out of the shared bundle, so Lab pages download about 7 kB more and every other page about 6 kB less than it would have.)
- Tried and **rejected** (measured): a low-priority preload for the brand font (slightly slower), and no preload (first paint ~0.3 s sooner, but the services page shifted by 0.18 in one run): the preload stays.
- Images are WebP at one size (≤ 56 kB each, ≤ 1440 px wide, explicit `width`/`height`, lazy below the fold). No responsive `srcset` variants were made: a phone downloads the 1440 px file (about 50 kB on a project page). This is a known, small remaining cost.

## 4. Test results

All of this ran on 2026-11-02 against builds of the final code (the Vite production build); the checks were re-run after each fix noted in §1.

| Check | Result |
| --- | --- |
| `npm test` (vitest) | **1051 tests in 48 files pass.** New: the head, sitemap, structured data and build files (`seo/seo.test.ts`), analytics and what an event may carry (`analytics/analytics.test.ts`), the privacy notice against the sources (`content/privacy.test.ts`), the scene's start gate, the intro policy. |
| `npm run typecheck` / `npm run lint` | Clean (0 errors, 0 warnings). |
| `npm run build` | Succeeds, with and without `VITE_SITE_URL`. 63 page files + `/` + `404.html` + `robots.txt` + `_headers` (+ `sitemap.xml` when configured). Without the address it warns and writes everything as `noindex`. |
| `npm run check:seo` | Configured: 65 files, 55 indexable (the home page's `/` included) and 10 `noindex`; unique titles and descriptions per language, canonical = own address, hreflang reciprocal with `x-default`, sitemap = the indexable pages, JSON-LD parses and resolves, CSP hashes match. Unconfigured: 65 files, all `noindex`, no canonical, hreflang or JSON-LD. |
| Production pages in a browser (`seo-browser.cjs`) | 64 pages (21 × 3 languages + `/`) loaded **under the real CSP in Chrome 156 and in Edge 156**: no console errors or CSP violations; the head the build wrote is identical after the app ran (title, language, robots, description, canonical, alternates, Open Graph, Twitter, JSON-LD); in-app navigation and the language switch keep the head in step with no duplicated tags; the 404 page and the cart say `noindex`; the intro opens on the home page and not on `/hu/about/`. |
| Accessibility, axe-core 4.11 (`audit-a11y.cjs`) | WCAG 2.0/2.1/2.2 A and AA plus best practice, **126 page views** (21 pages × 3 languages × dark and light): one rule violated (`heading-order` on the contact page, 6 views). Fixed; re-run on contact, privacy, Lab and home in all languages and themes (24 views): **0 violations**. Structure audit (one `h1`, heading order, alt text and `width`/`height` on every image, names on every link and button, labels, duplicate ids, `rel` on external links): nothing left but the aria-hidden whole-card hit areas (intentional) and one label, "Start a project", that leads to three places on the way to one goal (the contact form). |
| Keyboard only (`audit-keyboard.cjs`), 11 pages at 1440×900 and at 390×844 touch | The skip link is the first stop and moves into `main`; every control is reachable (a radio group is one stop, the arrows move inside it); no keyboard trap; every focus stop has a visible indicator (controls that draw it on a card, a tile or a slider thumb were checked by screenshot), is not covered by the sticky header or a bar (WCAG 2.4.11) and is at least 24 × 24 px (2.5.8), except the Lab headline's full stop, which is inline in text. |
| Layout matrix (`audit-matrix.cjs`) | **462 page loads**: all 21 pages at 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 430×932, 390×844, 360×800 and 320×568 (portrait), 932×430, 844×390, 800×360 and 568×320 (landscape), in English dark; Hungarian and Dutch at 320, 390 and 1440; light theme at 390, 768 and 1440. **No sideways scroll, no element outside the viewport, no text under 11.5 px, no upscaled image, no console error.** The matrix found the 21 px privacy link (fixed). |
| WebGL (`webgl.cjs`) | **No WebGL at all** (Chrome with 3D disabled): 20 of 21 pages show their content (the 21st is the Work placeholder, one line by design), the hero shows the generated graphic, the intro opens and its button lets the visitor in, a Lab experience page still has its text and controls, no errors. **Context loss and restore:** the hero falls back to the graphic and recovers; a Lab experience says the graphics context was lost and is restoring, stays up, and its canvas is live again; no uncaught errors. **What loads where:** the shop, About, a project page and the Lab overview load no Three.js; a first visit on About loads none; one experience loads Three.js and only its own scene; the home page loads the hero scene and none of the Lab. |
| Forms, analytics, errors (`devharness.cjs`: dev server, mock endpoints) | Nothing is sent before consent; after it, events carry ids only (`{"project":"bookinghub"}`), no cookie or credential, plain-text body; "No, thanks" (also later, from the footer) stops them; Global Privacy Control means no question and nothing sent; typed text (subject and message) reached the contact endpoint but **never** the collector. The contact form shows success only after a 200; a 500 and a dropped request show "Sending did not work", keep the answers and send no event; a hung request shows the busy state, then a timeout message. A page whose code failed to load shows the error panel (focus on its heading, a reload button, header and footer intact) and navigating on clears it; a failed Lab experience leaves a page with a way back. The consent band fits the screen at 1440, 390 and 320 wide in both themes. |
| Interaction latency (`inp.cjs`, `themeclick.cjs`) | See §3. |
| `npm audit` | 0 vulnerabilities. |
| Secrets | The built files and the sources were searched for key patterns (`sk-…`, `AKIA…`, `AIza…`, private keys, tokens) and for "meshy": none. `.env*` is git-ignored and no env file is tracked. The only environment variables are public form and collector addresses and the site address. |
| External links | Every `target="_blank"` link has `rel="noopener noreferrer"`; the hidden racing link leaves through `noreferrer noopener`; there are no iframes (CSP `frame-src 'none'`). |

Known false alarms of the harness, so nobody chases them: the skip link measured "off screen" in about one run of ten and could not be reproduced when checked directly (it sits at 12 px, 12 px at once); the home page shows each event twice in the dev server only (React StrictMode runs effects twice in development).

## 5. Limits, and decisions left to the owner

- **Not measured: real devices, Safari, Firefox, screen readers, Lighthouse, a real network, real users.** Everything is Chrome 156 (and Edge 156 for the head and CSP checks), emulation, synthetic touch. Firefox and WebKit were not installed here, and downloading them was not done without asking. Core Web Vitals above are **lab** numbers; field data needs real visitors (hence the opt-in measurement).
- The page body is still drawn by script. A crawler that does not run script sees each page's head and a no-script summary; Google and Bing run script. Rendering the body on the server was judged riskier than useful here (the hero, intro and motion system are browser-only).
- Search engines will not list the site until `VITE_SITE_URL` is set; structured data will not name a person until the brand is real; the Work page stays out of the index until it has content; the privacy notice covers what the code does and nothing about what the owner does with a message once it arrives (identity, retention, legal basis are theirs to add; it is not legal advice).
- The measurement endpoint, the contact and quote endpoints are unset: the site measures nothing and sends nothing, and says so. A handler must validate, rate-limit and allow this origin (CORS).
- The Lab headline's red full stop (the hidden racing entry) is a 13–20 px-wide button inside a line of text; it is an inline target (WCAG 2.5.8 exempts those) and has a keyboard route (typing NFSU2).
- The 86 kB Latin-extended font file loads on Hungarian pages (for ő and ű) after first paint.
- Hungarian and Dutch copy was not proofread by a native speaker.
