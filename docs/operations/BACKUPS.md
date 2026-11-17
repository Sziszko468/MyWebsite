# Backups

The site keeps one SQLite database and a folder of uploaded pictures. Both are copied to Google Drive every day, checked, and (when a key is set) encrypted before they leave the server. This page says exactly what that means, what can go wrong, and what the owner has to keep safe.

## What is backed up

| Part | How it is copied | Stored as |
| --- | --- | --- |
| The database | a consistent snapshot (`VACUUM INTO`), made while the server runs, opened and checked before it is trusted | `database.sqlite` (or `database.sqlite.enc`) |
| The uploaded pictures (`MEDIA_DIR`) | every file, under its own name | `media/<folder>/<name>` (or `….enc`) |
| A manifest, written last | the schema version, the time, and for every file its size and SHA-256 | `manifest.json` (or `manifest.json.enc`) |

Not backed up: the host's environment (secrets and settings), the migration snapshots, the website's own source (that is Git). **Keep a sealed copy of the environment variable names and values in the owner's password manager** (finding K-6); `.env.example` lists the names.

## When it runs

- Every day at `BACKUP_HOUR_UTC` (default 03:00 UTC), by a timer inside the web process.
- Shortly after the server starts, if no backup has **succeeded** in the last 24 hours (a deploy or restart at the scheduled hour used to skip the day, finding K-3).
- Only one backup runs at a time, whoever started it.

## What one run does, in order

1. Takes the database snapshot and lists the pictures.
2. Encrypts each file, if `BACKUP_ENCRYPTION_KEY` is set.
3. Uploads each file into the day's folder (one folder per UTC day, named `YYYY-MM-DD`, inside the Drive folder `GOOGLE_DRIVE_FOLDER_ID`, or a folder named *Portfolio Backups*), and **asks Drive what it stored**: the size and the MD5 must match what was sent.
4. Only then deletes an earlier copy of the same file from the same day (a second run on the same day). A failed upload therefore never costs the copy that was there (finding K-5).
5. Uploads the manifest last. A day's folder without a manifest is an unfinished backup.
6. Records the run, then removes dated folders older than `BACKUP_RETENTION_DAYS` (default 30) **only after a success**. A failure while cleaning up is logged and does not fail the backup.

## What is recorded and shown

Every run is a row in the `backup_runs` table: trigger (`scheduled`, `startup` for the catch-up, `manual`), start and finish, the folder, the number of files, the total bytes, the SHA-256 of the database and of the manifest, whether it was encrypted, and, for a failure, a **category** and an HTTP status. Never the text a provider sent back.

Administration → Settings → System → Backup shows the last success and its age, the last attempt, and one of these states:

| State | Meaning |
| --- | --- |
| ok | a success within the last 30 hours |
| stale | the last success is older than 30 hours (a day missed): act on it |
| never | backups are configured and none has succeeded yet |
| running | one is running now |
| disabled | the Drive values are not all set |

On a failure the owner also gets the existing e-mail, now with the category only (for example `reason (category)`).

Failure categories (a fixed list; the administration says each in words, in both languages):

| Category | Meaning |
| --- | --- |
| `drive_auth` | Google refused the credentials: the refresh token was refused (see K-4 below) |
| `drive_http` | Drive answered with an error status (the status is recorded) |
| `drive_network` | Drive could not be reached |
| `integrity` | what Drive stored is not what was sent (size or MD5) |
| `snapshot` | the database snapshot could not be made or read |
| `encryption` | the backup could not be encrypted (for example a key that does not fit) |
| `busy` | another backup was already running |
| `internal` | anything else; the log has the details, the record does not |
| `interrupted` | the server stopped (a deploy, a crash) while the run was in progress; it is marked so at the next start, and the catch-up runs again |

## Encryption

Optional, switched on by `BACKUP_ENCRYPTION_KEY`. Without it backups are stored as they are (protected by Google's own encryption at rest only).

- **Key:** 32 random bytes, as base64 or 64 hexadecimal characters. Make one with `openssl rand -base64 32`. It is a secret, registered with the server's redaction so it can never appear in a log or an answer.
- **Algorithm:** AES-256-GCM, a random 12-byte nonce for every file. A stored file is `CCBK1`, a 4-byte key id, the nonce, the ciphertext and the 16-byte tag. The header is authenticated: a changed header is refused like a changed byte.
- **Key id:** the first four bytes of the key's SHA-256. It tells a wrong key from a damaged file and says which key a backup needs (`backup verify` prints it). It reveals nothing about the key.
- **Losing the key means losing every encrypted backup.** Nobody, including this program and Google, can read them without it. Put a copy in the owner's password manager **and** a sealed copy somewhere that is not the host. Never in Git, never in a `VITE_` variable.
- **Rotation:** set the new key; the next backup uses it. Old backups still need the old key until they age out of the retention window (30 days by default), so keep both until then. `backup verify` shows the key id of each backup, so it is clear which key belongs to which.

## Checking and decrypting by hand

All of these work on a downloaded backup folder, read the database of **no** running server and change nothing that exists. The key is read from the environment, never from a command line.

```bash
# Is this backup whole? (sizes, SHA-256 of every file, the database opens and is a whole SQLite file)
npm run server:backup -- verify <downloaded folder>

# Decrypt ONE file into a new file
BACKUP_ENCRYPTION_KEY=<the key> npm run server:backup -- decrypt <file.enc> <new file>

# Make a backup of the local database into a new folder (the same code the daily run uses)
npm run server:backup -- create <new folder>
```

Restoring is a separate step with its own page: [RESTORE_DRILL.md](RESTORE_DRILL.md).

## Findings this closes, and what stays open

| Finding | Status |
| --- | --- |
| K-1 Drive copies not encrypted | **Closed in code** (optional): set the key |
| K-2 no verification, no record of the last success | **Closed**: Drive is asked what it stored; every run is recorded and shown |
| K-3 a restart at the scheduled hour skips the day | **Closed**: catch-up after 24 hours without a success |
| K-4 OAuth client in *Testing* ends the token after 7 days | **Open, owner:** check the consent screen status in Google Cloud. Reported *In production*, not verified |
| K-5 delete-before-upload | **Closed**: upload, verify, then delete |
| K-6 the host's environment has no backup | **Open, owner:** a sealed copy of the variables in the password manager |
| A second, off-Google copy | **Not built.** One Drive account is one place; a monthly manual download with `verify` is the cheap second copy |

## Tests

`backupReliability.test.ts` (records, catch-up decisions, stale state, failure categories, sanitized e-mail, upload failures that keep the earlier copy), `backupRestore.test.ts` (encryption and decryption, wrong key, tampering, verify, restore into an empty database), `googleDriveBackup.test.ts` (the Drive stand-in), `driveKit.ts` (a stand-in that reports sizes and MD5 like Drive and can be made to fail). None of them talks to Google.
