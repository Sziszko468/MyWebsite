# Mobile-first: the system, and what PROMPT 13.2 changed

This is the reference for how the site behaves on a phone, a tablet and a desktop, written after the PROMPT 13.2 pass (2026-11-06). Measurements and the list of what could **not** be verified are in `docs/release/mobile-performance-report.md`; this file says how things are built and why.

**Read this first: most of the brief was already true of the code.** The site was written mobile-first from PROMPT 01 (`up()` mixin, fluid tokens, container queries, safe-area bottom padding on the sticky bars, a phone menu, a Lab whose stage takes touch, adaptive quality tiers with a frame-rate watchdog). The pass therefore started with measurements instead of a rewrite: the layout matrix (`tools/audit/audit-matrix.cjs`) at 320, 360, 390, 430, 768, 1024, 1366, 1440 and 1920 px plus 568×320 and 844×390 landscape on 21 pages found **no sideways scrolling, no clipped content and no overlapping navigation** before anything was changed. What the pass found and changed is listed in "What this pass changed"; what it did not change is listed in "Not done".

## The system

### Breakpoints

One list, in `src/styles/_mixins.scss`, written mobile-first: base styles are for the narrowest screen and `@include m.up('sm' | 'md' | 'lg' | 'nav' | 'xl')` layers on top (`sm` 36rem, `md` 48rem, `lg` 64rem, `nav` 70rem where the header switches from the menu button to the inline navigation, `xl` 80rem). The brief's device classes map onto them as: small mobile 320–374 and standard 375–429 and large 430–767 are the base styles (components that need to differ inside that range ask their own width with a container query instead of a global breakpoint), tablet is `md`, laptop is `lg`/`nav`, large desktop `xl` and a capped container. A few components use `max-width` queries on purpose (the Work page's list rows, below `md`); those say so in a comment.

### Tokens (`src/styles/tokens.css`)

| Token | What it is |
| --- | --- |
| `--fs-lg … --fs-display` | Fluid type: `clamp()` between a phone size and a desktop size. |
| `--space-section` | Fluid vertical rhythm of a band. |
| `--space-fluid-sm / -md / -lg`, `--heading-fluid-lg` | Added in this pass for new layouts that need to follow the viewport instead of the fixed 4 px scale. |
| `--gutter` | The page's side padding, fluid, and **never less than the notch needs on either side** (`max(clamp(…), var(--safe-left), var(--safe-right))`). Every container, the header, the menu, the sticky bars and the Lab frame use it. |
| `--safe-top / -right / -bottom / -left` | `env(safe-area-inset-*, 0px)`. Components write these tokens, never `env()` (`src/styles/mobile.audit.test.ts` fails on a raw `env(safe-area-inset…)`). |
| `--header-bar`, `--header-height` | The sticky header's bar (4.5 rem) and its full height with the top inset. Everything that starts under the header offsets by `--header-height`. |
| `--size-touch` (2.75 rem), `--size-target` (2.75 rem, 3 rem on a coarse pointer) | The comfortable target. `Button size="sm"` is 40 px with a mouse and `--size-touch` (44 px) with a finger. |

`viewport-fit=cover` is set in `index.html` and `admin.html`, so the page really is drawn under the notch and the insets are non-zero; `--gutter` and the header, intro, menu, sticky CTA, Lab frame and admin bars pad themselves back. The viewport never carries `user-scalable=no` or `maximum-scale` (WCAG 1.4.4); a test holds that.

### Touch and input (`src/styles/global.scss`)

- Controls (`a`, `button`, `summary`, `label`, `select`, `[role=button|tab|switch]`, inputs except ranges) get `touch-action: manipulation`: no double-tap zoom and no 300 ms wait, pinch-zoom of the page still works.
- On a coarse pointer, text fields, selects and text areas are never under 16 px, because iOS Safari zooms the page when a smaller field is focused and does not zoom back.
- The tap flash is the brand red, quiet.
- Nothing important depends on hover: every hover rule is inside `@include hover` (`@media (hover: hover)`), the mouse-only pointer effects check `pointerType`, the phone has visible controls instead (menu button, details links, chips).

### Viewport units

Full-height boxes use `dvh` (the height that follows the browser's collapsing address bar) with `vh` only as a fallback written first, or `svh` (the stable height) for heroes whose layout must not move when the bar collapses. A test reads every stylesheet for a `100vh` that is not followed by its dynamic upgrade.

### Adaptive quality (the brief's High / Balanced / Low-power)

There are three tiers (`high`, `medium`, `low`; the Lab calls them High / Balanced / Performance and lets the visitor pick or choose Auto) and one governor per scene:

1. **First guess** from what the browser reports (`hero/velocityHeroConfig.ts` `pickQuality`): Save-Data, a 2G connection (`effectiveType`, added in this pass), cores, device memory, a coarse pointer, the width. Never the user agent.
2. **Lowering** (existing): a frame-rate watchdog looks at windows of frames; two slow windows (or one very slow one) lower the **resolution** first (×0.75 steps down to 0.5, the cheapest remedy), then the **tier**, then, if even the lowest tier cannot keep up, the static graphic takes over.
3. **Restoring** (new, `hero/qualityGovernor.ts`): a screen locked to 60 Hz shows 16.7 ms frames whether the GPU is idle or nearly full, so headroom cannot be read from the frame time. The governor therefore **probes**: after 12 s of steady frames since the last lowering it asks for one step back up (resolution first; in the Lab also the tier, never above what the device was first given); the watchdog's next verdict says whether that held. A step that does not hold is taken back at once and the governor waits twice as long; after two failed attempts it stops for the visit. A device that cannot hold the higher level therefore costs two short stutters, never an oscillation. The hero and the intro restore only the resolution (a tier change rebuilds the scene and shows the static graphic for a moment, which is not worth interrupting the visitor for); the Lab restores both.
4. The visitor's own choice in the Lab (`High`, `Balanced`, `Performance`) is never overridden; only the resolution adapts then.

### The Velocity Field and the intro on a phone

The intro is a modal `<dialog>` filling `100dvh`, the page behind it inert and not scrolling (`html:has(dialog[open]) { overflow: hidden }`). The finger is the field's input:

- **`touch-action: none` on the intro's content** (fixed in this pass, see below), except when the content is taller than the screen (`data-scrollable`, a ResizeObserver) where it may pan so the entry button is never out of reach.
- A drag moves the field (pointer position, velocity and energy); a quick, still tap makes a wave (`HeroDriver`: a touch becomes a wave only if it ends as a tap, so a scroll never fires one); a tap on the background does **not** enter (a stray touch is not a decision), the button does.
- The entry row spans the width and sits at the bottom, where the thumb is; in a phone held sideways the headline and the way in sit side by side so the button needs no scroll.
- The notch insets are respected on all four sides (`--safe-*`), and the page-level hero (not the intro) keeps vertical scrolling: there a drag is a scroll and a tap is a wave.

### The Lab

**Five** experiences, not six: Particle Universe, Liquid Matter, Type in Motion, Infinite Space, Chromatic Distortion. The brief lists Generative Objects as a sixth and asks for its "existing procedural functionality" to be preserved. That experience **does not exist any more**: the owner ordered it deleted on 2026-11-01 (git `9275457` is the last commit that has it; see the Lab section of the README). It was not rebuilt, and nothing under another name was added. If it should come back, that is a decision for the owner, with the AI part left out as the brief says.

All five take the finger through pointer events on the stage (`useLabInput.ts`): a press captures the pointer, a drag moves it, a release ends it, `touch-action: none` keeps the browser from taking the drag for a scroll, and the arrow keys and Enter do the same without a mouse. Measured in this pass (CDP touch events at 390×844): 14 pointer moves, 0 cancels, the page does not scroll, on all five.

The hidden NFSU2 egg stays separate from the five. `nfsu2.xyz` still answers `x-frame-options: DENY` and `frame-ancestors 'none'` (re-read 2026-11-06), and this site's own CSP says `frame-src 'none'`: **there is no frame and none is attempted**, and nothing tries to get around the other site's refusal. A tap on the Lab headline's red full stop (the hit area is 44×44 although the glyph is small) plays a loading wipe, then a screen says plainly what the other site is and offers **Open NFSU2** (a new tab, no referrer) and **Back to the Lab** (the exit; Escape also closes). Measured on 320×568, 390×844, 844×390 and 568×320: no overflow, no scrolling, both controls 48 px high, Back works by touch.

### The Work page on a phone

Not the desktop grid in one column. Below `md`:

- **Filters** are one swipeable row (scroll-snap, edge fade, the chosen chip scrolls into view, 44 px high), not three rows of wrapped pills that push the work down. From `md` they wrap again.
- **A rhythm of full cards and list rows**: the first project and every third one is a full card (picture above), the others are list rows (a thumbnail tile with its caption beside the title, state, description, technologies and "Details"). A row needs a card at least 20 rem wide (a container query on the list item); a narrower one (a 320 px screen) stays stacked. Nothing is cut: only rearranged, and the page is about 15 % shorter at 390 px. From `md` every card is the grid's ordinary card (2 columns, 3 from `xl`).

### Images

Project screenshots are WebP at 1440 px (and 720 for phone screenshots). `tools/images/make-variants.cjs` makes 480 and 800 px copies with the system Chrome and writes `src/content/imageVariants.ts`; `utils/responsiveImage.ts` builds the `srcset`, and the lead screenshot, the gallery thumbnails and the project cards offer them with a `sizes` that is **measured, not guessed** (`tools/audit/mobile/image-widths.cjs` draws the page at 13 widths from 320 to 1920 px: the lead picture is 89-92 vw below 64 rem and up to 1054 px above it, the desktop gallery 26-62 vw; a `sizes` that claims less than the real width makes the browser pick a copy that is then stretched, which the layout matrix flags as "image upscaled"). A phone downloads the 800 px picture (about 20-40 kB) instead of the 1440 px one (50-120 kB); the lightbox shows the original.

**What this did and did not buy** (measured, `docs/release/mobile-performance-report.md` §3): the pictures on a project page fell from 50-54 kB to 21 kB on a phone (the page's transfer −8 to −9 %), and the LCP did **not** move on any connection speed. The lead screenshot is the largest paint on a project page, but the page's HTML carries only the `<head>`: the `<img>` exists after the page's script has run (FCP and LCP are 2 s apart on a slow connection), so the picture's size is not what the LCP waits for. A `<link rel="preload" as="image">` for it was tried and measured the same, so it was **removed** again. The real fix is a prerendered body for project pages (the build writes the head only), which is a larger change that was not made.

Pictures the administrator uploads are stored as they were sent and get neither a `srcset` nor a preload (the server does not re-encode: an honest gap, see the CMS README).

### The Shop and the administration

Both were already phone-first and were re-checked, not redesigned: the package comparison is a grid with table roles that becomes one card per topic on a phone (no wide table), the request builder keeps its answers, shows "Step n of 6" with a progress bar and rows of 44+ px, and the cart's sticky action sits under the dialogs and above the home indicator (`StickyCta`). The administration has a bottom tab bar and a "More" sheet on a phone, stacked forms and tabbed editors; in this pass its bottom bar, header and content were made to include the safe areas (a bar of fixed height with padding inside it squeezed its buttons on a device with a home indicator).

## What this pass changed (and why)

| Found | Evidence | Change |
| --- | --- | --- |
| **A finger dragging over the intro did not move the field.** The browser took the first move for a scroll and cancelled the pointer. | CDP touch drag on the built site: 1 `pointermove`, 1 `pointercancel`, field variables frozen (`--hero-cx` −0.577, energy 0.000). | `touch-action: none` on the intro's content (pan only when it overflows). After: 12 moves, 0 cancels, `--hero-cx` −0.51 → 0.38, energy 0.19 → 0.81, at 390×844, 844×390 and 320×568. |
| Quality only ever went **down**: a stutter while a page loaded left a phone at a lower resolution for the whole visit. | Read `useSceneHealth`, `LabScene`, `VelocityHeroScene`: no path back up. | `QualityGovernor` (probing, back-off, give-up) wired into the Lab (resolution and tier) and the hero/intro (resolution); 11 unit tests on simulated frame times. |
| `viewport-fit=cover` was missing from the public pages while the admin had it, and no `left`/`right` inset was ever applied. | Read `index.html`, grep `safe-area`. | Meta added; `--safe-*` tokens; `--gutter`, header, menu, intro, sticky CTA, Lab frame, admin bars use them; verified with CDP safe-area insets (47/34 portrait, 59/59 landscape): nothing outside the safe rectangle on home, Work, cart, Lab and the intro. |
| The Work page was a single column of identical tall cards with three rows of filter pills. | Screenshot at 390 px (4324 px tall). | The rhythm and filter row above (3789 px tall). |
| Double-tap zoom and the iOS focus zoom were not guarded. | grep `touch-action`; fields were 16 px only by accident. | Global `touch-action: manipulation` and the 16 px floor on coarse pointers. |
| `Button size="sm"` (the filter chips) was 40 px on a phone. | Read the stylesheet. | 44 px on a coarse pointer. |
| Every phone downloaded the 1440 px screenshot. | `docs/technical-audit.md` §3 called it a known cost. | `srcset` with 480/800 px copies (see Images). |
| **The Content-Security-Policy hash of the inline theme script was computed over CRLF text, and a browser hashes LF text.** On a Windows checkout (git `autocrlf`) every page logged a CSP violation and the browser refused its own pre-paint theme script. Not new: a clean checkout of the previous commit builds the same wrong hash. | A matrix run printed the console error on all 231 loads; the `_headers` hash `CnEH3c…` against the `tvDrXJ…` a browser computes. | `scripts/prerender.mjs` and `scripts/check-seo.mjs` normalise newlines before hashing; `seo/cspHash.test.ts`. After: 0 CSP errors in the matrix. |
| A 2G connection got the same first quality guess as Wi-Fi. | Read `pickQuality`. | `effectiveType` 2g / slow-2g starts at the lowest tier. |
| The admin's bottom bar had its inset padded **inside** a fixed height. | Read `shell.module.scss`; after the change measured with CDP insets: 94 px bar (60 + 34), buttons 59 px. | `--admin-bottom-nav-total`; the header, content and bar also keep clear of the side insets. |
| Signing in at `/admin/login` left the administrator on that address with "This page does not exist" (the sign-in is a gate, not a route). | Seen while scripting the admin check. | `/admin/login` redirects to the dashboard. |

## Not done, and why

- **A sixth Lab experience** (see above): deleted by the owner; not rebuilt.
- **An iframe for NFSU2:** the other site refuses it and the brief says never to bypass that.
- **Real-device testing, Safari/WebKit, Firefox, screen readers:** none is available here. `docs/release/mobile-performance-report.md` lists exactly what was run (Chrome and Edge, emulation, synthetic touch) and a checklist for the real devices.
- **`content-visibility: auto`** on long bands: it would move anchors and shift layout when an estimated height is wrong; not worth the layout-shift risk without real-device measurements.
- **A smaller brand font:** the variable font with its width axis is 90 kB for Latin; the expanded headings are part of the identity, so the axis stays. Only the Latin file is preloaded; Latin-ext and Vietnamese load on demand (unicode-range).
- **Server-side image re-encoding** for uploaded pictures (see the CMS README).
- **A mobile-specific shop configurator structure:** it already is the mobile structure.

## Re-running the checks

```bash
npm test                      # includes src/styles/mobile.audit.test.ts, hero/qualityGovernor.test.ts, utils/responsiveImage.test.ts
npm run typecheck && npm run lint
node tools/audit/audit-matrix.cjs dist 4801 --sizes=320x640,360x740,390x844,430x932,768x1024,1024x768,1366x768,1440x900,1920x1080,568x320,844x390
node tools/images/make-variants.cjs   # after adding a picture under public/projects (AUDIT_PLAYWRIGHT points at playwright)
```

The touch, safe-area, restore and egg checks used Playwright with CDP (`Input.dispatchTouchEvent`, `Emulation.setSafeAreaInsetsOverride`, `Emulation.setCPUThrottlingRate`); their scripts are in `tools/audit/mobile/` (`intro-touch`, `lab-touch`, `safe-area`, `admin-safe-area`, `egg`, `restore`, `image-widths`, `shots`; see its README). `tools/audit/vitals.cjs` has three phone profiles (`phone-fast`, `phone`, `phone-slow`) and retries a reset navigation.
