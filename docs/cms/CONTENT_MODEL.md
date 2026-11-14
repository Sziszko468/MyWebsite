# Content model

What the CMS stores, in the shape the code uses. Everything here is read from `server/src/modules/projects/content.ts` (the rules), `server/src/modules/profile/content.ts` (the profile) and `server/src/db/migrations/` (the tables). The editor in `src/admin/lib/projects.ts` repeats the project rules; `server/test/admin-contract.test.ts` fails if the two ever disagree. There is **one** content model: PROMPT 22 added fields to it and one document beside it, and created no second store.

## Tables

| Table | What it holds | Migration |
| --- | --- | --- |
| `projects` | one row per portfolio project: `slug`, `category`, `status` (`draft`, `published`, `archived`), `featured`, `position`, `published_at`, `updated_at`, and the whole document as JSON in `content_json` | `0004_projects_media_texts.sql` |
| `media` | one row per picture: content hash, type, size, dimensions, where the file is (`upload` in `MEDIA_DIR`, or `public` for the pictures that ship with the website), the original file name, and (new) `alt_json`, the picture's description in three languages | `0004`, `0010` |
| `text_overrides` | the website's own wording that the owner changed, per key and language | `0004` |
| `project_preview_tokens` | one row per preview link: the project, **the SHA-256 of the secret**, a label, who made it, `created_at`, `expires_at`, `revoked_at`, `last_used_at` | `0010_cms_completion.sql` |
| `settings` (key `site.profile`) | the About-and-contact document and the time it was saved; no row means the website shows its own content | `0001` (the generic settings table) |

Migration `0010` is additive: two statements, a new table and a new column with a default. No existing row or column is changed, so existing portfolio content and customer data are untouched. A project saved before this version has no new fields; it is read through `upgradeContent`, which gives each new field its empty value (nothing is invented) and does not rewrite the stored row.

## The project document

Every visible text is `{ hu, en, nl }`. Limits are enforced identically in the editor and on the server; a text over its limit is refused with the field named, never cut.

| Group | Fields |
| --- | --- |
| Names | `internalTitle` (administration only, 120), `title` (public title, 120), `cardLabel` (200), `cardDescription` (400), `summary` (800) |
| Presentation | `detailPage`, `projectStatus` (live, demo, in progress, concept), `accent`, `hero`, `mockup`, `layout`, `tags` (24, 60 each) |
| Pictures | `thumbnail` (+ alt per language), `gallery` (24: device, alt, caption, one `hero`), `galleryNote` |
| Overview | `overview.what / audience / problem / goal` (3000 each), `role`, `services` (**new**: the services delivered, one short line each, 200) |
| Story | `challenges` (12: title, problem, solution, source), `approach`, `architectureText`, `architecture`, `features` (title, text, status, picture), `limits`, `decisions`, `learned`, `results`, `next` |
| Technologies | `stack` by group (frontend, backend, data, infrastructure, testing, services; 40 each), `repoName` |
| Links | `links.demo / source / extra / video`: `https://` only, no credentials, shown to visitors **only when the owner ticked "I opened it and it works"** |
| **Blocks** (new) | `blocks`, at most 20, see below |
| **Search and sharing** (new) | `seo`, see below |
| Visibility | `hidden`: sections the owner hid (now including `blocks`); a hidden section's words never leave the server |

No result, client, statistic or testimonial is ever created by the system: an empty field stays empty and the page leaves the section out.

### Content blocks

A small, fixed vocabulary. A block is one band of the project page with its own heading, drawn after the standard bands and before the links, in the order the owner arranged them. Plain text only: there is no rich text and no HTML anywhere, and the website writes every text as text (`<script>` or `<b>` typed into a block appears literally on the page).

| Type | Carries |
| --- | --- |
| `text` | `heading`, `body` (3000; a blank line starts a new paragraph) |
| `image` | `heading`, `mediaId`, `alt`, `caption` |
| `gallery` | `heading`, up to 12 images (`mediaId`, `alt`, `caption`) |
| `features` | `heading`, a list of short lines |
| `technologies` | `heading`, a list of names (duplicates removed) |
| `highlight` | `heading`, one highlighted passage (1500) |
| `links` | `heading`, up to 6 links (`label`, `url`, `verified`) |

The server validates the type against the vocabulary (an unknown type, for example `html`, is refused with the field named), drops anything a block was sent that its type does not carry, checks that every picture exists and every address is `https://`, and sends visitors only what is safe: a link not ticked as checked and a block with nothing in it are not in the public answer.

### Search and sharing

`seo.title` (70), `seo.description` (200), `seo.ogTitle` (90), `seo.ogDescription` (200), `seo.imageMediaId` and `seo.imageAlt`. An empty field falls back to the project's own text **in the same language** (title, card description), never to another language. The canonical address is not a field: it is computed (`/<language>/work/<slug>/` on the configured site address) and shown read-only, so two pages can never claim the same address.

## The profile document

One document (`site.profile`) for the About page and the contact details: `story` (title, paragraphs, closing thought), `strengths` (what carries over: name and text), `skills` (groups with technology names and an optional level), `focus` (topics the owner works on now, each can be switched off), and `contact` (an e-mail address and up to six `https://` profiles). The administration starts from the website's own content (`server/seed/profile.seed.json`, written from the source files by `npm run catalog:seed-export`); saving replaces what the website shows for these parts, and "Go back to the website's own content" removes the saved document. **A text must exist in all three languages before the document can be saved**, because the website never fills a gap with another language; a text with a missing translation is refused with the field named (`story.title.nl`). A list entry with no text at all is dropped.

## What is not in the CMS

The homepage hero and call-to-action words, and the navigation and footer words, remain editable through the existing "Website texts" screen (745 keys, `text_overrides`); PROMPT 22 did not add a second mechanism for them. The skills, focus and contact details now come from the profile document as described above. Featured projects and their order are the projects' own `featured` and `position`.
