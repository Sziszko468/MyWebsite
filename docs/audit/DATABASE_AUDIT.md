# Database audit

Method: the schema, indexes, constraints and migration history were read from a **copy** of the local development database (`data/app.sqlite`, copied to a scratch folder, opened read-only) and from the migration files. Only names and row **counts** were read; no row value was printed or stored in this report. The **production database could not be inspected** (it lives on the host; the Render dashboard needs the owner's login). Everything about production below is marked as such.

## Engine and connection

| Item | Finding |
| --- | --- |
| Engine | SQLite through Node's built-in **`node:sqlite`** (no driver dependency). Node prints `ExperimentalWarning: SQLite is an experimental feature`: the API may change between Node releases, so the Node version on the host must be pinned (`engines.node >= 22.18`) |
| Journal mode | `wal` (the `-wal` / `-shm` files must live on the same persistent volume as the database) |
| Foreign keys | enforced (`PRAGMA foreign_keys = 1` on every connection); `foreign_key_check` returns 0 violations |
| Integrity | `PRAGMA integrity_check` → `ok` |
| Path | `DATABASE_PATH`, default `./data/app.sqlite` (relative to the working directory). **In production an in-memory path is refused at start-up; a relative default on an ephemeral filesystem is not**: see "Production persistence" |
| Second database? | none. One file, one engine |

## Tables (44) by area

| Area | Tables |
| --- | --- |
| Administration | `admin_users`, `admin_sessions`, `audit_log`, `settings` |
| Inquiries (contact form) | `inquiries`, `inquiry_notes` |
| Quote requests and quotations | `quote_requests`, `quote_request_items`, `quote_request_item_extras`, `quote_request_notes`, `quotes`, `quote_lines`, `quote_events`, `quote_revision_requests`, `customer_action_tokens`, `customer_updates`, `reference_counters` |
| Shop catalogue | `services`, `service_translations`, `service_packages`, `packages`, `package_translations`, `package_needs`, `package_extras`, `extras`, `extra_translations`, `extra_needs`, `shop_documents`, `site_content`, `site_content_translations` |
| Portfolio and wording | `projects`, `media`, `text_overrides` |
| E-mail | `email_deliveries`, `email_events` |
| Control Room AI | `ai_sessions`, `ai_conversations`, `ai_messages`, `ai_requests`, `ai_tool_calls`, `ai_approvals`, `ai_alerts`, `ai_connection_tests` |
| Migrations | `schema_migrations` |

The local copy holds one administrator and **no business rows** (it was created on 2026-11-10 and never used for real data): it proves the structure, not the data.

## Relationships and constraints

- Deleting a quote request cascades to its items, notes, quotes, tokens and updates (`ON DELETE CASCADE`); deleting an administrator never deletes records (`ON DELETE SET NULL` on every `author_id`, `created_by`, `actor_id`).
- Catalogue rows that a quote refers to are `RESTRICT`: a package, service or add-on that was ever requested cannot be deleted from under its quote.
- **Six triggers make sent quotations immutable**: `quotes_sent_is_immutable`, `quote_lines_no_insert/update/delete_after_send`, `quote_events_no_update`, `quote_events_no_delete`. Partial unique indexes allow one draft and one open quote per request and one confirmation e-mail per submission.
- Money is stored as integers; prices are never read from a request (the server snapshots the approved price).
- JSON columns carry `CHECK (json_valid(...))`.

## Indexes

59 indexes (4 unique, 3 of them partial). Of 39 foreign keys, **29 have an index** (or are the primary key) leading on the column: the ones the application filters and joins on (`idx_quote_request_items_request`, `idx_quotes_request`, `idx_email_deliveries_related`, …). Listing screens are covered by `(status, created)` indexes; dedupe lookups (`idx_inquiries_dedupe`, `idx_quote_requests_dedupe`) and expiry sweeps (`idx_admin_sessions_expires`, `idx_tokens_expires`) have their own.

**10 foreign keys have no index** (**Low**, informational): `audit_log.actor_id`, `inquiry_notes.author_id`, `quote_request_notes.author_id`, `customer_updates.author_id`, `settings.updated_by`, `media.created_by`, `text_overrides.updated_by`, `quotes.created_by` (all `ON DELETE SET NULL` to `admin_users`: the cost is a table scan only when an administrator account is deleted, and there are a handful), `quotes.supersedes_id` (scan only when a quote is deleted) and `quote_revision_requests.quote_request_id` (scan only when a request is deleted). At this size (a portfolio: tens to thousands of rows) none matters; no `EXPLAIN` of production traffic was possible. Adding them is a new migration, so it is left for when one is needed anyway.

## Migration history and safety assessment

| # | Name | Rebuilds a table (DROP + rename)? | Notes |
| --- | --- | --- | --- |
| 1 | `init` | no | creates the schema |
| 2 | `admin_dashboard` | **yes**: `inquiries` | also back-fills `admin_sessions.public_id` |
| 3 | `email_system` | **yes**: `email_deliveries` | adds `email_events` |
| 4 | `projects_media_texts` | no | |
| 5 | `shop_experience` | no | `ADD COLUMN` only |
| 6 | `control_room_ai` | no | 8 AI tables, `ADD COLUMN source` |
| 7 | `quotation_management` | **yes**: `quote_requests`, `email_deliveries` | the largest (293 lines), adds the immutability triggers |
| 8 | `ai_model_lock` | no | `ADD COLUMN` only |

**What makes the runner safe** (`server/src/db/migrate.ts`, covered by `database.test.ts` and `process.test.ts`):

1. Each migration runs in **its own transaction** and is recorded with a SHA-256 checksum; a failure rolls that file back and stops the start. (`database.test.ts` asserts the refusal of an edited migration; the clean 8-step chain was also applied to an empty scratch database by the CLI in this audit and by `process.test.ts`.)
2. A migration that rebuilds a table declares `-- migration: foreign-keys-off`; the runner then follows SQLite's documented procedure (keys off around the transaction, `foreign_key_check` before commit) so the `DROP TABLE` cannot cascade into child tables.
3. A migration **edited after it was applied** is refused (`was changed after it was applied`), and a database **newer than the code** is refused. Nothing is guessed.
4. Migrations only move forward; there is **no down migration**. Rolling back means restoring a backup.

**Assessment.** The four rebuilding migrations (2, 3, 7) are the only ones that touch existing rows destructively; all three copy before dropping, inside a transaction, with a foreign-key check before commit. They were exercised only on an empty database here: **a migration from an older schema holding real rows was not re-run in this audit** (the owner's production database is already at version 8). For a production database that is already at version 8 nothing is pending (`/api/ready` reports `migrations: current` live). **Residual risk:** `MIGRATE_ON_START=true` is the default, and **no automatic backup is taken before a migration**. The next migration (9+) will run on the first start after a deploy. Take `npm run server:backup -- <file>` (or confirm today's Drive snapshot) before deploying any release that adds a migration. A pre-migration snapshot inside the runner is a sensible PROMPT 20 item; it was not added here because it changes start-up behaviour in production.

## Data integrity and privacy

- Customer e-mail addresses, names and messages live in `inquiries`, `quote_requests`, `email_deliveries` (recipient) and the AI tables (conversation text, kept `AI_RETENTION_DAYS`, default 7). `RETENTION_DAYS` (finished requests) is **unset by default** and the server warns at start-up when it is unset in production.
- Network addresses are stored only as keyed hashes; the probe confirmed list rows carry no address or content hash.
- `npm run server:cli -- erase <email>` removes everything held about an address.

## Production persistence: the single most important unknown

`DATABASE_PATH` defaults to `./data/app.sqlite`. On Render a service's filesystem is **ephemeral unless a persistent disk is mounted**: without a disk, every deploy or restart would start from an empty database (and `SEED_ON_START=true` would quietly re-create an empty catalogue, so nothing would look broken). Live checks cannot tell the difference: `/api/ready` → `{"database":"ok","migrations":"current"}` is true for an empty database too.

**Owner check (5 minutes, read-only):** Render dashboard → the web service → **Disks**. Expected: one disk, mount path equal to the folder of `DATABASE_PATH` (and of `MEDIA_DIR`, which defaults to `media/` beside the database), plenty of free space. Then **Environment**: `DATABASE_PATH` must point inside that mount. Record the answer in `REMEDIATION_LOG.md`. If there is no disk, treat it as a **Critical** finding: stop deploying until a disk is attached and the latest Drive snapshot is restored onto it.

## Backup strategy

See [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md).
