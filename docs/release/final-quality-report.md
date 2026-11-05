# Final quality report: integration, end-to-end testing and production readiness (PROMPT 15)

Done on 2026-11-05 against the code as committed at `d95aefe` plus the changes listed in §3 (nothing of this pass is committed). The method was **audit first, fix second, verify third**: the audit (§2) was made before anything was changed, the fixes (§3) are the ones the audit justified, and §5 says what was run afterwards. Every number below was produced by a command or a browser run named in §5 or in [`tools/e2e`](../../tools/e2e/README.md) / [`tools/audit`](../../tools/audit/README.md); none is estimated. What could **not** be tested is in §7 and is not hidden behind a summary.

The release checklist (every item Verified / Requires manual configuration / Not implemented / Blocked) is [`docs/production/README.md`](../production/README.md).

## A. Overall status

**Not ready for production.**

The engineering is in good shape: the whole suite is green, six end-to-end journeys and a security probe pass against the real backend, accessibility and layout audits are clean, and the defects this pass found were fixed. What blocks a public launch is not code, and it is not minor:

1. **The site still says "Your Name"** and has **no contact address and no profile links** (`src/config/site.ts`): a recruiter who finishes the journey "find contact information" finds a form and nothing else.
2. **`/work` is a "coming soon" page in the main navigation.** The projects are reachable from the home page, but the nav item itself leads to a placeholder.
3. **No domain, no HTTPS, no DNS.** Until `VITE_SITE_URL` is set every page says `noindex`.
4. **E-mail works only as far as the code goes.** Nothing was sent through a real provider, Cloudflare Email Routing was not touched, no SPF/DKIM/DMARC record exists, so no authentication check could pass. Without a provider the owner is **not notified** of a new message (it is stored and shown in the administration).
5. **Owner-written text is missing**: the privacy notice says nothing about who holds a message, for how long and why, or that a mail provider and Cloudflare process it.
6. **The brief and the repository disagree on the Lab** (six experiences against five) and on the racing Easter egg (§6). Decisions, not defects, but they are open.

What moves it to *ready after minor fixes*: items 1–3 and 5 (owner's words and a domain), a real provider with verified DNS (item 4), and the two decisions in §6. None needs new engineering.

## B. Feature status

| Area | Status | Tests performed | Issues found | Fixed | Remaining |
| --- | --- | --- | --- | --- | --- |
| **Home and the intro** (nine sections, Velocity Field intro) | Working | Journeys A and D (first visit, intro opens, entry by click/tap/Enter, no restart on in-app navigation or refresh, Back/Forward); WebGL audit (no WebGL: hero falls back, intro still opens and its entry works; context loss and restore); reduced motion | The WebGL audit's keyboard step was stale (the dialog now opens with focus on its entry button) | Harness fixed, not the site | Safari/Firefox, real phones |
| **Navigation, routing, 404** | Working, one placeholder | 64 built pages under the production CSP (no console error, head unchanged after the app runs); direct URL, refresh, Back/Forward (journey A); 404 page; language switch leads to the equivalent page on all 63 page × language pairs | `/work` is a placeholder | — | Owner: build or hide the Work page |
| **Localisation** (hu/en/nl) | Working | `audit-i18n`: 21 pages × 3 languages in a browser (≈2,080 text blocks per language): no raw key, no unfilled placeholder, `lang` correct, no Hungarian/Dutch text identical to English, switch targets; journey F: validation and failure messages in all three languages, all different | None open | — | Native-speaker proofreading (never done) |
| **Design system** | Consistent | `audit-design`: the five brand colours are the specified values in both themes on 10 pages × 2 sizes; one typeface (Archivo, plus the monospace of code); radii from the token list; surface follows the theme; control sizes | 67 hex colours outside the token files (Lab scenes' own palettes, the administration's own token file, `#000` shadows): cosmetic | — | None blocking |
| **Project pages** (Spendly, BookingHub, Logistics Platform) | Working | Journey A; axe; matrix; the technologies and versions they state were re-read against the three repositories (Django 5.2, React 19, Expo; Next 16.1, React 19, Tailwind 3; FastAPI, Celery, React 19: unchanged, their last commits predate the pages) | A hero-screenshot button had no visible focus ring | Fixed | `WALLEX` vs `Spendly` name undecided; no live URLs; **Hollandia Kezdőknek has no page** (a concept, no repository exists) |
| **The Lab** (five experiences) | Working | Every experience × 3 languages × 7 sizes × reduced/normal motion (210 screens, text overlap); GPU resources released on leaving (geometries, textures, programs 0, context released, no animation frame afterwards: all five); keyboard walk (28/28/33/26/27 stops, no trap); no-WebGL and context-loss; what loads where | Phone layout: the stage hint was hidden under the notice (≤ 430 px, every experience and language); the stage's focus ring was never visible | Both fixed | **Five, not six** (§6) |
| **Hidden racing experience** | Working, behaviour changed | Journey E on desktop and a 390 px phone, and reduced motion (13 steps): activation, loading state, fallback screen, exit, Escape, focus, Tab, scroll lock, no request to nfsu2.xyz, no frame, no navigation away | The brief asks for a fallback screen and an OPEN action; the code redirected the whole tab | Fallback screen built (§6) | The 13–19 px-wide red dot is an inline target (WCAG 2.5.8 exempts it; the keyboard route is N F S U 2) |
| **Services and shop** (landing, four service pages, packages, add-ons, six-step builder, cart) | Working | Journeys B and D end to end; no price on the landing page; the cart survives a refresh; the request reaches the database | None | — | Real prices/deadlines are the owner's; CMS integration deliberately not offered |
| **Contact form and quote requests** | Working with the backend | Journeys B, C, D, F; API answers 201 before the page claims success; failure keeps what was typed; honeypot and limits probed | The website's forms do not send the honeypot field (server supports it) | — | Owner decision on spam protection beyond the per-address limit |
| **Backend, database, API** | Working | 422 backend tests; security probe (44 checks over a real socket); three migrations on an empty and an older database | None | — | Not deployed; backups not scheduled |
| **Administration** | Working | Journey C (13 steps incl. wrong password, status, note, reload, delete asks first, quote, dashboard numbers re-counted per status, service edit → public); 540-view audit (PROMPT 13, not re-run) | The service editor's fields never reached the website | Fixed (§3) | Concurrent edits: last save wins |
| **E-mail** | Working with the `file` provider and a stand-in for the provider's API | Journey B reads the written message (From, To, Reply-To = the visitor, multipart); 101 provider/webhook/check tests; PROMPT 14's real-browser run | — | — | Real provider, Cloudflare, DNS, deliverability: **not done, not claimed** |
| **SEO** | Working, switched off until the address is set | `check:seo` with and without `VITE_SITE_URL` (65 files; 55 indexable, 10 `noindex`; titles, descriptions, canonicals, hreflang, sitemap, structured data, CSP hashes) | — | — | `VITE_SITE_URL`, the real brand name |
| **Accessibility** | Clean on what was tested | axe on 126 page views: 0 violations; keyboard-only walk of 10 pages at 1440 and 390: every stop reached, every focus visible; dialogs' focus (journeys E and C) | Two focus rings invisible (hero screenshot button, Lab stage) | Fixed | Screen readers, forced colours, WCAG compliance is **not** claimed |
| **Performance** | Within the targets measured | §5 | — | — | Phone LCP 3.4–4.2 s on the emulated slow phone (a design choice of the page choreography, measured and unchanged) |
| **Security** | No open finding in what was probed | §5; `npm audit` 0; secret scan of `dist/` and the repository | — | — | §7 |
| **Deployment** | Documented, not packaged | `server:cli check`: unsafe production settings refused (exit 78), a safe set accepted | No Dockerfile/CI/host file (by design: one process) | — | Owner: host, TLS, backups, monitoring |

## C. Technical quality (actual results)

| Check | Result |
| --- | --- |
| `npm test` | **1696 passed, 0 failed, 71 files** (backend 422 in 16 files, administration 208 in 6, website 1066). 1691 before this pass; the new tests are the service overlay (4) and the racing screen (2, replacing one) |
| `tsc -b`, `oxlint` | Clean |
| `npm run build` / `check:seo` | Succeed; 65 files; with an address: 55 indexable, 10 `noindex`, reciprocal hreflang, canonicals, structured data and CSP hashes verified |
| `npm audit` | 0 vulnerabilities (2026-11-05) |
| Structure (`audit-structure`) | 610 source files: **0 unreached files**, 0 unused dependencies; one file only a test reaches (`catalogExport.ts`, used by a script through Vite); no environment variable read by the code is missing from `.env.example` except `ADMIN_PASSWORD` (a one-command CLI variable, documented in the backend README) |
| End-to-end journeys (`tools/e2e/journeys.cjs`, real Chrome, built site served by the real backend, `file` mail provider) | **72 of 72 steps**: A recruiter (12), B client (12), C administrator (12; 13 with the `--rebuild` step, which also passed), D phone (13), E hidden racing experience (13), F localised validation and failure messages (10). The last full run had 71 steps; journey A then gained its theme-switch step (flips the page, survives a reload) and was re-run alone: 12 of 12 |
| Security probe (`tools/e2e/security-probe.mjs`, real server) | **44 of 44**: 35 admin API paths × 5 methods without a session answer only 401/404/405; no account enumeration at sign-in; public endpoints carry no private field; errors are plain JSON with no stack/path/SQL; no CORS grant to a foreign origin or `null`; hostile text stored as text; the cookie is HttpOnly + SameSite=Strict; CSRF token and same-origin enforced; list rows carry no hashes; sign-out invalidates the cookie; a burst against the contact form gets 429 with `Retry-After` |
| axe-core 4.11 (`audit-a11y`) | 126 page views (21 pages × 3 languages × dark/light): **0 violations**; the structure audit's notes are the known intentional ones (aria-hidden whole-card hit areas; one label that leads to three places on the way to the contact form) |
| Keyboard (`audit-keyboard-strict`) | 10 pages at 1440×900 and at 390×844 touch: every stop reached, every focus visible on the control or its card (a radio group is one stop); the five Lab experience pages by a plain Tab walk: all stops reached, order logical, no trap |
| Layout matrix (`audit-matrix`) | **483 page loads** (273 + 126 + 84): the 21 pages at the brief's nine viewports (1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 430×932, 390×844, 360×800, and 320 px as 320×568) and four landscape phones, English dark; Hungarian and Dutch at 1440, 390 and 320; light at 1440, 768, 390 and 320. **No sideways scroll, no element outside the viewport, no upscaled image, no console error.** The only reports: the secret dot (13–20 px wide, an inline target) and the five Lab experience pages having no site footer (the immersive layout, by design) |
| Lab text overlap (`audit-lab-overlap`) | 210 experience screens: no overlap (before the fix it found the hint and the notice overlapping on every experience in every language at 320, 360 and 390 px; the list was cut after 50 lines, 430 px overlapped in the lines seen) |
| WebGL (`webgl.cjs`) | No WebGL: 20 of 21 pages render content (the 21st is the Work placeholder); context loss and restore on the hero and a Lab experiment recover; the shop, About, project pages and the Lab overview load no Three.js; one experience loads only its own scene |
| Three.js cleanup (dev server, `window.__labGl`) | All five experiences: geometries 0, textures 0, programs 0, WebGL context released, 0 animation frames in the second after leaving |
| Core Web Vitals (lab, Chrome 156, production build, `vitals.cjs`, median of 3) | Desktop 1440×900: FCP 1.04–1.37 s, **LCP 1.25–1.42 s**, **CLS 0**, blocking time 0–21 ms on all 8 pages. Emulated phone (390×844 touch, 4× CPU, 150 ms / 1.6 Mbit/s): FCP 3.1–3.8 s, **LCP 3.4–4.2 s**, **CLS 0**, blocking time 94–412 ms |
| Interaction latency (`inp.cjs`) | Worst interaction **80 ms desktop**, **168 ms on the emulated phone** (the Lab overview; was 128 ms in PROMPT 11), threshold 200 ms |
| Page weight over the wire (gzip) | Home 615 kB (Three.js hero scene included), Services 414 kB, About 369 kB, Contact 375 kB, Lab overview 390 kB, a project page 464 kB, a Lab experience 647 kB. The Three.js chunk (240 kB gzip) loads only for the home hero and for one experience |

These are lab numbers on one machine under emulation, not Lighthouse scores and not field data.

## 1. What was inspected

The whole repository: the website (`src/`), the administration (`src/admin/`, `admin.html`), the backend (`server/`), the build and prerender scripts (`scripts/`), the audit tools (`tools/`), the documentation, the environment file, and the three sibling repositories the project pages describe (versions and last commits only). The previous passes' memory of what was and was not verified was read first, and treated as a claim to check, not as a fact.

## 2. Audit (before any change): technical inventory and prioritised issues

### Inventory

| Feature | State at the start | Basis |
| --- | --- | --- |
| Home, nine sections, intro | Implemented and working | Source, journey A/D, audits |
| Routes, language switch, 404, prerendered head | Implemented and working | 64 pages loaded under the real CSP |
| `/work` | **Implemented but incomplete** (translated "coming soon", `noindex`) | `PlaceholderPage` in `App.tsx` |
| Project pages ×3 | Implemented and working | Journey A, repositories re-read |
| Hollandia Kezdőknek | **Not implemented** as a page (a concept card; no repository exists) | `content/projects.ts` |
| Services, shop, cart, builder | Implemented and working; **requires external configuration** to send (`VITE_API_URL`) | Journeys B, D |
| The Lab | Implemented and working, **five** experiences | `content/lab.ts` |
| Hidden racing experience | Implemented and working, but **not as the brief describes it** (redirect, no fallback screen) | `easter/` |
| Contact and quote workflows | Implemented and working through the backend | Journeys B, C, F |
| Backend, database, auth, rate limits | Implemented and working | Tests, probe |
| Administration | Implemented and working; its **service editor was implemented but not connected** to the website | Journey C, `catalogOverlay.ts` |
| E-mail infrastructure | Implemented and working up to the provider; **requires external configuration** (provider, Cloudflare, DNS) | PROMPT 14 |
| Analytics | Implemented, off; requires an endpoint | |
| Deployment configuration | **Not implemented** (no Dockerfile, CI or host file; one process by design) | `docs/backend/README.md` §9 |

### Issues, by priority

| # | Priority | Issue | Disposition |
| --- | --- | --- | --- |
| 1 | **Critical** (launch) | Brand "Your Name", no contact address, no profile links | Owner (config) |
| 2 | **Critical** (launch) | `/work` is a placeholder in the main navigation | Owner decision; **not built** (§6) |
| 3 | **Critical** (launch) | No real e-mail path: no provider, Cloudflare, DNS | External; blocked |
| 4 | High | The administration's service texts (title, summary, tagline, overview, features) never reached the website | **Fixed** |
| 5 | High | The hero screenshot button on project pages had no visible focus ring (clipped by its frame) | **Fixed** |
| 6 | High | The Lab stage (a keyboard input surface) had no visible focus ring (painted under its own canvas) | **Fixed** |
| 7 | High | Phone layout of every Lab experience with a notice (calm view under reduced motion, still view, failure): the hint's last line was hidden under the notice, in all three languages | **Fixed** |
| 8 | High | The hidden racing experience redirected the tab and had no fallback screen, OPEN action or exit; the brief specifies them | **Changed** (§6) |
| 9 | High | No domain, HTTPS, DNS; `VITE_SITE_URL` unset (everything `noindex`) | External |
| 10 | High | Privacy notice silent on holder, retention, basis, processors | Owner's text |
| 11 | High | The brief demands six Lab experiences; there are five | **Decision** (§6) |
| 12 | Medium | Backups unscheduled, no restore drill, no error monitoring or alerting, no CI | Owner / not implemented |
| 13 | Medium | The website's forms do not send the honeypot field; only the per-address rate limit (5 per 15 min) and a link-count rule stand between a script and the inbox | Owner decision |
| 14 | Medium | Tested in Chrome/Edge emulation only: no Safari, Firefox, real phone, screen reader | Not testable here |
| 15 | Medium | Emulated-phone LCP 3.4–4.2 s (the lead paragraph is revealed on purpose after the headline) | Measured, unchanged |
| 16 | Medium | Hollandia Kezdőknek: a concept card without a page | Owner |
| 17 | Low | The secret dot is 13–19 px wide (an inline target, exempt from WCAG 2.5.8) | Documented |
| 18 | Low | Images are single-size WebP (no `srcset`); the page body is client-rendered | Documented since PROMPT 11 |
| 19 | Low | `docs/backend/README.md` still called the administration "server-rendered"; the README and `technical-audit.md` described the old racing redirect | **Fixed** |
| 20 | Low | The audit tools had false alarms and bugs (axe injected as a script under the real CSP, a stale Tab step, a Windows path bug, a keyboard harness that keyed controls by position) | **Fixed** |
| 21 | Low | Windows Git Bash rewrites `VITE_API_URL=/` into a path, and the forms then say they cannot send | Documented (README of `tools/e2e`, production checklist) |

## 3. What was changed, and why

| Change | Why (root cause) | Evidence |
| --- | --- | --- |
| `catalogOverlay.ts`: `overlayServiceAreas`, `overlayServiceDetails`; `areas.ts`/`detail.ts` export a `base…` list (for the seed export) and the overlaid one; `catalogProblems` and `scripts/pull-catalog.mjs` report services; docs and the administration's own note updated | The public catalogue already carried the services' texts, the administration let you edit them, and nothing read them | 4 new tests; journey C: edit → `catalog:pull` → build → the edited overview and tagline are on `/en/services/website/` |
| Racing experience: loading wipe → "NFSU2 runs on its own website" with **OPEN NFSU2** (`target="_blank" rel="noopener noreferrer"`) and **Back to the Lab**; the automatic redirect and its `pageshow` handler are gone | The brief asks for exactly this; a page that takes the tab away without a click is worse than one that offers it | Journey E; measured at 320, 390, 844×390 and 1440: no sideways overflow (the 390 px picture was looked at) |
| Hero screenshot button and Lab stage: a two-tone ring drawn **inside** | An outline outside a clipping frame, or under positioned children, is invisible | Strict keyboard audit; edge-pixel comparison on all five stages at two sizes (10 of 10) |
| `ExperimentFrame.module.scss`: with a notice up, the hint rises (`--hint-bottom: 18rem` below `md`) | The hint and the notice sat in the same place on phones | `audit-lab-overlap`: overlaps on every experience and language at 320, 360 and 390 px before, none after (210 screens) |
| README, backend README, technical audit: stale statements corrected | They described code that no longer exists | Read against the code |
| New tools: `tools/audit/{audit-structure,audit-i18n,audit-design,audit-keyboard-strict,audit-lab-overlap}.cjs`, `tools/e2e/{journeys.cjs,security-probe.mjs}`; `lib.cjs` injects axe through the protocol; `webgl.cjs` step fixed | The pass needed them; none is a dependency or part of `npm test` | READMEs |

No dependency was added or removed, no second backend or database structure exists, nothing that was working was rebuilt, and no AI generation, Meshy or Tripo code exists (searched: only the documentation's statements that it was removed).

## 4. Architecture consistency

One backend (`server/`), one database (SQLite, three migrations), one routing system (React Router with one page registry, `routes/pages.ts`), one localisation system per audience (the website's `src/i18n` and content dictionaries; the administration's own two-language dictionary, isolated by a test), one theme system (shared by the website and the administration, `src/theme`), one design-token file (`src/styles/tokens.css`; the administration adds its own small `admin.css`, tested for contrast), no second global stylesheet fighting it (the administration is a separate bundle). Dependencies: six runtime packages on the website, none in the server; no unused one. No unreached source file. The only environment-variable mismatch is `ADMIN_PASSWORD` (see §C). Nothing architectural was changed.

## 5. How it was verified

Commands and tools, in the order of the pass: baseline (`npm test`, `oxlint`, `npm run build`, `check:seo`); `audit-structure`; the journeys A–F and the security probe against a scratch backend serving the built site (`tools/e2e/README.md` for the set-up); `audit-a11y`, `audit-keyboard-strict`, `audit-i18n`, `audit-design`, `webgl.cjs`, `seo-browser.cjs`, `audit-lab-overlap`, `audit-matrix` (13 sizes: the nine viewports of the brief, the 320 px one as 320×568, and four landscape phones, English dark; Hungarian and Dutch at 1440, 390 and 320; light theme at 1440, 768, 390 and 320); `vitals.cjs` and `inp.cjs` on a quiet machine; the Three.js cleanup check against the dev server; `server:cli check` with unsafe and safe production settings; `npm audit`; a key-pattern scan. All of it ran again on the final build after the fixes.

## 6. Where the brief and the repository disagree (decisions for the owner)

1. **Six Lab experiences, including Generative Objects.** The repository has **five** (Particle Universe, Liquid Matter, Type in Motion, Infinite Space, Chromatic Distortion). The owner deleted Generative Objects on 2026-11-01 ("töröld az egész generate object experiencet"; last in git at `9275457`), and it had grown into an AI text-to-3D experience that the same brief says must not come back. The brief also says "do not introduce new functionality" and "preserve only the existing procedural and interactive functionality that is actually implemented". **It was not rebuilt**, no sixth experience was invented, and no copy says "six". If a procedural, non-AI Generative Objects is wanted it is a new feature with its own brief.
2. **The racing experience.** The first version had a fallback screen and a sandboxed frame; the owner then asked for a direct transfer, which is what the repository did until this pass. The brief now asks for the fallback screen and an OPEN action again, and I followed the newer instruction. nfsu2.xyz answers `x-frame-options: DENY` and `frame-ancestors 'none'` (read again on 2026-11-05) and this site's policy is `frame-src 'none'`, so **no iframe attempt was built** (it could only show "refused to connect"); the fallback screen is the designed result. Going back to the direct transfer is the old `leaveFor` function in git history.
3. **`/work`.** A navigation item that leads to a placeholder is a launch problem, but building the page is a feature (copy in three languages, SEO text, indexing). It could be made of the existing project cards in an afternoon; it is the owner's call whether that, or removing the item, is the answer.

## D. Outstanding issues (everything unresolved, by priority)

**Critical for launch:** (1) brand name, contact address, profile links; (2) the Work page; (3) the e-mail path (provider, Cloudflare, DNS records, webhook).

**High:** (9) domain/HTTPS/DNS and `VITE_SITE_URL`; (10) the privacy notice's wording; (11) six vs five experiences (§6); the real first administrator and the production environment.

**Medium:** (12) backups, restore drill, monitoring, CI; (13) spam protection beyond the rate limit; (14) no testing outside Chrome/Edge emulation; (15) emulated-phone LCP; (16) Hollandia.

**Low:** (17) the 13–19 px secret dot; (18) single-size images, client-rendered body; native-speaker proofreading of Hungarian and Dutch; `WALLEX` vs `Spendly` naming; last-save-wins in the administration.

## E. External configuration still to do

Domain and DNS (site, and the mail records exactly as Cloudflare and the provider show them) · Cloudflare Email Routing and its verified destination · a transactional provider account, verified domain, send-only API key, webhook and its secret · production environment (`APP_ENV`, `APP_SECRET`, `DATABASE_PATH` on a persistent disk, `PUBLIC_URL`, `API_PUBLIC_URL`, `TRUST_PROXY`, `NOTIFY_TO`, `EMAIL_FROM`, `EMAIL_REPLY_TO`) · TLS in front of the process · the first administrator · `VITE_SITE_URL`, the real brand name, the contact address and profile links · the privacy notice's wording and `RETENTION_DAYS` · a backup schedule and one restore · optionally `VITE_ANALYTICS_ENDPOINT` and `DEPLOY_HOOK_URL`. The checklist with states is [`docs/production/README.md`](../production/README.md).

## 7. What was not tested

Real phones and tablets, Safari, Firefox, any screen reader, forced colours, Lighthouse, a real network and real visitors, the real mail provider, Cloudflare and DNS (so incoming forwarding, outgoing delivery from a real domain, SPF/DKIM/DMARC and spam placement are all untested), rendering in mail clients, a deployed instance, load, the real `SIGTERM` path on Windows, native-speaker proofreading and any legal review. The administration's 540-view layout audit was not repeated in this pass (its screens did not change; journey C drove it end to end). Provider behaviour (`reply_to`, error bodies, webhook payloads) is implemented as documented and unproven against the real service.

## F. Final recommendation

**Do not launch yet, and do not call the site production-ready.** The application is stable, tested end to end against a real backend, accessible on everything that was checked, and free of the defects this pass could find. The remaining work is the owner's: the name and contact details, the Work page, the domain and mail setup, the privacy wording, and two decisions (§6). When those are done, run the journeys and the probe once against the real host (`tools/e2e/README.md`), set `EMAIL_ENABLED=true` only after the administration's Notifications checks say *verified*, and re-read §7 to see what still has never been tested.
