# Backup and disaster recovery

## What exists

| Mechanism | What it does | Verified in this audit |
| --- | --- | --- |
| `npm run server:backup -- <file>` (`cli.ts`) | `VACUUM INTO` writes a **consistent single-file copy** of the live database (WAL included) while the server runs; refuses to overwrite an existing file | **Yes: restore drill below** |
| Automatic **Google Drive backup** (`modules/backups/googleDrive.ts`, started in `main.ts` when `GOOGLE_DRIVE_CLIENT_ID`, `_CLIENT_SECRET`, `_REFRESH_TOKEN` are all set) | once a day at `BACKUP_HOUR_UTC` (default 03:00 UTC): a `VACUUM INTO` snapshot and **every picture under `MEDIA_DIR`** are uploaded into a dated folder (`YYYY-MM-DD`) under `GOOGLE_DRIVE_FOLDER_ID` (or a folder it creates); dated folders older than `BACKUP_RETENTION_DAYS` (default 30) are deleted **after** a successful upload; a failure e-mails `NOTIFY_TO` | **Logic: yes** (6 new tests, stand-in Drive). **Against real Google: no** |
| Configuration backup | the repository (`.env.example` names every variable; values live only in the host) | variables on the host are not backed up anywhere (see gaps) |
| Uploaded media | included in the Drive backup; **not** included in `server:backup` (database only) | yes for Drive logic |
| Recovery documentation | `docs/backend/README.md` §Backup and restore; this file | |

## Restore drill (isolated, 2026-11-13)

All in a scratch folder; the real `data/app.sqlite` was neither read nor written (only a read-only copy was inspected for the database audit).

1. New empty database → `server:migrate` (8 migrations, "Schema version 8") → `server:seed` (4 projects, 22 images, 4 services, 4 packages, 8 add-ons, 6 FAQ entries, tier comparison, FULL EXPERIENCE).
2. `server:backup -- backup.sqlite` → 892 928 bytes. A second backup to the same name **refused** ("already exists").
3. Compared live vs backup: **44 tables, 201 rows, 0 tables with a different count**; backup `integrity_check` ok, **0 foreign-key violations**, 8 migrations recorded.
4. Restore = copy the file to a **new** path; `server:migrate` on it → "The schema is up to date"; `server:check` validates the configuration (it does not open the database).
5. A deliberately corrupted copy (100 bytes flipped) → `database disk image is malformed` on open, so a damaged backup is detected by opening it, **but only if somebody opens it**: nothing checks a backup after it is written (gap K-2).

The Drive logic was tested the same way against an in-memory stand-in: the uploaded `database.sqlite` is a real SQLite file (opened, `integrity_check` ok, the migrations and a written row present), pictures arrive byte for byte under `media/…`, a second run on the same day leaves one copy of each file, old dated folders and their children are removed while a recent one and a folder not named like a date survive, **a failed upload leaves older backups untouched**, credentials appear only in the token request's body (never in a URL), and a failed scheduled run e-mails a reason that contains no secret and reschedules for the next day.

## Gaps

| ID | Severity | Gap | Fix |
| --- | --- | --- | --- |
| K-1 | Medium | Drive copies are **not encrypted** (a full customer database in a Google account; Google's at-rest encryption only) | encrypt the snapshot before upload with a key held outside Drive (AES-256-GCM with `BACKUP_ENCRYPTION_KEY`), and document restoring |
| K-2 | Medium | no verification after upload (size / checksum / `integrity_check` of the uploaded file), no record of the last success: the administration cannot show "last backup: yesterday 03:00" | store `last_backup` (time, files, bytes, sha256) in `settings`, show it on the System page, alert when older than 36 h |
| K-3 | Medium | the scheduler is a timer in the web process: a restart or deploy at the scheduled hour skips the day, and nothing catches up | on start, run a backup if none succeeded in the last 24 h |
| K-4 | Medium | a Google OAuth client in "Testing" status expires its refresh token after 7 days, which would silently end the backups (the failure e-mail depends on working e-mail, E-1) | publish the OAuth app to production (or use a service account / Shared Drive); run a backup by hand once and confirm the dated folder exists |
| K-5 | Low | the upload of a file first deletes the previous file of the same name, then uploads: a crash between the two loses *that day's* copy of that file (earlier days survive) | upload first, delete after |
| K-6 | Low | the host's environment (secrets) has no backup | keep a sealed copy in the owner's password manager: list the variable **names** from `.env.example` |
| K-7 | Info | `server:backup` has no scheduler of its own; `RETENTION_DAYS` for customer data is separate from backup retention | |

## Recovery checklist (use after data loss or a bad deploy)

1. **Stop writes**: suspend the Render service (or set `EMAIL_ENABLED=false` and take it out of rotation) so the database is not changed further.
2. **Find the newest good copy**: Google Drive → the backup folder → the latest `YYYY-MM-DD` folder with `database.sqlite` and `media/`. If K-1 is later implemented, decrypt first.
3. **Check it on your own computer first** (never on production): copy to a scratch folder and run `node --disable-warning=ExperimentalWarning -e "const {DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('database.sqlite',{readOnly:true});console.log(d.prepare('PRAGMA integrity_check').all(),d.prepare('SELECT COUNT(*) n FROM schema_migrations').get())"` (`ok`, and a migration count that is **not higher** than the code's newest migration).
4. **Prepare the volume**: confirm the persistent disk is attached (Render → Disks); note its mount path = `DATABASE_PATH`'s folder.
5. **Restore**: put the file at `DATABASE_PATH` (replace `app.sqlite`; delete any stale `-wal` and `-shm` beside it), put the pictures into `MEDIA_DIR` keeping the `media/…` names.
6. **Start** the service. It migrates forward if the copy is older; it refuses to start on a copy newer than the code (deploy matching code first).
7. **Verify**: `/api/ready` → ready, current; sign in to `/admin`; open the newest inquiry and quote; the Notifications screen shows the e-mail checks.
8. **Account for the gap**: inquiries and quotes made between the backup and the loss are gone: customers who received a link to a quotation created in that window will see "could not load": e-mail them.
9. **Write down** what happened and the backup time in `REMEDIATION_LOG.md`.
10. **Then** fix the cause (disk, deploy, credentials) before turning anything back on.

## Not verified

A real Google Drive upload and restore, the OAuth app's publishing status, the persistent disk's presence and size, a restore onto a Render disk, and any backup older than today (there is none to test locally).
