# Localization (PROMPT 23): what was run, and what it said

Date: 2026-11-14. Branch `feature/localization-quality-engine`, from `feature/lab-six-experiences` at `4f6540f`. What was found and changed is in [docs/i18n/localization-audit-23.md](../i18n/localization-audit-23.md);
how the language system works is in [docs/i18n/README.md](../i18n/README.md). This page is only the evidence: every line below was **actually executed** on this machine, and where a run failed first, it says so.

Everything ran on one Windows PC: Chrome (system install) driven by Playwright, an emulated 390 px touch phone, throw-away SQLite databases, the `file` e-mail provider (no e-mail was sent, no real address was used, nothing was deployed and no
production setting was touched). The only requests to the live site were four plain read-only `GET`s to read its headers and root document (see the audit report, "Language selection").

## Static checks and the test suite

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, no error |
| `npx oxlint` | exit 0, no finding |
| `npm run i18n` (`i18n:check` + `i18n:validate`) | 2,738 texts × 3 languages from 65 sources; **0 errors, 0 warnings**; spelling checked with Hunspell (`npm install --no-save hunspell-asm`): HU 4,505, EN 2,271, NL 2,857 distinct words, **0 not found** |
| `npx vitest run` | **114 files, 2,412 tests, all passed** (PROMPT 22.1 ended at 111 files and 2,381; the 31 new tests are in `src/i18n/quality/localization23.test.ts` (19), `src/utils/format.test.ts` (6), `server/test/localization23.test.ts` (5) and `server/test/catalog.test.ts` (1 more)). The first full run had one failure: a test that parses every source file took 5.8 s against vitest's 5 s default under load; it now has a 60 s limit (the test itself passed) |
| `npm run build` | exit 0; 94 pages, `404.html`, `robots.txt`, `sitemap.xml`, `_headers` |
| `npm run check:seo` | ok: 95 files, 79 indexable, 16 noindex; sitemap, hreflang reciprocity, canonicals, `og:locale`, `x-default`, structured data and headers verified. The new checks were also run against pages edited on purpose (`og:locale` `en_US`; a wrong `x-default`): both failed with the right message |
| `npm audit` | 0 vulnerabilities |

## Real-browser journeys (built site, real backend, throw-away database)

| Journey | Result | Notes |
| --- | --- | --- |
| `tools/e2e/localization-journey.cjs` (new) | **37/37** | 29 routes × 3 languages × desktop and phone (174 page loads): status, `<html lang>`, title, no raw key, no unfilled placeholder, no foreign words, no sideways scroll, canonical / hreflang / `og:locale`, no outside request; the switcher and saved preference; Back and Forward; 404 per language; the country step on a server with `COUNTRY_HEADER` (header sent by the script). First run 35/37: the Logistics case study quotes the section titles of its own English document inside Hungarian and Dutch sentences; that is a citation, now recognised by the script and listed as a limitation |
| `quote-languages-journey.cjs` | **55/55** | a quote request on a phone in each language, builder and FULL EXPERIENCE; confirmation page and e-mail in the visitor's language. A run with the production rate limits ended **54/55**: the server refuses the sixth quote request within 15 minutes (HTTP 429); the journey must run with `RATE_LIMITS=false` (as its README says) |
| `quote-lifecycle-journey.cjs` | **33/33** steps, three times | customer 390 / 768 / 1440 px with the owner's language Hungarian / English / Dutch; includes the new step: the same secure link under `/en/` says, with `lang` attributes, that the quotation's title and terms are Hungarian |
| `quote-journey.cjs` | **20/20** | the English quotation journey; the confirmation subject is now "We will review your inquiry soon" |
| `journeys.cjs` (A recruiter, B client, C administrator, D phone, E hidden racing screen, F validation and failure messages in three languages) | **72/72** | **Honest history:** two earlier runs failed: 52/54 while a second journey ran at the same time on the same machine, and 64/65 with a race in the administrator step (it waited for the sender's name, which is in the list as well as in the detail page, and then found one status selector per list row). The wait was changed to something only the detail page has; the run after the change passed alone with the production limits |
| `cms22-journey.cjs` (project in three languages, preview, publish, About) | **19/19** at 390 px and at 1440 px | needs the site built with `VITE_SITE_URL=https://example.test`; on the build with the real address it fails its own `og:image` expectation (harness, not the site) |
| `cms-journey.cjs` (draft in one language, publication guard) | **22/22** | |
| `tools/audit/audit-i18n.cjs` (every page, three languages) | **no finding** | 29 pages × 3 languages, about 2,258 text blocks per language. The first run listed 46 findings, all the owner's name in the logo ("SK SZILÁRD KISS", identical in every language); the script's allow-list still knew only the placeholder name and was updated |

## Not run

* `tools/audit/audit-shop-languages.cjs` (the nine-width layout matrix over the Shop, 20+ minutes): the Shop's wording changed in one option label only; the quotation pages were laid out at 390, 768 and 1440 px by the lifecycle journey, with no sideways scroll.
* `tools/e2e/l10n-journey.cjs` against `wrangler dev`: the Worker was not changed, and it is not what serves the live site.
* Axe accessibility audit, and any browser other than Chrome; any physical device; any screen reader.
* Anything against the live site beyond the four read-only requests; nothing was deployed.
