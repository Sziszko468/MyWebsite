# Restore drill

A backup is only a backup once it has been restored. This page is the procedure, in the order to run it, and the evidence from the drill that was run on 2026-11-16. Run it again after any change to the backup code, and at least once a quarter on a backup downloaded from the real Drive folder.

The restore commands **never** write to the live database, never overwrite a file that exists, and refuse a backup that does not pass its own checks. They are safe to run on the server's machine; they are still best run on a different one.

## The procedure

You need: a downloaded backup folder (from Drive: the day's folder with `database.sqlite[.enc]`, `manifest.json[.enc]` and `media/`), the repository checked out at the same version or newer, Node 22, and, if the backup is encrypted, the key.

```bash
# 1. Is the backup whole? Sizes and SHA-256 of every file; the database opens and passes SQLite's own checks.
BACKUP_ENCRYPTION_KEY=<the key> npm run server:backup -- verify <backup folder>

# 2. Restore into NEW paths (never the live ones). It verifies again first.
BACKUP_ENCRYPTION_KEY=<the key> npm run server:backup -- restore <backup folder> <new database file> --media <new media folder>

# 3. Prove it: boot a throw-away server on the restored copy and ask whether it is ready.
DATABASE_PATH=<new database file> MEDIA_DIR=<new media folder> APP_SECRET=<32+ random characters> PORT=8872 npm run server:start
curl -s http://127.0.0.1:8872/api/ready      # expect {"data":{"status":"ready","checks":{"database":"ok","migrations":"current",…}}}
```

Leave out the key when the backup is not encrypted. The key is read from the environment, never from the command line, so it does not end up in a shell history.

### To really recover (the live site lost its data)

Only after the three steps above succeeded on the copy you are about to use, and with the owner's go-ahead:

1. Stop the service (Render: suspend it, so nothing writes while you work).
2. Keep what is there. Do not delete the old database file: move it aside (`app.sqlite` to `app.sqlite.broken-<date>`) or take a copy.
3. Put the restored database where `DATABASE_PATH` points and the pictures where `MEDIA_DIR` points. On Render that is the persistent disk (reported as `/var/data`, **not verified**), through the shell of the service.
4. Start the service. `/api/ready` must say ready; sign in to the administration; open the System page: migrations current, disk space sensible.
5. Anything created between the backup and the loss is gone. Say so to the people it concerns. E-mails already sent cannot be unsent.
6. Run a backup by hand, or wait for the next one, and check the System page shows it.

### Going back after a bad migration

A snapshot is a plain SQLite file named `pre-v<from>-to-v<to>-<time>.sqlite` in `MIGRATION_SNAPSHOT_DIR` (default: `migration-snapshots` beside the database). With the service stopped, copy it to a new file, check it with `PRAGMA integrity_check`, point `DATABASE_PATH` at it (or move it into place as in the steps above), and deploy the previous version of the code that matches that schema. [INCIDENT_RUNBOOK.md](INCIDENT_RUNBOOK.md) has the full order.

## The drill of 2026-11-16

What it was: a **scratch** database (an empty file, migrated, seeded with the catalogue, one administrator, three picture files), never the production database and no customer data. A key was made for the run and never printed. Everything below is the program's own output, with the long scratch folder shortened to `<scratch>`.

```
== 1. a scratch source
Applied migrations: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 40.
Schema version 40.
Loaded 4 services, 4 packages, 8 add-ons and 6 FAQ entries.
Created admin drill@example.test.
3 picture files written

== 2. backup create (encrypted, because BACKUP_ENCRYPTION_KEY is set)
Backup written to <scratch>\drill\backup: 4 file(s), 1101972 bytes, encrypted.
Database SHA-256 a2d9f715b008ce8a31739f2b4f51f82c1a510abb2b1339866fad7c31d44eb6a8
    1089573  database.sqlite.enc
        822  manifest.json.enc
              media/ab/drill-picture-{1,2,3}.png.enc

== 3. backup verify
Backup OK: 4 file(s) checked, database 1089536 bytes, encrypted (key id cc248c82), schema version 40, made 2026-11-16T16:11:32.246Z.

== 4. the stored database file is not readable without the key
first 16 bytes: 4343424b31cc248c824769aae3324a3d (CCBK1.$..Gi..2J=)
readable as a SQLite file: NO

== 5. backup decrypt of that one file with the key
Decrypted to <scratch>\drill\decrypted.sqlite (1089536 bytes).
first 16 bytes: 53514c69746520666f726d6174203300 (SQLite format 3.)
readable as a SQLite file: YES

== 6. backup restore into new, empty places
Restored the database to <scratch>\drill\restored\app.sqlite (1089536 bytes).
Restored 3 picture(s) to <scratch>\drill\restored\media.
Nothing that existed was changed.

== 7. the restored database against the source
55 tables, 222 rows in the source; 0 tables differ; restored integrity_check: ok; 12 migrations recorded
pictures: source 3, restored 3   (all three byte-identical)

== 8. a server started on the restored database says it is ready
GET /api/ready -> 200 {"data":{"status":"ready","checks":{"database":"ok","migrations":"current","email":"configured"}}}
```

The things that must fail, and did:

| Attempt | Result |
| --- | --- |
| one byte of `database.sqlite.enc` changed, then `verify` | `Backup NOT OK … The encrypted backup is damaged or has been changed: it cannot be authenticated.` exit 1 |
| `restore` of that damaged copy | refused: `The backup did not pass its checks, so nothing was restored.` exit 1; no file written |
| `decrypt` with a different key | `This backup was encrypted with a different key.` exit 1; no file written |
| `decrypt` with no key set | `Set BACKUP_ENCRYPTION_KEY …` exit 1 |
| `restore` onto a file that already exists | refused: `a restore never overwrites` exit 1 |
| `restore` onto the path `DATABASE_PATH` points at | refused: `That is the live database. A restore never writes to it` exit 1 |
| the source database after all of the above | unchanged (55 tables, 222 rows) |

The same checks run in the test suite on every change: `server/test/backupRestore.test.ts` (verify of a plain and an encrypted backup, a changed byte or header or a missing file or a replaced database, restore into an empty scratch place, refusal to overwrite or to write to the live database, decrypt by hand, and the `backup` commands run as an operator runs them, with their exit codes) and `server/test/migrationSnapshot.test.ts` (a failing migration leaves the database as it was and its snapshot is usable). Step 8, booting a server on the restored copy, is part of the manual drill only; the tests stop at opening the restored file.

### What this drill does not prove

- It did not use the real Google Drive: the download step is a person's job (open the day's folder in Drive and download it) and is not exercised here. **Do it once with a real backup** after the first encrypted backup has run in production, and write the date here.
- It did not use the production database or its size. A real database restores in the time it takes to copy it; check the free space first (the System page's Database panel).
- It did not test restoring to Render's disk. The steps above are the procedure; nobody has run them there.

| Real drill | Date | By | Backup used | Result |
| --- | --- | --- | --- | --- |
| first, from Drive | | | | |
