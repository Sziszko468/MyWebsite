# PROMPT 22 — audit result and plan (written before any code was changed)

## Repository state

| | |
| --- | --- |
| Branch | `feature/quote-integration` (the one the work was found on; **not switched**, as asked) |
| HEAD | `2e734a4`, in step with `origin/feature/quote-integration`; the working tree was clean |
| PROMPT 21 | **complete and committed** (`2266faa`, `2e734a4`); this work does not touch the quotation functionality |
| Production deployment branch | `origin/deployment/render-cloudflare` (`a75fa42`), **not touched**; `main` not touched |
| Stack | React, TypeScript, Vite, Node, SQLite; no Django, no Python |

Nothing is committed, pushed, merged or deployed by this work.

## What the CMS already is (PROMPT 13.1; read in the code, not assumed)

One backend, one administration. **Projects**: one JSON document per project (`projects.content_json`, every text `{ hu, en, nl }`), validated in `projects/content.ts`; draft / published / archived; create, edit, duplicate, publish, unpublish, archive, restore, delete (with confirmation), feature, reorder, per-section visibility; publish blocked (422) while required text or alt text is missing; slug frozen once public; optimistic concurrency; admin-session preview; audit log. **Pictures**: raw-body upload, type decided from the bytes, size and pixel limits, content-hash names in `MEDIA_DIR`, in-use pictures cannot be deleted. **Wording**: 745 existing website strings overridable (home, the shop, the configurator, the About page's and the contact page's headings). **Catalogue**: services, packages, add-ons, FAQ. Public API cached 30 s; `catalog:pull` + build prerender project pages.

## Gaps against the brief (each found by reading the code)

| # | Brief | Finding |
| --- | --- | --- |
| G1 | §5 "Never silently replace missing content with another language" | The website falls back to **Hungarian** for a missing translation in about fifteen places (`card.name[lang] \|\| card.name.hu`, `hasText`, `alt`, `summary`, the gallery note, a link label, the category label). A project can also be listed and opened in a language it has no text in |
| G2 | §3 "Internal title", "Services delivered" | neither field exists |
| G3 | §8 SEO title, description, Open Graph title and description, social image | none of these exists for a project: its head is derived from the card text |
| G4 | §4 reusable, reorderable content blocks | the page is ten fixed bands that can be hidden; nothing can be added or reordered |
| G5 | §9 secure scoped preview token (hashed, revocable, time-limited) | only an administrator's own session can preview; nothing a client can be sent |
| G6 | §6 replace an image; library-level alternative text; a place to see all pictures and where they are used; production storage | the picker lives inside the project editor; a replaced picture is a manual swap per project; alt text is typed again on every use; nothing says whether `MEDIA_DIR` is on a persistent disk (audit finding D-1 is still open) |
| G7 | §8 / §9 "unpublishing must remove content from sitemaps"; "drafts never in sitemaps" | the sitemap and the prerendered project pages are written **at build time**: an unpublished project stays in `sitemap.xml` and its prerendered page keeps answering 200 (stale head, indexable) until the next build |
| G8 | §7 About page: skills and technologies, personal profile, contact information | only the About page's headings are editable; the story, the skills, the approach and the contact details and social links live in source files (`content/about/*`, `config/site.ts`); navigation and footer wording is not in the editable list |
| G9 | §10 search and filters; §12 tests | the project list has a status filter only (no search, category or featured filter) |
| G10 | §8 canonical host | the apex-versus-`www` conflict (audit finding I-1) is documented but not in the CMS documentation; it is a production decision of the owner, not changed here |

Not gaps (already as the brief asks): draft never public, publish idempotent and double-click safe, archive without losing history, delete confirmed, concurrency 409, CSRF and permission on every admin route, audit log, no HTML or rich text anywhere, picture type from bytes, in-use pictures protected, no automatic translation.

## Decisions

1. **A missing translation shows nothing, never another language.** A project is available in a language when that language has what publishing needs; the public API says which languages; the Work list, the project page, the sitemap and the head follow it. Texts that exist in some languages and not in another (optional ones) are shown as *untranslated* in the editor and are simply not drawn in the language they lack.
2. **Blocks are a small, fixed vocabulary** (text, image, gallery, feature list, technology list, highlight, links), plain text only, each one a band of the existing project page, reorderable. No rich text, no HTML, no page builder.
3. **A preview link is a bearer secret**: 256 random bits, only its SHA-256 stored, a lifetime of at most 30 days, revocable, one project, answered `no-store` and `noindex`, rate limited, never in a list or sitemap.
4. **Replacing a picture re-points what uses it** to the new file in one transaction and leaves the old file and its address alone until somebody deletes it (its name is its content hash and it is cached for a year, so the same address can never show a different picture).
5. **The sitemap and the project pages become live answers of the backend** for projects (static pages stay as built).
6. **The About page and the contact details become one editable profile document** (seeded from the website's own content, empty fields stay empty: nothing is invented), and the assistant's knowledge reads it.
7. **Storage**: the readiness check compares the media folder's filesystem with the application's; in production, the same filesystem is reported as a warning (an ephemeral disk would lose the pictures on every deploy).

## Plan

1. Backend: document fields (internal title, services, SEO, blocks), language availability, migration 0010 (preview tokens, picture descriptions), preview tokens, picture replace and library, live sitemap and page guard, profile document, storage check.
2. Administration: SEO and blocks tabs, preview links, picture library page, profile page, list search and filters, words in Hungarian and English.
3. Website: no fallbacks, availability per language, blocks, SEO head, preview-link route, profile store.
4. Tests, the CMS journey A to N (desktop, tablet, phone), the security probe, the audits.
5. Documentation: `README`, `CONTENT_MODEL`, `PUBLISHING_WORKFLOW`, `MEDIA_MANAGEMENT`, `LOCALIZATION`, `SECURITY`, `TEST_RESULTS`.
