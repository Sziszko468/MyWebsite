# Content management: the portfolio, the pictures, the wording and the shop's catalogue

Written for PROMPT 13.1 ("Dynamic Portfolio CMS & Premium Shop Content Management"). It is the one place that says **what the owner can now change from the administration without touching the source code, how it reaches visitors, what was tested, and what could not be done**. The details of the pieces it builds on are in [`../backend/README.md`](../backend/README.md) and [`../admin/README.md`](../admin/README.md); nothing here replaces them.

There is **one backend** (`server/`, the same process, SQLite database, administrator accounts, sessions, CSRF rule, audit log and permissions as before) and **one administration** (`/admin`). Nothing was added beside them.

## 1. What can be managed, and where

| What | Where in the administration | Public result |
| --- | --- | --- |
| **Portfolio projects**: create, edit, translate, preview, publish, unpublish, archive, restore, duplicate, delete, feature, reorder | `Projects` (`/admin/projects`, `/admin/projects/:id`) | the Work page (`/<lang>/work/`), each project's own page (`/<lang>/work/<slug>/`), and **Selected work on the home page** (the same data) |
| **Work-page categories** and the **publishing rule** (all three languages complete, or not) | `Projects` → "Categories and publishing" | the Work page's filter (a category with no published project is not offered) |
| **Pictures**: upload, replace, remove, description (alt text), gallery order, thumbnail | inside the project editor, `Images` tab (the picture chooser) | project cards, project pages, the gallery |
| **The website's own wording**: the home page (hero, calls to action, services preview, about preview, final call to action), the shop's buttons and messages, the request builder's questions and answers | `Website texts` (`/admin/texts`) | the same strings, in the language edited |
| **The shop's catalogue**: services (benefits, features, description), packages (Launch, Grow, Build, Care: name, subtitle, descriptions, included/optional features, price, currency, VAT mode, pricing note, availability, order), add-ons, the FAQ | `Services & packages` and `Website content` (already existed, PROMPT 13) | the shop's pages, the cart and the request builder — **now without a new build** (§6) |

## 2. The project document

A project is one document with a fixed shape (`server/src/modules/projects/content.ts`; the editor and the server share every rule, and a test fails if they ever disagree). **Every visible text is `{ hu, en, nl }`**: the editor shows one language at a time (the language bar), and nothing is ever translated automatically.

- **General**: address (`/work/<slug>`), category, the project's real state (live, demo, in progress, concept), the card's label, title, card text and short description, the technologies on the card, whether the project has a page of its own (without one the card says "the page is not ready" and has no link).
- **Presentation**: accent colour (Racing Red, Cobalt Blue, Ink), hero composition, the concept sketch shown when there is no picture (and captioned as a sketch), the card's composition on the home page.
- **Images**: a thumbnail and a gallery (device: desktop or mobile, one marked as the hero picture, caption, **alt text in every language**), a note about the pictures.
- **Descriptions**: overview (what it is, audience, problem, goal, the owner's part), challenges (problem, what was done, where it is written down), approach (steps), technical architecture (plain text; a drawn diagram that the website's own four projects already have is kept and shown instead), key features (each with how far it has come: works / partly / only planned, and an optional picture), limits, design decisions, what was learned, **results (only what can be backed with evidence — the section is not shown while empty)**, possible next steps.
- **Technical**: technologies by group (frontend, backend, database, infrastructure, testing, external services).
- **Sections**: which of the ten sections of the project page are shown. A hidden section's text **never leaves the server** (the public API does not send it). The hero and the link to the next project are always shown; a section with nothing in it is not drawn either way (there is no empty heading).
- **Links**: live demo, source code, video, one more address. **A link is shown to visitors only when the owner ticked "I opened it and it works"**, and only if it is an `https://` address without credentials. An unchecked link is stored but never sent to the public.

Limits (identical in the editor and on the server): title 120 characters, card text 400, a line 200, a paragraph 3000, 24 gallery pictures, 12 challenges. A text that is too long is refused with the field named, never cut.

## 3. States and what a visitor can see

| State | Public API / list / page / sitemap | In the Work page and the home page |
| --- | --- | --- |
| **Draft** | never: `/api/projects/<slug>` answers 404, the page says "not found", the sitemap does not list it | no |
| **Published** | yes (within the cache time, §7) | yes; **featured** published projects make up Selected work, in list order |
| **Archived** | no (out of every list, un-featured) | no |

- **Unpublish** makes it a draft again; nothing is deleted. **Restore** brings an archived project back **as a draft** (it is never public by accident).
- A draft may be saved **incomplete** — in one language, with no pictures. **Publishing is refused (422) while required content is missing**: the title, the card text and the short description and the full description in each required language, and the alt text of every picture. The `Publication` tab lists exactly what is missing; the language bar marks each language *complete*, *incomplete* or *missing* as the owner types. With "all three languages" switched off, a language with nothing in it is simply not required (it then falls back to Hungarian on the website — a fallback, not a translation).
- The address of a project **cannot be changed once it has been public** (links and search results keep working). The words `new`, `preview`, `admin` and `api` are reserved.
- **Two administrators:** saving sends the time the project was last read (`expectedUpdatedAt`); if somebody saved in between, the server answers 409 and the editor says so instead of overwriting.
- **Delete** asks first, removes the project and its texts for good, and leaves its pictures in the picture library. Every state change, creation, edit, reorder, feature, duplicate and deletion is written to the audit log with who did it.

## 4. Preview

`Preview` opens `/<lang>/work/preview/<id>`: the real page, with the saved content, in **any** state. It is read through the administration's own protected endpoint (`GET /api/admin/projects/:id/preview`, needs a session): without a session the page says to sign in and shows nothing of the project. The page carries `noindex, follow`, a banner says that it is a preview and in which state the project is, and it is never in the sitemap. The preview shows what is **saved**, so save first.

## 5. Pictures

Reuses the way the website's pictures already worked (an address a page can use as an `<img>`), without putting anything in the database but a description:

- **Upload** (`POST /api/admin/media`): the body is the image itself (`image/png`, `image/jpeg`, `image/webp`, `image/gif`). The server decides what the file is from its **own bytes**, not from the name or the claimed type: a claim that does not match is refused; SVG, HTML and anything else is refused (415/422); more than 8000 px on a side or 36 million pixels is refused; the size limit is `MEDIA_MAX_BYTES` (6 MB by default, 100 kB–25 MB). The stored name is the file's **content hash** (`/media/<hash>.<ext>`), so what the uploader called it never reaches a path, the same bytes are stored once, and the address can be cached for good (`immutable`).
- **Served** with its real type, `X-Content-Type-Options: nosniff`, a `sandbox` Content-Security-Policy and `Cross-Origin-Resource-Policy: cross-origin`; a name that is not a hash is a plain 404 (no path outside the picture folder is reachable).
- **Optimised in the browser first**: a picture wider than 1600 px or heavier than 600 kB is re-drawn on a canvas at most 1600 px on its long side and sent as WebP (in the real-browser test a 3200 × 2000 picture of 3.6 MB became 1600 × 1000 and 62 kB). A small picture is sent as it is, and a GIF is never re-encoded (the canvas would drop its animation). The server does **not** re-encode (it has no image library: zero runtime dependencies is a rule of this backend), so what arrives within the limits is stored as sent; the browser step is a courtesy to visitors, not a safeguard.
- **Delete**: a picture a project uses cannot be deleted (409, "remove it from the project first"); the pictures that ship with the website are not deletable.
- Files live in `MEDIA_DIR` (by default a `media` folder beside the database). **Back it up together with the database** (§10).
- The website's four original projects keep their pictures at the **same public addresses** as before; they were registered in the library at the first start.

## 6. How a change reaches the website

| Change | Reaches visitors |
| --- | --- |
| A project, its pictures, the categories, the order, featured | the public API answers with `Cache-Control: public, max-age=30` and an ETag: a visitor sees it **within about half a minute** (measured: 25–31 s in a real browser, because a browser that loaded the list a moment earlier keeps it for up to 30 s). There is no push; nothing says "immediately". |
| The website's wording (`Website texts`) | read once when a page loads (`/api/texts`): the next visit, within the same half minute |
| Prices, names, texts of services, packages, add-ons, the FAQ | the website now asks the backend for its catalogue when it starts and lays it over its own content with the **same rules as the build-time pull** (only what the page already has; only complete prices; never what a package or service *is*). The shop's pages wait for the answer (at most 1.5 s; a slow or absent backend never holds a page back). **The `<head>` a search engine reads (titles, descriptions, structured data) still comes from the build**: `npm run catalog:pull` then `npm run build`. |
| A project that exists **only** in the administration | its page works at once (the backend serves the page shell with 200 for a published project the build did not prerender; the head is set in the browser). **Its search-engine head is not prerendered** until the next build — a limitation, stated again in §11. |

The static fallback: with no backend (or when it does not answer) the website shows its own four projects, its own prices and texts, exactly as before. With a backend, **its answer is the truth**: an unpublished project is not brought back from the website's copy.

## 7. Security

- Every CMS endpoint is under `/api/admin/…` and needs a session with the right permission (`content:write` for editing, `content:delete` for deleting); the checks are on the server. All 49 routes of the administration's API (the 15 new ones included) answer only 401, 404 or 405 to each of five methods without a session (the security probe, §9).
- Every write needs the CSRF token and a same-origin request; a foreign origin is refused even with the token (probed for uploads too).
- Text is stored and sent as text: the pages are React (escaped), the API is JSON. There is **no rich text and no HTML anywhere** in a project — nothing to sanitise because nothing is interpreted. External addresses must be `https://`, without credentials; `javascript:` and `data:` are refused.
- Uploads: see §5. Request bodies are limited (`BODY_LIMIT_BYTES` for JSON, `MEDIA_MAX_BYTES` for pictures).
- Public endpoints carry **only** published, public fields: no draft, no hidden section, no unchecked link, no administrator, no audit data.
- Wording changes are limited to **keys that exist** (a manifest of 486 website strings): a key cannot be invented, a text is at most 600 characters, and a string that has `{placeholders}` must keep every one.
- Audit log: `project.create/update/publish/unpublish/archive/restore/duplicate/delete/feature/unfeature/reorder/settings`, `media.upload/delete`, `text.update`, plus the catalogue's existing actions.

## 8. Orders and quote requests are never rewritten

A quote request stores **what the visitor was shown and chose at that moment** (the plan, the add-ons, the price kind and amount, VAT mode: `price_snapshot`), not a reference to today's catalogue. A test submits a request, then changes the package's price, name and text, and checks that the stored snapshot and the administrator's view are byte-for-byte the same, and that disabling the package stops **new** requests for it at once without touching the old one.

## 9. What was tested

- **Backend** (`server/test/projects.test.ts`, 29 tests, plus the contract tests): seed, the whole workflow, validation with field errors, links, hidden sections, concurrency, completeness, pictures (type, size, dimensions, polyglot, traversal, deletion rules), authorisation by role, the wording rules, the static-shell fallback, and the quote snapshot.
- **Website** (`src/projects/projects.test.ts`, `src/content/liveCatalog.test.ts`, …): the Work page and project page in three languages, the fallback, the preview route, the text overrides, the live catalogue.
- **Administration** (`src/admin/**.test.ts`): the editor's helpers and **the same rules as the server** (a test compares them), i18n parity (Hungarian/English), the isolation of the administration from the website.
- **In a real Chrome, against the real backend:** `tools/e2e/cms-journey.cjs` (22 steps: create → incomplete draft → hand translation in three languages → upload thumbnail and gallery → optimisation → preview with `noindex` → publish → visible in 25–31 s in three languages → feature → home page → reorder → unpublish (content kept) → republish → archive → restore → duplicate → cancelled delete → delete), `tools/e2e/security-probe.mjs` (94 checks), `tools/audit/audit-admin.cjs` and `tools/audit/audit-work.cjs` (the matrix in [`../release/cms-testing-report.md`](../release/cms-testing-report.md)).
- The browser run **found a real bug** that no unit test had: the gallery's "add" button created an `undefined` item and the editor screen crashed. It is fixed (the gallery's own button chooses a picture first) and has a regression test.

## 10. Back-up and restore

`npm run server:backup` copies the database; the pictures are files. Back up **both** (`DATABASE_PATH` and `MEDIA_DIR`). A restored database without its pictures shows broken pictures (the descriptions remain); restoring the pictures without the database leaves unused files, which are harmless.

## 11. What was NOT done, and what the owner has to decide

- **The configurator's structure is not editable.** Its questions, answers, hints and buttons can be re-worded in the three languages (`Website texts`), but questions cannot be added, removed, reordered or made optional/required, and an answer cannot be tied to a different service from the administration. The request builder, the cart and the quote form are built around the services the website knows; changing that structure is code, not content. (This is deliberate: it is what keeps a submitted request from ever being broken by an edit.)
- **No "fixed price" kind.** The catalogue has *on request*, *to be decided* and *from <amount> <currency>*; the pricing note can say more. A fixed price is not a fourth kind, because the cart and the quote form treat only "from" as a number; adding one means changing the pricing code and the stored snapshot's shape. **No price, discount or package was invented**: every amount on the website is one the owner entered.
- **A new service, package or add-on made only in the administration has no page and no place in the cart and the request builder**; it is stored but not shown by the website. Existing ones can be edited, disabled, re-ordered and re-priced.
- **A new project's search-engine head is not prerendered** (see §6). Run `npm run catalog:pull` and `npm run build` to prerender, or accept that a search engine sees the shell until then. (The Work page and the four original projects are prerendered.)
- **No video upload** (a video is an external link). **No automatic translation**, by design. **Images are optimised in the browser only** (no server-side re-encoding).
- **Unsaved changes:** a warning appears when leaving by a link, a menu or closing the tab; the browser's **Back button cannot be guarded** (a browser limit for this kind of router).
- **The Lab has five experiences, not six.** The owner deleted the "Generative Objects" experiment on 2026-11-01; nothing here brings it back or any AI-generated 3D object feature. The NFSU2 easter egg is untouched and separate.
- Not tested: Safari, Firefox, real phones and tablets (Chrome with device emulation only), a screen reader, a second concurrent administrator in two browsers beyond the server's concurrency test, or a production deployment (no host, domain or e-mail provider was available).
