# Remediation log

Work branch: **`audit/prompt-19-platform-audit`**, created locally from `main` at `77c0df4`. **Nothing is committed, pushed, merged or deployed**: the changes sit in the working tree for the owner to review and commit (the owner commits their own work). The checkpoint is the branch point itself: `git switch main` returns to the audited state untouched. `main`, `origin/main` and `origin/deployment/render-cloudflare` were not modified.

For each change below: the issue, the files, whether production data could be affected (**none was**: no code path of these changes touches the live system), the test that was run and the result.

## Applied fixes

| # | Issue | Files | Production effect | Verification | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | Two backend tests failed since the e-mail redesign (`0840a3d`, column `max-width:620px`): both still asserted `max-width:600px`. The **tests** were stale; the e-mails are fine | `server/test/email.test.ts` (line 397), `server/test/quotationFlow.test.ts` (line 586) | none (tests only) | the two files re-run: 79 passed; full suite 2 149 passed | **fixed** |
| 2 | The security probe listed 66 − 17 = 49 admin routes; 17 routes added later (AI administration, quotation management, shop documents) were never probed for "401 without a session" | `tools/e2e/security-probe.mjs` (route list) | none (a tool run only against a throw-away local server) | probe against a scratch backend: **94/94 checks passed**, "66 admin routes × 5 methods (330 calls): only 401, 404 or 405" | **fixed** |
| 3 | `modules/backups/googleDrive.ts` (the automatic Drive backup) had **no test** | `server/test/googleDriveBackup.test.ts` (new, 6 tests, in-memory Drive stand-in) | none (no network, no Google account) | 6/6 pass; the logic is covered: consistent upload, media names, no duplicates, retention only after success and only dated folders, credentials only in the token body, failure e-mail without secrets, rescheduling | **added** |
| 4 | `TRUST_PROXY=0` in production behind a proxy makes every visitor one address for the limits (B-1) and nothing said so | `server/src/main.ts` (one start-up `log.warn` in production when the value is 0) | **logging only**: no behaviour, limit or setting changes; the line appears in the Render log after the next deploy | `process.test.ts`, `security.test.ts`, `googleDriveBackup.test.ts` re-run: 51 passed; `tsc -b` and `oxlint` clean | **added** |
| 5 | The end-to-end journeys had drifted behind the shop's plain-language rewrite (PROMPT 18), the optional marketing checkbox and the ten request statuses (PROMPT 17): wrong consent checkbox, "quotation"/"e-mail"/tier/question wording, retired dashboard counters, a home link hard-coded to `/hu/` | `tools/e2e/journeys.cjs`, `tools/e2e/quote-journey.cjs`, `tools/e2e/shop-journey.cjs` (expectations only; `cms-journey.cjs` unchanged) | none (tools run against throw-away servers) | `quote-journey` 11/20 → **20/20**, `journeys` A–E 52/56 → **72/72**, `shop-journey` 31/41 → **41/41**, `cms-journey` 22/22; before each change the live copy and the server log were checked, so no product defect was papered over | **fixed** |
| 6 | The audit's findings had nowhere to live | `docs/audit/*` (13 files) | none | read through; every number traced to a run or a live read-only request | **added** |

Final gate after all changes (2026-11-13): `tsc -b` exit 0 · `oxlint` exit 0 · `i18n:check` and `i18n:validate` OK (spelling 0 unknown) · **100 test files, 2 149 tests passed** · `npm run build` OK (91 pages) · `check:seo` OK (92 files, 76 indexable) · `npm audit` 0 vulnerabilities.

## Deliberately NOT changed (and why)

| Item | Why left |
| --- | --- |
| `VITE_SITE_URL` / canonical host (I-1) | a build variable on Render or a dashboard redirect; a deploy is needed; the owner chooses the host **Since then (PROMPT 25): done in code, see the last section; the production steps stay with the owner.** |
| `.github/workflows/ci.yml` (I-2) | one line would add the deployment branch, but it changes what runs on the owner's repository; proposed in PROMPT 20 **Since then (PROMPT 25): done in code, see the last section; the production steps stay with the owner.** |
| Backup encryption, last-backup record, catch-up, pre-migration snapshot (K-1…K-3, D-3) | each changes start-up or the backup format on production data; designed in PROMPT 20 scope **Since then (PROMPT 25): done in code, see the last section; the production steps stay with the owner.** |
| DNS (SPF/DKIM/DMARC), Cloudflare, Render settings | production configuration: not to be changed without explicit authorization; exact instructions are in the audit files |
| Unreferenced source files (F-3), hard-coded colours (F-2) | the brief: do not remove code that merely looks unused; no user impact |
| `docs/production/README.md` (`TRUST_PROXY=1`) | the right number must be measured; the measuring method is in INFRASTRUCTURE_AUDIT.md |
| `data/app.sqlite` (local), `.env`, `dist/` | not touched (the local database was only **copied** for the structure audit; `dist/` is a build output and was rebuilt several times, as `npm run build` does) |

## Owner checklist: answers to fill in

Open each, note what you see (names only; never paste a value) and the date.

| ID | Where | Question | Answer |
| --- | --- | --- | --- |
| R-1 | Render → service → Disks | persistent disk mounted at the folder of `DATABASE_PATH` and `MEDIA_DIR`? size? |  2026-11-16, owner: mounted at `/var/data`. **Unverified** (not seen in the dashboard); the System page now shows the free space of the folder the database lives in  |
| R-2 | Render → Environment | all expected variable names present, no `ANTHROPIC_MODEL`? | |
| R-3 | Render → Environment | `TRUST_PROXY` value; measured? |  2026-11-16, owner: was `0`. **Unverified**, and `0` is probably wrong behind a proxy. The System page now measures it (docs/operations/README.md); do not guess a number  |
| R-4 | Render → Settings | build command, start command, Node version ≥ 22.18 | |
| R-5 | Render → Settings | health check path | |
| R-6 | Render → Settings | deployed branch; auto-deploy on/off | |
| R-7 | Render → Events | last successful deploy and its commit | |
| R-8 | Render → Logs | any `warn` from the start-up checks (now including `TRUST_PROXY`) | |
| R-9 | Render → plan | always-on instance (no sleeping) | |
| R-10 | Render → Custom Domains | which host is primary |  2026-11-16, owner decision: the **apex**, `https://szilardkiss.com`, is canonical (see D-1). Which host Render treats as primary: **unverified**  |
| R-11 | Render → scaling | exactly 1 instance | |
| C-2 | Cloudflare → SSL/TLS | mode **Full (strict)** | |
| C-6 | Cloudflare → Email Routing | rules and verified destination | |
| C-7 | Cloudflare → Workers | does the Worker `mywebsite` exist, is it routed to the domain? | |
| E-1 | e-mail provider dashboard | domain verified? DNS records published? |  2026-11-16, owner: provider is Cloudflare Email Sending / SMTP `smtp.mx.cloudflare.net`; a test e-mail arrived. **SPF, DKIM and DMARC: unverified**  |
| K-4 | Google Cloud console | OAuth consent screen status: **In production** (not Testing)? |  2026-11-16, owner: previously reported *In production*. **Unverified**: check in the Google Cloud console; a client in *Testing* ends the token after 7 days  |
| A-1 | the host / admin | `ANTHROPIC_API_KEY` set? connection test result? | |

## Decisions the owner must take

| ID | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D-1 | Canonical host | `www` (set `VITE_SITE_URL=https://www.szilardkiss.com`) or apex (make it primary) | the apex, matching "the final domain is `szilardkiss.com`"; either is fine, **mixed is not** **DECIDED 2026-11-16 by the owner: the apex, `https://szilardkiss.com`.** Enforced in CI and tests (PROMPT 25); production still needs the manual steps in docs/operations/README.md |
| D-2 | Where static files are served | keep Render for everything (accept client-side language choice) or Workers for static + Render for API | keep Render; delete or park the Worker until a real need appears |
| D-3 | Branch policy | merge `origin/main` into local `main`, push `main`, fast-forward `deployment/render-cloudflare` only when deploying; add CI to the deploy branch | yes, in that order, by the owner |
| D-4 | MFA for the administration | TOTP in the app, Cloudflare Access in front of `/admin`, or accept password-only | Cloudflare Access is the cheapest strong step |

## PROMPT 25: operational hardening and reliability

Work branch: **`feature/consultation-booking`**, in the worktree `MyWebsite-ops`. Committed locally; **not pushed, not merged, not deployed**. `main` and `deployment/render-cloudflare` were not touched. No Render, Cloudflare, Google Cloud, DNS or e-mail-provider setting was read or changed, and no production database or customer data was used: every run below was against a scratch database or an in-process test server. Details and procedures: [docs/operations](../operations/README.md).

| # | Finding it addresses | What changed | Files | Production effect | Verification | Result |
| --- | --- | --- | --- | --- | --- | --- |
| 7 | K-1 Drive copies not encrypted | optional AES-256-GCM of every backed-up file (`BACKUP_ENCRYPTION_KEY`), key id and authenticated header, documented decrypt command | `server/src/modules/backups/crypto.ts`, `artifacts.ts`, `local.ts`, `cli.ts` | none until the owner sets a key; without it nothing changes | `backupRestore.test.ts`; the restore drill (docs/operations/RESTORE_DRILL.md): a wrong key, no key and a changed byte are refused | **fixed in code**; real Drive not exercised |
| 8 | K-2 no verification, no record | every run recorded (`backup_runs`, migration 0040): time, files, bytes, SHA-256, category on failure; the upload is checked against Drive's size and MD5 before an earlier copy is deleted; shown on the System page with a stale state after 30 hours | `modules/backups/records.ts`, `googleDrive.ts`, migration `0040_operations_hardening.sql` | one new table on the next start; no existing data touched | `backupReliability.test.ts`, `googleDriveBackup.test.ts`, `systemOperations.test.ts` | **fixed in code** |
| 9 | K-3 a restart at the scheduled hour skips the day | catch-up shortly after start when no backup succeeded in 24 hours; one run at a time | `googleDrive.ts` (`startBackupScheduler`) | a backup may run at start-up after a deploy | `backupReliability.test.ts` (decision logic and timing) | **fixed in code** |
| 10 | K-5 delete-before-upload | upload, verify, then delete the earlier copy | `googleDrive.ts` | none | `googleDriveBackup.test.ts` (a failed upload keeps the earlier copy) | **fixed** |
| 11 | D-3 no safety before a migration | a checked `VACUUM INTO` snapshot before pending migrations touch an existing database; a failure leaves the database as it was and names the snapshot; retention `MIGRATION_SNAPSHOT_DAYS` (default 14) | `server/src/db/snapshot.ts`, `main.ts`, `cli.ts` | **a full copy of the database is written beside it before a migration**: disk space matters (the System page shows it) | `migrationSnapshot.test.ts`, `migrationSnapshotSpace.test.ts` (a failing migration, several pending, no space, an older database upgraded) | **fixed in code** |
| 12 | no operational overview | Command Center on the System page (backup, migrations, disk, e-mail, assistant, network, deployment); no secrets, no customer data | `server/src/modules/system/operations.ts`, `src/admin/components/CommandCenter.tsx` | read-only | `systemOperations.test.ts`, `operationsConfig.test.ts`, `CommandCenter.test.ts` | **added** |
| 13 | B-1 `TRUST_PROXY` | the System page shows the address the server sees, the chain, Cloudflare's header and a measured number; the value is **not** changed | `operations.ts`, `.env.example` | none | `systemOperations.test.ts` | **measurement added; the value is still the owner's, still open** |
| 14 | I-2 CI does not cover the deployment branch | CI runs on a push to `deployment/render-cloudflare`; builds and checks with the canonical address; read-only permissions; `npm run check:deploy`; a manual read-only smoke test of `/api/health` and `/api/ready` | `.github/workflows/ci.yml`, `smoke-ready.yml`, `scripts/check-deploy.mjs`, `scripts/smoke-ready.mjs` | none: no workflow deploys or holds a secret (a test checks that) | `ciWorkflow.test.ts`, including a contract test against the real `/api/ready` (it caught a wrong assumption about the answer's shape); the SEO check run with the canonical origin: 101 files OK, and refused for `www` | **added** |
| 15 | I-1 canonical host | one host in the sitemap, canonical links and hreflang (checked in CI); a 301 safeguard in the server, **off** by default | `scripts/check-seo.mjs`, `server/src/http/canonical.ts`, `config.ts` | none until `CANONICAL_REDIRECT=true`; the dashboard steps stay with the owner | `canonicalHost.test.ts` (the sitemap host equals the redirect target; the hu, en and nl routes) | **fixed in code; the production switch is manual** |
| 16 | admin routes not systematically covered | every route under `/api/admin` found from the router; a policy line for each; 401, CSRF, origin, editor/administrator and no-5xx checks | `server/test/adminRoutePolicy.ts`, `adminRoutes.test.ts`, `Router.list()` | none | `adminRoutes.test.ts`: 16 tests; three mutations (a weakened permission, a route without a session, an unclassified route) each made it fail | **added** |
| 17 | journeys break on rewording | invisible `data-testid` hooks (toast, status, field error, booking states); the booking journey uses them; a ratchet on sentence assertions | `src/admin/components/Toast.tsx`, `StatusBadge.tsx`, `form.tsx`, `src/pages/BookingPage.tsx`, `tools/e2e/selectors.cjs`, `booking-journey.cjs` | attributes only | the booking journey at 1440 px: 40 passed, 0 failed (axe included); `journeySelectors.test.ts`, `testHooks.test.ts` | **partly done**: 87 sentence assertions remain in seven other journeys, counted and ratcheted, not converted |

### What stays open after PROMPT 25

- **Owner actions, all unverified or undone:** the canonical-host steps (Render's primary domain and `PUBLIC_URL`, the direction of the Cloudflare redirect), measuring and setting `TRUST_PROXY`, setting `BACKUP_ENCRYPTION_KEY` and keeping a sealed copy, a first real restore from a Drive download, SPF/DKIM/DMARC, the OAuth consent status (K-4), the disk and its size (R-1), a sealed copy of the host's environment (K-6).
- **Not exercised for real:** the Google Drive upload and its verification, the Cloudflare Email Sending provider, the live Render deploy, the Render disk, the real model. Everything was run against stand-ins, scratch databases and in-process servers.
- **Migration number:** 0040, because the Gmail branch uses numbers in the 30s; the runner accepts gaps. Confirm when the branches are merged.
