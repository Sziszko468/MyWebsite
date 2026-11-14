# Consultation booking: e-mails

The booking uses the existing transactional outbox (`email_deliveries`, the `Notifier`, the configured provider: Resend, SMTP or, in development, the `file` provider). No second provider, no new sender. A booking's messages are rows in the outbox first and e-mails second: the booking is stored and answered, then each message is written from the stored records and handed to the provider in the background, retried with a growing pause when a failure may pass.

## The ten messages

Written in `server/src/modules/notifications/bookingTemplates.ts`, in Hungarian, English and Dutch, as a branded HTML part and a plain-text part. A message about a booking is **about one event of the booking** (`booking_events.id`); that is what makes the once-only rule work.

| Kind | To | When (the event) | Link |
| --- | --- | --- | --- |
| `booking_confirmed` | customer | a booking was made and confirmed at once; or the owner confirmed a waiting one | the customer's page |
| `booking_received` | customer | a booking was made and waits for the owner (manual confirmation); the time is held | the customer's page |
| `booking_new_admin` | owner | a booking was made | the booking in the administration |
| `booking_change_received` | customer | they asked to cancel or move (a receipt: nothing has changed yet) | the customer's page |
| `booking_change_requested_admin` | owner | a customer's request; **also** a move the customer made themselves (approval off), and the customer's answer to a proposal (accepted, declined) | the booking in the administration |
| `booking_rescheduled` | customer | the booking moved (request approved, proposal accepted, the owner's own move, or the customer's move with approval off): shows the new and the previous time | the customer's page |
| `booking_proposal` | customer | the owner proposed a new time: it says the booking stays until they accept, until when they can answer, and carries the owner's optional note | the customer's page (**required**: without `PUBLIC_URL` the message is refused rather than sent without it) |
| `booking_change_declined` | customer | the owner declined a request; the booking is as it was; the owner's optional note | the customer's page |
| `booking_cancelled` | customer | the booking was cancelled (by them, by the owner, or by granting their request); the owner's optional note | the customer's page |
| `booking_cancelled_admin` | owner | the customer cancelled | the booking in the administration |

Not sent: a message to the owner for the owner's own actions, and none when a proposal lapses unanswered (the history records it).

## Rules the messages follow

* **The booking's language.** A customer's message is in the language the visitor booked in, and so is its link (`/<lang>/consultation/booking/<secret>`); the owner's are in `NOTIFY_LANGUAGE`. The consultation type's name is the one **in that language**; if it has none there, its code is shown, never another language's name.
* **The right time, with the zone.** The date and the time range are formatted with `Intl` in the booking's scheduling zone, and the zone's name and the abbreviation in force then are printed (`Europe/Budapest (CET)`): never the reader's. A message about a move prints the event's own snapshot of the new time, so a message that goes out late still tells the truth about the move it announces.
* **The reference** (`BK-2026-000001`), the type, the date and time, the duration and, for the owner, the contact details and what the customer wrote.
* **Nothing unconfigured is promised.** No price, no "free", no place or way of meeting, no answer time, no cancellation fee or refund; "change" wording appears only when the owner's settings let the customer ask. A customer's confirmation mentions that they can ask to cancel or move only when that is allowed.
* **No private notes.** The owner's private notes are not loaded for any message (a test puts a marker in a note and searches every e-mail and the customer page). The *optional note to the customer* the owner types with a cancellation, a decision or a proposal is stored on that message and printed only there.
* **Escaping.** Every value goes through the escaping `html` tag (or is plain text); the subject lines hold no line breaks.
* **Fresh links.** Each message mints its own secure link when it is written; it is not stored in the outbox (see [SECURITY.md](SECURITY.md)).

## No duplicates, and what a retry does

* One row per **(event, kind)**: a unique index covers the ten kinds, so a repeated request, a double click or a handler that runs twice cannot make a second message for the same event. Repeating a *submission* (same idempotency key) answers with the booking already made and queues nothing.
* The outbox's own retry (back-off 1, 5, 30, 120, 720 minutes; `EMAIL_MAX_ATTEMPTS`) sends the **same** row with the same provider idempotency key, so a message the provider did receive is not sent twice; an administrator's manual "send again" is a new generation, as for every other message.
* A message that fails for good (for example a proposal when `PUBLIC_URL` is not set, which is refused rather than sent without its link) ends `failed` with the reason, and the booking's history gets an `email_failed` line (no second e-mail about an e-mail). A message whose booking has been erased in the meantime ends `cancelled`. The administration shows each message's state beside the booking.
* A booking is stored and answered whether or not its e-mail can be queued; a failure to queue never turns into an error for the visitor. The confirmation page says an e-mail "is on its way" **only when one was queued**, and never claims it arrived.
* Per recipient: at most 12 booking messages a day.

## The switches (the existing *Notifications* page)

| Switch | Default | Effect |
| --- | --- | --- |
| *A consultation is booked* (`newBooking`) | on | the owner's three kinds (`booking_new_admin`, `booking_change_requested_admin`, `booking_cancelled_admin`) |
| *Confirm a booking to the visitor* (`confirmBooking`) | on | every message to the customer |

The owner's address is `NOTIFY_TO` (never defaulted: no address, no owner message) and the sender and provider are the usual `EMAIL_*` settings. With no provider, or with sending paused (`EMAIL_ENABLED=false`), nothing is queued and bookings still work.

## Testing without sending

Every test uses the `RecordingMailer` (an in-memory fake) or the `file` provider (writes `.eml` files to a temporary folder); no test sends real e-mail and no real address is used (`example.test`, `example.com`). The tests that read messages: `server/test/booking*.test.ts` (subjects and bodies in all three languages, the zone, links, the optional notes, escaping, the switches, one message per event) and `tools/e2e/booking-journey.cjs` (the file provider, in a real browser).
