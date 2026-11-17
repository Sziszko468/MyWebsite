# Incident runbook

What to do, in order, when something breaks. Written from what the code does; **none of these steps was rehearsed on the production service**, and the host-side steps (Render, Cloudflare) name the dashboard sections the audit refers to, not buttons that were seen. Where a step needs the owner's decision it says so.

Two rules for every incident:

1. **Look before you change.** The System page (Administration → Settings → System) and `GET /api/ready` answer most questions in a minute and change nothing.
2. **Never overwrite what you cannot get back.** Move a file aside instead of deleting it; restore into a new place first ([RESTORE_DRILL.md](RESTORE_DRILL.md)).

## First minute: what is wrong?

| Look at | It tells you |
| --- | --- |
| `https://szilardkiss.com/api/health` | the process answers (`{"data":{"status":"ok"}}`). Nothing else. |
| `https://szilardkiss.com/api/ready` | the database answers **and** the schema is current. `503 not_ready` names which of the two failed. |
| System page, Backup | last success and its age; `stale` or `never` is an incident of its own |
| System page, Database | migrations pending or current; the newest snapshot; free disk space |
| System page, E-mail | whether sending is on, deliveries pending or failed, the last failure, the set-up checks |
| System page, Network | the address the server sees for you and `TRUST_PROXY` |
| System page, Deployment | which commit is running and since when |
| The same smoke test as after a release | `npm run smoke:ready -- --url=https://szilardkiss.com` |

## The site does not answer

1. `/api/health` from outside. If it answers and the pages do not, the problem is in front of the server (Cloudflare, DNS): check Cloudflare's status and its SSL/TLS mode (**Full (strict)** is expected, C-2, unverified).
2. If `/api/health` does not answer: Render → the service → Logs and Events. A crash loop at start-up usually prints a configuration or migration message; both are specific (`npm run server:cli -- check` prints the configuration without secrets and names the variable that is wrong).
3. If the last deploy is the cause: redeploy the last good commit (the Events list shows the commits; R-7). Do not roll back the **database**: a code rollback does not need one unless a migration ran (below).
4. Free disk space: if the disk is full the database cannot write. The System page shows the free space; the biggest consumers are the database, the pictures and the migration snapshots (`MIGRATION_SNAPSHOT_DAYS`, default 14, each a full copy).

## `/api/ready` says `not_ready`

- `database: unavailable`: the file is missing, unreadable or locked. Check the disk is mounted (R-1) and `DATABASE_PATH` points into it. A service that started with an **empty disk** would create a new empty database: if the site suddenly has no content, stop it at once and go to [the database is lost or wrong](#the-database-is-lost-or-wrong).
- `migrations: pending` for more than a few seconds: a migration did not run or failed. See the next section.

## A migration failed (the server does not start after a deploy)

What the code guarantees: before pending migrations touch an **existing** database, a consistent copy is written to `MIGRATION_SNAPSHOT_DIR` (default `migration-snapshots` beside the database), opened and checked; if that copy cannot be made, **nothing is migrated** and the message says why (not enough free space, not writable). Each migration is its own transaction: the one that fails leaves no trace, and the ones before it stay applied. The error message names the snapshot.

1. Read the message in Render's logs. It names the migration and the snapshot file (`pre-v<from>-to-v<to>-<time>.sqlite`).
2. The database is **not** damaged by the failure. The cheapest recovery is to deploy the previous version of the code (it runs against the schema as it is, unless an earlier migration of the same batch already applied; the message says which).
3. Fix the migration, deploy again. Only if the data itself is wrong (a migration that succeeded and did the wrong thing): stop the service, copy the snapshot to a new file, check it, put it in place, and deploy the code that matches that schema ([RESTORE_DRILL.md](RESTORE_DRILL.md)).
4. If the message is "not enough free space": free some, or set `MIGRATION_SNAPSHOT_DAYS=0` for **one** deploy **only** if a fresh, verified backup exists; set it back afterwards.

## The database is lost or wrong

1. Stop the service (suspend it) so nothing writes.
2. Keep what is there (move it aside; do not delete).
3. Find the newest good backup: the System page shows the last success; the Drive folder has one folder per day. Download it.
4. Follow [RESTORE_DRILL.md](RESTORE_DRILL.md): `verify`, `restore` into a new place, boot a throw-away server on it, then put it in place.
5. Tell the owner what is lost: everything since that backup. The e-mail outbox is part of the database, so a message that was queued after the backup is gone too.

## Backups stopped (the Backup panel says `stale` or `never`, or the failure e-mail arrived)

The e-mail and the panel give a **category**, not a provider message.

| Category | Likely cause | What to do |
| --- | --- | --- |
| `drive_auth` | the refresh token was refused: most often the Google OAuth consent screen is in *Testing* (the token ends after 7 days), or the access was revoked | owner: Google Cloud console, publish the consent screen to *In production* (K-4, unverified), create a new refresh token, replace `GOOGLE_DRIVE_REFRESH_TOKEN`, redeploy |
| `drive_http` | Drive refused the request (quota, a deleted folder, a permission) | check the Drive account's storage and that `GOOGLE_DRIVE_FOLDER_ID` still exists |
| `drive_network` | Drive was unreachable | usually passes by itself; the catch-up runs after the next start, and tomorrow's run |
| `integrity` | Drive stored something other than what was sent | the earlier copy was kept (the new one is verified before it replaces anything); try again; if it repeats, treat as `drive_http` |
| `snapshot` | the database copy could not be made | disk space; the log has the detail |
| `encryption` | the key does not fit | `BACKUP_ENCRYPTION_KEY` must be 32 bytes as base64 or 64 hex characters |
| `interrupted` | the server stopped during the run | nothing; the catch-up runs again after the next start |

To prove the fix: restart the service (the catch-up runs when no backup succeeded in 24 hours) and watch the panel. A fix is confirmed only by a new success on the System page.

## E-mail is not arriving

1. System page, E-mail: is sending on? Deliveries `pending` or `failed`? The last failure time?
2. Run the set-up checks on the e-mail page. They look at DNS (SPF, DKIM, DMARC). **These were not verified for the real domain** (E-1): a missing record is the usual reason a provider accepts a message and the recipient never sees it.
3. The outbox retries by itself; `Retry` on a delivery in the administration sends it again. Nothing is lost while the service runs.
4. The System page's E-mail panel says whether the provider's webhook secret is set. If it is not, the provider cannot report back, and a delivery may stay at *accepted* although the message arrived: a set-up gap, not a loss.

## Everybody is locked out of signing in, or visitors are refused

The sign-in is limited to ten tries per fifteen minutes **per address**. While `TRUST_PROXY` is 0 behind a proxy (reported, unverified), every visitor is the same address, so ten failed sign-ins by anybody lock the sign-in for everyone, and the form limits are shared the same way.

1. Wait fifteen minutes, or restart the service (the limits live in memory).
2. Fix the cause: measure `TRUST_PROXY` ([README.md](README.md#measuring-trust_proxy)).
3. A forgotten password: from the service's shell, `npm run server:admin -- password <email>` (this also signs the account out everywhere).

## A secret may have leaked

Replace it, then redeploy. Nothing below needs the database.

| Secret | What changing it does |
| --- | --- |
| `APP_SECRET` | old address hashes stop matching (limits and statistics start fresh); nobody is signed out |
| An administrator's password | `npm run server:admin -- password <email>` signs that account out everywhere |
| `ANTHROPIC_API_KEY` | the assistant stops until the connection test passes again (System page, then the AI page) |
| `GOOGLE_DRIVE_*` | revoke the old refresh token in the Google account; create a new one |
| `BACKUP_ENCRYPTION_KEY` | set a new key; **keep the old one** until the old backups age out (30 days), or they cannot be read |
| E-mail provider credentials | create new ones at the provider, replace, redeploy |

## What this runbook does not cover

Cloudflare or Render account takeover, loss of the Google account that holds the backups, a legal request for customer data. Those are the owner's to decide, with the providers.
