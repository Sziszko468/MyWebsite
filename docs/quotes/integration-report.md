# Quotation and order management — technical integration report (PROMPT 17)

Written **before** the implementation, from reading the code. It says what already exists, what the brief asks for beyond it, and the decisions that follow. The results of what was built, with what was run, are in [`final-report.md`](final-report.md).

## 1. What already exists and is reused (not rebuilt)

| Need in the brief | Already in the repository | Where |
|---|---|---|
| Backend, database | Node 22 server, SQLite (`node:sqlite`, one writer), numbered migrations with checksums, in-memory DB for tests | `server/src/db/`, `server/src/app.ts` |
| Quote request store | `quote_requests` (+ `quote_request_items`, `quote_request_item_extras`, `quote_request_notes`), a catalogue request, a FULL EXPERIENCE request (`brief_json`), the AI assistant's request (`source`) | migrations 0001, 0005, 0006; `modules/quotes/`, `modules/shop/fullExperience.ts`, `modules/ai/quote.ts` |
| Server-side validation of the cart against the catalogue, price snapshots, "a price is never read from the request" | `resolveItems`, `snapshot`, `totalsOf` | `modules/quotes/service.ts`, `modules/shop/pricing.ts` |
| Spam and duplicate protection | honeypot field, link counting, keyed content hash inside a 10-minute window, per-route rate limiters | `modules/contact/service.ts`, `http/rateLimit.ts` |
| Admin authentication and authorisation | admin/editor roles, permissions checked in the business functions, session cookie (`SameSite=Strict`), CSRF token, same-origin check | `modules/auth/`, `app.ts` |
| Admin dashboard | React SPA at `/admin`: `/admin/quotes` list, `/admin/quotes/:id` detail, status form, internal notes, activity timeline, CSV/JSON export, confirm dialog, toasts, hu/en | `src/admin/` |
| E-mail | transactional outbox (`email_deliveries`): queued first, sent in the background, exponential back-off (1, 5, 30, 120, 720 min), permanent vs transient failures, idempotency key per attempt, manual retry with a new generation, Resend + SMTP + file senders, verified Svix webhook → `delivered / bounced / complained`, event de-duplication, DNS/Cloudflare checks | `modules/notifications/`, migration 0003, `docs/email/README.md` |
| Cloudflare Email Routing (inbound only) | documented and checkable; **not** used for sending | `docs/email/README.md`, `notifications/checks.ts` |
| Audit trail | `audit_log` (action, actor, entity, short detail; never visitor text) | `modules/system/audit.ts` |
| Settings that an administrator flips | `settings` table (`notify.quote`, `confirm.quote`, response note per language) | `modules/system/settings.ts` |
| CONTROL ROOM AI → quote | approval bound to the plan's hash, no-argument submit tool, request stored through `insertQuote` | `modules/ai/quote.ts` |

Tested today: 1968 tests (91 files) pass; the quote path, the outbox, the webhook and the AI hand-off each have server tests.

## 2. What the brief asks for that does not exist yet

1. **Public reference** `CC-2026-000001` (configurable, sequential per year, collision-proof). Today: random `Q-`, `F-`, `A-` codes.
2. **The eleven statuses** and validated transitions. Today: `new, in_review, quoted, accepted, declined, closed`.
3. **Request type, priority, budget range, website, marketing consent** as fields. Today: only `kind` (catalogue / full_experience) and a free `source`.
4. **A formal quotation**: an entity with versions, price lines, tax treatment, validity, terms; a builder in the admin; preview; send.
5. **Secure customer pages**: `/quote/:token` (view, accept, decline, ask for a revision) and `/request/:token` (status). Hashed, scoped, expiring, revocable, single-use tokens.
6. **Status history / audit events that cannot be edited**.
7. **E-mails**: quotation sent, revised, accepted (customer + admin), declined (customer + admin), revision requested; the admin notification with a dashboard link; HU/EN/NL; plus the existing confirmation made reliable.
8. **Customer-visible updates** the administrator controls.
9. **Admin**: overview numbers, filters by type/priority/date, create/edit/send quotations, resend, priority, create a request from an inquiry or by hand.
10. **Submission outcome states** in the shop UI (saved / failed / saved but no e-mail) and the new optional fields in the builder.
11. **Production documents**: deployment checklist, rollback plan, live verification report.

## 3. Decisions

* **One request store.** Shop catalogue, FULL EXPERIENCE, AI, a contact-form lead and a hand-entered request are all rows of `quote_requests`, told apart by `request_type` and `source`. No second table, no AI-only table.
* **Contact form.** The contact form keeps writing `inquiries` (a message is not a quote request). An administrator turns a message into a quote request with one action (`source = contact_form`, linked through the existing `inquiry_id`). A request typed in by hand has `source = other`.
* **References.** `reference_counters(scope, value)` incremented inside the insert transaction, formatted by `QUOTE_REFERENCE_FORMAT` (default `CC-{YYYY}-{NNNNNN}`); `UNIQUE(reference)` stays as the last line of defence. A reference never authorises anything: no public endpoint accepts one.
* **Status rebuild.** SQLite cannot change a `CHECK`, so `quote_requests` is rebuilt (the technique of migration 0002): `in_review → under_review`, `quoted → quote_sent`, `closed → completed`. *Archived* stays `archived_at` (as for inquiries: an archived request keeps its status, and restore returns it), shown as the eleventh state in the interface.
* **Request type** is derived on the server (never trusted from the client): a cart of packages → `package_quote`; a custom line → `custom_service` / `custom_website` / `custom_application`; FULL EXPERIENCE; the assistant → `ai_project`; the others are administrator-chosen.
* **Money** is stored as integer minor units with the currency's exponent (EUR 2, HUF 0), parsed from decimal text without floating point. Totals are always recomputed on the server. **Tax**: the quote records a tax *treatment*; an amount of tax is calculated only when the administrator enters a rate *and* confirms it was verified; otherwise the page states the treatment and shows no tax figure.
* **Quotation versions.** One row per version (`quotes.version`), a sent version is immutable (the database refuses edits to a non-draft); a revision is a new draft that supersedes the old one when sent, revoking the old tokens. The reason for the revision is stored.
* **Tokens.** `customer_action_tokens` stores only the SHA-256 of a 256-bit random token, with its quote, one action, expiry, `used_at`, `revoked_at`. The link in an e-mail is a *view* token, minted when the e-mail is rendered (so the raw token never has to be stored); opening the page mints short-lived single-use *accept / decline / revise* tokens. Unknown and wrong tokens give the same answer.
* **Outbox reuse.** New e-mail kinds join `email_deliveries` (the table is rebuilt to widen its `CHECK`s); exactly-once kinds get a partial unique index as the existing confirmations do; no second delivery table. The confirmation to the customer becomes **on by default** for quote requests (the brief requires it; an administrator can still switch it off).
* **Audit.** A new append-only `quote_events` table (database triggers refuse `UPDATE` and `DELETE`) carries status history and quote events with no visitor text; `audit_log` keeps recording administrator actions.
* **Public pages** are SPA pages under `/:lang/quote/:token` and `/:lang/request/:token`; the server answers those paths with a noindex shell, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`; the analytics tracker replaces the token with a placeholder.
* **No payments.** Nothing in this phase takes, simulates or confirms a payment, and no e-mail implies one.

## 4. Things I will not claim

Everything that needs the owner's accounts — a real transactional provider key, DNS records, Cloudflare Email Routing, a production host — cannot be done from here. The live verification of the brief (§21) is prepared as a script and a checklist but **not performed**; the final report says so.
