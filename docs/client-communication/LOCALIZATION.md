# Localization

The customer's pages and the six e-mails exist in **Hungarian, English and Dutch**. The administration's screens exist in **English and Hungarian** (like every administration screen: it has no Dutch dictionary). **No native-speaker review has been done for any language**; the words were written by the author of the code and checked by the project's tools, which catch mistakes of form, not of taste. Treat the Hungarian and Dutch as a careful first draft until a native speaker has read them.

## Where the words are

| What | File | How |
| --- | --- | --- |
| The customer's pages (inbox, conversation, composer, filters, search, e-mail choices, events, empty/loading/error states, the menu item and badge) | `src/content/portal/messages.ts` (registered in `src/content/portal/index.ts`) | `tri(hu, en, nl)`: all three languages in one place (115 lines use `tri()`); placeholders as `{count}`, `{name}` and read by `fill()` |
| The administration (center, workspace, composer, status, settings, notes) | `src/admin/i18n/communications.ts` (registered in `en.ts` and `hu.ts`, plus `nav.communications`) | an English dictionary and a Hungarian one typed as `typeof …En`, so a missing key is a compile error |
| The six e-mails | `server/src/modules/notifications/communicationTemplates.ts` | a word list per language, subjects and bodies |
| System events | the event *keys* (`SYSTEM_EVENTS.md`) are translated on the screen, per language, with a neutral fallback for a key the screen does not know | `messages.ts` (customer), `communications.ts` (administration) |
| Dates and times | `formatMoment` and `formatZoned` (`src/utils/format.ts`), by the page's language and the time zone (a consultation event shows its own zone) | `Intl` |
| Server messages (validation, refusals) | the server sends **codes** (`tooLong`, `required`, `consentRequired`, `stale`, `archived`, …); the screens put them into the reader's language | — |

A message written by a person is **never translated or altered**: it is shown as it was written, in whatever language it was written.

## The checks that cover these files

The project's i18n quality engine (`npm run i18n:check`, `npm run i18n:validate`, `src/i18n/quality/`) reads every `tri()` text under `src/content/` and the e-mail word lists. For PROMPT 28:

* `src/content/portal/messages.ts` is read automatically (`content/**/*.ts`) and falls under the portal glossary (`PORTAL_DOCUMENTS`).
* `communicationTemplates.ts` was **added** to the e-mail loaders (`inventory.ts`) and to `PORTAL_DOCUMENTS` (`glossary.ts`), so the e-mails are compared across languages and checked against the glossary like the other portal e-mails.
* What the engine checks: that all three languages exist and are not empty; that placeholders are the same in each language; the glossary (one chosen word per concept and language, with the wrong alternatives forbidden: for example *quote*, *add-on*, and the spelling of *email*); the register (the site says *te* and *je*, so formal address such as *Ön* or *u* is an error); words from the wrong language; locale and formatting rules; literal strings in components; and Hunspell spelling for Hungarian, English and Dutch (`i18n:validate`).
* The administration's dictionaries are checked for the same keys in English and Hungarian by `src/admin/i18n/i18n.test.ts` (and by the compiler).
* **No allow-list entry, glossary exception or rule was weakened for this feature.** The only changes in `src/i18n/quality/` are the two lines that register the new e-mail file.

## What the tests show on screen

The browser journey drives the customer's inbox, a conversation and the composer in **Hungarian** and in **Dutch** and fails if a placeholder or a raw key shows in the page; it drives the administration's center and a workspace in **Hungarian**; and it checks that the three customers receive their e-mails **in their own language** with no text of any message in them. See TEST_RESULTS.md for what was run.

## What was not done

* No native-speaker review (see above) and no translator was involved.
* The administration has no Dutch (existing behaviour).
* The e-mails were rendered to HTML and text and read; they were **not** viewed in real mail programs.
* Right-to-left languages and further locales are out of scope; the site has three.

## Results of the checks

Run on 17 November 2026, on the code as committed (details in TEST_RESULTS.md):

* `npm run i18n:check`: **OK**, 3810 texts × 3 languages from 77 sources, 0 errors, 0 warnings. 3806 are complete in all languages; the other four are empty placeholders that were already in the shop and quotes content, none from this feature.
* `npm run i18n:validate`: **OK**, Hunspell found no unknown word in Hungarian (5249 distinct words), English (2396) or Dutch (3065).
* The component tests check that **every system event key the server can write has a sentence in all three languages** with no placeholder left, and the administration test checks that the English and Hungarian dictionaries have the same keys, no empty text and the same placeholders.
* The browser journey (25 checks, eight viewport, theme and motion combinations) read the customer's pages in Hungarian and Dutch and the administration in Hungarian, and the e-mails in the three customers' own languages.

These checks catch missing, empty, misspelled and inconsistent words. They cannot tell whether a sentence sounds natural to a native speaker; that review is still open (LAUNCH_CHECKLIST.md).
