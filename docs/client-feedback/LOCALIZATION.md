# Localization

Hungarian, English and Dutch, like the rest of the customer-facing site; the administration has the two languages it always had (Hungarian and English).

## Where the words are

| Words | File | Languages |
| --- | --- | --- |
| Everything the customer's pages say about deliverables (list, page, preview, versions, feedback, markers, approval, history, overview, errors) | `src/content/portal/deliverables.ts` (registered in `src/content/portal/index.ts`) | HU, EN, NL (each text is one `tri(hu, en, nl)`, so a missing language is a type error) |
| The seven e-mails | `server/src/modules/notifications/deliverableTemplates.ts` | HU, EN, NL |
| The owner's screens | `src/admin/i18n/deliverables.ts` (typed as `DeliverablesText`: both languages must have every key) | HU, EN |
| What a refusal's reason code says (`version_incomplete`, `approval_open`, …) | `deliverables.versions.refused` in the admin dictionary; the portal's `approval.*` and `feedback.errors.*` | as above |
| Dates and times | `formatMoment(date, lang)` in the portal, `formatDateTime(date, language)` in the administration, `Intl` with the allowed locales `hu-HU`, `en-GB`, `nl-NL` | per language |

The customer's **language** is the one in the page's address (`/hu/…`, `/en/…`, `/nl/…`) for pages and the one on their **account** for e-mails. The owner's e-mails use `NOTIFY_LANGUAGE`.

## Rules the words follow

* **Plain, never a promise.** No time for an answer, no outcome of a review, no "we will approve". *"We will go through it and reply if needed."*
* **No upload or download is ever mentioned** as possible: the site has no private place for a file. The feedback form says so honestly (*"You cannot attach a file here: if you need to send something, say so and we will agree how you send it to us."*).
* **Hungarian says "te"; Dutch says "je".** The check **found and failed** a formal *"Kérjük a jóváhagyásodat"* in the first version of the approval request, in the page and in the e-mail; both were rewritten (*"Kérlek, hagyd jóvá ezt a verziót"*).
* **Approval is always about a numbered version** (*"Jóváhagytad a(z) 2. verziót"*), in every language, so the sentence cannot be read as approving the deliverable in general.
* **Statuses keep their meaning across languages**: the five review states map to the same five phrases in all three.
* Placeholders (`{number}`, `{date}`, `{title}`, `{host}`, `{left}`, `{top}`, `{count}`, `{max}`) are the same in every language of a text; a test compares them for the administration's two dictionaries, and the i18n check for the others.

## What is checked, and what each check said

| Check | Command | Result |
| --- | --- | --- |
| Structure: every text in all languages, register, quotes, punctuation, brackets, foreign words, locale names, hard-coded text | `npm run i18n:check` | OK (3665 texts × 3 languages from 75 sources, 0 errors, 0 warnings) after the formal-address fix above |
| Spelling with **Hunspell** (`hunspell-asm`, installed with `npm install --no-save hunspell-asm`) | `npm run i18n:validate` | OK (HU 5190 words, EN 2391, NL 3053; 0 not found) after three additions to the allow-list (below) |
| The administration's two dictionaries have the same keys and placeholders, and name the server's events, switches and refusal reasons | `src/admin/pages/DeliverablePage.test.ts` | passing |
| Every portal sentence renders without a placeholder or a key in all three languages | `src/components/portal/DeliverableViews.test.ts`, and the browser journey (G) | passing |
| The e-mails are in the account's language, once each | `server/test/deliverablesSecurity.test.ts` (HU, EN, NL), and the browser journey | passing |

### The allow-list additions (read in their sentences)

The Hungarian dictionary lacks some regular forms; these were added to `src/i18n/quality/allowedWords.ts` with a comment, **after reading them in their sentences**: `anyagok`, `anyagoknál`, `anyagodból` (the plural and two cases of *anyag*, "a thing shared for review"). The English `crosshair` (the keyboard marker) was added too; it is a standard word the dictionary does not list as one word.

### Honest limits

* The translations were written and checked by the same assistant; **they have not been read by a native speaker** of each language, and Hunspell finds misspellings, not awkward sentences. The owner (Hungarian) should read the Hungarian; the Dutch and English deserve a native read before real customers see them.
* The administration is Hungarian and English only (as before); a Dutch-speaking administrator would see English.
* A customer whose language is Dutch but who is sent a deliverable titled in Hungarian sees the owner's Hungarian title: **titles and descriptions are the owner's words** and are not translated (there is no machine translation, on purpose).
