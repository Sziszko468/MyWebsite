# E-mail infrastructure audit

**No real e-mail was sent** during this audit, no provider account was opened and no key was entered. What follows is the code, its tests, and the public DNS and web responses.

## What exists (there is one e-mail system; none was added)

| Part | Where | Finding |
| --- | --- | --- |
| Outbound path | `server/src/modules/notifications/` (`notifier.ts` outbox, `mailer.ts` factory, `resend.ts`, `smtp.ts`, `mime.ts`) | providers: `resend` (HTTPS API), `smtp` (own client, STARTTLS or implicit TLS), `file` (development only, **refused in production**), `none` |
| Inbound | **Cloudflare Email Routing** (forwarding only; never used to send) | the right role: inbound forwarding, not a transactional provider |
| Sender and reply | `EMAIL_FROM` must be on a domain the provider verified; the visitor is **never** the sender; a customer's `Reply-To` is `EMAIL_REPLY_TO` (public address), never the owner's private `NOTIFY_TO`; the owner's notification has `Reply-To` = the visitor | `notifier.ts:430-438` |
| Templates | `templates.ts`, `quoteTemplates.ts`, localized hu / en / nl, a premium Carbon / Racing Red layout (620 px column, table-based, text part always present) | `quotationFlow.test.ts` covers the three languages, escaping of hostile text, a one-line subject and the link in the plain-text part |
| Contact form notifications | `/api/contact` → inquiry stored → owner notification queued; the customer confirmation is **off by default** (setting) and is sent once per submission, at most 3 per address per day | `email.test.ts` |
| Retry | outbox with back-off 1, 5, 30, 120, 720 minutes, `EMAIL_MAX_ATTEMPTS` (default 5); a 4xx / dropped connection is *transient* (retried), a 5xx is *permanent*; the idempotency key is `<delivery id>-<send generation>`, so a retry never sends twice | `notifier.ts:38`, `smtp.ts` |
| Delivery logging | `email_deliveries` (state `queued → sending → accepted / failed`, never claims "delivered" without proof) and `email_events` (a **signed** webhook, Svix HMAC, may move a message to `delivered`, `bounced`, `complained`); no personal data in events | `webhook.ts`, `webhook.test.ts` |
| Error handling | provider error text is stored only after `redactText` (a provider that quotes the key back is masked); the administration's Notifications screen shows nine set-up **checks** with "verified / unknown" honesty | `emailChecks.test.ts` |
| Admin | Notifications screen: status, retry, test message, checks | `docs/email/README.md` |

## Live and DNS evidence

| Question | Answer | Source |
| --- | --- | --- |
| Is the backend's e-mail switched on in production? | `GET /api/ready` → `"email":"configured"`, i.e. a provider other than `none` and a sender (`EMAIL_FROM`) are set. It does **not** say whether sending is paused (`EMAIL_ENABLED=false`) | live, `health.ts`, `notifier.ts:92` |
| Which provider? | **Unknown** (the variable `EMAIL_PROVIDER` is in the Render dashboard; the administration's Notifications screen shows it after sign-in) | not readable |
| SPF | `v=spf1 include:_spf.mx.cloudflare.net ~all` → authorises Cloudflare Email Routing only | public DNS |
| DKIM | `resend._domainkey.szilardkiss.com` and `send.szilardkiss.com` **do not exist**; no other selector can be guessed | public DNS |
| Return-path / bounce domain | `send.szilardkiss.com` MX/TXT **do not exist** | public DNS |
| DMARC | `v=DMARC1; p=none;`, no `rua` | public DNS |
| Inbound routing DNS | `route1/2/3.mx.cloudflare.net` present | public DNS |
| Inbound rule and verified destination | not visible from outside | owner check C-6 |

## Findings

| ID | Severity | Finding | Business impact | Fix | Safe to apply now? |
| --- | --- | --- | --- | --- | --- |
| **E-1** | **High** | **The domain has no outbound-mail authentication.** SPF does not include any sending provider, there is no DKIM record, DMARC is monitor-only with no reports, yet production reports e-mail as configured. If the sender address is on `szilardkiss.com` (it must be, by the code's own rule), messages fail SPF and DKIM and fail DMARC alignment | quotation and status e-mails to customers are likely to be **rejected or sent to spam**, and the owner learns nothing (DMARC `p=none` without `rua`). Owner notifications to the owner's own mailbox may also be affected. The system would still show them as "accepted by the provider" | In the provider's dashboard add the domain, copy the DNS records it shows exactly (for Resend: a `resend._domainkey` TXT, a `send` MX and a `send` SPF TXT; the **values are the provider's**), wait for "verified", then confirm the administration's checks show SPF/DKIM verified. Keep the Cloudflare SPF include only if inbound routing needs it; one SPF record per name, merged, under 10 lookups: `v=spf1 include:_spf.mx.cloudflare.net include:<provider> ~all` | **No**: DNS is the owner's and production DNS must not be changed by this audit |
| **E-2** | Medium | DMARC has no `rua` reporting address, so failures are invisible; and `p=none` never protects the brand against spoofing | spoofing and misalignment go unseen | after E-1: `v=DMARC1; p=none; rua=mailto:<a mailbox the owner reads>`; move to `quarantine` after two clean weeks | No (DNS) |
| E-3 | Medium | Nothing in this audit proves the provider key works: the e-mail equivalent of a connection test is the Notifications screen's **test message** button, which needs a sign-in and was not pressed | the first real quotation may be the first real send | owner: sign in, Notifications → send the test message to an address they control; watch the state go `accepted` → `delivered` (needs the webhook secret) | No (needs login and a provider) |
| E-4 | Low | `EMAIL_WEBHOOK_SECRET` unset means messages are never shown as delivered or bounced; the server warns at start-up | cosmetic accuracy | owner: add the webhook in the provider dashboard and the secret | No |
| E-5 | Low | The privacy notice does not yet name the e-mail provider and Cloudflare as processors (noted before; owner's wording) | GDPR transparency | owner/legal text | No |
| E-6 | Info | `Cloudflare Email Routing` is inbound only; the code correctly treats it so and has a read-only checker that never changes anything | | | n/a |

## Tests run

Backend e-mail tests (outbox, templates, webhook, set-up checks, notifications over mock SMTP including STARTTLS and implicit TLS with a generated certificate, the stand-in Resend provider on a real HTTP socket) pass. **Two assertions failed at the start of this audit** and were corrected: the layout was redesigned (`0840a3d`, column `max-width:620px`) but `email.test.ts:397` and `quotationFlow.test.ts:586` still required `600px`. The tests, not the e-mails, were stale ([REMEDIATION_LOG.md](REMEDIATION_LOG.md)).

## Not verified

Rendering in real mail clients (Gmail, Outlook, Apple Mail), dark-mode mail clients, spam-score and deliverability, the real provider's reply formats, bounce handling against the real service, and whether `EMAIL_FROM` / `EMAIL_REPLY_TO` / `NOTIFY_TO` are set in production (names only readable in the dashboard).
