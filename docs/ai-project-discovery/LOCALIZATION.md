# Localization

The whole visitor-facing discovery exists in **Hungarian, English and Dutch**, with no Hungarian fallback: a missing translation fails the build (`tri(hu, en, nl)` requires all three), the i18n checks fail on a gap, and the browser journey reads the panel in all three languages.

## Where the words are

| What | File | Notes |
| --- | --- | --- |
| The panel: titles, steps, buttons, states, errors, review, privacy lines | `src/content/ai/discovery.ts` | hand-written `tri()` entries (242) |
| The words of a plan's **codes** (project types, categories, priorities, factors, architecture proposals, reasons, phases, risks, next steps, section names, facts, signals) | `src/content/ai/discoveryLabels.ts` | **generated** from `server/src/modules/ai/discovery/labels.ts` (153 entries) |
| Tool status lines ("Recording the requirements…") | `src/content/ai/index.ts` (`status.tool`) | eight new entries |
| Privacy notice | `src/content/privacy.ts` | one new item in the assistant section |
| The quote request's wording (brief questions, the plan's projection) | `server/src/modules/ai/discovery/labels.ts` | the same table the website's copy is generated from |
| Administration | `src/admin/i18n/{en,hu}.ts` | English and Hungarian only, as the whole administration |

### One table, two copies, one test

The server writes the codes' words into the quote request (in the conversation's language); the website shows them to the visitor (in the current language). To keep them identical there is **one source** (the server's `labels.ts`) and a generated copy for the website. A test (`src/ai/discoveryText.test.ts`) reads both files and fails if any entry differs in any language, or if a code the interface can show has no word. (Verified by mutation: changing one word in the copy fails the test.)

## What is stored, what is translated

The database stores **identifiers** (`booking`, `essential`, `risks`…) and the **visitor's own words**. Identifiers are never translated in storage; they are worded when displayed, in the visitor's current language, so the same plan reads correctly after the visitor switches language. The visitor's words are shown exactly as written and are **never machine-translated**. The plan records the conversation's language so the quote request can be worded in it.

## What is checked

- **`npm run i18n:check`**: every text in every language, the same placeholders and numbers, one register, the glossary (for example, *email* in English, *ajánlat* for *quote* in Hungarian), no hard-coded customer-facing words in components, locale tags (`LOCALE_TAGS[lang]`, never a bare `en`).
- **`npm run i18n:validate`**: spelling against the Hungarian, English (British) and Dutch dictionaries. The first runs over PROMPT 30's texts found 21 findings (6 glossary or locale, 15 spelling: for example *localization* → *localisation*, *optimization* → *tuning*, *scalable* rephrased, some Dutch compounds rewritten); all were fixed in the texts, and nothing was added to an allow-list to make a run pass.
- **`discoveryText.test.ts`**: same placeholders in all three languages, no unfinished marker, no two languages identical where the sentence has words, **no price, currency sign or guarantee in any language**, and the sentences that must say "not an estimate", "not a quote", "not a promise" and "not confirmed" do.
- **`DiscoveryViews.test.ts` and the browser journey**: the panel is drawn from the server's state in Hungarian and Dutch (section names, codes, steps), with no English sentence leaking in and no `{placeholder}` left.

## Honest limits

- The Hungarian and Dutch texts were written by the assistant that built the feature and passed through the automated spelling and glossary checks; **no native speaker has read them**. They should be read by one before launch.
- The administration screens for the discovery are English and Hungarian only.
- The Hungarian is deliberately plain; some architecture proposals keep an English term where Hungarian developers use it (for example *SaaS*, *API*).
