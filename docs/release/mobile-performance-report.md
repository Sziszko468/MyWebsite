# Mobile-first, performance and device report (PROMPT 13.2)

Done on 2026-11-06 against production builds (`npm run build`). Every number below was produced by a script in `tools/audit/` or `tools/audit/mobile/` or by `npm test`; none is estimated. The method, the machine and **what could not be measured** are stated in each section. How the mobile system works is in `docs/mobile/README.md`.

**Read this first.**

- This was an audit-first pass. Before anything was changed, the layout matrix (21 pages, 9 required widths plus 568×320 and 844×390 landscape, 231 page loads) found no sideways scrolling, no clipped content, no overlapping navigation and no broken image. The pass found **one real functional defect on phones** (the intro did not follow a dragging finger), **one missing capability** (quality was never given back), a **missing safe-area system**, a **single-column Work page**, and **one build bug that a layout audit surfaced by accident** (below). It did not redesign what already worked.
- **No real device, no Safari/WebKit, no Firefox and no screen reader was available.** "Mobile" below means Chromium (Google Chrome 157 and Microsoft Edge 156, both Chromium) with phone emulation: touch events sent through the DevTools protocol, a coarse pointer, device pixel ratio 2, CPU and network throttling, and safe-area insets set through `Emulation.setSafeAreaInsetsOverride`. A real phone has a different GPU, memory, thermal behaviour, browser chrome and keyboard; the section "Real device testing" lists what must still be done there.
- Two things the brief asks for are **not in the code, on purpose** (see "Conflicts with the brief"): the sixth Lab experience (deleted by the owner) and an NFSU2 iframe (the other site forbids it).

## 1. Findings and changes

| # | Finding | Evidence | Status |
| --- | --- | --- | --- |
| 1 | **A finger dragging over the fullscreen intro did not move the field.** The browser took the first move for a scroll and cancelled the pointer. | CDP touch drag, 12 moves: 1 `pointermove`, 1 `pointercancel`, `--hero-cx` stayed −0.577, energy 0.000. | Fixed (`touch-action: none` on the intro content; it pans only if its content is taller than the screen). After: 12 moves, 0 cancels, `--hero-cx` −0.51 → 0.38, energy 0.19 → 0.81 at 390×844, 844×390 and 320×568, in Chrome and Edge. |
| 2 | Quality only went **down**. A hitch while a heavy page loaded left a phone at a lower resolution for the whole visit. | Read the three watchdogs: no way up. | Fixed: `QualityGovernor` (probe after 12 s of steady frames, back-off ×2, give up after two failed probes). Shown end to end in §4. |
| 3 | No safe-area system: `viewport-fit=cover` was missing from the public pages and `left`/`right` insets were never used. | Read `index.html`; grep. | Fixed (tokens `--safe-*`, `--gutter`, header, menu, intro, sticky CTA, Lab, admin bars). Verified with emulated insets (§5). |
| 4 | The Work page was one column of identical tall cards under three rows of filter pills. | Screenshot at 390 px, 4324 px tall. | Fixed: swipeable filter row, rhythm of full cards and list rows, page 3860 px tall (−11 %). |
| 5 | Every phone downloaded the 1440 px screenshot. | `docs/technical-audit.md` §3 (known cost). | Fixed for the static project pictures (480/800 px copies, `srcset` with measured `sizes`). Bytes: §3. A first version of `sizes` under-claimed the desktop widths and made the browser stretch a smaller copy; the layout matrix flagged "image upscaled" on 15 project-page loads, the real widths were measured at 13 viewports and the strings corrected (matrix then clean). |
| 6 | Double-tap zoom and the iOS focus zoom were not guarded; `Button size="sm"` was 40 px high on a phone. | grep; read. | Fixed (`touch-action: manipulation`, 16 px floor for fields on a coarse pointer, 44 px small buttons on touch). A test holds each. |
| 7 | A 2G connection got the same first quality guess as Wi-Fi. | Read `pickQuality`. | Fixed (`effectiveType` 2g / slow-2g starts at the lowest tier). |
| 8 | The admin's bottom bar had its inset padded inside a fixed height, which squeezes the buttons on a device with a home indicator. | Read `shell.module.scss`. | Fixed (`--admin-bottom-nav-total`). |
| 9 | **The Content-Security-Policy hash of the inline theme script was computed over CRLF text; the browser hashes LF text.** On a checkout with Windows line endings every page logged "Executing inline script violates the following Content Security Policy directive" and the browser refused the pre-paint theme script (a flash of the wrong theme). Found because a matrix run printed the console error on all 231 loads. This is **not new**: a fresh checkout of the previous commit builds the same wrong hash (verified in a clean worktree). | Hash in `_headers`: `CnEH3c…` (CRLF) vs `tvDrXJ…` (what the browser computes). | Fixed in `scripts/prerender.mjs` and `scripts/check-seo.mjs` (newlines normalised before hashing) with a regression test. After: 0 CSP errors in the matrix. |

## 2. Layout matrix (no horizontal overflow, no clipped content, no overlap, no broken images)

`tools/audit/audit-matrix.cjs`, Chrome, dark theme, English, 21 pages × 11 viewports = 231 page loads: 320×640, 360×740, 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900, 1920×1080, and landscape 568×320 and 844×390. It checks sideways scrolling, elements outside the viewport, text under 11.5 px, targets under 24 px, a header with fewer than two visible controls, upscaled images and console errors.

Result of the last full run (it ran before the `sizes` correction in finding 5): **no sideways scrolling, no clipped content, no element outside the viewport, no overlapping or missing header, no unreadably small text, no console or CSP error** on 231 loads. The lines that remain, and what each is:

- `no footer` × 55 on the five immersive Lab experiment pages: those pages have no footer by design.
- `button 13–20 px wide "."` × 5 on `/lab`: the hidden red full stop. The audit measures the element, not its `::after`, which makes the real hit area 44×44 px; the touch check in §5 taps it and it opens the hidden screen.
- `image upscaled` × 15 on the three project pages at 1024–1920 px: **a real defect in the first `sizes` of the new `srcset`** (it under-claimed how wide the pictures are drawn, so the browser picked a copy that was then stretched). Fixed by measuring the real widths at 13 viewports (`tools/audit/mobile/image-widths.cjs`); re-checked with 21 loads (the three project pages at 390, 768, 1024, 1180, 1366, 1440, 1920): **no findings**. The full matrix was not repeated after that fix, which touched only project pages.

The first run of this pass, before any change, had the same layout result. The Work page, the most changed, produced no layout finding at any width: 320 px keeps stacked cards (a card there is narrower than the 20 rem a row needs), 390 px and up get list rows.

Pages: home, Work, the three project pages, Services, the four service pages, configurator, cart, About, Lab, Contact, Privacy and the five Lab experiences. The first run of this pass (before any change) had the same layout result; the Work page's rows, the filter row and the safe-area padding did not introduce a finding.

## 3. Performance: measured, desktop and phone separately

Method (`tools/audit/vitals.cjs`): system Chrome 157 driven by Playwright, cold cache, median of three runs per page and round. **Phone** = 390×844 touch, 4× CPU slowdown, 1.6 Mbit/s with 150 ms latency (the same shape as Lighthouse's mobile preset, **not** Lighthouse: it was not run). **Desktop** = 1440×900, no throttling. "Before" is a clean checkout of the previous commit built in a separate worktree, "after" is this pass, served by identical static servers (brotli/gzip, the real `_headers`), measured alternately. Bytes are compressed bytes on the wire. Differences under about 5 % are noise on this machine. One "before" round was lost when the static server reset a connection (the tool now retries), so "before" has 1 round and "after" has 2 on the phone; desktop has 1 each.

**Phone (emulated)**

*Pages the pass did not touch (first measurement; before = 1 round, after = 2 rounds):*

| Page | LCP (ms) | FCP (ms) | Blocking time (ms) | CLS | Transferred (kB) | Pictures (kB) |
| --- | --- | --- | --- | --- | --- | --- |
| `/en/` | 4336 → 4504 (+4 %) | 3892 → 3836 | 316 → 322 | 0 → 0 | 598 → 599 | 0 → 0 |
| `/en/work` | 3788 → 3824 (+1 %) | 3388 → 3440 | 105 → 128 | 0 → 0 | 392 → 394 | 0 → 0 |
| `/en/services` | 4292 → 4304 (0 %) | 3408 → 3436 | 305 → 304 | 0 → 0 | 342 → 343 | 0 → 0 |
| `/en/lab` | 3800 → 3956 (+4 %) | 3372 → 3396 | 181 → 298 | 0 → 0 | 329 → 330 | 0 → 0 |

*The three project pages (second measurement, with the corrected `sizes`; 2 rounds each):*

| Page | LCP (ms) | FCP (ms) | Blocking time (ms) | CLS | Transferred (kB) | Pictures (kB) |
| --- | --- | --- | --- | --- | --- | --- |
| `/en/work/spendly` | 4224 → 4104 (−3 %) | 3436 → 3488 | 517 → 356 | 0 → 0 | **365 → 337 (−8 %)** | **50 → 21** |
| `/en/work/bookinghub` | 3992 → 4172 (+5 %) | 3440 → 3456 | 277 → 414 | 0 → 0 | **336 → 326 (−3 %)** | **21 → 10** |
| `/en/work/logistics-platform` | 4004 → 4124 (+3 %) | 3388 → 3468 | 314 → 339 | 0 → 0 | **369 → 337 (−9 %)** | **54 → 21** |

(The "after" build of the second measurement also carried a `<link rel="preload" as="image">` for the lead screenshot, which was then removed because it made no difference; see below.)

**Desktop**

*Pages the pass did not touch:*

| Page | LCP (ms) | FCP (ms) | Blocking time (ms) | CLS | Transferred (kB) | Pictures (kB) |
| --- | --- | --- | --- | --- | --- | --- |
| `/en/` | 1132 → 1152 (+2 %) | 1132 → 1152 | 6 → 0 | 0 → 0 | 598 → 599 | 0 → 0 |
| `/en/work` | 1340 → 1352 (+1 %) | 1024 → 1036 | 0 → 0 | 0 → 0 | 392 → 394 | 0 → 0 |
| `/en/services` | 1388 → 1372 (−1 %) | 1056 → 1040 | 6 → 5 | 0 → 0 | 342 → 343 | 0 → 0 |
| `/en/lab` | 1408 → 1352 (−4 %) | 1076 → 1020 | 0 → 0 | 0 → 0 | 329 → 330 | 0 → 0 |

*The three project pages (corrected `sizes`):*

| Page | LCP (ms) | FCP (ms) | Blocking time (ms) | CLS | Transferred (kB) | Pictures (kB) |
| --- | --- | --- | --- | --- | --- | --- |
| `/en/work/spendly` | 1392 → 1388 (0 %) | 1052 → 988 | 15 → 15 | 0 → 0 | 365 → 366 | 50 → 50 |
| `/en/work/bookinghub` | 1408 → 1384 (−2 %) | 1060 → 1032 | 7 → 7 | 0 → 0 | 336 → 338 | 21 → 21 |
| `/en/work/logistics-platform` | 1368 → 1368 (0 %) | 1024 → 1020 | 12 → 14 | 0 → 0 | 369 → 370 | 54 → 54 |

Reading it plainly:

- **The pass did not make the first load faster, and does not claim to.** FCP, LCP and blocking time on the phone are within noise before and after (the +4 % LCP on three pages is inside the ±5 % band; the main script is about 1 kB larger for the governor). Core Web Vitals on this emulation: **CLS 0 on every page, desktop and phone**; LCP 3.8–4.5 s on the emulated slow phone and 1.1–1.4 s on desktop; the 2.5 s LCP target is **not met on the emulated slow phone** (as before: the page's lead paragraph is the largest paint and the motion system fades it in on purpose; bytes and script dominate the rest). INP was not re-measured in this pass (last measured worst interaction: 128 ms on the emulated phone, `docs/technical-audit.md` §3).
- **What did change: bytes on the project pages, on a phone.** The pictures on a project page fell from 50–54 kB to 21 kB and the page's transfer by 8–9 % (365 → 337 kB, 369 → 337 kB). On **desktop it did not change** (50 → 50 kB): the corrected `sizes` claims up to 1056 px for the wide screenshots, so a 1440 px window gets the original (the first measurement, with a `sizes` that under-claimed, showed −8 % on desktop and that was a picture stretched to the wrong size, not a saving).
- **The LCP did not move, on any connection speed, and this was investigated.** On a project page the largest paint *is* the lead screenshot (`IMG …dashboard-light-800.webp`), but the page's HTML carries only the `<head>`: the `<img>` exists after the page's script has run, so FCP and LCP are 2 s apart on a slow connection and the picture's size is not what the LCP waits for. A `<link rel="preload" as="image">` in the head was tried (the request then starts at HTML parse) and measured the same, so it was removed. The real fix is a prerendered body for project pages; not done.
- These numbers are about **loading**. Interaction latency (INP) and the Lab's real frame rates were not measured in this pass: the touch checks in §5 prove that input arrives and the field follows, not how fast a phone draws it.

**Three connection speeds** (the brief asks for fast, standard and slow; `vitals.cjs --profile=phone-fast|phone|phone-slow`; all on the emulated 390×844 phone; 3 runs each, "before → after"):

| Connection | Page | LCP (ms) | FCP (ms) | Blocking time (ms) | Transferred (kB) |
| --- | --- | --- | --- | --- | --- |
| Fast (4× CPU, no network limit) | `/en/` | 1952 → 1940 | 1952 → 1940 | 214 → 258 | 598 → 599 |
| | `/en/work` | 1844 → 1908 | 1516 → 1468 | 80 → 109 | 392 → 394 |
| | `/en/work/spendly` | 2160 → 2176 | 1544 → 1524 | 351 → 355 | 365 → 337 |
| Standard (4× CPU, 1.6 Mbit/s, 150 ms) | see the phone tables above | 3.8–4.5 s | 3.4–3.9 s | | |
| Slow (6× CPU, 400 kbit/s, 400 ms) | `/en/` | 13000 → 13040 | 9460 → 9544 | 507 → 448 | 598 → 599 |
| | `/en/work` | 9792 → 9888 | 9052 → 9068 | 213 → 217 | 392 → 394 |
| | `/en/work/spendly` | 11188 → 11056 | 9140 → 9528 | 718 → 732 | 365 → 337 |

- **Against the targets (LCP ≤ 2.5 s, CLS ≤ 0.1):** CLS is 0 everywhere; LCP is met on the fast connection (1.8–2.2 s) and **not met** on the standard one (3.8–4.5 s) or the slow one (9.8–13 s). These are lab numbers for a slow phone; real-user values were not collected.
- **Is the page usable before the large assets arrive?** Nothing large is in the way of the first paint: the 3D engine (about 240 kB gzip) is a lazy chunk that starts only after the first screen has settled, and the static graphic stands in until then. What the first paint does wait for is the shell: about 135 kB of script, the stylesheet and the brand font (89–174 kB depending on the page), which on 400 kbit/s is the 9 s to first paint. Shrinking that is a different project (the font's width axis is part of the identity, the app is client-rendered).
- **The pictures' smaller copies do not change the LCP at any speed.** On a project page the largest paint *is* the lead screenshot, but the HTML carries only the `<head>`: the `<img>` exists after the page's script has run (FCP and LCP are about 2 s apart on the slow connection), so the picture's size is not what the LCP waits for. A `<link rel="preload" as="image">` for it was tried (the request then starts at HTML parse) and measured the same on all three speeds, so it was removed. The real fix is a prerendered body for project pages, which is a larger change and was not made.
- The `err=1` the tool printed for every "before" page is the CSP console error of finding 9 (the "before" build is a clean checkout, which has the CRLF hash); the "after" build has `err=0`.

## 4. Adaptive quality, measured end to end

`tools/audit/mobile/restore.cjs`: a 390×844 phone, Particle Universe, CPU throttled 20× to force the watchdog to act, then released. The observable is the canvas's pixel width (CSS width 390 × the pixel ratio the tier and the adaptive scale allow).

| Time | Event | Canvas width | Tier |
| --- | --- | --- | --- |
| 4 s | start | 585 px | balanced (medium) |
| 7 s | CPU throttled 20× | 487 px | performance (low) |
| 12 s, 17 s | still throttled | 365, 274 px | performance |
| 38 s | CPU released | 274 px | performance |
| 50 s | first step back (≈12 s of steady frames after the release) | 365 px | performance |
| 62 s | second step | 487 px | performance |
| 74 s | third step: the tier | 585 px | balanced |
| 74–155 s | left alone | 585 px | balanced (no oscillation) |

Back at the starting level in 39 s after the CPU was released, one step per 12 s. The governor itself (probe, back-off, give up after two failed probes, pause handling) is covered by 11 unit tests on simulated frame times; the real device cost of a failed probe (a short stutter) was not measured on hardware.

## 5. Touch, safe areas, the hidden screen

All with Playwright through the DevTools protocol (`tools/audit/mobile/`), Chrome 157 and, for the first three, Edge 156 as well (identical results).

- **Intro drag** (390×844, 844×390, 320×568): 12 pointer moves, 0 cancels, the field follows (§1 #1).
- **Lab, five experiences** (390×844): a 14-step drag reaches each stage as 14 `pointermove`, 0 `pointercancel`, the stage is marked touched, the page does not scroll.
- **Hidden NFSU2 screen** (320×568, 390×844, 844×390, 568×320): opened by a touch on the red full stop, loading wipe, then the screen; no sideways scroll, no scroll, both controls 48 px high, Back by touch removes it, the link is `target=_blank rel="noopener noreferrer"`. `nfsu2.xyz` still sends `x-frame-options: DENY` and `frame-ancestors 'none'` (read 2026-11-06).
- **Safe areas** (portrait 47/34 and landscape 59/59 insets): the sticky header grows by the top inset; with 59 px side insets the page gutter is 59 px, and on the intro, home, Work, cart and Lab **no interactive element lies outside the safe rectangle** and nothing scrolls sideways. (The Work filter chips are meant to run past the edge: they are a scrolling row.)

## 6. Tests and static checks

| Check | Result |
| --- | --- |
| `npm test` (Vitest) | ****78 files, 1790 tests pass** (PROMPT 13.1: 74 files, 1757 tests)** |
| `npm run typecheck`, `npm run lint` | Clean. |
| `npm run check:seo` | Passes (65 files; the site address is not configured, so everything is `noindex`, as intended). |

New tests: `hero/qualityGovernor.test.ts` (11), `utils/responsiveImage.test.ts` (4, includes that every named copy exists), `styles/mobile.audit.test.ts` (the viewport meta, the safe-area tokens, no raw `env()`, touch rules, the 16 px field floor, the intro's `touch-action`, viewport units), `seo/cspHash.test.ts` (3), one line in `hero/hero.test.ts`.

## 6b. The Shop and the administration on a phone

All against the **real backend** serving the built site (one process, a throw-away database, the `file` e-mail provider), Chrome:

- **Journey D** (`tools/e2e/journeys.cjs --only=D`, a 390×844 touch phone): the intro is entered, no sideways scroll, the menu opens and closes with Escape, a project, the services shop, a service's packages, the cart (it survives a refresh), the six-step request builder, review, consent, send and the confirmation after the API's `201`: **13/13**. **Journey E** (the hidden screen on desktop and on a phone): **13/13**.
- **Administration**, `audit-admin.cjs` at 320×640, 360×800, 390×844, 430×932, 768×1024 and 844×390, dark and light, English: **324 views, 0 findings** (sideways scroll, targets under 24 px, controls without a name, one `h1`, axe-core WCAG 2.2 AA and best practice, the delete dialog's focus, the phone's "More" sheet).
- **Administration on a notched phone** (`tools/audit/mobile/admin-safe-area.cjs`): with a 34 px home-indicator inset the bottom bar is 94 px (60 + 34) and its five buttons stay 59 px tall (by the old stylesheet's arithmetic a bar of fixed 60 px with the 34 px inset padded inside it left them 26 px; that was read, not measured before the change); in landscape with 59 px side insets the header content stays inside them; the sidebar replaces the bottom bar from 768 px.
- **Found while doing this:** someone who signs in at `/admin/login` (a bookmark, a typed address) stayed on that address and saw "This page does not exist" inside the shell, because the sign-in is a gate and not a route. `/admin/login` now goes on to the dashboard.
- **Not run in this pass:** the brief's list for the phone (edit a project description, change a picture, update a package price, edit a service text, manage a translation, save a draft, preview, publish) was **not executed on a phone** here. The editors are phone-shaped (a language bar, tabs, stacked fields, a full-width bar; the project editor was looked at by screenshot at 390 px and passes the layout and axe audit) and the same actions were exercised end to end on desktop in PROMPT 13.1 (`tools/e2e/cms-journey.cjs`, 22/22), but a phone run of that journey was not made.

## 7. Conflicts with the brief

1. **Six Lab experiences / Generative Objects.** The Lab has **five**. Generative Objects was deleted at the owner's order on 2026-11-01 (last in git at `9275457`), with the AI text-to-3D code that had grown around it; the brief both asks to preserve its "existing procedural functionality" and to add no AI generation. It was not rebuilt, and nothing was added under another name. This was already reported in PROMPT 10, 11 and 15 and is unchanged.
2. **A fullscreen iframe for NFSU2.** `nfsu2.xyz` answers `x-frame-options: DENY` and `frame-ancestors 'none'`, and this site's CSP says `frame-src 'none'`. The brief says to show "the existing fallback with an option to open the external website" if embedding is blocked and never to bypass the restriction; the fallback is what the site has (loading wipe, a screen saying what the other site is, OPEN NFSU2 in a new tab, a visible way back). An "error state" for a frame therefore does not exist: there is no frame.
3. **"Do not hide core functionality on mobile" vs the intro's skip checkbox and the filters row** — nothing was hidden; the filters moved into a scrolling row and every project stays reachable.

## 8. Real device testing: what was not done, and what to do

Not done, because no device or browser was available here: iOS Safari / WebKit, Android Chrome on hardware, Firefox, any screen reader, a real keyboard on a phone, real GPUs of different classes, real mobile networks, Lighthouse, Core Web Vitals from real users. The numbers above are lab numbers from one Windows PC (an RTX 4060 behind the throttling): a phone's GPU is the part this machine cannot imitate, so the Lab's real frame rates are **unknown**.

A checklist for the first real devices (an iPhone with a notch, a low-end Android, a tablet):

1. Home: the intro opens, a drag moves the field, a tap makes a wave, a tap on the background does not enter, the button does; rotate the phone: the entry button stays on screen.
2. Lab: each experiment reacts to a finger; watch the graphics-quality control: does Auto settle on a level, and does it climb back after you stop?
3. Safari: focus a field in the contact form and the request builder (no page zoom), scroll with the address bar collapsing (no jump in the hero or the intro), landscape on a notch phone (content clear of the notch).
4. Pinch-zoom works everywhere (it is never disabled).
5. Work: the filter row swipes; list rows and full cards alternate; project page pictures are sharp.
6. Shop: the builder with the keyboard open (the sticky bar must not cover the focused field), the cart, a send.
7. Admin on the phone: sign in, open a project, edit text, add a picture, preview, publish.
8. Remote debugging (Safari Web Inspector / `chrome://inspect`) while doing the Lab: Performance panel for long frames.

Use `docs/mobile/README.md` ("Re-running the checks") to repeat the emulated parts.
