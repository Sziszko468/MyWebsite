# Backend audit

Scope: `server/` (139 files: `src/` and 28 test files), run natively by Node ≥ 22.18 (`node server/src/main.ts`, no build step). There is **no Django project**; this audit is of the Node backend that exists. Method: reading the code, the project's 28 backend test files (all pass), a **throw-away backend with its own database** driven by the project's security probe (94 checks), and read-only requests to the live site.

## Structure

| Part | Where | Notes |
| --- | --- | --- |
| Entry points | `main.ts` (server), `cli.ts` (migrate, seed, check, admin, backup, maintenance, erase, ai) | start-up validates the whole configuration and stops with one message naming every wrong variable; exit code 78 |
| HTTP | `http/` (router, request, reply, errors, rate limit, security headers) | a hand-written router; every route declares its **area** (`api`, `admin`, `static`), which decides headers and limits |
| Modules | `modules/` : `admin`, `ai`, `auth`, `backups`, `catalog`, `contact`, `inquiries`, `media`, `notifications`, `projects`, `quotes`, `shop`, `system`, `texts` | one folder per business area; repositories talk to SQLite, services hold the rules |
| Database | `db/` (database wrapper, migrations, seed) | see [DATABASE_AUDIT.md](DATABASE_AUDIT.md) |
| Dependencies | `node:` built-ins plus `ai` (the assistant) and, loaded on demand, `@ai-sdk/anthropic` | the earlier "zero runtime dependency" claim in the docs now holds for everything except the AI module |

"Django applications, serializers, middleware, background tasks" have these counterparts: `modules/*/routes.ts` (views and URL routing), `lib/validate.ts` (validation, in place of serializers), `app.ts` (the request pipeline in place of middleware), and **in-process timers** in `main.ts` (daily maintenance, the Drive backup scheduler, the e-mail outbox worker) in place of a task queue. There is no external queue, which is right for one process and a limit for more than one.

## Public API (no session)

`/api/contact`, `/api/quote-requests`, `/api/customer/requests/:token`, `/api/customer/quotations/:token`, `/api/customer/actions`, `/api/ai/{config,session,chat,conversations…}`, `/api/health`, `/api/ready`, the read-only catalogue (`/api/services`, `/api/packages`, `/api/shop/*`, `/api/content/faq`, `/api/projects[/:slug]`, `/api/texts`), `/media/:file`, and the signed provider webhook `/api/webhooks/email`.

Verified by the probe: every public read answers without private fields (no address hash, content hash or administrator data); errors are JSON with a request id and **no stack, path or SQL**; malformed JSON, wrong content type, wrong method, oversize body and an empty object each get the right 4xx; SQL-injection-shaped path segments are clean 404s.

## Administration API

66 routes (the probe lists them) under `/api/admin/*`. **With no session every route × every method (GET, POST, PUT, PATCH, DELETE) answers only 401, 404 or 405**, never 2xx or a redirect: 330 calls, 0 exposed. The probe's route list was **incomplete** (it missed the quotation, shop-document and AI routes added later); 17 routes were added in this audit (see [REMEDIATION_LOG.md](REMEDIATION_LOG.md)). Live, `GET /api/admin/settings` → 401 on `www.szilardkiss.com`.

## Authentication and sessions

- One authentication system: administrators and editors in `admin_users`. **No customer accounts**: a customer reaches their own quotation through a link with a random token that is **stored only as a hash**, expires (`CUSTOMER_LINK_DAYS`) and is `no-store`, `noindex`, `no-referrer` (checked live).
- Passwords: `scrypt` with the parameters stored in the hash (`scrypt$N$r$p$salt$hash`), NFKC-normalised, constant-time compare. Sign-in answers a wrong password and an unknown account **identically** (probe: no account enumeration), is limited to 10 per 15 minutes per address, plus an account lock.
- Session cookie: `__Host-cc_admin` (when served over https), `HttpOnly; SameSite=Strict; Secure; Path=/`; server-side session table with idle timeout (`ADMIN_IDLE_MINUTES`) and absolute lifetime (`ADMIN_SESSION_HOURS`); sign-out destroys it (probe: the old cookie is refused afterwards); a password change signs the account out everywhere.
- CSRF: every state-changing admin call needs the CSRF token **and** a same origin (`Origin` check); the probe confirms a call without the token is 403 and a call from a foreign origin is 403 even with the token.
- No MFA. See finding B-3.

## Validation and uploads

Request bodies are limited (`BODY_LIMIT_BYTES`, 64 KiB default → 413) and validated field by field (`lib/validate.ts`: types, lengths, e-mail syntax, no line breaks in anything that reaches a header). Pictures (the only upload): PNG, JPEG, WebP or GIF only (identified by their bytes, not their announced type), **SVG and HTML-as-PNG refused**, size and 20000×20000-pixel bombs refused, the file name is the content hash, served `nosniff` with a sandbox CSP, never from a user-supplied path (path-traversal variants all 404).

## Logging and errors

Structured JSON logs with a request id; `registerSecret()` masks every configured secret in every log line and every stored failure reason; the probe confirms the administration's System screen carries no secret. No customer data is dumped into logs (only counts and ids).

## Findings

| ID | Severity | Finding | Evidence | Safe to fix now? |
| --- | --- | --- | --- | --- |
| B-1 | **High** (unverified in production) | `TRUST_PROXY` defaults to `0`. Behind Render (and Cloudflare) the socket address is a proxy's, so **all visitors share one address** for the in-memory limits (contact 5 / 15 min, quote 5 / 15 min, sign-in 10 / 15 min, AI per address) and the sign-in lock: five enquiries in a quarter hour from anyone blocks the form for everyone, ten failed sign-ins lock the owner out | `request.ts:64`, `.env.example:58`, `docs/backend/README.md:49`; the setting in production could not be read | **Partly done**: a start-up **warning** now fires in production when it is 0 (`main.ts`). The value is the owner's to set and test (see [INFRASTRUCTURE_AUDIT.md](INFRASTRUCTURE_AUDIT.md) §Render) |
| B-2 | Medium | Rate-limit and AI per-address counters live **in memory**: reset on every restart and deploy, and wrong with more than one instance. SQLite allows one writer, so one instance is also the only supported shape | `http/rateLimit.ts` | No: an architecture limit, document, keep one instance |
| B-3 | Medium | The administration is reachable on the open internet (`/admin` shell is public by design; the API behind it is closed) with a password only. Rate limits and the lock are tested; **no second factor** | live `/admin` → 200 shell, `/api/admin/*` → 401 | No: a feature (TOTP or Cloudflare Access), roadmap |
| B-4 | Medium | No scheduled-job record: the e-mail outbox worker, maintenance and Drive backup run on timers inside the web process; if the process is down at the scheduled hour nothing runs and nothing remembers it did not (see [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md)) | `main.ts`, `backups/googleDrive.ts` | No: needs a design (a `last_run` setting plus catch-up on start) |
| B-5 | Medium | `unhandledRejection` and `uncaughtException` stop the process (exit 1) and rely on the host to restart it. Correct for a database-owning process, but one stray rejection from a provider call restarts the whole site | `main.ts` | No: keep; confirm the host restarts on exit (Render does) |
| B-6 | Low | `GET /api/ready` is public and discloses whether e-mail is `configured` or `off` | live | Yes but pointless: harmless information; restrict only if a monitor can authenticate |
| B-7 | Low | `docs/production/README.md` suggests `TRUST_PROXY=1`; behind Cloudflare **and** Render the right number is probably 2 or more and must be measured, not assumed | docs | Yes: documented in this audit; the number is the owner's |
| B-8 | Info | `node:sqlite` is experimental in Node 22/24 (see database audit) | | n/a |

## Tests

28 backend test files, all green after one correction (see [TEST_RESULTS.md](TEST_RESULTS.md)); coverage includes the migration runner, authentication, the admin contract, the security rules (a test fails if `server/src` imports anything but `node:` modules or relative files, with `ai`, `@ai-sdk/anthropic` and `zod` allowed only inside `modules/ai/`, or if it builds SQL from a value), the e-mail outbox and webhook, quotations, the AI gateway and model lock, and the real process. One module had **no test**: `backups/googleDrive.ts`; six were added.
