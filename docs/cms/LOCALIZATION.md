# Localization in the CMS

Hungarian, English and Dutch. The rule PROMPT 22 made explicit and enforced:

> **A missing translation shows nothing. It is never replaced by another language.**

## What was wrong, and what changed

The website used to fall back to **Hungarian** wherever a translation was missing (in about fifteen places: a project's name and card text, its summary, picture descriptions, the gallery note, a link label, category names), and a project could be listed and opened in a language it had no text in. Those fallbacks are removed (`src/projects/types.ts`, `useCards.ts`, `ProjectPage.tsx`, `ProjectSections.tsx`, `ProjectHero.tsx`, `documentMeta.ts`). What stays is the **site's own interface text** (menus, buttons), which the localization engine, `npm run i18n:check` and `npm run i18n:validate` (spelling, placeholders, parity) keep complete in all three languages, and the visitor's language choice (the edge Worker's country default, the `cc_lang` cookie, the language switcher), which are unchanged.

## What a language "has"

A language is **available** for a project when it has what publishing needs and some text of its own (`availableLanguages` in `content.ts`). The server tells the website per project (`card.languages`), and:

| Part | Behaviour in a language the project lacks |
| --- | --- |
| Work list and home page | no card |
| Project page | the "not found" page, with `noindex` |
| Neighbour links ("next project") | skipped, per language |
| Head | no canonical address, no `hreflang` alternate, `noindex` |
| Sitemap, prerendered files | no entry, no file |
| A text missing inside an available language (an optional one) | the text is not drawn; no other language's text appears in its place |

A content block with no heading, or nothing to say, in the visitor's language is not drawn in that language; the other blocks still are.

By default publishing requires **all three** languages to be complete, so a published project is available in all three. The owner can switch that rule in `Projects` → "Categories and publishing" (the existing setting `requireAllLanguages`); with it off, a project can be published when only some languages are complete, and **it is then shown only in those**. That is exactly where the per-language behaviour above matters: the Dutch visitor gets no card, no page and no sitemap entry for a project that has no Dutch, instead of a page in another language. The project list ("Shown in: Hungarian") and the editor's language bar show an owner where each project is available. The browser journey and the tests run with the default rule; the one-language-only publication was checked in the website tests (availability, head, sitemap, neighbours) and the server tests (`available`), not through a published project in the browser.

## In the administration

- The editor's language bar shows, per language, **complete / incomplete / missing**, and the Publication tab names what each language lacks. Texts that exist in some languages and not in another are marked untranslated.
- **Drafts may be incomplete.** Publishing is blocked while a language lacks required text, a picture description or a block heading and text.
- Every localized part of the new model has its own three fields: block headings, texts and captions; picture descriptions (in the library and per use); services; the search title and description; the sharing title, description and picture description.
- The profile (About and contact) cannot be saved with a text that lacks a language; the server names the field (`story.title.nl`).
- **There is no automatic translation anywhere**: no service is called and no machine text is stored. Every word of every language is typed by the owner.
- The administration's own interface is in Hungarian and English (`src/admin/i18n/`, `cmsHu` typed against `cmsEn`, so a missing key fails the build).

## Checks

`server/test/cms22.test.ts` (availability per language, blocks needing all languages to publish, profile refusing a half-translated text), `src/projects/cms22.test.ts` (no fallback in `viewOf`, Dutch page without Hungarian words, per-language blocks, head and sitemap per language), the localization checks above, and the browser journey, which marks every text with its language (`HUMARK`, `ENMARK`, `NLMARK`) and fails if a mark of another language appears on a page.
