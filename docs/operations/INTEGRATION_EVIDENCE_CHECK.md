# Integration evidence check (D-3, D-4, D-5): strict read-only

Written 2026-11-17. It answers three questions that must be answered before the integration of `deployment/render-cloudflare` and `feature/consultation-booking` is started: **D-3** what Render is configured to do, **D-4** what is really running in production for Gmail and the database schema, **D-5** whether a backup can be trusted and restored. It is an evidence report, not a plan and not an action. The plan is [INTEGRATION_PLAN.md](INTEGRATION_PLAN.md); the audit it follows from is [PRODUCTION_READINESS_AUDIT.md](PRODUCTION_READINESS_AUDIT.md).

## 0. At a glance

**Verdict: NO-GO** for releasing the integration. The blockers are in section 8.2, the owner's checklist in section 7; a one-screen version follows here.

### What was NOT tested

Stated first, because it is easy to assume the opposite:

- **Production migrations: not tested.** None was run, here or against production. What is known about production's schema is an **inference** from earlier read-only observations (D4-10, D4-11), not a read of its database.
- **Gmail synchronisation: not run, and not verified in production.** No connection to Gmail or to Google was made, and no credential was read.
- **Real Google Drive backups: not verified.** No backup was created, listed, downloaded or checked against the real Drive. What production writes is known only from the code that is deployed.
- **A production restore: never done.** The only restore ever executed was a drill on **synthetic scratch data** (2026-11-16, by the author of the code), which this check did not re-execute.
- Nothing in Render, Cloudflare, Google Cloud, Gmail or Drive was seen or changed.

### A. Verified repository evidence

Read from tracked files, or from the deployment ref with read-only `git`; no dashboard was involved.

- The repository has **no deployment configuration** (no `render.yaml`, `Dockerfile`, `.node-version`); the repository's own documents name `deployment/render-cloudflare` as production, which is a statement of intent (R-01, R-02).
- What the repository **expects** of Render: `npm ci` then `npm run build` with `VITE_SITE_URL` and `VITE_API_URL=/`; start `npm run server:start`; Node 22.18 or newer; health check `/api/ready`; `DATABASE_PATH` and `MEDIA_DIR` on a persistent disk (R-05 to R-13).
- **Gmail** (code on `217c6d4`): migration `0030_gmail_messages.sql` creates `gmail_messages` and `gmail_sync_state`; the expected schema version on that line is **30**; the four variable names; the scopes `gmail.readonly` and `gmail.send` (the second is required but never used); synchronisation is **manual only** (`POST /api/admin/gmail/sync`, administrators, 6 a minute); the code calls Gmail with `GET` only, for a list and for one message, and never sends, modifies or deletes mail (D4-01 to D4-08).
- **Backups:** production's deployed code writes a plain, unencrypted `database.sqlite` and `media/` with no manifest, deletes the same-name Drive file **before** uploading and verifies nothing (D5-01 to D5-05). The code on this branch makes encryption **optional** (`BACKUP_ENCRYPTION_KEY`), verifies sizes and hashes, checks Drive's size and MD5, and never overwrites a database on restore (D5-06 to D5-16).
- The migrations of both lines are purely additive and the numbers do not collide (`INTEGRATION_PLAN.md`, section 2.2).

### B. Owner-reported information (not verified by this work)

| Reported by the owner | Where it matters |
| --- | --- |
| A persistent disk is mounted at `/var/data` | R-14 |
| `TRUST_PROXY` was `0` | the audit's F-04 |
| The canonical host is `https://szilardkiss.com` (the apex) | a decision; production still redirects the apex to `www` (earlier evidence) |
| Outgoing e-mail goes through SMTP at `smtp.mx.cloudflare.net`; a test message arrived; SPF, DKIM and DMARC were not verified | `PRODUCTION_READINESS_AUDIT.md`, section 8.1 |
| The Google OAuth consent screen was switched to Production | D4-16 |
| Release 1 contains only the current line; the branch is `integration/release-1` | `INTEGRATION_PLAN.md`, section 0 |

### C. Requires manual dashboard verification (the owner's access)

Render (branch, auto-deploy, build and start commands, Node version, health path, disk, variable **names**, instance count, latest live deploy and its commit); Cloudflare Workers Builds (why the two builds failed, the production branch, what a non-production build deploys); Google Drive (is there a recent dated backup); Google Cloud (OAuth consent status and scopes); and, as a signed-in administrator, three read-only addresses of the application itself. Exact navigation: section 7.

### D. Owner checklist, short form

1. **Render**, the service that serves `www.szilardkiss.com`: branch, Auto-Deploy on or off, build command, start command, health check path, Node version, disk and mount path, variable names present or absent, instance count, and the latest live deploy's commit id.
2. **The application, signed in as an administrator, reading only**: `/api/admin/system` (`migrations`: expected 30, 30, 0), `/api/admin/gmail/status` (`configured`), `/api/admin/gmail/sync-status`. Do **not** start a synchronisation; the *Check connection* button is your choice (it makes one request to Google).
3. **GitHub and Cloudflare**: the first lines of the error in *Workers Builds: mywebsite* for `29f4b31` and `217c6d4`; the production branch; what a successful non-production build does.
4. **Google Drive**: the newest dated folder under `GOOGLE_DRIVE_FOLDER_ID` or *Portfolio Backups*, with the size of `database.sqlite`. Downloading it is optional and never needed for this report.
5. **Google Cloud**: the OAuth consent screen's publishing status and the scopes.
6. Before `BACKUP_ENCRYPTION_KEY` is ever set: a sealed copy of the key outside the host.
7. Reply with **names, states, dates and commit ids only**; never a value, key, token, password or mailbox address.

## 1. Current branch, commit and working tree

| | |
| --- | --- |
| Worktree used | `MyWebsite-ops` (the audited worktree) |
| Branch | `feature/consultation-booking` (not switched) |
| Code evidence taken at | `29f4b316dffb571fe9ef0f104e7be9bc945327b9`, equal to `origin/feature/consultation-booking` when the evidence was gathered. This report and the two documents it links were committed afterwards, on the owner's request, because a review on GitHub found them missing (they had only ever existed as untracked files in the worktree). The commit that adds this file: `git log -1 -- docs/operations/INTEGRATION_EVIDENCE_CHECK.md`. |
| Working tree when the evidence was gathered | no tracked change; untracked: the two documents named above and this report |
| `main` | local `77c0df4`, `origin/main` `254a202`: unchanged |
| `deployment/render-cloudflare` | local and `origin`: `217c6d4`: unchanged |
| An integration branch or pull request | none exists (`git branch -a --list '*integration/release*'`: 0) |
| The session's primary checkout | `feature/client-communication` at `8c377ad`, another piece of work: not touched |

**What this check did:** read tracked files and the Gmail code on the deployment ref with read-only `git` (`git show`, `git grep`, `git ls-tree`), and read the repository's documents. **What it did not do:** see section 9. In particular, **no request of any kind was sent to production, to Gmail, to Google, to Render or to Cloudflare while this report was prepared**, no test or command of the project was run, and no restore was performed.

### 1.1 Earlier evidence that this report cites (not repeated)

Earlier on the same day, before this task's rule against calling production APIs, 14 unauthenticated read-only `GET` requests were made to the live site, and GitHub's public API was read. They are cited below as **earlier evidence**, with their date, and were **not repeated** for this report.

| Earlier observation (2026-11-17) | Source |
| --- | --- |
| `https://www.szilardkiss.com/api/ready` answered `200` with `migrations: current`; the response header `x-render-origin-server: Render` was present; the apex answered `301` to `www` | live `GET`s |
| `/api/admin/gmail/status`, `/gmail/sync-status`, `/gmail/unassigned` answered `401` (a route that exists); a made-up admin route answered `404`; `/api/admin/booking-config`, `/api/admin/media-storage`, `/api/consultations/config` answered `404` | live `GET`s |
| GitHub: no Render status or check on `217c6d4`, `254a202`, `77c0df4`, `29f4b31`; `deployments`: 0; the repository's webhooks answered `401` | GitHub public API |
| GitHub: a Cloudflare check run *Workers Builds: mywebsite* on `254a202` (success), `217c6d4` (failure), `29f4b31` (failure) | GitHub public API |
| GitHub: one workflow run in the repository's life (`CI`, `main@254a202`, failure at `npm test`); none for `29f4b31`; zero pull requests | GitHub public API |

## 2. Classification used

| Label | Meaning here |
| --- | --- |
| **VERIFIED** | directly confirmed by evidence that was accessible: a tracked file, the code on a ref, or an earlier observation that is cited with its date |
| **PARTIALLY VERIFIED** | some evidence exists, an important part is missing |
| **OWNER ACTION REQUIRED** | only the owner's dashboard or account can answer it |
| **NOT VERIFIED** | no sufficient evidence exists |
| **BLOCKER** | must be resolved before integration can be released |

A statement about what the **repository expects** is VERIFIED when the file says so. It says nothing about what a dashboard is set to; that is always a separate row.

## 3. D-3: Render deployment

### 3.1 Findings

| ID | Finding | Label | Evidence source and exact reason |
| --- | --- | --- | --- |
| R-01 | The repository contains no deployment configuration | VERIFIED | `git ls-files` lists no `render.yaml`, `Dockerfile`, `Procfile`, `.node-version`, `.nvmrc` or hosting file. The service is configured only in the dashboard. |
| R-02 | The repository's statements of which branch is production | PARTIALLY VERIFIED | `docs/audit/INFRASTRUCTURE_AUDIT.md:47,90` and `docs/audit/PLATFORM_OVERVIEW.md:54` name `deployment/render-cloudflare` "by name and content"; `.github/workflows/ci.yml:14` runs CI on it. These are documents written inside this repository, not configuration, and they say "treat as production until R-6 says otherwise". |
| R-03 | The branch Render actually follows | OWNER ACTION REQUIRED | Dashboard only. GitHub shows no Render status, check or deployment on any commit (earlier evidence), so GitHub does not tell. |
| R-04 | Whether auto-deploy is on | OWNER ACTION REQUIRED | Dashboard only. A branch existing on GitHub does not prove it. The live site runs code from a push dated 2026-11-15 (section 4), so *some* deploy of that push happened, automatic or by hand. |
| R-05 | The build command the repository expects | VERIFIED | `docs/audit/INFRASTRUCTURE_AUDIT.md:45`: `npm ci`, then `npm run build` (`package.json:11`: `tsc -b && npm run i18n:check && vite build && npm run build:seo`), with the build variables `VITE_SITE_URL` and `VITE_API_URL=/` (`docs/production/README.md:19`, `docs/backend/README.md:262`). |
| R-06 | The build command Render uses | OWNER ACTION REQUIRED | Dashboard only. |
| R-07 | The start command the repository expects | VERIFIED | `npm run server:start` (`package.json:18`; `docs/audit/INFRASTRUCTURE_AUDIT.md:45`; `docs/production/README.md:21`). It applies migrations at start unless `MIGRATE_ON_START=false` (`docs/backend/README.md:23`). |
| R-08 | The start command Render uses | OWNER ACTION REQUIRED | Dashboard only. |
| R-09 | The Node version the repository requires | VERIFIED | `package.json:6-8`: `>=22.18` (the `node:sqlite` module). |
| R-10 | The Node version Render runs | OWNER ACTION REQUIRED | Dashboard or environment only; there is no `.node-version` in the repository. |
| R-11 | The health-check endpoints the repository provides and recommends | VERIFIED | `/api/health` (liveness) and `/api/ready` (database and schema); `docs/backend/README.md:258` says to put `/api/ready` in the host's health check; `server/src/modules/system/health.ts`. |
| R-12 | The health-check path configured on Render | OWNER ACTION REQUIRED | Dashboard only. |
| R-13 | The persistent-disk requirement | VERIFIED | `DATABASE_PATH` and `MEDIA_DIR` must be on a persistent disk (`docs/backend/README.md:251`, `docs/audit/DATABASE_AUDIT.md:75`, `docs/audit/INFRASTRUCTURE_AUDIT.md:42`); the defaults are relative to the checkout (`server/src/config.ts:303,419`) and would be erased by a deploy. |
| R-14 | A disk exists and is mounted at `/var/data`, with `DATABASE_PATH` and `MEDIA_DIR` inside it | OWNER ACTION REQUIRED | Owner-reported only (`docs/operations/README.md:32`). Production accepts a configuration with `DATABASE_PATH` unset (the audit's F-06). |
| R-15 | Required environment variable **names** | VERIFIED | Section 3.2. Whether each is set in Render: see R-16. |
| R-16 | The variables set in Render | OWNER ACTION REQUIRED | Dashboard only. Names, never values. |
| R-17 | Which commit is deployed | OWNER ACTION REQUIRED | The deployment ref's admin data shows no commit (no use of `RENDER_GIT_COMMIT` there); only Render's deploy list does. Earlier behaviour evidence (section 4, D4-09) is consistent with `217c6d4` but is not a commit id. |
| R-18 | A second build pipeline is connected to the repository | VERIFIED | GitHub check runs *Workers Builds: mywebsite* on three commits (earlier evidence). It builds pushed branches, including feature branches. What it deploys is not visible: OWNER ACTION REQUIRED (section 7, check C). |
| R-19 | One always-on instance | OWNER ACTION REQUIRED | The design needs exactly one (`docs/audit/INFRASTRUCTURE_AUDIT.md:50,52`); nothing in the repository prevents more. |

### 3.2 Environment variable names (names only)

From `server/src/config.ts` and `.env.example` at `29f4b31`, with the Gmail names taken from the deployment ref.

| Group | Names | What the code enforces |
| --- | --- | --- |
| Always, in production | `APP_ENV=production`, `APP_SECRET` (32 or more characters, not a placeholder) | start-up refuses otherwise |
| Needed in practice | `HOST` (default `127.0.0.1`), `PORT`, `STATIC_DIR`, `DATABASE_PATH`, `MEDIA_DIR`, `PUBLIC_URL`, `CORS_ORIGINS`, `NOTIFY_TO` | not enforced; `PUBLIC_URL` unset means e-mailed customer links are omitted (`bookings/mail.ts:74`) |
| Proxy | `TRUST_PROXY` | default 0; a warning at start-up in production when 0 |
| E-mail | `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `EMAIL_ENABLED`, `EMAIL_MAX_ATTEMPTS`; for `smtp`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_TLS_REJECT_UNAUTHORIZED` | `file` and unencrypted or unverified SMTP are refused in production |
| Gmail (deployment ref only) | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_ACCOUNT_EMAIL` | optional; an incomplete set leaves Gmail off and only logs which names are missing |
| Drive backup | `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_REFRESH_TOKEN` (all or none), `GOOGLE_DRIVE_FOLDER_ID`, `BACKUP_RETENTION_DAYS`, `BACKUP_HOUR_UTC` | backups are off unless the three are set |
| Added by the audited line | `BACKUP_ENCRYPTION_KEY`, `MIGRATION_SNAPSHOT_DAYS`, `MIGRATION_SNAPSHOT_DIR`, `CANONICAL_REDIRECT` | all optional |
| Host-provided, read only to show the commit (audited line) | `RENDER_GIT_COMMIT`, `GIT_COMMIT`, `RENDER_SERVICE_NAME` | nothing depends on them |
| Assistant, deploy hook | `ANTHROPIC_API_KEY`, `AI_*`, `DEPLOY_HOOK_URL` | optional |
| Build time | `VITE_SITE_URL`, `VITE_API_URL` | needed in practice |

## 4. D-4: Gmail in production

All code facts below are from `origin/deployment/render-cloudflare` (`217c6d4`) read with `git show`; the audited line (`29f4b31`) has no Gmail code at all.

### 4.1 What the implementation is

| ID | Finding | Label | Evidence source and exact reason |
| --- | --- | --- | --- |
| D4-01 | The migration that creates the Gmail tables | VERIFIED | `server/src/db/migrations/0030_gmail_messages.sql`, added by `217c6d4` (`git log` on the ref): creates `gmail_messages`, `gmail_sync_state` and seven indexes. It stores decoded plain-text bodies, addresses, headers and attachment metadata; never the raw payload, the HTML, attachments or credentials (the file's own header). |
| D4-02 | The expected schema version | VERIFIED | On the deployment ref the migration files are 1–8 and 30, so the highest is **30** and `migrationStatus` should read `current: 30, latest: 30, pending: 0`. (After the integration the highest would be 40.) |
| D4-03 | Required environment variable names | VERIFIED | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_ACCOUNT_EMAIL` (`server/src/config.ts` on the ref; `docs/backend/README.md:333-335` there). All four are optional; an incomplete set only logs the missing names. |
| D4-04 | OAuth scopes | VERIFIED | `GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send']` (`server/src/modules/gmail/tokenService.ts:20`). The connection check **fails** with `insufficient_scope` if Google reports that either was not granted (`tokenService.ts`, the scope check in the token exchange). |
| D4-05 | The scope is broader than the code uses | VERIFIED | `gmail.send` is required, but no code in the Gmail module sends: see D4-07. |
| D4-06 | Synchronisation is manual | VERIFIED | The only way to run one is `POST /api/admin/gmail/sync` by an administrator (`system:write`), limited to 6 a minute per administrator (`gmail/admin.ts`, `runSync`). `git grep` finds no timer, interval or scheduler in `server/src/modules/gmail`, in `main.ts` or in `app.ts` that concerns Gmail (the two timers there are the general session sweeper and maintenance). A run is bounded: a recent window (default 14 days, 1 to 90), at most 50 imports by default (1 to 100), 500 listed. There is no screen to start it (commit title "manual sync, no UI"). |
| D4-07 | The implementation does not send, delete or modify Gmail messages | VERIFIED (static reading) | The module calls Gmail with `GET` only: `/messages` (list) and `/messages/{id}?format=full` (`gmail/api.ts:12,150,183,200`); the one `POST` is to Google's token endpoint (`tokenService.ts`). A search of all eight files of the module (`admin`, `api`, `association`, `html`, `mime`, `repository`, `sync`, `tokenService`) for send, modify, trash, insert, import, delete and batch calls finds none; the only matches are comments saying that the integration makes exactly two Gmail calls, list and get (`api.ts:4-5`, `mime.ts:5`), and the token request's `POST` (`tokenService.ts:161`). The local copy is deleted by the erase-by-address function, and the code says what is in the mailbox "is the owner's to delete" (`system/maintenance.ts:49`). This is reading code, not observing production. |
| D4-08 | How status is reported | VERIFIED | `GET /api/admin/gmail/status`: `configured`, `connected`, `accountEmail` (shown to administrators), `lastError` (a category), `checkedAt`; makes **no request to Google**; it is "not checked" until a check has been made since the server started. `POST /api/admin/gmail/check`: asks Google for a new access token, records the outcome, writes one administrator-log line, reads no mail. `GET /api/admin/gmail/sync-status`: `configured`, `lastSyncAt`, `lastError`, `importedCount`, `pendingAssociationCount`, `currentlySyncing`; kept in the table `gmail_sync_state`, so it survives a restart. The UI is **Settings → System → Gmail integration** (a status and a check button; none for the sync). |
| D4-09 | Imported mail is not covered by the periodic retention purge or by the public privacy text | VERIFIED (absence) | The retention purge deletes only inquiries, quote requests and e-mail deliveries (`system/maintenance.ts:33-39`); `gmail_messages` is touched only by the erase-by-address function (lines 71-74). In `src/content` and `src/pages` of both refs the only file that mentions Gmail or a mailbox is an unrelated project description (`projectDetails/spendly.ts`); the privacy text does not. Not a blocker for integration; it matters before anyone runs the first synchronisation in production. |

### 4.2 What is known about production

| ID | Finding | Label | Evidence source and exact reason |
| --- | --- | --- | --- |
| D4-10 | Production runs code that has the Gmail routes of `217c6d4` and none of the feature line | PARTIALLY VERIFIED | Earlier live `GET`s (section 1.1): the three Gmail routes answered `401`, the feature-line routes `404`. The route `sync-status` and the file `0030` come from the same commit. Missing: the commit id itself, which no response carries. |
| D4-11 | Migration 0030 is applied in production | PARTIALLY VERIFIED | `/api/ready` reported no pending migration (earlier), and the running code contains the 0030 file (D4-10), so it is applied. This is an inference from two observations. Missing: the `schema_migrations` row, and the number the System page would report (D4-02). The production database was not touched, by instruction. |
| D4-12 | The deployed commit SHA | OWNER ACTION REQUIRED | Render's deploy list. Not readable from the application on this ref. |
| D4-13 | Gmail is configured in production | NOT VERIFIED | Nothing visible from outside. `/api/ready`'s `email: configured` is about the SMTP sender, not Gmail. |
| D4-14 | The Gmail connection is healthy | OWNER ACTION REQUIRED | After any restart the status is "not checked" (D4-08). Only a check, or the owner's reading of Google's side, can show it. |
| D4-15 | Synchronisation has ever been run, and what it holds | OWNER ACTION REQUIRED | `GET /api/admin/gmail/sync-status` when signed in. Not read. |
| D4-16 | The Google OAuth client's publishing status and the scopes the refresh token was granted | OWNER ACTION REQUIRED | Google Cloud console only. |
| D4-17 | The production database was not touched by this check | VERIFIED | No command of the project was run, no connection to the database or to the production service was made. |

## 5. D-5: backup integrity and restore readiness

### 5.1 The code that runs in production today (the deployment ref)

| ID | Finding | Label | Evidence source and exact reason |
| --- | --- | --- | --- |
| D5-01 | Production backups are not encrypted | VERIFIED | `git grep` for `BACKUP_ENCRYPTION_KEY` and AES on the deployment ref: nothing. The code uploads the plain file. |
| D5-02 | The format production writes | VERIFIED | `server/src/modules/backups/googleDrive.ts` on the ref (lines 118-131): one folder per UTC day under `GOOGLE_DRIVE_FOLDER_ID` or a folder named *Portfolio Backups* (line 119), holding a plain `database.sqlite` and `media/<path>`. No manifest, no hash, no record of the run. |
| D5-03 | The upload is not verified, and an earlier copy is deleted first | VERIFIED | `googleDrive.ts:84-86` on the ref: files of the same name are deleted, then the new one is uploaded; no size or checksum is compared afterwards. A failed upload on the same day therefore leaves no copy of that file (the audit's K-5). |
| D5-04 | Whether any Drive backup exists and is recent | NOT VERIFIED | No Drive access. The old code has no screen for it; the signal is the failure e-mail. No backup copy exists on this machine (a name search of Downloads, Desktop, Documents, OneDrive found none). |
| D5-05 | The artifacts a restore needs, old format | VERIFIED | `database.sqlite`, and `media/` for the pictures. Nothing else exists. The audited line's `backup verify` and `backup restore` need a manifest and **refuse** this format (`backups/local.ts:195`); an old-format backup is checked by SQLite's own `integrity_check` and the migration list instead. |

### 5.2 The code on the audited line (`29f4b31`), not deployed

| ID | Finding | Label | Evidence source and exact reason |
| --- | --- | --- | --- |
| D5-06 | Encryption is optional | VERIFIED | `server/src/config.ts:434-441`: it is on only when `BACKUP_ENCRYPTION_KEY` is set; a malformed key is refused. It is off by default. |
| D5-07 | The variable that controls encryption | VERIFIED | `BACKUP_ENCRYPTION_KEY`: 32 random bytes as base64 or 64 hexadecimal characters (`config.ts:196,434-438`). It is registered with the log redaction (`server/src/app.ts:81`). |
| D5-08 | Backup integrity checks are implemented | VERIFIED (code) | Every file's size and SHA-256 in a manifest (`backups/artifacts.ts:37-46`); AES-256-GCM with an authenticated header (`backups/crypto.ts`); `verifyBackupDirectory` checks sizes, hashes and that the database is a whole SQLite file (`backups/local.ts:195`). |
| D5-09 | Google Drive upload verification is implemented | PARTIALLY VERIFIED | `backups/googleDrive.ts:140,159-162`: size and MD5 are compared with what Drive reports, a mismatch fails the run (`integrity`), and an earlier copy is deleted only after that. Verified in code and against a stand-in (`server/test/googleDriveBackup.test.ts`, `driveKit.ts`). Missing: any run against the real Google Drive. |
| D5-10 | Retention and cleanup | VERIFIED (code) | Dated Drive folders older than `BACKUP_RETENTION_DAYS` (default 30) are removed only after a successful run (`googleDrive.ts:196,205`); migration snapshots by `MIGRATION_SNAPSHOT_DAYS` (default 14), the newest always kept (`db/snapshot.ts`); the temporary database copy is removed in a `finally` (`backups/artifacts.ts:99-111`). |
| D5-11 | The artifacts a restore needs, new format | VERIFIED | `manifest.json` (or `.enc`), `database.sqlite` (or `.enc`), every `media/…` file (or `.enc`), the **key** if the manifest says `encrypted` (its public key id is printed by `backup verify`), and code that knows the manifest's `schemaVersion` (a database from a newer schema is refused by the migration runner, `db/migrate.ts:79`). |
| D5-12 | The restore drill is documented | VERIFIED | `docs/operations/RESTORE_DRILL.md`: the commands, and the output of a drill dated 2026-11-16 on a **scratch** database. |
| D5-13 | The restore drill is independently verifiable | PARTIALLY VERIFIED | The commands are in the repository and a third party can re-run them; the repository has 51 test cases for backup, restore and migration snapshots, by a count of their `it(` calls (`backupReliability` 21, `backupRestore` 10, `googleDriveBackup` 6, `migrationSnapshot` 13, `migrationSnapshotSpace` 1). The drill's recorded run was done by the author of the code and **was not re-executed in this check**; the tests were not run either. |
| D5-14 | A real production backup has been verified, or a real restore from a Drive download done | NOT VERIFIED | Never done. The drill's own table has an empty row for it (`RESTORE_DRILL.md`, "first, from Drive"). |
| D5-15 | A sealed copy of the encryption key exists and is safe | OWNER ACTION REQUIRED | Not applicable to what runs today (D5-01), and **no key was read, requested or logged in this check**. It becomes the owner's first task before the key is ever set. |
| D5-16 | Restoring never touches the live database | VERIFIED (code) | `restoreBackup` writes only to new paths, refuses an existing target and the live database's path (`backups/local.ts:210-214`). |

## 6. Safe local restore-validation procedure

**Documented, not executed in this check.** The earlier drill (2026-11-16, `RESTORE_DRILL.md`) followed the same shape; this procedure repeats it so that a third party, or the owner, can reproduce it, and adds the old-format case that production actually has.

**Rules, all of them:**

1. A new, empty temporary directory (created with `mktemp -d` or the operating system's equivalent), used for everything and deleted at the end.
2. A **synthetic** dataset only: an empty database migrated by the project, the public catalogue the project seeds (website content, no customer data), a throw-away administrator with a generated password, and picture files filled with random bytes. No file from Drive, from the production database or from `MyWebsite/data/app.sqlite` (a local database of unknown origin) is used.
3. Start from a clean environment: every variable the project reads is set explicitly in the command, none is inherited (check `env | grep -E 'DATABASE_PATH|MEDIA_DIR|GOOGLE_DRIVE|BACKUP_|GMAIL_|EMAIL_|SMTP_|APP_SECRET'` prints nothing before starting).
4. `DATABASE_PATH` and `MEDIA_DIR` always point **inside the temporary directory**. The restore command's target must be a path that does not exist.
5. The key is generated for the run into an environment variable (for example `BACKUP_ENCRYPTION_KEY="$(openssl rand -base64 32)"`), never typed, echoed, put on a command line or written to a file, and the shell's trace option stays off. At the end, count (without printing) whether the key appears in any log: `grep -rcF -- "$BACKUP_ENCRYPTION_KEY" <logs>` must be 0 everywhere.
6. Nothing in the procedure talks to Google, Gmail, Render, Cloudflare or any network service. The throw-away server listens on `127.0.0.1` on a free port.

**Steps** (`CLI` stands for `node --disable-warning=ExperimentalWarning server/src/cli.ts`, run from a checkout of the code under test):

| # | Step | Pass criterion |
| --- | --- | --- |
| 1 | `$CLI migrate`, `$CLI seed`, `$CLI admin create <synthetic address> admin` (password from an environment variable); write three random-byte files under `MEDIA_DIR` | migrations applied; the administrator created |
| 2 | Generate the key (rule 5); `$CLI backup create <tmp>/backup` | exit 0; "encrypted"; a database hash printed |
| 3 | `$CLI backup verify <tmp>/backup` | `Backup OK`, with the key id and the schema version |
| 4 | Read the first 16 bytes of `<tmp>/backup/database.sqlite.enc` | they do **not** start with `SQLite format 3` |
| 5 | `$CLI backup decrypt <tmp>/backup/database.sqlite.enc <tmp>/decrypted.sqlite` | exit 0; the first 16 bytes **do** start with `SQLite format 3` |
| 6 | `$CLI backup restore <tmp>/backup <tmp>/restored/app.sqlite --media <tmp>/restored/media` | exit 0; "Nothing that existed was changed" |
| 7 | Compare every table's row count between the source and the restored database; run `PRAGMA integrity_check` on the restored file; compare the pictures byte for byte | 0 tables differ; `ok`; identical |
| 8 | Start the code on the restored files (`PORT=<free>`, `APP_ENV=development`), `GET http://127.0.0.1:<port>/api/ready`, then stop it | `200`, `ready`, migrations `current` |
| 9 | Must fail: change one byte of a copy of the backup, then `verify` and `restore` that copy | both exit 1; no file written |
| 10 | Must fail: `decrypt` with a different generated key; with no key | exit 1; no file written |
| 11 | Must fail: `restore` onto an existing file; onto `DATABASE_PATH` | exit 1 |
| 12 | The old format, the one production writes: copy a synthetic database to `<tmp>/legacy/database.sqlite` and the pictures to `<tmp>/legacy/media/`; run `$CLI backup verify <tmp>/legacy` | **refused** (no manifest). Then check it by SQLite's own `PRAGMA integrity_check`, the list in `schema_migrations`, and the size. This is the weaker check production's format allows. |
| 13 | Upgrade case: apply the deployment ref's migration files (1–8 and 30) to a scratch database, then the merged set; compare its schema with a fresh database's; then run the deployment ref's files against the upgraded database | the upgrade applies exactly the missing files; schemas equal; the older code **refuses** (this is the rollback hazard) |
| 14 | Delete the temporary directory; confirm no process of the drill is running; run the key count of rule 5 before deleting the logs | nothing left; key count 0 |

**What this procedure can and cannot show.** Steps 1–11 prove the code's backup, encryption, verification and restore on synthetic data. Step 12 shows what a production backup can be checked with today. Step 13 is the schema-upgrade and rollback evidence. None of it proves anything about a **real** Drive download, the size and age of the real data, the Render disk, or whether production backups run. Those stay with the owner (section 7).

**Executed before, not in this check:** steps 1–11 were run by the author on 2026-11-16 (`RESTORE_DRILL.md` records the output); step 13 was run on 2026-11-17 in memory (recorded in `INTEGRATION_PLAN.md`, section 2.2). Step 12 was exercised on synthetic fixtures with a separate checker that is not part of the repository. **Never executed:** anything with a real Drive file.

## 7. Owner action checklist

The labels below are those used in `docs/audit/INFRASTRUCTURE_AUDIT.md` and the project's notes. **I could not see the dashboards**, so if a label differs from what you see, use the nearest one and tell me what it is called. Write down **names, states, dates and commit ids only**. Never paste a value, a key, a token, a password, a mailbox address or a screenshot of the Environment page.

### A. Render (D-3 and part of D-4)

1. Sign in to Render and open the **service that serves `www.szilardkiss.com`** (the live site's responses carry `x-render-origin-server: Render`; if there is more than one service, the one whose *Custom Domains* lists that name).
2. **Settings → Build & Deploy.** Write down: the connected repository; the **Branch**; the **Build Command**; the **Start Command**; **Auto-Deploy** (on or off).
3. **Settings → Health Check Path.** Write down the path.
4. **Events** (or **Deploys**). Write down the **latest deploy marked live**: its commit id (the first 7 characters are enough), its commit message and its time; and whether it was triggered by a push, a manual deploy or a deploy hook.
5. **Disks.** Write down: whether a disk exists, its mount path, its size and its free space.
6. **Environment**, names only: is each of `DATABASE_PATH`, `MEDIA_DIR`, `HOST`, `PUBLIC_URL`, `TRUST_PROXY`, `GOOGLE_DRIVE_CLIENT_ID`, `GMAIL_CLIENT_ID`, `BACKUP_ENCRYPTION_KEY` **present or absent**. For `DATABASE_PATH`, `MEDIA_DIR` and `TRUST_PROXY` the value is not a secret: tell me whether the two paths start with the disk's mount path, and the number of `TRUST_PROXY`. For every other name, only present or absent.
7. The service's plan and **instance count** (always on; exactly one).
8. **Logs**, filtered to `warn`: whether any of these start-up lines appears: "the media folder is on the same filesystem as the application", "TRUST_PROXY is 0", "Gmail is not set up completely". Copy the line's words, nothing else.

### B. The application, as a signed-in administrator (D-4, read-only)

Use the browser in which you are signed in, on `https://www.szilardkiss.com` (the cookie belongs to that host). Opening these addresses sends a `GET` and changes nothing.

| # | What to read | Where | Expected, if the evidence so far is right |
| --- | --- | --- | --- |
| 1 | The deployed commit | **not shown** by the application on this version; take it from A.4 | `217c6d4` |
| 2 | The reported schema version | the **Settings → System** page, or the address `/api/admin/system` and its `migrations` field | `current` 30, `latest` 30, `pending` 0 |
| 3 | Gmail configured, without values | **Settings → System → Gmail integration** (*Configured* / *Not configured*), or `/api/admin/gmail/status`, the field `configured` | unknown |
| 4 | Gmail healthy | the same panel's *Connection* line. After a restart it says *Not checked*. **Do not press the check button unless you decide to**: it makes one real request to Google (a new access token), writes one line in the administrator log, and reads no mail. If you do press it, say so. | unknown |
| 5 | Synchronisation status | the address `/api/admin/gmail/sync-status`: `configured`, `lastSyncAt`, `importedCount`, `pendingAssociationCount`, `currentlySyncing` | unknown; **do not start a synchronisation** |

Do not paste the mailbox address that the panel shows.

### C. Cloudflare and GitHub (the failing builds)

1. GitHub: the commit `29f4b31`, then its checks, then **Workers Builds: mywebsite**, then *Details*. Write down: the step and the first lines of the error. The same for `217c6d4`. No variable values.
2. Cloudflare: **Workers & Pages**, the Worker `mywebsite`; its build settings (the project's notes call the place *Settings > Build*): the **production branch**, whether builds for **non-production branches** are on, and what the non-production command is (for example whether it uploads a version or deploys).

### D. Google Drive (D-5)

1. Open the folder named by `GOOGLE_DRIVE_FOLDER_ID`, or *Portfolio Backups* (the code's default name). Write down the newest dated folder (`YYYY-MM-DD`) and whether it holds `database.sqlite` and a `media` folder, with the size of `database.sqlite`.
2. Whether there is more than one dated folder (the retention keeps 30 days).
3. Only if you decide to: download the newest day's folder to a place **outside the repository** and tell me the path. It holds customer data: it stays on this machine, is used only by the checks of section 6 step 12, and is deleted afterwards. Nothing in this report requires it.

### E. Google Cloud console (D-4 and the Drive backup)

1. **OAuth consent screen**: the **publishing status** (*In production* or *Testing*) of the client used for Drive and, if separate, for Gmail.
2. For each client: the scopes configured for it. (A refresh token in *Testing* ends after seven days.)

## 8. Recommendation and blockers

### 8.1 Recommendation: **NO-GO** for releasing the integration

Local, no-push preparation could be started without touching anything outside the worktree, but it is **not started** and is not recommended until the owner's answers in section 7 come back, because the plan's later steps depend on them (a push can start a Cloudflare build and may be a release; a restore rehearsal needs a backup).

### 8.2 Blockers (must be resolved before the integration is released)

| ID | Blocker | Why | Closed by |
| --- | --- | --- | --- |
| BL-1 | The branch Render follows and its auto-deploy setting are unknown (R-03, R-04) | any push to `deployment/render-cloudflare` may be a release | section 7 A.2 |
| BL-2 | The deployed commit and the schema version were not read (D4-11, D4-12) | the upgrade the integration performs depends on the production database's exact state | section 7 A.4, B.2 |
| BL-3 | No verified, restorable backup of production exists, and production's backups cannot be checked by the new tool (D5-03, D5-04, D5-05, D5-14) | a migration of 9, 10, 11 and 40 is about to run on production data | section 7 D; a first real restore; then the audited code's backups |
| BL-4 | CI has never passed in GitHub, and the Cloudflare builds fail (R-18; earlier evidence) | the first Linux run of the whole suite is still to come | the plan's step 3 (a pull request), after section 7 C |
| BL-5 | The dashboard facts of the audit are unverified: disk, `DATABASE_PATH`, variables, Node version, `TRUST_PROXY` (R-10 to R-16) | production readiness cannot be claimed on assumptions | section 7 A |

Not a blocker, but known: the two unmerged lineages and the migration refusal (the integration itself, `INTEGRATION_PLAN.md`); imported mail outside the retention purge and the privacy text (D4-09); the Gmail scope broader than the code uses (D4-05).

## 9. Checks that were not performed

| Not performed | Why |
| --- | --- |
| Any look at the Render, Cloudflare, Google Cloud or Google Drive dashboards | no access; signing in is the owner's act. Nothing is simulated. |
| Any connection to Gmail or Google, any Gmail API call, any synchronisation | forbidden; and no credential was read |
| Any new request to production (`www.szilardkiss.com` or its API) | forbidden in this task; section 1.1 lists the earlier read-only ones that are cited |
| Reading the production `schema_migrations` or any production row | the production database was not touched |
| Reading the deployed commit SHA | only Render shows it |
| Downloading, opening or verifying a production backup | forbidden; none exists on this machine |
| Running a restore, a backup, a migration or any `server:cli` command | forbidden or unnecessary; the procedure in section 6 is documented only |
| Running any test, typecheck, lint, build or the legacy-backup checker in this check | nothing here needed it; no result from an earlier run is presented as a result of this check |
| Reading, requesting or logging any encryption key, token or password | by instruction |
| Triggering a workflow, creating a branch or a pull request, merging, rebasing, cherry-picking, pushing, deploying | forbidden |
| Verifying that the Drive upload check works against the **real** Google Drive | only a stand-in exists |
| Verifying that a successful non-production Cloudflare build deploys nothing | dashboard only |
