# Localization audit

PROMPT 32.1. Two audits, because "4,221 of 4,225" and "the dashboard's words" are different things:

1. **The four entries** the website validator (`npm run i18n:validate`) did not count as complete.
2. **The dashboard's own dictionary** (`src/admin/i18n/analytics.ts`, 520 strings in Hungarian, English and Dutch), which the website validator does not read at all.

## 1. The four entries behind "4,221 of 4,225"

**What the number is.** `complete in all languages` counts the texts whose three versions are all **non-empty** strings. The validator has always allowed a text that is blank in *every* language (rule `checkEntry`: "an optional field left blank on purpose: not a translation gap") and has always raised an error for a text blank in only *some* languages (`empty`) or absent (`missing`). So the four are not missing, wrong or invalid translations. They are **optional texts that are blank in all three languages on purpose**, found with a script that applies the validator's own test (`scratchpad/i18n-incomplete.mjs`, the same filter as `run.ts`):

| # | Key | Languages affected | Source text (HU / EN / NL) | Why it is blank | Where it is guarded |
| --- | --- | --- | --- | --- | --- |
| 1 | `content/shop/comparison.ts#baseComparison.features[1].description` | HU, EN, NL (all three) | `""` / `""` / `""` | the tier-comparison row *"Works well on phones, tablets and computers"* needs no explanation; `row()` defaults the description to `tri('', '', '')` (comparison.ts:76) | `FeatureName` draws its explain button only when `description[lang] !== ''` (`components/shop/tiers/marks.tsx:74`) |
| 2 | `content/shop/fullExperience.ts#baseFullExperience.configurator.questions[0].help` | HU, EN, NL | `""` / `""` / `""` | the shared blank text `EMPTY` (fullExperience.ts:53) used for every configurator help line and option hint that has no words; the inventory reads a shared object once, at the first question | `question?.help[lang] && <p>…` (`FullExperienceConfigurator.tsx:196`) |
| 3 | `content/shop/fullExperience.ts#fullExperience.configurator.questions[0].help` | HU, EN, NL | `""` / `""` / `""` | the same `EMPTY` in the working copy of the offer (a `structuredClone` of the base; the owner's published document replaces it) | the same guard |
| 4 | `content/quotes/index.ts#quoteText.quote.price.tax.unspecified` | HU, EN, NL | `""` / `""` / `""` | when a quotation's tax mode is *not specified* the quotation shows **no** tax sentence: writing one ("VAT not specified" …) would be a statement about tax the studio has not made (content/quotes/index.ts:94) | `pricing.mode !== 'custom' && p.tax[pricing.tax.mode] && <p>…` (`pages/CustomerPages.tsx:167`) |

**Translation.** There is nothing to translate and I did **not** invent public copy for them: a blank help line or a blank tax note is the correct text. Putting words into the three languages would change what customers read (and, for the tax note, say something about VAT that nobody decided). If the owner *wants* a help line for the first question or an explanation for the "works on phones" row, that is a content decision to make, with the owner's words.

**Interpolation and plural forms.** None of the four has placeholders or plural forms (they are empty). **Fallbacks.** Every place that shows them tests for the empty string first (table above), so no key, `undefined` or empty paragraph is ever drawn; the tier comparison, the configurator and the quotation page were read for this.

**What was corrected: the reporting, so the number stops looking like four gaps.**

* `i18n check` / `validate` / `report` now print `complete in all languages: 4221 of 4225` **and** `blank on purpose in all languages: 4 (…the four keys…)`, plus `PARTLY missing or blank: n` if a text is blank in some languages only (0 today).
* Each blank text is **listed with its reason** in `src/i18n/quality/allowances.ts` (`BLANK_ON_PURPOSE`). A new rule `blank` (in the build's `i18n:check`) makes a text that is blank in every language and **not** listed an **error**, so a forgotten text cannot hide among the intentional ones. A text blank in only some languages stays an `empty` error (unchanged).
* `src/i18n/quality/quality.test.ts` pins it: the texts that are blank in every language equal the documented list exactly (4), every reason is a real sentence, nothing is blank in only some languages; and a test shows that an undocumented blank is flagged.

Result: `i18n:check` — 4,225 texts × 3 languages, 4,221 complete, 4 blank on purpose, 0 errors, 0 warnings.

## 2. The dashboard's dictionary

**Scope.** Hungarian (`hu-HU`), English (`en-GB`), Dutch (`nl-NL`); dashboard navigation entry, section names and leads, KPI names and definitions (≈ 55 metrics, 6 sums), filter labels and descriptions, chart and table titles and legends, table headings, empty / loading / error / not-permitted states, export and print words, alert severities, kinds, reasons and suggested steps, "unavailable" explanations, accessibility labels and tooltips.

**Method.**

1. The platform's own language rules (`src/i18n/quality/rules.ts`: placeholders, numbers, whitespace, quotes, brackets, register, untranslated text, foreign words, length) over all 520 entries × 3 languages — now a test (`analytics.test.ts`, "pass the platform's own language rules"). Result: **no finding except the website glossary**, which enforces the *customer pages'* word "quote" (50 hits on "quotation"); the administration's own vocabulary is "quotation" / "árajánlat" (`admin/i18n/quotation.ts`), so the glossary rule is excluded for the dashboard, on purpose, and the dashboard follows the administration.
2. Hunspell spell check with the same dictionaries the validator uses (HU 941 words, EN 676, NL 781 distinct words). Not found: proper names (*magyar*, *English*, *Nederlands*), loanwords and technical compounds (*forint*, *CSV*, *AI-…*, Dutch *tokens* compounds, *Backlog*) and Hungarian words the dictionary lacks (*országonként*, *kintlévőséget*): all correct, none changed. The real findings are below.
3. A read of every string for units, plural forms, grammar that depends on a number, words that do not match the rest of the platform, and wording that is wrong for what it describes.
4. Placeholders compared across languages (test: identical sets, none open), and every code the server can send compared with the dictionary (test reads the server's source).
5. Fallbacks: a code the dictionary does not know is shown humanised, never as a raw key; every section renders in the three languages without `undefined`, `[object` or `{placeholder}` (test); the browser audit repeats it in a real Chrome (270 views).
6. The administration's own words for the same things (project statuses in Hungarian and English from `admin/i18n/clients.ts`; Dutch from the customer portal), now a test.

**Findings and corrections** (key → before → after; the tests that pin them are in `analytics.test.ts`):

| # | Language | Key | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| 1 | EN | `funnel.daysFromPrevious` | "on average {value} after the previous stage" — the value was a bare number | value is formatted with its unit: "on average 1.5 days after the previous stage" | **missing unit** (the Hungarian and Dutch strings had their own unit word, English had none) |
| 2 | HU / NL | `funnel.daysFromPrevious` | "átlagosan {value} nappal …" / "gemiddeld {value} dagen …" | "átlagosan {value} az előző szakasz után" / "gemiddeld {value} na de vorige fase" (value = "1,5 nap" / "1,5 dagen") | the unit now comes from `Intl`, so the plural is the language's own ("1 dag", "30 dagen") |
| 3 | EN / HU / NL | `meta.period` | "({days} days)" / "({days} nap)" / "({days} dagen)" | "({days})" with the length formatted by `Intl` | **"1 days"** for a one-day period (Today, Yesterday); Dutch "1 dagen" |
| 4 | EN | `kpi.quotationsCount` | "{priced} of {count} quotations carry an amount" | "Quotations with an amount: {priced} of {count}" | "1 of 1 quotations" (plural wrong for 1) |
| 5 | HU | `kpi.quotationsCount` | "{count} ajánlatból {priced}-nak van összege" | "Összeggel rendelkező ajánlatok: {priced} / {count}" | the Hungarian suffix on a number is **wrong** for most numbers (3-nak, 2-nek, 5-nek, 10-nek…) |
| 6 | NL | `kpi.quotationsCount` | "{priced} van {count} offertes hebben een bedrag" | "Offertes met een bedrag: {priced} van {count}" | same plural problem, and ungrammatical word order |
| 7 | HU | `sections.funnel.lead`, `funnel.note`, `distributions.cohortCurrentStatus.help` | "kohorsz" (3 strings) | "az érkezett kérések útját követi…", "azokat az időszakban érkezett kéréseket számolja…", "az ebben az időszakban érkezett kérések" | "kohorsz" is statistics jargon a business owner does not use, and the dictionary does not know it |
| 8 | HU | `filters.quoteStatus` | "Árajánlat állapota" | "Ajánlat állapota" | inconsistent with every other quotation label in the same dictionary ("Elfogadott ajánlatok", …) |
| 9 | HU | `keys.on_hold`, `metrics.projectsOnHold`, `alerts.kinds.project_on_hold`, `alerts.reasons.project_is_on_hold` | "Felfüggesztve" / "Felfüggesztett projektek" / "Felfüggesztett projekt" / "A projekt fel van függesztve." | "Szünetel" / "Szünetelő projektek" / "Szünetelő projekt" / "A projekt szünetel." | the administration and the customer portal both say **Szünetel** for this status; the dashboard used another word for the same thing |
| 10 | NL | the same four keys | "On hold" / "Projecten on hold" / "Project on hold" / "Het project staat on hold." | "Gepauzeerd" / "Gepauzeerde projecten" / "Gepauzeerd project" / "Het project ligt stil." | the customer portal's Dutch wording for the status |
| 11 | EN | `sections.customers.lead`, `distributions.customerLifecycle.label` | "lifecycle" | "life cycle" | not in the British dictionary (en-GB spells it as two words) |
| 12 | NL | `filters.consultationStatus`, `metrics.consultationRequests.help`, `tables.aiToolUsage` (label, help) | "Consultstatus", "consultboekingen", "Toolaanroepen", "assistenttool" | "Status van het consult", "boekingen van consulten", "Aanroepen van tools", "tool van de assistent" | compounds a Dutch reader would not write (and Hunspell does not know) |
| 13 | HU / NL / EN | `charts.noData` | "Ebben az időszakban nincs adat." / "In deze periode zijn geen gegevens." / "No data in this period." | "Nincs mit mutatni." / "Niets om te tonen." / "Nothing to show here." | said "in this period" about breakdowns that are snapshots, not periods |
| 14 | HU / NL | **errors, retry and "no section" states** | drawn with the administration's own state component: sentences and the "Try again" button in the administration's language (Hungarian or English), **never Dutch** | `AnalyticsError` and `NoSection` use the screen's dictionary (`errors.generic/forbidden/invalid`, `states.retry`, `states.noSection`), new `states.retry` in 3 languages | a Dutch screen showed an English error and button; the three `errors.*` and `states.noSection` strings existed but were not used |

**New strings** (3 languages each, for the filter semantics): `scope.badge.*`, `scope.applied`, `scope.reasons.*` (4), `scope.summaryPartial`, `scope.summaryNotApplicable`, `scope.alertsApplied`, `scope.alertsNotApplied`, `filters.projectStatusHint`, `filters.ignored`, `filters.clearIgnored`, `reasons.status_not_active`, `reasons.status_not_on_hold`, `states.retry`. Quotation marks are typographic („…”, “…”); no number carries a suffix or a plural noun; placeholders are identical in all three languages (tested).

**Dashboard navigation.** `Business analytics` / `Üzleti analitika` are in the administration's own dictionaries (`nav.analytics`); the administration chrome (sidebar, header, theme button) speaks only Hungarian and English by design, so in the Dutch screen those stay in the administration's language.

## Not covered, and why

* The native `<input type="date">` shows the **browser's** date format, not the screen's language; it cannot be changed from the page.
* The CSV is written with stable **codes** (`newQuoteRequests`, `no_payment_data`), English, so a spreadsheet keeps working whatever language the screen was in; its explanatory comment lines are English.
* The spell check is Hunspell's vocabulary, which is limited for technical Hungarian and Dutch; the findings above were judged by reading, not by the checker alone.
* The website's own texts were not re-translated or re-written (not part of this task).
