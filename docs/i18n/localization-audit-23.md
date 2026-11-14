# Localization audit and quality engine (PROMPT 23)

Date: 2026-11-14. Branch `feature/localization-quality-engine`, from `feature/lab-six-experiences` at `4f6540f` (the working tree was clean). Scope: Hungarian, English and Dutch across the website, the
quotation pages, the e-mails, the CMS, the administration, SEO and the checks that keep them honest. [README.md](README.md) explains how it all works; [language-audit-report.md](language-audit-report.md) is the
PROMPT 18 record this audit re-read. This file says what was looked at, what was found, what was changed and what was **not** done or **not** proven.

## Verdict

**The localization architecture was already sound, and it was not replaced.** Every text exists in all three languages (2,738 texts × 3), the dictionaries are typed against each other, the spelling of all
three languages passes real Hunspell dictionaries, the e-mails and links follow the customer's language, and a missing CMS translation never shows another language on the website. The audit found
**nine real problems** around that core (F1–F9, below), each demonstrated before it was changed, and **six gaps in the checks** (F10); all are fixed or documented. Nothing was rewritten that already worked.

**Language quality status: automated checks pass; human proofreading has still NOT been done.** No native speaker or professional translator has read any language. The machine cannot find a correct word in the wrong
place, a stiff sentence or a wrong legal meaning. See [Native proofreading still required](#native-proofreading-still-required). The country-based starting language is **not active in production** (below).

## How it was audited

| Area | How | Result |
| --- | --- | --- |
| Dictionaries, content files, e-mail word lists | `npm run i18n:check` and `i18n:validate` (2,738 texts × 3 languages from 65 sources) | 0 errors; spelling 0 unknown words in all three languages |
| Keys and types | `tsc -b`: `en.ts` and `nl.ts` are typed against `hu.ts`; `Trilingual` needs three strings; the e-mails are `Record<Language, Words>` | no missing or unexpected key can compile |
| Wording across the site | a concordance of every recurring concept per language (services, packages, add-ons, inquiry, quote, custom, portfolio, process, status, contact) | two inconsistencies found and fixed (F7) |
| Another language's words inside a text | a probe over every text (English, Hungarian and Dutch function words, ő/ű) | none in the 2,738 texts; the rule is now permanent (F10) |
| Sentences hidden in code | an abstract-syntax-tree scan of every `.ts`/`.tsx` for sentence-like strings outside `tri()` | none, except one set of eight example sentences that no check read (now read) |
| Routing and language selection | `src/i18n/locale.ts`, `preference.ts`, `routes/LanguageLayout.tsx`, `worker/`, `server/src/modules/system/language.ts`, the live site (four read-only GETs) | rule correct everywhere; the production path differs from what the docs said (F9) |
| Head, hreflang, sitemap | `scripts/check-seo.mjs` on the built site, `src/seo/`, the live sitemap in `server/src/modules/system/sitemap.ts` | two defects (F1, F6) |
| E-mails | every send site in `server/src/modules/notifications/notifier.ts` and the quotation flow | customer mails use the request's or the quotation's language, links carry it, owner mails use `NOTIFY_LANGUAGE`; one fallback to Hungarian (F4); one draft default (F3) |
| CMS and catalogue | `server/src/modules/catalog/*`, `projects`, `quotes`, the admin editors | one silent fall-back to Hungarian (F2) |
| Administration | `src/admin/i18n/` (Hungarian and English by design), its error mapping, its date formatting | errors are localized, never the server's wording; three dates written with the wrong locale (F5) |
| Formats | every `Intl` and `toLocale*` call in the source | American dates and a browser-dependent stamp on a British-English site (F5) |
| Accessibility of language | `lang` and `hrefLang` on the switcher, `<html lang>` of every page, the quotation page | the quotation's own words had no `lang` (F8) |
| Real browser | `tools/e2e/localization-journey.cjs` (new), the earlier quote, CMS and recruiter journeys, `audit-i18n.cjs` | see [Tests](#tests-actually-run) |

## What was found, and what was done

| # | Finding (demonstrated) | Change | Proof |
| --- | --- | --- | --- |
| F1 | **The live sitemap contradicted the pages.** For a project page, the sitemap the server answers (`/sitemap.xml`, rebuilt from the database) wrote `x-default` → the **Hungarian** page; the page's own head and the built sitemap write the **English** one (PROMPT 18 made English the default). Two `x-default`s for one page is a contradictory hreflang set. | `DEFAULT_LANGUAGE` is now one constant on the server too; the live sitemap uses it. A test fails if it differs from the website's. | `server/test/cms22.test.ts`, `server/test/localization23.test.ts` |
| F2 | **The public catalogue API filled a missing translation with Hungarian**, labelled as the language asked for (`/api/services?lang=nl` returned Hungarian text for a service with no Dutch). The website does not use this form (it asks for `lang=all`), so no visitor saw it; but it broke the rule the CMS states, and a test pinned it. | A record with nothing in the asked language is left out of a list and is `404` as a single record; `lang=all` is unchanged. The test now pins the opposite, on purpose. | `server/test/catalog.test.ts` (two tests) |
| F3 | **A quotation draft saved without a `language` became English.** `parseDraft` defaulted to `en`; the draft is replaced on every save, so a Hungarian customer's quotation, its e-mail and its secure link would have been English. The administration always sends the language, which is why nobody saw it. | The draft keeps the quotation's own language when the body names none; an explicit one wins; an unknown one is refused. | `server/test/localization23.test.ts` |
| F4 | A customer's confirmation e-mail showed a package by its **Hungarian** name when the e-mail's language had none (only for a request saved before names were stored with it). | Shows the code (what the request itself stores), never another language. | code change only: that path is legacy and was **not** covered by a new test (a test that reached it would need a request without saved names) |
| F5 | **Dates and amounts were written with a bare `en`** in six places (the project page's "reviewed" date, the saved-works list, the list of conversations, three price displays; the prices happen to read the same today, but each guessed its own locale) and with the browser's own locale in two (the name of a kept work), on a site whose English is British: "October 28, 2026" on one page, "28 October 2026" on the next, "11/14/26" in the list. The administration wrote three dates with its language code alone. | One table, `LOCALE_TAGS` (`hu-HU`, `en-GB`, `nl-NL`), and helpers in `utils/format.ts`; every call uses them; the server's money formatter is checked against the same tags. | `src/utils/format.test.ts`, `server/test/localization23.test.ts`, rule `locale` |
| F6 | `og:locale` for English was `en_US` on a British-English site. | `en_GB`. | `routes/documentMeta.test.ts`, `seo/seo.test.ts`, `check:seo` (proven to fail on an injected `en_US`) |
| F7 | **Terminology.** English wrote both *inquiry* (5 texts) and *enquiry* (4); the owner's own word is *inquiry*. And the quotation a customer is asked to accept was *the quote* in one sentence and *the offer* (English, 9 texts) or *het voorstel* (Dutch, 9 texts) in the next, on the quotation page and in the e-mails, which reads as two documents. Hungarian already said *ajánlat* throughout. | Five English *enquiry* texts (one of them in the administration) and eighteen quotation texts (nine English, nine Dutch) corrected; the glossary now holds 10 concepts, with a rule limited to the quotation files (*offer* and *voorstel* remain right elsewhere). | `i18n:check`, `src/i18n/quality/localization23.test.ts` |
| F8 | **The quotation page did not say which language its words are in.** The customer's secure link opens in the page's language, while the title, scope, terms and prices are written by the administrator in the quotation's language: a screen reader read them in the wrong voice whenever the two differed. | The administrator's words carry `lang` (title, introduction, sections, line descriptions, timeline, a status update). | a step in `tools/e2e/quote-lifecycle-journey.cjs` (the same link under `/en/` says the title and terms are Hungarian): 3 runs passed |
| F9 | **The documentation said the Worker serves the site.** `docs/i18n/README.md` described a Cloudflare Worker as the deployed path. The platform audit (PROMPT 19) and four read-only requests on 2026-11-14 show Render behind Cloudflare, root document in Hungarian, no redirect by country or cookie. | §1 of the README rewritten around the real path; the country step documented as **not active in production**; what is and is not verified is stated. | this file, README §1 |
| F10 | **The checks had gaps** (below). | Closed. | tests listed below |

### The gaps in the checks, and the new checks

| Rule | What it does | Exceptions (each with its reason, in the file named) |
| --- | --- | --- |
| `foreign` (new) | words of another language inside a text; ő/ű in English or Dutch | `allowances.ts`: "Do Not Track", "Global Privacy Control", "Hollandia Kezdőknek" |
| `locale` (new) | a language or locale the site does not have, in `lang`, `hreflang`, a comparison, an address or an `Intl` call | none |
| `literal` (new) | a sentence written in code outside `tri()` | `literals.ts`: a Three.js warning filter, two CSS font stacks, a robots directive; two whole files (the word list the Generative Objects experience reads, and its examples, which the inventory reads instead) |
| glossary, scoped | an entry can be limited to the files where a word means one thing; an approved word must be used somewhere in the site | the quotation files for *offer*/*voorstel* |
| `check:seo` (extended) | `og:locale` and its alternates; the languages each page lists equal the pages that exist; `x-default` is English when the page has it; the sitemap's alternates equal the head's; a language version that kept another language's title or description fails | `check-seo.mjs`: the six Lab experiments' names and "Contact" share a title across languages on purpose |
| the inventory | the eight "Example" sentences of Generative Objects were read by no check; they are now (spelling: 0 unknown) | |

All of it is deterministic, needs no network, runs in `npm run build` (`i18n:check`) and CI, and was shown to **fail** when a defect is injected, not only to pass on clean input
(`localization23.test.ts`; the SEO check was run against a page edited to say `en_US` and against a wrong `x-default`).

## What was verified and left unchanged

* **Dictionary parity and keys.** Typed at compile time; 2,734 of 2,738 texts are non-empty in all three languages (the other four are optional fields left blank everywhere, on purpose); placeholders and numbers agree.
* **Language selection.** The rule (saved choice → country → English; an address that names a language is never touched; crawlers never redirected; no fingerprinting; the cookie is written only by choosing) is correct in the
  browser (`i18n/preference.ts`), the Worker, and the Node server, which a test compares for over 15,000 combinations. The browser's own language is deliberately not a signal.
* **E-mails.** Every customer e-mail (inquiry and quote confirmations, status messages, the quotation, its revision, acceptance, decline, the receipt for a question) is written in the request's or the quotation's language, and its
  links carry the same language (`/hu/quote/…`); the owner's are in `NOTIFY_LANGUAGE`; internal notes never go to the customer. Lifecycle journey: owner language Hungarian, English and Dutch, three customer widths, all passed.
* **CMS.** A project is available per language, a language it lacks has no card, no page, no canonical, no hreflang and no sitemap entry; publishing needs all required languages (the owner can relax this); no automatic translation anywhere.
* **Administration.** Hungarian and English by design (the owner's languages), dictionaries equal at compile time and in `src/admin/i18n/i18n.test.ts`; errors are never the server's English wording.
* **Prices, quote calculations, the order lifecycle, payments, the schema, the e-mail provider:** not touched.

## Language selection and country detection

Order: the language in the address → a language the visitor chose with the switcher (cookie `cc_lang`, one year, written **only** by choosing) → the country of the connection (Hungary → Hungarian, the Netherlands → Dutch) → English.

**Production reality (observed on 2026-11-14, four plain GET requests, nothing changed):** `szilardkiss.com` → `301` → `www.szilardkiss.com` → Cloudflare → Render; the root document is `<html lang="hu">` with a canonical of `https://szilardkiss.com/hu/`,
and `/` answers `200` with no redirect. So the deployed build predates PROMPT 18 and **the country step is not active**. The Worker in the repository is not in that path. The way to switch it on is `COUNTRY_HEADER=CF-IPCountry` on Render with
Cloudflare's "IP Geolocation" on, **after deploying** a build that has the code; whether Cloudflare's header reaches Render and is right was **not verified**, and cannot be from the repository. The canonical host (apex in the pages, `www` in the redirect) was **documented, not changed** (PROMPT 19 finding).

## Tests actually run

The full table, with the commands and the runs that failed first, is [docs/release/localization-23-report.md](../release/localization-23-report.md). In short, everything below was executed on this machine:

| What | Result |
| --- | --- |
| `tsc -b`, `oxlint`, `npm audit` | clean; 0 vulnerabilities |
| `npm run i18n` | 2,738 texts × 3 languages, 0 errors; spelling 0 unknown words (HU 4,505, EN 2,271, NL 2,857 distinct words) |
| `npx vitest run` | 114 files, **2,412 tests, all passed** (+31 new) |
| `npm run build`, `npm run check:seo` | build ok (94 pages); SEO ok (95 files, 79 indexable), including the new checks |
| `localization-journey.cjs` (new) | 37/37: 174 page loads, the switcher, saved preference, Back/Forward, 404 per language, the country step on a server with `COUNTRY_HEADER` |
| `quote-languages-journey.cjs` | 55/55 (with `RATE_LIMITS=false`; 54/55 with the production limit, which refuses the sixth quote request in 15 minutes) |
| `quote-lifecycle-journey.cjs` | 33/33 three times (customer 390 / 768 / 1440 px, owner language Hungarian / English / Dutch) |
| `quote-journey.cjs`, `cms-journey.cjs`, `cms22-journey.cjs` (390 and 1440 px) | 20/20, 22/22, 19/19 and 19/19 |
| `journeys.cjs` | 72/72 in the last run; two earlier runs failed for reasons in the journey (machine load; a wait that was satisfied by the wrong page), not the site |
| `audit-i18n.cjs` | no finding on 29 pages × 3 languages |

**Not run:** the nine-width Shop layout matrix, the Worker's `wrangler dev` journey, axe, any browser but Chrome, any real device.

## Limitations (not done, or not proven)

1. **Native proofreading** (below): not done.
2. **The country step in production**: not active, not verified (above).
3. **The administration's own words** (Hungarian and English) are checked for equal keys and placeholders but are not spell-checked or run through the glossary: its vocabulary (SMTP, webhook, DKIM…) needs its own allow-list, which was not written.
4. **The AI assistant's replies** are written by the model in the visitor's language at run time and are covered by no check here (no model call was made).
5. **Case-study pages** keep the engineers' English vocabulary (`queryset`, `scheduler`) inside Hungarian and Dutch sentences, and quote one English document's section titles (`docs/architecture.md · The shipment workflow · …`); they pass the machine checks and are not simplified.
6. **Language marks inside a page.** `lang` is set on the page, the switcher and the quotation's own words; the names of the six Lab experiences (English proper names) and the English technical terms inside Hungarian or Dutch case studies are not marked `lang="en"`.
7. **Browsers.** Chrome only, driven by Playwright on one PC, emulated phone; no Safari, no Firefox, no physical device, no screen reader.
8. **AI knowledge fall-back** (`ai/knowledge.ts`) and the administration's list titles still fall back to another language's text, on purpose (see [docs/cms/LOCALIZATION.md](../cms/LOCALIZATION.md)).
9. **F4 has no test of its own** (legacy path).

## Native proofreading still required

Nobody who is a native speaker of Hungarian, English or Dutch, and no professional translator, has reviewed these texts. In the order a customer meets them:

1. **Dutch (Netherlands) — everything a customer reads:** the Shop and the package pages (`/nl/services/…`), the quotation page and the six e-mails (`quoteTemplates.ts`), the contact form and its messages, the privacy notice (also legal meaning).
2. **Hungarian — the same list**, and the About page, the Lab and the six experiences' controls, the AI assistant's interface texts.
3. **English — the quotation e-mails and the Shop** (British spelling; *quote*, *inquiry* are the chosen words).
4. **Lawyer, not a proofreader:** the privacy notice and the terms in a quotation (`legal meaning was never reviewed`).
5. The allow-lists, which a machine cannot judge: `src/i18n/quality/allowedWords.ts` (about 150 Hungarian and Dutch entries), `allowances.ts`, the glossary.

## What to do next

1. Deploy a build that has PROMPT 18 and later (production is older), then set `COUNTRY_HEADER=CF-IPCountry` on Render, turn on Cloudflare "IP Geolocation", and open `/` from a Hungarian and a Dutch connection.
2. Have the readers above read the pages named.
3. Run `npm run catalog:seed-export` after changing any Shop copy; run `npm install --no-save hunspell-asm` before `npm run i18n:validate`.
