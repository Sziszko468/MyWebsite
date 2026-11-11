# Production readiness (PROMPT 15)

What it takes to put this website on the public internet, **what was verified, what only you can do, and what is not there.** Every row has one of four states, and none is "verified" unless it was *tested* (a command run, a browser driven, a request answered) on the date given. An external service is never marked verified from a document.

| State | Meaning |
| --- | --- |
| **Verified** | Tested here; the evidence is named. |
| **Requires manual configuration** | The code is ready; it needs a value, an account or an action that only the owner has. Nothing was invented to fill the gap. |
| **Not implemented** | There is no code or file for it in this repository (some on purpose). |
| **Blocked** | Cannot be done until something else exists (a domain, an account). |

The overall verdict is in [the final quality report](../release/final-quality-report.md). The operating manuals are [backend](../backend/README.md), [administration](../admin/README.md) and [e-mail](../email/README.md); this page is the checklist that ties them together.

## 1. The shape of a deployment

One Node process (`server/`, Node ≥ 22.18, **no runtime dependencies**) serves the JSON API, the administration at `/admin` and — with `STATIC_DIR=dist` — the built website, all on one origin (no CORS, a `SameSite=Strict` session cookie). SQLite on a persistent disk. TLS and compression are the reverse proxy's job. There is no Dockerfile, no CI workflow and no host-specific file in the repository: the deployment is *a folder, an environment and a process*, described in [backend §9](../backend/README.md#9-deployment).

```
MSYS_NO_PATHCONV=1 VITE_SITE_URL=https://your-domain VITE_API_URL=/ npm run build   # website + administration + prerendered pages + _headers
APP_ENV=production APP_SECRET=… DATABASE_PATH=/var/lib/… PUBLIC_URL=https://your-domain API_PUBLIC_URL=https://your-domain \
  TRUST_PROXY=1 STATIC_DIR=$PWD/dist NOTIFY_TO=… EMAIL_FROM=… … npm run server:start
```

(`MSYS_NO_PATHCONV=1` only matters on Windows Git Bash, which would otherwise rewrite `VITE_API_URL=/` into `C:/Program Files/Git/`; the forms then say they cannot send.)

## 2. Checklist

### Code and build

| Item | State | Evidence / what is left |
| --- | --- | --- |
| Production build (`npm run build`: types, bundles, prerendered pages for 3 languages, `sitemap.xml`, `robots.txt`, `_headers`) | **Verified** 2026-11-05 | Built with and without `VITE_SITE_URL`; `npm run check:seo` clean (65 files; with an address: 55 indexable, 10 `noindex`, hreflang reciprocal, canonicals, structured data, CSP hashes). |
| Tests, types, lint | **Verified** 2026-11-05 | `npm test`, `tsc -b`, `oxlint`: see the quality report for the counts. |
| Dependency vulnerabilities | **Verified** 2026-11-05 | `npm audit`: 0. Six runtime dependencies on the website (React, React DOM, React Router, three, @react-three/fiber, the Archivo font package); none in the server. Re-run before every release: the registry changes. |
| Secrets in the repository and the bundles | **Verified** 2026-11-05 | Key-pattern scan of `dist/` (none); `.env*` is git-ignored and only `.env.example` is tracked; the server never reads a `.env` file. |
| Debug mode off in production | **Verified** | There is no debug flag. `APP_ENV=production` refuses an unsafe configuration (`server:cli -- check` exits 78 without an `APP_SECRET`, with a wildcard or `http` origin, the `file` mail provider, clear-text SMTP, an in-memory database); a production-like configuration exits 0. Errors are plain JSON with a request id and no stack (security probe). |
| CI | **Written, not run on GitHub** | `.github/workflows/ci.yml` (PROMPT 18): typecheck, lint, tests, `i18n:check`, `i18n:validate`, build, `check:seo`. It has not run yet: push it and read the first result. |
| Starting language by country (the edge Worker, `worker/`) | **Verified locally; not on the deployed site** | `wrangler dev` (the real Workers runtime) answered 302 to `/hu/`, `/nl/`, `/en/` for HU, NL and every other or unknown country; a saved choice and a crawler were respected (`tools/e2e/l10n-journey.cjs`, 31/31). After the next deploy check it from a Hungarian and a Dutch connection. See [docs/i18n](../i18n/README.md). |

### Configuration

| Item | State | What is left |
| --- | --- | --- |
| Environment variables | **Verified** (names, validation) / **Requires manual configuration** (values) | `.env.example` lists every variable; the configuration check names the one that is wrong. `APP_SECRET` (≥ 32 random characters), `DATABASE_PATH`, `PUBLIC_URL`, `API_PUBLIC_URL`, `TRUST_PROXY`, `NOTIFY_TO`, `EMAIL_FROM` are the owner's to set. |
| Brand name, contact e-mail address, GitHub/LinkedIn | **Requires manual configuration** | `src/config/site.ts` still says "Your Name" and every contact link is `null`: **the contact page offers the form and nothing else**, and the footer shows no address. Person/WebSite structured data waits for a real brand name. |
| `VITE_SITE_URL` | **Requires manual configuration** | Until it is set every page says `noindex, nofollow` and there is no sitemap/canonical/hreflang. Deliberate: nothing guesses a domain. |
| First administrator | **Requires manual configuration** | `npm run server:admin create <email> admin`; the password is asked for. |
| Analytics | **Requires manual configuration** (off) | Off unless `VITE_ANALYTICS_ENDPOINT` is set; then a consent band appears. |
| Privacy notice | **Requires manual configuration** | `/privacy` is accurate about what the *code* stores; it says nothing legal about the owner's identity, retention period, legal basis, or that the e-mail provider and Cloudflare process messages. Those are the owner's words. No legal-compliance claim is made anywhere. |

### Domain, TLS, DNS

| Item | State | What is left |
| --- | --- | --- |
| Domain | **Blocked** | No domain is configured. |
| HTTPS | **Requires manual configuration** | The server speaks HTTP; terminate TLS in front. `API_PUBLIC_URL=https://…` turns on `Secure` cookies and the `__Host-` cookie name (checked by the configuration check: `secureCookies: true`). The site sends `Strict-Transport-Security`. |
| DNS records (site, MX, SPF, DKIM, DMARC) | **Blocked** | Nothing is published; no authentication check passed because none could. The exact records come from Cloudflare and the mail provider's dashboards, see [e-mail §11](../email/README.md). |
| Security headers | **Verified** (as served by the backend) / **Requires manual configuration** (elsewhere) | Content-Security-Policy with hashes, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP, HSTS, cache rules: written to `dist/_headers`, applied by the backend's static serving and by the audit server, and observed on real responses. Another static host must copy `dist/_headers` into its own configuration. |

### E-mail

| Item | State | Evidence / what is left |
| --- | --- | --- |
| Outgoing e-mail through the application (owner notification, optional confirmations, HU/EN/NL, HTML + plain text, Reply-To, outbox, retry, idempotency) | **Verified** with the `file` provider and a stand-in for the provider's API | End-to-end journey B reads the written message (sender, recipient, Reply-To = the visitor, multipart); the provider path is tested against a stand-in on real HTTP (`server/test/email.test.ts`, `webhook.test.ts`). |
| The real transactional provider (Resend) | **Requires manual configuration** | Account, verified domain, send-only API key, webhook endpoint and its `whsec_` secret. Its error bodies, `reply_to` field and webhook payloads are implemented **as documented** and are **unproven against the real service**. |
| Incoming e-mail (Cloudflare Email Routing: `hello@` → the owner's inbox) | **Blocked** | Needs a Cloudflare-managed domain; not tested. |
| SPF, DKIM, DMARC | **Blocked** | Nothing published; the administration's Notifications screen shows each as *not verified* until a real answer says otherwise. |
| Webhook signature verification | **Verified** (tests + a real server with signed and forged events) | Forged 401, replay and duplicates ignored, out-of-order events handled. |
| Failure handling | **Verified** | A stored request survives a down provider; invalid recipient, rate limit and quota are classified; retry with back-off; an administrator's retry; no duplicates. The visitor is never told a saved message failed. |
| Deliverability (spam placement, rendering in Gmail/Outlook/Apple Mail) | **Blocked** | Needs the real provider and real mailboxes. |

### Data

| Item | State | Evidence / what is left |
| --- | --- | --- |
| Migrations | **Verified** | Three migrations apply on an empty database and on a copy of an older one (tests and real processes); the checksum of an applied migration is verified at start. |
| Persistent disk for `DATABASE_PATH` | **Requires manual configuration** | |
| Backups | **Verified** (command) / **Requires manual configuration** (schedule) | `npm run server:backup` is tested; nothing schedules it. |
| Restore drill | **Not implemented** (not rehearsed) | Restore = stop, copy the backup over `DATABASE_PATH`, start. Rehearse it once before relying on it. |
| Retention | **Requires manual configuration** | `RETENTION_DAYS` empty keeps everything; the owner decides the period and tells visitors. |
| Rollback | Documented, **not rehearsed** | Code: redeploy the previous build; data: restore the pre-update backup (migrations only move forward). |

### Running it

| Item | State | What is left |
| --- | --- | --- |
| Health and readiness | **Verified** | `GET /api/health` (liveness, `{"status":"ok"}`), `GET /api/ready` (database and migrations). |
| Logging | **Verified** | One JSON line per request/event on stdout, with secrets and personal data masked (`registerSecret`, redaction tests). Collecting them is the host's job. |
| Error monitoring / alerting | **Not implemented** | By design there is no third-party reporter; failed e-mail deliveries and `/api/ready` are what an operator watches. Add the host's log alerts. |
| Process supervision, restarts | **Requires manual configuration** | One process only; exits 0 on `SIGTERM` after finishing requests (checked via `app.close()`; Windows cannot deliver SIGTERM to a handler, so the real signal path is **not** verified here). |
| Publishing admin edits | **Verified** (pull + build) / **Requires manual configuration** (hook) | `npm run catalog:pull` then `npm run build` puts packages', add-ons' and services' texts, prices and the FAQ on the website (journey C, 2026-11-05); the administration's "Publish" calls `DEPLOY_HOOK_URL` if the host has one. |

## 3. Before the first public day, in order

1. Decide the owner items above (brand name, contact address, domain, retention, privacy wording).
2. Set the environment, run `npm run server:cli -- check`, create the administrator, start behind TLS.
3. Create the Cloudflare/provider accounts and DNS records; keep `EMAIL_ENABLED=false` until the administration's Notifications checks say *verified* for the records and a test message arrives; then `true`.
4. Build with `VITE_SITE_URL` and `VITE_API_URL=/`, serve, and run the end-to-end journeys and the security probe against the real host (`tools/e2e/README.md`) with a test administrator that you then delete.
5. Schedule the backup and do one restore.
