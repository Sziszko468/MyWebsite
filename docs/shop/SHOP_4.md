# Premium Shop 4.0 (PROMPT 20)

Shop 4.0 is an **upgrade of the existing Shop**, not a new one. The plan written before the code is [SHOP_4_PLAN.md](SHOP_4_PLAN.md); the Shop it builds on is described in [README.md](README.md) (Shop 3.0). Nothing was rebuilt: the comparison, the package pages, FULL EXPERIENCE, the builder, the cart, the quote request endpoint, the e-mails, the catalogue, the administration and the translations are the same code and the same data. Four things were added or fixed:

| | What | Where |
| --- | --- | --- |
| 1 | **Add-ons follow the package.** An add-on sits on a line only if it applies to the service **and** the line's package lists it. The page offers only those, says why the others are missing, takes them off (and says so) when the package changes; **the backend refuses the rest** | `src/shop/cart.ts`, `src/components/shop/AddonChoices.tsx`, `server/src/modules/quotes/service.ts` |
| 2 | **The package finder** ("Not sure which package is right for you?"): four questions, a suggestion with reasons, rule-based, from the comparison as configured | `src/shop/recommend.ts`, `src/components/shop/finder/` |
| 3 | **The project size guide** in the FULL EXPERIENCE review (Basic / Moderate / Advanced / Custom), a planning aid recomputed by the server and shown to the administrator | `src/shop/fullExperience/estimate.ts`, `server/src/modules/shop/estimate.ts` |
| 4 | "Your request so far", the saved state of the cart, the "this is not a purchase" sentence beside both send buttons, and the Shop's events (ids and counts only) | `RequestSoFar.tsx`, `src/analytics/events.ts` |
| 5 | **Starting language by country on the server that serves the site** (opt-in `COUNTRY_HEADER`), because the edge Worker is not in production's path | `server/src/modules/system/language.ts`, `.env.example` |

**No migration and no schema change.** The recommendation's rules are code; its words are website wording (editable under *Website texts*).

## Existing components reused (not duplicated)

`tiers.ts` and the comparison (the finder reads them), `Choice`/`ChoiceCard`/`ChoiceFieldset`, `Disclosure`, `PriceStatus`, `Button`, the cart and its store, the inquiry store, `useShopText` and the text-override mechanism, `catalogOverlay`/`liveCatalog`, `POST /api/quote-requests` and its validation, the quote request, brief, e-mail and administration screens, the analytics tracker and its consent store, `tools/e2e` and `tools/audit`.

## Components modified

`Tiers.tsx` (hosts the finder, reports "comparison viewed"), `Configurator.tsx` (add-on step, live summary, the sentence, events), `FullExperienceConfigurator.tsx` (size guide, the sentence, events, its own submit id), `cart.ts`/`cartStore.ts` (the rule, the dropped-add-ons notice, the saved flag, `addon_selected`), `CartAnnouncer.tsx`, `catalogOverlay.ts` (the packages' add-on lists now come from the backend), `ServicesPage.tsx`, `PackagePage.tsx` (events), `server/src/modules/quotes/service.ts`, `shop/brief.ts`, `shop/fullExperience.ts`, the administration's brief display and its words (hu, en).

## New components

`src/shop/recommend.ts` (+ test), `src/content/shop/finder.ts`, `src/components/shop/finder/PackageFinder.{tsx,module.scss}`, `src/components/shop/AddonChoices.{tsx,module.scss}`, `src/components/shop/RequestSoFar.{tsx,module.scss}`, `src/shop/fullExperience/estimate.ts` (+ test), `src/components/shop/experience/ProjectSizeGuide.{tsx,module.scss}`, `server/src/modules/shop/estimate.ts`, `server/test/googleDriveBackup.test.ts` (from the audit), `tools/e2e/shop4-journey.cjs`, `tools/audit/audit-shop4.cjs`.

## Add-ons (section 8 of the brief)

- **The rule.** For a line of the cart (a service, a package or a custom project, the add-ons chosen): an add-on is allowed when `addon.appliesTo` contains the service **and**, if the line has a package, the package's list contains the add-on. A custom project or a line with no package yet has no package to disagree with, so only the service counts. `allowedExtras(need, plan)` is the rule on the page; `resolveItems` in `quotes/service.ts` is the same rule on the backend (the package list comes from the catalogue database, the master copy).
- **Found by this work:** before, only the service was checked, on both sides. A request for *Launch + "Connect to another service"* was accepted although Launch does not list that add-on. The backend now answers 422 with `items.N.extras = "unknown"`, and a request that has one such line among several stores nothing and names that line.
- **What the visitor sees.** On the add-on step each add-on the package lists is a card with its name, a plain-language summary, the tag **Optional**, the packages that list it, and the price status the catalogue really has ("Custom quote" unless a price is published; nothing is invented). The add-ons the package does not list are not hidden: *"Not available with Launch"* opens a list that names them and the packages that do list them. Every add-on is optional (the catalogue has no required one) and the tag says so.
- **Changing the package.** Add-ons the new package does not list are taken off; the page says which, in words, in "your request so far" (and a screen reader is told); going back to a bigger package does not bring them back (the visitor chooses again).
- **Saved carts.** A cart saved before this change is read through the same rule, so an old save cannot carry a combination the backend would refuse.
- **CMS.** *Services & packages → package → Add-ons* (existing) is where the owner chooses which add-ons a package allows. Until now the website ignored that list; the live catalogue overlay now carries it (`catalogOverlay.ts`), so an edit changes the page **and** what the backend accepts. This reverses one earlier decision ("the overlay takes nothing but featured and quoteRequired about what a package is"): the test that pinned it was rewritten and a second one added.
- **Prices.** Never read from a request (a test and the journey prove a `price` in the body is ignored); the stored price is the catalogue's snapshot.

## The package finder (section 7)

Rule-based, transparent, **no AI**. It never submits anything and never chooses for the visitor.

1. **Four questions**, each with "not sure": how much do you need (a simple website / a website with more pages and parts visitors can use / an application with its own logic and stored information); do you already have a website or application; should the website save information (accounts, bookings, orders); do you want us to look after it after launch.
2. Each answer **asks for features of the comparison**, by the ids of its rows (`contact`, `interactive`, `database`, …). Which features is written in `FINDER` (`src/shop/recommend.ts`) and a test fails if one is not in the seeded comparison.
3. **Fit** of a package = how much of what was asked for the comparison gives it, **as the administrator configured it**: included 1, optional add-on ½, custom service ¼, not offered 0. Edit the comparison and the suggestion follows (tested).
4. **The suggestion is the smallest package on the ladder that fits at least four fifths** of what was asked for; if none does, the one that fits most. "I already have one" limits the choice to the packages whose catalogue needs include improving an existing site. **Care stands beside the ladder**, is never the build suggestion, and is shown as "also worth a look" when looking after it was asked for (or as the suggestion when that is all that was asked for).
5. **The reasons are drawn from the same grid**: what the visitor needs (the asked features' names), what the package includes of it, what is only an optional add-on, what is a custom service quoted separately, what is not part of it, and a fit list for every package considered. Nothing about a package is written by hand.
6. **Nothing asked, nothing guessed:** with no answers that ask for a feature the finder says it needs to know more and offers "Describe your project".
7. Buttons: **Choose {package}** selects it in the comparison (nothing is sent), **Start with {package}** opens the builder with it, and the answers can be changed or started again.

Words: `src/content/shop/finder.ts` (HU/EN/NL; editable in *Website texts*, which is where the 70 new wordings appear after `npm run catalog:seed-export`). **The rules (which answer asks for which feature, the weights, the threshold) are code, not editable in the administration.**

## The project size guide (section 9)

A **planning aid, never a price or a deadline**. From the FULL EXPERIENCE answers it adds points (the table in `estimate.ts`: the kind of project 0-3, a system that already exists 1-2, each part chosen 1-2, the visitor's own complexity answer 0-4; "not sure", unknown answers and repeats count nothing) and names **Basic** (up to 2), **Moderate** (up to 6), **Advanced** (up to 11) or **Custom** (more, or a custom digital product). It shows nothing until there is something to base it on. The review says, in three languages, that it is a rough guide for planning, not a quote, and that the scope and price are decided after the project has been looked at; its words contain no digit, price or time (a test reads them).

The **server works the same guide out again** from the answers it validated and stores it in the brief (`brief_json.estimate`); a size sent by the browser is never read. The administrator sees it in the request's detail and in the owner's notification e-mail, labelled "Project size (a planning guide, not a quote)". `server/test/contract.test.ts` compares the website's and the server's rule over every combination of answers (the table is duplicated on purpose: the server cannot import the website).

## Request summary (section 10)

Both flows already had a reviewable summary (the builder's review and send steps; the configurator's "Your answers" with change buttons). Added: **"your request so far"** beside the package and add-on steps, whether the cart is saved on this device (true only while the browser really keeps it; otherwise the box says it stays on this page), and the sentence the brief asks for beside both send buttons: *"Sending this request does not mean you have bought a service. We will look at what you need and prepare a quote made for you."* (HU: *A kérés elküldése nem jelenti azt, hogy megvásároltál egy szolgáltatást. …*; NL: *Het versturen van deze aanvraag betekent niet dat je een dienst hebt gekocht. …*). Submission is the existing endpoint; no other order system exists.

## Analytics (section 15)

`src/analytics/events.ts` lists every event and what it may carry (ids, small whole numbers, yes/no; no free text; `sanitize` drops anything else). New: `shop_opened`, `package_viewed {plan}`, `comparison_viewed` (once, when the comparison scrolls into view), `addon_selected {need, extra}`, `configurator_started {flow}`, `recommendation_viewed {plan}`, `summary_viewed {flow}`; existing `package_selected`, `configurator_completed`, `quote_request_submitted` (now `full-experience` for the custom request). All are sent only with the visitor's agreement and only to a registered provider. **There is still no collector: `VITE_ANALYTICS_ENDPOINT` is unset and the backend has no endpoint for events, so nothing is stored and the administration shows no Shop usage.** No conversion figure exists anywhere.

## Localization (section 11)

- **Done:** every new text exists in Hungarian, English and Dutch (`i18n:check` complete, `i18n:validate` spelling 0 unknown words in all three, a glossary check keeps one word per concept), the finder is verified in all three languages in a real browser, and a manually chosen language is kept in the `cc_lang` cookie and nothing else. The rule *saved choice → country (HU, NL) → English* is unchanged (`src/i18n/locale.ts`, `worker/`), covered by 39 Worker tests.
- **The country step needs somewhere to run, and production did not have one.** The Cloudflare Worker reads `request.cf.country`, but `www.szilardkiss.com` is answered by Render (audit finding I-4). **New, opt-in: `COUNTRY_HEADER`.** Set it (behind Cloudflare: `COUNTRY_HEADER=CF-IPCountry`, with "IP Geolocation" on in Cloudflare) and the Node server that serves the site (`modules/system/language.ts`) applies the same rule at `/` and to a page typed without a language: saved cookie, then Hungary → Hungarian, the Netherlands → Dutch, else English; crawlers and addresses that already have a language are never touched; the answer is `private, no-store`. Off unless the header is named. A test compares its decision with the Worker's for more than 15,000 combinations of path, country, cookie, user agent and method. **Trust:** the header is trustworthy only because Cloudflare sets it; a client reaching the server directly can send any value, and all that changes is the language it is itself sent to (the reason it is a default and nothing more). **Not verified:** Cloudflare's real header reaching Render (it was simulated), which needs the owner to set the variable and test from another country or a VPN.
- **Found while doing this work: production is also older than PROMPT 18.** Its main script has no `cc_lang` code and `/` still starts in Hungarian, because the deployment branch `deployment/render-cloudflare` is at `a75fa42` and PROMPT 18 (`38e2374`, the plain-language copy, the language rules and the Worker's files) is only on local `main`. Deploying `main` brings PROMPT 18 **and** Shop 4.0.
- Native proofreading of the Hungarian and Dutch copy has not happened (the dictionary check proves spelling, not naturalness).

## CMS (section 12): what the administrator can edit

| Wanted | State |
| --- | --- |
| package names, descriptions, benefits, included features, target audience, visibility, order, pricing configuration | existing: *Services & packages* (draft = disabled; an active record needs all three languages) |
| the comparison grid, tier labels, feature texts and levels | existing: *Package comparison* (draft, publish, three languages) |
| add-ons, and **which add-ons each package allows** | existing form; **now effective on the page and in the backend** |
| FULL EXPERIENCE questions, options, help, budget ranges, CTA labels | existing: *FULL EXPERIENCE* editor |
| finder questions, answers, sentences; size guide words; add-on step words; the "not a purchase" sentence | *Website texts* (the 745 wordings; the new ones appear after the seed export) |
| **not editable:** the finder's rules (which answer asks for which feature, the threshold), the size guide's points table | code, documented above |
| **draft preview** of the comparison / FULL EXPERIENCE before publishing | **not available** (the portfolio has one; the Shop documents do not) |
| translation completeness indicator | the server refuses to save/publish a document or an active record missing a language (existing); no separate meter was added |

## Tests

Run on 2026-11-13, Windows 11, Node 22, system Chrome through Playwright. **Chrome with emulated viewports and touch on one PC: not physical devices, not Safari or Firefox, not a screen reader.**

**Gate:** `tsc -b` ok · `oxlint` 0 findings · `i18n:check` and `i18n:validate` ok (2 664 texts × 3 languages, Hunspell spelling 0 unknown words in each) · **103 test files, 2 200 tests pass** (100 files / 2 149 before this work) · `npm run build` ok (91 pages) · `check:seo` ok (76 indexable) · `npm audit` 0 vulnerabilities.

**New and changed automated tests**

| File | What it exercises |
| --- | --- |
| `server/test/public.test.ts` (+5) | an add-on the package does not list is refused (Launch + API, Launch + speed check, a Build line with another package's add-on); every add-on a package lists is accepted, and any that applies to a custom project; a bad line among several stores nothing and names that line |
| `server/test/shop.test.ts` (+2) | the size guide the **server** works out (7 points: Advanced) and a size claimed by the request is ignored; no guide when nothing it is based on was answered; an old brief reads without one and a damaged one is dropped; Hungarian, English and Dutch labels in the owner's e-mail rows |
| `server/test/contract.test.ts` (+1, 1 fixture corrected) | the website's and the server's size guide agree over thousands of combinations of answers (the fixture `Launch + API` was exactly the combination now refused) |
| `server/test/language.test.ts` (new, 10) | the starting language by country on the server that serves the site: HU, NL, other, none, unknown, Tor, malformed; saved cookie first; a language in the address, files, API, administration, crawlers never touched; typed-without-language pages keep their query; GET/HEAD only; off unless named; **the same decision as `worker/routing.ts` for 20 paths × 9 countries × 6 cookies × 5 agents × 3 methods** |
| `src/shop/recommend.test.ts` (new, 11) | the questions ask only for features the comparison has; smallest sufficient package; the fit weights; the suggestion **follows an edited comparison**; missing features ignored; nothing asked = "asks for more"; "existing" limits the choice; Care beside the ladder; unavailable packages left out; ranking and buckets |
| `src/shop/fullExperience/estimate.test.ts` (new, 5) | the table, the edges (2 / 3 / 6 / 7 / 11 / 12 points), custom by nature, nothing shown without a basis, only ids the configurator has, no price/time/guarantee in its words |
| `src/shop/shop.test.ts` (+4) | `allowedExtras` for every package × service; a refused add-on changes nothing; a package change takes add-ons off and reports which; old saved carts are read through the rule |
| `src/pages/ShopPages.test.ts` (+12) | in three languages: the finder, closed; the add-on step offers five cards for Launch, each Optional, names the API and speed add-ons with Grow and Build, shows "your request so far"; a custom project or no package offers everything the service takes; the "not a purchase" sentence beside the send button |
| `src/content/catalogOverlay.test.ts` (1 rewritten, +1) | the package's add-on list follows the backend and ignores anything that is not a list of texts |

**Browser, against the built site and a real backend** (`tools/e2e/shop4-journey.cjs`, scenarios A to G of the brief; `tools/audit/audit-shop4.cjs`)

| Check | Result |
| --- | --- |
| **A** package and add-ons | pass: only Launch's five add-ons offered, each Optional with its price status; the other two named with "Available with Grow, Build"; "your request so far" follows each choice; Grow offers the API and speed add-ons; back to Launch takes them off and says so; the cart survives a reload; the request is accepted (201) |
| **B** finder | pass: four questions with a way back; "We suggest Grow", "Also worth a look: Care", the reasons, the fit list; **no request leaves the page**; "Choose Grow" then a manual choice of Build sticks; answers can be changed |
| **C** FULL EXPERIENCE | pass: the review shows "Advanced" (7 points), changing the complexity answer changes it to "Moderate", the request is accepted, and **the administrator reads "Moderate" worked out by the server** |
| **D** language | pass: the finder in Hungarian, English and Dutch with nothing left in another language; a manual choice is kept in `cc_lang` and nothing else is stored. (The country step itself is covered by the 39 Worker tests and the 10 server tests above; the real Workers runtime check, `l10n-journey.cjs`, was not re-run.) |
| **E** phone, 390 and 320 px | pass: finder and add-on step, every answer at least 44 px, nothing under 24 px, no sideways scroll |
| **F** security | pass: unknown package 422; add-on the package does not list 422 (Grow + API accepted); a price in the request ignored; missing fields all reported; a repeat answered with the first reference; an unknown answer and a language that does not exist 422, a forged size ignored |
| **G** excessive requests | pass: limited with `Retry-After` |
| Existing journeys re-run on the final build | all green: journeys A-E 72/72, quote 20/20, shop 41/41, cms 22/22 |
| Project security probe | 94/94 |
| Layout matrix, 9 widths (320, 360, 390, 430, 768, 1024, 1366, 1440, 1920), the Shop's nine pages | 81 page loads, **no findings**; Hungarian and Dutch, light, at 320, 390, 768: 36 loads, no findings |
| axe + layout on the new states (`audit-shop4.cjs`: 182 states: the finder closed / each question / the suggestion / "asks for more", the add-on step and the message after a package change, the review with the size guide, 9 widths, dark and light, three languages) | **0 violations in the new components.** 8 findings remain, two kinds that are not in them: (1) *target-size, "partially obscured"* (6): after the finder takes focus the page scrolls so a comparison button sits under the sticky site header; (2) *contrast 3.43:1* (3, phone, dark): the site header's brand name while a red filled element of the comparison passes behind the translucent header. Both are properties of the existing sticky header, not of the Shop's components, and were left alone |
| One real defect found and fixed on the way | the comparison's sticky row of names had a see-through tint for the selected package (the content scrolling under it showed behind the name: 4.4:1 in the light theme); now opaque |

**Size.** The main bundle is unchanged (120.9 kB gzip). The shop's shared words grew from 21.1 to 24.6 kB gzip (the finder, the guide and the add-on words); the front page chunk is 10.4 kB gzip and the builder 5.7 kB. No page of the Shop loads Three.js.

## Security (scenario F)

`tools/e2e/shop4-journey.cjs` scenarios F and G, plus `public.test.ts`: an **unknown package id** (422, field `items.0.plan`), an **add-on the package does not list** (422), a **price in the request** (ignored; the answer states no price), **missing required fields** (all reported together), a **repeat** (answered with the first reference, one stored request), an **unknown answer or language** (422; a forged `estimate` ignored), and an **excessive number of requests** (limited, with `Retry-After`). The project security probe still passes 94/94.

## Known limitations

- The finder's rules and the size guide's table are code: the owner cannot add a question or change a weight in the administration.
- The size guide uses the questions that exist (kind of project, a system that already exists, the parts chosen, the visitor's own complexity answer). It does not know the number of pages, the content or custom design needs, because nothing asks for them. The brief's "examples or inspiration" has no question of its own in the FULL EXPERIENCE configurator (its eight steps are Shop 3.0's: they belong in the description; the builder has a reference field).
- No draft preview for the comparison and the FULL EXPERIENCE offer.
- No analytics collector and no Shop usage in the administration (nothing is stored; no statistics are shown or invented).
- The configurator's answers are still memory-only (a reload starts again; deliberate).
- Prices: none are published, so no price is shown anywhere; the budget ranges are the owner's to enter.
- Native proofreading of Hungarian and Dutch, a physical phone, Safari, Firefox and a screen reader were not tested.
- The package ↔ service mapping in the builder is unchanged (the plan step still offers every package for every need and only *suggests*); only add-ons are restricted by package, as the brief asks.

## Remaining blockers

1. **Deploy `main`** (with this branch merged) to bring PROMPT 18 and Shop 4.0 to production: a deployment is the owner's decision. There is **no migration** in this work, but the audit's advice stands: take a backup before any deploy.
2. The country step: set `COUNTRY_HEADER=CF-IPCountry` on Render and check it from another country (the Worker route is the alternative; audit I-4).
3. The audit's four High items (persistent disk, mail DNS, `TRUST_PROXY`, canonical host) are unchanged; E-1 decides whether the quote confirmations reach customers.

**Classification: Ready after minor configuration** (merge and deploy, owner confirms the new Hungarian and Dutch copy). It is **not** "Ready for production" because nothing was deployed and the live site could not be tested, native speakers have not read the copy, and the language-by-country step is not live.
