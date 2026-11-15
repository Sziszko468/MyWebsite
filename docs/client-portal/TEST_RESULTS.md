# Client portal: test results

Run on **2026-11-15**, Windows 11, Node 22, the branch `feature/client-portal` cut from `feature/booking-launch-readiness` @ `d47ebe1`. **Everything below is a local result**: a throw-away database, a scratch backend serving the built site, a recording mailer or the `file` e-mail provider, Chrome driven by Playwright. Nothing was run against production, a real provider, real DNS, a real mailbox or a real customer. Statuses: **Tested locally** (a command and its output), **Not verified** (nobody checked it), **Owner action required** (a decision), **Not applicable**.

## The commands and what they printed

| Command | Result | Status |
| --- | --- | --- |
| `npx tsc -b` (typecheck of the website, the administration, the server and the worker) | no output: clean | Tested locally |
| `npx oxlint` | no output, exit 0: clean (its warnings about hooks exported from component files were fixed by moving the hooks) | Tested locally |
| `npx vitest run` (the whole suite) | **129 files, 2,692 tests, all passing** (24.1 had 123 files / 2,575: the portal added 6 files and 117 tests) | Tested locally |
| `npm run i18n` (completeness, glossary, register, foreign words, hard-coded text, locale, and **Hunspell spelling** via `npm install --no-save hunspell-asm`) | **3,329 texts × 3 languages from 70 sources, 0 errors, 0 warnings; spelling HU 5,015 / EN 2,362 / NL 3,009 distinct words, 0 not found** (24.1: 3,010 texts) | Tested locally |
| `MSYS_NO_PATHCONV=1 VITE_API_URL=/ VITE_SITE_URL=https://example.test npm run build` | built; 103 pages written (the portal's three shells included) | Tested locally |
| `npm run check:seo` | `ok: 104 files, 82 indexable, 22 noindex; sitemap, hreflang reciprocity, canonicals, structured data and headers verified` (now also checks the portal: `noindex, nofollow`, no canonical, no alternates, no structured data, `_headers` and `_redirects` rules, not in the sitemap) | Tested locally |
| `npm audit` | `found 0 vulnerabilities` | Tested locally |

### The portal's own tests (117)

| File | Tests | What it proves |
| --- | --- | --- |
| `server/test/clientPortalAuth.test.ts` | 35 | invitation → one e-mail, the secret only after `#`, only a hash stored, in no log; the cookie's flags; no CORS; a link works once (three simultaneous clicks → one `200`); expiry (30 minutes, 72 hours); a newer link replaces the older; a made-up secret is a `404` and costs the guesser (`429`); the same `202` for known, invited, switched-off, unknown and differently-capitalised addresses; 5 links per address per hour; language of the message and of the link; registration closed by default / open / closed again; absolute (7 days) and idle (48 hours) deadlines; CSRF; cross-site `Origin` and `Sec-Fetch-Site`; sign-out; listing and revoking devices without any secret; another customer's device id finds nothing; disabling ends sessions and stops links; admin-side sign-out-everywhere; the change of address end to end (new address, masked notice to the old one, every session ended, the old address cannot sign in, a taken address says nothing); an administrator's cookie is nothing in the portal and the reverse; every portal address refuses a visitor without a session |
| `server/test/clientPortalIsolation.test.ts` | 15 | two customers each with a quote request and an accepted quote, a booking, a project with milestones, an update, a **private note on the project, on the quote request and on the booking**, and a published document: each sees only their own in every list; none of the other's marker words appears in **any** answer; B's project, request, booking and document answer **exactly like a thing that does not exist** (bodies compared); forged `X-Customer-Id`, `Authorization`, `?customerId=`, `?reference=` change nothing; a body naming an account is refused; guessing neighbouring references finds only one's own; an unpublished document is `404`; the download of an authorized document stops at the missing store (`503`, no key in the answer); a customer can change nothing about a project; unlinking takes a record away at once; a record cannot have two owners; the secure links minted from the portal are the ordinary ones and last two hours while the e-mailed ones are untouched; claiming links only what the server found for the verified address |
| `server/test/clientPortalLinking.test.ts` | 12 | nothing is linked by itself (before or after the account exists); an accepted quote makes no project; claiming is off by default (403, no candidates); when on, it links only records with the verified address in any letter case and records it; an invited (unverified) account has no candidates; a new address that was asked for but not proven is not used; a switched-off account has nothing; a claimed record cannot be claimed twice; the owner's link, refusals (404, 422, 409), editor refused (403), nothing dangling after a deletion |
| `server/test/clientPortalProjects.test.ts` | 20 | the code's lists equal the migration's CHECK lists (statuses, categories, events, documents, history); 11 statuses and the transition rule; a word for every status in every language; a project is the owner's act, from an accepted quote that is linked to **that** customer only; refusals; never a side effect; status moves and the dates they set; editor allowed, customer and strangers not; counts (active, waiting, completed); milestones (count only when they exist, no percentage, completed ones stay); overdue; the timeline carries only the owner's own words and the append-only history; what is e-mailed and what is not (created, important statuses, questions; not working phases, dates, milestones, notes); language per message and one message per event; a switched-off account's queued message is cancelled; documents cannot be published (409 and a CHECK) |
| `server/test/clientPortalAdmin.test.ts` | 18 | who may do what (admin, editor, stranger, CSRF); inviting (duplicates, bad address, no provider, no site address); list, search (a `%` is a character), status filter, paging; the two switches; the account's history (no address, no secret, no network address) and that it cannot be edited or erased; the deletion request (receipt to the customer, one notice to the owner, nothing deleted, withdrawn or cleared); **erasure** removes the account and everything on it and leaves only history lines that name no one; maintenance removes ended sessions and old links and **never an account** (with `RETENTION_DAYS` set); a failed message is retried with a fresh secret and the old one dies; no secret in any log line, stored error, delivery list or administration answer; "accepted", never "delivered" |
| `src/content/privacy.test.ts` (5 new) | 5 | the notice names the cookie exactly as the server sets it, says the website's own code still sets one cookie, says only what the code does (no password column, no address or name or network address column in the history, nothing publishable without a store, maintenance never deletes an account), gives no retention number, legal basis, processor name, guarantee or encryption claim in any language, never says acceptance is arrival, and is on the page |
| `src/portal/portal.test.ts` | 12 | the portal is one private page (`noindex, nofollow`, no canonical, no alternates, no structured data, not in any sitemap, `_headers` and `_redirects` rules); the head cannot hold anyone's data; **no event is ever sent from a portal address**; the browser code uses no storage and sends no customer id; every status, category and event has a word in three languages; no claim of delivery, price or time |

Two existing assertions were **updated, not weakened**, because the portal legitimately changes what they count: `reliability.test.ts` (the erasure's result has a new field, `customers: 0`) and `security.test.ts` (the limiter table has two more limiters: 12 → 14). `privacy.test.ts`'s check that the notice lists every place the code touches the browser's storage caught a **comment** in the portal's source that used the storage words; the comment was reworded. No test was removed or loosened.

### Mutation checks (do the new tests fail when the rule is broken?)

Each rule was broken in the source, the tests that must notice were run, and the file was restored (scratch copy, `cp` back):

| Broken rule | Result |
| --- | --- |
| a request is found by reference without the owner's id (`linking.ts`) | **4 isolation tests fail** |
| a document is authorized without the owner's id (`portal.ts`) | **1 test fails** |
| claiming works without the owner's switch (`linking.ts`) | **1 test fails** |
| claiming works for an unverified address (`linking.ts`) | **2 tests fail** |
| the "already used" pre-check removed | passes (35/35): the atomic `UPDATE … WHERE used_at IS NULL` covers it |
| **both** single-use guards removed | **2 tests fail** ("works once", "two clicks at the same moment"). Single use is enforced twice on purpose (an in-process request cannot interleave, so one guard alone is invisible to a single-process test; the atomic update is what holds across two processes, which was **not** tested for the portal, as it was for the booking) |

### The browser journey (`tools/e2e/portal-journey.cjs`)

Chrome (the installed one) through Playwright, against the **built** site served by the real backend, `RATE_LIMITS=false`, the `file` e-mail provider, addresses ending `.test`. **29 checks in parts A to I, passing at each of 1440, 768, 390 and 320 px** (and an earlier run of the same journey found and fixed: a heading level skipped on the Projects page; a detail page without a heading when it fails to load; a stretched column on the overview; the confirm page ignoring a link that only changes the fragment). It covers: the owner's invitation (three customers, three languages, the secret after `#`), the sign-in page, a neutral answer for an unknown address, the confirm page (the secret leaves the address bar; nothing is spent before the button), the cookie (`HttpOnly`, `SameSite=Strict`, not readable from the page, nothing in browser storage), a spent link in a clean browser, the overview, keyboard navigation (Tab and Enter, focus on the heading, `aria-current`, a visible focus indicator), projects, a project (milestones counted, timeline, no private note, no percentage), the empty states (quote requests, bookings, documents, an unknown address in the portal, an **empty account**), a second customer asking for the first one's project (the same answer as for a project that does not exist, compared in the browser), the profile, the notice to the old address, devices, the deletion request and its withdrawal, Hungarian and Dutch end to end (page, e-mail, overview, project, no English words), the headers and `robots` meta, no request to any other origin and none to a measurement address, sign-out ending the session on the server, the three administration screens, and **axe** (WCAG 2.2 AA + best practice) on every screen scanned: sign-in, confirm, a used link, overview, projects, a project, three empty states, an empty account, "not found", the account, Hungarian and Dutch pages, and the administration's customers, one customer and one project. **Zero findings.**

### Regression journeys (the existing quote and booking systems)

| Journey | Result |
| --- | --- |
| `quote-lifecycle-journey.cjs` (A to M: request, quotation, secure link, change request, new version, acceptance, e-mails, the administration on a phone and a tablet) | **33 steps passed, 0 failed** |
| `booking-journey.cjs` at 1440 px and at 390 px | **46 passed, 0 failed** at each. (Started with the owner's e-mail language at its default `hu`, one step fails at both widths because the journey expects the English subject of the owner's mail: the harness needs `NOTIFY_LANGUAGE=en`, as the earlier runs had. Not a regression: the mails are in the owner's language.) |
| The unit and server tests for quotes (`quotation*.test.ts`, `quoteIntegration.test.ts`) and bookings (`booking*.test.ts`) | pass inside the 2,692 |

## Not verified (said plainly)

- **Production in any form**: Render, Cloudflare, DNS (SPF, DKIM, DMARC: finding E-1 is still open), a real e-mail provider, a real mailbox, TLS, `TRUST_PROXY`, the persistent disk (D-1), the live domain's headers, the `__Host-` cookie over real HTTPS (the flag and the name are tested; a real TLS connection was not).
- **A real sign-in e-mail's delivery and appearance** in Gmail, Outlook or Apple Mail.
- **Other browsers** (Firefox, Safari), **real devices**, **a screen reader**, forced-colours mode, high zoom beyond what 320 px covers, and `prefers-reduced-motion` (the animations are written inside `prefers-reduced-motion: no-preference`; not observed in a browser).
- **The administration's accessibility audit tool** (`tools/audit/audit-admin.cjs`) was **not** extended or run; the three new administration screens were scanned with axe by the portal journey at four widths, which is narrower than that audit.
- **Two server processes** racing for one link (the booking has such a test; the portal relies on the same SQLite transaction semantics and was not tested this way).
- **Load and performance**: the portal's bundle size and speed were not measured separately (it is its own lazily loaded chunk).
- **Native-speaker proofreading** of the Hungarian and Dutch texts (the machine checks cannot find a correct word in the wrong place); **legal review** of the privacy notice's new section and of the account-deletion process; **security review** by a professional.
- **Real customer data**: none was used or available.
- **Setting `RETENTION_DAYS`** in production, and the owner's retention decisions for accounts.

## How to run it again

```bash
npx tsc -b && npx oxlint && npx vitest run
npm install --no-save hunspell-asm && npm run i18n
MSYS_NO_PATHCONV=1 VITE_API_URL=/ VITE_SITE_URL=https://example.test npm run build && npm run check:seo && npm audit
# a FRESH scratch backend serving dist/ (tools/e2e/README.md), with e-mail written to files, then
AUDIT_PLAYWRIGHT=/path/to/playwright AUDIT_AXE=/path/to/axe-core/axe.min.js \
  node tools/e2e/portal-journey.cjs --base=http://127.0.0.1:8801 --mail=<mail folder> --email=<admin> --password=<password> --width=1440
```
