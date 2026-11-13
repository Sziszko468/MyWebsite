# Security audit and findings register

**Scope and method.** A practical application-security review, **non-destructive only**: the project's own security probe (94 checks) against a **throw-away backend with its own database** on a local port, the backend's 28 test files, code reading, secret scans, `npm audit`, and read-only `GET`/`HEAD` requests to the public site (health, readiness, robots, sitemap, the three language roots, three unauthenticated admin API paths, and four sensitive file paths that must 404). Nothing was exploited, posted, fuzzed or load-tested against production, no account was created or signed into, and no setting was changed.

## Checklist from the brief

| Check | Result | Evidence |
| --- | --- | --- |
| Admin endpoints never publicly accessible | **Pass** (API) / by design (shell) | 66 admin routes × 5 methods = 330 unauthenticated calls: only 401/404/405. Live `GET /api/admin/settings` → 401. The `/admin` page itself is a public shell with no data (B-3) |
| Private customer data not returned by public APIs | **Pass** | probe: 11 public reads carry no private field, no address hash, no content hash; the system screen carries no secret; `catalog.test.ts` also sends a contact message and a quote request and asserts none of its text appears in any public catalogue response |
| API keys not exposed in frontend bundles | **Pass** | `dist/` scanned for `sk-ant-`, `whsec_`, `GOCSPX` and the key variable names (`ANTHROPIC_API_KEY`, `EMAIL_API_KEY`, `GOOGLE_DRIVE_`): only UI help text naming `ANTHROPIC_API_KEY` in the admin bundle; the key is read by the server only and the browser cannot choose model, key or provider address |
| Environment variables / secrets not committed | **Pass** | `.env` ignored and untracked (`git ls-files`); regex scan of every tracked file, plus pickaxe over all branches' history for `sk-ant-api`, `whsec_`, `GOCSPX-`, Google refresh-token prefix: only placeholders, docs and test fixtures |
| Error messages expose no secret | **Pass** | probe §4: unknown route, bad JSON, wrong type/method, oversize, empty → JSON with a request id, no stack, path or SQL; `registerSecret()` masks configured secrets in all logs and stored failure reasons |
| Unpublished projects and services not public | **Pass** | probe: a draft project is invisible to the public API, the list and the sitemap, its preview needs a session; `catalog.test.ts` disables a package, add-on and service and asserts they leave the public catalogue |
| Authentication, sessions, cookies | **Pass** | scrypt, `__Host-cc_admin; HttpOnly; SameSite=Strict; Secure`, idle and absolute expiry, sign-out invalidates, no account enumeration |
| CSRF | **Pass** | state-changing admin calls need the token and a same origin: without token 403, foreign origin 403 even with token |
| CORS | **Pass** | exact-origin allow-list, no wildcard, no credentials; live request with `Origin: https://evil.example` receives no `Access-Control-Allow-Origin` |
| XSS | **Pass** | hostile payloads stored and returned as text; e-mail templates escape (`&lt;script&gt;` asserted); production CSP `script-src 'self'` + one hash, no inline script, `object-src 'none'`; admin CSP forbids inline script and framing |
| SQL injection | **Pass** | every statement is parameterised; a test fails the build if SQL is built from a value; injection-shaped path segments are clean 404s |
| Input validation | **Pass** | field validation, 64 KiB body limit, header-injection guard on anything reaching an e-mail header |
| File uploads | **Pass** | content-sniffed PNG/JPEG/WebP/GIF only; SVG, HTML-as-PNG, mismatched type, 20000×20000 px, empty and oversize refused; hash file names; `nosniff` + sandbox CSP; path traversal variants 404 |
| Rate limiting | **Pass in tests, unverified in production** | 10 of 12 burst contact requests limited with `Retry-After`; per-address keys depend on `TRUST_PROXY` (B-1) |
| Dependency vulnerabilities | **Pass** | `npm audit`: found 0 vulnerabilities (production and dev) on 2026-11-13 |
| Secret management | **Pass in code, unverified on the host** | env-only secrets, minimum lengths and placeholder refusal in production, `.env` not read by the server; the host's variables need the owner's check |

## Findings register (all documents)

Severity: **Critical** = data loss or compromise now; **High** = likely real harm or a site-wide defect, fix soon; **Medium** = needs a decision or a plan; **Low** = hygiene; **Info** = no action. "Safe now" = a non-destructive change within the audit's scope.

### Critical

None confirmed. **One could be Critical** depending on a dashboard fact: see D-1.

### High

| ID | Component | Finding | Evidence | Business impact | Recommended fix | Safe now? |
| --- | --- | --- | --- | --- | --- | --- |
| **D-1** | Render / database | The production database is on a persistent disk **(unverified)**; `DATABASE_PATH` defaults to `./data/app.sqlite` and Render's filesystem is ephemeral without a disk | [DATABASE_AUDIT.md](DATABASE_AUDIT.md); `/api/ready` cannot tell | **if no disk: every deploy erases inquiries, quotes and accounts**, and the seed quietly rebuilds an empty catalogue | owner check R-1 now; if there is no disk attach one and restore the latest Drive snapshot | Check yes (owner); no code change |
| **E-1** | DNS / e-mail | No SPF/DKIM/DMARC for any sending provider; DMARC `p=none` without `rua` | [EMAIL_AUDIT.md](EMAIL_AUDIT.md) | customer e-mails rejected or spam-foldered, silently | verify the domain at the provider, publish its records, add `rua` | No (DNS is the owner's) |
| **B-1** | Backend config | `TRUST_PROXY` defaults to 0; behind Render + Cloudflare all visitors would share one address for limits and the sign-in lock **(unverified)** | [BACKEND_AUDIT.md](BACKEND_AUDIT.md) | the contact form blocks for everyone after 5 messages in 15 min; ten failed sign-ins lock the owner out | set `TRUST_PROXY` to the measured proxy count (method in INFRASTRUCTURE_AUDIT) | Warning added (log only); the value is the owner's |
| **I-1** | Canonical / SEO | canonical, sitemap and hreflang use `https://szilardkiss.com/…`, which 301-redirects to `www`, where the content is | [INFRASTRUCTURE_AUDIT.md](INFRASTRUCTURE_AUDIT.md) | contradictory index signals on all 76 pages; hreflang alternates that redirect are not valid | `VITE_SITE_URL=https://www.szilardkiss.com` **or** make the apex primary | No (build variable / dashboard) |

### Medium

| ID | Component | Finding | Fix | Safe now? |
| --- | --- | --- | --- | --- |
| I-2 | CI | `ci.yml` runs on `main` and pull requests only; a push to the deployment branch runs no checks (and deploys, if auto-deploy is on) | add the deployment branch to `on.push.branches` (one line) | Yes, but changes the owner's workflow: **proposed, not applied** |
| I-3 | Git | `origin/main` is 10 commits behind the code that runs and carries one commit that equals local `38e2374`; local `main` has 2 unpushed commits | merge `origin/main` into local `main` (identical patch), review, push; never force | No (needs authorization) |
| I-4 | Hosting | the Worker's country routing never runs on production (Render answers `www`); no trusted country header at the origin | decide: Workers for static + Render for API, or accept client-side language | No (hosting decision) |
| I-5 | Process | no staging environment; every deploy goes to the live site | a second Render service on a staging branch, own disk and database | No |
| K-1 | Backup | Drive backup: **unencrypted** database copy in Google Drive; no record of the last success in the administration; no catch-up when the process is down at 03:00 UTC; the failure e-mail needs working e-mail; an OAuth app in "Testing" mode loses its refresh token after 7 days; never run against real Google | [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) | encrypt before upload, store `last_backup` in `settings`, catch up on start, publish the OAuth app, run once and restore the result | Not now (format change needs the owner's key decision) |
| D-3 | Database | `MIGRATE_ON_START=true` and no automatic snapshot before a migration | take `server:backup` before any release that adds a migration; add a pre-migration snapshot to the runner | Not now (changes start-up) |
| B-2 | Backend | rate limits are in memory: reset on restart, wrong with more than one instance | keep one instance; add an edge rule in Cloudflare | No |
| B-3 | Admin | password-only sign-in on a public `/admin` | TOTP, or Cloudflare Access in front of `/admin` | No (feature) |
| B-4 / B-5 | Backend | in-process timers have no run record; stray rejection restarts the process | `last_run` settings, catch-up | No |
| E-2 / E-3 | E-mail | DMARC reporting missing; the provider send was never tested end to end | see E-1 | No |
| A-1 | AI | **model not verified against the live API** (no key, no call); assistant is off in production | see [AI_AUDIT.md](AI_AUDIT.md) | n/a |

### Low

| ID | Finding | Safe now? |
| --- | --- | --- |
| B-6 | `/api/ready` is public and says whether e-mail is configured | harmless, leave |
| B-7 | docs say `TRUST_PROXY=1`; the right number must be measured | done in this audit's docs |
| F-1 | 13–16 px hidden NFSU2 trigger | owner's design |
| F-2 | 69 hex colours outside tokens | design pass |
| F-3 | 4 unreferenced source files (not removed) | needs reference check |
| DB-1 | 10 foreign keys without an index (admin author columns, 2 rare ones) | next migration |
| I-6 | HSTS without `includeSubDomains`/`preload`; no `CAA`; HTML without an explicit `Cache-Control` | owner, dashboard / `_headers` |
| E-4 / E-5 | webhook secret unset warning; privacy notice does not name processors | owner |
| T-1 | two stale e-mail assertions (`600px` vs the 620 px redesign) | **fixed** |
| T-2 | security probe did not cover 17 admin routes | **fixed** |
| T-3 | Drive backup had no tests | **fixed** (6 tests) |
| T-4 | the browser journeys (`tools/e2e`) are copy-sensitive, not in CI, and had drifted behind the shop copy | **fixed** (all 155 steps pass again); make them copy-independent and run them before releases |

### Informational

`npm audit` 0 vulnerabilities · no secret in repository, history or bundle · every unauthenticated admin request refused · drafts invisible · the stale local server on `127.0.0.1:8788` of the development machine (11 Nov, not stopped, not mine).

## Residual risk statement

The code is in good security shape: the weaknesses are **operational** (where the data lives, how traffic reaches it, how mail is authenticated, how it is backed up) and sit in dashboards this audit could not open. The four High items are each answerable in minutes by the owner; none requires new code.
