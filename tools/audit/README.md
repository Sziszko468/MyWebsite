# Browser audits

The scripts the PROMPT 11 audit was run with (results: `docs/technical-audit.md`). They drive a real Chrome through Playwright against the **built** site, so build first (`npm run build`). They are not part of `npm test`, and Playwright and axe-core are not dependencies of this project: install them anywhere (`npm i playwright-core axe-core` in a scratch folder) and point the scripts at them.

```bash
export AUDIT_PLAYWRIGHT=/path/to/node_modules/playwright-core   # or `playwright`
export AUDIT_AXE=/path/to/node_modules/axe-core/axe.min.js
```

They use the system Chrome (`channel: 'chrome'`, with `--ignore-gpu-blocklist`, so a real GPU is used if there is one). Each starts its own static server (`serve.cjs`: brotli/gzip, applies `dist/_headers`, so the real Content-Security-Policy is in force) and needs no setup. On Git Bash for Windows set `MSYS_NO_PATHCONV=1` when an argument starts with `/`.

| Script | What it checks |
| --- | --- |
| `seo-browser.cjs` | Every built page loaded under the production CSP: no console errors or CSP violations, the head the build wrote is still the head after the app ran, in-app navigation and the language switch keep the head in step, 404/cart say `noindex`, the intro opens on the home page only. |
| `audit-a11y.cjs` | axe-core (WCAG 2.0/2.1/2.2 A and AA, best practice) on every page × language × theme, plus structure: one `h1`, heading order, alt text, link and button names, labels, duplicate ids. |
| `audit-keyboard.cjs` | A Tab-only walk of the key pages: the skip link, every control reachable, no trap, focus visible, not covered by a sticky bar (WCAG 2.4.11), target size (2.5.8). `--w --h --mobile=1` for other sizes. |
| `audit-matrix.cjs` | Layout at the required viewports (portrait and landscape), languages and themes: sideways scrolling, elements outside the viewport, tiny text and targets, upscaled images, console errors. `--sizes=1920x1080,390x844 --langs=en,hu --themes=dark,light`. |
| `audit-admin.cjs` | The **administration** (`/admin`, PROMPT 13), against a running backend that serves the built site (`STATIC_DIR`) and an administrator of a **throw-away database**: every screen × viewport (1920×1080 … 320×640) × theme × language for sideways scrolling, elements outside the viewport, targets under 24 px, controls without a name, one `h1`, and axe-core; the delete dialog (focus starts on the safe button, Tab stays inside, Escape cancels and returns focus) and the phone's "More" sheet. Signs in once (the sign-in is rate limited). `--base --email --password --sizes --themes --langs --out`; exit code 1 on any finding. |
| `webgl.cjs` | No WebGL at all, context loss and restore on the hero and a Lab experience, and which pages load Three.js. |
| `vitals.cjs`, `inp.cjs`, `timeline.cjs` | First/largest paint, layout shift and blocking time (CDP: 4× CPU slowdown, 150 ms / 1.6 Mbit/s for the phone profile); interaction latency from real clicks; where the time to first paint goes. |
| `devharness.cjs` | Starts a mock collector and the dev server with local endpoints: analytics consent, what an event may carry, the forms' success/failure/timeout handling, and a lazy page whose code fails to load. |
| `mapsize.cjs` | What is inside a bundle (`npx vite build --sourcemap --outDir /tmp/map --emptyOutDir`, then `node mapsize.cjs /tmp/map index-`). |

All of this is emulation in Chromium: no physical device, no Safari or Firefox, no screen reader.
