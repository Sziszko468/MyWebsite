# Interactive project demos

PROMPT 35. Branch `feature/interactive-project-demos`, based on `feature/lab-2-creative-universe` (`bf83a7d`). Nothing here is merged or
deployed, and nothing was verified in production. Documents: [ARCHITECTURE](ARCHITECTURE.md) · [PROJECT_ELIGIBILITY](PROJECT_ELIGIBILITY.md) ·
[SECURITY](SECURITY.md) · [TEST_RESULTS](TEST_RESULTS.md) · [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md).

## What this is

Three of the portfolio's four projects now have a **dedicated demo page** where a visitor can try the behaviour the project's own repository
documents, on invented sample data, without leaving the website. It is a focused addition to the existing portfolio, project pages and CMS; it does not
rebuild any of them, and it adds no dependency, no backend route, no database table and no migration.

| Project | Page | Demo | What a visitor can try |
| --- | --- | --- | --- |
| Spendly | `/{lang}/work/spendly/demo` | **Transactions and budgets** (`finance-workbench`) | Add and delete transactions (the form names the fields that are wrong), search, filter by type, category and period, sort, page; watch the monthly budget bars move (warning from 80 %, over budget past 100 %) and the spending by category follow. |
| BookingHub | `/{lang}/work/bookinghub/demo` | **Booking flow** (`booking-flow`) | Choose one of six sample services, a weekday and a free time, fill in the form (required-field and e-mail checks), see the summary, then change a sample booking's status. **No booking is made and no e-mail is sent.** |
| Logistics Platform | `/{lang}/work/logistics-platform/demo` | **Shipment board** (`shipment-board`) | Move a shipment through `NEW → ASSIGNED → LOADING → IN_TRANSIT → DELIVERED` (or `CANCELLED`) as an administrator, dispatcher, driver or accountant; cancelling and stepping back need a reason; assigning a driver and a truck is refused for expired papers or an overlapping shipment. |

**Hollandia Kezdőknek has no demo**: it has no repository and no details page, so there is nothing real to reproduce. The brief's other concept types (a
data dashboard, a frontend-creative demo) were not forced onto any project either, because no project has a verified capability that would back them:
see [PROJECT_ELIGIBILITY](PROJECT_ELIGIBILITY.md).

## What a visitor sees

* On the project's page, below its hero, **one entry band** ("Try it": the kicker *Interactive demonstration*, one sentence, one button). Projects without a
  demo have no band and their page is unchanged.
* On the demo page, in every language (hu / en / nl): a back link to the project, an `h1`, **three labels the frame draws itself** (*Interactive
  demonstration*, *Simulated data*, *Nothing is saved or sent*), a short "How to use it", a **Restart** button, a **Full screen** button, and an
  account (`<details>`) of **what is real in the project and what is simulated or left out here**. A demo cannot omit any of these: they belong to the frame.
* States: loading, an error with *Try again* (a failed chunk is fetched again) and a link back, *this browser cannot run the demo* (a feature check),
  *this project has no demo* (switched off, or not for this project), and, for a visitor without JavaScript, the sentence that the demo needs it.
* Nothing is saved or sent: the demo components contain no network, storage, timer, listener or loop code (their only deferred call is one `requestAnimationFrame`
  that moves focus to the first wrong field after a failed submit; the full-screen listeners belong to the shared frame and are removed on leaving), and in a real browser no request was made and
  `localStorage` / `sessionStorage` did not change while each demo was used (see [TEST_RESULTS](TEST_RESULTS.md)). A reload brings the sample data back as it was.

## Real vs simulated, in one place

The details are in the demo pages themselves (and fixed in code: the administration can add instructions but never remove a disclosure). In short:

* **Real, and reproduced**: only behaviour the project's repository documents (rules, states, validation), reimplemented in the browser as small pure
  functions.
* **Simulated**: every record (invented names, dates, amounts, shipments, drivers, trucks), the calculations' location (the browser, not the project's
  API/database), availability of booking times (the real BookingHub has none, the demo *adds* it as an illustration and says so), the budget limits
  (fixed sample values), a single currency, no account, no saving.
* **Not connected to anything**: no project backend, no production database, no payment/e-mail/booking service, no key, no private endpoint.

## Using the framework

* **Entry point**: `DemoEntry` on `ProjectPage`, shown only when the project's detail carries a valid `demo` and the page is not a preview.
* **Route**: `work/:slug/demo` → lazy `DemoRoute` → `DemoShell` → the demo's own lazy chunk. Page ids are `demo-<slug>`; the pages are `noindex, follow`
  and are not in the sitemap.
* **CMS** (Admin → Projects → a project → *Links* tab → "Interactive demo"): a switch, a type from a closed list (only the types that suit the project's
  slug are offered), and optional instructions of at most 400 characters per language. There is no migration: the setting lives inside the project's
  existing `content_json`. See [ARCHITECTURE](ARCHITECTURE.md) and the production prerequisite in [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md).
* **A new demo type** is a code change on purpose: add the id to the three synced lists, a lazy loader to `registry.ts`, the component, its texts in three
  languages, and tests. There is no way to add one from the administration.

## Commands

```powershell
npx vitest run src/demos server/test/projectDemos.test.ts   # the demos' unit tests and the CMS/eligibility tests
npx tsc -b                                                   # TypeScript
npx oxlint                                                   # lint
npm run i18n                                                 # localization check and validation (spelling, literal sentences)
npm run build ; npm run check:seo                            # production build with prerendering, then the SEO validation
# Browser checks (they need Playwright and axe-core: see tools/audit/README.md for AUDIT_PLAYWRIGHT / AUDIT_AXE)
node tools/e2e/demos-journey.cjs                             # 26-step journey against the dev server (npm run dev on :5173)
node tools/audit/audit-demos.cjs dist                        # responsive + accessibility matrix on the production build (add --quick for a fast pass)
node tools/audit/demos-perf.cjs dist --base <dist of the base commit>   # load, activation and interaction measurements
```

## Where things are

| Area | Files |
| --- | --- |
| Framework | `src/demos/` (`ids.ts`, `registry.ts`, `support.ts`, `DemoShell.tsx`, `DemoEntry.tsx`, `DemoPage.tsx`, `ui/`) |
| Demos | `src/demos/finance/`, `src/demos/booking/`, `src/demos/shipments/` (each: `model.ts` pure reducer, a component, styles, tests) |
| Words (hu/en/nl) | `src/content/demos/` (`entry.ts` for the project page, `meta.ts` for the head, `shell.ts` for the frame, `finance.ts`, `booking.ts`, `shipments.ts`) |
| Routing / head | `src/routes/pages.ts`, `src/routes/documentMeta.ts`, `src/App.tsx` |
| Project data | `src/content/projectDetails/*.ts`, `src/projects/api.ts`, `src/content/projectsExport.ts`, `server/seed/projects.seed.json` |
| Backend | `server/src/modules/projects/demo.ts`, `content.ts`, `service.ts` |
| Admin | `src/admin/pages/ProjectEditPage.tsx`, `src/admin/lib/projects.ts`, `src/admin/api/projectTypes.ts`, `src/admin/i18n/cms.ts` |
| Tests and tools | `src/demos/**/*.test.ts`, `server/test/projectDemos.test.ts`, `tools/e2e/demos-journey.cjs`, `tools/audit/audit-demos.cjs`, `tools/audit/demos-perf.cjs` |

## Limits (honest)

* Verified in headless Chrome (Chromium via Playwright, system Chrome) and by unit tests only. **Not** verified in Safari, Firefox, on a physical phone or
  tablet, with a screen reader, or in production. The "phone" numbers are an emulation (390 px, 4× slower CPU), not a device.
* Existing production databases have no `demo` setting yet: until an administrator switches it on in the admin (re-seeding does not help: the seed only fills an empty projects table), **the live site shows no
  entry** even after this code is deployed. See [LAUNCH_CHECKLIST](LAUNCH_CHECKLIST.md).
* The demos reproduce documented behaviour; they are not the projects. The projects have no live address (their status is *demo*), and nothing here claims otherwise.
