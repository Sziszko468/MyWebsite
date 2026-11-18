# Architecture and security boundaries

PROMPT 31: a **read-only administrative copilot** inside the existing CONTROL ROOM administration. This page was written *before* the code, from what the repository actually contains; where the implementation had to differ, the section "Changes against this plan" at the end says so.

Base: branch `feature/ai-admin-assistant`, created from `feature/ai-project-discovery` @ `419795decbbc772848916ab684d8ce56c43ca2d6` (the exact commit the work started from).

## What exists today (inspected)

| Area | Fact found in the code | Consequence |
| --- | --- | --- |
| Model | Claude Haiku 5.5 only: a constant (`ai/model.ts`), verified by a connection test, locked by `guardModel`; no selector, no fallback | The admin assistant uses the same `Assistant` instance, the same lock, the same key; nothing new |
| Gateway | `Assistant.chat()` is built around a *visitor*: an anonymous `ai_sessions` row, `ai_conversations`, an IP limiter, a per-session count | The admin chat needs its own entry point; the streaming core (`stream()`) is reusable once its tools and its persistence are passed in |
| Budget | `ai_requests` is the one ledger of every model request, with a reservation made before the provider is called (`reserve`) and a daily/monthly budget over *all* rows | Admin requests go through the same reservation, so **one budget protects the money**; a new `audience` column keeps visitor and admin numbers apart |
| Administrator identity | Cookie session (`admin_sessions`, token hash, idle and absolute expiry, `HttpOnly`, `SameSite=Strict`), CSRF token on every unsafe request, same-origin check; `resolveSession` re-reads the user (status, role) from the database on every request | The chat request carries the session; each tool call **re-reads it** (a signed-out, disabled or re-roled administrator loses access mid-answer) |
| Permissions | **Two roles** (`admin`, `editor`) and **twelve permissions**, enforced inside the business functions with `requirePermission`; no per-record ownership: a permission opens a whole *domain* | The assistant checks the *specific domain permission* of every tool, itself, with the freshly re-read session. Nothing finer exists, so nothing finer is claimed (see PERMISSIONS.md) |
| Data modules | Every admin read function takes `(app, session, …)` and checks its own permission, but several return far more than a model needs (e-mail, phone, IP hashes, delivery logs, internal notes) and two write while reading (`expireChanges` in the booking list and detail) | Tools do **not** forward those objects. Each tool runs its own narrow, parameterised, read-only `SELECT` or a read-only repository function and returns a whitelisted, size-limited shape |
| Private notes | Internal notes exist on quote requests, inquiries, customers' projects, bookings, deliverables and (as `visibility: internal`) in conversations | They are **never read by the assistant** in this version (a draft reply could otherwise quote an internal note to a customer). Documented as a limitation |
| Audit | `audit_log` records who did what to which record, never what was written | The assistant records conversation creation/deletion and every generated report there; never content |
| Retention | Visitor conversations: `retentionDays`, `purge()`, `eraseConversation()` | Admin conversations follow the same setting, with their own purge and erase |
| Admin UI | A separate React app (`src/admin/`), Hungarian and English only, its own text modules, an isolation test that forbids importing the website's content | The assistant screen has its own three-language text module inside `src/admin/i18n/` (Dutch included, because customers write in Dutch), checked by its own tests and by the i18n quality scan |
| Customer AI | `/api/ai/*` with the `X-AI-Session` header, cookie-free | The admin assistant lives under `/api/admin/ai-assistant/*` and uses the cookie session: a visitor token can never reach it, and an administrator cookie is never accepted by the visitor API |

## The design

```
 administrator's browser                     backend (server/)                                                     provider
 ───────────────────────                     ─────────────────                                                     ────────
 /admin/ai-assistant  ── cookie + CSRF ──►  /api/admin/ai-assistant/chat
 (React, lazy chunk)       text, context,    1. session (resolveSession) + permission assistant:use + same-origin
                           language          2. feature on? model verified? limits (per administrator), concurrency
                                             3. conversation owned by THIS administrator; context re-validated
 ◄── UI message stream ◄──────────────────  4. budget RESERVATION (shared ledger, audience = admin)
                                             5. streamText(claude-haiku-5-5, closed read-only tool set) ─────────► Anthropic Messages API
                                                 every tool: re-read session → domain permission → context scope
                                                              → narrow parameterised SELECT → whitelisted output
                                                              → strict output schema → size/secret check
                                             6. reconcile usage; store the answer (admin tables only)
                                             SQLite: ai_admin_conversations · ai_admin_messages (+ audience on ai_requests / ai_tool_calls)
```

### Boundaries (each one is enforced in code and covered by a test)

1. **Read-only.** The tool set contains no tool that writes business data, and no tool accepts a status, a price, a message to send, a date to change or an identity. A test takes a digest of every business table before and after running every tool and requires it to be identical. A request to *do* something is answered by *preparing* it for human review.
2. **The administrator's own authority, re-checked at the moment of use.** The model never sees or supplies an administrator id or a session. Each tool call re-reads the session from the database (valid, not expired, user active, current role) and then checks the permission its data needs. A tool without permission answers "not available to you" with no count, no title, no hint that the record exists.
3. **A context is a reference, not an authorization.** It is fixed when the conversation starts and re-validated against the database on every turn. In a record context the tools can reach only that record and the records tied to it; searches are refused (they would cross into other customers). Changing the context starts a new conversation, so no earlier answer about another customer remains in the model's window.
4. **Minimum necessary data.** Tool outputs are whitelisted shapes: no e-mail addresses, phone numbers, IP hashes, tokens, delivery logs or internal notes; lists are paginated and capped; long texts are cut; customer-written text is marked untrusted.
5. **Untrusted content.** Everything that comes from a customer, a visitor or a stored record is data. The system prompt says so, tool results wrap customer text in fields named `…Untrusted`, and the assistant has no tool that an injected instruction could abuse: there is nothing to send, change, fetch or run.
6. **No model, key, provider or URL choice.** The browser sends text, a language and a context reference; the server ignores everything else. No tool takes SQL, a path or a URL.
7. **One ledger, separate audiences.** Requests are reserved and reconciled exactly like the visitors'; they carry `audience = 'admin'`, so the public assistant's analytics never include them and the admin assistant's numbers contain no conversation text.
8. **Deletion is complete.** Admin conversations and messages are hard-deleted (cascade) on delete, on "clear", on retention, and when the administrator account is deleted.

## Changes against this plan

Written after the work; the same list is in [README.md](README.md#changes-against-the-plan-architecturemd). Where the plan above said one thing and the code does another, the code (and these notes) are right:

1. **Conversation statuses.** The plan said "unanswered = open and the customer wrote last". The customer conversations use `waiting_owner` / `waiting_customer` besides `open`, and a new customer message puts a conversation in `waiting_owner`; the first readers counted only `open` and found nothing waiting. *Live* is now `open`, `waiting_owner` or `waiting_customer` (found by the tests).
2. **A key name refused by the shared guard.** The tool-output guard shared with the visitors' assistant refuses the key `customerId` in any result. The admin readers return `id`; the tools still take `customerId` as input.
3. **Foreign conversation ids.** A conversation id that exists for another administrator is answered *not found* before anything is written. A visitor conversation with the same id is a different table, so the administrator simply gets a new conversation.
4. **Privacy notice.** The plan said "update the notice only if the processing changes". It does (details of customer records go to the AI provider when the owner asks), so one item was added to the public notice. An older test asserting that *nothing under `ai/`* mentions bookings was narrowed to the **visitors'** assistant, with an added check that the visitors' tools cannot import the administrators' module.
5. **Dutch.** The admin app has two languages; the assistant screen has three (a screen-only dictionary with its own tests), because the assistant answers in the language chosen for it.
6. **No action tools.** No tool writes, so no "approved action" or confirmation step exists; the screen's confirmation dialogs are for deleting or clearing a conversation.
7. **Added during testing:** the AI screen's *Admin assistant* tab (switch, limits, numbers), a print style for one report, the `?context=…&ref=…` link, and a retry that re-asks the answer if the server stored the question and re-sends the question if it did not.
