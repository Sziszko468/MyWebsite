# Data model: migration 0014

`server/src/db/migrations/0014_client_feedback.sql`. Additive for everything that exists (a new migration, none of the old ones touched), forward-only, run once inside one transaction with foreign keys off (the outbox is rebuilt). Nothing is created for anybody.

SQLite cannot change a `CHECK`, so — exactly like 0007, 0009, 0011, 0012 and 0013 — `email_deliveries` is **rebuilt** to allow the new kinds and the new related type. Every row is copied with its id; the indexes (including the once-only index) are recreated and extended.

## Tables

| Table | One row is | Notes |
| --- | --- | --- |
| `deliverables` | one thing shared for review | `reference` `DLV-XXXXXXXX` (random, unique), `project_id`, optional `task_id`, `title`, `customer_description`, `internal_description` (never selected for a customer), `type`, `publication_state` (`draft`/`published`/`archived`), `review_state`, `current_version` (the newest **published** number), `revision` (counted up by every change), `published_at`, `last_customer_activity_at`. `CHECK`: published or archived only after `published_at` is set. |
| `deliverable_versions` | one version | `number`, `title`, `customer_description`, `preview_url`, `image_url`, `checksum` (SHA-256, 64 hex), `status` (`draft`/`published`/`superseded`), `published_at/by`. `UNIQUE (deliverable_id, number)`; **at most one draft** (partial unique index). |
| `deliverable_comments` | one comment | customer's or owner's; `parent_id` makes a reply/follow-up; `x`,`y` (0–1) only on the start of a thread; `status` `draft`/`submitted`/`resolved`; `body` 1–5000. |
| `deliverable_internal_notes` | one private note | own table; **append-only**. |
| `deliverable_approvals` | one request and its outcome | `state` `requested`/`approved`/`changes_requested`/`cancelled`/`superseded`; the customer's `confirmed_version` and `confirmed_checksum`; `closed_by`; `revision`. |
| `deliverable_events` | one step of the history | **append-only**; `visibility` `customer`/`internal`; 18 event types. |

## What the database refuses by itself (triggers, indexes and CHECKs)

The application checks everything first and says why in words; these are the last line of defence, for whoever writes to the database some other way.

* **A published version is never changed** (`deliverable_versions_immutable`): not its title, words, addresses, number, fingerprint, publication time, nor back to `draft`. The two administrator columns are left out on purpose (erasing an administrator nulls them through their foreign keys).
* **Numbers rise by exactly one** (`deliverable_versions_number`), and `UNIQUE (deliverable_id, number)`.
* **One draft at a time** (`idx_deliverable_versions_one_draft`).
* **Addresses** are `https://…`, at most 2000 characters, printable ASCII only (no spaces, no control characters, no unicode lookalikes).
* **Submitted feedback is never changed** (`deliverable_comments_immutable`): not its body, position, version, parent, author or time; it cannot become a draft again. Only `submitted → resolved` and back may change (`status`, `resolved_at`).
* **A comment belongs to a version of its own deliverable and a reply to a comment of the same version** (`deliverable_comments_relations`).
* **Positions**: both or neither, 0 to 1, only on the start of a thread. An owner's comment is always a reply and always submitted; only a thread can be resolved.
* **Private notes** cannot be updated.
* **Approvals**: one **open** request per deliverable (`idx_deliverable_approvals_one_open`); **one approval per version** (`idx_deliverable_approvals_one_approval`); a request is about a **published** version of **its own** deliverable (`deliverable_approvals_relations`); once it leaves `requested` it is final (`deliverable_approvals_final`); `approved` needs the time, the customer, the confirmed number and fingerprint; `changes_requested` needs an explanation.
* **History** cannot be updated.
* **A deliverable and its task belong to one project** (`deliverables_task_insert`, `deliverables_task_update`).
* **The outbox** allows only the known kinds and related types, and sends each `(related_type, related_id, kind)` **once** (`idx_email_once_per_submission`, extended).

## The review state

`deliverables.review_state` is **derived**, and recomputed by the same function (`recomputeReview` in `service.ts`) in the same transaction as every approval step and every publication, so it cannot drift:

1. the **current** version has a request waiting → `awaiting_customer`;
2. else the newest **decided** approval of the current version → `approved` or `changes_requested`;
3. else, if an **earlier** version was ever asked about or decided → `superseded` (a newer version replaced what was reviewed, and nobody has decided about it yet);
4. else `not_submitted`.

## Concurrency

`deliverables.revision` and `deliverable_approvals.revision` are compared in the `UPDATE … WHERE revision = ?`: an edit from an out-of-date screen, or two decisions at once, find that exactly one row changed (or none) and the loser is told **409 `stale`** and gets the refreshed record. The database has a single synchronous writer, and each rule runs in one transaction, so there is no window between "read" and "write".

## What a backup must hold

The same SQLite file as everything else. The history table is the record of what was approved: do not export a database without it, and do not "clean" it.

## Retention

Deliverables, versions, feedback, approvals and history are kept for the life of the project and the customer's account. Erasing a customer (`eraseByEmail`) removes them with the customer. **No retention period is invented here**; the owner decides it (see the launch checklist).
