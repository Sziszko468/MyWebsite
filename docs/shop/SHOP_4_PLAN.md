# Premium Shop 4.0: implementation plan (PROMPT 20)

Written before the code was changed. It records what the brief asks for, what the Shop already does (so nothing is rebuilt or duplicated), the gaps found by reading the code, and the order of work. The result is reported in [README.md](README.md#shop-40).

## PROMPT 19 items still open (reported first, as the brief asks)

None is a code blocker for the Shop; none was bypassed. Nothing is deployed by this work.

| Open item | Why it matters to the Shop |
| --- | --- |
| **E-1** the domain has no outbound-mail authentication | the quote request's confirmation and quotation e-mails may not reach customers |
| **B-1** `TRUST_PROXY` unverified | the quote form's rate limit (5 per 15 minutes per address) may count all visitors as one |
| **I-1** canonical host conflict (apex vs `www`) | the Shop's new pages inherit it |
| **I-4** the country router is not in the production path | requirement 11 (country-based language) is only true where the Worker runs; see "Localization" below |
| **D-1** persistent disk unverified; **D-3** no automatic snapshot before a migration | this work adds **one migration** (see below): take a backup before deploying it |

## What the Shop already is (reused, not rebuilt)

| Brief section | Already in the code |
| --- | --- |
| 3 journey | `/services` (front page with the comparison), `/services/<service>`, `/services/packages/<package>`, builder `/services/configure`, cart `/services/cart`, `/services/full-experience[/start]` |
| 5 packages, 5.3 comparison | four packages from the catalogue; `src/shop/tiers.ts` derives every progression text from the comparison grid; desktop table, phone switcher with swipe and side-by-side mode; "what X adds over Y" |
| 5.4 feature explanations | per-feature explanation buttons that open in place |
| 6 FULL EXPERIENCE, 6.1-6.3 | eight steps, six admin-editable questions, progress, Back, skip of optional questions, answers kept while moving between steps, a review that can be corrected; the brief the administrator reads |
| 8 add-ons | the catalogue's `extras`; the package page lists the add-ons the package allows; the builder has an add-on step |
| 10 summary | builder review step and FULL EXPERIENCE review step |
| 11 localization | `src/i18n`, three languages, `cc_lang` cookie, the edge Worker, `i18n:check/validate` gates |
| 12 CMS | `/admin/comparison`, `/admin/full-experience`, `Services & packages`, `Website texts`; drafts, publish, all three languages required |
| 15 analytics | `src/analytics` (consent store, tracker, provider interface, no free text) |
| 17 backend | `POST /api/quote-requests` (both kinds), catalogue-resolved prices, duplicate hash, rate limit, `file`/Resend mail |

## Gaps found by reading the code

| # | Gap | Evidence | Plan |
| --- | --- | --- | --- |
| G-1 | **Add-ons are checked against the service, never against the package.** The builder offers `addonsFor(need)` whatever package is chosen; `setPlan` keeps add-ons the new package does not allow; the server accepts any add-on that applies to the need. Launch + "API connection" is accepted today | `Configurator.tsx` extras step, `cart.ts` `normalizeExtras`, `quotes/service.ts` `resolveItems` | one rule on both sides: an add-on sits on a line only if it applies to the need **and** the line's package lists it (a custom project has no package, so only the need applies). Changing the package removes what the new one does not allow, and says so. The server refuses the rest (field `items.N.extras`) |
| G-2 | No "Not sure which package is right for you?" | no code | rule-based **package finder** (below) |
| G-3 | No complexity indicator | no code | rule-based **project size guide** (below), server-recomputed into the brief |
| G-4 | Add-ons show no compatibility, no optional/required, no price status, and the summary does not update beside them | extras step | compatibility line ("works with Grow, Build"), an "Optional" tag, the price status the catalogue really has, a live "your request so far" box |
| G-5 | The brief's sentence "submitting this request does not mean you have purchased a service…" is not next to the send button of either flow | review steps | one sentence in HU/EN/NL in both reviews |
| G-6 | Shop events missing: shop opened, package viewed, comparison opened, add-on selected, configurator started, recommendation viewed, summary viewed; `quote_request_submitted` cannot say FULL EXPERIENCE | `analytics/events.ts` | add them, still ids and counts only |
| G-7 | Country-based starting language works only where the Worker runs (Cloudflare Workers); production `www` is Render | PROMPT 19 I-4 | see "Localization" |

## The package finder (G-2)

Rule-based, transparent, no AI, never submits anything, always leaves manual choice.

- **Four questions**, single choice, each with a "not sure" way out: how much do you need (a simple website / more pages and interactive parts / an application with sign-in and stored information), do you already have a website or application, do visitors need to do things that are stored (sign in, book, send information), do you want it looked after after launch.
- Each answer **names comparison features** (by the ids of the comparison grid, e.g. `contact`, `interactive`, `database`). A package's **coverage** of what was asked for is computed from the grid **as the administrator configured it**: included 1, optional add-on ½, custom service ¼, not offered 0. If the administrator edits the comparison, the recommendation follows.
- **The recommended package is the smallest one on the ladder that covers at least 80 %** of what was asked for (if none does, the one that covers most). "Already have a website" restricts the candidates to the packages whose configured needs include improving an existing site. "Looked after after launch" adds **Care** as "also worth a look" (Care stands beside the ladder).
- **Why**: shown as the visitor's own answers plus, from the grid, what the package includes of it, what is only an add-on, and what is not part of it. Nothing is written by hand about a package.
- Location: `src/shop/recommend.ts` (pure, tested), UI on the front page after the comparison, result buttons "Choose this package" (selects it in the comparison and the cart, nothing is sent) and "See all packages".
- Questions, answers and sentences are website wording: editable in *Website texts*; the weights (which features an answer asks for) are code and documented, **not** editable in the administration (stated as a limitation).

## The project size guide (G-3)

An internal planning aid, not a price or a deadline. From the FULL EXPERIENCE answers (components, stated complexity, stage, type) a points table gives **Basic / Moderate / Advanced / Custom**; "not sure" gives Custom ("we will decide together"). Shown in the configurator's review with the explanation that the final scope and price come after the project is reviewed; **recomputed by the server** from the validated answers and stored in the brief (a value from the browser is never trusted), shown to the administrator. No figure, no date, no promise.

## Migration

Only if the recommendation had been a new document would a migration be needed (`shop_documents.code` has a CHECK listing two codes). It is **not**: rules live in code and wording in the existing text overrides, so **no migration and no schema change** are planned. (If that changes, the migration will be a table rebuild with the runner's foreign-keys-off procedure and a test that rows survive.)

## Localization (requirement 11)

Existing: priority saved choice, then country (HU/NL), then English (`src/i18n/locale.ts`); the Worker reads `request.cf.country`. On production the Worker is not in the path (Render answers), so that step does nothing there. This work does **not** move hosting. It verifies the rule's behaviour with the existing unit tests and the Worker's tests, adds Shop-text completeness checks for every new string, and (decided during the work) adds an **opt-in origin fallback**, `COUNTRY_HEADER`, so the server that serves the site on Render can apply the same rule behind Cloudflare. See [SHOP_4.md](SHOP_4.md#localization-section-11).

## Order of work

1. Server: add-on/package validation + tests. Client cart rule + tests.
2. Builder: add-on step (compatibility, optional tag, price status, live summary), review sentence.
3. Finder logic + tests, then its UI on the front page.
4. Size guide: client logic + server recomputation + brief display + tests.
5. Events.
6. Copy in three languages, i18n gates, seed export and manifest.
7. Journeys, security probe, layout matrix at nine widths, axe, docs, report.

Safety: a work branch from the current one, nothing deployed, no production data touched, no secret displayed.
