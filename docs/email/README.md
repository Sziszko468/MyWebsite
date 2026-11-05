# E-mail (PROMPT 14)

How the website receives and sends e-mail, what was built in the backend and the administration, what **you** have to do outside this repository (Cloudflare, the provider, DNS), and what has and has not been verified. Read §12 before relying on any of it: **nothing outside this repository was touched** — no Cloudflare account, no provider account, no DNS record, no real e-mail was available to this work.

Contents: 1 Architecture · 2 The provider and why · 3 Addresses · 4 The backend · 5 Workflows and confirmations · 6 Templates · 7 The webhook · 8 The administration · 9 Configuration · 10 Cloudflare Email Routing guide · 11 DNS checklist · 12 Tests and what was not verified · 13 Production checklist · 14 Security and privacy

## 1. Architecture

Two independent paths that share only the domain:

```
INCOMING                                              OUTGOING
visitor/anyone ──► hello@domain.hu                    website form ──► backend (stores the request first)
                       │ MX → Cloudflare                                   │ email_deliveries row (the outbox)
                       ▼                                                   ▼
              Cloudflare Email Routing  ──forward──►  EmailService/Notifier ──► Mailer (provider interface)
              (a forwarding rule + a verified                                        │ HTTPS API, idempotency key
               destination mailbox)                                                  ▼
                       │                                                     Resend (transactional provider)
                       ▼                                                             │ signed webhooks
              the owner's existing inbox                                             ▼
                                                                          POST /api/webhooks/email  ─► delivered / bounced
```

- **Incoming** is only forwarding. Cloudflare Email Routing is **not** a mailbox and **not** an outgoing mail server; it is never used to send. Nothing in this repository talks to it except an optional read-only status check (§8).
- **Outgoing** is the backend's outbox (`server/src/modules/notifications/`): a stored request is answered first, its e-mails are queued and sent in the background through a provider interface (`Mailer`), and what the provider later reports comes back through a signed webhook. Storing a request and sending its e-mails are separate operations; a failure of the second never reaches the visitor and never loses the first.
- **Nothing new was added as infrastructure:** no queue service, no second backend, no scheduler. The outbox is a table in the existing SQLite database processed by the existing process (trade-off in §4).

## 2. The provider and why

Chosen: **Resend**, over its HTTPS API, behind the provider interface (`Mailer`, `mailer.ts`), so changing provider is a change in one adapter (`resend.ts`), not in the features. SMTP (any provider's relay) and a development "file" provider remain.

Compared on what the brief asked, with only what could be read from each provider's own documentation on **2026-11-04** (anything not read is marked as such):

| | Resend | Postmark | Brevo |
| --- | --- | --- | --- |
| Webhook authenticity | **Signed** (Svix scheme: HMAC-SHA256 over `id.timestamp.body`, secret `whsec_…`) | **No HMAC signature** ("does not currently support HMAC webhook signature verification"); basic auth in the URL or an IP allow-list | Not stated on the page read (not verified) |
| Delivery events | sent, delivered, delivery_delayed, bounced, complained, failed, suppressed (+ opened, clicked, received, scheduled) | Delivery, Bounce, Spam complaint, Open, Click, Subscription change | Sent, Delivered, Deferred, Soft/Hard bounce, Spam, Blocked, Invalid e-mail, Error, … |
| Idempotent sending | `Idempotency-Key` header, 1–256 characters, kept 24 h | not checked | not checked |
| Domain authentication | DKIM (`resend._domainkey`) + SPF/return-path on a `send` subdomain; domain status readable via API | not checked | not checked |
| Free tier | 3,000 / month, 100 / day, 3 domains, 1 webhook endpoint, 30-day data retention | 100 / month | not checked |
| First paid plan | $20 / month, 50,000 / month, 5 webhook endpoints | $15 / month, 10,000 / month | not checked |
| Plain HTTPS API, no SDK needed | yes | yes (not checked in detail) | yes (not checked in detail) |

Why Resend: it is the only one of the three, from what was read, that signs its webhooks (a hard requirement of the brief: "verify webhook signatures, reject unauthorized requests"), it has idempotency keys (the brief asks to prevent duplicate e-mails), a small documented HTTPS API that fits the project's rule of **no runtime dependencies** (the adapter is `fetch` and about 100 lines), and a free tier far above a portfolio's volume. The cost of the free tier is the **100-per-day** limit (a burst of messages plus confirmations could reach it: the provider's `daily_quota_exceeded` is handled as a failure an administrator can retry later) and **one webhook endpoint**.

Caveats to decide on, not assumed: the provider is a **processor of visitors' addresses and message content** (§14); its sending **region** is chosen when the domain is added in its dashboard (the API shows a `region` field; the list of regions was not read); Brevo was not evaluated beyond its event list, and a better fit may exist for other needs.

## 3. Addresses

| Address | Role | Where it is set |
| --- | --- | --- |
| `hello@domain.hu` | The **public** contact address. Incoming only: forwarded by Cloudflare to the owner's inbox. Also the `Reply-To` of every e-mail meant for a customer, so a customer's reply reaches the owner without the owner's private address ever being shown. | `EMAIL_REPLY_TO`; the rule in Cloudflare |
| `notifications@domain.hu` | The authenticated **sender** of every automated message (`From`). It must be on the domain verified with the provider. | `EMAIL_FROM` |
| the owner's private inbox | Receives the notifications of new messages and quote requests, and is the destination of the Cloudflare rule. **Never** appears in an e-mail to a customer, an answer to a browser, a log or this repository. | `NOTIFY_TO` (server-side only); the Cloudflare destination |
| `noreply@` | **Not used.** A reply address nobody reads discourages exactly what the site wants; `Reply-To: hello@` is better. | — |

Rules the code enforces (and tests): a visitor's address is **never** the `From`; for the owner's notification the visitor is the `Reply-To`; for a customer's e-mail the `Reply-To` is the public address (never `NOTIFY_TO`; before this work a customer's `Reply-To` was the owner's private address — fixed); the recipient of every message comes from configuration or the stored record, never from a request (a test sends `to`, `cc`, `bcc`, `notify` fields to the contact endpoint and checks they are ignored); a header value with a line break is refused.

## 4. The backend

Files (all under `server/src/modules/notifications/` unless noted):

| File | Does |
| --- | --- |
| `mailer.ts` | The provider interface and the choice of adapter (`resend`, `smtp`, `file`, none; paused with `EMAIL_ENABLED=false`) |
| `resend.ts` | The Resend adapter: one `POST /emails`, the key in a header, an idempotency key, tags, a timeout; sorts every answer into "may pass" or "will not pass" |
| `notifier.ts` | The outbox: queues, sends, retries, records; the owner's notification, the customer confirmation, the test message, the administrator's status e-mail |
| `templates.ts` | The HU/EN/NL messages: subject, preview text, HTML, plain text (separate from the business logic) |
| `webhook.ts`, `routes.ts` | `POST /api/webhooks/email`: signature, idempotency, order |
| `checks.ts` | What the administration may claim about the set-up (§8) |
| `admin.ts` | The administration's API for all of it |
| `db/migrations/0003_email_system.sql` | New states, the unique-per-submission rule, the events table |

**States of a message** (`email_deliveries.status`), and what the administration calls them:

| Stored | Shown as | Meaning | Set by |
| --- | --- | --- | --- |
| `pending` | Waiting (or **Retrying** when it already failed once and waits for its next attempt) | Queued | the request / a retry |
| `sending` | Processing | An attempt is running | the outbox |
| `accepted` | **Sent** | The provider accepted the message. All that is known. | the provider's `201` (or its `email.sent` event) |
| `delivered` | **Delivered** | The provider reported it handed the message to the recipient's server | **only** a verified webhook event |
| `bounced`, `complained` | Bounced, Marked as spam | The recipient's server refused it for good / the recipient complained | only a verified webhook event |
| `failed` | Failed | Gave up: a permanent refusal, or the attempts ran out | the outbox (or a provider failure event) |
| `cancelled` | Cancelled | The record it was about was removed | the outbox |

"Sent" is never "delivered": with no webhook configured no message ever becomes `delivered`, and the administration says so.

**Retries.** A failure that may pass (the provider's 5xx, a busy moment, a network error, a timeout, a request still in progress under the same key) is tried again after 1, 5, 30, 120, 720 minutes; the number of tries is `EMAIL_MAX_ATTEMPTS` (default 5). A failure that will not pass (the key or sender refused, an address refused, a used-up quota) fails at once: waiting cannot help, an administrator has to. Every failure keeps a **kind** (`auth`, `quota`, `rate_limited`, `rejected`, `unavailable`, `timeout`, `network`, `conflict`, `bounced`, `complained`, `suppressed`) the administration words in the administrator's language, plus the provider's own reason with addresses and tokens masked. Exponential backoff is a growing schedule rather than a formula; the numbers are in `notifier.ts`.

**No duplicates.** Four layers: (1) the request itself is de-duplicated (the same message sent twice stores once and queues nothing the second time); (2) the database refuses a second owner notification or a second confirmation for the same record (a partial unique index); (3) every send carries an `Idempotency-Key` of `<message id>-<generation>`, the same for every automatic retry (so a message the provider received whose answer we never saw is not sent again) and a new generation only when an administrator retries a message that failed; (4) a provider event that beats the answer to our own send cannot take the message back a step (§7).

**The trade-off.** The outbox is a table plus a timer in the one process, not a message queue: right for a portfolio's volume, restart-safe (a message left "processing" by a crash is picked up again), with nothing extra to run or pay for. It would not survive a second server instance (the backend README's "not verified" list says the same of the rate limiter).

## 5. Workflows and confirmations

**Contact form.** Validated in the browser, validated again and checked for abuse on the server (rate limit, honeypot, link count, duplicate detection, consent) → the inquiry is stored → the owner's notification is queued (and, if switched on, the customer's confirmation) → the answer to the visitor says *received* (201, or 200 for a repeat) → the outbox sends in the background → the result is recorded on the delivery. If the provider is down or the key is wrong the visitor still sees "received" (it was) and the administrator sees the failed delivery and can send it again; a test proves the stored message and the failed delivery coexist.

**Quote request.** The same, with the quote's stored items and the **prices the server snapshotted** — the e-mail carries no price a request could have set, no estimate and no invented figure. The owner's e-mail lists the customer, services and packages, the description, objective, timing, requirements, reference notes and reference number. *Budget:* the quote builder collects no budget, so none is shown; nothing is invented.

**Confirmations to the person who wrote** (contact and quote). Optional, **off until an administrator turns them on** in the administration (Notifications → What is sent), separately for messages and for quote requests. Rules, enforced by the code and tests:

- once per submission (the database refuses a second);
- at most **3 per address per day** (the site must not be usable to write to someone else's inbox; the per-client limits of the forms apply first);
- in the language of the submitted form (the website sets it from its active language; Hungarian only when a form arrives with none);
- they say that the message arrived, repeat only what the visitor sent (reference, time, subject or the chosen parts), and promise **nothing**: no answer time, no price, no appointment, no acceptance. A sentence about timing is added **only if an administrator wrote one** for that language (≤200 characters, in the administration); empty means silence about timing;
- `If you did not send this message, you can ignore this e-mail` closes every confirmation (the address was typed by a stranger);
- sent from the verified sender, answered at the public address.

The Hungarian text of the contact confirmation is the one in the brief: *Köszönjük, hogy felvetted velünk a kapcsolatot! Üzeneted sikeresen megérkezett. Hamarosan áttekintjük a megkeresésedet.* The English and Dutch versions say the same.

## 6. Templates

Five kinds × three languages (hu, en, nl), each with **subject, preview text (hidden preheader), HTML and plain text**: new inquiry and new quote request (to the owner), the two confirmations (to the customer), the administrator's status e-mail, and a test message. Values from a visitor go through one escaping function (HTML part) or are printed as text (plain part): a name or message can never become markup (a test renders a hostile name in all three languages and inspects every tag).

Design: Carbon Black header with a Racing Red rule, Warm Paper background, white card, one 600-pixel column that shrinks to the screen (`width:100%; max-width:600px`), Arial/Helvetica (a web font would not load in most mail clients), inline styles on tables (the only layout mail clients agree on), 15 px body text and every label at 6.9:1 contrast or better against its background (computed: carbon on white 19.7:1, the muted grey on white 6.9:1, paper on carbon 17.3:1), no JavaScript, no animation, **no image, no web font, no external resource at all**: it reads the same with images blocked because there are none. The brand name in the header is `BRAND_NAME`. The templates are in `templates.ts`, away from the business logic; the words are in one table per language.

Not done: rendering in real mail clients (Gmail, Outlook, Apple Mail, mobile apps). It was checked structurally (tags, attributes, widths, text alternative, preheader) and not by looking at it in those clients; see §12.

## 7. The webhook

`POST /api/webhooks/email` — the provider reports what happened to a message. Set it up in the provider's dashboard (Webhooks → add endpoint: `https://<your API host>/api/webhooks/email`; events: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`, `email.suppressed`; **not** opens or clicks, which would track recipients) and copy the signing secret to `EMAIL_WEBHOOK_SECRET`.

- **Signature.** Svix scheme: `svix-id`, `svix-timestamp`, `svix-signature` headers; the signed text is `id.timestamp.rawBody`; the key is the base64 part of the `whsec_…` secret; HMAC-SHA256, compared in constant time; several signatures are allowed (secret rotation); the timestamp must be within 5 minutes of the server's clock either way (replay). A request that fails any of it is a **401** and changes nothing; with no `EMAIL_WEBHOOK_SECRET` the address answers **404** (it does not exist). The body is read raw and limited.
- **Idempotent.** The event's own id is the primary key of `email_events`; the same event again is answered `200 {duplicate:true}` and applied once.
- **Order.** Events are applied by importance, not by arrival: good news (`sent`, `delivered`) may lift a message that is still waiting, **or that we gave up on** (the provider did get it after all); bad news (`bounced`, `complained`, `failed`) may follow anything that is not already bad news, and a complaint may follow a delivery; an older `sent` cannot undo `delivered`; `delivered` after `bounced` does nothing; a cancelled message stays cancelled. A delay changes no state.
- **Matching.** Every message carries a tag with our delivery id; an event is matched by it first (so an event that arrives before the answer to our own request still finds its message) and then by the provider's message id; one whose label is ours but whose id is another message's is not applied. An event for no message of ours is recorded as `unmatched` and answered 200 so the provider stops retrying it.
- **Minimal.** `email_events` keeps the event id, type, the times, which message, and the outcome — no address, no subject, no text; a bounce's reason (provider text) is masked of addresses and stored on the delivery, not on the event.

## 8. The administration

**Notifications** (`/admin/notifications`):

- **E-mail**: provider, whether a sender, a public contact address, an owner address and the webhook secret are *set* (never their values, except the public address), paused or not.
- **Set-up checks** (administrators; "Check now"): nine lines, each the answer to a question, each with the time it was asked. `Verified` only when an answer proved it; `Not verified` when it proved the opposite; `Cannot be checked` when it could not be asked (a restricted key, a failed lookup, no Cloudflare access, nothing sent yet) — **never "fine" by default**. Before the first check since the server started it says "not checked".

  | Line | Asked of | Verified when |
  | --- | --- | --- |
  | Sending provider | the provider's API (`GET /domains`) | it accepts the key (a sending-only key cannot be asked: *cannot be checked*; the safest key is sending-only) |
  | Sending domain at the provider | the provider's API | the provider itself reports the domain `verified` |
  | DKIM key | public DNS (`resend._domainkey.<domain>`) | a key is published |
  | SPF record | public DNS (the domain) | **exactly one** `v=spf1` record |
  | DMARC policy | public DNS (`_dmarc.<domain>`) | exactly one record with a valid `p=` (and says plainly when it is `p=none`: monitoring only) |
  | Incoming: Cloudflare routing records | public DNS (MX of the public address's domain) | all MX hosts end in `.mx.cloudflare.net` (another mail host there is reported as a conflict) |
  | Incoming: forwarding rule and mailbox | Cloudflare's API, **read-only** (optional; `CLOUDFLARE_*`) | routing is `ready`, an enabled rule forwards the public address, and the destination mailbox has a verified date. Without access: *cannot be checked* |
  | Delivery notifications | the database | the secret is set **and** a signed event has really arrived |
  | Sending works | the database | the most recent finished message was accepted (a failed one makes it *not verified*) |

  The findings are the server's own English sentences (they name records of the domain); the rest of the screen is Hungarian or English.
- **Send a test e-mail** (administrators): one message to `NOTIFY_TO`; it proves sending, and "Delivered" appears for it only if the webhook confirms.
- **What is sent**: switches for the owner's two notifications and the two confirmations (off by default), and the optional timing sentence per language.
- **Delivery log**: every message with its type, the related inquiry or quote request (a link, by reference), recipient, created time, state (Waiting, Retrying, Processing, Sent, Delivered, Bounced, Marked as spam, Failed, Cancelled), the failure in words and the provider's masked reason, when it was delivered, attempts; filter by state or "problems"; 20 per page; **Send again** for a failed message (editors and administrators). A bounced or complained message cannot be retried like a failed one: the provider refused it for good.

Never shown in the browser: the API key, the webhook secret, the Cloudflare token, the destination mailbox. A test searches every answer and every log line for them.

## 9. Configuration

Set in the **server's environment**; `.env.example` lists every variable with a placeholder and no real value; `.env` is git-ignored. Production values belong in the host's secret store.

| Variable | Dev | Production | Meaning |
| --- | --- | --- | --- |
| `EMAIL_PROVIDER` | `file` (writes `.eml` files) or `resend` against a test key | `resend` | `none`, `resend`, `smtp`, `file` (refused in production) |
| `EMAIL_ENABLED` | `true` | `false` until §13 is done, then `true` | `false` = configured but paused: nothing queued or sent |
| `EMAIL_API_KEY` | a test key | a **send-only** key limited to the verified domain | secret; required for `resend` |
| `EMAIL_API_URL` | empty (or a local test server) | empty (`https://api.resend.com`) | https required in production |
| `EMAIL_WEBHOOK_SECRET` | optional | the webhook's `whsec_…` secret | without it no message is ever "delivered" |
| `EMAIL_FROM` | any | `Name <notifications@domain.hu>` on the verified domain | the sender |
| `EMAIL_REPLY_TO` | optional | `hello@domain.hu` | the public address customers reply to |
| `NOTIFY_TO`, `NOTIFY_LANGUAGE` | your test inbox, `hu` | the owner's private inbox, the owner's language | who is told about new requests |
| `BRAND_NAME` | any | the site's name | header of every e-mail |
| `EMAIL_MAX_ATTEMPTS` | `5` | `5` | tries before "failed" |
| `CLOUDFLARE_API_TOKEN`, `_ZONE_ID`, `_ACCOUNT_ID` | — | optional, all three, **read-only** token | lets the checks see routing |

The existing names were kept where they already did the job (`EMAIL_FROM` is the sender with its display name, `NOTIFY_TO` is the administrator destination) instead of adding `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` and `ADMIN_NOTIFICATION_EMAIL`. The server refuses to start with a bad value and says which (a key that looks wrong, a webhook secret that is not `whsec_…`, a plain-http API in production, one or two of the three Cloudflare values) and logs a warning for a provider without a webhook secret or without a public reply address.

## 10. Cloudflare Email Routing: what to do (all manual, none of it done)

From Cloudflare's documentation (read 2026-11-04). The domain must use **Cloudflare DNS** (for a `.hu` domain that means pointing its nameservers at Cloudflare at the registrar).

1. Cloudflare dashboard → the domain → **Email Routing** (the docs name the path *Compute › Email Service › Email Routing*) → **Onboard Domain**. Review the DNS records Cloudflare will add before pressing Done (§11).
2. **Destination address**: add the owner's existing inbox under *Destination addresses* and click the link in the verification e-mail Cloudflare sends there. A rule cannot use an address that is not verified.
3. **Routing rule**: *Create routing rule* → custom address `hello` on the domain → action *Send to an email* → the verified destination → Save.
4. **Conflicts.** Cloudflare Email Routing **cannot work next to another provider's MX records** (onboarding stops with "Non-Cloudflare MX records exist", error 2008): if the domain already receives mail somewhere, *add the destination and the rule first, delete the old MX records, enable routing at once*, and keep the old mailbox until routing works. An existing **SPF** record must be **merged** into one (`v=spf1 include:_spf.mx.cloudflare.net … ~all`; the 10-lookup limit applies); DKIM selectors must differ.
5. **Test** by sending to `hello@domain.hu` **from a different account than the destination** (some providers discard mail that appears to come from the same account); look in the destination inbox and its spam folder. Changes usually take 5–15 minutes, up to 24 hours.
6. Document the destination in the owner's own notes, not in this repository.

Not a mailbox and not an outgoing server: nothing here sends from `hello@`. If you want to *answer* as `hello@` from your inbox, that needs the provider (or your mail program) to be allowed to send as that address — a separate decision this work did not make.

## 11. DNS checklist

Use the **exact values the dashboards show**; this table lists purposes and where each value comes from. None was published by this work; "Verified" columns stay empty until you have checked them (the administration's set-up checks and the commands below do that).

| # | Host | Type | Purpose | Value comes from | Published | Verified |
| --- | --- | --- | --- | --- | :-: | :-: |
| 1 | `domain.hu` | MX ×3 | Incoming mail to Cloudflare Email Routing | Cloudflare (`route1/2/3.mx.cloudflare.net`; priorities assigned by Cloudflare) | ☐ | ☐ |
| 2 | `domain.hu` | TXT | **The one** SPF record: authorizes Cloudflare's forwarding (`v=spf1 include:_spf.mx.cloudflare.net ~all` per Cloudflare); merge anything else into it | Cloudflare | ☐ | ☐ |
| 3 | `cf2024-1._domainkey.domain.hu` | TXT | DKIM for forwarded mail | Cloudflare (copy the full value) | ☐ | ☐ |
| 4 | `send.domain.hu` | MX | The provider's return path (bounces) | the provider's dashboard (the region is in the value) | ☐ | ☐ |
| 5 | `send.domain.hu` | TXT | SPF for the provider's sending, **on the subdomain**, so it does not touch row 2 | the provider's dashboard | ☐ | ☐ |
| 6 | `resend._domainkey.domain.hu` | TXT | DKIM for the website's outgoing mail | the provider's dashboard | ☐ | ☐ |
| 7 | `_dmarc.domain.hu` | TXT | DMARC, to start `v=DMARC1; p=none; rua=mailto:<a real mailbox you read>` | you: the report address is your decision | ☐ | ☐ |

Rules: **exactly one** `v=spf1` record on the root; no MX on the root other than Cloudflare's; start DMARC at `p=none`, read the aggregate reports for a few weeks, and only then consider `quarantine` / `reject` (the checks report `p=none` as "monitoring only"); an `rua` mailbox receives XML reports from every large receiver, so use a mailbox or a DMARC-report service you will really read. Check with a lookup tool of your choice, for example `dig MX domain.hu`, `dig TXT domain.hu`, `dig TXT resend._domainkey.domain.hu`, `dig TXT _dmarc.domain.hu`, then **send a message to a Gmail address and read its original headers** for `spf=pass dkim=pass dmarc=pass`. **Do not call the domain authenticated until all of this has been seen.**

## 12. Tests and what was not verified

```bash
npm test                                              # everything
npx vitest run server/test/email.test.ts server/test/webhook.test.ts server/test/emailChecks.test.ts
```

New for this work (all run by `npm test`): `server/test/email.test.ts` (provider conversation on **real HTTP against a stand-in for the provider's API**: the request, the idempotency key, every failure class, retry with the same key, a retry by an administrator, a down provider and a wrong key with the visitor still told *received*, secrets in no log or answer, the confirmations and their rules, the test message, pausing, configuration refusals, migration 0003), `server/test/webhook.test.ts` (signature, replay, tampering, missing headers, the 404 without a secret, duplicates, out-of-order and late events, an event that beats the send's own answer, the decision table, the administration's view), `server/test/emailChecks.test.ts` (every check in every state against tables of DNS and API answers). The existing suites were updated where states or counts changed. Results are in the section "Results" at the end of this file.

**Not verified — read this before relying on it:**

- **No Cloudflare account was touched.** Email Routing, the destination mailbox, the rule and the DNS records are not set up; incoming forwarding was **not tested** (§10 is the procedure). The Cloudflare status check was tested against stand-in answers shaped like Cloudflare's documentation, never against Cloudflare.
- **No provider account, key, domain or webhook exists.** The adapter and the webhook were tested against a stand-in whose answers follow the provider's documentation as read on 2026-11-04 (request and error shapes, the Svix signature scheme, the event types). They were **not** run against the real service: the real `reply_to` field name, the real error body shape, the real behaviour of a reused idempotency key, the real webhook payload for every event, and the real domain status values are as documented but unproven here. **No real e-mail was sent**, so outgoing delivery, sender identity, `Reply-To` as received, and delivery to different mail providers are **untested**.
- **SPF, DKIM and DMARC: no check passed**, because nothing was published. The checks exist and were tested against stand-ins.
- **Mail client rendering** (Gmail, Outlook, Apple Mail, phones) **was not looked at**; only the structure was inspected. Outlook's rendering engine in particular ignores parts of modern CSS; the layout is tables and inline styles to cope, but it is not proven.
- **Spam folder placement and deliverability** cannot be assessed without real sending from a domain with a history.
- **The live provider's quotas and rate limits** (100 a day on the free tier; a per-second request limit exists, its number was not read) were read about, not hit.
- **CAPTCHA was not added.** The risk it would address (a script submitting the forms) is already limited by per-address rate limits, a honeypot, link counting, duplicate detection, the consent check and — for the confirmations — the three-a-day cap per recipient. Adding a third-party challenge would send visitors' behaviour to another company and needs an accessible, privacy-respecting implementation; add one only if real abuse appears.
- **Legal review: none.** See §14.

## 13. Production checklist

1. Move DNS to Cloudflare if it is not there. 2. Do §10 (destination, rule, test from another account) — **before** removing any old MX. 3. Add the sending domain in the provider's dashboard (choose the region); publish rows 4–6 of §11 exactly; wait until the provider shows the domain verified. 4. Create the **send-only** API key limited to that domain; put it in the host's secret store as `EMAIL_API_KEY`. 5. Set `EMAIL_PROVIDER=resend`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `NOTIFY_TO`, `NOTIFY_LANGUAGE`, `BRAND_NAME`, and **`EMAIL_ENABLED=false`**; start the server; read the start-up log for warnings. 6. Add the webhook in the provider's dashboard with the events of §7; put its `whsec_…` secret in `EMAIL_WEBHOOK_SECRET`. 7. Publish the DMARC record at `p=none` with a report address you read. 8. Optionally create the read-only Cloudflare token and set the three `CLOUDFLARE_*` values. 9. Set `EMAIL_ENABLED=true`, restart, open Notifications → **Check now** and read every line; **Send a test e-mail**; confirm the message arrives, its original headers show `spf=pass dkim=pass dmarc=pass`, `Reply-To` is what you expect, and a signed event turns the delivery to *Delivered*. 10. Send a message through the contact form from a different network and from a phone; reply to the owner's notification and check the reply goes to the visitor. 11. Decide `RETENTION_DAYS`, update the privacy notice (§14), set the **confirmations** on only if you want them (they are off). 12. After a few weeks of DMARC reports, decide whether to tighten the policy.

## 14. Security and privacy

- **Secrets** only in the server's environment; the API key is never in the browser, a page, a log or an answer (the registered secrets are masked even inside a provider's error text, which a test provoked: a provider that quotes the key back used to leave it in the stored reason, now `[secret]`); the administration shows only *set / not set*.
- **Header injection**: a line break in any header value is refused before anything is sent (the same rule on every provider); a hostile name or subject is escaped in the HTML and printed as text.
- **Recipients are never public input**: only `NOTIFY_TO`, the address stored with the visitor's own request (for a confirmation or an administrator's status e-mail) or the owner's address (a test).
- **Anti-abuse**: the forms' rate limits, honeypot, link counting, duplicate detection and consent check; the confirmation cap per recipient; the webhook's own limit; the webhook accepts only signed, fresh requests.
- **No CSRF issue for the webhook**: it has no cookie and no CORS; the signature is its authentication.
- **What is stored**: `email_deliveries` holds, per message, the recipient address (needed to retry and to show the log), the kind, state, the attempt count, the masked reason and the provider's message id — **not the message text** (it is rendered from the record when sent); `email_events` holds no personal data. Removing a record removes its deliveries (and their events); `server:cli erase <address>` removes everything held about an address; `RETENTION_DAYS` removes old finished deliveries; the public API never returns any of it.
- **What leaves the server**: each message's recipient, subject and content go to the **provider** (a processor; it keeps data for a period of its own — 30 days on the free plan, per its pricing page — and in a region chosen at set-up) and, for mail to `hello@`, through **Cloudflare**. The website's privacy notice must say so; **it was not changed by this work** — that text is the owner's, and no legal review has been made. Nothing here is a claim of compliance with any law.
- **Logs** carry the delivery id, kind, attempt and outcome, never a message body, an address or a key.

## Results

Run on 2026-11-04 (Windows 11, Node 22.23):

- `npm test`: **1691 passed, 0 failed** in 71 files — the backend 422 in 16 files (the three new files: provider 44, webhook 31, set-up checks 26; the existing suites were updated where states or counts changed), the administration 208, the website 1061. `tsc -b`: clean. `oxlint`: clean. `npm run build`, `check:seo`: ok. `npm audit`: 0 vulnerabilities.
- **Real server, real browser** (Chrome through Playwright; a real backend process on a copy of the earlier database, migration 0003 applied to it; the provider replaced by the stand-in of `server/test/resendMock.ts`; real public DNS for `site.test`, which does not exist): the Notifications screen in Hungarian and English; "Check now" gave *Verified* for the provider and its domain (stand-in answers), *Not verified* for DKIM, SPF, DMARC and the MX records (the real DNS has none for a `.test` name), *Cannot be checked* for Cloudflare (no token) and for the webhook before any event; a test e-mail was accepted and shown as **Sent**, a **signed event** then turned it into **Delivered** and the webhook line into *Verified*; a **forged event got 401**; with confirmations switched on, a contact message produced the owner's notification and a Hungarian confirmation to the visitor's address; no browser console error. The layout and accessibility audit (`tools/audit/audit-admin.cjs`: axe-core, overflow, target size, names; 4 sizes × dark/light × Hungarian/English) found **no axe violation**, and one real layout fault — the reference links in the delivery log were 19–21 px high — which was fixed and re-run clean (240 views, 0 findings).

What those runs did **not** prove is in §12: nothing was run against the real provider, Cloudflare, real DNS records or a real mailbox.

**Bugs found while testing this work (fixed, each with a test):** a provider's error text that quotes the API key was stored in the log of failed messages as it came (secrets are now masked in every redaction path); before this work a customer's e-mail carried the owner's private address as `Reply-To` (it is now the public address); "what the last message proved about sending" counted messages an earlier provider had sent (the sender of each message is now recorded and only the current provider counts); the badge colour for "accepted" is good news for a quote request but only "sent" for a message, so the two tone tables are now separate.
