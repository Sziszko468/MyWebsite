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
| not leaked | the API answers `Cache-Control: no-store`; the page is served `no-store`, `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer` by the Node server **and** in the build's `_headers` (and `_redirects` for a static host); the analytics tracker strips the secret from the page path; the request log names the route pattern, not the address |

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
| a keyed hash of the client address | `bookings.ip_hash` | abuse analysis; not reversible without the server's secret | with the booking |
| consent time | `bookings.consent_at` | that the visitor ticked the sentence | with the booking |
| the owner's private notes | `booking_notes` | the owner's own use | with the booking |
| secure links (hash only) | `booking_tokens` | the customer's page | deleted 30 days after they expire |
| e-mails (recipient, kind, state) | `email_deliveries` | the delivery log | the existing delivery retention; with the booking on erasure |
| history | `booking_events` | audit | **never holds a person**: references, statuses and times only; survives deletion of the booking |

* **Retention:** the existing daily maintenance task deletes finished bookings (`cancelled`, `completed`, `no_show`) older than `RETENTION_DAYS`; a booking that is still alive is never deleted by age. It runs only if the operator set the variable; this code does not choose a period.
* **Erasure on request:** `npm run server:cli -- erase <e-mail>` deletes the bookings of that address with their notes, links and e-mails, in one transaction.
* **Logs:** no name, address, description or secret is logged (`booking received` records only the status and whether it was a repeat). The administration's audit log records the action and the booking's *reference*.
* **No marketing:** booking never asks for, and is never conditional on, marketing consent; nothing about booking subscribes anyone to anything.

## Needs the owner's or a lawyer's review

None of this was decided by the code; none of it is legal advice.

1. **The consent sentence** on the form: *"I understand that my details are used to arrange and carry out this consultation."* (and its Hungarian and Dutch versions) mirrors the wording of the quote forms. Check that it fits the lawful basis you rely on.
2. **The privacy notice** (`src/content/privacy.ts`) was **not changed**. It should be reviewed to describe: the booking data above and its purpose; the retention period you choose (`RETENTION_DAYS`); the processors involved (the e-mail provider, the host, Cloudflare); that a keyed hash of the address is kept; how someone asks for their booking to be erased (today: the owner runs the erase command).
3. **A retention period** (`RETENTION_DAYS`) is the owner's decision; unset keeps everything.
4. **Cancellation and change rules**: the settings exist and default to *requests the owner answers*; no policy is written on the site. If you offer one, write it, and check it against consumer law where it applies.
5. **E-mail content:** the messages say nothing about price, place, the way the consultation takes place, a cancellation fee or an answer time, because none of those is configured. Do not add such a sentence without the setting behind it.

## Limits worth knowing

* The secret is in the page's address, like every magic link: the host's and Cloudflare's access logs may record it. It stops working at its expiry, and the owner can revoke it.
* Rate limits are in memory, per process.
* A person who has the link can use it (that is what a link is). Anyone with access to the recipient's mailbox can too.
* Browsers other than Chrome, and real devices, were not tested; see [TEST_RESULTS.md](TEST_RESULTS.md).
