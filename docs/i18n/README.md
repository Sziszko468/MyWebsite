# Languages: the starting language, the translations and the checks (PROMPT 18)

The public website speaks Hungarian, English and Dutch (`/hu/…`, `/en/…`, `/nl/…`). This page explains four things:
which language a visitor starts in and how that is decided, how the texts are organised, how they are checked,
and what the administration does to keep a half-translated text off the website.

## 1. The starting language

An address that **names a language** (`/hu/services/`) is the visitor's own choice and is never redirected. Only an address that names
none (`/`, or a path typed without a language, such as `/services`) needs a decision, made in this order:

| Order | Source | Result |
| --- | --- | --- |
| 1 | The language in the address | whatever the address says (a shared link, a search result) |
| 2 | A language the visitor **chose** with the language switcher (cookie `cc_lang`) | that language, on every later visit and page |
| 3 | The country of the connection | Hungary → Hungarian, the Netherlands → Dutch |
| 4 | Anything else (every other country, an unknown country, no country) | English |

The rule is written once, in [`src/i18n/locale.ts`](../../src/i18n/locale.ts) (no dependencies, so the edge Worker, the browser and the tests share it).
`DEFAULT_LANGUAGE` in [`src/i18n/config.ts`](../../src/i18n/config.ts) is now `en`: it is the fallback of this rule, the language of the
`x-default` alternate and of the root document (it used to be `hu`).

### How the country is found, in the real hosting environment

The site is deployed by Cloudflare Workers Builds as a Worker named `mywebsite` with static assets (`wrangler.jsonc`). Cloudflare puts the
visitor's country on every request it handles, in `request.cf.country` (a two-letter code; `XX` unknown, `T1` Tor). A Worker script is the only place
that can read it, so the site now has one: [`worker/index.ts`](../../worker/index.ts) (decision in [`worker/routing.ts`](../../worker/routing.ts)).

* **What was verified.** `wrangler dev` (the real Workers runtime, locally) was run against the built site and sent requests with different
  countries: Hungary, the Netherlands, Germany, France, the United States, `XX`, `T1`, a missing country, a saved choice, a crawler and a forged
  header (`tools/e2e/l10n-journey.cjs`, 31 checks, all passed). The same runtime filled `request.cf.country` with the real country of the developer's machine
  (`HU`), which shows the field is present in the Workers runtime.
* **What was not verified.** The deployed Worker on the real domain (`szilardkiss.com` is not attached yet) or on `*.workers.dev`: nothing was deployed from here.
  After the next deploy, open the site from a Hungarian and from a Dutch connection (or a VPN) and from the Cloudflare dashboard's request log check that `/` answers 302.
* **Never trusted:** a country sent by the browser. `CF-IPCountry`, `X-Forwarded-For` and every other request header are **not read**.
  The only source is `request.cf`, which a visitor cannot set. For local tests the Worker accepts an `x-simulate-country` header **only** when the
  environment variable `SIMULATE_COUNTRY` is `1`; it is passed on the command line (`wrangler dev --var SIMULATE_COUNTRY:1`) and is not in `wrangler.jsonc`.
  A unit test and the browser journey both check that the deployed configuration ignores the header.
* **No flicker.** The decision is a `302` from the edge before any page is sent (`Cache-Control: private, no-store`, `Vary: Cookie`), so nobody sees a page in one language
  replaced by another. `run_worker_first` in `wrangler.jsonc` runs the script only for `/` and for paths without a language; pages, assets and pictures never invoke it.
* **Crawlers** (Googlebot, Bingbot, link-preview fetchers) get the root document with status 200 and are never redirected, so every language stays reachable
  through the page's links, the `hreflang` alternates and the sitemap. The root document is the English home page with `<link rel="canonical">` to `/en/`.

### Other hosts

The Node backend (`STATIC_DIR`), `vite preview` and the dev server have no trusted source for the country. There the rule is steps 1, 2 and 4 only: the client sends `/` to the
saved language or to English (`src/i18n/preference.ts`). A neutral loading state is not needed: the decision is synchronous (a cookie read), so the wrong language is never drawn.
If the Node backend is ever put behind Cloudflare and should decide too, give it the same rule (`resolveInitialLanguage`) and read the country from a header only when its
port is reachable through Cloudflare alone; nothing in the repository does that today.

### What is stored, what is read (privacy)

* The Worker reads **only the country code**. It does not read, store, log or forward the visitor's IP address, writes nothing (no log line, no KV, no analytics event), and the
  country is not handed to the page: the answer is just an address. Workers logs are off (`"observability": { "enabled": false }`).
* The hosting network (Cloudflare) sees the connection as any web host does; the notice says so (`content/privacy.ts`, section "Language and country").
* The visitor's choice is **one first-party cookie**, `cc_lang=hu|en|nl`, `Path=/`, `Max-Age` one year, `SameSite=Lax` (`Secure` on HTTPS), written **only** when the visitor
  uses the language switcher (opening a page in a language saves nothing). It holds the language code and nothing else. It is a cookie and not `localStorage` because the Worker has to
  read it before any page exists. The privacy notice used to say "no cookies"; it now lists `cc_lang` and `privacy.test.ts` keeps the notice and the code in step
  (`i18n/preference.ts` is the only file that touches `document.cookie`).
* No precise location is used and the browser is never asked for permission.
* **Not decided by the code (owner's call):** whether a one-year preference cookie needs a consent step in your jurisdiction. The site treats it like its other
  preference items (theme, cart), which are listed but need no banner. This is not legal advice.

## 2. The texts and where they live

The texts were already centralised and type-checked; they were kept, not moved to JSON files (that would have meant touching every component for no gain).

| Where | What | How a missing language is caught |
| --- | --- | --- |
| `src/i18n/locales/{hu,en,nl}.ts` | The chrome of the site: navigation, home, footer, contact form, errors | `en.ts` and `nl.ts` are typed against `hu.ts`: a missing or extra key fails `tsc` |
| `src/content/**`, `src/components/**/…Text.ts`, … | Shop, services, packages, comparison, FULL EXPERIENCE, quotes, assistant, privacy, About, Lab, projects: `tri(hu, en, nl)` | `Trilingual` needs all three strings at compile time |
| `server/src/modules/notifications/{templates,quoteTemplates}.ts` | The e-mails | `Record<Language, Words>` at compile time |
| The administration (`/admin`) | Texts the owner edits (catalogue, comparison, FULL EXPERIENCE, wording) | server validation; see §5 |

Components do not write customer-facing words themselves; the check in §3 proves it.

## 3. The language checks

```bash
npm run i18n:check      # completeness and consistency; part of `npm run build`; fast
npm run i18n:validate   # characters, spelling in all three languages (real dictionaries)
npm run i18n:report     # counts, words per language, keys that look unused
npm run i18n            # check + validate
```

One run reads **2,587 texts × 3 languages** (62 sources: the dictionaries, 60 content files and the two e-mail modules). Source: [`src/i18n/quality/`](../../src/i18n/quality/).

| Rule | Fails when | Command |
| --- | --- | --- |
| `missing`, `empty` | a language lacks a text, or has it empty while another has it (a field blank in all three is an optional field) | check |
| `placeholders` | `{name}`, `{count}`… differ between languages | check |
| `numbers` | a number changed in translation (a price, a count, a duration) | check |
| `junk` | a raw key, `undefined`, `[object Object]`, `TODO` | check |
| `glossary` | a word the glossary forbids: one word per concept per language ([`glossary.ts`](../../src/i18n/quality/glossary.ts)) | check |
| `register` | formal address ("Ön", "Kérjük", Dutch "u/uw") in a site that says "te" and "je" | check |
| `untranslated` | two languages carry the same sentence (names, technology lists and diagram labels are allowed on purpose) | check |
| `hardcoded` | a word a visitor reads is written into a `.tsx` component (read with the TypeScript syntax tree, not a regular expression) | check |
| `encoding`, `diacritics` | broken characters; Latin-2 `õ`/`û` instead of `ő`/`ű` | validate |
| `whitespace`, `quotes`, `brackets` | stray or double spaces, a space before punctuation, straight quotes/apostrophes, quotes of the wrong language, unbalanced brackets | validate |
| `spelling` | a word the language's dictionary does not know | validate |

Spelling uses **Hunspell** (the engine of LibreOffice) with `dictionary-hu`, `dictionary-nl` and **British** `dictionary-en-gb` (the site's English is British: colour, centre,
customisation; an American spelling is a finding). Hunspell is run through `hunspell-asm` (WebAssembly), which is **not a dependency of the project**: it pulls in an old package
with published advisories, so `npm audit` would stop being clean. Install it for a run: `npm install --no-save hunspell-asm` (the CI workflow does). **Without it the Hungarian, English and Dutch
spelling is reported as NOT CHECKED, never as passed** (a fallback with `nspell` covers English and Dutch only; it cannot load the Hungarian dictionary).

The words the dictionaries do not know are listed in [`allowedWords.ts`](../../src/i18n/quality/allowedWords.ts), each list with its reason (names, technical vocabulary of the case studies, correct
Hungarian inflected forms the dictionary leaves out, correct Dutch compounds). A misspelling never goes in that file: the first run found `Eén` for `Één` fifteen times, and the text was fixed.
Two kinds of text are deliberately not spell-checked: developer-only messages (keys ending `.pending`, shown by the development server only).

**CI.** `.github/workflows/ci.yml` runs typecheck, lint, all tests, `i18n:check`, `i18n:validate`, the build and `check:seo`. `npm run build` itself starts with `i18n:check`, so a Cloudflare build fails on a missing translation.
The same completeness checks run in `npm test` (`src/i18n/quality/quality.test.ts`). **The production site contains no unresolved key**: `tools/audit/audit-i18n.cjs` and `tools/e2e/l10n-journey.cjs` look for raw keys on the rendered pages.

What these checks are not: a spell checker does not find a correctly spelled wrong word, a grammar mistake or unnatural phrasing. Nothing here replaces a native speaker; see the audit report.

## 4. The glossary

| Concept | Hungarian | English | Dutch |
| --- | --- | --- | --- |
| optional extra on a package | kiegészítő | add-on | extra (extra’s) |
| what the customer asks for and receives | ajánlat | quote | offerte |
| email | e-mail | email | e-mail |
| website | weboldal | website | website |
| package | csomag | package | pakket |

The Dutch said *toevoeging*, *optie* and *extra* for the same thing, English said *quote* and *quotation*, *e-mail* and *email*, Hungarian *ajánlat* and *árajánlat*; each is now one word and a rule keeps it so.

## 5. Writing for people with no technical background

The Shop copy follows five rules (the same ones the owner's brief gave): short sentences; everyday words; say what you get, what it helps with and who it is for; explain a technical word where
it is unavoidable; never hide an exclusion. Examples of what was replaced: *responsive / reszponzív* → "works on phones, tablets and computers"; *metadata and technical SEO* → "basic settings for search engines";
*third-party integrations / API connections* → "links to other services you already use"; *custom components* → "page elements made for you"; *database integration* → "a place to store and manage your information";
*frontend and backend* → "the part people see and the part behind the scenes"; *application architecture* → "a plan for how everything fits together"; *UI implementation* → "building from your design";
*API & integrations* → "connecting your tools and services". The FULL EXPERIENCE questionnaire no longer asks for components ("Frontend", "Authentication", "API integrations"); it asks what the project needs
("Screens that people see and use", "Sign-in for your users", "Connecting to other services") with an example under each option.

The owner's own wording from earlier briefs was **kept**, because it was given as exact words: the shop headline and its supporting line, "Custom Quote", the FULL EXPERIENCE headline (Hungarian and English) and its two English buttons.
The tests that pinned these words still pin them.

## 6. The administration

* **Language status in the editors.** The service, package, add-on and FAQ editors show a chip per language ("Magyar: Complete", "Nederlands: 3 missing"), the tab dots that were already there, a note when a *published* item is incomplete, and a
  **Preview** (the texts side by side, from the form, not yet saved). `src/admin/components/CatalogForm.tsx`.
* **Publish gate.** Saving a catalogue record as `active` (published) is refused with `422` when a field that one language has is empty in another, naming the field
  (`translations.nl.tagline: required`). Saving it as `disabled` (a **draft**) is always allowed. A field blank in all three languages is left alone. `server/src/modules/catalog/completeness.ts`; tests `server/test/catalogCompleteness.test.ts` and `admin-contract.test.ts`.
* Comparison and FULL EXPERIENCE were already drafts with an explicit publish and require all three languages on every text. The website's wording (`/admin/texts`) falls back to the built-in text per language, so it cannot lose a language.
* **Not done:** a preview of a draft on the real page (the preview is a text preview inside the editor); the 6-step builder's questions are still wording-only (their structure is in code, as before).

## 7. How to test it again

```bash
npm run build
npx wrangler dev --port 8799 --var SIMULATE_COUNTRY:1                   # the real Workers runtime
AUDIT_PLAYWRIGHT=…/playwright node tools/e2e/l10n-journey.cjs            # tests A–D: 31 checks
AUDIT_PLAYWRIGHT=…/playwright node tools/audit/audit-shop-languages.cjs  # the nine widths × 13 Shop pages × 3 languages
```
