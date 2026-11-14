# PROMPT 21 — test results and verdict

Run on 2026-11-14, Windows 11, Node 22, system Google Chrome driven by Playwright. **Chrome with emulated viewports and touch on one PC: not physical devices, not Safari or Firefox, not a screen reader.** Everything ran against a throw-away database on `127.0.0.1` with the `file` e-mail provider (messages written to a folder). No real e-mail was sent, no real address was used, no production data was read, nothing was deployed.

## Verdict

**The quotation system is ready after owner configuration. Its customer e-mail is NOT production-ready**, and cannot be declared so from here.

* *Code:* every item of the brief is implemented, tested and exercised in a browser; no critical defect is open. Eight gaps (G1 to G8) and six smaller defects (D1 to D6) found by the audit, the journeys and the audits are fixed (below).
* *Owner configuration still needed (none of it can be done from the repository):* the sending domain's **SPF, DKIM, return path and DMARC** (a read-only look-up today still shows none of the provider's records: finding E-1 of the platform audit), the provider account and key, the webhook and its secret, the production environment variables (`PUBLIC_URL`, `NOTIFY_TO`, `TRUST_PROXY`, …), and the **live delivery test** in [`EMAILS.md`](EMAILS.md) §7. Until that test has passed, nobody may claim that customer e-mail works. Use [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md).
* *Deployment:* the live site is **older than** this work (it lacks PROMPT 18 and everything after it, the Shop 4.0 work included), so putting this live means putting all of it live. Nothing was deployed, pushed or merged; this work is on `feature/quote-integration`, uncommitted.

## Repository and branches (checked before anything was changed)

| | |
| --- | --- |
| Work branch | `feature/quote-integration`, cut from `feature/shop-4` at `2b86618` (the Shop 4.0 work, committed and pushed) |
| Production deployment branch | `origin/deployment/render-cloudflare` at `a75fa42` (found by name and by content: it is what Render builds); **not touched** |
| `main` | local `77c0df4`, `origin/main` `254a202` (diverged from each other); **not touched** |
| Django / Python | none: the platform is React, TypeScript, Vite, Node and SQLite, and stayed so |
| Second quotation system, table, CRM or e-mail provider | none was created |

## The gate

| Check | Result |
| --- | --- |
| `tsc -b` (typecheck) | clean |
| `oxlint` | 0 findings |
| `i18n:check`, `i18n:validate` | ok: 2 688 texts × 3 languages; Hunspell spelling, Hungarian, English and Dutch: 0 unknown words |
| `vitest run` | **105 files, 2 225 tests, all pass** (103 files / 2 200 before this work; run on the final code) |
| `npm run build`, `check:seo` | ok (91 pages written; 76 indexable, 16 noindex) |
| `npm audit` | 0 vulnerabilities |

## Tests added, and tests changed (and why)

| File | What it does |
| --- | --- |
| `server/test/quoteIntegration.test.ts` (**new, 18 tests**) | the customer's receipt for a change request in Hungarian, English and Dutch (escaped, nothing promised, once per request, a replayed click sends nothing); the delivery alert (refused for good, resent, bounced and complained by a verified webhook, never for the owner's own mail, no loop, taken away with the request on deletion and erasure); the language filter (also in the CSV, with a SQL-looking value); ending the customer's links (all kinds, nothing else changed, history and audit, idempotent, who may); a message becoming a quote request once (prefill, link, nobody e-mailed, 409 and then allowed after a cancel, authorisation); one customer's secret opening one customer's page (cross-scope, in the same words); no secret in the database, history, audit log, outbox or logs; no price, total, status or owner taken from a customer's action |
| `server/test/quotation.test.ts` | **+1** test: migration 0009 on rows with provider events (rows, events and indexes kept; the two new kinds; once-only rules; closed vocabularies). *Changed:* the 0007 test now expects `[7, 8, 9]` |
| `src/admin/lib/lib.test.ts` | **+1** test: the language filter through the address and the query. *Changed:* the default list state now has `language` |
| `src/admin/pages/QuotationPreview.test.ts` (**new, 5 tests**) | the preview lays out title, recipient, last day, text, lines, discount with its reason, tax and total as the server built them; says its language (`lang`); shows typed text as text; fixed and custom prices without inventing a figure; no VAT figure when none was confirmed; the same sections in Hungarian |
| `server/test/quotationFlow.test.ts` | *Changed*, Scenario D ("the e-mail provider fails"): it expected no message to leave and a history of `[request_created, email_retried, email_retried]`. The new, intended behaviour is that the customer's confirmation failing alerts the owner and the failures are in the history, so it now expects exactly that **one** alert to the owner, nothing to the customer, and `[request_created, email_failed, email_failed, email_retried, email_retried]` with their actors and fixed phrases. The test's point (the request is kept, an administrator can send again, never two confirmations) is unchanged and still asserted |
| `server/test/dashboard.test.ts`, `server/test/process.test.ts` | *Changed:* they assert which migrations a run applies; migration 0009 is now one of them (`…, 8, 9`, schema version 9) |

No test was loosened, skipped or deleted. The five edits above are the consequences of adding a migration and of the new, intended behaviour, each checked against what the product now does.

## Browser: the whole life of a quotation (`tools/e2e/quote-lifecycle-journey.cjs`, steps A to M)

A fresh server per run, 32 steps each: **A** a customer's package request in the shop · **B** a FULL EXPERIENCE request · **C** the administrator reviews, filters by language · **D** writes the quotation in Hungarian, previews it, sends it · **E** the customer opens the link · **F** asks for a change, gets a receipt · **G** the administrator sends a new version · **H** the old link is dead, the customer accepts the final version · **I** both sides told once, in the right language · **J** the administrator sees Accepted, the history, the e-mail states · **K** the administrator ends the customer's links · **L** a contact message becomes a quote request · **M** the new administration screens on a phone and a tablet.

| Customer's screen | Owner's language | Result on the final build |
| --- | --- | --- |
| 320 × 700 | Hungarian | **32 / 32** |
| 390 × 844 | Hungarian | **32 / 32** |
| 768 × 1000 | English | **32 / 32** |
| 1440 × 1000 | Dutch | **32 / 32** |
| 360 and 375 (customer steps A, D–H only, with the broken-word guard) | Hungarian | 17 / 17 each |

Earlier runs on the way (30 / 32, then 32 / 32 at each width) found the problems listed under D below; the table is the last run of the finished code, each on a fresh server.

What this proves, in the brief's words: the request keeps its service, package, add-ons, description, budget, timeline, language, contact and the two separate consents; the administrator reviews, writes, previews and sends; the customer opens, reviews, asks for a change, receives a receipt, and accepts the final version only after an explicit confirmation; the old version's link then says it no longer works; both sides are e-mailed **once**, in the right language (Hungarian customer, Hungarian / English / Dutch owner); the history names who did each step; nothing is shown as "delivered" without a provider; ending the customer's links works, is recorded, and is harmless the second time; a contact message becomes one quote request and nobody is e-mailed in the customer's name.

## Browser and tool regressions (the earlier journeys, re-run on this build)

| Run | Result |
| --- | --- |
| `journeys.cjs` A to E (recruiter, client, administrator, phone, Lab) | 72 / 72 |
| `cms-journey.cjs` | 22 / 22 |
| `security-probe.mjs` (every administration route without a session; the new route is in its list) | 94 / 94 |
| `quote-journey.cjs` (PROMPT 17) | 20 / 20 |
| `shop-journey.cjs` | 41 / 41 |
| `shop4-journey.cjs` A to E | 31 / 31 |
| `quote-languages-journey.cjs` | 55 / 55 with `RATE_LIMITS=false`. With the real limits it fails one check: it submits six requests from one address and the form's limit is five per 15 minutes, so the sixth is (correctly) limited. A fact about the script, not a defect |
| `audit-quotes.cjs` (the customer's pages: layout and axe WCAG 2.2 AA, 4 sizes — 320, 390, 768, 1440 — × 3 languages × 2 themes: **172 states**, including the status page, the quotation open and accepted, and the pages for a link that is not valid) | **no findings** |
| `audit-admin.cjs` on the screens this work touches (the quote list, a request, a version with its preview, FULL EXPERIENCE, the message page, Notifications), with the lifecycle's data, 4 sizes × 2 themes × 2 languages: layout and axe | **256 views, 0 findings** (after the fixes D5 and D6). A wider run before them also reported `landmark-unique` (moderate) on `/admin/ai`, a screen this work did not touch; it is left as it was |

## What the audit found, and what was done

| # | Finding | Done |
| --- | --- | --- |
| G1 | the customer was not told that their change request arrived | `revision_received` e-mail, three languages, once per request |
| G2 | no alert when a message to a customer does not get through; the history type `email_failed` existed but was never written | `delivery_failed_admin`, history line, warning on the request, once per message; new in migration 0009 |
| G3 | no language filter | server, CSV, administration |
| G4 | no preview of the quotation | the preview in the editor (its heading text already existed unused) |
| G5 | no way to end a customer's links | the "End the customer's links" action |
| G6 | a contact message could not become a request from the screen, and could become two through the API | the button, prefilled; 409 for a second |
| G7 | no test for isolation, logs, the new e-mails or the new routes | `quoteIntegration.test.ts` |
| G8 | no browser journey for the whole life; the quote journeys are not in CI | `quote-lifecycle-journey.cjs`; a manual workflow (below) |
| D1 | **a defect the journey found:** at 320 px the Hungarian "ELFOGADOM AZ AJÁNLATOT" / "ELUTASÍTOM" buttons on the customer's quotation page broke in the middle of a word | the bar stacks the two buttons where they do not fit side by side; the journey has a guard for broken words |
| D2 | `tools/audit/audit-quotes.cjs` matched a quotation e-mail by a subject that was reworded in PROMPT 18, so it could not prepare its data | it now matches by recipient and link |
| D5 | **found by the administration audit at 320 px:** on a request, the long label "Agreed to hear about other things" left the value column of the details 14 px wide, so an e-mail address broke one letter per line | the label column may take at most 45 % of the width and wraps |
| D6 | three links on a line of their own (the linked message, the other versions, the requests linked to a message) were 17 to 21 px high, under the 24 px target (WCAG 2.5.8); they existed since PROMPT 17 and appeared once the data had them | they are 24 px high now |
| D4 | the Notifications page named only the seven original message kinds, so the quotation's nine (and the two new ones) showed as raw codes such as `quote_sent` | all sixteen have a name in Hungarian and English |
| D3 | `docs/quotes/production-checklist.md` was named differently from the brief's `PRODUCTION_CHECKLIST.md` (and the two names are one file on Windows) | renamed with `git mv`, links fixed |

Reading, not changing: the history shows the administrator's e-mail address (not the word "Administrator"); a new version starts without a last day on purpose; the "new request by hand" API has no screen (its words exist in the administration's text files); the administration is in Hungarian and English by design, the customer's side in three languages.

## CI

`.github/workflows/ci.yml` (push to `main` and every pull request: typecheck, lint, `npm test`, the language checks, build, `check:seo`) already runs everything above that is not a browser, including the new tests. **The browser journeys are not added to it**, on purpose: they drive a real Chrome through copy-sensitive screens, so a reworded button would fail pull requests for reasons that are not defects, and they take minutes. Instead `.github/workflows/e2e-quote.yml` runs the lifecycle journey **on demand** (`workflow_dispatch`, with the customer's screen width as an input), on a throw-away backend on the runner with the `file` e-mail provider, with read-only permissions, uploading screenshots and the server log. It deploys nothing and touches no deployment or Render setting. **It was written and not run**: there is no GitHub Actions run behind it, so expect to fix a path or a wait the first time.

## What was not verified

* **Any real e-mail**: no provider account or dashboard, no real send, bounce or complaint, no inbox, no SPF/DKIM/DMARC pass in a received message. The webhook was exercised with signed events built by a test, not by the provider.
* **The production environment**: Render, Cloudflare, their access logs, `TRUST_PROXY` in production, the deployed branch.
* **Native reading** of the Hungarian and Dutch texts, including the two new e-mails (they are complete and spell-checked).
* **Physical devices, Safari, Firefox, a screen reader.** The layout and axe audits are Chrome with emulation.
* **Load and concurrency beyond the tests**: one process, one database; two simultaneous acceptances were tested, a crowd was not.
* **Restoring a backup** after migration 0009 (a backup should be taken first; the runner refuses an edited migration and a database newer than the code).
