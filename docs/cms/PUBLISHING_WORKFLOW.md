# Publishing workflow

How a project moves from an idea to the public website and back, and what a visitor, a search engine and a client with a preview link can see at each step. Verified in `server/test/projects.test.ts`, `server/test/cms22.test.ts` and the browser journeys (`tools/e2e/cms-journey.cjs`, `tools/e2e/cms22-journey.cjs`).

## States

| State | Public API, lists, page | Sitemap | Search engines |
| --- | --- | --- | --- |
| **Draft** | `/api/projects/<slug>` answers 404; `/<lang>/work/<slug>/` answers **404 with `X-Robots-Tag: noindex`**, whatever the build wrote | never | never |
| **Published** | listed and open, in the languages the project can be shown in | listed once per language, with its alternates | `index, follow` (when the site address is configured) |
| **Archived** | out of every list, no longer featured; address 404 + noindex | never | never |

Unpublish returns a draft and deletes nothing; restore brings an archived project back **as a draft**. A project's address cannot change once it has been public.

## The steps

1. **Create** the project (`Projects` → New): an address, a category and a title are enough. Everything else can wait: **a draft may be saved incomplete**, in one language, without pictures.
2. **Write** it in Hungarian, English and Dutch by hand (nothing is translated automatically). The language bar shows, per language, whether it is complete, incomplete or missing, and the Publication tab lists what each language still lacks.
3. **Preview.** Two ways, both showing the *saved* content with a banner, `noindex` and no caching:
   - the administrator's own preview, `/<lang>/work/preview/<id>`, which needs the signed-in session;
   - a **preview link** for somebody without an account (a client approving a draft), made in the Publication tab: `/<lang>/work/preview/link/<secret>` (see [SECURITY.md](SECURITY.md)). The page says it is a preview and whether the project is a draft; it asks the browser to send no referrer.
4. **Publish.** With the default rule (all three languages; the owner can relax it in "Categories and publishing", see [LOCALIZATION.md](LOCALIZATION.md)) the server refuses (422) while a language lacks what publishing needs: title, card description, summary, the overview's "what it is", every picture's description and every content block's heading and text in every language, once it has any. Publishing twice in a row is harmless (idempotent), so a double click changes nothing. The project is then in the public list within the cache time (30 seconds; the administration says so).
5. **Edit and republish.** A save of a published project that would make it unpublishable is refused, so it can never be left half-translated in public. Saving sends the time the project was last read: if somebody saved in between the answer is 409 and nothing is overwritten.
6. **Unpublish or archive.** The project leaves the list at once for a fresh request (30 seconds for a browser that cached the list), and **its three addresses and its sitemap entries disappear immediately**, because the backend answers both live (below).
7. **Delete** asks first, removes the project and its preview links, and leaves its pictures in the library.

## Why the sitemap and the pages follow the database, not the build

The build used to write `sitemap.xml` and every project page from what was published on the day it ran, so an unpublished project stayed in the sitemap and its prerendered page kept answering 200 (an indexable page with a stale head) until the next build. Now, when the backend serves the website:

- `/sitemap.xml` is the built file with the project pages taken out and the project pages that **exist now** put in (published, with a page of their own, each in the languages it can be shown in, with `hreflang` alternates and `x-default`). Everything else in the file is passed on exactly as built. Without a built sitemap (no site address was configured) there is nothing to answer.
- `/<lang>/work/<slug>/` answers from the database: a project that is not live, or has nothing to say in that language, is the 404 page with `noindex`; a project published after the build gets the Work page's shell with 200 and the application draws it from the API.

The prerender (`npm run build`) also writes project files only for the languages each pulled project can be shown in. A host that serves the built files without this backend (a static host) still serves the file as built: the live behaviour belongs to the backend, which is how the production site is served (Render, behind Cloudflare).

## Visitors, in one place

A visitor in a language the project has nothing to say in gets "not found" there (no card in the list, no page, no sitemap entry, no `hreflang` for it). The website never shows a Hungarian or English text in place of a Dutch one. See [LOCALIZATION.md](LOCALIZATION.md).

## Audit trail

Every create, edit, publish, unpublish, archive, restore, duplicate, delete, reorder, feature, preview-link creation and revocation, picture replacement and profile change is written to the audit log with the project's address and never with its text or any secret.
