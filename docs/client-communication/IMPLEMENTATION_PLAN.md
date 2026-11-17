# Implementation plan (written before the code)

PROMPT 28, client communication. Branch `feature/client-communication`, based on `feature/client-feedback-approval` at `8c377ad5b811e5c6e02616eaa3da5bbe12910e05` (clean, pushed). The next migration number on this base is **0015** (the last is `0014_client_feedback.sql`); it is free. This file is kept as a record of the plan; what was built is described in the other documents of this folder.

## What the audit found (and what it means for the plan)

| Finding | Consequence |
| --- | --- |
| The customer portal is one page for every address below `/<lang>/client-portal` (build ships a quiet shell, `_redirects` and `_headers` already cover it: no cache, no index, no referrer, no analytics) | `/<lang>/client-portal/messages` needs **no** new route registration, header or sitemap rule. The nav gets one item. |
| Customers sign in with the portal's own session; every customer endpoint is `customerAuth: true`, rate-limited as `portal`, same-origin, CSRF-protected; the identity comes only from the session | Messages reuse that. The sender is always read from the session; nothing in a body, query or address is believed. |
| Administrators have `clients:read` (see) and `clients:projects` (change) for customers and projects; `system:write` is the administrator's only | Same three permissions. Internal notes need no new permission: whoever may read a customer's records may read the notes, and no customer-facing path selects them. |
| The e-mail outbox (`email_deliveries`) has a once-only unique index `(related_type, related_id, kind)` and a `CHECK` list of kinds, rebuilt by every module that adds mail | Migration 0015 rebuilds it once more (ids kept) for six new kinds and one related type. |
| Four modules already write **one append-only event line per fact**, in the same transaction as the fact: `recordProjectEvent` (projects, milestones, tasks, customer actions), `deliverables/service.recordEvent`, `bookings/repository.recordBookingEvent`, `quotes/events.recordEvent` | System events are **mirrored from those lines** by one non-throwing call in each, with the source line's id as the idempotency key. No business rule is copied; history before the feature is never mirrored (only future lines are). |
| There is **no private file storage**: `media` is the site's public pictures; customer documents are a disabled feature flag in the portal session (`documents: false`) | **Attachments are not implemented** and the interface says so honestly (the same position as feedback in PROMPT 27). Reasons and the requirements for later are documented. |
| Customers have no notification preferences at all | A small additive table `customer_message_preferences` (all on by default), editable in the portal. |
| The migration runner applies any pending file in any order but refuses a database that has a migration the code does not know (`deployment/render-cloudflare` has its own `0030_gmail_messages.sql`) | Documented in the launch checklist: the merge must bring both chains together. Nothing here depends on 0030. |
| E-mail is optional (`notifier.enabled`); a message about something erased is cancelled by the notifier | New mails follow the same rule, and are queued by the one function (`queueClientMail`) that never throws. |

## Decisions

1. **Message text never goes into an e-mail or a log.** A notification says *that* there is something new about *which project*, with a button into the portal or the administration. The text of a private conversation stays where sign-in protects it.
2. **Customers cannot start conversations until the owner allows it** (a setting, off by default, in the spirit of the booking module's "closed until opened"). Replying to the owner's conversations always works. Owner flips one switch.
3. **System events are messages in an "activity" conversation** (kind `activity`, one per customer and project, created lazily when the first event is mirrored, read-only for everybody). A project-bound normal conversation *also shows* its project's activity events inline (one query over the two conversation ids), so nothing is copied twice.
4. **System events never count as unread** and never change a conversation's status; they update *last activity* only. (Documented in READ_TRACKING.md.)
5. **Read tracking is a message sequence number per reader**, not a timestamp: `last_read_seq` never moves backwards and is set only up to what the client says it has loaded *and the server confirms is visible to that reader*. Opening a conversation marks nothing until the page's messages have arrived and the page asks (customer) or the admin screen asks.
6. **One notification per run of unread messages**: a new human message notifies the other side only when it is the first one they have not read; announcements and "important" messages always notify. A burst of five messages is one e-mail, not five.
7. **Messages are immutable**. A customer's can never be changed or removed. The owner can remove *their own* message or note (a tombstone is shown; the text stays in the database for the record) and can edit *their own internal note*. Everything else is a new message.
8. **Announcements** are the owner's customer-visible, clearly marked messages inside one customer's conversation; sending one asks for a confirmation (the API also requires `confirm: true`). No broadcast to many customers (no mass mailing in this prompt).
9. **Resolution**: the owner sets *Resolved*/*Archived*/*Open* (with a revision check); the customer can **request** resolution (a system event in the thread and an e-mail to the owner), never set a status. A customer message in a resolved thread reopens it as *Waiting for owner*; an archived thread refuses customer messages.
10. **Search** is a parameterized `LIKE` with escaped wildcards (SQLite has no per-row full-text index here and the volumes do not need one), 2 to 100 characters, always scoped by customer for customers, internal notes included **only** for administrators, paginated by sequence, own rate limit.

## Files (what will exist)

```
server/src/db/migrations/0015_client_communications.sql
server/src/modules/communications/
  model.ts       lists, limits, row types, settings shape
  service.ts     conversations, messages, status machine, soft delete / note edit
  reads.ts       read markers and unread counts
  events.ts      system-event mirrors (project, deliverable, booking, quote) and the idempotent writer
  search.ts      the two searches
  notify.ts      the six e-mails, once-only, preferences, owner switches
  preferences.ts the customer's choices
  settings.ts    the owner's choices
  customer.ts    the customer's rules (ownership on every call)
  views.ts       the customer read model (named columns only) and the admin read model
  admin.ts       the owner's endpoints (bodies field by field, permissions, audit)
  routes.ts      the addresses
server/src/modules/notifications/communicationTemplates.ts   HU / EN / NL
four one-line hooks: customers/projects.ts, deliverables/service.ts, bookings/repository.ts, quotes/events.ts
src/components/portal/MessagesViews.tsx (+ .module.scss), src/content/portal/messages.ts, src/portal/api.ts
src/admin/pages/CommunicationsPage.tsx, CommunicationPage.tsx, src/admin/api/communications.ts, src/admin/i18n/communications.ts
tests: server (core, visibility, read/search, notifications, security, events), src (portal views, admin pages, text parity)
tools/e2e/communication-journey.cjs
docs/client-communication/ (the 13 required files)
```

## Order of work

1. Migration, model, settings, preferences. 2. Service (conversations, messages, status, read markers). 3. Search, events and the four hooks, notifications and templates. 4. Customer and admin endpoints, routes, rate limits, retention. 5. Portal UI. 6. Admin UI. 7. HU/EN/NL words, localization checks. 8. Tests (backend, security, frontend), then the browser journey over widths, themes and motion, and the regression journeys. 9. Documentation. 10. Full gate, commit, report.

## Risks I will watch

* **A hook that throws would undo a real action** (a published deliverable, a booking). The mirror is written never to throw and uses `INSERT … ON CONFLICT DO NOTHING`; a test breaks the table on purpose and checks the source action still succeeds.
* **A private note leaking.** Every customer read model selects named columns and `visibility = 'customer'` in SQL; a test greps every customer answer, e-mail, log line and search result after a whole journey for the private words.
* **Duplicate sends** (double click, retry, two tabs): a client token makes a send idempotent, and the outbox's unique index makes a notification once-only.
* **Unread drift**: counts are computed from the markers on every read, never cached in a column.
* **Scope.** This is large; where something is deliberately left out (attachments, broadcast, per-message editing of customer text) it is named in the documents rather than half-built.

## What changed while building (added after the code was finished)

The plan above is kept as it was written. Where the finished system differs from it:

* **Decision 6 (one e-mail per run of unread messages)** was built as *"a message e-mails the other side only when it starts a wait"* (the status was not already waiting for that side), plus announcements and important messages always. It gives the same result for the cases the plan described (five messages in a row are one e-mail; the customer is e-mailed again after they have answered) without a second source of truth next to the read markers. See NOTIFICATIONS.md.
* **The timeline of a project conversation** takes the project's events by message sequence number, not by time (two things in the same millisecond still have an order); and a reopening is written *before* the message that caused it.
* **`conversation.*` events** (resolved, reopened, archived, resolution requested) are written inside the thread, once per revision of the thread; they are not mirrored from another module.
* **The summary endpoint** also says `attachments: false`, so a future switch needs no new screen logic.
* **A defect outside the plan was fixed**: the portal menu's current-page link lost its background under the mouse pointer (see TEST_RESULTS.md).
* **Rolling back** is not "redeploy the previous commit": the migration runner refuses to start on a database that holds a migration its code does not know. The plan said "forward-only"; ARCHITECTURE.md now spells out what that means.
