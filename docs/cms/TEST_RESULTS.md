# Test results (PROMPT 22)

Run on 2026-11-14 on branch `feature/quote-integration`. Part of the work was committed by the owner as `07769fd` while the session was running; everything after it (the new tests, the browser journey, these documents, the Dutch wording of the preview texts, the probe and audit script updates) is uncommitted. Nothing was pushed, merged or deployed, and no production system or data was touched: every run below used a throw-away database on a local port.

## Automated checks

| Check | Result |
| --- | --- |
| `npx tsc -b` | clean |
| `npx oxlint` | clean (0 warnings, 0 errors) |
| `npm run i18n` (`i18n:check` + `i18n:validate`: parity, placeholders, spelling with Hunspell EN/NL) | OK, 0 errors, 0 warnings |
| `npx vitest run` (whole repository) | **107 files, 2269 tests, all passed** (the first full run during this work had 2 failures, see the last section; they were fixed in the code and words, not in the rules) |
| of which the server (`server/test`) | 31 files, 691 tests, passed |
| new: `server/test/cms22.test.ts` | 27 tests: blocks, services, internal title, search words (validation, public answer, markup kept as text, refused types and links, publication blocked on a half-translated block); languages a project can be shown in; preview links (opens a draft, hash only in the database, revoke 410, expiry 410, unknown/malformed 404 in the same words, 1–30 days, at most ten, 401 / 403 without session or CSRF, follows the project, audit lines); pictures (descriptions, replace repoints and keeps the old address, same bytes 409, wrong type 422, deletion rules, SVG/HTML refused, storage); live sitemap and project pages (stale entry dropped, draft/unpublished never listed, 404 + noindex, preview link shell headers); profile (public empty, save, ETag/304, reset, 422 naming the missing language, 409 on a stale copy, authorization, CSRF); every new route 401 without a session |
| new: `src/projects/cms22.test.ts` | 17 tests: parsing of languages / search words / services / blocks (unknown types, unsafe paths and links dropped); no language fallback in cards and pages (a Dutch page without Hungarian or English words); neighbours per language; blocks per language, drawn as text, links opened safely; head (search words, sharing words and picture, no canonical / alternates / index for a missing language); the build writes and the sitemap lists only the languages a project has; the preview-link address; the saved profile as the website reads it |
| changed: the four migration-count tests (`dashboard`, `process`, `quotation` ×2) | they now count the migrations that ship, so adding a migration cannot break them silently; the product behaviour they check is unchanged |
| `npm run build` (tsc, i18n, vite, prerender) and `npm run check:seo` | built 91 pages; `check:seo ok: 92 files, 76 indexable, 16 noindex; sitemap, hreflang reciprocity, canonicals, structured data and headers verified` |
| `npm audit` | 0 vulnerabilities |

## Browser, in a real Chrome against the real backend

All with throw-away servers (`tools/e2e/README.md`, `RATE_LIMITS=false` for the journeys).

| Run | Result |
| --- | --- |
| `tools/e2e/cms-journey.cjs` (the PROMPT 13.1 journey, unchanged) | **22/22** steps |
| `tools/e2e/cms22-journey.cjs`, 1440 × 900 (desktop) | **19/19** |
| same, 768 × 1024 (tablet) | **19/19** |
| same, 390 × 844 (phone, touch emulation) | **19/19** |

The 19 steps are: sign in through the administration; the list's search, filter and "no match" state; a project written by hand in three languages with services, four blocks, search and sharing words and pictures, saved as a draft; the draft invisible (public API, three addresses 404 + `noindex`, sitemap); the editor's new tabs and the read-only canonical address; a preview link made in the editor; the link opened by a visitor with no account in all three languages (banner, `noindex`, `no-store`, no-referrer, no word of another language) while nothing is public; the signed-in preview; publishing and the project in the list; for each language the page (own words only, blocks drawn as text, `<b>` shown literally, head title / description / sharing text / sharing picture / canonical / hreflang, no horizontal overflow, no broken picture, a full-page screenshot); the sitemap listing the project once per language; an edit republished (and a stale save refused 409); the picture library (upload, a used picture replaced, the project follows, the old address still works); the About page and e-mail address saved in three languages, shown on the three About pages and the footer, and reset; unpublishing (list, three addresses, sitemap, the link still opens the draft, withdrawn link 410); the website's existing projects untouched; clean-up and no browser console errors.

Every text in the journey carries its language's marker (`HUMARK`, `ENMARK`, `NLMARK`); the run fails if a marker of another language appears on a page. Screenshots at the three widths were looked at (the Dutch phone page and the preview-link page: banner readable, blocks as separate bands, no overflow).

Note on timing: the journeys ask the API directly (no HTTP cache), so "visible after 0 s" is the server's own behaviour. A visitor's browser may keep the project list for up to 30 seconds (`Cache-Control: max-age=30`), which is what the administration says.

## Security probe

`node tools/e2e/security-probe.mjs` against a real process with rate limits on: **95/95** checks (it was 94; the new public `/api/profile` is checked for private fields, and the five new administration route patterns were added to the "no session, no answer" sweep).

## Audits

| Audit | Result |
| --- | --- |
| `tools/audit/audit-admin.cjs` with the two new screens (`/admin/media`, `/admin/profile`) added to its list, over `/admin/media`, `/admin/profile`, `/admin/projects`, `/projects/new`, `/projects/settings`, a project's editor | **68 views, 0 findings**, in two runs (1440 and 390 px dark English; 768 and 320 px light Hungarian): layout, target size, names, one h1, axe WCAG 2.2 AA + best practice, open states |
| `tools/audit/audit-work.cjs` (the Work page and project pages, with three stress projects it creates and deletes), 4 widths × dark and light × three languages | **96 views, 12 findings, all one pre-existing item:** the project title link on a card is 118 × 22 px at 390 px wide (WCAG 2.5.8 asks 24 × 24). It was **checked against the commit before this work (`2e734a4`)** and is identical there, so PROMPT 22 did not cause it; the card styles were not touched. It is not fixed here (it would change the card's design) and is listed as open |

## Not run, or not covered (stated, not hidden)

- **No production deployment, no real e-mail, no real DNS** was involved. The production media disk (`MEDIA_DIR` on Render) is unverified (audit D-1); the canonical host conflict (I-1) is unchanged.
- **Other browsers and devices:** Safari, Firefox, real phones and tablets (Chrome with device emulation only) and a screen reader were not tested.
- **The journey enters the project's text through the API**, not by typing it, because typing three languages proves nothing the PROMPT 13.1 journey did not already prove (that one types it). The screens that are new (list search, editor tabs, preview link, picture library, profile) are driven by hand in the browser.
- **The project editor's new tabs** were opened and read in the journey and the editor screen was audited by axe in its default state, but axe was not run on every tab separately.
- **Admin unit tests for the blocks editor and the list filters** were not written: they are covered by the contract test (the editor's rules equal the server's), the type checker and the browser journey, not by dedicated unit tests.
- **The profile's first paint:** the About page first shows the website's own text and swaps to the saved profile when `/api/profile` answers. That swap was not measured for layout shift.
- **The full admin audit matrix** (all screens × 9 sizes × 2 themes × 2 languages) was not repeated; only the screens this work touched were.
- **The static-host case:** with the built files served by a host other than this backend, an unpublished project's prerendered page and sitemap entry stay as built until the next build (the live behaviour belongs to the backend, which serves the production site).

## Problems found and fixed during the work

The first full run had two failing tests (a Dutch spelling of "voorbeeldlink" rejected by the spelling check; a helper named like the content function tripped the "every file that writes texts" inventory) and the new admin text said "delivered", which a wording rule reserves for a verified mail state; all three were fixed in the code or the words, not by changing the rules. The migration-count tests were rewritten to read the shipped migrations. Writing the new tests exposed two wrong assumptions in the tests themselves (a title-only draft has no available language; two saves in the same second keep one timestamp), which were corrected in the tests after checking the behaviour was right. The journey's early failures were wrong waits and selectors (phone width has no visible `nav`; an empty live region came first), not product defects.
