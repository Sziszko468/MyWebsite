# Shop 3.0 — package comparison and FULL EXPERIENCE

PROMPT 09.1 turned the inquiry-based shop (PROMPT 09, see "Shop" in the [main README](../../README.md#shop)) into a premium service marketplace: a four-column **tier comparison** with a dedicated phone version, a **page for every package**, an **add-on** system that offers only what applies, and a separate flagship offer, **FULL EXPERIENCE**, with its own eight-step configurator. All of it is editable in the administration, in Hungarian, English and Dutch.

## What did not change (on purpose)

- **There is no payment and no price.** Packages, add-ons and FULL EXPERIENCE read "Custom quote" (`Egyedi ajánlat`, `Offerte op maat`). FULL EXPERIENCE is never presented as a package with a price; the line where a price would stand is a label, not a number (a test refuses digits in it). No discounts, reviews, testimonials or popularity claims; a test reads every new text in three languages for that (`src/content/shop/shop3.test.ts`, beside the older guard in `content/services/services.test.ts`).
- **One backend, one catalogue.** The shop's packages, services and add-ons are still the records of PROMPT 13/13.1 (`services`, `packages`, `extras`), edited under *Services & packages*. Nothing about them was duplicated. Two things are new: the **comparison** and the **FULL EXPERIENCE offer**, stored as *documents* (below), and a **kind** on the quote request.
- **The same endpoint takes the requests.** `POST /api/quote-requests`, with `form: 'full_experience'` for the flagship. A request is a row of `quote_requests`, so it appears in *Quote requests* in the administration, in the dashboard's counts and in the CSV export, with the same statuses, notes and notifications.
- The route names stay under `/services`, not `/shop`: the shop already lived there (its front page, product pages, builder and cart), and the brief said to extend, not rebuild.

## Pages

| Address (`/hu`, `/en`, `/nl` first) | What it is |
| --- | --- |
| `/services` | The shop's front page. Its package band is now the **tier comparison** (table from 48 rem, phone switcher below) and, after it, the **FULL EXPERIENCE band**. |
| `/services/packages/launch`, `grow`, `build`, `care` | **A page per package**: hero, who it is for (with the facts: scope, customisation, support), what is included and the main deliverables, the detailed features (grouped by level), **what makes this tier different** (what it adds over the package below it, with the previous/next tier as links), the add-ons that apply, related services, price status ("Custom quote"), questions, and the closing call: the eleven sections of the brief, in its order (the package description is the hero's). "Compare all packages" returns to the comparison with the visitor's package kept selected. |
| `/services/full-experience` | The flagship page: hero ("YOUR IDEA. BUILT FROM ZERO." / "AZ ÖTLETEDTŐL A KÉSZ DIGITÁLIS TERMÉKIG." / "JOUW IDEE. VANAF NUL GEBOUWD."), what is included by stage, the components, how it works, the custom-quote explanation, the questions, the closing call. |
| `/services/full-experience/start` | **The configurator** (not indexed, not in the sitemap: it is a visitor's working state). |

All are lazy chunks. None loads Three.js and none opens the intro.

## The comparison

### The model

`src/content/shop/comparison.ts` (starting copy and seed source) describes **tiers** and **features**:

- A tier is a package with a short label ("Essential foundation") and the package it **builds on** (`buildsOn`): Launch ← Grow ← Build; Care stands beside the ladder (`null`).
- A feature has a name and an optional explanation in three languages, and a **level for every package**: `included`, `addon` (an optional add-on), `custom` (a custom service, quoted separately) or `none`.

Everything the visitor reads about progression is **derived from that grid**, not typed (`src/shop/tiers.ts`, tested in `tiers.test.ts`):

- *In every package* — features included everywhere.
- *Introduced with X* — features whose first inclusion on the ladder is X.
- *Only as an add-on / custom* — features no package includes.
- *What X adds over Y* (`addsOver`) — what the tier below does not already include. This is what the PlayStation-style headers show ("Everything in Grow, plus …").
- `comparePair` — the difference between any two packages, used by the phone's side-by-side view.

So editing a cell in the administration changes the progression texts too; the two cannot disagree.

### Desktop and phone

`useMinWidth` (`src/shop/useMinWidth.ts`) picks one of two components: the **table** at 48 rem and up (four columns, a header per package with its mark and accent colour, a progression row, the groups above, a visible mark in each cell with a text label for the level so colour is never the only signal), and the **phone switcher** below it. The phone version is not the table squeezed: a tab per package (roving tabindex, arrow keys, and a horizontal swipe), the selected package's features in expandable groups, and — when the screen is at least 24 rem wide — a "compare two packages" mode with both columns side by side. Nothing needs sideways scrolling at 320 px.

## Add-ons

Add-ons are the catalogue's `extras`. The package page and the builder offer **only the add-ons that are available and that the package allows**: an add-on a package does not allow is not shown for it, and one the administrator switched off disappears everywhere (the overlay sets `available: false`, and the pages filter on it). An add-on still appears in the comparison as the `addon` level of the features it relates to.

## FULL EXPERIENCE

### What the visitor does

Eight steps, one per screen on a phone, with a progress bar, Back/Next, and the finished steps as buttons:

1. **Project type** (`type`, required) — business website, e-commerce website, web application, internal business application, customer portal, custom digital product, or not sure yet
2. **Stage** (`stage`, required) — just an idea, requirements defined, design exists, an existing application to redevelop, an existing system to extend
3. **Components** (`components`) — frontend, backend, database, authentication, admin dashboard, API integrations, payment integration, multilingual support, 3D / interactive experience, mobile-focused experience; several may be chosen
4. **Complexity** (`complexity`) — simple, medium, complex, not sure
5. **Budget** (`budget`) — the administrator's ranges, **always with "Not sure yet — let's discuss it"** (`unsure`). Optional. The seeded options contain **no figure**: the ranges are the owner's to enter.
6. **Timeline** (`timeline`) — what the visitor would like (their wish, not a promise: the options may name a span of time, the studio's own texts may not)
7. **Description** — the one required free-text answer (20–4000 characters)
8. **Contact** — name, e-mail, optional company, preferred language, and the acknowledgement of the privacy notice when the site requires it (`consent`)

Steps 1–6 are the administrator's *questions*; 7 and 8 are fixed parts of the page. "Not sure yet" stands alone in a multiple-choice question (choosing it clears the others and the reverse). A step is checked when the visitor moves on; the first wrong answer takes focus and every message is a sentence tied to its field. **The answers live in memory only** (no storage, no cookie, nothing in the address bar), so a reload starts again; this is deliberate, to keep personal text out of the browser.

### What is sent and stored

`src/shop/fullExperience/request.ts` builds the payload; `server/src/modules/shop/fullExperience.ts` validates it again (the server never trusts the page):

```jsonc
{ "form": "full_experience", "version": 1, "language": "en", "preferredLanguage": "en",
  "answers": { "type": ["web-app"], "components": ["design", "backend"], "budget": ["unsure"] },
  "description": "…", "name": "…", "email": "…", "company": "…", "consent": true }
```

The server rebuilds a **brief**: for every answered question, the question title and the chosen options' labels **in all three languages as they were at that moment** (so the administrator reads the whole request even after the questions are edited or removed), stored as `quote_requests.brief_json` with `kind = 'full_experience'` and `company`. The reference is `F-…` (the catalogue requests' are `Q-…`). Repeated sends of the same request are deduplicated by a hash; the owner's notification e-mail and the optional confirmation use the same machinery as any quote request; while the offer is **unpublished** the endpoint answers 503 and the page says so instead of pretending.

### What the administrator sees

*Quote requests* lists them with a "FULL EXPERIENCE" mark where a catalogue request shows its items; the detail shows the brief as a labelled list (question, answers, "Not sure yet" marked as such), the description, the contact and the company, in the interface language, with the usual status, notes and activity.

## Editing in the administration

Two screens under the *More* menu on a phone (and in the sidebar on a desktop):

- **Package comparison** (`/admin/comparison`, *Csomag-összehasonlítás*): each tier's label in three languages and the package it builds on; the feature list — name and explanation in three languages, and a level per package — with add, remove and **move up / move down buttons** (reordering never requires dragging).
- **FULL EXPERIENCE** (`/admin/full-experience`): the hero (eyebrow, headline, supporting text, both button labels), the teaser on the shop's front page, the price label, the stages, the components, the configurator's intro, its **questions and options** (single or multiple, required or not, which option is "not sure yet", the budget ranges), and the FAQ.

Both work the same way. **Save** keeps a *draft* (what the editor is writing; visitors do not see it). **Publish** makes the draft public; **Unpublish** takes it back to the website's built-in copy (for the comparison) or turns the offer off (for FULL EXPERIENCE). A status line says whether the document is published as it is, saved but not published, unsaved, or not published at all. Saving uses **optimistic concurrency** (`expectedUpdatedAt`): if someone else saved first, the save is refused with a message instead of overwriting. Every error from the server is shown on the field it belongs to (`features.3.name.hu`).

The server accepts only what the pages can draw (`server/src/modules/shop/documents.ts`): every text present in all three languages (explanations may be empty in all three), limits — 12 tiers, 40 features, 24 stages, 16 components, 12 FAQ entries, 12 questions, 16 options per question — ids of the form `[a-z0-9-]`, a comparison that mentions every package the catalogue has and whose ladder has no cycle, and the six core questions (`type`, `stage`, `components`, `complexity`, `budget`, `timeline`) which cannot be removed. The website repeats the same checks on what it receives (`src/content/shop/documents.ts`); a document it cannot read is ignored whole and the built-in copy stays.

Roles: reading needs `requests:read`, saving and publishing need `catalog:write`.

## How the data reaches the website

1. **Starting copy** is in `src/content/shop/{comparison,fullExperience}.ts` (three languages side by side).
2. `npm run catalog:seed-export` writes it to `server/seed/shop.seed.json`. A backend with an **empty** `shop_documents` table loads it at start (`server:seed` does the same); after that the **backend is the master** and the files are never read again.
3. The administrator publishes. `GET /api/shop/catalog` carries the published documents (`documents.comparison`, `documents.fullExperience`).
4. The website lays them over its built-in copy **in place** (`catalogOverlay.ts`, as it already did for services and packages). `liveCatalog.ts` fetches the catalogue at runtime, so an edit reaches visitors within about a minute (the endpoint is cached); `npm run catalog:pull` writes it at build time so the prerendered pages carry it too.
5. Without a reachable backend the website shows the built-in copy. Nothing breaks.

## Database

Migration `0005_shop_experience.sql` adds `shop_documents (code, draft_json, published_json, published_at, created_at, updated_at)` and `quote_requests.kind` (`catalogue` | `full_experience`, default `catalogue`), `company` and `brief_json`. Existing rows are untouched; rolling back means restoring a backup.

## API

| Route | Does |
| --- | --- |
| `GET /api/shop/catalog` | (public) now includes the published `documents` |
| `POST /api/quote-requests` with `form: 'full_experience'` | (public, rate limited) a FULL EXPERIENCE request; 201 with the reference, 422 with field errors, 503 while the offer is unpublished |
| `GET /api/admin/shop/documents/:code` | the draft, the published copy and whether they differ; `:code` is `comparison` or `full_experience` |
| `PUT /api/admin/shop/documents/:code` | save a draft (`{ document, expectedUpdatedAt }`) |
| `POST /api/admin/shop/documents/:code/publish` · `…/unpublish` | publish the draft / take it back |

## Tests and checks

All browser checks are **Chrome driven by Playwright on one PC with emulated viewports and touch — not physical devices.**

Run on 2026-11-07 (Windows 11, Node 22, system Chrome through Playwright).

**Unit and render tests** (`npm test`): 1871 passed in 83 files, `tsc -b` and `oxlint` clean. What belongs to Shop 3.0:

| File | Tests | What it exercises |
| --- | --: | --- |
| `server/test/shop.test.ts` | 13 | The documents are seeded once, as a draft that is also published; they accept the website's own text and refuse what it cannot draw; they reach the public catalogue only once published (and change its version); a bad save is refused as a whole with the field named; a save over someone else's newer one is refused; only a signed-in administrator can reach them. A FULL EXPERIENCE request: saved in the quote list with the brief as it was worded when sent; the brief stays readable after the questions are edited; answers are checked against the questions as published now; sent twice it answers with the first reference, and a bot's hidden field is refused; refused (503) while the offer is unpublished; the owner's notification carries every question and answer and nothing about a price; the limits equal the website's |
| `src/shop/tiers.test.ts` | 12 | One tier per package; Launch → Grow → Build a ladder with Care beside it; every feature named in every language with a level for every package; all four levels in use; **the seeded grid is built only from what the packages already say** (an included cell where the package has the matching line, an add-on cell only where it lists the add-on); the derived "in every package", "introduced with", "what each step adds" and the pair comparison |
| `src/shop/fullExperience/request.test.ts` | 13 | The steps in order (the offer's questions, then description and contact); project type and stage required, the rest optional, the budget with its way out and nothing that looks like a price; a single answer replaced or taken back, a multiple one added to and removed from, "not sure" standing alone, an unknown option ignored; the description's length; the contact details with the company optional and consent required while the configuration says so; the first invalid step; the payload is what the server accepts; the summary; the limits match the server's |
| `src/content/shop/shop3.test.ts` | 15 | The content guard over the comparison and the offer in three languages: no price, discount, percentage, guarantee, superlative, testimonial or popularity claim; no span of time promised by the studio; texts complete in every language; the price label has no digit; the budget has "not sure yet" and no figure |
| `src/admin/lib/shop.test.ts` | 4 | The editors' ids (a regression: a core question whose id looked like a new row's placeholder was renamed and the server refused it) |
| `src/pages/ShopPages.test.ts` | | The front page's comparison, the package selected from the address, a page per package (the sections in the brief's order, the way back to the comparison, no price), the FULL EXPERIENCE page and the configurator's first step, in three languages |
| `src/content/catalogOverlay.test.ts` | | A published document replaces the website's own as a whole; one that cannot be drawn is ignored; an add-on switched off disappears |
| `src/styles/tokens.test.ts` | +1 | The text on the Cobalt fill is AA (4.98:1) |

**The end-to-end journey** (`tools/e2e/shop-journey.cjs`, a real backend serving the built site): **41 of 41 steps** — the comparison on a desktop, the package page and the way back with the selection kept; the phone switcher (tabs, arrow keys, swipe, groups, two packages side by side, 320 px); a real FULL EXPERIENCE request through the configurator; the administrator finding it with every answer; editing and publishing the comparison and the offer and a new visitor seeing the change only after the publish; unpublishing; both editors on a 390 px phone. See [`tools/e2e/README.md`](../../tools/e2e/README.md).

**Layout matrix** (`audit-matrix.cjs`): the front page, the four package pages, the FULL EXPERIENCE page and its configurator at 1920×1080, 1440×900, 1024×768, 768×1024, 430×932, 390×844, 360×800 and 320×640, in both themes (English, 112 page loads), and in Hungarian and Dutch at 1440, 768, 390 and 320 (56 loads): **no sideways scrolling, nothing outside the viewport, no text too small, no target too small, no console error.**

**Accessibility, automated** (axe-core, WCAG 2.0/2.1/2.2 A and AA and best practice): the seven pages × three languages × two themes (42 views): **0 violations**. The **interactive states** (`audit-shop3.cjs`: a feature explanation open, each phone tab, a group open, the two-package mode, a package page, the FULL EXPERIENCE page, the configurator at every step and in its error states; 116 audits at 1440×900, 390×844 and 320×640, both themes): the first run found **three defects**, all fixed — dark text on the Cobalt Grow tab (3.95:1), the same on the Graphite Care tab in the light theme (1.49:1), and a tab whose `aria-controls` named a panel that is not drawn in the two-package mode — and the rerun found none. Neither the page-level run nor this one says anything about how a screen reader sounds.

**Localisation** (`audit-i18n.cjs`): 27 pages × hu/en/nl, about 2,700 text blocks per language: no raw key, no unfilled placeholder, no text left in English.

**The administration** (`audit-admin.cjs`, extended with the two new screens, a FULL EXPERIENCE request's detail and the comparison with a feature open): 8 viewports (1920×1080 … 320×640) × 2 themes × hu/en, **960 views, 0 findings**.

**SEO** (`npm run check:seo`): with a site address, the 15 new pages (4 packages and the offer, three languages) are in the sitemap with reciprocal hreflang and canonical addresses and structured data; the configurator is `noindex` and not in the sitemap. Without one, everything is `noindex`, as before.

**Size.** The main bundle is 112 kB gzip (Vite's figure); the shop's new pages are lazy chunks (the front page 8.1 kB, the configurator page 4.0 kB, a package page 2.8 kB, the offer page 1.6 kB, gzip). The shop's words, shared by the shop pages, grew from 14.5 kB to 19.6 kB gzip (the comparison, the offer and the new interface words). No page of the shop loads Three.js.

## Decisions for the owner

- **The seeded grid is an inference.** Which feature each package has was derived from the packages' existing text. Cells the existing text does not settle — the Build column of *responsive*, *structure* and *navigation* (included) and *contact* and *SEO* (custom) — are my reading, not a statement of yours. Check the comparison in the administration before publishing; it is a few clicks.
- **Budget ranges.** The seeded budget question has "I have a set budget / my budget is flexible / not sure yet" and no figures. Enter ranges (and currency) in the administration if you want them; nothing in the code decides them.
- **Hungarian and Dutch copy** was written alongside the English and has not been read by a native speaker.
- **What FULL EXPERIENCE includes** (the stages and components) is starting copy from the brief. Confirm that it is what you offer.
- **Route names** stayed under `/services` (see above). Moving to `/shop` would be a routing change plus redirects.
- **The configurator is not saved between visits** (memory only). If you want "continue later", it needs a decision about storing personal text.

## Not verified

A physical phone or tablet (the swipe and the on-screen keyboard in particular), Safari and Firefox, a screen reader (the markup uses tabs with roving tabindex, native radios and checkboxes, fieldsets, live regions and disclosure buttons, but it was not listened to), forced-colours mode, a real mail provider and a real endpoint (the e-mails were written to files by the `file` provider), and the Hungarian and Dutch copy by a native reader.

## Plain language (PROMPT 18)

The Shop's words were rewritten for people with no technical background: packages, services, add-ons, the comparison, FULL EXPERIENCE and its questionnaire. Nothing was added or removed as an offer: ids, levels
(included / add-on / custom / none), prices (none) and every limit are the same; only the words changed. The rules, the list of replaced expressions, the glossary (one word per concept in each language) and the
checks that keep it so are in [docs/i18n](../i18n/README.md); the audit is in [docs/i18n/language-audit-report.md](../i18n/language-audit-report.md).

* The owner's own wording from earlier briefs stayed as written (shop headline and lead, "Custom Quote", the FULL EXPERIENCE headline and its two English buttons).
* After editing any Shop copy run `npm run catalog:seed-export` (the backend's seed must equal the website's content: `server/test/contract.test.ts`) and `npm run i18n`.
* The administration refuses to publish a catalogue record (service, package, add-on, FAQ) that is missing a language; a disabled record is a draft. The FULL EXPERIENCE questionnaire's six core questions and their ids are unchanged, only their labels and examples.
