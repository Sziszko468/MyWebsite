-- migration: foreign-keys-off
-- PROMPT 26 (project management and timeline): the tasks of a client project, what depends on what, the customer actions the owner asks of the customer and the
-- customer's responses and the owner's review of them, the manageable task categories, and the extension of the existing milestones and project history that all of
-- it needs.
--
-- Additive for everything that exists: three columns are ADDED to `client_milestones` (a description, a status and whether the customer sees it; every existing milestone
-- stays visible, which is what it was), one column is ADDED to `client_project_notes` (a note may belong to a task), and `client_project_events` and `email_deliveries` are
-- REBUILT exactly as migrations 0007, 0009, 0011 and 0012 did (SQLite cannot change a CHECK in place): the history gets the kinds of event a task or a customer action
-- makes, a `visibility` (a customer reads only `customer` lines) and the title the thing had at the time; the e-mail log gets the new kinds of message. Every existing row
-- is copied with its id, so a message that points at a project event still points at it.
--
-- Nothing is created for any project: no task, no category, no action exists until the owner makes one.

-- ---- categories the owner manages ----------------------------------------------------------------------------------------------------

CREATE TABLE task_categories (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE CHECK (length(code) BETWEEN 2 AND 40 AND code NOT GLOB '*[^a-z0-9-]*' AND code NOT GLOB '-*' AND code NOT GLOB '*-'),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE task_category_names (
  category_id TEXT NOT NULL REFERENCES task_categories (id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  PRIMARY KEY (category_id, language)
);

-- ---- milestones: what the brief adds to the existing table -------------------------------------------------------------------------

ALTER TABLE client_milestones ADD COLUMN description TEXT;
ALTER TABLE client_milestones ADD COLUMN status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'in_progress', 'completed', 'delayed', 'cancelled'));
ALTER TABLE client_milestones ADD COLUMN customer_visible INTEGER NOT NULL DEFAULT 1 CHECK (customer_visible IN (0, 1));
-- A milestone that was already completed says so in its status too.
UPDATE client_milestones SET status = 'completed' WHERE completed_at IS NOT NULL;

-- ---- tasks ----------------------------------------------------------------------------------------------------------------------------

-- A task belongs to one project. PRIVATE BY DEFAULT: a customer sees it only when `customer_visible` is 1, and then only `customer_description`, never `description`.
-- A task that asks something of the customer has exactly one row in `project_customer_actions`; "requires a customer action" is derived from that row, never stored twice.
CREATE TABLE project_tasks (
  id TEXT PRIMARY KEY,
  -- `TSK-7K3M9XQH`: random, so one reference says nothing about another. A name to read out, never a key to anything.
  reference TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES client_projects (id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  description TEXT NOT NULL DEFAULT '',
  customer_description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'backlog' CHECK (status IN ('backlog', 'planned', 'in_progress', 'in_review', 'waiting_customer', 'blocked', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  category_id TEXT REFERENCES task_categories (id) ON DELETE SET NULL,
  milestone_id TEXT REFERENCES client_milestones (id) ON DELETE SET NULL,
  start_on TEXT CHECK (start_on IS NULL OR start_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  due_on TEXT CHECK (due_on IS NULL OR due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  completed_at TEXT,
  assigned_to TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  customer_visible INTEGER NOT NULL DEFAULT 0 CHECK (customer_visible IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  -- Counted up by every change: an edit made from a screen that is out of date can say so and be refused.
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (start_on IS NULL OR due_on IS NULL OR start_on <= due_on),
  -- A task is completed exactly when it has a completion time.
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX idx_project_tasks_project ON project_tasks (project_id, sort_order, created_at);
CREATE INDEX idx_project_tasks_status ON project_tasks (project_id, status);
CREATE INDEX idx_project_tasks_due ON project_tasks (due_on) WHERE due_on IS NOT NULL;
CREATE INDEX idx_project_tasks_assignee ON project_tasks (assigned_to);
CREATE INDEX idx_project_tasks_milestone ON project_tasks (milestone_id);

-- A task and its milestone belong to the same project.
CREATE TRIGGER project_tasks_milestone_insert BEFORE INSERT ON project_tasks
WHEN NEW.milestone_id IS NOT NULL AND (SELECT project_id FROM client_milestones WHERE id = NEW.milestone_id) IS NOT NEW.project_id
BEGIN SELECT RAISE(ABORT, 'a task and its milestone belong to one project'); END;

CREATE TRIGGER project_tasks_milestone_update BEFORE UPDATE OF milestone_id, project_id ON project_tasks
WHEN NEW.milestone_id IS NOT NULL AND (SELECT project_id FROM client_milestones WHERE id = NEW.milestone_id) IS NOT NEW.project_id
BEGIN SELECT RAISE(ABORT, 'a task and its milestone belong to one project'); END;

-- ---- what a task waits for --------------------------------------------------------------------------------------------------------------

-- `task_id` cannot start before `depends_on_id` is done. One row per pair (the primary key), never a task on itself, never across projects, never a cycle (the
-- application checks first and answers with the path; the trigger below is the last line of defence for any other writer). Deleting a task deletes its rows.
CREATE TABLE project_task_dependencies (
  task_id TEXT NOT NULL REFERENCES project_tasks (id) ON DELETE CASCADE,
  depends_on_id TEXT NOT NULL REFERENCES project_tasks (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, depends_on_id),
  CHECK (task_id <> depends_on_id)
) WITHOUT ROWID;
CREATE INDEX idx_project_task_dependencies_target ON project_task_dependencies (depends_on_id);

CREATE TRIGGER project_task_dependencies_one_project BEFORE INSERT ON project_task_dependencies
WHEN (SELECT project_id FROM project_tasks WHERE id = NEW.task_id) IS NOT (SELECT project_id FROM project_tasks WHERE id = NEW.depends_on_id)
BEGIN SELECT RAISE(ABORT, 'a task depends only on tasks of its own project'); END;

CREATE TRIGGER project_task_dependencies_no_cycle BEFORE INSERT ON project_task_dependencies
WHEN EXISTS (
  WITH RECURSIVE upstream (id) AS (
    SELECT NEW.depends_on_id
    UNION
    SELECT d.depends_on_id FROM project_task_dependencies d JOIN upstream u ON d.task_id = u.id
  )
  SELECT 1 FROM upstream WHERE id = NEW.task_id
)
BEGIN SELECT RAISE(ABORT, 'a task cannot depend, directly or through others, on itself'); END;

-- ---- what the owner asks of the customer ------------------------------------------------------------------------------------------------

-- One action per task. The customer answers in words (the site has no private file storage, so there is no upload); the owner reviews. `revision` is the number of
-- responses the customer has given; the responses themselves are immutable rows (below).
CREATE TABLE project_customer_actions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL UNIQUE REFERENCES project_tasks (id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES client_projects (id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('provide_content', 'answer_question', 'confirm_direction', 'review_deliverable', 'approve_stage', 'other')),
  -- What the customer is asked, in the words the owner wrote.
  instruction TEXT NOT NULL CHECK (length(trim(instruction)) > 0),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'submitted', 'under_review', 'changes_requested', 'accepted', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  submitted_at TEXT,
  reviewed_at TEXT,
  reviewed_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_project_customer_actions_project ON project_customer_actions (project_id, status);

-- A response, as given. It is never changed or replaced: a new response after a request for changes is a NEW row with the next revision. The customer who gave it is
-- remembered (an account that is erased leaves the response with no name).
CREATE TABLE project_action_submissions (
  id TEXT PRIMARY KEY,
  action_id TEXT NOT NULL REFERENCES project_customer_actions (id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  response TEXT NOT NULL CHECK (length(trim(response)) > 0),
  customer_id TEXT REFERENCES customers (id) ON DELETE SET NULL,
  submitted_at TEXT NOT NULL,
  UNIQUE (action_id, revision)
);
-- Only the columns that ARE the response are protected: erasing a customer sets `customer_id` to NULL through the foreign key, which must stay possible.
CREATE TRIGGER project_action_submissions_immutable BEFORE UPDATE OF action_id, revision, response, submitted_at ON project_action_submissions BEGIN SELECT RAISE(ABORT, 'a response is never changed; a new one is a new revision'); END;

-- Every move of an action from one status to another, with who made it and the words that went with it. `customer_note` is shown to the customer (a request for
-- changes must carry one); `internal_note` is the owner's own and is never shown. Append-only.
CREATE TABLE project_action_transitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id TEXT NOT NULL REFERENCES project_customer_actions (id) ON DELETE CASCADE,
  from_status TEXT CHECK (from_status IS NULL OR from_status IN ('not_started', 'submitted', 'under_review', 'changes_requested', 'accepted', 'cancelled')),
  to_status TEXT NOT NULL CHECK (to_status IN ('not_started', 'submitted', 'under_review', 'changes_requested', 'accepted', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 0,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'customer', 'system')),
  actor_id TEXT,
  customer_note TEXT,
  internal_note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_project_action_transitions_action ON project_action_transitions (action_id, id);
CREATE TRIGGER project_action_transitions_no_update BEFORE UPDATE ON project_action_transitions BEGIN SELECT RAISE(ABORT, 'the history of an action is append-only'); END;

-- ---- notes ----------------------------------------------------------------------------------------------------------------------------

-- A private note may now belong to one task. The task going away leaves the note with the project.
ALTER TABLE client_project_notes ADD COLUMN task_id TEXT REFERENCES project_tasks (id) ON DELETE SET NULL;

-- ---- the project's history ---------------------------------------------------------------------------------------------------------------

CREATE TABLE client_project_events_rebuilt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES client_projects (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created', 'status_changed', 'dates_changed', 'milestone_added', 'milestone_completed', 'document_published', 'feedback_requested', 'update_posted',
    'task_created', 'task_edited', 'task_status_changed', 'task_completed', 'task_cancelled', 'task_assigned', 'dependency_added', 'dependency_removed',
    'milestone_status_changed', 'action_assigned', 'action_submitted', 'action_under_review', 'action_changes_requested', 'action_accepted', 'action_cancelled', 'note_added'
  )),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'customer', 'system')),
  actor_id TEXT,
  from_status TEXT,
  to_status TEXT,
  milestone_id TEXT,
  document_id TEXT,
  -- What the event is about, by id (history, not a link: the thing may be gone) and by the title it had at the time.
  task_id TEXT,
  action_id TEXT,
  subject TEXT,
  -- `customer`: the customer's timeline shows it. `internal`: only the administration does (an edit, an assignment, a dependency, a private note, anything about a task
  -- the customer cannot see). Decided by the code that writes the line, in the same transaction as the change.
  visibility TEXT NOT NULL DEFAULT 'customer' CHECK (visibility IN ('customer', 'internal')),
  -- The words the owner wrote FOR the customer with this event. Never a private note.
  note TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO client_project_events_rebuilt (id, project_id, event_type, actor_type, actor_id, from_status, to_status, milestone_id, document_id, task_id, action_id, subject, visibility, note, created_at)
SELECT id, project_id, event_type, actor_type, actor_id, from_status, to_status, milestone_id, document_id, NULL, NULL, NULL, 'customer', note, created_at FROM client_project_events;

DROP TABLE client_project_events;
ALTER TABLE client_project_events_rebuilt RENAME TO client_project_events;

CREATE INDEX idx_client_project_events_project ON client_project_events (project_id, id);
CREATE INDEX idx_client_project_events_task ON client_project_events (task_id) WHERE task_id IS NOT NULL;
CREATE TRIGGER client_project_events_no_update BEFORE UPDATE ON client_project_events BEGIN SELECT RAISE(ABORT, 'the project history is append-only'); END;

-- ---- the e-mails ---------------------------------------------------------------------------------------------------------------------

CREATE TABLE email_deliveries_rebuilt (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN (
    'inquiry_received', 'quote_received', 'inquiry_status', 'quote_status', 'inquiry_confirmation', 'quote_confirmation', 'test',
    'quote_sent', 'quote_revised', 'quote_accepted', 'quote_accepted_admin', 'quote_declined', 'quote_declined_admin', 'revision_requested_admin',
    'revision_received', 'delivery_failed_admin',
    'booking_received', 'booking_confirmed', 'booking_new_admin', 'booking_change_received', 'booking_change_requested_admin',
    'booking_rescheduled', 'booking_proposal', 'booking_change_declined', 'booking_cancelled', 'booking_cancelled_admin',
    'client_sign_in', 'client_activate', 'client_register', 'client_email_change', 'client_security_notice',
    'client_project_created', 'client_project_status', 'client_document_published', 'client_deletion_requested_admin',
    'client_action_assigned', 'client_action_due_soon', 'client_action_overdue', 'client_action_submitted_admin', 'client_action_reviewed', 'client_action_changes_requested', 'client_milestone_completed'
  )),
  related_type TEXT NOT NULL CHECK (related_type IN ('inquiry', 'quote_request', 'system', 'quote', 'quote_revision', 'email_delivery', 'booking_event', 'client_auth', 'client_audit', 'client_project_event', 'client_document', 'client_action_reminder')),
  related_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'accepted', 'delivered', 'bounced', 'complained', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  send_generation INTEGER NOT NULL DEFAULT 0 CHECK (send_generation >= 0),
  next_attempt_at TEXT,
  last_error TEXT,
  error_code TEXT,
  provider_message_id TEXT,
  provider TEXT,
  provider_event TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  accepted_at TEXT,
  delivered_at TEXT
);

INSERT INTO email_deliveries_rebuilt (id, kind, related_type, related_id, recipient, language, note, status, attempts, send_generation, next_attempt_at, last_error, error_code, provider_message_id, provider, provider_event, created_at, updated_at, accepted_at, delivered_at)
SELECT id, kind, related_type, related_id, recipient, language, note, status, attempts, send_generation, next_attempt_at, last_error, error_code, provider_message_id, provider, provider_event, created_at, updated_at, accepted_at, delivered_at FROM email_deliveries;

DROP TABLE email_deliveries;
ALTER TABLE email_deliveries_rebuilt RENAME TO email_deliveries;

CREATE INDEX idx_email_deliveries_due ON email_deliveries (status, next_attempt_at);
CREATE INDEX idx_email_deliveries_related ON email_deliveries (related_type, related_id);
CREATE INDEX idx_email_deliveries_created ON email_deliveries (created_at);
CREATE INDEX idx_email_deliveries_provider ON email_deliveries (provider_message_id);
CREATE INDEX idx_email_deliveries_recipient ON email_deliveries (recipient COLLATE NOCASE, created_at);

-- Exactly one of each of these per thing it is about (migration 0012's list, plus the project work's): an event's message is about ONE line of the history, a reminder
-- about ONE action on ONE due date, so a retried request, a double click or a reminder pass that runs twice can never make a second message.
CREATE UNIQUE INDEX idx_email_once_per_submission ON email_deliveries (related_type, related_id, kind)
  WHERE kind IN ('inquiry_received', 'quote_received', 'inquiry_confirmation', 'quote_confirmation', 'quote_accepted', 'quote_accepted_admin', 'quote_declined', 'quote_declined_admin', 'revision_requested_admin', 'revision_received', 'delivery_failed_admin',
                 'booking_received', 'booking_confirmed', 'booking_new_admin', 'booking_change_received', 'booking_change_requested_admin', 'booking_rescheduled', 'booking_proposal', 'booking_change_declined', 'booking_cancelled', 'booking_cancelled_admin',
                 'client_sign_in', 'client_activate', 'client_register', 'client_email_change', 'client_security_notice',
                 'client_project_created', 'client_project_status', 'client_document_published', 'client_deletion_requested_admin',
                 'client_action_assigned', 'client_action_due_soon', 'client_action_overdue', 'client_action_submitted_admin', 'client_action_reviewed', 'client_action_changes_requested', 'client_milestone_completed');
