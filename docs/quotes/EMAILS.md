# E-mails of the quotation system

What is sent, to whom, in which language, how it is kept reliable, and — separately and plainly — what has and has **not** been verified. Detail of the outbox, the providers and the checks page is in [`../email/README.md`](../email/README.md); this file is about the quotation workflow's messages.

> **Status in one sentence.** The code for every message in the brief exists and is tested against a recording mailer, a file provider and a signed mock of the provider's webhook. **No real message has been sent, no provider account was inspected, and the domain's public DNS shows no DKIM and no sending-provider SPF. Customer e-mail is therefore NOT production-ready**, and nothing in this repository can make it so: the remaining steps are the owner's (§6).

## 1. The messages

Every message is a row in `email_deliveries` first and an e-mail second (the outbox), written **in the same transaction** as the thing it announces, so a sent quotation always has its message queued and a message is never queued for something that did not happen. HTML and plain text, table layout, no images, no tracking.

| Kind | To | When | Language | Once-only (database) | Link |
| --- | --- | --- | --- | --- | --- |
| `quote_received` | owner (`NOTIFY_TO`) | a request was stored | `NOTIFY_LANGUAGE` | yes, per request | to the request in the administration |
| `quote_confirmation` | customer | a request was stored (on by default, at most 3 per address per day) | the request's language | yes, per request | their status page |
| `quote_status` | customer | the administrator chose to e-mail a status change or a message | the request's language | no (on purpose) | their status page |
| `quote_sent` / `quote_revised` | customer | a quotation (or its next version) was sent; also when the administrator sends it again | **the quotation's language** | no (a lost link may be resent) | the quotation, a **fresh** secure link per message |
| `quote_accepted` / `quote_accepted_admin` | customer / owner | the customer accepted | quotation's / owner's | yes, per quotation | the quotation / the request |
| `quote_declined` / `quote_declined_admin` | customer / owner | the customer declined | quotation's / owner's | yes, per quotation | — / the request |
| `revision_requested_admin` | owner | the customer asked for a change or clarification | owner's | yes, per change request | the request |
| **`revision_received`** *(PROMPT 21)* | customer | the same moment: a **receipt** saying their message arrived, that nothing was accepted or declined, and what a new version would mean | the quotation's language | yes, per change request | the quotation |
| **`delivery_failed_admin`** *(PROMPT 21)* | owner | a message to a customer ended `failed`, `bounced` or `complained` (§3) | owner's | yes, per failed message | the request |
| `inquiry_received`, `inquiry_confirmation`, `inquiry_status`, `test` | the contact form's messages and the Notifications page's test | as before | | | |

The brief's list is covered: *customer*: request received, status updated, quotation ready, accepted, declined, **change request received**; *administrator*: new request, accepted, declined, change requested, **important delivery failure**.

Wording rules the tests hold: no promise of an answer time (an administrator may add a sentence of their own); no sentence that says money was paid, requested or received (an acceptance e-mail says plainly that **no payment** has been requested or received through the site); a message never says "delivered"; every typed value is escaped; a subject is one line; Hungarian, English and Dutch are complete and are spell-checked against the Hunspell dictionaries (`npm run i18n:validate`), but **have not been read by native speakers**.

## 2. Reliability

* **Retry**: a transient failure (a busy server, a dropped connection) is tried again after 1, 5, 30, 120 and 720 minutes, up to `EMAIL_MAX_ATTEMPTS` (5); a permanent refusal is not retried. A row left `sending` by a process that died is picked up again.
* **Idempotency**: the provider is sent `<delivery id>-<generation>` as the idempotency key, so a repeated request after a timeout cannot send the same message twice; a manual retry is a new generation on **the same row** (no second row, so the once-only rules hold).
* **States an administrator sees**: *pending* (and *retrying*), *sent* (the provider accepted it), *delivered*, *bounced*, *complained*, *failed*, *cancelled* (the record it was about was deleted). **"Delivered" appears only when a webhook whose signature verifies says so**; "sent" is all the code can honestly claim on its own. A request with no verified webhook secret never shows a delivered message (the server warns at start-up).
* **Where they are visible**: the request page lists every e-mail about it with its state, attempts and the provider's reason, a **Send again** for a failed one, and a warning at the top when one to the customer did not get through; Notifications lists all of them with filters (including "problems"); the System page counts pending and failed.
* **Tests send nothing real**: they use a recording mailer, the `file` provider (messages written to a folder) and a mock of the provider's HTTP API and webhook. `EMAIL_PROVIDER=file` is refused in production.

## 3. The delivery-failure alert

A message to a customer is **important** when it is one of: the confirmation, a status e-mail, a quotation (first or revised), an acceptance or decline confirmation, or the receipt for a change request. When one of them ends `failed` (the provider refused it for good, or the attempts ran out), or later `bounced` or `complained` (a verified webhook):

1. the request's history gets a line `E-mail failed` with the kind and the state (fixed words), written by the system;
2. the request page shows the warning and the failed row with its reason;
3. the owner (`NOTIFY_TO`, in `NOTIFY_LANGUAGE`) gets **one** e-mail naming the message, the address, what the provider said and linking to the request. It has no Reply-To (it is not something to answer to the customer).

Rules: **once per message** (the database refuses a second alert for the same message; a *new* message, such as the quotation sent again on purpose, that fails has its own alert); **never for the owner's own messages** and never for an alert about an alert (no loop); the offer and the request are **not** changed by a failure (the quotation stays out, the customer's link stays valid, and the administrator sends the message again).

What the alert cannot do: if the whole provider is down, the alert fails too. That is why it is only one of three signals (the history, the request page, Notifications and the System page's counters); nobody should rely on e-mail alone to learn that e-mail is broken.

## 4. What the three languages mean

A customer's message is written in the language of what it is about: the confirmation and the status e-mail in the language of the **request**; everything about a quotation in the language of the **quotation** (the administrator chooses it in the editor, and the link goes to the page in that language). The owner's messages are in `NOTIFY_LANGUAGE` (Hungarian unless set). Dates and amounts are written the way that language writes them (`hu-HU`: `3100,50 EUR`).

## 5. The four levels of "done", for each message

| | Code implemented | Locally tested (recording mailer, file provider, signed mock webhook) | Provider configuration verified | **Real delivery verified** |
| --- | :-: | :-: | :-: | :-: |
| request received (owner) / confirmation (customer) | yes | yes | **no** | **no** |
| status update | yes | yes | **no** | **no** |
| quotation ready (first and revised) | yes | yes | **no** | **no** |
| accepted / declined (both sides) | yes | yes | **no** | **no** |
| change request received (customer receipt) / change requested (owner) | yes | yes | **no** | **no** |
| delivery failure alert | yes | yes (refused, bounced and complained paths) | **no** | **no** |
| "delivered" / "bounced" / "complained" from the provider | yes | yes (signature, replay, order of events) | **no** | **no** |
| Hungarian, English and Dutch text | yes | yes (complete, spelling) | n/a | **no** (no native reading) |

"Provider configuration verified" means somebody looked at the provider's dashboard and DNS and saw the domain verified, the webhook pointing at the site and the key working. Nobody has, from here: the assistant has no access to either. "Real delivery verified" means a real message reached a real inbox (and a bounce and a complaint were reported back) — see the test in §7.

### What public DNS says today (read-only look-up, 2026-11-14; the same as the platform audit's finding E-1, [`../audit/EMAIL_AUDIT.md`](../audit/EMAIL_AUDIT.md))

| Record | Seen | What it means |
| --- | --- | --- |
| SPF, `szilardkiss.com` TXT | `v=spf1 include:_spf.mx.cloudflare.net ~all` | authorises Cloudflare's *inbound* routing only, no sending provider |
| DKIM, `resend._domainkey.szilardkiss.com` | **does not exist** | mail signed by the provider cannot be verified against the domain |
| Return path, `send.szilardkiss.com` | **does not exist** | the provider's bounce domain is not set up |
| DMARC, `_dmarc.szilardkiss.com` | `v=DMARC1; p=none;` (no `rua`) | monitoring only, and no reports are collected |

Until those exist, customer mail sent from this domain is likely to be rejected or filed as spam, silently. The application's own `/api/ready` and the Notifications **Run checks** page are the right places to see this once the records exist; At the time of the platform audit `/api/ready` reported e-mail as *configured* (the variables are set), which is not the same as *working*.

## 6. What the owner has to do (nothing here was done by the assistant)

Do these in order; each says how to know it worked. The provider's dashboard shows the **exact** records: copy them from there, not from this file.

1. **Choose and open the provider account** (the code supports Resend, SMTP, and a file provider for development). The API key goes into the host's environment only — never into the repository, never into a variable that starts with `VITE_`.
2. **Verify the sending domain** with the provider: add the DKIM record(s) and the return-path (bounce) records it shows. Verified when the dashboard says so **and** `nslookup -type=TXT resend._domainkey.szilardkiss.com` (or the provider's selector) returns the key.
3. **SPF**: keep the existing record for Cloudflare Email Routing; add what the provider asks for (usually on its own return-path subdomain, which leaves the root record alone). There must be exactly **one** SPF record per name.
4. **DMARC**: after DKIM works, change `p=none` to `p=none; rua=mailto:<a mailbox you read>`, read the reports for a couple of weeks, then tighten the policy. Do not tighten before the reports show the real mail passes.
5. **Cloudflare Email Routing** forwards `hello@…` to your inbox (it receives, it does not send); `EMAIL_REPLY_TO` is that public address.
6. **Webhook**: point the provider at `https://<site>/api/webhooks/email` for `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed` (and `email.delivery_delayed`, `email.suppressed` if offered), and put its signing secret (`whsec_…`) in `EMAIL_WEBHOOK_SECRET`. Without it no message is ever shown as delivered.
7. **Environment on the host**: `APP_ENV=production`, `PUBLIC_URL` (without it a quotation cannot be sent), `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` (an address on the verified domain), `EMAIL_REPLY_TO`, `NOTIFY_TO` (a mailbox **you watch**: the alerts go there), `NOTIFY_LANGUAGE`, `EMAIL_WEBHOOK_SECRET`, `TRUST_PROXY`. `EMAIL_ENABLED=false` switches sending off: nothing is queued while it is off, and a quotation cannot be sent.
8. **Run the checks**: Administration → Notifications → *Run checks* is green, and *Send a test message* arrives.

## 7. The real-delivery test (to be run by the owner, with addresses they own)

Only this makes a statement about real delivery true. Use mailboxes you control and, for the bounce and the complaint, the provider's documented test addresses (Resend documents `delivered@`, `bounced@` and `complained@resend.dev`; check the provider's current page).

1. Send the test message from Notifications → it arrives, and its state becomes **Delivered** after the webhook.
2. Make a request in the shop with your own address → the owner's notification and the customer's confirmation arrive, in the right languages, with working links.
3. Write a quotation in Hungarian, send it to your own address → it arrives, the link opens the Hungarian page.
4. Ask for a change on that page → the receipt arrives.
5. Make a request with the provider's **bounce** address and send it a quotation → the quotation's state becomes **Bounced**, the request page shows the warning, and **one** alert arrives at `NOTIFY_TO`.
6. Repeat with the **complaint** address → *Complained*, and one alert.
7. Look at the message source of one e-mail: SPF, DKIM and DMARC all report **pass** (in the headers a mailbox provider adds).
8. Record the date and the result in [`live-verification.md`](live-verification.md). Until it says these passed, nothing may claim that customer e-mail works in production.
