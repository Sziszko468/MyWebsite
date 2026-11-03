# The backend (`server/`)

The operating manual for the website's backend: what it does, how to configure, run, back up and deploy it, every endpoint, the administration panel, what is stored about people, and — at the end — what was actually tested and what was **not**. The reasoning behind the design is in [`architecture.md`](./architecture.md), written before the code.

It is one small Node program with **no runtime dependencies** (Node's own `http`, `sqlite`, `crypto`, `net`, `tls`), a SQLite database file, a JSON API for the website, and a server-rendered administration at `/admin`. It stores the contact messages and quote requests the website's two forms send, e-mails the owner about them, serves the shop's catalogue, and lets the owner manage all of it. There is **no payment**, **no customer account**, **no file upload** and **no AI/3D-generation feature** (the earlier Meshy/Generative Objects backend was removed on 2026-11-01 and nothing of it exists here).

## 1. Quick start (development)

Requires Node **22.18 or newer** (it runs the TypeScript directly; 22.23 was used) and nothing else: `npm install` is only needed for the website and the tests.

```bash
cp .env.example .env              # then set what you need; for a first look the defaults are enough
npm run server:admin create you@example.com admin     # asks for a password (12+ characters), twice
npm run server:start              # migrates, loads the catalogue into the empty database, listens on 127.0.0.1:8787
```

Open `http://127.0.0.1:8787/admin`. The file `.env` is **not read by the server itself** (it reads the process environment, as a host provides it); to use it locally, export the variables or start with `node --env-file=.env --disable-warning=ExperimentalWarning server/src/main.ts`.

To have the website talk to it: build or run the website with `VITE_API_URL=http://localhost:8787` (and `CORS_ORIGINS=http://localhost:5173` on the server for the Vite dev server). Nothing else on the website changes: the forms use their existing transport and show "sent" only after the backend answers 2xx.

| Command | What it does |
| --- | --- |
| `npm run server:start` | Start the server (`server:dev` restarts it when a file changes). Applies migrations and loads the catalogue into an empty database first, unless `MIGRATE_ON_START` / `SEED_ON_START` are `false`. |
| `npm run server:migrate` | Apply pending schema migrations and exit. |
| `npm run server:seed` | Load the website's catalogue into an **empty** catalogue (does nothing otherwise). |
| `npm run server:admin create <email> [admin\|editor]` | Create an administrator. The password is asked for (hidden); for automation set `ADMIN_PASSWORD` in that one command's environment. |
| `npm run server:admin password <email>` · `disable <email>` · `enable <email>` · `list` | Change a password (every session of the account ends), disable/enable an account, list accounts. |
| `npm run server:backup -- <file>` | Write a consistent copy of the database to a **new** file, while the server runs. |
| `npm run server:maintenance` | Remove expired sessions and, if `RETENTION_DAYS` is set, finished requests older than that. |
| `npm run server:cli -- check` | Validate the configuration and print it with every secret left out. |
| `npm run server:cli -- erase <email>` | Delete everything held about an e-mail address (asks for `yes`). |
| `npm run catalog:seed-export` | Rewrite `server/seed/catalog.seed.json` from the website's content (a test fails if it is stale). |
| `npm run catalog:pull` | Fetch the backend's catalogue into the website's build (see §8). |

## 2. Configuration

Everything is an environment variable, validated once at start-up. A bad or missing value stops the server with a message that names it and exits with status **78**; all problems are listed together. [`.env.example`](../../.env.example) lists every variable with a description and holds no secret. Summary:

| Variable | Default | Meaning and rules |
| --- | --- | --- |
| `APP_ENV` | `development` | `development`, `test`, `production`. Production refuses the unsafe settings marked ⚠ below. |
| `HOST`, `PORT` | `127.0.0.1`, `8787` | Where it listens. Behind a reverse proxy keep the loopback address. |
| `PUBLIC_URL`, `API_PUBLIC_URL` | — | Public origins. `API_PUBLIC_URL` starting with `https://` turns on `Secure` cookies and the `__Host-` cookie name. ⚠ https in production. |
| `CORS_ORIGINS` | — | Exact origins allowed to call the public API from a browser, comma-separated. A wildcard is refused. ⚠ https in production. |
| `DATABASE_PATH` | `./data/app.sqlite` | SQLite file (folder created if missing). ⚠ `:memory:` refused in production. |
| `MIGRATE_ON_START`, `SEED_ON_START` | `true` | Apply migrations / fill an empty catalogue at start. With migrations off and some pending, the server refuses to start. |
| `APP_SECRET` | dev-only value | Keys the hash of visitors' network addresses, the duplicate fingerprints and the sign-in form's token. ⚠ Required in production: 32+ characters, not a placeholder. Never logged, never returned. |
| `TRUST_PROXY` | `0` | Number of reverse proxies in front (0–5). `0`: `X-Forwarded-For` is ignored, because anyone can send it. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error`. |
| `RATE_LIMITS` | `true` | Switch the limiter off (tests only). |
| `BODY_LIMIT_BYTES` | `65536` | Largest request body (1 kB–1 MB). |
| `REQUIRE_CONSENT` | `true` | The two forms must send `consent: true` (the box on the form). |
| `EMAIL_PROVIDER` | `none` | `none` (send nothing), `smtp`, `file` (writes `.eml` files; ⚠ refused in production). |
| `EMAIL_FROM`, `NOTIFY_TO`, `NOTIFY_LANGUAGE`, `BRAND_NAME` | — , — , `hu`, `Website` | The sender, the **one** address that receives owner notifications (never invented; without it nobody is notified and the log says so at start), their language, the name in the e-mails' header. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS_REJECT_UNAUTHORIZED`, `SMTP_TIMEOUT_MS` | `starttls`, port by mode (587/465/25), certificate checked, 15 s | `SMTP_SECURE` is `starttls`, `tls` or `none`. ⚠ `none` and an unchecked certificate are refused in production. User and password go together. |
| `EMAIL_FILE_DIR`, `EMAIL_MAX_ATTEMPTS` | `./data/mail`, `5` | Folder for the `file` provider; tries before a message is marked failed (1–20). |
| `ADMIN_SESSION_HOURS`, `ADMIN_IDLE_MINUTES` | `12`, `30` | A sign-in lasts at most this long and ends after this long unused. |
| `RETENTION_DAYS` | unset | Delete finished requests and old delivery records after this many days (1–3650). **Unset keeps everything.** |
| `DEPLOY_HOOK_URL` | — | https address POSTed to by the admin's "Publish" button (a host's rebuild hook). |
| `STATIC_DIR` | — | The built website (`dist/`) to serve from this process, with the build's own `_headers`. See §9. |

## 3. Database

SQLite through `node:sqlite` (Node marks it *experimental*: it prints one warning, which the npm scripts silence with `--disable-warning=ExperimentalWarning`; the API has been stable, and all access goes through `server/src/db/database.ts`, so another engine is a change to that file). WAL mode, foreign keys on, one writer — which is why **one server process per database file** is the supported setup.

**Schema** (migration `0001_init.sql`): `admin_users`, `admin_sessions`, `inquiries`, `inquiry_notes`, `quote_requests`, `quote_request_items`, `quote_request_item_extras`, `quote_request_notes`, `services`, `service_translations`, `packages`, `package_translations`, `package_needs`, `package_extras`, `service_packages`, `extras`, `extra_translations`, `extra_needs`, `site_content`, `site_content_translations`, `email_deliveries`, `audit_log`, `schema_migrations`. Every foreign key is declared and enforced; enumerations are `CHECK`s; a published `from` price must have an amount, a currency and a VAT mode other than `unspecified` (a `CHECK`); catalogue rows that requests refer to cannot be deleted (`RESTRICT`: disable them). Customer-facing records have random ids and a short `reference` (`C-XXXXXXXX` for a message, `Q-XXXXXXXX` for a quote request). Times are UTC ISO-8601 text.

**Migrations** are numbered `.sql` files, applied in order, each in a transaction, recorded with a SHA-256 checksum. A migration that was changed after it was applied, a failing migration, or a database that is *newer* than the software stops start-up with a message and leaves the database as it was. Migrations are forward-only: to go back, restore a backup.

**Backup and restore.** `npm run server:backup -- /path/backup-2026-11-03.sqlite` writes a consistent single-file copy (`VACUUM INTO`) while the server is running and refuses to overwrite an existing file. Restore = stop the server, put the copy at `DATABASE_PATH` (delete any `-wal`/`-shm` files next to the old one), start. A schedule, off-site storage and a restore drill are the operator's job; a daily `cron` line running the command above with a dated name is enough to start (not set up here). Backups hold deleted data until they are rotated out — keep their lifetime in line with `RETENTION_DAYS`.

## 4. The public API

Base: the server's origin. All bodies and answers are JSON (`Content-Type: application/json`). Public routes set **no cookie**.

**Success** is `{ "data": …, "meta"?: … }`. **Failure** is always

```json
{ "error": { "code": "validation_failed", "message": "…", "details": { "fields": { "email": "invalidEmail" } }, "requestId": "…" } }
```

`requestId` is also the `X-Request-Id` response header (a caller may send its own, 8–64 of `A-Za-z0-9_-`); the server's log lines carry the same id. No answer ever contains a stack trace, a file path, SQL or another visitor's data.

| Status | `error.code` | When |
| --- | --- | --- |
| 400 | `invalid_json` | Body empty, not JSON, or not a JSON object. |
| 401 | `unauthorized` | (admin) no valid session. |
| 403 | `origin_not_allowed`, `csrf_failed`, `forbidden` | Browser request from an origin not in `CORS_ORIGINS`; admin request without its token; wrong role. |
| 404 | `not_found` | Unknown address or record. |
| 405 | `method_not_allowed` | `Allow` header lists the right ones. |
| 409 | `conflict` | (admin) a duplicate code, or a record that is in use. |
| 413 | `payload_too_large` | Body over `BODY_LIMIT_BYTES`. |
| 415 | `unsupported_media_type` | Not `application/json` (there is no multipart/upload anywhere). |
| 422 | `validation_failed`, `spam_suspected` | Fields wrong (see below); the honeypot field `website` was filled or the text had too many links. |
| 429 | `rate_limited` | `Retry-After` says how many seconds. |
| 500 | `internal_error` | Generic; the cause is in the server log under the same `requestId`. |
| 503 | `service_unavailable` | The database is not reachable. `Retry-After: 30`. A request is **never** answered "received" unless it is stored. |

Field codes (the same words the website's forms use): `required`, `tooShort`, `tooLong`, `invalidEmail`, `invalidPhone`, `invalid`, `consentRequired`, `unknown`, `duplicate`, `tooMany`. Text is cleaned before it is checked (Unicode NFC, control characters and invisible direction marks removed, whitespace trimmed), and lengths count characters as a person does (an emoji is one).

### `POST /api/contact`

```json
{ "form": "contact", "language": "hu|en|nl", "kind": "job|collaboration|project|other",
  "name": "2–100", "email": "valid, ≤254", "subject": "3–150", "message": "10–3000", "consent": true }
```

→ **201** `{ "data": { "reference": "C-K7TSYAYT", "status": "received", "createdAt": "…" } }`. The same message sent again within 10 minutes (a double click, a retry) → **200** with the *same* reference and nothing stored twice. More than 3 links in the message, or a filled `website` field → 422 `spam_suspected`. `consent` must be exactly `true` while `REQUIRE_CONSENT` is on. Stored: the message; the visitor's address only as a keyed hash. Then an e-mail to `NOTIFY_TO` is queued (§6).

### `POST /api/quote-requests`

```json
{ "form": "quote", "version": 2, "language": "hu|en|nl",
  "items": [ { "need": "website|webapp|improve|ui|integrations|unsure", "plan": "launch|grow|build|care|custom", "extras": ["pages", "…"] } ],
  "description": "20–2000", "objective": "present|leads|sell|process|improve|other|null", "reference": "≤500|null",
  "timing": "unsure|asap|weeks|months|flexible|null", "requirements": "≤2000|null",
  "name": "2–100", "email": "…", "phone": "≤30, 6+ digits|null", "consent": true }
```

→ **201** `{ "data": { "reference": "Q-…", "status": "received", "createdAt": "…", "pricing": { "fixed": [], "quotedParts": 2 } } }`. 1–8 items, ≤12 add-ons each, each package and add-on must be **active** in the catalogue, the add-on must apply to the item's need, and the package must suit it; otherwise 422 with the field (`items.0.plan` …). **Prices are never read from the request.** The server looks the codes up in its catalogue, stores the approved price of each part with the item (so a later price change does not rewrite history), and answers with the only totals there are: `fixed` sums the *published* starting prices per currency (empty while every price is "on request", which is how the catalogue starts) and `quotedParts` counts the parts priced in the quote. Unknown extra fields in the body are ignored, not trusted. More than 5 links → `spam_suspected`.

### Catalogue (read-only, `GET`, `?lang=hu|en|nl|all`, default `hu`, a missing translation falls back to `hu`, any other value → 422)

| Route | Answer |
| --- | --- |
| `/api/services`, `/api/services/:slug` | Active services: slug, category, position, packages, localised title/summary/tagline/overview/features. |
| `/api/packages`, `/api/packages/:code` | Active packages: price (`{kind:'quote'}`, `{kind:'tbd'}` or `{kind:'from',amount,currency}`, whole units), `vat`, `quoteRequired`, `featured`, `needs`, `extras`, localised texts and lists. |
| `/api/shop/services`, `/api/shop/packages` | The same lists under the shop prefix. |
| `/api/shop/extras` | Active add-ons: price, vat, `appliesTo`, name, summary. |
| `/api/shop/categories` | `[{ slug, services: [...] }]`. |
| `/api/shop/catalog` | Everything, in all languages, plus `version` and an `ETag` (`If-None-Match` → 304). The website's build reads this. |
| `/api/content/faq` | Active FAQ entries, in order. |

`Cache-Control: public, max-age=60` on these; **no customer data exists in any of them** (a test submits a message and a quote request and searches every public answer for it).

### Health

`GET /api/health` → `{ data: { status: "ok" } }` (the process is up; touches nothing). `GET /api/ready` → 200 `{ data: { status: "ready", checks: { database, migrations, email } } }` or 503 `not_ready` with `Retry-After: 10` (database unreachable or migrations pending). Neither reveals configuration beyond "e-mail configured / off".

### Limits

Per client address, fixed windows, in memory (right for one process): everything 600/min · contact 5 per 15 min · quote 5 per 15 min · catalogue reads 180/min · sign-in 10 per 15 min (plus the account lock, §7) · administration 300/min. Behind a proxy set `TRUST_PROXY`, or every visitor shares the proxy's address.

### CORS

Only origins listed in `CORS_ORIGINS`, exactly, get `Access-Control-Allow-Origin` (no wildcard, no credentials, methods `GET, POST, OPTIONS`, headers `Content-Type, If-None-Match`). A **browser** `POST` from any other origin is refused with 403 before anything is stored (so another site cannot make a visitor's browser submit the form). Requests with no `Origin` header (servers, scripts, `curl`) are not browsers and are accepted — the rate limit and the spam checks are what apply to them. The administration never gets CORS headers.

## 5. The administration

`/admin` — server-rendered HTML, **no JavaScript at all** (its Content-Security-Policy is `default-src 'none'; style-src 'self'; form-action 'self'; frame-ancestors 'none'`), `noindex`, `no-store`. It works on a phone and without scripts. Every action is also an endpoint under `/api/admin/*` with the same checks.

**Who:** accounts are created only from the command line (§1); there is no sign-up page or endpoint. Two roles:

| Permission | `admin` | `editor` |
| --- | :-: | :-: |
| Read messages/quote requests, change status, add notes, archive, export | ✓ | ✓ |
| Create/edit services, packages, add-ons, FAQ and content | ✓ | ✓ |
| Delete a message or quote request for good; delete catalogue rows and content | ✓ | — |
| System page, maintenance, publish | ✓ | — |

The check is made in the business functions, not in the page, so the JSON routes cannot forget it (a test calls every admin route without a session, and with the wrong role).

**Signing in.** Password hashed with scrypt (N=32768, r=8, p=1, per-account salt; minimum 12 characters, a list of common passwords refused). Wrong address, wrong password and a disabled account give the same answer. Five wrong passwords lock the account for 15 minutes (even the right password then fails); ten attempts per 15 minutes per address are allowed in total. A session is a random 256-bit token in an `HttpOnly`, `SameSite=Strict` cookie (`cc_admin`; `__Host-cc_admin` and `Secure` over https); only its SHA-256 is stored. It ends after `ADMIN_IDLE_MINUTES` unused or `ADMIN_SESSION_HOURS` at most, on sign-out, when the account is disabled, and — for every *other* session — when the password changes. Every state-changing request needs the session's CSRF token (form field `_csrf` or header `X-CSRF-Token`) **and** a same-origin request (`Origin` / `Sec-Fetch-Site`).

**Pages.**

- **Dashboard** — real counts only: messages and quote requests by status, received in the last 7 and 30 days, the latest five of each, the e-mail queue (accepted / waiting / failed). Nothing is estimated or invented; there are no visitor statistics because the server does not measure visitors.
- **Messages** and **Quote requests** — list with search (name, e-mail, subject/description, text, reference), status filter, archived filter, 25 per page. A record shows everything sent, a status control (messages: new, in progress, answered, closed; quote requests: new, in review, quoted, accepted, declined, closed) with an optional **"e-mail the customer"** box (off by default; sends a short status e-mail with an optional note — the only e-mail that ever goes to a customer), internal notes, archive/restore, and (admin) delete. Quote requests also show their items with the price each was requested at, and export as **CSV** (the current filter; cells that start with `=`, `+`, `-`, `@` are neutralised against spreadsheet formulas) or **JSON** (one request, complete).
- **Catalogue** — services, packages, add-ons and FAQ/content, each editable in all three languages: price (on request / to be decided / "from" an amount in EUR or HUF, with the VAT mode — an incomplete published price is refused), texts, lists, associations, status. A rejected form is shown again with the problems next to the values typed. Rows that requests refer to are disabled, not deleted. How edits reach the public website: §8.
- **System** (admin) — the configuration without secrets, schema version, request/error counters since start, e-mail queue and the last failures, the last administrator actions (audit log: who, what, which record — never message text), "Run maintenance", "Publish".
- **Account** — change your password.

## 6. E-mail

Providers: `none` (default — nothing is sent; requests are still stored and the dashboard says e-mail is off), `smtp` (a small built-in client: implicit TLS or STARTTLS, `AUTH PLAIN`/`LOGIN`, never sends credentials in clear text over `SMTP_SECURE=none` in production, header-injection guarded), `file` (development: `.eml` files).

**Flow.** A notification is a row in `email_deliveries` *first* and an e-mail second: the visitor's request is stored and answered, then the message is rendered from the stored record and handed to the provider in the background. States: `pending` → `accepted` (the provider took it), `failed` (a permanent refusal, or `EMAIL_MAX_ATTEMPTS` reached), `cancelled` (the record was deleted). A temporary failure (4xx, dropped connection, timeout, refused connection) is retried after 1, 5, 30, 120, 720 minutes; the attempt count and a sanitised error (addresses masked) are kept. A message stuck as "sending" after a crash is picked up again. Two runs never send the same message twice.

**What is recorded is *accepted by the provider*, never "delivered".** SMTP cannot promise delivery; the dashboard and the System page say so in words.

| Kind | To | When |
| --- | --- | --- |
| New message / new quote request | `NOTIFY_TO`, in `NOTIFY_LANGUAGE`, `Reply-To` = the visitor | Automatically after each stored (not duplicate) submission. |
| Status change | The address the visitor typed, in the language they used | Only when an administrator ticks "e-mail the customer". No automatic confirmation is sent to an address a stranger typed (that would let anyone have the site send mail to anyone). |

Templates exist in Hungarian, English and Dutch (HTML + plain text, table layout with inline styles because mail clients ignore the rest, the site's colours); what a visitor typed is escaped in the HTML and printed as text in the plain part; a subject never contains a line break.

## 7. Security, in one place

| Concern | What is done | Where it is tested |
| --- | --- | --- |
| Secrets | Only from the environment, validated at start, never logged, never in an answer; `.env` ignored by git; the System page shows "set", not the value. | `reliability`, `security` |
| Input | Every field checked on the server with explicit limits; the website's rules are the server's rules (compared in a contract test). | `public`, `contract` |
| SQL injection | Parameterised statements only; the source is scanned for SQL built from values. | `security` |
| XSS | The admin escapes every value through one `html` template; no script is allowed by CSP; stored hostile input is rendered back and checked. | `admin`, `security` |
| CSRF / cross-site | Per-session token + same-origin check on admin writes; CORS allow-list; browser POSTs from other origins refused. | `auth`, `security` |
| Authentication | scrypt, generic failures, lockout, per-address limit, hashed session tokens, idle + absolute expiry, no registration. | `auth` |
| Authorisation | Permissions checked in the business functions; every admin route tried with no session and with the wrong role. | `auth`, `admin` |
| Abuse | Rate limits, honeypot, link counting, duplicate detection, 64 kB body, JSON only. | `security`, `public` |
| Headers | `nosniff`, `no-referrer`, `X-Frame-Options: DENY`, COOP, Permissions-Policy, strict CSP per area, HSTS in production, `no-store` on anything personal. | `security` |
| Errors | One envelope; no stack, path or SQL. | `security`, `reliability` |
| Supply chain | No runtime dependencies (a test fails if the server imports a package); `npm audit`: 0 known vulnerabilities (dev tooling included). | `security` |
| Static serving | No path traversal, no hidden files, only website file types. | `security` |
| Uploads | None exist; multipart is refused everywhere. | `security` |

## 8. How the website and the backend fit together

- **Forms.** `VITE_API_URL` (build time) points the website's contact form at `/api/contact` and the quote builder at `/api/quote-requests`; `/` means "the same origin" (use it with `STATIC_DIR`). `VITE_CONTACT_ENDPOINT` / `VITE_QUOTE_ENDPOINT` still win when set. With none of them the forms say they cannot send and never claim success.
- **Contract.** The website's request builders (`toContactRequest`, `toRequest`) and the server's parsers are held against each other in `server/test/contract.test.ts`: the limits, the vocabularies, every package × need × add-on combination the shop can build, and the edges of every field are accepted or refused by both sides alike.
- **Catalogue.** The website's static content is the **seed**: on an empty database the server loads `server/seed/catalog.seed.json` (made from the website's content by `npm run catalog:seed-export`). After that the **database is the master copy**. Edits made in the administration reach the website at its next **build**: `npm run catalog:pull` (with `CATALOG_API_URL` set to the backend's origin) writes `src/content/catalog.generated.json` (git-ignored) and the content modules lay it over the static text and prices (`src/content/catalogOverlay.ts`); then `npm run build`. The pull reports in plain words anything it cannot use. `--check` says whether the file is current; `--remove` deletes it. "Publish" in the System page calls `DEPLOY_HOOK_URL` for a host that rebuilds on request.
- **What reaches the site and what does not.** Prices, VAT modes, the texts (tagline, audience, scope, customisation, support, lists) of the packages and add-ons the website already has, `featured`/`quoteRequired`, and the whole FAQ. **Not** which packages, add-ons and services *exist*, which needs a package suits, or the service pages' texts: the pages, the cart and the quote form are built around those, so they remain part of the website's source. Consequences to know: disabling a package in the administration makes the backend *refuse requests for it* at once, but the website keeps offering it until it is removed from `src/content/packages.ts` too; a service created in the administration appears in the API but has no page. (The overlay was verified end-to-end: an edit through the admin HTTP API, `catalog:pull`, `npm run build` — the price, the edited tagline and a new FAQ entry were found in the production bundle.)

## 9. Deployment

What a deployment needs: Node ≥ 22.18; the `server/` folder (and `server/seed/`); a **persistent disk** for `DATABASE_PATH`; the environment variables of §2; TLS in front (a reverse proxy or the host's edge) — the server speaks plain HTTP.

Production checklist:

1. `APP_ENV=production`, a real `APP_SECRET` (`openssl rand -base64 48`), `DATABASE_PATH` on the persistent disk, `API_PUBLIC_URL`/`PUBLIC_URL` as https origins, `CORS_ORIGINS` the website's origin(s) (empty if the same process serves the site), `TRUST_PROXY=1` behind one proxy.
2. E-mail: `EMAIL_PROVIDER=smtp` with the owner's provider, `EMAIL_FROM`, `NOTIFY_TO`, `NOTIFY_LANGUAGE`, `BRAND_NAME`. Send yourself a test message through the form and look at the System page: *accepted* means the provider took it. (Not done here: no provider or address was available.)
3. `npm run server:cli -- check` — fix whatever it lists. Create the administrator(s). Start.
4. `GET /api/ready` returns 200. Put it in the host's health check; `GET /api/health` is the liveness probe.
5. Decide `RETENTION_DAYS` and tell visitors in the privacy notice; schedule `server:backup` and test a restore.
6. One process only. Restart policy: any (`systemd`, the host's); the server exits 0 on `SIGTERM` after finishing requests in progress.

To serve the website from the same process: `npm run build`, then set `STATIC_DIR` to `dist/` (and `VITE_API_URL=/` when building). The server then serves pages, assets and the build's own `404.html` with the build's `_headers` (the Content-Security-Policy it was tested under), never outside that folder, nothing hidden, only website file types; `/api/*` and `/admin/*` are never answered by the website. Compression and caching of assets are the proxy's job. A sketch for a reverse proxy (**untested here**, adjust to the host):

```
api.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Updating: pull the new code, `npm run server:backup`, restart (migrations run at start). Rolling back a migration means restoring the backup.

## 10. Privacy: what is stored

The backend stores only what the two forms collect, plus what running it requires. This is a technical inventory to support the owner's privacy notice and policy; it is not a legal assessment.

| Data | Held in | Why | Leaves the database by |
| --- | --- | --- | --- |
| Name, e-mail, subject, message, topic, language, time of consent | `inquiries` | To answer the message | Admin delete; `erase <email>`; retention (`closed` or archived) |
| Name, e-mail, phone, description, aims, references, requirements, timing, language, items with the approved price of each | `quote_requests`, `…_items`, `…_item_extras` | To quote | Same |
| A keyed hash (HMAC with `APP_SECRET`) of the sender's network address; a keyed hash of what was said | `ip_hash`, `content_hash` | Abuse correlation; recognising a double submission. Not reversible without the secret; the address itself is **never stored** | With the record |
| Internal notes | `*_notes` | The owner's own working notes (may repeat personal data an administrator typed) | With the record |
| Recipient address, the note an administrator wrote, state, attempts, a masked error | `email_deliveries` | The delivery log and retry | With the record; retention; `erase` |
| Administrator e-mail, password hash, role, last sign-in; session token **hash**, CSRF token, address hash, first 200 characters of the browser's user-agent | `admin_users`, `admin_sessions` | Signing in | Sessions: expiry/sign-out; accounts: disabled (not deleted) |
| Who did what to which record (no message text) | `audit_log` | Accountability | Kept (administrator actions only) |
| Request id, route, status, duration | server log (stdout) | Operation | The log's own rotation. Bodies, names, addresses, passwords, tokens and cookies are never logged (field names that look like them are replaced before writing) |

The public website sets no cookie through the backend; the only cookie it ever issues is the administration's session cookie. Browser-side storage on the website (cart choices, theme, consent) is described in the website's privacy notice and is not touched by the backend. Nothing is sent to a third party except the e-mail to the SMTP provider the owner configured (and the deploy hook, if set). Retention defaults to **keep everything until deleted** because that choice belongs to the owner — set `RETENTION_DAYS` and say so in the notice.

## 11. Tests and what they showed

```bash
npm test             # website + backend
npx vitest run server # the backend only, about 25 s
```

Run on 2026-11-03 (Windows 11, Node 22.23): **1315 passed, 0 failed** (website 1061 in 49 files; backend 254 in 11 files). `tsc -b` (website, tooling and server projects): clean. `oxlint`: clean. `npm run build`: passes. `npm audit`: 0 vulnerabilities (the server has no runtime dependencies). Secret scan of the repository for private keys and provider tokens: nothing.

| File | Tests | What it exercises |
| --- | --: | --- |
| `database.test.ts` | 15 | Migrations (checksums, failure leaves the old version, newer-schema refusal), constraints, transactions, the wrapper's error mapping. |
| `public.test.ts` | 56 | Contact and quote endpoints: every validation edge, sanitisation, duplicates, spam heuristics, prices never read from a request, disabled catalogue items, 503 when unseeded, notification queued. |
| `catalog.test.ts` | 9 | The public catalogue: languages and fallback, ETag/304, only active items, no customer data in any answer. |
| `auth.test.ts` | 25 | Hashing, sign-in, generic failures, lockout and recovery, rate limit, cookie flags, idle/absolute expiry, sign-out, password change, no-session access to every admin route, roles, CSRF, origin checks. |
| `admin.test.ts` | 36 | Messages and quote requests (filters, search, paging, status, notes, archive, delete, customer e-mail, audit log), CSV/JSON export incl. formula neutralisation, catalogue and content management with price rules, HTML pages and their headers, escaping of hostile input, forms. |
| `notifications.test.ts` | 29 | Templates in three languages and escaping, MIME and header-injection refusal, the SMTP client against a mock SMTP server that speaks the protocol (AUTH PLAIN/LOGIN, STARTTLS and implicit TLS with a generated self-signed certificate, 4xx/5xx at every step, dropped and silent servers, refused connections), the outbox (retry schedule, give-up, cancel, crash recovery, no double send), end-to-end through the real mailer. |
| `security.test.ts` | 32 | SQL-injection strings through every input path, headers, CORS (allowed, denied, preflight), rate limits with the limiter on, body and header limits, malformed/hostile JSON, prototype pollution, no secrets or personal data in logs or answers, static serving and path traversal, no-dependency and no-shell/no-string-SQL source scans. |
| `reliability.test.ts` | 23 | Configuration validation (production refusals, every variable), database unavailable → 503 and "not ready", half-failed writes leave nothing behind, 30 and 12 simultaneous submissions, restart persistence and no re-seed over edits, retention/erase, graceful shutdown waits for work in progress. |
| `process.test.ts` | 11 | The real programs in an empty folder: clean start (migrate, seed, ready, accept a message), restart, exit 78 on bad configuration, refusal on a taken port or missing migrations, every CLI command, backup of a live database. |
| `contract.test.ts` | 17 | The website's modules against the running backend (§8). |
| `smoke.test.ts` | 1 | The app starts. |

**Bugs found while testing this work (all fixed, each now has a regression test):**

- *Found only by using a real browser* — the sign-in form was refused: a browser sends `Origin: null` with a form post from a page served with `Referrer-Policy: no-referrer`, and the same-origin check treated that as a foreign site. Every simulated test had passed because the tests sent the headers a browser *should* send. The check now trusts `Sec-Fetch-Site`, and the CSRF token still decides when it is absent.
- The same reasoning exposed a second one: a website served by the same process, posting its forms with an empty `CORS_ORIGINS`, would have been refused as "another origin".
- Configuration values read after the validity check were never validated (`EMAIL_MAX_ATTEMPTS`, `ADMIN_*`, `BODY_LIMIT_BYTES`, the true/false flags): a typo silently became the default.
- An inline `style` on the admin's sign-out button that the admin's own CSP blocks.
- Sign-ins were not in the audit log; sessions unused past the idle limit were not purged.
- Shutdown cut requests in progress; an address with a line break would have been retried as if the failure were temporary.
- The CLI lost the second line of a piped password; unknown admin pages and a POST to the website's addresses answered with the wrong shape.
- The duplicate fingerprint was an unkeyed hash of personal data (now an HMAC); the static server would have served a database or `.env` if pointed at the wrong folder.
- Two assertions in the admin tests compared against a property that did not exist (caught by the type-check).

### What was **not** verified — read this before relying on it

- **No real mail provider.** E-mail was proven against a protocol-speaking mock and a self-signed certificate, not against a real SMTP service (no provider, sender or recipient address exists to test with). Deliverability, SPF/DKIM/DMARC and spam-folder behaviour are the owner's to check; the system only claims *accepted by the provider*.
- **No production deployment.** Nothing was deployed; the reverse-proxy sketch, backup schedule and restart policy are untested. Graceful shutdown on `SIGTERM` was exercised through `app.close()`, not by signal, because the development machine is Windows (a signal there ends the process outright).
- **The administration was checked by tests and HTML assertions, and once by eye** in the in-app browser (Chromium) against a real server with example data: sign-in through the form, the dashboard, the quote-request list and detail, a status change with the customer e-mail ticked (the Hungarian e-mail it queued was read from disk), a package's edit form, and the dashboard at 375 px wide (the menu wraps, nothing scrolls sideways). That is *not* an accessibility audit (no screen-reader or keyboard-only pass), and no other browser, and no real phone, was used.
- **No load or performance measurement.** The in-memory limiter and the single SQLite writer are right for a portfolio's traffic and wrong for a busy service.
- **Rate limiting is per process.** A second instance would double every limit; SQLite supports one writer host. Scaling out means porting the database layer (one file) and sharing the limiter.
- **`node:sqlite` is experimental in Node 22.** It worked throughout; a future Node major may change it, which the wrapper file contains.
- **The website's forms do not send the honeypot field or a fill-time**, so those two spam checks exist on the server but do nothing against a bot until the forms carry them. The rate limit, link counting, duplicate detection and consent check are active.
- **Server-side cart:** none, on purpose (the cart holds choices only and lives in the visitor's browser).
- **Not built, by design:** online payment and checkout (every price is "on request" and the backend never takes a price from a request), customer accounts, file uploads, any AI or 3D-generation endpoint, a visitor-analytics store.
