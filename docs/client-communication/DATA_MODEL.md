# Data model: migration 0015

`server/src/db/migrations/0015_client_communications.sql`. Additive for everything that exists (a new migration, none of the old ones touched), forward-only, run once inside one transaction with foreign keys off (the outbox is rebuilt). Nothing is created for anybody. **0015 was free on the base branch** (the last there is `0014_client_feedback.sql`); see the launch checklist for how it meets the deployment branch's own `0030`. **Forward-only has a consequence: once a database has applied `0015`, older code refuses to start on it** (`migrate.ts`: a database holding a migration the code does not know). Take a backup before the first run; going back means restoring it (ARCHITECTURE.md, *Rolling it back*).

SQLite cannot change a `CHECK`, so — exactly like 0007, 0009, 0011, 0012, 0013 and 0014 — `email_deliveries` is **rebuilt** to allow the new kinds and the new related type. Every row is copied with its id; the indexes (including the once-only index) are recreated and extended.

## Tables

| Table | One row is | Notes |
| --- | --- | --- |
| `conversations` | a thread or an activity feed | `reference` `MSG-XXXXXXXX` (random, unique), `kind` (`thread` / `activity`), `customer_id`, optional `project_id`, optional `context_type` + `context_id` (`project`, `deliverable`, `task`, `booking`, `quote`; the record's id, checked by the application), `subject` (threads only), `status` (`open` / `waiting_owner` / `waiting_customer` / `resolved` / `archived`), `started_by`, `resolution_requested_at`, `resolved_at`, `archived_at`, `last_message_at` (the last customer-visible human message), `last_activity_at` (anything), `revision`. |
| `conversation_messages` | a message | `seq` (autoincrement: the order and the unit of reading), `id`, `conversation_id`, `sender_type` (`customer` / `admin` / `system`), `sender_id` (plain, no foreign key), `message_type` (`text` / `system_event` / `announcement`), `visibility` (`customer` / `internal`), `body`, `important`, `event_key` + `event_params` + `source_type` + `source_id` + `idempotency_key` (system events), `client_token`, `created_at`, `edited_at`, `deleted_at`. |
| `conversation_reads` | one reader's marker in one conversation | `(conversation_id, reader_type, reader_id)`, `last_read_seq`, `last_read_at`. A customer is read as themselves, an administrator as that one administrator. |
| `customer_message_preferences` | one customer's e-mail choices | `replies`, `announcements`, `important`, `resolution` (all on by default; no row = the defaults). |

## What the database refuses by itself (CHECKs, triggers and indexes)

The application checks everything first and says why in words; these are the last line of defence for whoever writes to the database some other way.

* **A thread has a subject and is started by a person; an activity feed has no subject, no context, is `open` and is started by the system** (`CHECK`s). `resolved` needs `resolved_at`, `archived` needs `archived_at`.
* **One activity feed per customer and project** (`idx_conversations_activity`, a unique expression index on `(customer_id, COALESCE(project_id, ''))`).
* **A conversation and its project belong to one customer** (`conversations_project_owner`). **Whose a conversation is, what it is about, its subject, kind, reference, starter and creation time never change** (`conversations_fixed`).
* **Who may write which kind** (`CHECK`s): a customer's message is a customer-visible text and never important; an announcement is the owner's and customer-visible; a private (`internal`) message is the owner's plain text and never important; `important` is the owner's customer-visible text only; a system event has a key, no words, no sender, is customer-visible, needs an idempotency key and a source; any other message has words and no event fields. **A body is 1 to 5000 characters** (the application allows 4000).
* **An activity feed holds only events of other records, and a thread only its own** (`conversation_messages_relations`).
* **A message is never changed** (`conversation_messages_immutable`): not its sender, type, visibility, importance, time, event fields, token or order. **Two exceptions**: the owner's own *private note's* words may change (and `edited_at` is set) while the note is not removed; and `deleted_at` can be set (once). A removed message's words, time and removal can never change again.
* **The same event is one message** (`idempotency_key` is `UNIQUE`); **the same send is one message** (`idx_conversation_messages_token`, unique on conversation + sender + token when a token is given).
* **A read marker never moves back** (`conversation_reads_forward`).
* **The outbox** allows only the known kinds and related types, and sends each `(related_type, related_id, kind)` **once** (`idx_email_once_per_submission`, extended).

## Cascades and erasure

`customers` → `conversations`, `conversation_reads` (via the conversation), `customer_message_preferences`: `ON DELETE CASCADE`. A **project's** deletion also removes the conversations about it (and its activity feed), like its tasks and deliverables. `conversation_messages` follow their conversation. The e-mails about a customer's messages are deleted with them (`customers/retention.ts`). `sender_id` has no foreign key on purpose: erasing an administrator leaves the words, not a link.

## The order of messages and why reads use `seq`

`seq` is the order of the whole table and therefore of each conversation. A read marker is a `seq`, never a time: a message written a second ago can carry an older time than a marker set a second ago (a feed event mirrored in the same millisecond; a test clock), a sequence number cannot. The timeline of a conversation about a project is one query over two conversations (its own and the project's feed, from the feed's first message *after* the conversation began, by `seq`).

## What a backup must hold

The same SQLite file as everything else. Conversations and their private notes are business records: **do not export a database to somewhere less private than where it is, and do not "clean" the history.** See the launch checklist for the retention decision (none is invented here).

## Retention

Conversations are kept for the life of the customer's account and removed with it (and with a project, for the conversations about that project). No other period exists in the code.
