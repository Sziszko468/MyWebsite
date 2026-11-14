# Quotation and order management (PROMPT 17)

The business model is **quote-based**: a customer sends a request, the administrator writes a personal quotation and e-mails it, the customer accepts or declines it on a private page. **Nothing in this system takes, simulates, confirms or implies a payment.** Written from what was built and run; see [`final-report.md`](final-report.md) for results and [`integration-report.md`](integration-report.md) for what was reused.

> **PROMPT 21 (production integration pass)** audited this system end to end and completed it: [`PLAN_21.md`](PLAN_21.md) is the audit and the plan, [`WORKFLOW.md`](WORKFLOW.md) the workflow as it is, [`SECURITY.md`](SECURITY.md) the security review, [`EMAILS.md`](EMAILS.md) the messages and what is and is not verified about them, [`TEST_RESULTS.md`](TEST_RESULTS.md) what was run, [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) what the owner still has to do. What it added: the customer's receipt for a change request, the owner's alert when a message to a customer does not get through (with the history line the system had a label for but never wrote), a language filter, the preview in the quotation editor, an administrator's "end the customer's links", turning a contact message into a quote request from the screen (once), migration `0009`, and a layout fix on the customer's quotation page for 320 px.

## 1. The journey

```
visitor ─► shop builder / FULL EXPERIENCE / CONTROL ROOM AI ─► POST /api/quote-requests ─► quote_requests (CC-2026-000001)
                                                                     │ same transaction: history line, status page entry, private status link
                                                                     └► outbox: owner notification (dashboard link) + customer confirmation (status link)
administrator ─► /admin/quotes ─► request ─► "Create a quotation" ─► /admin/quotes/:id/versions/:quoteId (draft, editable)
                                                                     └► Send ─► quote sent (frozen) + e-mail with the secure link (same transaction)
customer ─► /{lang}/quote/<secret> ─► reads the whole offer ─► Accept | Decline | Ask for a change (each needs an explicit confirmation)
                                                                     └► both sides e-mailed once; request = Accepted (NOT In progress)
administrator ─► sees the history, moves it to In progress / Completed when the work starts / ends
```

Every route into the system ends in the same table, with the same reference, history, status page and e-mails. `request_type` and `source` say what and where from.

## 2. Data (migration `0007_quotation_management.sql`)

| Table | What it holds |
|---|---|
| `quote_requests` (rebuilt) | the request: `reference` (UNIQUE), `request_type`, `source`, contact, `company`, `website`, `budget_range` (the customer's words), `status`, `customer_status` (what they were shown), `priority`, `consent_at`, `marketing_consent_at` (separate), `archived_at` |
| `quote_request_items` (+ `names_json`) | the cart's lines; the names of what was chosen are saved in every language |
| `reference_counters` | one counter per scope (a year), incremented inside the transaction that stores the request |
| `quotes` | one row per **version** of a quotation: content, pricing mode, currency, tax treatment, totals (whole minor units), validity, `revision_reason`, `supersedes_id`, `content_hash` (set when sent), timestamps |
| `quote_lines` | `item` / `optional` / `discount` lines (a discount needs a reason: a `CHECK`) |
| `customer_action_tokens` | `token_hash` (SHA-256 only), one quote or request, one action, `expires_at`, `used_at`, `revoked_at` |
| `quote_revision_requests` | what a customer wrote when asking for clarification or a change |
| `customer_updates` | what the administrator chose to show on the customer's status page |
| `quote_events` | the status history and quotation events: **append-only** (triggers refuse `UPDATE` and `DELETE`), no foreign key, no text a person wrote |
| `email_deliveries` (rebuilt twice: 0007, then 0009) | the existing outbox and delivery log, with seven new kinds and the `quote` / `quote_revision` related types in 0007, and `revision_received`, `delivery_failed_admin` and the related type `email_delivery` in 0009; no second table |

Database rules worth knowing: at most one **draft** and at most one **sent** version per request (partial unique indexes); a quotation that was sent cannot be edited (triggers on `quotes` and `quote_lines`); exactly-once e-mails are partial unique indexes (the request notification and confirmation, the acceptance and decline messages to each side, one revision notice per revision request).

## 3. Public reference

`CC-2026-000001` by default (`QUOTE_REFERENCE_FORMAT`, e.g. `WEB-{YY}-{NNNNN}`); the number restarts each year when the format has `{YYYY}` or `{YY}`. Sequential and unique by construction (counter in the insert's transaction, `UNIQUE(reference)` behind it), **never a secret**: no public address accepts a reference, a wrong one is answered exactly like a right one. A quotation's reference is the request's plus the version: `CC-2026-000001-Q2`. Requests made before the migration keep their old random code.

## 4. Statuses

Ten stored statuses and *archived* (a flag, so an archived request keeps its status): `new → under_review → waiting_customer → quote_preparation → quote_sent → accepted → in_progress → completed`, with `declined` and `cancelled`.

| From | May move to (by hand) |
|---|---|
| new | under_review, waiting_customer, quote_preparation, cancelled |
| under_review / waiting_customer / quote_preparation | the other two of those, quote_preparation / under_review, cancelled |
| quote_sent | under_review, quote_preparation, waiting_customer, accepted\*, declined\*, cancelled |
| accepted | in_progress, cancelled |
| declined | under_review, cancelled |
| in_progress | completed, cancelled |
| completed | in_progress |
| cancelled | under_review |

`quote_sent` is reached **only by sending a quotation**; `accepted` / `declined` come from the customer on the quotation page, and an administrator can record either only with an internal note saying it happened elsewhere (\*). Accepting does **not** start the project. Invalid moves answer 409. Every change writes a `quote_events` line and an audit-log line.

What the **customer** sees is separate: `customer_status` moves only when the administrator ticks "show this" (or e-mails it), or when the customer themself acted. An internal move is not announced.

## 5. The quotation

* Fields: title, introduction, project understanding, scope, deliverables, exclusions, payment terms, terms, notes, timeline, valid-until, language, pricing mode, currency, tax, lines.
* **Pricing modes**: `itemized` (lines add up), `fixed` (one amount), `custom` (the price in words, no figure). **Optional** lines are shown but not in the total; a **discount** needs a justification, shown with it.
* **Money**: whole minor units (cents for EUR, forints for HUF), parsed from decimal text digit by digit, summed as integers, tax rounded half-up in integer arithmetic. The server recomputes every total; whatever totals a browser sends are ignored. `1500.5`, `1 500,50`, `1,500.50` are the same amount; `0.07` is 7 cents, not `7.000000000000001`.
* **Tax**: the quotation states a *treatment* (excluded / included / exempt / not stated). A tax figure is calculated **only** when the administrator enters a rate **and** confirms it was verified; otherwise the page says "Prices exclude VAT" and shows no number. No rate is ever defaulted.
* **Prefill**: lines are suggested only for parts the catalogue actually publishes a price for; nothing else is invented. The administrator sees and edits them.
* **Versions**: a sent version is frozen. To change it, "New version" (needs a reason) copies it into a new draft; sending the new one marks the old `superseded`, **ends its links**, and e-mails the customer a "revised quotation". A version can be withdrawn (links end, request back to quotation preparation); cancelling the request withdraws an open one. An accepted version can never be replaced.
* **Sending** is refused (409 `email_unavailable`) unless e-mail and `PUBLIC_URL` are set, and (422) until title, scope, terms, a future valid-until, a price and a tax statement are present; the editor shows this as a checklist.

## 6. Customer links

A token is 256 random bits (base64url, 43 characters); only its SHA-256 is stored.

| Action | Used for | Lifetime | Use |
|---|---|---|---|
| `view_request` | the status page `/{lang}/request/<secret>` | `CUSTOMER_LINK_DAYS` (90) | reusable |
| `view_quote` | the quotation page `/{lang}/quote/<secret>` | `CUSTOMER_LINK_DAYS` | reusable; ends when the version is replaced, withdrawn, or the request cancelled |
| `accept_quote`, `decline_quote`, `request_revision` | the three buttons | 2 hours, from the page being opened | **once**; opening the page again replaces the unused ones |

The link in an e-mail is a view token **minted when the message is written** (so no raw token is stored anywhere); a message written again for a retry carries a new one, and the earlier ones keep working (that message may be the one that arrived).

Answers: an unknown, malformed or wrong-scope token → `404` (the same words for all); a real token that no longer works → `410` with a reason (`expired` or `replaced`); a spent action token → `409 already_used`; a decided offer → `409 already_decided`; an offer past its last day → accept `409 quote_expired` (decline and "ask" still work). Failed lookups are counted per address (20 in 15 minutes, then `429`). Accepting needs `confirm: true`; the token is spent in the same transaction as the state change, so two simultaneous clicks cannot both win.

## 7. Interfaces

**Public** (`area: api`, no session, rate-limited, no cookies): `POST /api/quote-requests` (answers `reference`, `createdAt`, `statusToken`, `confirmationEmail: queued|not_sent`); `GET /api/customer/quotations/:token`; `GET /api/customer/requests/:token`; `POST /api/customer/actions`.

**Administration** (session + CSRF + permission checked in the business function): `GET /api/admin/quote-requests` (filters `status`, `type`, `priority`, `source`, `language`, `from`, `to`, `q`, `archived`; sorts incl. `priority`, `type`, `reference`), `…/overview`, `…/:id`, `PATCH …/:id` (`status`, `show`, `notify`, `note`, `internalNote`, `priority`, `archived`, `addNote`, `inquiryId`, `update`), `POST /api/admin/quote-requests` (by hand), `POST /api/admin/inquiries/:id/quote-request`, `POST …/:id/resend-confirmation`, `POST …/:id/revoke-links` (ends every link the customer holds; idempotent), `POST …/:id/quotes` (start, or `{from, reason}` for the next version), `GET|PUT|DELETE /api/admin/quotes/:id`, `POST …/send`, `…/resend`, `…/withdraw`, `…/export`, `…/export.json`, `…/export.csv`. Screens: `/admin/quotes`, `/admin/quotes/:id`, `/admin/quotes/:id/create`, `/admin/quotes/:id/versions/:quoteId`.

## 8. E-mails (HU / EN / NL, HTML + plain text, table layout, no images)

`quote_received` (owner, with a dashboard link), `quote_confirmation` (customer: thanks, reference, what they asked, date, contact details, next step, status link, no deadline unless the administrator wrote one), `quote_sent`, `quote_revised`, `quote_accepted` (+ `_admin`), `quote_declined` (+ `_admin`), `revision_requested_admin` and, to the customer at the same moment, `revision_received` (a receipt: PROMPT 21), `quote_status` (the administrator's own status update), and `delivery_failed_admin` (the owner's alert when a message to a customer ended failed, bounced or complained: PROMPT 21; see [`EMAILS.md`](EMAILS.md)). The language is the customer's (the quotation's for its mails; the owner's `NOTIFY_LANGUAGE` for the owner's). Every value is escaped; a subject is one line. **No message says a payment was received or is due through the site.**

Reliability is the existing outbox (docs/email/README.md): a row is written in the **same transaction** as the thing it announces; sent in the background; transient failures retried after 1, 5, 30, 120, 720 minutes; permanent ones marked `failed`; the idempotency key is `delivery-generation`; a manual resend uses the same row with a new generation (no duplicate rows). "Sent" means the provider took it; `delivered`, `bounced`, `complained` come only from the **verified** provider webhook. A request is never lost because mail failed: the screen says "saved, but no confirmation e-mail" when none was queued, and the administrator sees and retries failed messages on the request. The confirmation of a quote request is **on by default** (an administrator can switch it off in Notifications).

## 9. Security and privacy, in one place

Server-side authorisation (`requests:read|write|delete`) in every business function; CSRF on every state change; same-origin checks; hashed, scoped, expiring, revocable, single-use tokens; failed-token counting; no public route takes a reference, an address or an identifier; no internal identifier, hash, note or address in any customer-facing answer; the private pages are served with `Cache-Control: no-store`, `X-Robots-Tag: noindex`, `Referrer-Policy: no-referrer` (Node server and the build's `_headers`), and the analytics tracker replaces the secret in the path; text a person typed is never markup; the history cannot be edited; audit lines carry no secret or visitor text. **Privacy**: the optional marketing box is separate and this system sends no marketing; the privacy page has a section on quotations; retention is the owner's `RETENTION_DAYS` (completed, cancelled, declined, archived); the operator's `erase` command and the administrator's delete remove a person's requests, quotations, links, questions, status entries and every message about them, leaving history lines with only a reference and a status. No legal review was done and none is claimed.

## 10. Configuration

`QUOTE_REFERENCE_FORMAT`, `CUSTOMER_LINK_DAYS` (new); `PUBLIC_URL` (needed for links), `EMAIL_*`, `NOTIFY_TO`, `NOTIFY_LANGUAGE`, `EMAIL_WEBHOOK_SECRET`, `RETENTION_DAYS` (existing). See [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md).

## 11. Tests

`server/test/quotation.test.ts` (money, statuses, references, the migration on real data) and `server/test/quotationFlow.test.ts` (35 end-to-end tests of the scenarios A–F); the website's contract tests now read the receipt from the real server; `server/test/quoteIntegration.test.ts` (PROMPT 21: the receipt, the delivery alert, the language filter, ending links, a message becoming a request, isolation, no secret in logs); `tools/e2e/quote-lifecycle-journey.cjs` (PROMPT 21: the whole life A to M in a real browser, 32 steps, run at 320, 390, 768 and 1440 px); `tools/e2e/quote-journey.cjs` (a real browser, 20 steps), `tools/audit/audit-quotes.cjs` (customer pages, nine sizes), `tools/audit/audit-admin.cjs` (now includes the quotation screens).
