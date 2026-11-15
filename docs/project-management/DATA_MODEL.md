# Data model (migration `0013_project_management.sql`)

One new, numbered, forward-only migration. It is **additive for everything that exists** and creates nothing for anybody: no task, no category, no request exists until the owner makes one. It was applied to a database holding 0012's data in a test (`server/test/projectWorkData.test.ts`): every project, milestone, line of history, e-mail and private note keeps its id.

## New tables

| Table | One row is | Key rules |
| --- | --- | --- |
| `task_categories` | a category the owner manages | `code` unique, a slug (2–40 characters, `a-z0-9-`, no leading / trailing hyphen: a CHECK), `enabled`, `sort_order` |
| `task_category_names` | a category's name in one language | PK `(category_id, language)`; name not empty; cascades |
| `project_tasks` | a task of one project | see below |
| `project_task_dependencies` | "`task_id` cannot start before `depends_on_id` is done" | PK `(task_id, depends_on_id)`, never a task on itself (CHECK), same project (trigger), **no cycle** (trigger with a recursive query); both sides cascade |
| `project_customer_actions` | what the owner asks of the customer, **one per task** (`task_id` UNIQUE) | type, instruction (not empty), status, `revision` = the number of answers so far |
| `project_action_submissions` | one answer, as given | `UNIQUE (action_id, revision)`; response not empty; **immutable** (a trigger refuses any update of the response, its revision, its action or its time; the customer's id may become `NULL` when an account is erased) |
| `project_action_transitions` | every move of an action | who (admin / customer / system), from, to, revision, `customer_note` (shown to the customer), `internal_note` (never shown); **append-only** (trigger) |

### `project_tasks`

`id`, `reference` (`TSK-XXXXXXXX`, random, unique: a name to read out, never a key), `project_id` (cascade), `title` (not blank), `description` (**internal**), `customer_description` (shown when shared), `status` (8 values), `priority` (4), `category_id` (set null), `milestone_id` (set null; same project: a trigger), `start_on` / `due_on` (calendar days, a GLOB CHECK; `start_on <= due_on` CHECK), `completed_at` (**a task is completed exactly when it has a completion time**: a CHECK), `assigned_to` (an administrator, set null), `customer_visible` (**default 0: private**), `sort_order`, `revision` (≥ 1, counted up by every change), `created_by`, `updated_by`, `created_at`, `updated_at`. Indexes on project + order, project + status, due date, assignee, milestone.

## Extended tables

* **`client_milestones`**: `description`, `status` (`upcoming`, `in_progress`, `completed`, `delayed`, `cancelled`), `customer_visible` (default 1: every existing milestone stays as visible as it was). Milestones that were completed got `status = 'completed'`.
* **`client_project_notes`**: `task_id` (a private note may belong to a task; set null if the task goes).
* **`client_project_events`** (rebuilt, ids kept): 16 new event types (24 in all), `task_id`, `action_id`, `subject` (the title the thing had at the time), `visibility` (`customer` | `internal`, default `customer`: every existing line stays what it was). Still append-only (trigger). Indexed by project and by task.
* **`email_deliveries`** (rebuilt, ids kept): 7 new kinds, the related type `client_action_reminder`, and the once-only unique index now lists them.

## Why two tables are rebuilt

SQLite cannot change a CHECK in place, and a new event kind or message kind is a CHECK change. The project did this in 0007, 0009, 0011 and 0012; 0013 does it the same way (create, copy with ids, drop, rename, recreate the indexes and triggers), under `-- migration: foreign-keys-off`. The test above checks the copied rows, the rules that came back (append-only, the CHECKs), `PRAGMA foreign_keys` and `PRAGMA foreign_key_check`.

## What a backup must hold

Nothing new to configure: the tables live in the same SQLite file the backup already copies. The answers a customer wrote are personal data: the erasure command (`server:cli erase <address>`) removes a customer's projects with their tasks, requests, answers, history and the e-mails about them (cascades; the reminders by their own delete), and `project_action_submissions.customer_id` is set null if only the account row goes. Retention by age does **not** delete projects or their work: that remains the owner's decision (see [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)).

## What is derived, never stored

"Requires a customer action" (the task has a request and the customer is the one who has to move it), "overdue" (the day is past and the thing is not finished: decided against one definition of today), "blocked by" (the open tasks a task depends on) and the **progress percentage** (counted at the moment it is asked for). No endpoint accepts any of them.
