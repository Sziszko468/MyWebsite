# Language audit and implementation report (PROMPT 18)

Date: 2026-11-11. Scope: the Shop simplification, the country-based starting language, the Hungarian / English / Dutch quality control, the
administration, SEO, and the checks that keep it so. How it works is in [README.md](README.md); this file says what was done, what was found and
what is **not** done or not proven.

## Verdict

**Language quality status: automated checks pass; human proofreading has NOT been done.**

* **Automated:** 2,587 texts × 3 languages (62 sources) pass `i18n:check` and `i18n:validate` with **0 errors**: every text exists in Hungarian, English and Dutch,
  placeholders and numbers agree, one word per concept, one register, nothing hidden in a component, and every word is in the language's Hunspell dictionary (or on a reasoned allow-list).
* **Read through by the assistant that wrote the changes (not a native speaker):** the whole Shop copy (rewritten), the Dutch and Hungarian dictionaries, a sample of the customer quote pages and the
  e-mail templates. Naturalness was judged there; it was **not** judged for the AI assistant's interface texts, the privacy notice's older parts, the About page, the Lab and the project case studies, which
  passed only the machine checks.
* **Not done:** a native-speaker or professional proofreading in any language. No claim of "correct translation" is made. The first run of the spell checker found real mistakes that nobody had seen
  (below), which is the reason not to treat "no errors" as "no mistakes": a dictionary does not find a correct word in the wrong place, grammar or awkward phrasing.

## What was done, against the brief

| # | Deliverable | State |
| --- | --- | --- |
| 1 | Simplified Shop copy | **Done.** Packages (4 × tagline, audience, 3 uses, 5 inclusions, 3 deliverables, scope, tailoring, support), 4 service areas and their pages, 8 add-ons, the comparison (21 rows, 4 tier labels), FULL EXPERIENCE (hero, 18 stages, 10 components, 7 questions-and-answers, the questionnaire), shop-wide labels. Facts, ids, prices (none), levels (included / add-on / custom / none) and limits are unchanged. |
| 2 | Improved package descriptions | **Done**, in the three-question frame (what do I get / what does it help with / is it right for me). Detail stays in the expandable groups on each package page ("The details: what is and is not included"); the comparison remains. |
| 3 | FULL EXPERIENCE | **Done.** Plain stages and components; new answers on what projects are possible, what to tell us, and that sending the request is free and commits to nothing. The owner's headline and two English buttons are kept as given. |
| 4 | Configurator questions | **Done.** The FULL EXPERIENCE "components" question no longer asks for architecture; each option has a plain label and an example. The six-step builder was already in business terms; its dev-facing hints no longer read as file paths. |
| 5 | IP-based country detection | **Done**: edge Worker, `request.cf.country`. Verified in the real Workers runtime locally; **not** on the deployed site. |
| 6 | HU / NL / EN automatic selection | **Done** (HU → hu, NL → nl, everything else and unknown → en). 31/31 browser checks. |
| 7 | Persistent manual preference | **Done** (cookie `cc_lang`, one year, only on a manual choice). |
| 8 | Centralised translation architecture | **Kept** (it already existed: typed dictionaries, `tri()`, typed e-mail word lists). Not moved to JSON on purpose, see README §2. |
| 9–12 | HU/EN/NL audit, corrections, completeness validation, CI | **Done**; CI workflow written, **not yet run on GitHub**. `npm run build` fails on a missing translation. |
| 13 | CMS language indicators | **Done** for the catalogue editors (chips, note, preview) and a **publish gate** on the server. |
| 14 | Localized SEO | **Already in place** (title, description, `lang`, canonical, `hreflang` hu/en/nl, `x-default`, sitemap); `x-default` and the root document are now English. `check:seo`: ok (76 indexable pages). |
| 15 | Mobile-first test report | See §5. |
| 16 | This report | — |

## What was corrected (every mistake the machines found, plus the human-visible ones)

**Spelling and grammar**

* Dutch **"Eén" → "Één"** (the acute accent belongs on both letters): 15 places, among them the Lab headline, the hidden racing screen and the dialogs. A test had been pinning the misspelling.
* Dutch "democedrijf" → "demobedrijf"; "Zendingdetails" → "Zendingsdetails" (missing linking s); "webontwikkelproject" → "project voor webontwikkeling" (also in the e-mail templates); "socialemediadiensten" rewritten;
  "kan worden gebookmarkt" → "als bladwijzer kan worden opgeslagen"; "volgordelijk plannen" → "in volgorde plannen"; "op de leverdag" → "op de dag van levering"; "Een baankans" → "Een baan"; "Beveiligde links werken beperkt" → "… zijn maar een beperkte tijd geldig".
* Hungarian "Psszt" → "Pszt"; "videókártyád" → "videokártyád"; compound words over six syllables written with a hyphen as the spelling rules require: "ügyfél-kommunikáció",
  "ütközés-ellenőrzés", "referencia-árfolyamok", "böngésző-munkamenet"; "szabályellenőrzött" → "szabályokkal ellenőrzött"; "ÁFÁval" → "ÁFÁ-val"; "Kattints a szétlöveléshez" (not a Hungarian word) → "Kattints, és szétrobbanthatod őket".
* English: the register of the whole site is **British** (colour, centre, customisation); the spell checker confirmed no American spelling is left in the visitor-facing text.
* **Typography:** 15 straight apostrophes (`Don't`, `Pagina's`) → `’`; 20 straight double quotes → „…” (HU), “…” (EN), ‘…’ (NL).
* **Register:** one formal "Kérjük" in a site that says "te" → "Kérlek". A number written as a digit in English and a word in Hungarian ("Within 1 month" / "Egy hónapon belül") → both words.
* **Visitor-facing developer text:** "src/config/site.ts" was part of a message in the six-step builder; it is now "The privacy notice is not available yet." (the remaining ones are shown only by the development server and are skipped by the check).

**Terminology** (one word per concept, now enforced by a rule)

* Dutch for an add-on was *toevoeging*, *optie* and *extra*: now **extra**. English *quote* and *quotation*: now **quote** (also in the e-mails). Hungarian *ajánlat* and *árajánlat*: now **ajánlat**.
* English *e-mail* and *email*: now **email** (the dictionaries already did).
* The English step label "Extras" next to "Add-ons" → "Add-ons".

**Technical expressions replaced in the Shop** — see README §5 for the list (responsive, SEO/metadata, third-party integrations, custom components, database integration, frontend and backend, application architecture, UI implementation, API & integrations, and the FULL EXPERIENCE components and stages).

## Numbers

| | Hungarian | English | Dutch |
| --- | --- | --- | --- |
| Texts (keys) | 2,587 | 2,587 | 2,587 |
| Complete (non-empty) | 2,583 | 2,583 | 2,583 |
| Words | 17,424 | 21,071 | 20,563 |
| Distinct words looked up | 4,343 | 2,192 | 2,761 |
| Not in the dictionary and not allow-listed | 0 | 0 | 0 |

The 4 texts that are not "complete" are optional fields left blank in all three languages on purpose (a help line, a feature's description, a "tax unspecified" label): not a translation gap.
By area: shop 901, projects 334, common 304, lab 275, services 226, assistant 168, e-mails 164, quote pages 120, privacy 50, About 42, SEO 3.
Missing translations: **0**. Unused keys: **0** by the name test (116 dictionary keys have names too generic to test, such as `title`).

## What the checks can and cannot do

* The allow-list holds names, the technical vocabulary of the three case studies, about 70 Hungarian entries (mostly inflected forms the Hungarian Hunspell dictionary does not generate, for example *csomagok*, *nekem*, *tervet*, *szöveget*: all correct Hungarian, plus a few jargon words)
  and about 80 Dutch entries (valid compounds such as *winkelmandpagina*, and technical words such as *offlinewachtrij*). **These were read by the same assistant, not a native speaker.** If a word on those lists is wrong, nothing will flag it.
* "Naturalness", tone, the fit of a metaphor and legal meaning are not checkable by machine. The legal meaning of the privacy and quotation texts was not reviewed.
* The Dutch is Netherlands Dutch (OpenTaal dictionary); no Flemish word was found, but no Flemish-specific check exists.

## Remaining issues (honest list)

1. **Native proofreading** of Hungarian (the owner can do it), Dutch and English: not done.
2. The deployed Worker on the real domain: not verified (the domain is not attached). First check after deploy: open `/` from a Hungarian and a Dutch connection.
3. Whether a one-year language-preference cookie needs consent where you operate: your decision; the notice describes it.
4. The AI assistant's own answers are written by the model, in the visitor's language, at run time; they are not covered by any check here (and no real model call was made for this work).
5. Case-study pages (Spendly, BookingHub, Logistics) keep the engineers' English vocabulary inside Hungarian and Dutch sentences (*queryset*, *scheduler*, *idempotent*); they were spell-checked, not simplified: they describe code for a technical reader.
6. `reszponzív` is still used in the case studies (and allow-listed); it is gone from the Shop and the home page.
7. The quote request builder and the owner's e-mails are still addressed in the form the owner set (`NOTIFY_LANGUAGE`, default Hungarian).
8. Preview in the administration is a text preview in the editor, not a draft of the real page.

## 5. Mobile-first and the quote request in each language

All of it is Chrome driven by Playwright on one PC (emulated viewports, synthetic touch). **No physical phone, no Safari, no Firefox, no screen reader.**

| Test | Result |
| --- | --- |
| **Layout matrix** (`tools/audit/audit-shop-languages.cjs`): the 13 Shop pages (front page, four service pages, four package pages, FULL EXPERIENCE and its questionnaire, the six-step builder, the cart) × Hungarian, English, Dutch × **320, 360, 390, 430, 768, 1024, 1366, 1440, 1920 px** (dark), plus 360, 768, 1440 px in the light theme | **468 page loads, 0 findings**: no sideways scroll, nothing outside the viewport, no text under 11.5 px, no touch target under 24 px, header and footer present. |
| **A quote request on a 390 × 844 phone with touch, in each language** (`tools/e2e/quote-languages-journey.cjs`, against the built site served by the real backend with a throw-away database): the six-step builder and the FULL EXPERIENCE questionnaire, 55 checks | **55/55 passed.** Every step has no sideways scroll or off-screen element and no English sentence or raw key on the Hungarian and Dutch pages; the backend answered 201 for all six requests; the confirmation page is in the visitor's language; the customer's confirmation e-mail is Hungarian, English or Dutch to match, the owner's notification Hungarian (`NOTIFY_LANGUAGE`, as configured). |
| **Test A–D, returning visitor, VPN, crawler, forged header** (`tools/e2e/l10n-journey.cjs`, 31 checks, against `wrangler dev`) | **31/31 passed.** HU → `/hu/`, NL → `/nl/`, DE / FR / US / `XX` / `T1` → `/en/`; a saved choice beats the country in both directions; the saved choice survives navigation, a refresh, a new tab and a different country; opening a page in a language does not save it; Googlebot gets 200; a forged `CF-IPCountry` / `X-Forwarded-For` is ignored. The eight Shop pages checked per language contain no English fallback sentence in the Hungarian and Dutch versions and no raw key. |

A comparison table that does not fit a phone is not shown there: from 768 px it is a table, below that a tabbed switcher (existing behaviour, unchanged); at 320 px the pair mode is off and the four tabs remain.

**Not tested:** a country-by-country run against the deployed site; the browsers and devices above; sending a quote request with a real e-mail provider (the `file` provider wrote the messages, as in the earlier journeys).

## Unit tests, types, lint

`npm test`: 99 files, 2,143 tests passed (up from 97 / 2,112; new: `worker/worker.test.ts`, `src/i18n/locale.test.ts`, `src/i18n/quality/quality.test.ts`, `server/test/catalogCompleteness.test.ts`, the admin helper tests). `tsc -b` (now four projects, including the Worker), `oxlint`: clean. `npm audit`: 0 vulnerabilities.
`wrangler deploy --dry-run`: the Worker bundles to 4.17 KiB with the `ASSETS` binding and 372 assets. **Tests that pinned older wording were changed on purpose** (the misspelled "Eén", "Ügyfélkommunikáció", the e-mail subjects "Your quotation" / "Árajánlatod", the old FULL EXPERIENCE question title, the search by "API");
two AI tests that assumed the placeholder brand now read the name from the seed (a brand-name commit had already made them stale; one full-suite run of `server/test/email.test.ts` is timing-flaky and passes alone).

## What to do next

1. Push, watch the first GitHub run of `.github/workflows/ci.yml`, and deploy; then open the site from a Hungarian and a Dutch connection.
2. Have a Hungarian speaker read the Shop (`/hu/services/…`) and a Dutch speaker read `/nl/services/…`; the allow-lists in `src/i18n/quality/allowedWords.ts` are the places to look if a word seems wrong.
3. Decide about the preference cookie (consent) and the privacy notice's wording about Cloudflare.
4. Run `npm run catalog:seed-export` after you change any Shop copy.

