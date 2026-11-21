# Architecture

Part of [Interactive project demos](README.md). Everything below is in the repository on `feature/interactive-project-demos`.

## 1. The shape of it

```
Project page  /{lang}/work/:slug                 Demo page  /{lang}/work/:slug/demo
┌──────────────────────────────────┐             ┌────────────────────────────────────────────┐
│ ProjectPage  (existing chunk)    │   link      │ DemoRoute  (lazy chunk "DemoPage")           │
│  └ DemoEntry  ── only when ──────┼────────────▶│  useProjectDetail(slug)                      │
│     parseProjectDemo(detail.demo)│             │  └ DemoShell  (frame, labels, tools, states) │
└──────────────────────────────────┘             │     └ DemoBoundary → Suspense → <Demo/>      │
                                                 │        └ lazy chunk per demo (registry.ts)   │
                                                 │           FinanceDemo | BookingDemo |        │
                                                 │           ShipmentDemo   (model.ts reducer)  │
                                                 └────────────────────────────────────────────┘
```

* **`ids.ts`** is the closed list: `DEMO_TYPES`, `DEMO_PROJECTS` (which slugs a type suits), `parseProjectDemo` (defensive reader, never throws, `null` for anything
  unregistered or ineligible). It imports no React.
* **`registry.ts`** is the only place a type becomes code: a fixed table of three `import('./…')` calls. There is no lookup by a string from outside, no dynamic
  import of a variable, no component created from data. `freshDemoComponent` makes a new lazy component for *Try again* (a lazy component that failed
  stays failed for ever).
* **`DemoShell.tsx`** owns what must be identical for every demo, so no demo can forget it: the way back, the three labels, the instructions, the real/simulated
  account, Restart, Full screen, the stage region and the loading / error / unsupported states.
* **A demo** (`finance/`, `booking/`, `shipments/`) is a `model.ts` of pure functions (types, validation, a `reduce(state, action)`, selectors) and a component that
  holds the state with `useReducer`. Sample data lives in `src/content/demos/*.ts` (the localization tooling treats `content/` as data, so sample sentences are
  not flagged as hard-coded UI).

## 2. Data flow: from the CMS to the page

1. **Admin** (`ProjectEditPage`, *Links* tab → "Interactive demo"): a switch, a select that offers only `demoTypesFor(slug)` (plus an empty option), and three
   text fields of ≤ 400 characters. The select can only produce a registered id.
2. **Backend** (`server/src/modules/projects/`): the setting is part of the project's `content_json` as `demo: { enabled, type, instructions }`.
   * `demoConfig()` normalizes input: a type outside `DEMO_TYPES` is refused (never stored), `enabled` without a type is refused, instructions are trimmed and
     cut to 400 characters.
   * `demoSuits()` (create and update) refuses a type that does not suit the slug the project will have after the save (`content.demo.type: invalid`).
   * **Duplicate** copies a project with the demo switched **off** (the copy has another slug).
   * `upgradeContent()` / `storedDemo()` read documents saved before demos existed as "switched off" (hence **no migration**), and read a stored demo defensively.
   * `publicDemo(demo, slug)` is what a visitor's API answer carries: only an enabled, registered, eligible type plus the instructions; anything else is `null`.
   The backend never imports from `src/`: it keeps its own copy of the two lists in `demo.ts`, and `server/test/projectDemos.test.ts` fails when they differ.
3. **Website**: `src/projects/api.ts` runs `parseProjectDemo(raw.demo, slug)` on the API answer; the static fallback content
   (`src/content/projectDetails/*.ts`) carries the same field for the three projects, so the site behaves the same without a backend.
4. **`ProjectPage`** shows `DemoEntry` only when `parseProjectDemo` returns a demo, the page is not an admin preview, and the project has a details page.
5. **`DemoRoute`** loads the same detail, and answers `NotFound` for a preview, a project without a page or an unavailable language, a *"this project has no demo"*
   state for a switched-off or unsuitable demo, and otherwise renders `DemoShell` with the project's name in the page language.

What the CMS cannot do (by construction): add a type, point at a URL or file, supply code or HTML (instructions are rendered as React text), enable a demo on a
project it does not suit. See [SECURITY](SECURITY.md).

## 3. Routing, head and SEO

* `src/routes/pages.ts`: `DEMO_PAGES` (`demo-spendly`, `demo-bookinghub`, `demo-logistics-platform`), `demoSlugOfPage`, a `DEMO_PATH` match in `resolvePage`. These
  pages are `indexable: false` → `noindex, follow`, so they are not indexed and are not listed in the sitemap (the built `sitemap.xml` has no demo URL).
* `src/App.tsx`: one route `work/:slug/demo` → lazy `DemoRoute`; the generic page loop skips demo pages.
* `src/routes/documentMeta.ts`: title and description from `content/demos/meta.ts` (a separate small file because the head is built for every page, so the main bundle
  must not carry the demos' other words).
* The project pages stay indexable under the existing rules. **No query parameter or hash** is used for demo state, so a demo state can never be a second indexable
  URL. Demo state is not in the URL at all.
* Prerender: the production build writes 112 pages; the demo pages are among those prerendered as `noindex` shells (see [TEST_RESULTS](TEST_RESULTS.md) for the `check:seo` numbers).

## 4. State, isolation and cleanup

* **State is local** to the component's reducer; nothing is stored, nothing is shared between demos or visits. **Restart** remounts the demo through a `key`
  (`${restart}-${lang}`): a language change also restarts it, because the sample descriptions are resolved into the page language when the state is created.
* **Inputs are validated** by the model, not by the markup: amounts are parsed from text to integer cents and range-checked, dates must be real calendar days inside the
  sample period, text has a maximum length and is trimmed, e-mail has a format check, counts are capped (the booking demo keeps at most 40 sample bookings), a select's
  value must be one of the registered options. A refused input changes nothing and names the field.
* **Money** is integer cents everywhere; no floating-point sums.
* **Cleanup**: the demo components register no listeners, timers, observers or loops. The one deferred call is a one-shot `requestAnimationFrame` that moves focus to the
  first wrong field after a failed submit. The frame's full-screen controller is the Lab's `useFullscreen` (listeners removed on unmount; leaving the page leaves
  full screen). Cleanup is measured in a real browser (DOM nodes and event listeners before and after repeated visits): see [TEST_RESULTS](TEST_RESULTS.md).

## 5. Full screen, motion, keyboard, language

* **Full screen**: the browser's own full screen on the frame where there is one; where there is none (an iPhone) or it refuses, the same view laid over the window
  (`data-lab-expanded` on `<html>`, with the frame's own CSS). A visible, named button and Escape leave it; the announcement is in a live region.
* **Reduced motion**: the only transition (the budget bars' fill, a `transform`; the site's motion tests forbid transitioning layout) is declared inside a `prefers-reduced-motion: no-preference` query; the demos have no other animation.
* **Keyboard**: every control is a native element (`button`, `select`, `input`, radio group in a `fieldset`/`legend`); order follows the reading order; focus is visible
  (the site's focus ring); after a failed submit focus moves to the first wrong field; `Escape` leaves full screen.
* **Language**: every string is a `tri()` in `src/content/demos/*.ts` (hu / en / nl), read through `useDemoText`. Numbers, money and dates use `Intl` with the page language.
  The localization checks (`i18n:check`, `i18n:validate`: spelling, literal sentences, forbidden foreign words) include `content/demos/`.

## 6. Loading and size

* Nothing of the demos is in the initial load of any page except a small `DemoEntry` (inside the existing `ProjectPage` chunk) with its words and the `useDemoText` hook (`content/demos/entry.ts`, a 2.4 KB chunk), and the page table and head strings (in `main`).
* `DemoPage` (frame), `FinanceDemo`, `BookingDemo` and `ShipmentDemo` are separate chunks, requested only when a demo page is opened. Measured sizes and the effect on the
  initial load are in [TEST_RESULTS](TEST_RESULTS.md) (generated by `tools/audit/demos-perf.cjs`).
* An unsupported browser (no `Intl.DateTimeFormat`, `Intl.NumberFormat`, `Array.prototype.at`, `requestAnimationFrame` or `matchMedia`) gets the *cannot run the demo*
  state instead of a broken page; the frame checks before it asks for the demo's chunk.

## 7. Decisions not to undo

1. **Closed registry, three synced lists** instead of a plugin or loader system. A fourth demo is a deliberate code change with tests.
2. **No migration**: `demo` lives in `content_json` and old documents read as "off". The price: existing production rows need an administrator (see [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md)).
3. **The disclosures are the frame's**, fixed in code. The CMS can add instructions; it cannot hide the labels or the real/simulated account.
4. **Demos are pure reducers over invented data**, not iframes, not the real apps. No demo ever talks to a project backend.
5. **Demo pages are `noindex`** and carry no state in the URL.
6. **Restart and language change remount** the demo (a clean, testable reset) instead of partial resets.
7. **The head strings are a separate file** (`content/demos/meta.ts`) to keep the main bundle small.

## 8. Adding a demo type

1. Add the id to `DEMO_TYPES` / `DEMO_PROJECTS` in `src/demos/ids.ts`, `server/src/modules/projects/demo.ts` and `src/admin/lib/projects.ts` (the test checks all three).
2. Add a lazy loader and a component entry in `registry.ts`.
3. Write `model.ts` (pure, tested), the component and its styles; use the shared `ui/` pieces.
4. Add its texts in hu / en / nl (`content/demos/<name>.ts`), including the `real` and `simulated` lists in `shell.ts`, the name and one-line summary in `entry.ts` and the head description in `meta.ts`.
5. Add the page to `DEMO_PAGES` if the slug is new, the entry in the project's details file, and the seed (`npm run catalog:seed-export`).
6. Extend the journey and the audit lists (`tools/e2e/demos-journey.cjs`, `tools/audit/audit-demos.cjs`), and run `npm run i18n`.
