# PROMPT 13.1 — testing report

Dynamic Portfolio CMS & Premium Shop Content Management. This report says what was built against the brief, how it was tested, what the tests **found**, and what was **not** done or **not** tested. The feature itself is described in [`../cms/README.md`](../cms/README.md). Date of the runs: 2026-11-05/06.

## 1. Verdict

The portfolio, its pictures and the website's wording are now managed from the administration, end to end, in the existing backend: create → incomplete draft → hand translation → pictures → preview → publish → Work page / project page / home page → feature → reorder → unpublish → republish → archive → restore → duplicate → delete all work, in a real Chrome against the real server, and every step was checked from the visitor's side as well. The shop's catalogue edits now reach the pages without a build. **Three parts of the brief are only partly met or not met** (§3: the configurator's structure, a "fixed" price kind, services/packages that exist only in the administration) and are named as such, not hidden.

Nothing was committed, pushed or deployed. Nothing was sent to a real e-mail provider.

## 2. Results

| Check | Result |
| --- | --- |
| `npm test` (website + backend + administration) | **74 files, 1757 tests, all passed** (after two timing fixes, §4) |
| `tsc -b`, `oxlint` | no errors, no warnings |
| `npm run build` (+ prerender), `npm run check:seo` | built; `check:seo ok: 65 files, 58 indexable, 7 noindex` (the Work page is now indexable; previews and drafts are not in the sitemap); also built after `catalog:pull` against a backend that published a new project and unpublished another (§5) |
| `tools/e2e/cms-journey.cjs` — the portfolio's whole life, real Chrome, real backend | **22 / 22 steps** |
| `tools/e2e/security-probe.mjs` — the running server, plain HTTP | **94 / 94 checks** (49 admin routes × 5 methods without a session: only 401/404/405; uploads, traversal, hostile text, bad addresses, CSRF, origin, preview, wording) |
| `tools/audit/audit-admin.cjs` — every administration screen incl. the new ones | **936 views, 0 findings** (hu/en × dark/light × 1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 430×932, 390×844, 360×800, 320×640: sideways scroll, elements outside the viewport, targets under 24 px, unnamed controls, one h1, axe-core WCAG 2.0/2.1/2.2 A+AA + best practice, the editor's seven tabs, the picture chooser and Escape, a wording row open) |
| `tools/audit/audit-work.cjs` — Work page and project pages with three **stress projects** (very long title/text/14 technologies; no picture and no page; a tall and a wide picture) | **192 views, 0 findings** (hu/en/nl × dark/light × 1920×1080, 1440×900, 1024×768, 768×1024, 430×932, 390×844, 360×800, 320×640, incl. the filter used by keyboard, pictures that did not load, empty headings, console errors, axe-core) |

The viewports asked for in the brief — 1920×1080, 1440×900, 1024×768, 768×1024, 430×932, 390×844, 360×800 and 320 px wide — are all in both matrices.

New automated tests of this work: the backend (`server/test/projects.test.ts`, 29 tests: seed, the workflow, validation, links, hidden sections, concurrency, completeness, pictures, authorisation by role, the wording rules, the static-shell fallback, and **a quote request keeps its original snapshot after the package's price, name and text are edited**), the seed-freshness and contract tests, the website's (`src/projects/projects.test.ts`, `src/content/liveCatalog.test.ts`), and the administration's helpers and component tests, including the test that holds the editor's rules to the server's.

## 3. The brief, point by point

| # | Requirement | Status |
| --- | --- | --- |
| 1 | Complete public `/work` page: filter, cards, state per project, three languages, dark/light, no invented projects, screenshots, results or testimonials | **Done.** Cards show the project's real state; a project without a picture shows a concept sketch captioned as one; a category with no published project is not offered. |
| 2 | `/admin/projects`: create, edit, delete, duplicate, publish, unpublish, draft, archive, reorder, feature, categories, images, preview | **Done.** (Reorder is up/down buttons, not drag and drop: reliable on touch and keyboard.) |
| 3 | Project data structure incl. details; results only with evidence; links only when provided and verified | **Done** (§2 of the CMS docs). A link needs the owner's "I opened it and it works" tick to be public. |
| 4 | Per-language editing with complete / incomplete / missing marks; draft saves incomplete; publish blocked on missing required content; no machine translation | **Done**, tested in the browser and on the server. |
| 5 | Draft / Published / Archived; draft never public; unpublish keeps content | **Done**, tested from the visitor's side (API, list, address, sitemap, home page). |
| 6 | Order, filter, featured, configurable categories; the home page's Selected work from the same source | **Done.** |
| 7 | Dynamic `/work/:slug` with admin-controlled sections, empty sections hidden, preview, not generic | **Done.** Ten sections can be shown or hidden; a hidden section's text never leaves the server. |
| 8 | Shop management: categories, services, packages Launch/Grow/Build/Care (names, texts, features, price, currency, note, availability, order, featured), no invented prices | **Mostly done**, through the screens that already existed (PROMPT 13) plus the live catalogue. **Not met:** a *fixed* price kind (the catalogue has on request, to be decided, from-amount) and **new** services/packages/add-ons created only in the administration (they are stored but have no page, no place in the cart or the builder). Existing ones can be edited, disabled, re-ordered and re-priced; shop categories are not an editable list. |
| 9 | Configurator content: questions, options, required/optional, order, related services, three languages, without breaking quote workflows | **Partly done.** The **wording** of the questions, answers, hints and buttons is editable in three languages (Website texts). **Not editable:** adding/removing/re-ordering questions or options, required vs optional, which service an answer relates to. Deliberate: it is what keeps a submitted request from ever being broken by an edit. **Done:** previously submitted requests keep their original data (tested). |
| 10 | Homepage content: hero, calls to action, featured projects, selected-work order, services/about previews, final call to action | **Done as structured text**, not a page builder: the strings through Website texts; the featured projects and their order through Projects. |
| 11 | UX: structured editors, inline validation, save draft, publish, preview, unsaved-changes warning, delete confirmation, loading, success only after the server's confirmation, no raw JSON | **Done.** Success messages appear after the server's answer; the unsaved-changes warning covers links, menus and closing the tab but **not the browser's Back button** (a limit of the router). |
| 12 | Media: upload, preview, replace, remove, alt text, gallery order, optimisation, validation, no blobs in the database, public image addresses intact | **Done**, with the limits in §5 of the CMS docs: optimisation happens in the browser only; no video upload. The four original projects' picture addresses did not change. |
| 13 | Inspect first, reuse the existing database/API, no second backend, all CMS endpoints behind admin auth, public APIs only published content | **Done.** One migration (`0004`), the same process, the same sessions. |
| 14 | Protected preview with `noindex`; correct caching; no claim of immediate sync | **Done.** `noindex, follow` + a banner; signed-out visitors get nothing; the change reaches visitors within the 30-second public cache (measured 25–31 s). |
| 15 | Security: server-side authorisation, validation, safe text, secure uploads, URL/file validation, size limits, audit log, confirmation of destructive actions | **Done**; the probe and the backend tests cover each. No rich text exists, so there is nothing to sanitise. |
| 16 | Responsive administration | **Done**, in the matrix above. |
| 17 | Tests: lifecycle, shop edits, configurator, security, responsive | **Done** as §2; the shop-edit and configurator tests are the quote-snapshot test, the live-catalogue tests, the wording tests and the contract tests (there is no configurator structure editor to test). |
| 18 | No AI 3D generation; exactly six Lab experiences; NFSU2 egg separate | **Not reintroduced, and not rebuilt.** The Lab has **five** experiences: the owner deleted "Generative Objects" on 2026-11-01. A sixth was not invented to satisfy the number; say so if a sixth is wanted. The NFSU2 easter egg is untouched. |
| 19 | Deliverables | the code; [`../cms/README.md`](../cms/README.md); updated backend and administration docs and `.env.example`; this report. |

## 4. What the tests found, and what was done

1. **The editor crashed when a picture was added to an empty gallery** (the gallery's own "add" button created an `undefined` item). Found only by driving the real editor in Chrome; no unit test had touched it. Fixed (the gallery has no add button of its own; the primary button chooses a picture first), with a regression test on the list component.
2. **A project page drew the label "Technologies used" over empty space** when a project has none. Fixed: the whole block is left out; test added.
3. **The preview banner was invisible** (the hero is drawn up behind the sticky header and covered it). Found by looking at the picture the journey took; fixed with a stacking order; the banner's position is now measured.
4. **Two tests of the existing suite timed out when the whole suite ran at once** (`security.test.ts`'s sign-in injection test does about twenty real scrypt sign-in checks against a 5-second limit; `notifications.test.ts`'s STARTTLS test had a 3-second connect timeout). Both pass alone, three times in a row; the limits were raised (30 s and 10 s) with a comment saying why. This is a property of running 74 files in parallel on one machine, not something these changes broke, but the suite is now bigger and heavier, and it was the right moment to fix it.
5. Smaller: the audit scripts' own mistakes (a missing semicolon that made a script do nothing and exit 0; an unhandled promise; a label that changed) — fixed in the scripts.

## 5. What was not tested, or could not be

- **Safari, Firefox, real phones and tablets, a screen reader.** Only Chrome (Playwright, with device emulation) was driven. axe-core found nothing, which is not the same as a person using it.
- **A second administrator editing at the same time in a second browser:** the server's concurrency rule (409 on a stale save) is tested in process, not by two people.
- **A production deployment:** no host, domain, certificate or e-mail provider exists yet; the CMS was run against a throw-away database and a scratch server only. The production checklist in [`../production/README.md`](../production/README.md) is unchanged by this work, except that `MEDIA_DIR` must be on a disk that survives restarts and be backed up with the database.
- **Large image sets:** a 3.6 MB picture and a handful of small ones were uploaded; nothing was load-tested.
- **The prerendered head of a project that exists only in the administration is produced by the next build, not by publishing** (added after the first version of this report, see the CMS docs §6): `npm run catalog:pull` now also pulls the published projects and the build writes each one's page, title, description, canonical address, structured data and sitemap entry, and drops the pages of the website's own projects the owner unpublished. Verified against a scratch backend (one new project published, BookingHub unpublished): `dist/en/work/` had `spendly`, `logistics-platform` and `travel-log` and no `bookinghub`, the sitemap listed `travel-log` and not `bookinghub`, and `check:seo` passed (65 files); five new tests cover it. A card text under 40 characters makes `check:seo` fail by name. Nothing rebuilds the site by itself.
- **The shop's catalogue on the live website against a real search engine or a real cache in front of the backend:** the 30-second figure is for the browser's cache and the server's own headers; a CDN in front would add its own.

## 6. What the owner needs to decide

1. **Is the configurator's structure meant to be editable?** If yes, that is a design task of its own (the cart, the quote form and the stored request would need a versioned question model); today it is wording only.
2. **Should a fixed price exist?** It needs the owner's real prices; the model and the cart would grow a fourth kind.
3. **Should a service or package created only in the administration get a page?** That is a template and a route, not content.
4. **Is a sixth Lab experience wanted,** and if so, which? (Not the AI 3D one: it was removed on purpose.)
5. **Whether to run `npm run catalog:pull` and `npm run build` after content changes** so that search engines see the new texts and projects in the page head; the visitors' pages do not need it.
6. Real content: the owner's own project texts, screenshots (with the real names decided), results (only with evidence) and links. Nothing was invented; the four existing projects are unchanged.
