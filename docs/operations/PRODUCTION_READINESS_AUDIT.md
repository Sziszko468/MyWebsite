# Production readiness audit (PROMPT 26, read-only)

Audit only. Nothing was implemented, deployed, merged, rebased, cherry-picked, pushed or switched; no branch was created or modified; no dashboard, DNS, Render, Cloudflare, Google, SMTP or Drive setting was read or changed; no secret was read or printed; no e-mail was sent; no real backup or restore was run; no production endpoint was contacted. The only change this audit made to the repository is this file. It was written as an uncommitted file and committed afterwards, on the owner's request, together with `INTEGRATION_PLAN.md` and `INTEGRATION_EVIDENCE_CHECK.md` (`git log -- docs/operations/PRODUCTION_READINESS_AUDIT.md`).

## 1. Audit date, branch and commit

| | |
| --- | --- |
| Audit date | 2026-11-17 |
| Audited branch | `feature/consultation-booking` (the branch PROMPT 25 was committed and pushed on) |
| Audited commit | `29f4b316dffb571fe9ef0f104e7be9bc945327b9` (= `origin/feature/consultation-booking`) |
| Working tree before the audit | clean (0 changed files) |
| Where it was audited | the worktree `MyWebsite-ops`; no branch was switched |
| The session's primary checkout | on a different branch (`feature/client-communication`, `8c377ad`, 52 uncommitted changes that belong to another piece of work). It does **not** contain PROMPT 25 (`git merge-base --is-ancestor 29f4b31 HEAD`: no). It was not touched. |
| Protected branches | `main` (local `77c0df4`, `origin/main` `254a202`) and `deployment/render-cloudflare` (`217c6d4`, local and origin) were only read, never written |
| Environment change made for a check | `npm install --no-save hunspell-asm` in this worktree (it changes `node_modules` only; tracked files unchanged, tree still clean). CI does the same for its run. |

## 2. Scope, evidence types and limitations

**Evidence tags used in every table below**

| Tag | Meaning |
| --- | --- |
| **[R]** | Repository fact: read in the code or the docs at `29f4b31` (file and line given) |
| **[E]** | Executed in this audit: a command was run now and its result is in section 12 |
| **[H]** | Historical: observed by an earlier audit (`docs/audit/*`, 2026-11-13) or a project note; **not re-verified now** |
| **[O]** | Owner-reported: said by the owner, not seen by this audit |
| **[A]** | Assumption: stated as such, never used as evidence |

**Statuses:** VERIFIED · NOT VERIFIED · OWNER ACTION REQUIRED · BLOCKED · NOT APPLICABLE. An item is VERIFIED only when the evidence for exactly that statement was seen in this audit ([R] or [E]); [H] and [O] items are NOT VERIFIED until somebody looks.

**Limitations (read these first)**

1. No dashboard (Render, Cloudflare, Google Cloud, the mail provider) was accessible. Every statement about their settings is NOT VERIFIED or OWNER ACTION REQUIRED.
2. No production URL, DNS record or mail server was contacted (not even a read-only `GET`). What the live site did on 2026-11-13 is quoted from `docs/audit/INFRASTRUCTURE_AUDIT.md` as [H].
3. The GitHub CLI is not installed here. CI status was read from GitHub's **public REST API, unauthenticated and read-only** (the repository is public). Nothing was created or triggered.
4. The scratch restore drill of PROMPT 25 (`docs/operations/RESTORE_DRILL.md`) is **not** a verified production restore, and no restore from a real Google Drive download has ever been done.
5. A green local test run proves the code behaves on this Windows machine with Node 22.23.1. It does not prove Linux, Render's Node version, the hosting configuration, DNS, mail authentication or Google settings.
6. The Gmail integration exists only on `deployment/render-cloudflare` (`217c6d4`), not at the audited commit. It was read for the OAuth question only (`git show`, read-only), not audited.

## 3. Executive summary

At the audited commit the **application code is in good local shape**: typecheck, lint, 132 test files (2 720 tests), the language checks (with the spell checker CI installs), the production build and the SEO checks all pass when run now ([E], section 12). PROMPT 25 added backup records, optional encryption, migration snapshots, the System page's Command Center, and read-only smoke and CI tooling, and the code supports what its documents say.

What stands between this commit and production is **not the code, it is the delivery path and the unverified environment**:

1. **PROMPT 25 is not on the branch that deploys.** `deployment/render-cloudflare` (`217c6d4`) contains neither PROMPT 25 nor the consultation booking. The two lines of work have diverged (3 commits on one side, 13 on the other, 18 files changed by both, and different migration numbers). Nobody has merged or tested them together.
2. **A database that has applied one lineage's migrations will not start under the other's code.** The migration runner refuses to start when the database holds a migration the code does not know (`server/src/db/migrate.ts:79`). Deployed alone, either lineage can take the site down.
3. **GitHub CI has never passed.** The repository has had exactly one CI run in its life: a failure on `main@254a202` (2026-11-11, at `npm test`). There is no CI run for the audited commit, because a push to a feature branch does not trigger CI and no pull request exists.
4. **Every production-side fact is unverified**: the disk, `DATABASE_PATH`, the environment variables, `TRUST_PROXY`, Render's Node version, build and start commands, the health-check path, the deployed branch, Cloudflare's SSL mode and redirect direction, mail authentication (SPF, DKIM, DMARC), and the OAuth consent status.
5. **Backups are not yet protective in practice**: encryption is optional and no key is known to be set; no real Google Drive backup, download or restore has been verified.

## 4. Recommendation

# NO-GO

for deploying the audited commit, or relying on the PROMPT 25 hardening, in production **today**.

It becomes **CONDITIONAL GO** when blockers B-1 to B-5 in section 14 are closed. None of them needs a new feature; they are an integration step, a green CI run on Linux, and the owner's dashboard verification. This is a statement about readiness evidence, not about the quality of the code, and it is not a statement that the live site is unhealthy (it was observed healthy on 2026-11-13 [H], and was not looked at now).

## 5. Findings at a glance

| ID | Severity | Finding |
| --- | --- | --- |
| F-01 | HIGH | The deployment branch lacks PROMPT 25 and the booking; the two lineages have diverged and were never integrated |
| F-02 | HIGH | An older or newer code line refuses to start on a database that has the other's migrations (outage, data safe) |
| F-03 | HIGH | GitHub CI has never passed; no CI evidence exists for the audited commit |
| F-04 | HIGH (if `TRUST_PROXY` is still 0) | Behind a proxy, `TRUST_PROXY=0` makes all visitors one address: shared global limit and shared sign-in lock |
| F-05 | MEDIUM | Rollback guidance in the PROMPT 25 runbook is incomplete: a code rollback fails after a migration ran |
| F-06 | MEDIUM | The persistence warning covers `MEDIA_DIR` only; `DATABASE_PATH` can silently default to the application's own filesystem |
| F-07 | MEDIUM | Backup encryption is optional and its key is not known to be set; the key is a single point of loss |
| F-08 | MEDIUM | The backup holds every file in memory and uses a single-request upload; no size guard |
| F-09 | MEDIUM | E-mail documentation describes Resend; the owner reports SMTP via Cloudflare; mail authentication is unverified and cannot be checked by the app for SMTP |
| F-10 | MEDIUM | No MFA on the administration; an administrator session can also trigger the deploy hook if one is set |
| F-11 | MEDIUM | No staging environment: every deploy goes straight to the live site (carried over from the 2026-11-13 audit) |
| F-12 | LOW | Several secrets are not in the log redaction list (they are protected by other layers) |
| F-13 | LOW | `HOST` defaults to `127.0.0.1`; hosting needs `0.0.0.0`; nothing in the repository says so |
| F-14 | LOW | `/api/ready` cannot tell a fresh empty database from the real one |
| F-15 | INFORMATIONAL | HSTS `includeSubDomains` is sent by the API and admin but (2026-11-13) not by static pages |
| F-16 | INFORMATIONAL | `npm run i18n:validate` fails (exit 1, 508 errors) in a checkout without the spell checker; it passes with it |
| F-17 | INFORMATIONAL | 87 sentence-based browser-journey assertions remain; journeys are manual and outside CI |
| F-18 | INFORMATIONAL | `docs/production/README.md` still shows `TRUST_PROXY=1` in a sample command |

No finding is CRITICAL on the evidence available. F-01 to F-03 are the ones that block a release.

## 6. Render checklist

Render's dashboard was not accessible. The repository has **no `render.yaml`** [R], so the service is configured only in the dashboard.

| ID | Item | Status | Evidence |
| --- | --- | --- | --- |
| RN-01 | A persistent disk exists, mounted at `/var/data` | NOT VERIFIED, OWNER ACTION REQUIRED | [O] `/var/data`. The code requires persistent storage for the database and the pictures [R] (`server/src/config.ts:303`, `:419`; `server/src/main.ts:63-66`). Without a disk both are lost at every deploy ([H] DATABASE_AUDIT). |
| RN-02 | `DATABASE_PATH` points inside the disk | NOT VERIFIED, OWNER ACTION REQUIRED | Production accepts any file path and defaults to `./data/app.sqlite` (relative to the checkout) when unset: `config.ts:303-304` only refuses `:memory:`. Demonstrated: a production-like `check` with no `DATABASE_PATH` printed "Configuration is valid" [E]. See F-06. |
| RN-03 | `MEDIA_DIR` points inside the disk | NOT VERIFIED | Defaults beside the database (`config.ts:419`). The server logs a warning in production if the media folder is on the application's filesystem (`storage.ts:49`, `main.ts:66`): VERIFIED in code, actual state NOT VERIFIED. |
| RN-04 | No persistent data in temporary directories | VERIFIED | `os.tmpdir()` is used by the backup's temporary database copy, removed in a `finally` (`backups/artifacts.ts:99-111`), and for the in-memory test database's media only (`config.ts:419`). The `file` e-mail provider (writes to `./data/mail`) is refused in production (`config.ts:321`). |
| RN-05 | Disk capacity fits the data, the migration snapshots and a backup copy | NOT VERIFIED | The seeded database is about 1.1 MB, uploads are limited to 6 MiB each (`mediaMaxBytes` 6291456) [E]. Each migration snapshot is a full copy kept 14 days by default; a backup run writes one temporary full copy. The disk's size is unknown. The System page shows free space (`system/operations.ts`). |
| RN-06a | The repository declares a Node version that supports `node:sqlite`, and the suite passes on a current one | VERIFIED | `engines.node >=22.18` [R] (`package.json:7`), CI pins 22.18 [R]. This audit ran everything on 22.23.1 [E]. |
| RN-06b | Render runs that Node version, and 22.18 itself works | NOT VERIFIED, OWNER ACTION REQUIRED | The repository has no `.node-version`, `.nvmrc` or `render.yaml`, so Render's version is dashboard-only. 22.18 was never run by this suite (CI has never been green, F-03). |
| RN-07 | Build command | NOT VERIFIED | Not in the repository. It must produce the site with the right build variables (`VITE_SITE_URL`, and `VITE_API_URL=/` for a same-origin backend) [R] (`.env.example`, docs). |
| RN-08 | Start command | NOT VERIFIED | Not in the repository. The project's own is `npm run server:start` [R] (`package.json`). |
| RN-09 | The server listens where Render can reach it | NOT VERIFIED | `HOST` defaults to `127.0.0.1` (`config.ts:278`; `.env.example:21`). A hosted service normally has to listen on all interfaces; the repository does not document it (F-13). The live site worked on 2026-11-13 [H], so it is presumably set. |
| RN-10 | Health check path | NOT VERIFIED | `/api/health` (liveness, touches nothing) and `/api/ready` (database answers and schema current) exist and are never redirected by the canonical safeguard (`http/canonical.ts:34`, `system/health.ts`) [R]. Which path Render uses: dashboard. |
| RN-11 | Deployment branch and auto-deploy | NOT VERIFIED, OWNER ACTION REQUIRED | Not in the repository. Project notes treat `deployment/render-cloudflare` as production [H]. If auto-deploy is on, a push to that branch deploys. The admin can also call a deploy hook when `DEPLOY_HOOK_URL` is set (`modules/admin/routes.ts:335-348`) [R]. |
| RN-12 | One always-on instance | NOT VERIFIED, OWNER ACTION REQUIRED | The design needs exactly one instance that never sleeps: SQLite has one writer, the limits are in memory, the backup and e-mail outbox are timers in the process [R]. Nothing prevents a second instance from being started. |
| RN-13 | Environment variable names (required / optional) | NOT VERIFIED | See the table below. Values were never read. |
| RN-14 | `TRUST_PROXY` | OWNER ACTION REQUIRED | [O] was `0`, unverified. See section 6.2. |
| RN-15 | The running commit is the intended one | NOT VERIFIED | The System page's Deployment panel shows it (reads `RENDER_GIT_COMMIT`) [R]; the dashboard's Events list is the authority. |
| RN-16 | Service logs show no start-up warning | NOT VERIFIED | The server logs the misconfigurations it can see (`main.ts:63-74`): media on the application's filesystem, `RETENTION_DAYS`, `TRUST_PROXY is 0`, e-mail without `NOTIFY_TO`, paused e-mail, no reply-to. |

### 6.1 Environment variable names (names only; no value was read)

From `server/src/config.ts` and `.env.example` [R]. "Required" is what the code **enforces** in production; "needed in practice" is what the site cannot work without although the code lets it start.

| Group | Variables | Status in code |
| --- | --- | --- |
| Runtime | `APP_ENV=production`, `APP_SECRET` (at least 32 characters, not a placeholder) | Required (start-up refuses otherwise) |
| Runtime | `HOST`, `PORT`, `STATIC_DIR` | Needed in practice (defaults `127.0.0.1`, `8787`, none) |
| Storage | `DATABASE_PATH`, `MEDIA_DIR` | Needed in practice; **not enforced** (F-06) |
| Addresses | `PUBLIC_URL`, `API_PUBLIC_URL`, `CORS_ORIGINS` | `PUBLIC_URL` optional to the validator, **needed in practice**: without it booking and quote links in e-mails are omitted and customer notifications are off (`bookings/mail.ts:74`, `notifications/notifier.ts:231`) |
| Proxy | `TRUST_PROXY` | Optional, default 0; a start-up warning in production when 0 |
| E-mail | `EMAIL_PROVIDER` (`none`, `smtp`, `file`, `resend`; `file` refused in production), `EMAIL_FROM`, `NOTIFY_TO`, `EMAIL_REPLY_TO`, `EMAIL_ENABLED`, `EMAIL_MAX_ATTEMPTS` | `smtp` needs `EMAIL_FROM`, `SMTP_HOST`; user and password together; `SMTP_SECURE=none` and unverified TLS refused in production |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS_REJECT_UNAUTHORIZED` | see above |
| Cloudflare read-only checks | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_ACCOUNT_ID` | Optional; all three or none |
| Backup | `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN` (all or none), `GOOGLE_DRIVE_FOLDER_ID`, `BACKUP_RETENTION_DAYS`, `BACKUP_HOUR_UTC`, `BACKUP_ENCRYPTION_KEY` | Backups are off unless the three Google values are set; **encryption is optional** |
| Migrations | `MIGRATE_ON_START`, `SEED_ON_START` (both default true), `MIGRATION_SNAPSHOT_DAYS`, `MIGRATION_SNAPSHOT_DIR` | Optional |
| Hosting | `CANONICAL_REDIRECT` (default false), `DEPLOY_HOOK_URL`, `RENDER_GIT_COMMIT` / `GIT_COMMIT` (read only to show the commit) | Optional |
| Assistant | `ANTHROPIC_API_KEY`, `AI_*`; `ANTHROPIC_MODEL` is refused if it differs from the required model | Optional; the assistant is off without a verified key |
| Build time (website) | `VITE_SITE_URL`, `VITE_API_URL` | Needed in practice (canonical host; same-origin backend) |
| Data retention | `RETENTION_DAYS` | Optional; a warning in production when unset |

### 6.2 Proxy and client address

| Item | Status | Evidence |
| --- | --- | --- |
| How the client address is derived | VERIFIED | `clientIp` (`server/src/http/request.ts:64-76`): with `TRUST_PROXY=N` it takes the N-th entry from the right of `X-Forwarded-For`; with 0 the header is ignored and the socket address is used |
| What happens with the wrong number | VERIFIED | Too low: every visitor looks like the proxy, so the global limit (600 per minute for all requests, `http/rateLimit.ts:52`, applied to every request including static files, `app.ts:151`) and the sign-in limit (10 per 15 minutes, `rateLimit.ts:59`) are shared by everybody. Too high: a visitor can choose their own address. |
| How the administrator verifies the real client IP | VERIFIED (code and tests), NOT VERIFIED on the real service | Administration → Settings → System → **Network**: it shows the address the server uses for **your own request**, the connection's own address, the `X-Forwarded-For` chain, `CF-Connecting-IP` if Cloudflare sent it, a verdict, and a measured number when it can (`system/operations.ts:79-99`; `docs/operations/README.md`). The right value is the one for which the shown address is your own public address, confirmed from a second network. |
| The Cloudflare and Render chain assumptions | NOT VERIFIED | [H] the live site was served by Render with `Server: cloudflare`, so there is at least one proxy in front. The number of hops is not in the repository and is not guessed here. |
| A recommended value | NONE GIVEN | By instruction: no change without measured evidence. |
| Current production value | NOT VERIFIED | [O] was `0`. The start-up log warns when it is 0 in production (`main.ts:70`). |

## 7. Cloudflare checklist

Expected canonical host: **`https://szilardkiss.com`** (the apex) [O decision; enforced in code and CI [R]]. Cloudflare's dashboard was not accessible.

| ID | Item | Status | Evidence |
| --- | --- | --- | --- |
| CF-01 | Apex is the canonical host in the code | VERIFIED | `VITE_SITE_URL` drives the sitemap, canonical links and hreflang; `scripts/check-seo.mjs` fails when the built site names another host (`EXPECTED_SITE_ORIGIN`); `server/test/canonicalHost.test.ts` holds the sitemap host to the redirect target; the production-like build with `https://szilardkiss.com` passed `check:seo` (101 files, 82 indexable) and the same check with `https://www.szilardkiss.com` expected fails [E] |
| CF-02 | Production actually serves and redirects to the apex | NOT VERIFIED, OWNER ACTION REQUIRED | [H] on 2026-11-13 the apex answered `301` to `www` and `www` was served by Render: the opposite direction. The decision is not applied in production until the owner changes Render's primary domain, `PUBLIC_URL`, the build variable and Cloudflare's redirect. |
| CF-03 | Redirect direction and loop risk | NOT VERIFIED | The in-server 301 is off by default (`CANONICAL_REDIRECT`, `config.ts:444`). It must only be switched on after a dashboard rule that sends the traffic the other way has been **removed**, or the two redirect each other forever (documented in `http/canonical.ts` and `docs/operations/README.md`). The dashboard rule's direction: unknown. |
| CF-04 | DNS records for the site | NOT VERIFIED | [H] 2026-11-13: apex and `www` were proxied A records. Nothing was looked up now. |
| CF-05 | SSL/TLS mode is Full (strict) | NOT VERIFIED, OWNER ACTION REQUIRED | Not readable from outside, not in the repository. The repository expects Full (strict) [H] (INFRASTRUCTURE_AUDIT C-2). |
| CF-06 | Worker `mywebsite` does not intercept the application | NOT VERIFIED, OWNER ACTION REQUIRED | `wrangler.jsonc` defines a Worker with static assets and **no `routes`** [R]; [H] on 2026-11-13 the Worker was not in the request path (Render answered). A Worker route or custom domain attached to `szilardkiss.com` would change that. |
| CF-07 | A Cloudflare build pipeline connected to the repository | NOT VERIFIED, OWNER ACTION REQUIRED | A project note records the Worker as deployed from GitHub by "Workers Builds" (build `npm run build`, deploy `npx wrangler deploy`) [H]. Which branch it builds, and whether branches other than the production branch are built, is unknown. The audited branch was pushed on 2026-11-17; whether that started any build is unknown. |
| CF-08 | Email Routing (inbound) | NOT VERIFIED | [H] MX `route1/2/3.mx.cloudflare.net` observed. The rule and the verified destination are dashboard-only. |
| CF-09 | SPF, DKIM, DMARC for outgoing mail | NOT VERIFIED, OWNER ACTION REQUIRED | See section 8. [H] on 2026-11-13: SPF authorised only Cloudflare's routing, DMARC was `p=none` without a reporting address, and no DKIM record was found. |
| CF-10 | Rules at the edge (WAF, rate limiting) | NOT VERIFIED | Optional; complements the application's limits. |
| CF-11 | Security headers reach visitors unchanged | NOT VERIFIED | [R] the server and the build's `_headers` set CSP, `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies, HSTS (`http/security.ts`, `modules/system/static.ts`); [H] they were seen on 2026-11-13. |

## 8. SMTP and OAuth checklist

### 8.1 E-mail

The code supports `EMAIL_PROVIDER` = `none`, `smtp`, `file`, `resend` [R] (`config.ts:44`, `:318-321`). The owner reports SMTP through `smtp.mx.cloudflare.net` [O].

| ID | Item | Status | Evidence |
| --- | --- | --- | --- |
| ML-01 | SMTP configuration requirements | VERIFIED | `EMAIL_FROM`, `SMTP_HOST` required; `SMTP_USER` and `SMTP_PASSWORD` together; `SMTP_SECURE` is `tls`, `starttls` (default) or `none`, and `none` and disabled certificate checks are **refused in production** (`config.ts:332-344`). A production-like `check` with dummy SMTP values was accepted [E]. |
| ML-02 | The host `smtp.mx.cloudflare.net` is the right sending relay | NOT VERIFIED | [O] only. Nothing in the repository names it. |
| ML-03 | A test message arrived | NOT VERIFIED | [O]. Whether it reached the inbox or the spam folder, and from which sender, is unknown. |
| ML-04 | Error handling and retry (outbox) | VERIFIED | Every message is a database row; a temporary failure is retried with a growing pause, up to `EMAIL_MAX_ATTEMPTS` (default 5, `config.ts:413`); a permanent failure or the last attempt marks it failed and reports the problem to the owner (`notifications/notifier.ts:561-575`). The administration can retry a delivery. |
| ML-05 | Secrets are kept out of logs | VERIFIED | The SMTP password and the API key are registered for masking (`app.ts:81`); mail errors pass through `redactText` (`smtp.ts`, `notifier.ts:566`); log field names that look sensitive are replaced; 32-character tokens and addresses are masked (`lib/logger.ts:8-27`). The configuration check printed none of the dummy secret values [E]. |
| ML-06 | The app can tell whether outgoing mail is authenticated | NOT VERIFIED: the app **cannot**, by design, for SMTP | For `smtp` the DKIM, provider-domain and webhook checks are `not_applicable` (`notifications/checks.ts:166`, `:183`, `:255`). With SMTP the System page can only show that the server accepted a message, never delivered or bounced. |
| ML-07 | SPF, DKIM and DMARC are published for the provider in use | NOT VERIFIED, OWNER ACTION REQUIRED | [O] not verified. The repository's e-mail documents describe **Resend** (`resend._domainkey`, a `send` subdomain: `docs/email/README.md:40`, `:143`, `:197-203`) and say "no check passed because nothing was published" (`:220`); `docs/production/README.md:57` says **Blocked**. The records a Cloudflare SMTP sender needs are documented nowhere in the repository (F-09). |
| ML-08 | Inbound forwarding | NOT VERIFIED | See CF-08. |

### 8.2 Google OAuth and Google Drive

| ID | Item | Status | Evidence |
| --- | --- | --- | --- |
| OA-01 | Consent screen is in Production | NOT VERIFIED, OWNER ACTION REQUIRED | [O] previously reported. Check in the Google Cloud console, the OAuth consent screen. |
| OA-02 | Testing versus Production | NOT VERIFIED | A client left in Testing ends its refresh token after seven days [H] (audit finding K-4) and would silently stop the Drive backups. The application reports it as a `drive_auth` failure and e-mails the owner, with the category only (`backups/errors.ts`, `googleDrive.ts`) [R]; it cannot renew the token itself, so the owner has to create a new one. |
| OA-03 | Drive scope | NOT VERIFIED | `.env.example` says the refresh token must be authorized for `drive.file` [R]. The code only exchanges a refresh token (`googleDrive.ts:91`, `https://oauth2.googleapis.com/token`); the scope is fixed when the token is created, outside the repository. |
| OA-04 | Refresh-token handling | VERIFIED | One refresh grant per run; no token or secret in an error message, a record or the failure e-mail (a fixed category list); a stand-in test (`googleDriveBackup.test.ts`, part of check 3) covers a refused token [R, E]. |
| OA-05 | Expired or revoked token handled safely | VERIFIED (code, stand-in) | The run fails with `drive_auth`, the record is saved, the previous backups are untouched, and the next run tries again. Not tried against Google. |
| OA-06 | Redirect URI consistency | NOT APPLICABLE at the audited commit | Neither the Drive backup nor (on the deployment branch) the Gmail integration has an interactive OAuth redirect in the code: both take a refresh token prepared outside the application [R]. Whatever redirect URI was used to obtain the tokens (a Google tool or the owner's own client) cannot be seen from here. |
| OA-07 | Gmail scopes and consent | NOT VERIFIED, OWNER ACTION REQUIRED | On `deployment/render-cloudflare` only: `gmail.readonly` and `gmail.send` (`modules/gmail/tokenService.ts:20`). Whether Google requires verification for these in a Production consent screen was **not researched** in this audit. Read-only `git show` was used; the integration was not audited. |
| OA-08 | No OAuth secret or token is displayed | VERIFIED | The configuration check prints only `credentials: set`/`missing` (dummy values were used) [E]. |

## 9. Backup and restore checklist

| ID | Item | Status | Evidence |
| --- | --- | --- | --- |
| BK-01 | Encryption required or optional | VERIFIED: it is **optional** | Off unless `BACKUP_ENCRYPTION_KEY` is set (`config.ts:434-441`). A malformed key is refused and never echoed [E]. A production-like configuration without it reported `encrypted: false` [E]. |
| BK-02 | The key is set in production and a sealed copy exists | NOT VERIFIED, OWNER ACTION REQUIRED | Nothing in the repository can know. Losing the key loses every encrypted backup (documented in `docs/operations/BACKUPS.md`). |
| BK-03 | Encryption and decryption logic | VERIFIED | AES-256-GCM, a random nonce per file, an authenticated header with a key id (`backups/crypto.ts`) [R]. `backupRestore.test.ts` (changed byte, changed header, wrong key, no key) is part of the suite that passed in check 3 [E]. The scratch CLI drill of PROMPT 25 was **not** repeated in this audit. |
| BK-04 | Google Drive variable names | VERIFIED | `GOOGLE_DRIVE_CLIENT_ID`, `_CLIENT_SECRET`, `_REFRESH_TOKEN` (all or none), `GOOGLE_DRIVE_FOLDER_ID` (`config.ts`, `.env.example`). Partial sets are refused [E]. Values: NOT VERIFIED. |
| BK-05 | Schedule and catch-up | VERIFIED (code) | Daily at `BACKUP_HOUR_UTC` (default 03:00 UTC); at start-up if no backup succeeded in 24 hours; stale after 30 hours; one run at a time (`backups/records.ts`, `googleDrive.ts`). |
| BK-06 | Retention | VERIFIED (code) | `BACKUP_RETENTION_DAYS` (default 30); old dated folders are removed only after a successful run, and a failure while cleaning does not fail the backup (`googleDrive.ts:196-205`). |
| BK-07 | Integrity verification | VERIFIED (code, stand-in) | Each upload is compared with Drive's reported size and MD5 before an earlier copy is deleted; the manifest carries SHA-256 of every file; `backup verify` checks them and that the database is a whole SQLite file. Against Google: not run. |
| BK-08 | Migration snapshot behaviour | VERIFIED (code, tests) | A checked `VACUUM INTO` copy before pending migrations touch an existing database; a failing migration leaves the database as it was; no space or an unusable copy stops the migration; retention `MIGRATION_SNAPSHOT_DAYS` (default 14), the newest always kept (`db/snapshot.ts`). |
| BK-09 | Failure handling | VERIFIED | Fixed categories (`drive_auth`, `drive_http`, `drive_network`, `integrity`, `snapshot`, `encryption`, `busy`, `internal`, `interrupted`), recorded and shown on the System page, e-mailed with the category only. |
| BK-10a | Cleanup safeguards | VERIFIED | Snapshots are pruned by age (the newest always kept) and the temporary database copy is always removed (`db/snapshot.ts`, `backups/artifacts.ts:99-111`). |
| BK-10b | Disk and memory use stay bounded as the data grows | NOT VERIFIED | There is no size limit for the backup, the whole file is held in memory (F-08), and a migration snapshot is a full copy kept up to 14 days. |
| BK-11 | A real backup has run to Drive | NOT VERIFIED | Not run by this audit (forbidden); no evidence of one in the repository. |
| BK-12 | A real restore from a Drive download | NOT VERIFIED, OWNER ACTION REQUIRED | Never done. The scratch drill (a scratch database, never a Drive download) is not equivalent (limitation 4). `docs/operations/RESTORE_DRILL.md` has an empty row for the first real one. |
| BK-13 | Restore procedure documentation | VERIFIED, with a defect | Present and tested against scratch data. The **rollback** advice around it is incomplete (F-05). |

## 10. CI/CD checklist

Evidence: the repository's workflow files [R] and GitHub's public API read-only [E] (section 12).

| ID | Item | Status | Evidence |
| --- | --- | --- | --- |
| CI-01 | CI ran for the audited commit | NOT VERIFIED: result **missing** (no run exists) | `GET /actions/runs?head_sha=29f4b31…` returned `total_count: 0` [E]. |
| CI-02 | CI result for any commit | BLOCKED: the only result is **failed** | The repository has **one** workflow run in total: `CI`, event `push`, branch `main`, `254a202`, 2026-11-11, conclusion **failure**: steps up to `npm run lint` passed, **`npm test` failed**, the language and build steps were skipped [E]. The cause was not investigated (the log is not available unauthenticated); it is an old commit. It shows that the Linux CI environment has never produced a green run. |
| CI-03 | Branches that trigger CI | VERIFIED | At the audited commit: `push` to `main` and `deployment/render-cloudflare`, and every `pull_request` (`.github/workflows/ci.yml:13-15`). **`feature/consultation-booking` is not covered by a push trigger.** |
| CI-04 | A pull request is needed for CI on this branch | VERIFIED | Yes: with no PR, no CI. The repository has **zero pull requests** [E]. |
| CI-05 | The deployment branch is covered | VERIFIED (in the branch that has it) | The line was added by PROMPT 25, so it is **not in** `deployment/render-cloudflare` yet; CI on that branch starts only after the change is merged there (F-01). |
| CI-06 | Other workflows | NOT VERIFIED | `smoke-ready.yml` and `e2e-quote.yml` are manual (`workflow_dispatch`) and exist only on feature branches; GitHub lists only `CI` as a registered workflow [E]. A manual workflow runs from the Actions tab only once it is on the default branch. |
| CI-07 | CI cannot deploy | VERIFIED | No secrets, no deploy hook, `contents: read` only; enforced by `server/test/ciWorkflow.test.ts` [R]. |
| CI-08 | Deployment is automatic or manual | NOT VERIFIED | The repository cannot say (RN-11, CF-07). |
| CI-09 | Documented test results match GitHub evidence | NOT VERIFIED: there is a **gap** | Every "all green" figure in `docs/` and in the earlier reports was produced locally. GitHub has no green run for any commit. |

## 11. Security and operational findings

Only findings supported by code or documentation are listed. No code was changed.

| ID | Severity | Finding | Where | Evidence and consequence |
| --- | --- | --- | --- | --- |
| F-01 | HIGH | The deployment branch lacks PROMPT 25 and the booking; the lineages diverged and were never integrated | `origin/deployment/render-cloudflare` (`217c6d4`) vs `29f4b31` | `git merge-base --is-ancestor`: neither `29f4b31` nor `46d4652` is in the deployment branch [E]. 3 commits only on the deployment branch (the Gmail work), 13 only on the audited one. 435 files changed on one side, 39 on the other, **18 changed by both** (`.env.example`, `server/src/app.ts`, `config.ts`, `main.ts`, `http/rateLimit.ts`, `modules/admin/routes.ts`, `system/maintenance.ts`, `src/admin/api/*`, `i18n/en.ts`, `hu.ts`, `SettingsPage.tsx`, and five test files) [E]. `origin/main` (`254a202`) is behind both. The hardening cannot reach production without a merge nobody has done or tested. |
| F-02 | HIGH | Code refuses to start on a database holding migrations it does not know | `server/src/db/migrate.ts:79`; migration files on each side | Deployment branch: versions 1–8 and **30** (`0030_gmail_messages.sql`). Audited branch: 1–11 and **40** [E]. "The database has migration N, which this version of the server does not know. Refusing to start on a newer schema." So the audited branch deployed alone onto a database that has applied 30 refuses to start, and the deployment branch's code on a database that has applied 9, 10, 11 or 40 does the same. The database is not damaged (the snapshot is taken first, and nothing is migrated), but the service is down until the code that knows both is deployed. Whether production has applied 30 depends on whether `217c6d4` was ever deployed: NOT VERIFIED. |
| F-03 | HIGH | GitHub CI has never passed and has not run for this commit | `.github/workflows/ci.yml:13-15`; GitHub API | CI-01, CI-02, CI-04. Linux, Node 22.18 and the hosted runner have never been exercised by this suite. |
| F-04 | HIGH if `TRUST_PROXY` is 0 | One shared address behind a proxy | `http/request.ts:64-76`; `http/rateLimit.ts:52,59`; `app.ts:151` | With the owner's reported 0 and a proxy in front, the global limit of 600 requests a minute (counted for every request, static files included) is shared by all visitors, and ten failed sign-ins from anyone lock the sign-in for everyone for 15 minutes. The server warns at start-up (`main.ts:70`). Not verified in production. Measure first (section 6.2). |
| F-05 | MEDIUM | The incident runbook's rollback advice omits the schema-refusal | `docs/operations/INCIDENT_RUNBOOK.md:27,40`; `RELEASE_CHECKLIST.md:88` | They say to redeploy the last good commit. After a release whose migration succeeded, that older code refuses to start (F-02), so the real recovery is the pre-migration snapshot or a forward fix, at the cost of data written since. This is a defect in the PROMPT 25 documents themselves. |
| F-06 | MEDIUM | Persistence is not enforced for the database | `config.ts:303-304,419`; `main.ts:63-66`; `modules/media/storage.ts:49` | Production is "valid" with `DATABASE_PATH` unset; the database then lives under `./data` in the checkout, which a deploy replaces [E: the `check` accepted it]. The start-up warning looks at `MEDIA_DIR` only, so a persistent `MEDIA_DIR` with a default `DATABASE_PATH` is not warned about. |
| F-07 | MEDIUM | Backups may be stored unencrypted, and the key is a single point of loss | `config.ts:434-441`; `BACKUPS.md` | Optional by design (BK-01); key presence unknown (BK-02). Without a key a full copy of customer data sits in a Google Drive account protected only by Google's own at-rest encryption and the account's security. With a key, its loss makes every backup unreadable. |
| F-08 | MEDIUM | The backup is not bounded by size | `backups/artifacts.ts:99-111`, `backups/crypto.ts:64-67`, `backups/googleDrive.ts:135-140` | Each file is read whole into memory, encrypted whole (plain and encrypted copies at once), and sent in one request; `VACUUM INTO` runs synchronously in the web process. Fine for a database of about 1 MB, but there is no guard or streaming, and at some size the 03:00 UTC run can exhaust memory or stall the process. Whether Drive accepts a very large single-request upload was not verified. |
| F-09 | MEDIUM | E-mail documentation does not match the provider in use, and the app cannot verify mail authentication for SMTP | `docs/email/README.md:40,143,197-203`; `docs/production/README.md:57`; `notifications/checks.ts:166,183,255` | See ML-06, ML-07. |
| F-10 | MEDIUM | Single-factor administration | `server/src/modules/auth/*` (no TOTP or MFA code in `server/src`) | Passwords are hashed, accounts lock after repeated failures, sessions expire when idle, cookies are `HttpOnly`, `SameSite=Strict`, `Secure` and `__Host-` in production (`sessions.ts:21-24`, `:54-64`, `:94`). But one password gives access to customer data, the System page and, when `DEPLOY_HOOK_URL` is set, a `POST` that triggers a deploy (`modules/admin/routes.ts:335-348`, permission `system:write`, administrators only). Cloudflare Access in front of `/admin` was the 2026-11-13 recommendation (D-4); not decided. |
| F-11 | MEDIUM | No staging environment | [H] INFRASTRUCTURE_AUDIT | Production refuses development shortcuts, but every deploy goes straight to the live site. |
| F-12 | LOW | Redaction list is short | `app.ts:81` | Registered for exact masking: the e-mail API key, webhook secret, SMTP password, Cloudflare token, assistant key, backup key. **Not** registered: the Drive client secret and refresh token, `APP_SECRET`, `DEPLOY_HOOK_URL`, the assistant session secret. Other layers apply: a fixed set of backup failure messages (`backups/errors.ts`), redaction of log fields by name (`logger.ts:8`), masking of tokens of 32 or more characters (`logger.ts:25`). No leak was found; this is defence in depth. |
| F-13 | LOW | `HOST` default | `config.ts:278`; `.env.example:21` | `127.0.0.1` by default; a hosted service needs all interfaces; no repository document says so (the live site worked in 2026-11-13, so it is presumably set). |
| F-14 | LOW | Readiness cannot tell a fresh database from the real one | `system/health.ts`, `main.ts:44-61` | If the disk is missing, the service creates and seeds an empty database (`SEED_ON_START` defaults to true) and reports ready. The first sign is an empty site. |
| F-15 | INFO | HSTS differs | `http/security.ts:17` vs [H] observed headers | The API and admin send `max-age=31536000; includeSubDomains` in production; static pages were observed without `includeSubDomains`. |
| F-16 | INFO | `i18n:validate` depends on an optional tool | `scripts/i18n.mjs`; `.github/workflows/ci.yml` | Run bare in this worktree (no `hunspell-asm`), it exits 1 with 508 errors, all Dutch spelling flagged by the fallback dictionary, and Hungarian "NOT CHECKED". With the tool CI installs it exits 0, 0 words not found in HU, EN and NL [E]. |
| F-17 | INFO | Browser journeys are manual | `server/test/journeySelectors.test.ts` | 87 sentence-quoting assertions remain in seven journeys; the journeys are outside CI. |
| F-18 | INFO | A sample shows `TRUST_PROXY=1` | `docs/production/README.md:21` | A copy-paste value that conflicts with "measure it". |

**Checked and found sound (code evidence, no finding):**

| Area | Evidence |
| --- | --- |
| Admin authorization | Every route under `/api/admin` is discovered from the router and must have a policy line; 401 without a session, CSRF and origin checks, and the editor/administrator split are tested for each (`server/test/adminRoutes.test.ts`, passing now [E]); three mutation runs during PROMPT 25 made it fail (not repeated in this audit) |
| Sessions and cookies | `sessions.ts:21-24,54-64,94`; secure cookies in production (`config.ts:545`) |
| CSRF | A per-session token required on every state-changing admin call (`app.ts:124-128`); cross-origin state-changing calls refused (`app.ts:118`) |
| CORS | Exact origins only, no wildcard, https in production (`config.ts:293-301`) |
| Rate limiting | Global, per form, `login` (10 per 15 minutes), `admin` (300 per minute) (`http/rateLimit.ts`) |
| Security headers | `http/security.ts`, `modules/system/static.ts` (admin CSP), media served with `default-src 'none'; sandbox` (`media/service.ts:177`) |
| Secret leakage | The configuration check prints `set`/`missing` only [E]; dummy secret values appeared nowhere in its output [E]; bad key and partial Drive values are refused without echoing them [E] |
| Migration safety | Each migration in its own transaction, checksums, snapshot first (`db/migrate.ts`, `db/snapshot.ts`) |
| Health and readiness | `/api/health` touches nothing; `/api/ready` checks the database and the schema; both exempt from the canonical redirect (`http/canonical.ts:34`) |
| Incident documentation | Present (`docs/operations/INCIDENT_RUNBOOK.md`), with the defect in F-05 |

## 12. Executed local checks and their results

Run now, on `29f4b31`, clean tree, Node v22.23.1, npm 11.8.0, Windows. Logs were kept outside the repository. "Executed" means run during this audit; nothing below is copied from another report.

| # | Exact command | Result | Executed? | Relevant output |
| --- | --- | --- | --- | --- |
| 1 | `npm run typecheck` | **PASS** (exit 0, 21 s) | yes | `tsc -b`, no errors |
| 2 | `npm run lint` | **PASS** (exit 0, 1 s) | yes | `oxlint`, no findings printed |
| 3 | `npx vitest run` | **PASS** (exit 0, 66 s) | yes | `Test Files 132 passed (132)`, `Tests 2720 passed (2720)` |
| 4 | `npm run i18n:check` | **PASS** (exit 0, 6 s) | yes | |
| 5 | `npm run i18n:validate` (no spell checker in this worktree) | **FAIL** (exit 1, 88 s) | yes | `spelling HU: NOT CHECKED (hunspell-asm is not installed…)`, `spelling NL: … 281 not found` (fallback dictionary), `errors: 508` (all NL spelling), `i18n validate: FAILED` |
| 6 | `npm install --no-save hunspell-asm` then `npm run i18n:validate` | **PASS** (exit 0, 6 s) | yes | `spelling HU: 4645 distinct words … 0 not found`, `EN … 0`, `NL … 0`, `errors: 0, warnings: 0`, `i18n validate: OK`. The install reported advisories in that tool's own dependencies (the reason it is not a project dependency). Tracked files unchanged. |
| 7 | `VITE_SITE_URL=https://szilardkiss.com npm run build` | **PASS** (exit 0, 29 s) | yes | `seo: wrote 100 pages, 404.html, robots.txt, sitemap.xml and _headers` |
| 8 | `EXPECTED_SITE_ORIGIN=https://szilardkiss.com npm run check:seo` | **PASS** (exit 0, 1 s) | yes | `check:seo ok: 101 files, 82 indexable, 19 noindex; sitemap, hreflang reciprocity, canonicals, structured data and headers verified` |
| 9 | `npm run check:seo` (same build, no expected host) | **PASS** (exit 0, 1 s) | yes | same line |
| 10 | `EXPECTED_SITE_ORIGIN=https://www.szilardkiss.com node scripts/check-seo.mjs` (on the build of check 7) | **FAIL, as it must** (exit 1) | yes | `check:seo FAILED: 1 problem(s) in 101 files` - "the site declares https://szilardkiss.com, but the canonical host is https://www.szilardkiss.com" |
| 11 | `node server/src/cli.ts check` with `APP_ENV=production`, `PUBLIC_URL`, a random `APP_SECRET`; `DATABASE_PATH` and `TRUST_PROXY` unset | **PASS** (exit 0) | yes | `Configuration is valid.`; `database: file`, `trustProxy: 0`, `mediaDir: data\media`, `googleDriveBackup.encrypted: false`; `secureCookies: true` |
| 12 | the same with dummy SMTP, Drive and encryption values and `TRUST_PROXY=2` | **PASS** (exit 0) | yes | `credentials: set`, `encrypted: true`; **0** occurrences of any dummy secret in the output |
| 13 | the same with `GOOGLE_DRIVE_CLIENT_SECRET` removed | **REFUSED, as it must** | yes | "… must be set together" |
| 14 | the same with `BACKUP_ENCRYPTION_KEY=<short text>` | **REFUSED, as it must** | yes | "must be 32 random bytes …"; the value was not echoed |
| 15 | `git merge-base --is-ancestor 29f4b31 origin/deployment/render-cloudflare`, and `46d4652` | **NO**, **NO** | yes | PROMPT 25 and the booking are not in the deployment branch |
| 16 | `git rev-list --left-right --count origin/deployment/render-cloudflare...HEAD` | `3 13` | yes | |
| 17 | `git diff --name-only` of each side against the common ancestor `a75fa42` | 435 vs 39 files, **18 overlap** | yes | list in F-01 |
| 18 | `git ls-tree` of `server/src/db/migrations` on each side | audited: 1–11, 40; deployment: 1–8, 30 | yes | |
| 19 | GitHub public API: `actions/runs?head_sha=29f4b31…` | `total_count: 0` | yes | no CI run for the audited commit |
| 20 | GitHub public API: `actions/runs`, `pulls?state=all`, `actions/workflows`, `actions/runs/{id}/jobs` | 1 run in total (failure at `npm test` on `main@254a202`), 0 pull requests, 1 registered workflow (`CI`) | yes | |

**Not run, and why:** `npm run smoke:ready` and any request to a production URL (forbidden: no production contact); `npm run server:backup -- create` against production data and any Drive call (forbidden: no real backup or restore); the browser journeys (they need scratch servers and a browser; their results are not an audit input: they do not test production); `npm run check:deploy` as a whole (its five steps were run separately above, and its `tests` step is check 3); the scratch restore drill (already run during PROMPT 25; not repeated, and it would not prove a production restore).

## 13. Owner verification checklist

Where an exact menu name is not in the repository's documents, the item names the place by what it must show. Names below are those used in `docs/audit/INFRASTRUCTURE_AUDIT.md` and the project's own notes; the dashboards may label them differently. Record answers as names and states, never as values.

| ID | Where | What to confirm | Status |
| --- | --- | --- | --- |
| OW-01 | Render, the service, **Disks** | A persistent disk exists; its mount path (`/var/data` reported); its size and free space | OWNER ACTION REQUIRED |
| OW-02 | Render, the service, **Environment** (names only) | `DATABASE_PATH` and `MEDIA_DIR` are inside the disk; `HOST` listens on all interfaces; `PUBLIC_URL` is `https://szilardkiss.com`; `APP_ENV=production`; `TRUST_PROXY` has a value; no `ANTHROPIC_MODEL`; `BACKUP_ENCRYPTION_KEY` present or absent; the SMTP and Drive names present | OWNER ACTION REQUIRED |
| OW-03 | Render, **Settings** (build and deploy) | Build command, start command, Node version (22.18 or newer), health check path, the deployed branch, auto-deploy on or off | OWNER ACTION REQUIRED |
| OW-04 | Render, **Events / Deploys** | The commit that is running now, and whether `217c6d4` (Gmail) was ever deployed (decides F-02) | OWNER ACTION REQUIRED |
| OW-05 | Render, plan and scaling | Always-on instance; exactly one instance | OWNER ACTION REQUIRED |
| OW-06 | Render, **Logs** | The start-up warnings listed in RN-16, in particular `TRUST_PROXY is 0` and the media-folder warning | OWNER ACTION REQUIRED |
| OW-07 | The administration, Settings, System, **Network** | The address the server sees for your own request, from two networks; the verdict; the measured number. Then decide `TRUST_PROXY` from that evidence | OWNER ACTION REQUIRED |
| OW-08 | Cloudflare, **SSL/TLS** overview | Full (strict) | OWNER ACTION REQUIRED |
| OW-09 | Cloudflare, **Rules** (redirect rules) and Render, custom domains | Which host redirects to which; make the apex the destination before anything else changes | OWNER ACTION REQUIRED |
| OW-10 | Cloudflare, **Workers & Pages**, the Worker `mywebsite` | No route or custom domain on `szilardkiss.com`; the build connection to GitHub: which branch it builds, and whether other branches are built | OWNER ACTION REQUIRED |
| OW-11 | Cloudflare, **DNS** | SPF, DKIM and DMARC records for the provider you send with; exactly one `v=spf1` record; a DMARC reporting address | OWNER ACTION REQUIRED |
| OW-12 | Cloudflare, **Email Routing** | The rule and the verified destination | OWNER ACTION REQUIRED |
| OW-13 | The mail provider's documentation or dashboard | That `smtp.mx.cloudflare.net` is the sending relay, which credentials it needs, and which DNS records it requires | OWNER ACTION REQUIRED |
| OW-14 | Google Cloud console, **OAuth consent screen** | Publishing status is In production for the Drive client (and the Gmail client, if used); the scopes each client was granted | OWNER ACTION REQUIRED |
| OW-15 | Google Drive | The backup folder exists and the newest dated folder is less than a day old, with the manifest | OWNER ACTION REQUIRED |
| OW-16 | The owner's password manager | A sealed copy of `BACKUP_ENCRYPTION_KEY` (once set) and of the variable names and values | OWNER ACTION REQUIRED |
| OW-17 | GitHub | Open a pull request for the integrated branch so that CI runs; read the result | OWNER ACTION REQUIRED |

Read-only commands the owner can run from their own computer, to compare with the checklist (nothing here changes a setting):

```bash
curl -sI https://szilardkiss.com/      # status and Location: the apex must not redirect to www
curl -sI https://www.szilardkiss.com/  # the intended direction is a 301 to the apex
curl -s  https://szilardkiss.com/api/ready
nslookup -type=TXT szilardkiss.com     # exactly one v=spf1 record
nslookup -type=TXT _dmarc.szilardkiss.com
```

## 14. Prioritized remediation plan

**No fix was started. Each item below needs the owner's explicit approval first.**

**P0: blockers before any production use of this commit**

| ID | Action | Closes |
| --- | --- | --- |
| B-1 | Decide the integration of the two lineages (the deployment branch's Gmail work and this branch). The result must contain every migration file (1–11, **30**, 40) and be tried on a **copy** of a production database backup, not on production. | F-01, F-02 |
| B-2 | Get a **green CI run on Linux** for the integrated commit by opening a pull request (CI runs on pull requests). Read the failure if there is one: the only prior run failed at `npm test`. | F-03 |
| B-3 | The owner's dashboard verification, OW-01 to OW-06, OW-08 to OW-14: disk, paths, variables, Node, build and start, health path, branch and auto-deploy, instance count, SSL mode, redirects, Worker routes, mail DNS, OAuth status. | RN-*, CF-*, ML-07, OA-01 |
| B-4 | Measure `TRUST_PROXY` (OW-07) and set it from the measurement. | F-04 |
| B-5 | Set `BACKUP_ENCRYPTION_KEY` with a sealed copy, let one real backup run, **download it from Drive and restore it** into a scratch place with `backup verify` and `backup restore`, and write the result in `RESTORE_DRILL.md`. | F-07, BK-02, BK-11, BK-12 |

**P1: soon after**

| ID | Action | Closes |
| --- | --- | --- |
| P-1 | Correct the runbook and checklist: after a release that applied a migration, a code rollback fails; the way back is the snapshot or a forward fix. | F-05 |
| P-2 | Document the mail provider actually used (SMTP via Cloudflare) and the DNS it requires; drop or label the Resend-only text. | F-09 |
| P-3 | Switch the canonical host in the order given in `docs/operations/README.md`; confirm with the `curl` lines above. | CF-02, CF-03 |
| P-4 | Decide on MFA or Cloudflare Access for `/admin`, and whether `DEPLOY_HOOK_URL` should be set at all. | F-10 |

**P2: hardening**

| ID | Action | Closes |
| --- | --- | --- |
| H-1 | Warn (or refuse in production) when `DATABASE_PATH` is on the application's filesystem; show it on the System page. | F-06, F-14 |
| H-2 | Bound and stream the backup (size guard, chunked or resumable upload, no synchronous copy in the web process). | F-08 |
| H-3 | Register the remaining secrets for log masking. | F-12 |
| H-4 | Document `HOST`; fix the `TRUST_PROXY=1` sample; make HSTS consistent. | F-13, F-15, F-18 |
| H-5 | A staging service, so the first deploy of a change is not the live one. | F-11 |
| H-6 | Convert the remaining journeys to the test hooks and decide whether any should run in CI. | F-17 |

## 15. Evidence versus assumptions

- **Evidence** in this report: file and line references at `29f4b31`, the commands in section 12 and their output, and the GitHub public API answers.
- **Carried over, not re-verified:** the 2026-11-13 observations of the live site and DNS, and the project notes about Cloudflare Workers Builds.
- **Reported by the owner, unverified:** the disk path, the earlier `TRUST_PROXY` value, the SMTP host, the received test e-mail, the OAuth status.
- **Assumptions:** none were used as evidence. Where the repository cannot answer, the item says NOT VERIFIED.

A successful local test suite does not prove production infrastructure readiness, and this report does not claim it does.

## 16. Addendum, 2026-11-17: evidence gathered for the integration decisions

Gathered after the audit, with unauthenticated read-only `GET`s to GitHub's public API and to the live site (14 requests, no cookie, no credential, no change). Details and the reasoning are in [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md), section 0. Nothing else in this report was re-verified.

| Item | Before | Now |
| --- | --- | --- |
| F-02 (a code line refuses a database with migrations it does not know) | conditional: "whether production has applied 30 is NOT VERIFIED" | **Established by behaviour.** The live backend has the routes introduced by `84b1d23` and `217c6d4` (401 where the route exists, 404 for a missing one) and none that exist only in the feature line, and `/api/ready` reports no pending migration; the migration file `0030_gmail_messages.sql` is introduced by the same commit as the routes. So 0030 is applied in production, and deploying `29f4b31` as it is would stop the service. The commit id and the `schema_migrations` row themselves remain NOT VERIFIED. |
| CF-07 (a build pipeline connected to the repository) | NOT VERIFIED (an old note) | **Verified from GitHub's checks:** *Workers Builds: mywebsite* ran for `254a202` on `main` (success, 2026-11-11), `217c6d4` (failure, 2026-11-15) and `29f4b31` (failure, 2026-11-17, the push of the audited branch). It builds pushed branches. Why the last two failed, and whether a successful non-production build deploys anything: OWNER VERIFICATION REQUIRED. |
| RN-11 (auto-deploy) | NOT VERIFIED | Still **NOT VERIFIED, OWNER VERIFICATION REQUIRED**: GitHub shows no Render status, no deployment, and the webhooks are not readable without sign-in; the Render dashboard was not signed in. |
| CF-02 (canonical direction) | [H] apex redirected to `www` on 2026-11-13 | Seen again today: `https://szilardkiss.com/` answers `301` to `https://www.szilardkiss.com/`. Still the opposite of the owner's decision. |
| BK-11 / BK-12 | NOT VERIFIED | Still. Production runs the **old** backup code: a plain `database.sqlite` and `media/` per day, **no manifest, no encryption, no record of success**. The new `backup verify` and `backup restore` refuse that format. No backup copy exists on this machine. |
