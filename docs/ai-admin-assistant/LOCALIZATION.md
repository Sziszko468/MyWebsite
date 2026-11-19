# Localization

The assistant works in **Hungarian, English and Dutch**, with no silent fallback to any of them.

## Where the words are

| What | Where | Languages |
| --- | --- | --- |
| The assistant screen (heading, history, conversation, composer, tools, context, insights, reports, drafts, errors, privacy line, suggested questions, summary export) | `src/admin/i18n/assistant.ts` (`assistantHu`, `assistantEn`, `assistantNl`) | hu · en · nl |
| The "Admin assistant" tab of the AI screen (switch, limits, usage) | the same file, `settings` | hu · en · nl (the AI screen itself speaks hu/en by the administration's language) |
| The navigation entry | `src/admin/i18n/en.ts` / `hu.ts` (`nav.assistant`) | hu · en (the administration's two languages) |
| The instructions to the model | `server/src/modules/ai/adminassistant/prompt.ts` — the **only** language-dependent part is one line, `Answer in Hungarian / English / Dutch` | – |
| The public privacy item | `src/content/privacy.ts` | hu · en · nl |

The administration's own dictionaries have two languages; this screen has three because the assistant answers in the language the administrator chooses for it (the customers' languages, Dutch among them). The assistant dictionary is **separate** from the administration's, so the existing two-language checks are untouched, and it is held against itself by tests.

## Which language is used

- The **assistant language** is chosen on the screen (a select above the three parts). It starts as the administration's own language (Hungarian or English) and is remembered in the browser (`cc-admin-assistant-language`; if storage is blocked it simply starts again from the administration's language). **The screen's words and the model's answer follow it together.**
- The browser sends the language with every question; the server requires one of `hu`, `en`, `nl` and answers **422** to anything else or to none (tested: `fr` and a missing language). The instructions say `Answer in <language>`; a conversation stores the language it last used.
- **Drafts are written in the customer's preferred language.** `draftCustomerReply` tells the model the language stored for the customer; a draft in another language is **turned back** (`language_mismatch`, with the preferred language) unless the administrator explicitly asked for another one (`adminAskedForThisLanguage`). The assistant is told never to guess a customer's language. `translateCustomerReply` is a draft too and states the source and target language. The draft card says which language it is written in and which the customer prefers.
- Report titles, labels, limitation sentences, missing-information labels and the "not available to you" areas are the screen's words in the assistant language, chosen from **codes** the server sends (`project_status`, `human_review_required`, `milestones`…), so a new server code that has no words is shown as the code (visible, never hidden) and a test fails first.

## How it is checked

`src/admin/assistant/assistant.test.ts`:

- the three dictionaries have **exactly the same keys**, the same placeholders, no empty text, no open placeholder;
- no long sentence (over 40 characters) is **identical to the English one** in Hungarian or Dutch (an untranslated sentence is caught);
- there are names for **every one of the server's 34 tools**, a title for every report kind, a sentence for every limitation code, a label for every missing-information code the readers can emit, a text for every area a business report can leave out, and an error text for every refusal reason the gateway can give — all read **from the server's source**, so the two sides cannot drift;
- suggested questions exist for every kind of context in every language;
- the screen is rendered in each language (reports, drafts, outlines, threads, history, insights), and its source holds **no sentence of its own** (no text between tags, no literal `aria-label`/`placeholder`/`title`).

The website's own `i18n:check` / `i18n:validate` scan the website's dictionaries; the administration is outside them by design, and they were run to show they are unaffected (see [TEST_RESULTS.md](TEST_RESULTS.md)).

## What is not localized, and what was not proofread

- **The data inside a report** ("Show the data") is the stored fields under their stored English names (`overdueTasksNow`, `calculatedFromAllWork`), lower-cased and spaced. It is technical data, collapsed by default, and is the same in every language.
- **Words of the existing administration components** that the screen reuses — the confirmation dialog's *Cancel* button, the search box's *clear* button, the generic error sentences of `describeError`, the toast close button — follow the **administration's** language (Hungarian or English), not the assistant's, so in Dutch mode those few words are Hungarian or English. (The dialog's title, body and confirm button are Dutch.)
- **The assistant's answers** are in the language asked for by the instruction; how well the real model keeps to Dutch or Hungarian was not tested (no real request was made).
- **Spelling was checked with Hunspell** (the same engine and dictionaries the website's `i18n:validate` uses, run on the assistant's three dictionaries with a scratch script): English found nothing but a file name and a straight apostrophe; Dutch found only compounds, loanwords and names (`Gespreksamenvatting`, `Toolaanroepen`, `AI-beheerassistent`, `Operations`…); **Hungarian is inconclusive**: in this environment the Hungarian dictionary rejects valid inflected forms (it flags `nyelven`, `szerveren`, `őket`), so its "not found" list is dominated by its own limitation and cannot be trusted either way. A spell checker finds misspelled words, not wrong or unnatural wording.
- **No native speaker has proofread** the Hungarian or the Dutch texts; they were written for this work and checked only for structure. The owner should read them (see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)).
