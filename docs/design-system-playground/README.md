# Design System Playground

PROMPT 36. Branch `feature/design-system-playground`, based on `feature/interactive-project-demos` (`23e5904`). Nothing here is merged or deployed, and nothing was verified in
production. Documents: [ARCHITECTURE](ARCHITECTURE.md) · [COMPONENTS](COMPONENTS.md) · [ACCESSIBILITY](ACCESSIBILITY.md) · [PERFORMANCE](PERFORMANCE.md) ·
[TEST_RESULTS](TEST_RESULTS.md) · [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md).

## What this is

A page at **`/{lang}/lab/design-system`** (hu / en / nl) where a visitor handles the Controlled Chaos design system: change the brand colours, the typography, the
layout and the motion, and watch the website's **real components** take them. It is a **tool of the Lab, not a seventh experience**: the Lab still has exactly six
(a test says so), the playground is in none of their lists, its id does not start with `lab-`, and the Lab's overview links to it from a band of its own after the six.

Everything a visitor changes lives in one reducer in the page's own component. It is **not saved** (no storage), **not sent** (no request, no analytics), and **never
written to the site's theme or tokens**: the previews are *stages* that carry a theme and custom properties of their own. A reload, or leaving, restores everything.

## The five laboratories

| # | Laboratory | What a visitor can do |
| --- | --- | --- |
| 01 | **Colour** | Start from the five brand tokens (Racing Red `#FF161F`, Carbon Black `#0B0B0D`, Cobalt Blue `#445CFF`, Warm Paper `#F4F0E8`, Graphite `#303036`). Type a HEX (3 or 6 digits, with or without `#`, validated with the reason), pick with the native colour picker, **copy** a value or the palette's CSS, restore one colour. Each colour says whether it is the **original brand token** or **changed here, temporary**. A *pair* (any text colour on any background) shows its **WCAG 2 contrast** and the five levels (AA/AAA text, AA/AAA large text, interface parts) in words. A stage in the preview theme draws real buttons, a badge and a service card in the chosen colours. A **report** lists the nine role pairs the preview draws (text, secondary, muted, accent text, link, labels on the accent and secondary buttons, focus ring, border) with ratio, need and pass/fail, and says in words how many fail AA. |
| 02 | **Type** | The three typefaces the project already has: **Archivo** (the brand's variable face, weight 100–900 and a width axis), the **system UI** stack, the **monospace** stack. Body size 12–40 px, heading and body weight, line height 0.9–2.2, letter spacing −0.08…0.4 em, width 62–125 % (Archivo only), a scale ratio (1.125…1.5), and the visitor's **own heading, paragraph and caption** (limited, shown only as text). The same three styles are drawn on a **dark and a light stage side by side**. Copy the CSS. |
| 03 | **Components** | Eight of the website's real components, one at a time, with their variants and properties, a one-line explanation, their **source path**, and a reset for the component: buttons (variant, size, arrow, full width, disabled, outcome, and a real loading state when pressed), badges, form fields (input, select, text area with counter, checkbox; hint, error, disabled), links, the main navigation (header bar and footer variants), section heading (three sizes, description, index), service card (featured, price state, action), project card (six layouts, four states, linked or not). |
| 04 | **Layout** | Container width 280–1280 px, columns 1–6, gap 0–64, padding 0–64, corner radius 0–40, alignment (start/centre/end/stretch), and the **preview width** (a phone 360, a tablet 768, a desktop 1280, or anything from 320 to 1280). Six real service cards in a frame; **the columns that really fit** are worked out from the frame's measured width, so the same layout is seen answering each size. Copy the CSS. |
| 05 | **Motion** | Six examples of the site's own motion language (hover and focus, button feedback, a card's entrance, a scroll-inspired reveal in its own scroll box, micro-interactions, a page-transition concept) driven by four bounded parameters (duration 80–1200 ms, the site's five easing curves, distance, stagger) and a **reduced-motion switch**; each example has its own **Replay**. Nothing loops. |

Around them: an editorial introduction (the page's own `PageHero`), a bar with the five section links (the current one marked), the **preview theme** (dark/light, previews only),
**Reset everything** and a status of whether anything differs from the original, a reset for each laboratory, a polite status region that announces copies, resets, theme and
replays, and a way back to the Lab at the top and at the bottom.

## Where things are

| Area | Files |
| --- | --- |
| Page | `src/pages/DesignPlaygroundPage.tsx` (lazy chunk) |
| Models (pure, tested) | `src/playground/color.ts`, `typography.ts`, `layout.ts`, `motion.ts`, `state.ts` (reducer), `clipboard.ts` |
| Laboratories | `src/playground/ColorLab.tsx`, `TypeLab.tsx`, `ComponentLab.tsx`, `LayoutLab.tsx`, `MotionLab.tsx`, `PreviewStage.tsx`, `parts.tsx` + a `.module.scss` each |
| Words (hu/en/nl) | `src/content/playground/text.ts` (the page), `entry.ts` (the Lab's band), `meta.ts` (the head), `stacks.ts` (font stacks, data) |
| Routing and head | `src/routes/pages.ts` (`PLAYGROUND_PAGES`), `src/App.tsx` (lazy route), `src/routes/documentMeta.ts`, `src/seo/jsonLd.ts`, `src/motion/config.ts` (Lab motion scope) |
| The Lab's link | `src/components/lab/page/DesignToolBand.tsx`, `src/pages/LabPage.tsx` |
| Tests and tools | `src/playground/model.test.ts`, `src/playground/playground.test.ts`, `tools/e2e/playground-journey.cjs`, `tools/audit/audit-playground.cjs`, `tools/audit/playground-perf.cjs` |

## Commands

```powershell
npx vitest run src/playground                      # the playground's unit and rendering tests
npx tsc -b ; npx oxlint ; npm run i18n             # types, lint, localization
npm run build ; npm run check:seo                  # production build with prerendering, then the SEO validation
# Browser checks (they need Playwright and axe-core: see tools/audit/README.md for AUDIT_PLAYWRIGHT / AUDIT_AXE)
node tools/e2e/playground-journey.cjs                                     # 26-step journey against the dev server (npm run dev on :5173)
node tools/audit/audit-playground.cjs dist [--components] [--quick]       # responsive + accessibility matrix on the production build
node tools/audit/playground-perf.cjs dist --base <dist of the base commit> # load, activation and interaction measurements
```

## Limits (honest)

* Verified in headless Chrome (system Chrome via Playwright) and by unit tests only. **Not** in Safari, Firefox, on a physical phone or tablet, with a screen reader, or in
  production. The "phone" numbers are an emulation (390 px, 4× slower CPU), not a device.
* When a palette is changed, the preview's **semantic colours are derived** from the five brand colours by the playground (see [ARCHITECTURE](ARCHITECTURE.md) §3). The site's own
  tokens are tuned by hand, so with the original palette the previews use the site's real tokens exactly, but the contrast *report* is computed from the derived roles and can differ
  slightly from the live site's. The page says so.
* A preview is not a destination: links inside it do not navigate. The `Section` component (it takes the site's theme itself) is not shown in the component laboratory; the stage is its own surface.
* Only the three typefaces the project has are offered (no serif, no downloaded face). Copied CSS is a starting point, not a finished stylesheet.
* No state is kept across a reload and none is shared by a link: that is the brief's rule, not an omission.
