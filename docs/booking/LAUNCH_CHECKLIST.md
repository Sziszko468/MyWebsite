# Consultation booking: launch checklist

The things that stand between "the code works" and "visitors may book". Written on 2026-11-15 for the branch `feature/booking-launch-readiness` (PROMPT 24.1). **This checklist does not open booking and does not approve anything.** Booking stays closed to the public until the owner switches **Online booking** on, and that switch is the *last* step below.

## How to read the statuses

| Status | Meaning |
| --- | --- |
| **Verified** | Shown by an automated test or run **on this branch**, named in the evidence column. It is always a local result (a throw-away database, a scratch server, Chrome driven by Playwright, the `file` or recording e-mail provider). It is **never** a statement about the production host, real devices, real mailboxes or a lawyer's opinion. |
| **Not verified** | Nobody checked it, or it can only be checked with access this work did not have (the Render and Cloudflare dashboards, DNS, a real mailbox, a real device). It may well be fine; nothing here says it is. |
| **Owner action required** | A decision, a setting or a check that only the owner (or their lawyer) can make. The code does not choose it for them, and the checklist does not invent it. |
| **Not applicable** | Does not apply to this system, with the reason. |

**Technical implementation is not legal approval.** Where a row touches the law (privacy, retention, consent, cancellation), the *implementation* and the *approval* are separate rows. A *Verified* implementation row means the code does what the notice says; it does not mean the notice or the practice is lawful.

Production facts below come from the platform audit of 2026-11-13 ([../audit/](../audit/README.md)): public, read-only requests and DNS only; **the Render and Cloudflare dashboards were never opened**. They are listed as outstanding and are not assumed fixed.

---

## A. Owner configuration

Administration → **Consultations** → **Availability and settings** (an administrator; an editor can read but not change). The Consultations page lists what is still missing. Nothing in this section has a default the code chose for the owner.

| # | Item | Status | Evidence / what to do |
| --- | --- | --- | --- |
| A1 | **Scheduling time zone** (for example `Europe/Budapest`) | Owner action required | No default: without it booking stays closed (`no_time_zone`). Every time on the site and in every e-mail is shown in it, never in the visitor's. Closed-until-configured: **Verified** (`server/test/booking.test.ts`). |
| A2 | **Save the settings once**, after reading every number | Owner action required | The numbers shown at first (30-minute steps, no buffer, 24 hours' notice, 60 days ahead, confirm at once, ask-only changes, 72-hour proposals) are *starting values, not decisions*; they count as the owner's only after the first save (`configuredAt`). **Verified** (`booking.test.ts`). |
| A3 | **Consultation types and their descriptions, in Hungarian, English and Dutch** | Owner action required | Four suggestions are stored **switched off**, each with all three languages and no length. A type cannot be switched on without a length and all three languages (**Verified**, `booking.test.ts`). Have a native speaker read the three languages (see B10). No price, no "free", nothing about place or way of meeting is written anywhere. |
| A4 | **Consultation durations** | Owner action required | 5 to 480 minutes per type; none is preset. |
| A5 | **Weekly availability** (hours per weekday, optionally per type) | Owner action required | None exists until written; a day without a window is closed. The engine (windows, closures, one-off openings, per-type hours) is **Verified** (`bookingAvailability.test.ts`, 29 tests). |
| A6 | **Holidays and exceptions** | Owner action required | A closure always beats an opening. A one-off time that does not exist or exists twice on a daylight-saving day is refused when typed (**Verified**, `bookingAdmin.test.ts`). |
| A7 | **Buffer, minimum notice, booking horizon** | Owner action required | Buffer applies on both sides of a consultation (**Verified**). |
| A8 | **Confirmation mode**: confirm at once, or wait for the owner | Owner action required | In "wait" mode the time is held for the visitor and the owner confirms or cancels. Both modes **Verified** (`booking.test.ts`, `bookingChanges.test.ts`). |
| A9 | **Cancellation and rescheduling rules** (may a customer ask? is the owner's approval needed? how close to the start? how long a proposal lives) | Owner action required | The defaults are *ask, and the owner answers*. **No policy text is on the site** and no cancellation fee exists; if one is offered it must be written and checked (B6). Behaviour **Verified** (`bookingChanges.test.ts`, 24 tests). |
| A10 | **Owner notification address** (`NOTIFY_TO`) | Owner action required | Without it bookings work and the owner is told nothing. That mailbox receives customers' names, addresses and project descriptions: treat it as part of the data's security (C6). |
| A11 | **E-mail language**: `NOTIFY_LANGUAGE` for the owner's messages | Owner action required | A customer's e-mails use the language the visitor booked in. **Verified** (`booking.test.ts`: all three languages). |
| A12 | **Notifications switches** ("A consultation is booked", "Confirm a booking to the visitor") | Owner action required | Both default **on**. Verified that each switch silences its messages (`bookingAdmin.test.ts`). |
| A13 | **Close finished consultations** (mark them completed or no show, or cancel) | Owner action required | Retention only deletes *finished* bookings. A booking that took place but was never closed stays until somebody closes it (see B2). |
| A14 | **Switch "Online booking" on** | Owner action required | **Last step.** Do it only after B, C and D are answered and the booking has been tried end to end in the target environment (E). It is the only thing that makes the page indexable, listed in the sitemap and offered from the footer, Contact, Services and FULL EXPERIENCE (**Verified**: `bookingSeo.test.ts`, `booking-journey.cjs` parts A, G, I). |

---

## B. Privacy and legal review

### What is implemented (technical)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| B-T1 | The privacy notice describes the booking data in HU / EN / NL: what is stored (name, e-mail, company, website, description, type, date, time, length, zone, related reference, status, history, consent time, address fingerprint, link fingerprints, private notes, e-mail log), why, retention, erasure | Verified | `src/content/privacy.ts`; `src/content/privacy.test.ts` (each kind of data in each language, in the same order; every column of the `bookings` table accounted for); `npm run i18n` (glossary, register, spelling); journey part I (the sections render in all three languages, no horizontal scroll, axe) |
| B-T2 | Retention does what the notice says: **no period is set by the code**; with `RETENTION_DAYS` unset **nothing** is deleted by age; with it set, bookings that are over (completed, cancelled, no show) are deleted that many days after their last change, with the old lines of the e-mail log; a booking still alive is never deleted by age | Verified | `server/test/bookingPrivacy.test.ts` (400 days pass with no period: nothing deleted; with a period: the three finished states go, the live one stays); `privacy.test.ts` (reads `config.ts`, `maintenance.ts`, `retention.ts`) |
| B-T3 | Erasure removes everything held about one e-mail address: bookings, notes, change requests, link fingerprints, the booking e-mails, and the same address's inquiries and quote requests; what stays is the history (reference, status, time; no person) | Verified | `bookingPrivacy.test.ts` reads **every table** after an erasure and finds none of the name, address, company, website, description, reason, private note or link; a second person's booking is untouched. It is run **by hand** by the operator (`npm run server:cli -- erase <e-mail>`); no page or endpoint lets a visitor do it (`privacy.test.ts`) |
| B-T4 | Link tokens: 256 random bits, only the SHA-256 stored, expiring, revocable, one booking each, never in a log line, a head tag, the title, an analytics event or browser storage | Verified | `bookingChanges.test.ts`; `bookingSeo.test.ts`; `src/booking/seo.test.ts`; journey part I (the secret leaves only for this site's own host when the language is changed; it is in no storage or cookie) |
| B-T5 | The owner's private notes are shown only in the administration: not on the customer's page, not in any e-mail | Verified | `bookingAdmin.test.ts`; `privacy.test.ts` (the only server file that reads the notes table is the administration's; the customer page, public API, mail module and templates do not mention it) |
| B-T6 | The network address is never stored or logged: a keyed hash (HMAC-SHA256 with the server secret, 128 bits) is stored with the booking; the plain address is used in memory for rate limiting | Verified | `bookingPrivacy.test.ts` (stored value equals the keyed hash, not a plain hash, not another key's; the address is in no row, no page, no e-mail, no log line). **Not verified in production**: behind Render and Cloudflare the socket address is the proxy's until `TRUST_PROXY` is set correctly (D5) |
| B-T7 | An e-mail "accepted" by the provider is never reported as delivered | Verified | `bookingPrivacy.test.ts` (rows end `accepted`); `privacy.test.ts` (the notice says it records acceptance, not arrival; only the signed provider webhook can set `delivered`) |
| B-T8 | The notice invents nothing legal: no legal basis, no guarantee, no processor agreement, no certification, no encryption claim, no retention number, no named e-mail provider | Verified | `privacy.test.ts` (patterns across all three languages, including the page's description) |

### What needs the owner or a lawyer (approval, not implementation)

| # | Item | Status | What to decide or check |
| --- | --- | --- | --- |
| B1 | **Approval of the privacy notice** | Owner action required | The notice describes what the code does and is **not legal advice**. A lawyer (or the owner, knowing their obligations) must read it, and add what only they can: who the data controller is, their contact details if required, the legal basis they rely on, international transfers, supervisory-authority information. None of that was written here. |
| B2 | **Retention period** (`RETENTION_DAYS`) | Owner action required | Unset keeps every booking until somebody deletes it (the server logs a warning at start-up in production). Choose a period with advice; it also applies to the e-mail log and to quote requests and inquiries. **A booking that is still `pending`/`confirmed` is never deleted by age**, so close past consultations (A13). Whether the variable is set on the host: **Not verified**. |
| B3 | **The daily housekeeping actually runs** | Not verified | It is a timer inside the web process that fires 24 hours after each start (`main.ts`); a host that restarts more often than daily may never run it (platform audit B-4). Check the host's log for the `maintenance` line, or run `npm run server:maintenance` on a schedule. |
| B4 | **Erasure and access requests: the owner's procedure** | Owner action required | The notice says the owner deletes by hand, not instantly, and asks the visitor to write via the Contact page. Decide: how a request is verified (anyone can type any e-mail address), how fast you answer, who runs the command, and that the host gives you a shell to run it (**Not verified**). |
| B5 | **Consent wording**: *"I understand that my details are used to arrange and carry out this consultation."* (and the Hungarian and Dutch versions) | Owner action required | A transparency sentence copied in spirit from the quote forms, with a link to the notice. Ask whether it fits the basis you rely on. |
| B6 | **Cancellation or rescheduling policy**, and any fee | Owner action required | None is configured and none is written; the customer page and e-mails promise nothing. If you offer one, write it, add it to the site, and have it checked against consumer law. Until then: **Not applicable** to the code. |
| B7 | **Data processors: confirm each one and what contract you have** | Owner action required | The notice names **Render** (hosting; the database lives on its server) and **Cloudflare** (network) from the platform audit's public probes, **not from the dashboards (Not verified)**; the **e-mail service** by role only (the code can use Resend or SMTP, and which one is live is not verified: audit E-3, E-5); **Google Drive** only "if backups are switched on" (**Not verified** whether they are). Name the e-mail provider if you want it named, confirm each contract or data-processing terms, and the region where the data is stored. The notice states no agreement and no region. |
| B8 | **Backups hold deleted data until they expire; Drive copies are not encrypted** | Owner action required | The notice says copies already made keep the data until they expire. Audit K-1 (no encryption before upload) and K-4 (an OAuth app in "Testing" loses its token after 7 days) are open. |
| B9 | **The notice's country paragraph** ("the site picks a language from the country of your connection, passed on by Cloudflare") | Owner action required | Existing text, not written for booking. The platform audit found the Worker that does this is **not in the request path on production** (Render answers `www`; audit F-7, I-4), so on production the paragraph may describe behaviour that is not live. Decide: enable it (`COUNTRY_HEADER` or put the Worker in front) or edit the paragraph. |
| B10 | **Native proofreading** of the new Hungarian, English and Dutch text (notice, booking pages, e-mails) | Owner action required | Spelling, glossary and register were checked by tooling only (`npm run i18n`: 0 errors, 0 unknown words); no native speaker has read it. |
| B11 | **Identity of the controller shown to visitors** | Owner action required | The notice points to the Contact page and shows the site's contact e-mail if one is configured. It names no person, company or address: that is yours to supply if the law asks for it. |

---

## C. E-mail readiness

Nothing here was tested against a real provider or a real mailbox. The platform audit of 2026-11-13 found the domain **without outbound-mail authentication** (no DKIM, SPF without a provider, DMARC monitor-only: finding **E-1**); nothing below says that has been fixed.

| # | Item | Status | Evidence / what to do |
| --- | --- | --- | --- |
| C1 | **Sender identity** (`EMAIL_FROM` on a domain the provider verified; `EMAIL_REPLY_TO`) | Owner action required | The server warns at start-up when `EMAIL_REPLY_TO` is missing. |
| C2 | **Provider configuration** (`EMAIL_PROVIDER=resend` with `EMAIL_API_KEY`, or SMTP) | Owner action required | The production provider is **not verified** (E-3). The code path for the recording and `file` providers is **Verified** (`bookingChanges.test.ts`, `booking-journey.cjs`). |
| C3 | **SPF** | Not verified | Not re-checked in this work. Audit E-1 (2026-11-13): SPF without a provider. Publish the provider's record in the domain's DNS and check it. |
| C4 | **DKIM** | Not verified | Audit E-1: none found. The provider shows the records to publish. |
| C5 | **DMARC** | Not verified | Audit E-2: monitor-only, no reports. Tighten only after SPF and DKIM pass. |
| C6 | **Owner notification mailbox** | Owner action required | Receives customer data (name, e-mail, company, description). Use a mailbox you control, secured. Cloudflare Email Routing is **inbound only**; the code treats it so (audit E-6) and it sends none of the booking e-mails (**Not applicable** to outgoing mail). |
| C7 | **Customer e-mail templates** (ten messages × three languages) | Verified (rendering) / Not verified (mail clients) | `bookingChanges.test.ts`, `bookingAdmin.test.ts`: the right language, the right time and zone, escaping of hostile input, no private notes, one message per event. **Not verified**: how Gmail, Outlook and Apple Mail draw them; spam placement. |
| C8 | **A test delivery in a controlled environment** | Owner action required | Administration → Notifications → *send the test message* to an address you control; then make one test booking and read all of its e-mails. The state should go `accepted`, and `delivered` only if the provider's webhook is set up. |
| C9 | **Webhook secret** (`EMAIL_WEBHOOK_SECRET`) | Owner action required | Without it messages are never shown as delivered or bounced (the server warns at start-up; audit E-4). |
| C10 | **`PUBLIC_URL`** is the real `https` origin | Owner action required | Customer e-mails carry no link without it, and an owner's proposal of a new time **cannot be sent** (refused, not sent without its link). Which host (apex or `www`) is canonical is audit I-1 (D9). |
| C11 | **Sending is on** (`EMAIL_ENABLED`) | Owner action required | With sending paused or no provider, nothing is queued; bookings still work. |

---

## D. Production infrastructure

All of these are **outstanding from the platform audit (PROMPT 19) unless a row says otherwise**; none was re-checked, because this work had no access to the dashboards.

| # | Item | Status | Evidence / what to do |
| --- | --- | --- | --- |
| D1 | **Persistent storage for the SQLite file** (audit **D-1**) | Not verified | Render → Disks: is a disk mounted at the folder of `DATABASE_PATH` (and `MEDIA_DIR`)? If not, **every deploy erases every booking.** The server warns about the media folder at start-up; confirm the database as well. |
| D2 | **Database backup and restore** | Owner action required | A restore drill on a scratch database passed on 2026-11-13 (`docs/audit/BACKUP_AND_RECOVERY.md`). Production backups: **Not verified** (Drive credentials, the OAuth app's status K-4, unencrypted copies K-1, no post-upload check K-2, no catch-up K-3). Take `npm run server:backup -- <file>` before the release that applies migration 0011. |
| D3 | **Migration status** | Not verified | `0011_consultation_booking.sql` applies at the next start (`MIGRATE_ON_START` default). It rebuilds `email_deliveries` (as 0007 and 0009 did); all existing rows are kept (**Verified** on fresh and seeded databases by the whole suite, not on a copy of production data). There is no automatic snapshot before a migration (audit D-3). |
| D4 | **Environment variables** | Not verified | Needed or relevant: `APP_SECRET` (at least 32 characters; the address fingerprints are keyed by it, so changing it makes new fingerprints differ from old ones), `PUBLIC_URL`, `EMAIL_*`, `NOTIFY_TO`, `NOTIFY_LANGUAGE`, `RETENTION_DAYS`, `CUSTOMER_LINK_DAYS`, `TRUST_PROXY`, `DATABASE_PATH`, `MEDIA_DIR`, `VITE_SITE_URL` (build time). **No variable was added by booking.** Values were never read; names only. |
| D5 | **Reverse proxy and `TRUST_PROXY`** (audit **B-1**, **B-7**) | Owner action required | With the default `0`, behind Render and Cloudflare every visitor looks like one address: the booking rate limit (6 per 15 minutes) would be shared by everybody, and the stored address fingerprint would be the proxy's. The server warns at start-up. The right number must be **measured**, not assumed. |
| D6 | **Rate-limit behaviour** | Verified (logic) / Not verified (production) | 6 bookings per 15 minutes per address, 20 wrong secrets per 15 minutes, 3 live bookings per e-mail address, 12 booking e-mails per recipient per day (**Verified**, `booking.test.ts`, `bookingChanges.test.ts`, `bookingAdmin.test.ts`). Limits live in memory: they reset at every restart and need **one** instance (audit B-2). |
| D7 | **HTTPS** | Not verified | The platform audit saw HTTPS, HSTS and a redirect from the public side on 2026-11-13; not re-probed. Check the certificate and Cloudflare's SSL mode (Full strict). |
| D8 | **Health and readiness** (`/api/health`, `/api/ready`) | Verified (locally) / Not verified (production) | Both exist and are tested locally; neither was called on production. `/api/ready` also reports the migration state. |
| D9 | **Canonical host** (audit **I-1**) | Owner action required | Canonicals, hreflang and the sitemap of the consultation pages follow `VITE_SITE_URL`; the audit found them pointing at the apex while `www` serves the content. Fix once for the whole site. |
| D10 | **The site is served by the Node server** | Owner action required | Whether the consultation page is indexable is decided **at request time by the backend** (an `X-Robots-Tag: noindex` header and a live sitemap while booking is closed; `bookingSeo.test.ts`). The build's own files say "indexable" and list the page in `dist/sitemap.xml`. A static host or Worker that serves `dist/` **without** the backend cannot know that booking is closed, and would let the page be indexed. Production serves it from Render (audit); keep it that way, or decide how else the closed state is told. |
| D11 | **A staging copy to try booking before the public sees it** (audit I-5) | Owner action required | There is none; every deploy is live. Booking opens only when the owner switches it on, so a deploy does not expose it, but the first real booking should not be the first test. |
| D12 | **Administration sign-in** (audit **B-3**) | Owner action required | Password only, on a public `/admin`. It now guards customers' personal data. Consider Cloudflare Access or a second factor. |
| D13 | **`npm run server:cli` is available on the host** | Not verified | Needed for erasure (B4) and a manual maintenance run (B3). |

---

## E. Final manual testing

Automated runs exist for most of this (Chrome only, a scratch backend, the `file` provider; results in [TEST_RESULTS.md](TEST_RESULTS.md)). That is **not** a manual test on the real site. Do each of these once, **in the environment you will open**, before switching booking on. The status is that of the *manual* check.

| # | Check | Status | Automated cover (this branch) |
| --- | --- | --- | --- |
| E1 | **Desktop**: the whole booking, type to confirmation | Owner action required | `booking-journey.cjs` at 1440 px (Chrome) |
| E2 | **Mobile**: the same on a real phone | Owner action required | the same journey at 390 px with touch emulation; no real device, no Safari, no tablet width |
| E3 | **Hungarian, English and Dutch**: words, dates, time zone line | Owner action required | journey part C in all three; the dates are read in the owner's zone whatever the browser's (`src/booking/booking.test.ts`) |
| E4 | **Customer booking**: confirmation page, the e-mail, the link in the e-mail | Owner action required | part C; real delivery is **Not verified** (C8) |
| E5 | **Customer asks to cancel** | Owner action required | part E and `bookingChanges.test.ts` |
| E6 | **Customer asks to change the time** (and a second customer asking for the same time) | Owner action required | part E; the held replacement time and the race are tested (`bookingChanges.test.ts`) |
| E7 | **Owner approves and owner declines** (and proposes a new time) | Owner action required | part F; `bookingChanges.test.ts` |
| E8 | **E-mail delivery**: every message arrives, in the right language, with a working link; none in spam | Owner action required | recording and `file` providers only. Needs C2 to C5 first. |
| E9 | **Time zone and daylight saving**: book across a clock change; a visitor in another zone sees the owner's zone named | Owner action required | engine, API and e-mail tests for 29 March 2026, 25 October 2026, 28 March 2027, 31 October 2027 (Budapest) and New York (`bookingAvailability.test.ts`, `bookingAdmin.test.ts`); the repeated-hour day is **not** exercised in a browser |
| E10 | **Accessibility**: keyboard only through the calendar and the form; a screen reader | Owner action required | axe (WCAG 2.2 AA and best practice) clean on every screen, in three languages, at both widths; the calendar's keyboard handling exists but was not hand-tested; no screen reader was used |
| E11 | **Privacy and security headers on the real host**: the customer page (`no-store`, `noindex, nofollow`, `no-referrer`), the closed and the open consultation page | Not verified | `bookingSeo.test.ts` and journey part I check them against the local server; check the production responses with a browser's network panel or `curl -I` |
| E12 | **The privacy notice, read as a visitor**, in each language | Owner action required | journey part I (renders, same facts in each language); proofreading is B10 |
| E13 | **Closed state**: with booking off, `/<lang>/consultation/` says it is unavailable, offers the Contact page, is not in `sitemap.xml`, and no footer or shop link offers booking | Not verified (on the real host) | Verified locally (`bookingSeo.test.ts`, journey parts A and G) |

---

## The order that is safe

1. Answer B and C; read the privacy notice with a lawyer (B1, B5, B7, B9).
2. Fix D1 (persistent disk), D2 (a backup you have restored once), D5 (`TRUST_PROXY`), D9 (canonical host).
3. Configure A1 to A13, **leaving booking switched off**.
4. Make test bookings in a copy of the real environment if you can (D11), or with booking opened for a short time and a test address you own (E).
5. Switch **Online booking** on (A14). Switch it off again at any time: the page is withdrawn from the index and the sitemap at once, existing bookings and their links keep working.
