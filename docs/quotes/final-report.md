# Quotation and order management — final implementation report (PROMPT 17)

Written from what was run, not from what was intended. Manual: [`README.md`](README.md). What was reused and why: [`integration-report.md`](integration-report.md). The checklist for going live: [`production-checklist.md`](production-checklist.md). Nothing was committed, deployed, sent to a real provider, or changed in DNS.

## Production readiness

> **Ready after minor configuration — and not production-verified.**
> The code and its behaviour are complete and were verified with a real browser, the real backend and database, and the file e-mail provider. What remains is configuration only the owner can do (provider key and verified domain, DNS, webhook, `PUBLIC_URL`, the terms text) **and the live test of [`live-verification.md`](live-verification.md), which was not performed**. Until it has been, the system must not be called production-ready: no real e-mail provider, no real DNS and no real mailbox has been involved.

## 1. Existing components reused (nothing duplicated)

The Node backend and SQLite migrations; `quote_requests` and its items and notes; the cart's server-side validation and price snapshots; the honeypot, duplicate and rate-limit protections; the admin authentication, roles, CSRF and audit log; the admin SPA (`/admin/quotes`, list, detail, status form, notes, export, confirm dialog); the **outbox** `email_deliveries` with its back-off, idempotency, retry, Resend/SMTP/file senders, verified Svix webhook and DNS checks (PROMPT 14); the FULL EXPERIENCE submission; the CONTROL ROOM AI approval → quote request hand-off (PROMPT 16). The contact form was **not** turned into a quote request: it still writes `inquiries`, and an administrator can turn a message into a request in one action.

## 2. New database structures (migration `0007`, 7 migrations in all)

`quotes`, `quote_lines`, `customer_action_tokens`, `quote_revision_requests`, `customer_updates`, `quote_events` (append-only), `reference_counters`; `quote_requests` and `email_deliveries` rebuilt (eleven-status workflow, request type, source, priority, budget, website, marketing consent, customer-visible status; seven new e-mail kinds); `quote_request_items.names_json`. Database-enforced: unique reference, one draft and one open version per request, a sent version cannot change (triggers), a discount needs a reason, the history cannot be edited or deleted, once-only e-mails. Verified on **real data**: a database at version 6 with old statuses, sources and items migrates correctly and passes `foreign_key_check`.

## 3. New API endpoints

Public: `GET /api/customer/quotations/:token`, `GET /api/customer/requests/:token`, `POST /api/customer/actions`; `POST /api/quote-requests` now also answers `statusToken` and `confirmationEmail`. Administration: `GET …/quote-requests/overview`, `POST …/quote-requests`, `POST …/inquiries/:id/quote-request`, `POST …/quote-requests/:id/quotes`, `POST …/resend-confirmation`, `GET|PUT|DELETE …/quotes/:id`, `POST …/quotes/:id/send|resend|withdraw`; `PATCH …/quote-requests/:id` gained `priority`, `show`, `internalNote`, `update`. Screens: `/admin/quotes/:id/create`, `/admin/quotes/:id/versions/:quoteId`; public pages `/{hu,en,nl}/quote/<secret>` and `/{hu,en,nl}/request/<secret>`.

## 4. Order and quotation workflow

Ten stored statuses plus *archived* (a flag), moves validated server-side (invalid → 409), `quote_sent` only by sending, `accepted`/`declined` from the customer (or by hand with a written reason), **accepting does not start the project**. Quotations: draft → sent → accepted | declined | superseded | withdrawn, versions with a reason, a sent version frozen. Tables and rules in the manual §4–5.

## 5. E-mail provider integration

No new provider integration: the existing transactional outbox is used, with eight templates in Hungarian, English and Dutch (HTML + plain text, table layout, no images, everything escaped). A message is queued in the same transaction as the state change it announces, retried with exponential back-off, marked failed when permanent, never marked delivered except by the verified webhook; a manual resend reuses the row (a new generation, a new idempotency key). The confirmation of a quote request is now on by default. **No real provider was contacted.**

## 6. DNS verification status

**None.** No DNS record was read or changed; SPF, DKIM, DMARC and the Cloudflare Email Routing set-up are on the owner's checklist (`production-checklist.md` §4), and Administration → Notifications → *Run checks* does the reading once they exist.

## 7. Actual e-mail delivery test results

* **Real provider: not tested.**
* The mailer is exercised three ways: a **recording mailer** (what was sent, to whom, subject, text, HTML; scripted failures), a **scripted provider over real HTTP** (the existing e-mail tests), and the **file provider in a real process** (the browser journey reads the `.eml` files).
* Verified: the request notification (with the dashboard link) and the customer confirmation (reference, what was asked, date, contact, next step, status link, no deadline, no price); the quotation e-mail (total, validity, secure link) and the revised one; acceptance and decline messages to both sides, **exactly once**, with the reason in the owner's; the change request to the owner; a status update with the status link; Hungarian/English/Dutch subjects and bodies; hostile text escaped and a subject kept on one line; no image in any message; no wording that claims a payment.
* Failure handling: a permanent provider failure leaves the request saved, the delivery `failed` with its reason, visible on the request; an administrator's resend reuses the same row and sends once; the visitor is told "saved, but no confirmation e-mail" when none was queued (`confirmationEmail: not_sent`).

## 8. Actual customer acceptance test results

* **Browser journey** (`tools/e2e/quote-journey.cjs`, real Chrome, the built site, the real backend, a throw-away database): **20 of 20 steps** — a visitor on a 390 px phone builds a request (an invalid website is refused), sees the reference/date/summary/status link, gets the confirmation; the administrator signs in, sees the overview, opens the request, sets a priority, writes a quotation (the total is the server's €3,100.50 = 1500.50 + 2 × 800, with no VAT figure because none was confirmed), sends it after a confirmation; the customer opens the secure link on a phone, reads the whole offer with the accept/decline bar on the screen, is refused without the confirmation box, accepts; the page becomes a record; both sides are e-mailed once and nothing says money was paid; the request is *Accepted* (not *In progress*), the next status offered is *In progress* (or *Cancelled*) and never *Quotation sent*.
* **Server tests** of the same flow and of decline, change request, expiry, revision, withdrawal and cancellation (35 tests).
* **Not done:** a real customer, a real mailbox, a real device.

## 9. Security test results

All in `server/test/quotationFlow.test.ts` unless noted; every unauthorised action failed safely.

| Scenario F item | Result |
|---|---|
| Expired tokens | view link after `CUSTOMER_LINK_DAYS` → `410 expired`; action token after 2 h → `410 expired`; an offer past its last day → accept `409 quote_expired` (decline and "ask" still work) |
| Revoked tokens | after a new version, a withdrawal or a cancellation the old link → `410 replaced`; opening the page again replaces the unused action tokens |
| Replayed acceptance | the same token twice → `409 already_used`; **two simultaneous clicks → exactly one `200`, one `409`**; one acceptance event, one e-mail per side |
| Invalid customer actions | no confirmation → `422` (token not spent); wrong-scope token (view token as action, status token as quote token) → `404`; a decided offer → `409`; malformed or unknown token → the same `404` words as a real-but-wrong one |
| Unauthorised admin access | no session → `401` on every route; no CSRF token → `403`; an editor cannot delete (`403`) |
| Public enumeration | no route accepts a reference (`404`, no data; also probed with `curl` on the running server); a made-up 43-character token and a reference give the same answer; **20 failed lookups from one address → `429`** (server test, limits switched on) |
| Malicious submissions | `javascript:`, `ftp:`, credentials-in-URL and `//host` websites refused; overlong fields refused; the hidden `website` trap still refuses; hostile quotation text and a CR/LF subject injection are escaped; client-sent prices, types, sources, statuses and totals are ignored |
| Duplicate requests | the same request again within ten minutes → the first reference, no second record, no second e-mail |
| Forged e-mail webhooks | `webhook.test.ts` (existing, unchanged): wrong, old or missing signature → refused; no secret → `404` (also probed on the running server) |
| History | the database refuses to update or delete a history line; no text a person wrote appears in `quote_events` or `audit_log` |
| Privacy | `erase <address>` and the administrator's delete remove requests, quotations, lines, links, questions, status entries and all related messages; history lines with only a reference and a status remain |

The real-process probe also found one real gap, now fixed: the page shell served for a customer's private address carried the build's `Referrer-Policy: strict-origin-when-cross-origin`; it is now `no-referrer` (Node server and `_headers`).

## 10. What was run

| Check | Result |
|---|---|
| `npx vitest run` | **93 files, 2012 tests passed** (1968 before this work; +44 quotation tests, plus updated existing ones) |
| `tsc -b`, `tsc -p tsconfig.server.json`, `oxlint` | no errors, no findings |
| `npm run build` + `npm run check:seo` | ok: 92 files, the two private pages prerendered as `noindex` shells, `_redirects` and `_headers` written |
| `tools/e2e/quote-journey.cjs` | 20 / 20 steps (above) |
| `tools/audit/audit-quotes.cjs`, English, nine viewports (320×640 … 1920×1080), light and dark, axe: the builder's last step (with the summary of everything about to be sent), the receipt, the status page, the quotation open and with its acceptance form's problem shown, accepted, an invalid link, an incomplete link | 135 states, **no findings** |
| `tools/audit/audit-quotes.cjs`, Hungarian and Dutch, four viewports (320, 390, 768, 1440), axe | 60 states, no findings |
| `tools/audit/audit-admin.cjs` on the quote screens (list, detail, start page, a sent version), 5 viewports × 2 themes × hu/en | 240 views, **no findings** |
| the editable draft editor, nine viewports × 2 themes × 2 states (before and after saving), axe | 36 states, no findings |

Bugs the checks found, all fixed with a test: sending a revised version failed (`500`) because the new version was marked sent before the old one was superseded (the database's one-open-version rule caught it); a `//host` website passed the URL check; a second quotation for a request that had one could be started without being a revision; a validation message for an invalid currency was overwritten; the private page's referrer policy (above). Findings of the *audits* themselves: none in product code.

## 11. Remaining blockers and owner items

1. **Live verification** (`live-verification.md`) — not performed; needs authorisation, a deployment, a provider key, DNS and test mailboxes.
2. Provider account, verified sending domain, SPF/DKIM/DMARC, Cloudflare Email Routing for the public address, the webhook and its secret, `PUBLIC_URL`.
3. The quotation **terms** and **payment terms** text, and whether/how tax is stated (no rate is assumed anywhere).
4. The privacy section on quotations and the retention period (`RETENTION_DAYS`); **no legal review was done and no compliance is claimed**.
5. A native read of the Hungarian and Dutch texts of the customer pages and e-mails.
6. The work of this prompt is **uncommitted** (the earlier prompts' work, Shop 3.0 and CONTROL ROOM AI included, is in the repository's history).

## 12. Decisions and deviations from the brief

* *Archived* is a flag (`archived_at`), shown as the eleventh state, so an archived request keeps its status and restoring it returns it as it was.
* The **confirmation of a quote request is on by default** (the brief requires it); an administrator can switch it off. The confirmation of a plain contact message stays off.
* The **budget** is the customer's own words (the site publishes no ranges to choose from, and none were invented).
* A quotation can be **sent only when e-mail and `PUBLIC_URL` are configured**: a quotation the customer cannot open is not a quotation.
* A customer cannot **select** optional lines; they are shown, priced, and outside the total (a change is a revision).
* **No payment, invoice, deposit or "paid" wording** anywhere; the acceptance e-mail says so explicitly.
* The AI hand-off now uses the common reference format (`A-…` codes are gone for new requests) and `source = control_room_ai`, `request_type = ai_project`.

## 13. Not verified

A real provider, DNS, a real mailbox, a real phone, Safari, Firefox, a screen reader, native Hungarian and Dutch proofreading, load beyond one process, a legal or tax review of anything.
