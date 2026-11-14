# Production checklist — quotation and order management

**Written for the owner, updated in PROMPT 21.** Nothing here was done by the assistant. The classification of the system as a whole is in [`TEST_RESULTS.md`](TEST_RESULTS.md); the short version is that **the code is ready but the system is not live-ready until §0 and §4 are done and the live test has passed**.

## 0. What PROMPT 21 adds to the list

- [ ] **Back up the database before deploying** (`npm run server:backup`): **migration 0009** rebuilds `email_deliveries` again (every row and index is kept; it was tested on rows with provider events). The runner refuses an edited migration and a database newer than the code, so the way back is restoring the backup.
- [ ] **`NOTIFY_TO` is a mailbox somebody reads**: the new delivery-failure alerts and the change-request notices go there.
- [ ] The webhook is registered with at least `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed`: the alerts for a bounce or a complaint depend on it.
- [ ] **E-mail authentication** (SPF for the provider, DKIM, a bounce domain, DMARC with `rua`): the public DNS looked at on 2026-11-14 had **none of the provider's records** (finding E-1 of the platform audit is still open). Do §4, then the live test in [`EMAILS.md`](EMAILS.md) §7.
- [ ] Decide whether Render's and Cloudflare's **access logs** may keep customer-link paths (`/en/quote/<secret>`): the application never logs them, the host may ([`SECURITY.md`](SECURITY.md) §3).
- [ ] `TRUST_PROXY` is set to the number of proxies in front of the server (otherwise the rate limits see one visitor).
- [ ] A native read of the Hungarian and Dutch customer pages and e-mails, including the two new messages.
- [ ] Look at `/admin/quotes` once with a real request: the language filter, the preview in the editor, "End the customer's links", and "Make a quote request from this message" are new.
- [ ] **No deployment was made by this work.** The production branch (`deployment/render-cloudflare`) and `main` were not touched; this work is on `feature/quote-integration`, uncommitted, unpushed and unmerged until you say otherwise. The deployed site is older than PROMPT 18 and does not have the Shop 4.0 work either, so deploying means deploying all of it: read the platform audit's list first.

Nothing here was done by the assistant: it needs the owner's accounts, DNS and a host. Each item says what to do and how to know it worked. The live test that proves it is in [`live-verification.md`](live-verification.md); until that has been run with real addresses the system is **not** production-verified.

## 1. Before anything

- [ ] Node ≥ 22.18 on the host; a persistent disk for the SQLite file (`DATABASE_PATH`) and for `MEDIA_DIR`.
- [ ] **Back up the database** (`npm run server:backup`). Migration 0007 rebuilds `quote_requests` and `email_deliveries`; the migration runner refuses to start a server on a database newer than its code and refuses an edited migration, so the rollback is *restore the backup and start the previous version*.
- [ ] `git` state: the branch you are deploying contains PROMPT 17, 20 and 21 (PROMPT 21's work is uncommitted on `feature/quote-integration` until you decide), reviewed.

## 2. Environment (secrets live only here, never in a `VITE_` variable)

| Variable | Value / note |
|---|---|
| `APP_ENV` | `production` (secure cookies, HSTS, refuses the `file` mailer) |
| `APP_SECRET` | 32+ random characters; keys the hash of client addresses and the content fingerprints |
| `DATABASE_PATH`, `MEDIA_DIR` | on the persistent disk |
| `PUBLIC_URL` | the public origin, **required for quotation links and the dashboard link in e-mails**; without it a quotation cannot be sent |
| `API_PUBLIC_URL`, `CORS_ORIGINS` | only if the API is on another origin than the site |
| `STATIC_DIR` | the built `dist` (the backend then also serves the customer's private pages) |
| `TRUST_PROXY` | the number of reverse proxies in front (so rate limits see the client's address) |
| `EMAIL_PROVIDER=resend`, `EMAIL_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `NOTIFY_TO`, `NOTIFY_LANGUAGE` | `EMAIL_FROM` is an address on the domain you verified with the provider; `EMAIL_REPLY_TO` is the public `hello@your-domain`; `NOTIFY_TO` is the owner's private inbox |
| `EMAIL_WEBHOOK_SECRET` | the `whsec_…` the provider shows for the webhook (without it no delivery is ever confirmed) |
| `REQUIRE_CONSENT` | `true` (the privacy acknowledgement on the forms) |
| `QUOTE_REFERENCE_FORMAT`, `CUSTOMER_LINK_DAYS` | the defaults are `CC-{YYYY}-{NNNNNN}` and 90; decide before the first real request (a changed format applies from then on) |
| `RETENTION_DAYS` | the owner's decision (empty keeps everything) |

## 3. Build and start

```bash
MSYS_NO_PATHCONV=1 VITE_API_URL=/ VITE_SITE_URL=https://your-domain npm run build   # runs tsc, vite, the prerender and writes _headers and _redirects
npm run check:seo
npm run server:migrate && npm run server:start
```

- [ ] `GET /api/ready` answers `ready` with `migrations: current` and `email: configured`.
- [ ] `https://your-domain/en/quote/<43 random characters>` answers 200 with `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` (any other path under `/en/quote/` that is too short answers 404).
- [ ] Static hosting instead of the Node server: the build writes `_redirects` (`/en/quote/*  /en/quote/  200` and the like) and `_headers`; the host must honour both.

## 4. E-mail (docs/email/README.md has the detail)

- [ ] The sending domain is verified with the transactional provider: **SPF, DKIM** and a **DMARC** record published in DNS.
- [ ] **Cloudflare Email Routing** forwards `hello@your-domain` to the owner's inbox. It receives mail only; it is not used to send.
- [ ] The provider's **webhook** points at `https://your-domain/api/webhooks/email` with at least `email.sent`, `email.delivered`, `email.bounced`, `email.complained`, `email.failed`.
- [ ] Administration → Notifications → **Run checks** is green; **Send a test message** arrives; its state becomes *Delivered* only after the webhook confirms it.
- [ ] The confirmation to a quote request is **on** (Notifications; it is on by default) and, if wanted, a sentence about response time is written there (the system promises none by itself).

## 5. Headers, HTTPS, monitoring, backups

- [ ] HTTPS terminates at the proxy; HSTS is sent (production).
- [ ] The administration is reachable only over HTTPS; the session cookie is `Secure`, `HttpOnly`, `SameSite=Strict`.
- [ ] Logs go somewhere that is kept; they hold no addresses, messages or secrets (the server masks them).
- [ ] Something checks `/api/health` and `/api/ready`; the System page shows pending and failed messages (look at it daily at first).
- [ ] `npm run server:backup` runs on a schedule and a restore was tried once.
- [ ] `npm run server:maintenance` runs daily (the server's own timer also does); it removes expired customer links and applies `RETENTION_DAYS`.

## 6. Owner decisions the code cannot make

- [ ] The privacy page's section on quotations is read and adapted (processor, where data is stored, how to ask for deletion); **no legal review was done**.
- [ ] The quotation's **terms** and **payment terms** text (a starting text for them is written per quotation; nothing is defaulted).
- [ ] Whether and how tax is stated on offers; no rate is ever assumed.
- [ ] The retention period.
- [ ] A native read of the Hungarian and Dutch texts of the customer pages and e-mails.

## 7. Rollback

1. Stop the server. 2. Restore the pre-migration backup. 3. Start the previous version. A request made after the migration is lost by this; export (`GET …/export.json`) anything that must be kept first. A rollback that keeps the data is a forward fix, not a downgrade.
