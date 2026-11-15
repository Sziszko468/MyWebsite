# Consultation booking: security and privacy

A booking is private customer data (a name, an e-mail address, what someone wrote about their project, and when they will talk to the owner). This page says how it is protected, what the code does about abuse, and what only the owner or a lawyer can decide.

## The customer's secure link

| Property | How |
| --- | --- |
| unguessable | 256 random bits (`randomBytes(32)`, base64url, 43 characters) |
| stored safely | only the SHA-256 is in the database (`booking_tokens.token_hash`); a copy of the database opens nothing; the secret appears in no log line, no delivery row and no analytics event (tested) |
| scoped | a token opens **one booking** and nothing else. It is not a quotation token: separate table, no shared scope (a quote's status token at a booking address, and a booking token at the quote addresses, both answer 404; tested) |
| expiring | until `CUSTOMER_LINK_DAYS` (default 90) after the later of now and the end of the appointment; expired → `410 expired` |
| revocable | the administrator's "Revoke the customer's links" ends every link (`410 revoked`); a message written afterwards carries a new working link, because revoking ends what was sent, not the booking |
| per message | each e-mail that carries a link mints its own, at the moment it is written (nothing in the outbox holds a secret); earlier links keep working until they expire or are revoked |
| rate-limited | an unknown or malformed token costs the asker: after 20 misses in 15 minutes from one address the answer is `429`; known tokens use the `customer` limit (90/min) |
| same answer | unknown and malformed tokens get the same `404` and the same words; only a link that **was** real says why it no longer works |
| not leaked | the API answers `Cache-Control: no-store`; the page is served `no-store`, `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer` by the Node server **and** in the build's `_headers` (and `_redirects` for a static host); the page's own head says `noindex, nofollow` with no canonical address, no alternates and no structured data; the analytics tracker strips the secret from the page path; the request log names the route pattern (`static`), not the address; the secret is in no title, head tag, browser storage or cookie; changing the language keeps it in the address and sends it to no other host (all tested, see "Review of 2026-11-15") |

What a customer can do with a link is **requests** by default: cancelling or moving a booking asks the owner (`approvalRequired`); a move holds the replacement slot but changes nothing until the owner agrees. If the owner switches approval off, the same actions are carried out at once. Nothing automatic happens on opening a link (every action is a `POST` from the page).

Nothing in a link, a page or an e-mail is a reference that can be guessed: **no public route accepts a reference, an id or an e-mail address**; a test tries all of them. References (`BK-2026-000001`) are sequential, are only for people to read out, and are not secrets.

## Abuse and spam

| Control | Value |
| --- | --- |
| booking form | 6 per 15 minutes per client address (`429` with `Retry-After`; the page says so in the visitor's language) |
| free-time and configuration reads | 180 per minute per address |
| live bookings per e-mail address | at most 3 that are still ahead of us (`422 tooMany` on the e-mail field) |
| booking e-mails per recipient | at most 12 a day (a stranger's address cannot be written to without end) |
| hidden field | a filled-in `nickname` is refused (`spam_suspected`); the page never shows it to a person or a screen reader |
| links in the description | more than 3 refused |
| duplicate submission | idempotency key: the same submission answers with the booking it made; no second booking, no second e-mail |
| size | the existing JSON body limit (64 KB), name ≤ 100, company ≤ 120, website ≤ 200, description ≤ 1500, reference ≤ 40, message ≤ 600 characters; control characters and direction overrides removed |
| global | the existing 600 requests per minute ceiling |

Input is parsed by an allow-list (`Fields`): only the named fields are read; each is checked on the server whatever the page checked. E-mail addresses are normalised (lower case) and validated; website addresses must be `http`/`https` with a real host (`javascript:` is refused; tested).

**Known limit (not built):** the address is not verified before a time is held. Someone can book with another person's address (that person then receives the confirmation, with a link that lets them cancel) or, with many addresses, hold many slots. What limits it: the rate limit, the three-live-bookings limit, the owner's option to confirm each booking (`pending` bookings are visible and cancellable at once), and the audit trail. If it becomes a problem, the natural next step is a confirmation link in the first e-mail before the booking becomes `confirmed`.

## Cross-site and injection

* All visitor-typed text is rendered as **text**: React escapes it on the pages and in the administration; the e-mail templates build HTML only through the escaping `html` tag (tested with `<script>`, `<img onerror>` and `"><svg onload>`; the subject lines hold no line breaks). The description is shown with `white-space: pre-wrap`, never as markup.
* SQL is parameterised; the one dynamic `UPDATE` builds column names from code constants only (the repository's static SQL test still passes).
* Administration routes need a session, the CSRF token and a same-origin request (the existing gates); an editor cannot change the settings, types or hours (`403`; tested). Nothing under `/api/admin` answers CORS.
* `Content-Security-Policy` is unchanged: no inline script or style was added.

## What is stored, and for how long

| Data | Where | Purpose | Kept |
| --- | --- | --- | --- |
| name, e-mail, company, website, description | `bookings` | to arrange and carry out the consultation | until the booking is over **and** `RETENTION_DAYS` has passed (if the operator set it; unset keeps everything); or until an erasure request |
| the type, the start and end instants (UTC), the scheduling zone, the language, the status, the related reference the visitor typed and the quote request it matched (only when the address is the same) | `bookings` | the booking itself | with the booking |
| the reason a visitor writes when asking to cancel or move; the owner's note with a decision or a proposal | `booking_changes.message`, `bookings.cancellation_note` | the conversation about a change | with the booking |
| a keyed hash of the client address (HMAC-SHA256 with `APP_SECRET`, 128 bits) | `bookings.ip_hash` | recognising abuse afterwards; the address itself is used only in memory for the rate limit and is in no row and no log | with the booking |
| the browser's submission key and a SHA-256 of *type, time, e-mail* | `bookings.idempotency_key`, `request_hash` | a double click makes one booking | with the booking |
| consent time | `bookings.consent_at` | that the visitor ticked the sentence | with the booking |
| the owner's private notes | `booking_notes` | the owner's own use; read only by the administration | with the booking |
| secure links (hash only) | `booking_tokens` | the customer's page | the hash is deleted about a month after the link expires, whether or not a retention period is set |
| e-mails (recipient, kind, language, state, attempts, the provider's error, and the owner's optional note to the customer) | `email_deliveries` | the delivery log; **not** the subject or the body | deleted by age (handled lines only) when `RETENTION_DAYS` is set; with the booking on erasure |
| history | `booking_events` | audit | **never holds a person**: references, statuses and times only; survives deletion of the booking |
| the administrator's actions | the audit log | accountability | the action and the booking's *reference*, no personal text |

* **Retention:** the existing daily maintenance task (a timer that fires 24 hours after each start of the server, or `npm run server:maintenance` by hand) deletes finished bookings (`cancelled`, `completed`, `no_show`) whose last change is older than `RETENTION_DAYS`, and the old handled lines of the e-mail log. A booking that is still alive (`pending`, `confirmed`, `reschedule_requested`, `rescheduled`) is never deleted by age, **so a consultation that took place has to be marked completed or no show (or cancelled)** before retention reaches it. It runs only if the operator set the variable; **this code does not choose a period**, and the privacy notice states none. Tested: with nothing set, 400 days pass and nothing is deleted (`server/test/bookingPrivacy.test.ts`).
* **Erasure on request:** `npm run server:cli -- erase <e-mail>` deletes, in one transaction, the bookings of that address with their notes, change requests, link fingerprints and booking e-mails, and the same address's inquiries and quote requests. It is run **by hand** by whoever operates the server; no page or endpoint lets a visitor do it, and the notice says it is neither immediate nor automatic. Tested by reading **every table** afterwards: nothing of the person is left except the history lines (`bookingPrivacy.test.ts`). It does **not** reach backup copies already made (the optional Google Drive backup keeps dated copies for `BACKUP_RETENTION_DAYS`, default 30, and they are not encrypted, platform audit K-1).
* **Logs:** no name, address, description or secret is logged (`booking received` records only the status and whether it was a repeat). The administration's audit log records the action and the booking's *reference*.
* **No marketing:** booking never asks for, and is never conditional on, marketing consent; nothing about booking subscribes anyone to anything.

## Needs the owner's or a lawyer's review

None of this was decided by the code; none of it is legal advice.

1. **The consent sentence** on the form: *"I understand that my details are used to arrange and carry out this consultation."* (and its Hungarian and Dutch versions) mirrors the wording of the quote forms. Check that it fits the lawful basis you rely on.
2. **The privacy notice** (`src/content/privacy.ts`) was updated in PROMPT 24.1 to describe the booking data above and its purpose, the secure link, the private notes, the e-mails and what their log records, the retention rule, the erasure procedure and the processors (Render, Cloudflare, the owner's e-mail service, optional Google Drive backups). It is a description of what the code does, **not legal advice**, and it deliberately says nothing the owner must supply: who the controller is, the legal basis, the retention period, the e-mail provider's name, the region, the contracts. Those are in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) (B1, B2, B7).
3. **A retention period** (`RETENTION_DAYS`) is the owner's decision; unset keeps everything (the server warns at start-up in production).
4. **Cancellation and change rules**: the settings exist and default to *requests the owner answers*; no policy is written on the site. If you offer one, write it, and check it against consumer law where it applies.
5. **E-mail content:** the messages say nothing about price, place, the way the consultation takes place, a cancellation fee or an answer time, because none of those is configured. Do not add such a sentence without the setting behind it.

## Review of 2026-11-15 (PROMPT 24.1)

A second pass over the implementation against the brief's checklist. Everything below was **run on this branch** (a throw-away database or a scratch backend; nothing was deployed, no production setting was read or changed, no real e-mail was sent). Each row names the test that holds it.

| Control | Result | Held by |
| --- | --- | --- |
| Token hashing and expiry | Only the SHA-256 is stored; the column holds no plain token; expiry is the later of now and the appointment's end, plus `CUSTOMER_LINK_DAYS`; expired answers `410` | `bookingChanges.test.ts`; `privacy.test.ts` (the schema has `token_hash` and no `token`) |
| Token revocation | "Revoke the customer's links" ends every link (`410 revoked`); a message written afterwards carries a working new one | `bookingChanges.test.ts` |
| Customer ownership boundaries | A link opens exactly one booking; a quote's status token and a booking token do not open each other's pages; no public route accepts a reference, an id or an e-mail address | `bookingChanges.test.ts`, `booking.test.ts` |
| Admin authentication and CSRF | No session, no data; every change needs the CSRF token and a same-origin request; an editor cannot change types, hours or settings | `bookingAdmin.test.ts` |
| Rate limits | 6 bookings per 15 minutes, 20 wrong secrets per 15 minutes, 3 live bookings and 12 booking e-mails a day per address. In memory, per process, and **wrong behind a proxy until `TRUST_PROXY` is set** (platform audit B-1, B-2) | `booking.test.ts`, `bookingChanges.test.ts`, `bookingAdmin.test.ts` |
| Idempotent submission | The same submission answers with the booking it made; a different one under the same key is refused | `booking.test.ts` |
| Concurrent booking | Ten simultaneous requests for one time make one booking; two real server processes on one database file, eight requests, one booking; the overlap triggers refuse SQL written around the application | `booking.test.ts`, `bookingProcess.test.ts` |
| Private notes | Read in one server file (the administration's); not loaded by the customer page, the public API, the mail module or the templates; not in any e-mail or customer page | `bookingAdmin.test.ts`; `privacy.test.ts` |
| Secure response headers | The customer page: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, the same for a real and a made-up secret (the page is an oracle for nothing); the API: `no-store` | `bookingSeo.test.ts`; `src/booking/booking.test.ts` (the static host's `_headers`); `check:seo` (the built `_headers` and `_redirects`); journey parts E and I |
| Logging and analytics redaction | The secret and the person are in no log line; the analytics page path is stripped to `/consultation/booking`; an event carries only an id, a small number or a yes/no | `bookingChanges.test.ts`, `bookingSeo.test.ts`, `src/booking/seo.test.ts` |
| Retention and erasure | As described above, with the notice held to the code | `bookingPrivacy.test.ts`; `privacy.test.ts` |
| The address fingerprint | A keyed hash, not a plain one, not the address; not in the administration's view, the customer's page, an e-mail or a log | `bookingPrivacy.test.ts` |
| "Accepted" is not "delivered" | A message the provider took is `accepted`; only the provider's signed webhook can make it `delivered` | `bookingPrivacy.test.ts`; `privacy.test.ts` |

**Findings of this pass** (none weakens an existing protection; none needed a change to the booking's business rules):

1. **Fixed: the customer's page said `noindex, follow` in its own head** while its header said `noindex, nofollow`. It now says `noindex, nofollow` in the head too (also the quote and request status pages, which are private in the same way).
2. **Fixed: the closed public page was withdrawn by its header only** and by language: the page's `X-Robots-Tag` asked one language, the sitemap asked all three. They now ask one question (`consultationIndexable`), and the page switches its own head to `noindex` (no canonical address, alternates or structured data) as soon as it learns booking is closed.
3. **Fixed: the privacy notice did not mention booking at all**, and its description said the site sets no cookies (it sets one, `cc_lang`).
4. **Found, not a fault: the booking's SHA-256 submission fingerprint is unkeyed** (`type + time + e-mail`). The e-mail is stored in clear in the same row, so it exposes nothing more while the booking exists; it is deleted with it. It is now named in the notice.
5. **Found, documented: the e-mail log keeps the owner's optional note** (a cancellation message, a decision, a proposal's note) on the message row, not the message text. Said in the notice and above.
6. **Found, documented: a consultation that took place but is never closed is never deleted by age.** An operations matter (A13 in the checklist), not a code change.
7. **Found, documented: the housekeeping timer starts at each server start.** A host that restarts more often than daily may never run it (platform audit B-4).
8. **Limits that cannot be removed without production access:** whether the database is on a persistent disk (D-1), whether `TRUST_PROXY` is right (B-1), the e-mail domain's SPF, DKIM and DMARC (E-1), whether Google Drive backups are on and whether the OAuth app keeps its token (K-4), the unencrypted backups (K-1), and whether the site is served by the Node server on production (the closed state's header and the live sitemap exist only there).

## Limits worth knowing

* The secret is in the page's address, like every magic link: the host's and Cloudflare's access logs may record it. It stops working at its expiry, and the owner can revoke it. The privacy notice says so.
* Rate limits are in memory, per process.
* A static host or Worker that serves `dist/` without the backend cannot tell that booking is closed: the build's files say the consultation page is indexable and list it. The closed state is told by the backend (header and live sitemap).
* A person who has the link can use it (that is what a link is). Anyone with access to the recipient's mailbox can too.
* Browsers other than Chrome, and real devices, were not tested; see [TEST_RESULTS.md](TEST_RESULTS.md).
