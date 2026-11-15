# Test results

Run on **2026-11-15** on Windows 11, Node (the project's), Chrome via Playwright. Everything is local and throw-away: an in-memory or scratch SQLite database, the `file` e-mail provider (messages are `.eml` files), addresses that end in `.test`, a pretend preview host answered by the test script. **No real e-mail was sent, no production data was read or written, no deploy, no merge, no push.**

## The gate

| Check | Command | Result |
| --- | --- | --- |
| Types | `npx tsc -b` | no errors |
| Lint | `npx oxlint` | 0 warnings, 0 errors |
| Whole test suite | `npx vitest run` | **144 files, 2952 tests, all passing.** (Two earlier complete runs failed on the 5-second default timeout of two tests that build the whole system three times, once per language, while the other 140 files ran in parallel: one of mine and one of PROMPT 26's. Each takes about two seconds alone; both now have an explicit 30-second limit. No assertion was changed for this.) |
| Localization structure | `npm run i18n:check` | OK (3665 texts × 3 languages; 0 errors, 0 warnings) |
| Localization spelling (Hunspell) | `npm run i18n:validate` | OK (HU 0, EN 0, NL 0 not found) |
| Production build | `npm run build` (tsc, i18n check, vite build, prerender) | OK, with and without `VITE_PREVIEW_ORIGINS` |
| SEO / headers | `npm run check:seo` | OK (104 files, 82 indexable, 22 noindex; sitemap, hreflang, canonicals, structured data and headers verified) |
| Dependency audit | `npm audit` | found 0 vulnerabilities |
| New browser journey | `tools/e2e/feedback-journey.cjs` | **30 of 30** in each of 8 width / theme / motion combinations (below), plus a repeat at 1440 and 390 with the two open dialogs scanned |
| Regression journeys | `portal-journey.cjs`, `work-journey.cjs` | against the default build (no preview origins): `portal-journey` 29 of 29 at 1440 and at 390; `work-journey` 24 of 24 at 1440 and at 390 |

## New automated tests

| File | Tests | What it pins |
| --- | --- | --- |
| `server/test/deliverablesCore.test.ts` | 39 | versions (numbers, one draft, immutability, publishing rules, the fingerprint), addresses (`https` only, no credentials, no port, no IP or internal names, no markup), types, archive, removal, optimistic concurrency, the owner's endpoints and permissions |
| `server/test/deliverablesReview.test.ts` | 27 | drafts, sending, follow-ups, resolving and reopening, positions (range, rounding, pictures only), older versions read-only, approval (explicit confirmation, exact version and fingerprint, stale, superseded, double click), changes requested, withdrawal, the review state, the history |
| `server/test/deliverablesSecurity.test.ts` | 17 | every customer door (a stranger, another customer, a made-up or unpublished reference: the same 404), nothing private in any answer, e-mail or log line after a whole journey, no redirect from a stored address, no cache/CORS, markup stays text, the e-mails (HU/EN/NL, once each, switches), the database's own refusals, erasure |
| `server/test/deliverablesConfig.test.ts` | 5 | `PREVIEW_ORIGINS`: exact https origins only, never the site's own origin, embedding by exact origin (lookalike hosts refused) |
| `src/utils/annotations.test.ts` | 6 | the position arithmetic (percent, clamping, keyboard steps, words) |
| `src/config/preview.test.ts` | 3 | `VITE_PREVIEW_ORIGINS` parsing; the portal-only `frame-src`/`img-src` and nothing else changed |
| `src/components/portal/DeliverableViews.test.ts` | 17 | the customer's page: frame only for an allowed origin and sandboxed, link otherwise, picture and markers in percent, no form on an older version, approval panel only when the server allows it, history in words, all three languages |
| `src/admin/pages/DeliverablePage.test.ts` | 12 | the owner's page: no form on a published version, the draft's preview, threads, approval lines, dictionary parity with the server's events, switches and refusal reasons |

Two existing tests were touched. `server/test/projectWorkNotifications.test.ts` got an explicit 30-second timeout on its three-language test (nothing else). `server/test/projectWorkData.test.ts` (migration 0013's upgrade test copied *all* migrations except 0013, so it broke as soon as a later migration existed; it now copies those before 0013 and checks that 0013 is what runs).

## The browser journey (`tools/e2e/feedback-journey.cjs`)

30 checks in parts A to H: the owner's setup, the administration (list, a new deliverable in the form, the draft edited with a refused address next to its field, publishing asks first), the customer (the list, a sandboxed frame from an allowed origin, general feedback as a draft then sent, a marker placed with the mouse and one with the keyboard alone), replies and resolution, a new version (the old one read-only), approval asked / a tick required / one exact version approved with its fingerprint in the owner's history / a new version that does not inherit it, asking for changes, the e-mails (one per step), what must never be seen (another customer, private fields, headers, the exact `frame-src`), Hungarian and Dutch, and **axe (WCAG 2.2 AA + best practice)** and the browser's console on every screen.

### Results of the journey over the matrix (each run against a fresh server and a fresh database)

| Width | Theme | Motion | Result |
| --- | --- | --- | --- |
| 1440 | light | normal | 30 of 30 |
| 1024 | light | normal | 30 of 30 |
| 768 | light | normal | 30 of 30 |
| 390 (touch phone profile) | light | normal | 30 of 30 |
| 320 (touch phone profile) | light | normal | 30 of 30 |
| 1440 | dark | normal | 30 of 30 |
| 390 | dark | reduced | 30 of 30 |
| 1440 | light | reduced | 30 of 30 |

Every run includes axe on every screen (no violation), the layout check for sideways scrolling, and the browser's console (no script error and no refused frame, picture or style). The two modal dialogs (the owner's *Publish this version?* and the customer's *Do you really want to approve?*) were scanned with axe **while open**, at 1440 and at 390, with no violation.

## Mutation checks (does a test fail when a rule is broken?)

Each mutant breaks one rule in the code; the tests that must catch it were run; the file was restored.

| Mutant | Result |
| --- | --- |
| the customer's ownership join removed | killed |
| approval without the explicit confirmation | killed |
| approval that ignores the fingerprint | killed |
| a new version inherits the previous approval (review rule) | killed |
| `http://` addresses accepted (both the scheme regex and the protocol check removed) | killed (either check alone is redundant: removing one survives, by design) |
| embedding decided by `startsWith` (lookalike hosts) | killed |
| a draft version visible to the customer | killed |
| a published version can be edited (trigger disabled) | killed |
| the site's own origin accepted as a preview origin | killed |
| wildcard preview origins accepted (both the `*` check and the host-name check removed) | killed (one layer alone survives, by design) |
| the general policy gets the preview origins | killed |
| the portal's policy forgets the origins | killed |
| a marker drawn in pixels instead of percent | killed |
| the frame's sandbox widened (`allow-top-navigation`) | killed |
| a frame for an address the server did not mark embeddable | killed |
| the approval panel without the server's permission | killed |

## What the checks found and fixed along the way

* The first notifier did not render the new e-mails (it dispatched only `client_*` related types): five tests failed until fixed.
* A formal Hungarian *"Kérjük"* in the approval request (page and e-mail) failed the register check and was rewritten.
* The backend accepted `https://*.example.test` as a preview origin and the build accepted `https://10.0.0.1`: the URL parser is lenient. Both now share one host-name rule (and the backend refuses its own origin).
* The customer's history showed *"Event"* for every step: the portal's words are already strings, the code expected objects. Found by looking at a screenshot, fixed, and pinned by a test.
* English *"1 unsent drafts"* / *"1 open comments"*: rewritten as *"Unsent drafts: 1"* in all three languages so no count needs a plural.
* The owner's draft form closed on a refused address, hiding the message: it now stays open until the server accepts it (journey step).
* An `h4` under an `h2` (axe `heading-order`) on the owner's draft card.
* The stale upgrade test of migration 0013 (above).

## What was NOT verified (read this)

* **No real e-mail.** Delivery, spam placement and the look in real mail clients are unverified; the e-mail DNS is still the owner's open item.
* **No real preview host.** The framing and picture loading were verified in a real Chrome against a pretend host answered by the script, so the page's own Content-Security-Policy decided. A real host's own headers (`X-Frame-Options`, `frame-ancestors`, cookies, mixed content) were not exercised.
* **Header joining on Cloudflare Pages-style hosts** is documented from how those hosts are known to behave; it was not tested on one. The backend's own static server (last rule wins) was tested.
* **No screen reader** (NVDA, JAWS, VoiceOver) was used; accessibility was checked with axe and by driving the keyboard in Chrome.
* **No real phone.** Narrow widths and a touch-capable phone profile were emulated in Chrome; clicks arrive as mouse clicks. Safari and Firefox were not run.
* **No native-speaker review** of the Hungarian, English or Dutch; Hunspell finds misspellings, not awkward sentences.
* **No load or volume test** (hundreds of deliverables or thousands of comments); the limits are per deliverable and customer (50 drafts, 500 comments).
* **No production data, no production migration run.** Migration `0014` was run only on throw-away databases (empty, and upgraded from the previous schema in the tests).
* **The legal meaning of an approval** is not assessed (see APPROVAL_WORKFLOW.md and the launch checklist).
