# Consultation booking

A visitor chooses a consultation type, a free day and time, leaves their contact details and books. The owner opens booking, writes the hours, and works with the bookings in the existing administration. It is part of the existing website and backend: one Node process, the existing SQLite database, the existing e-mail outbox and the existing administration. There is no second backend, database, e-mail provider, calendar service or account system.

> **Status:** implemented and tested on the branch `feature/consultation-booking`; **not deployed**, not merged, and booking is **closed to the public** until the owner has opened it (see "Opening booking" below). What was and was not verified is in [TEST_RESULTS.md](TEST_RESULTS.md). Only what is marked *implemented* exists; *planned* things are not built.

| Document | What it says |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | the plan, the modules, the data model, the endpoints, the state machine, concurrency |
| [AVAILABILITY.md](AVAILABILITY.md) | how free times are calculated; time zones and daylight saving time |
| [SECURITY.md](SECURITY.md) | the secure links, abuse protection, privacy, what needs the owner's or a lawyer's review |
| [EMAILS.md](EMAILS.md) | the ten messages, their languages, idempotency and the switches |
| [TEST_RESULTS.md](TEST_RESULTS.md) | what was run, with exact results, and what was not |

## What a visitor sees (implemented)

`/<lang>/consultation/` in Hungarian, English and Dutch:

1. **Type**: the consultation types the owner switched on, each with its description and length.
2. **Day and time**: a month calendar (Monday first) and the free times of the chosen day. Every time is shown in the owner's scheduling time zone, and the zone is named on the page; the visitor's own clock is never consulted.
3. **Details**: name and e-mail (required); company, website, a description and a related quote or inquiry reference (optional); one consent tick. No account.
4. **Review**: the summary, then "Confirm booking" (or "Send booking request" when the owner confirms each booking).
5. **Confirmation**: the reference, the time, and, only if the server queued one, a line that a confirmation e-mail is on its way. The page never shows a booking as confirmed before the server has created it.

The page shows five states in words, shapes and colour: *free*, *selected*, *fully booked*, *not available* (calendar), and "temporarily unavailable" when the calendar cannot be loaded or a time was taken a moment earlier; the finished booking is "Booking confirmed".

Where booking is offered: the page itself, a link in the footer, and a strip on the Contact page, the Services (shop) page and the FULL EXPERIENCE page. **Each of those shows only while booking is open** (the page asks the backend once); the main navigation is unchanged (six pages).

The customer's own page, behind the secret link in each e-mail, `/<lang>/consultation/booking/<secret>`: the booking, its status and history; ask to cancel; ask to move it (choosing a replacement time from the same free times); take a request back; answer the owner's proposal of a new time. What it offers follows the owner's settings.

## What the owner does (implemented)

Administration → **Consultations** (in the "More" menu on a phone), and **Availability and settings** inside it:

* **Bookings:** search (name, e-mail, company, reference), filters (status, consultation, date range), sort, pages; the detail shows the customer, the appointment (in its zone), an open request, the history, the e-mails and their state, the related quote request, and private notes. Actions: confirm, cancel (with an optional message to the customer), mark completed or no show (only once the booking has started), propose a new time, approve or decline a customer's request, revoke the customer's links.
* **Set-up:** settings, consultation types, weekly hours and exceptions. Only an administrator can change them (an editor can read them and work with bookings).

### Opening booking (the owner's setup guide)

**Nothing is public until you do all of these.** The Consultations page lists whichever is still missing.

1. **Choose a time zone** (Settings), for example `Europe/Budapest`. Every time on the site is shown in it.
2. **Review the settings and save them once.** The numbers shown at first (start times every 30 minutes, no buffer, 24 hours' notice, 60 days ahead, bookings confirmed at once, customers may *ask* to cancel or move, you answer their requests, a proposal lapses after 72 hours) are **starting values, not decisions**: they count as yours only after you save.
3. **Consultation types:** four suggestions exist in all three languages. Read and edit them, give each a length in minutes, and switch on the ones you want. A type cannot be switched on without a length and all three languages. No price, no "free", and nothing about how a consultation takes place is written anywhere.
4. **Weekly hours:** add windows for the days you are available (a day without a window is closed). A type that has hours of its own is offered only in those. Add exceptions for holidays and one-off openings.
5. **Switch "Online booking" on.**
6. **E-mail:** set `NOTIFY_TO` (your address) and a provider (see "Configuration"), otherwise bookings work but nothing is e-mailed. Decide in *Notifications* whether you want the booking messages (both default to on).

If you do not want to confirm each booking, leave "New bookings: are confirmed at once". If you want to review each one first, choose "Wait for your confirmation": the visitor then gets a "request received" e-mail, the time is already held for them, and you confirm or cancel.

## Configuration (all existing; nothing new)

| Variable | Used for |
| --- | --- |
| `PUBLIC_URL` | the secure links in e-mails (`https://…/<lang>/consultation/booking/<secret>`). Without it a booking still works, but customer e-mails carry no link and an owner's *proposal* cannot be sent (it is useless without the link) |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_API_KEY` / SMTP, `EMAIL_REPLY_TO` | sending (the existing outbox) |
| `NOTIFY_TO`, `NOTIFY_LANGUAGE` | where the owner's booking messages go and in which language |
| `CUSTOMER_LINK_DAYS` | how long a customer link works after the appointment (default 90) |
| `RETENTION_DAYS` | when set, bookings that are over (cancelled, completed, no show) are deleted this many days after their last change; unset keeps everything |
| `RATE_LIMITS` | on by default; the booking form allows six bookings per 15 minutes per address |

No environment variable was added. Migration `0011_consultation_booking.sql` creates the tables and rebuilds `email_deliveries` (as migrations 0007 and 0009 did); it applies on the next start with `MIGRATE_ON_START` (the default). It creates **no** hours, **no** durations and **no** enabled type.

## Operations

* **Backup/restore:** the bookings are in the same SQLite file as everything else.
* **Erasure request:** `npm run server:cli -- erase <e-mail>` also removes the address's bookings, notes, links and e-mails (the history keeps one line per event with a reference, a status and a time, and no person).
* **Outbox:** a booking's e-mails appear in the usual delivery log (*Notifications*) and on the booking's detail page.
* **Several processes:** two server processes on one database file cannot double-book a time (tested with real processes); the rate limits are per process.

## Deliberately not built

* **Calendar integrations** (Google Calendar, Outlook, Calendly, Cal.com, ICS feeds, OAuth): deferred by the brief. The booking domain does not depend on any of them; see "Future calendar integration" in [ARCHITECTURE.md](ARCHITECTURE.md). *Planned, not implemented.*
* **Payments, cancellation fees, refunds, prices:** out of scope.
* **Verification of the visitor's e-mail address before a time is held:** not built; see the limitation in [SECURITY.md](SECURITY.md).
* **Reminders before the appointment, a calendar (ICS) attachment, SMS:** not built.
* **Any statement about where or how a consultation takes place:** none is configured, so none is made.
