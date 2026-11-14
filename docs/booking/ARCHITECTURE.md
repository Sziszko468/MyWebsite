# Consultation booking: plan and architecture

## The plan this was built from

Written before any code, after reading the repository (branch `feature/localization-quality-engine` at `ce5a2e9`, clean tree, branch `feature/consultation-booking` cut from it).

**Audit findings.** There was no booking or scheduling code (the words *booking*/*appointment* in the repository are the BookingHub portfolio project and the shop's copy). What already existed and was reused instead of rebuilt:

| Need | Reused |
| --- | --- |
| a database with safe concurrent writes | `node:sqlite` behind `db/database.ts`: one writer, synchronous `BEGIN IMMEDIATE` transactions |
| migrations | `db/migrate.ts` (numbered SQL files, checksums, the table-rebuild procedure of 0007/0009) |
| e-mail | the outbox `email_deliveries` + `Notifier` (retry with back-off, once-only rows, idempotency key to the provider, webhook state, `file` provider for tests) |
| secure links | the *pattern* of `quotes/tokens.ts` (256-bit random, only the SHA-256 stored, 404 for unknown, 410 for expired/revoked, `tokenMiss` limiter); **not** its table or its scopes |
| references | `reference_counters` (`BK-2026-000001`, like `CC-2026-000001`) |
| history | the append-only table pattern of `quote_events` (database triggers refuse update and delete) |
| rate limiting, errors, validation | `http/rateLimit.ts`, `http/errors.ts`, `lib/validate.ts` (`Fields`) |
| admin | the React SPA (`src/admin`), session + CSRF, `requirePermission`, `audit_log`, `DataList`, `Tabs`, `useResource`, the two admin dictionaries |
| owner notification settings | `NOTIFY_TO`, `NOTIFY_LANGUAGE` and the *Notifications* switches (two added) |
| localization | `tri()` content, the quality tooling (`i18n:check`/`validate`), `LOCALE_TAGS`, the PROMPT 23 language rules |
| analytics | `track()` with its allow-list of ids, numbers and booleans (seven events added) |
| customers / quotes | `quote_requests` is linked by reference **and e-mail** (a reference alone links nothing) |

No customer table exists in the codebase (customers are the e-mail address on each record), so none was created.

**Decisions.** Settings live in the existing `settings` table (JSON under `booking.settings`, as the assistant's do); everything with a rule about time lives in `server/src/modules/bookings/`; the public page, the customer page and three admin screens are new React code; the e-mails are new templates for the existing outbox.

## Modules

```
server/src/modules/bookings/
  zone.ts          dates, wall-clock times and time zones with Intl only (no library)
  availability.ts  the engine: windows, exceptions, slots, buffer, notice, horizon  (pure, plus thin database loaders)
  model.ts         statuses, the state machine, row types, the owner's settings, "why is booking closed"
  repository.ts    queries: types, bookings, history, tokens, reference numbers
  service.ts       everything that changes a booking (each function = one transaction)
  customer.ts      what the secure link allows
  admin.ts         the administration's functions (permission checks, list, detail, set-up)
  public.ts        the public configuration (types, zone, policy) for the page
  mail.ts          writes a booking's e-mail from its records at send time
  suggested.ts     the four suggested types (switched off, no length)
  retention.ts     deletion by age and by erasure request
  routes.ts        the addresses
server/src/modules/notifications/bookingTemplates.ts   the ten e-mails in hu/en/nl
server/src/db/migrations/0011_consultation_booking.sql
src/booking/        api client, dates (Intl), hooks, month loader
src/components/consultation/   BookingFlow, Calendar, ConsultationCta, styles
src/pages/ConsultationPage.tsx, BookingPage.tsx
src/content/consultation/index.ts   every visitor-facing word (tri)
src/admin/pages/Booking{s,Detail,Setup}Page.tsx, src/admin/i18n/booking.ts
```

## Data model (migration 0011)

| Table | Holds |
| --- | --- |
| `consultation_types` (+ `_translations`) | code (immutable), length (NULL until set), enabled, order; name and description per language. `CHECK (enabled = 0 OR duration_minutes IS NOT NULL)` |
| `availability_rules` | weekday (1 Mon–7 Sun), start and end **minute of the local day**, optional type |
| `availability_exceptions` | `closed` (a day, a period, or part of one day) or `open` (a one-off window), local dates, optional times, a private label |
| `bookings` | reference, type, language, name, e-mail, company, website, description, **`start_at`/`end_at` in UTC**, **`time_zone`**, status, related reference + matched `quote_request_id`, idempotency key + request hash, consent time, timestamps, cancellation (by, note) |
| `booking_changes` | a customer's cancel/reschedule request or the owner's proposal: kind, initiator, status (`open` `applied` `declined` `withdrawn` `expired`), the replacement slot, the status the booking had before, expiry, who decided |
| `booking_events` | the append-only history (triggers refuse update and delete); no names, no addresses, no free text |
| `booking_notes` | the owner's private notes |
| `booking_tokens` | SHA-256 of each secure link, per booking, with expiry and revocation |
| `email_deliveries` | rebuilt with ten new kinds and `related_type = 'booking_event'`; the once-per-submission index covers them |

Store a booking's times as ISO text with milliseconds and `Z`: text order is time order, so overlap is a string comparison. Settings (switch, zone, step, buffer, notice, horizon, confirmation mode, change rules) are JSON in `settings`, with no default for the zone and a `configuredAt` that stays `null` until the owner saves.

## The state machine

```
pending ──confirm──▶ confirmed
pending ──cancel───▶ cancelled
confirmed / rescheduled ──(a reschedule request or proposal opens)──▶ reschedule_requested
reschedule_requested ──(applied)──▶ rescheduled
reschedule_requested ──(declined, withdrawn, expired)──▶ the status it had before
confirmed / rescheduled / reschedule_requested ──cancel──▶ cancelled
confirmed / rescheduled / reschedule_requested ──complete / no_show──▶ completed / no_show   (only after the start)
rescheduled ──(moved again)──▶ rescheduled
cancelled, completed, no_show: final
```

`TRANSITIONS` in `model.ts` is the table; `writeState` in `service.ts` is the **only** code that writes a status and it asks `canMove` first; a test pins the table and one walks the arrows through the administration. Every move writes a `booking_events` row (who, from, to, from/to times) in the same transaction as the change, and queues its e-mails there.

A cancellation request leaves the status unchanged (the open `booking_changes` row says it is requested); a reschedule request or proposal sets `reschedule_requested`. At most one change is open per booking (unique partial index).

### Rescheduling never leaves two appointments

A customer's reschedule request **holds** the replacement slot: it is part of the same blocking set as a booking (the engine, and the triggers, treat an open reschedule's new slot as taken), while the booking itself stays at its old time until the owner agrees. Approving moves the booking to the held slot in one transaction (one row's `start_at`/`end_at` change; nothing is duplicated); declining or withdrawing releases the hold and restores the previous status. A proposal by the owner works the same way and lapses (`expires_at`: the owner's setting, and never later than the proposed start) when nobody answers; lapsing is applied lazily on the next read or write and recorded in the history.

## Concurrency

Three layers, each tested:

1. **One writer.** `db.transaction` is synchronous `BEGIN IMMEDIATE`: the availability check and the insert are in one transaction, and nothing runs between them. Ten simultaneous requests for one slot give one `201` and nine `409 slot_unavailable` (`booking.test.ts`).
2. **SQLite across processes.** Two real server processes on one database file, eight simultaneous bookings for one slot: one wins (`bookingProcess.test.ts`).
3. **The database itself.** `bookings_no_overlap_insert/update` and `booking_changes_hold_insert` triggers refuse any row that would overlap a live booking or somebody else's held slot (`booking_overlap`), whoever writes it. Touching is not overlapping; a booking that is over does not hold its time. Tests write rows directly with SQL to prove it.

The buffer between consultations is the engine's business (a slot too close to a booking is not offered); the triggers only guarantee "never the same moment twice".

A booking request names a start instant; **the server recomputes the free slots for that day inside the transaction** and the instant must be exactly one of them. The browser's calendar is only a hint.

## Endpoints

Public (`/api/consultations/…`, no session; CORS as the rest of the public API; responses `no-store`):

| Method and path | Purpose | Limit |
| --- | --- | --- |
| `GET /config?lang=` | open or not, the zone, the types **in that language**, the rules a visitor will meet | `catalog` 180/min |
| `GET /types/:code/days?from=&to=` | per day: `available`, `full` or `closed`, and the free slots (start, end, ambiguous flag); at most 62 days | `catalog` |
| `POST /bookings` | make a booking (`Idempotency-Key` header or `idempotencyKey` in the body) | `booking` 6 / 15 min |
| `GET /manage/:token` | the customer's booking | `customer` 90/min + `tokenMiss` 20/15 min |
| `GET /manage/:token/days?from=&to=` | free times for moving this booking (its own time not in the way) | `customer` |
| `POST /manage/:token/actions` | `cancel`, `reschedule`, `withdraw`, `accept`, `decline` | `customer` |

Administration (`/api/admin/…`, session + CSRF, same-origin):

| Method and path | Needs | Purpose |
| --- | --- | --- |
| `GET /bookings` | `requests:read` | list with search, filters, sort, paging |
| `GET /bookings/:id` | `requests:read` | detail with history, notes, e-mails, open change |
| `GET /bookings/:id/days` | `requests:read` | free times for a proposal |
| `POST /bookings/:id/actions` | `requests:write` | `confirm` `cancel` `complete` `no_show` `propose` `approve` `reject` `note` `revoke_links` |
| `GET /booking-config` | `requests:read` | settings, types, hours, exceptions, why booking is closed |
| `PUT /booking-settings` | `system:write` | the owner's settings |
| `PUT /booking-hours` | `system:write` | the weekly hours and exceptions, replaced as one validated whole |
| `POST /consultation-types`, `PUT /consultation-types/:code` | `system:write` | create and edit types |

Errors keep the existing envelope `{ error: { code, message, details?, requestId } }`: public messages are generic, `details.reason` is a short code the page words (`closed`, `slot_unavailable`, `change_open`, `too_late`, `not_offered`, `key_reused`, …) and `details.fields` maps field → code. No route accepts a reference, an id or an e-mail address from the public.

Idempotency: the same key and the same content answers `200` with the booking already made (and sends nothing again); the same key with different content is `409 key_reused`; the page makes a new key after every definite answer and keeps it after a doubtful one (no answer), so a retry cannot book twice.

## Localization

Visitor words are `tri(hu, en, nl)` in `src/content/consultation/` and `bookingTemplates.ts`; all three are inventoried, spell-checked and held to the glossary (new concept: consultation / booking = *konzultáció / foglalás*, *consultation / booking*, *adviesgesprek / afspraak*). A consultation type is offered in a language only if it has its name and description in that language; there is no fallback. The booking's language is stored and every page and message about it uses it; the owner's messages use `NOTIFY_LANGUAGE`.

## Analytics

The existing tracker is implemented, so seven events were added (`consultation_type_viewed`, `booking_started`, `booking_slot_selected`, `booking_submitted`, `booking_confirmed`, `booking_cancel_requested`, `booking_reschedule_requested`). They carry only a type code (an id the owner chose) and a yes/no; the tracker drops anything else, and now also strips the secret from the customer page's address.

## Future calendar integration (planned, not implemented)

The booking domain (types, rules, bookings, history) does not know about any calendar. A future integration would be an adapter that (a) **reads** busy intervals from an external calendar and feeds them to `blockersBetween` as extra blockers, and (b) **writes** an event on `created`/`rescheduled`/`cancelled` history events (they already exist and are the natural trigger, the same way the outbox is). It would need its own table for the external event id and its own credentials handling; nothing in the current tables needs to change. An ICS download link per booking would need no credentials at all.
