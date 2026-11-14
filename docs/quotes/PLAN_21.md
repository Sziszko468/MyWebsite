# PROMPT 21 — audit result and plan (written before any code was changed)

Branch `feature/quote-integration`, cut from `feature/shop-4` (2b86618). Production deployment branch: `origin/deployment/render-cloudflare` (a75fa42), not touched. `main` not touched. Nothing is pushed, merged or deployed.

The quotation system of PROMPT 17 is **kept**: one store (`quote_requests` + `quotes`), one outbox (`email_deliveries`), one history (`quote_events`). This is an audit and completion, not a rebuild.

## What the audit found to be in place (read in the code, with the tests that cover it)

| Area | State |
| --- | --- |
| One store for every entry point (shop, FULL EXPERIENCE, CONTROL ROOM AI after approval, a message turned into a request by an administrator) | `quotes/create.ts` is the only writer; same reference, history line, status page, e-mails |
| Server-side validation, no trust in client prices/totals/complexity | `quotes/service.ts`, `shop/fullExperience.ts`; the server works out the size guide; tests in `public.test.ts`, `shop.test.ts`, `contract.test.ts` |
| Repeated submission | content hash → same reference, no second request, no second e-mail |
| Status workflow | ten stored statuses + archived flag, transition table in `status.ts`, `quote_sent` only by sending |
| History | append-only (triggers), actor type + admin id + timestamp, nothing a person typed |
| Versions and money | sent versions frozen by DB triggers, integer minor units, tax only from a confirmed rate |
| Customer links | SHA-256 only in the database, scoped by action, single-use 2 h action tokens, 404 for unknown/wrong scope, 410 revoked/expired, 409 spent, 429 after 20 misses/15 min; `no-store`, `noindex`, `no-referrer`; the request log writes the route pattern, never the address |
| Outbox | same transaction as the state change, retry with growing pauses, idempotency key, "delivered" only from a verified webhook |
| Retention and erasure | `RETENTION_DAYS`, per-address erase, spent links purged after 30 days |

## Gaps (each one is a defect against the brief, found by reading, not assumed)

| # | Gap | Evidence |
| --- | --- | --- |
| G1 | The customer is **not told that their modification request arrived**. Only the owner gets `revision_requested_admin`. | no kind, no template, no queue call in `customer.ts` |
| G2 | **No important-delivery-failure alert.** A quotation e-mail that fails for good, bounces or is complained about is visible only if someone opens the request. The history type `email_failed` exists and is labelled in the admin but is **never written**. | grep: only the type and the label |
| G3 | **No language filter** in the request list (server, admin, CSV). | `QuoteFilters` has no `language` |
| G4 | **No preview** of the quotation as the customer will read it. `view.ts` says it is "the administrator's preview" but the editor shows totals only. | `QuotationPage.tsx` |
| G5 | **No way to end a customer's links** from the administration (only side effects: withdraw, supersede, cancel). The history type `link_revoked` exists and is never written. | no route; `revokeQuoteTokens` internal only |
| G6 | **A contact message cannot become a quote request from the interface.** The endpoint `POST /api/admin/inquiries/:id/quote-request` exists but no screen calls it, and it has **no duplicate guard** (two calls = two requests for one message). | `endpoints.quotes.fromInquiry` has no caller |
| G7 | No tests for: a link opening only its own request, no secret in logs, the new e-mails, the new routes' authorisation. | test titles listed in the audit |
| G8 | No browser journey for the whole lifecycle (A–J) and the quote journeys are not in CI. | `ci.yml` |

## Plan

1. **Migration 0009** (new file; 0007 is checksum-guarded and must not be edited): rebuild `email_deliveries` with the kinds `revision_received` and `delivery_failed_admin` and `related_type` `email_delivery`; keep every row and index; extend the once-per-submission index. Test that rows survive.
2. **G1** template (HU/EN/NL, escaped), queue in the same transaction as the revision request, once per request (database-enforced).
3. **G2** `delivery_failed_admin` to `NOTIFY_TO` once per failed delivery, only for customer-facing quotation mails; history line `email_failed`; banner on the request in the administration. Never for the alert itself (no loop).
4. **G3** `language` filter: query, repository, CSV, list state, dropdown.
5. **G4** preview panel in the editor (the saved document, in the quotation's language, as the server builds it).
6. **G5** `POST /api/admin/quotes/:id/revoke-links` (permission `requests:write`, CSRF), history `link_revoked`, button with confirmation; the customer can be given a new link with the existing "send again".
7. **G6** button on the message page, server prefills from the message, 409 when an open request for the message exists.
8. **G7/G8** tests, journey `tools/e2e/quote-lifecycle-journey.cjs`, desktop and 320 / 390 / 768, security probe; CI evaluation (manual workflow only).
9. Docs: `README`, `WORKFLOW`, `SECURITY`, `EMAILS`, `TEST_RESULTS`, `PRODUCTION_CHECKLIST`.

Out of scope on purpose (the brief forbids them): real sending, DNS or provider changes, deployment, online payment, a second quote system.
