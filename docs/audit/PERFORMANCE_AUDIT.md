# Performance and mobile audit

Method: the project's own browser tools (`tools/audit/*`) against the **built** site in system Chrome (desktop GPU, so WebGL ran), 2026-11-13. These are **lab numbers on an emulated phone** (CDP: 4× CPU slowdown, 150 ms round trip, 1.6 Mbit/s), not real-user data. Real devices, a real mobile GPU, Lighthouse and field Core Web Vitals were **not** measured.

## Layout at the nine required widths

`audit-matrix.cjs`, every page × 9 sizes (320×640, 360×740, 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900, 1920×1080), English, dark: **252 page loads**; Hungarian and Dutch, light, at 320 and 390: **112 page loads**. It checks sideways scrolling, elements outside the viewport, text below 12 px, touch targets, upscaled pictures and console / CSP errors.

Result: **no horizontal overflow, nothing outside the viewport, no console or CSP error, at any width, language or theme.** The only lines printed repeat: *no footer* on the five immersive Lab experience pages (a full-screen stage, by design) and one 13–16 px target on `/lab` (the hidden NFSU2 trigger, F-1). Navigation, typography and layout rhythm were exercised by the same loads; **touch behaviour** was covered in the earlier mobile pass (`docs/mobile/README.md`: CDP touch, safe-area insets, quality governor) and not repeated.

## Loading speed (3 runs each, median of the tool's output)

| Profile | Page | FCP | LCP | CLS | Blocking time | Transfer | Three.js |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Emulated phone | `/hu/` | 4 304 ms | 5 072 ms | 0 | 575 ms | 619 kB (js 419, font 174) | loaded (hero) |
| | `/en/` | 3 960 ms | 4 040 ms | 0 | 615 ms | 619 kB | loaded (hero) |
| | `/en/services/` | 3 568 ms | 5 220 ms | 0 | 605 ms | 389 kB (js 253, font 89) | **not loaded** |
| Desktop | `/hu/` | 1 184 ms | 1 184 ms | 0 | 12 ms | 619 kB | loaded |
| | `/en/` | 1 132 ms | 1 132 ms | 0 | 0 ms | 619 kB | loaded |
| | `/en/services/` | 1 044 ms | 1 364 ms | 0 | 4 ms | 389 kB | not loaded |

No console error on any run. These match the earlier recorded values (`docs/release/mobile-performance-report.md`: LCP 3.8–4.5 s on the same emulated phone, desktop 1.1–1.4 s, CLS 0): **no regression**, and the earlier conclusion stands.

### Core Web Vitals against the targets

| Metric | Target | Desktop | Emulated phone |
| --- | --- | --- | --- |
| LCP | ≤ 2.5 s | **met** (1.0–1.4 s) | **not met** (4.0–5.2 s); met only on a fast connection (≈ 1.9 s, earlier report) |
| CLS | ≤ 0.1 | **0** | **0** |
| INP | ≤ 200 ms | not re-measured | last measured worst interaction 128 ms (`docs/technical-audit.md`) |
| Blocking time (lab proxy for INP/TBT) | < 200 ms | ≈ 0–12 ms | **575–615 ms** (4× slowdown) |

## Why the phone is slow, and what the audit adds

- **P-1 (Medium): every page's body is rendered in the browser.** `npm run build` prerenders the `<head>` (title, canonical, hreflang, Open Graph, structured data: the SEO checks pass) but the page body is an empty `<div id="root">` plus a `<noscript>` notice: the live `/hu/` HTML is 7 190 bytes with **no `<h1>`**. Consequences: (1) the first paint waits for ≈ 135 kB of script, the stylesheet and the brand font; (2) the LCP element appears only after script has run (FCP and LCP are seconds apart on a slow link); (3) a visitor or crawler **without JavaScript** sees only the notice (Google renders JavaScript; link previews use the head, which is prerendered). The earlier mobile report reached the same conclusion and named the fix: **prerender a body for the home, service and project pages** (the SSR entry `src/seo/entry.ts` already runs React on the server for the head). It is a larger change, deliberately not made in an audit.
- **P-2 (Low): the brand font costs 89–174 kB on the critical path** (a variable font with a width axis, part of the identity). `index.html` preloads the **Latin** subset only; Hungarian's `ő`/`ű` live in the Latin Extended file, so whether Hungarian pages fetch a second font file late and swap glyphs was **not investigated** (a worthwhile 10-minute check with the Network panel on `/hu/`).
- **P-3 (Info): the 3D engine is out of the critical path.** About 240 kB gzip, a lazy chunk that starts after the first screen settles; the shop, About and project pages never load it (verified); the home loads only the hero.
- **P-4 (Info): WebGL robustness is good** (28/28 pages with no WebGL, context loss and restore survive, a quality governor lowers the pixel ratio and effects under load, `prefers-reduced-motion` is honoured and every audit also ran with it). The website **remains usable when WebGL is unavailable**, as required.
- **P-5 (Info): static assets are cached for a year, immutable** (live headers). HTML is not edge-cached, which is right for an edited site; Cloudflare compresses.

## Image optimization

Responsive variants and `srcset`/`sizes` are in place (project pictures fell from 50–54 kB to 21 kB on a phone in the earlier pass); the live asset headers are correct. Not re-measured: per-image over-delivery on real devices.

## Recommendations (adaptive rendering, progressive enhancement, nothing removed)

1. Prerender the body of the home, service and project pages (progressive enhancement: no-JS visitors get the content, the app takes over). Expected: LCP on the emulated phone falls toward the "fast connection" values.
2. Keep the quality governor and the lazy 3D; **do not remove visual features to improve a benchmark** (the brief's rule). Consider a `Save-Data` / `navigator.connection.saveData` check to start in the still tier.
3. Measure with real users: enable the existing consent-gated analytics endpoint (`VITE_ANALYTICS_ENDPOINT`) with the Web Vitals fields, or add Cloudflare Web Analytics (no cookies).
4. Run Lighthouse and WebPageTest on `www.szilardkiss.com` from a real phone profile and record the numbers here.

## Not measured

Memory and CPU on a real phone, GPU frame rates on mobile hardware (only the governor's logic and desktop Chrome), battery, real-network variance, Safari/WebKit and Firefox.
