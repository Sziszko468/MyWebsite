-- migration: foreign-keys-off
-- PROMPT 27 (feedback, approval and preview): the deliverables a project shares with its customer, their immutable versions, the customer's feedback on a version (with
-- optional positions on an image), the owner's replies and private notes, the formal approval of one exact version, and the append-only history of all of it. The e-mail
-- outbox is REBUILT (as migrations 0007, 0009, 0011, 0012 and 0013 did: SQLite cannot change a CHECK in place) so it can carry the new messages; every existing row is
-- copied with its id.
--
-- Additive for everything that exists, and nothing is created for anybody: no deliverable exists until the owner makes one, and nothing is visible to a customer until the
-- owner has published a version of it. No file is stored anywhere: a version points at an https address (the owner's choice, validated by the application), never at a file.

-- ---- the deliverable -----------------------------------------------------------------------------------------------------------------

-- One thing shared with the customer for review. `title` and `customer_description` are its standing name and words; every VERSION carries its own copy of what the customer
-- reads. `internal_description` is the owner's alone and is never selected for a customer. `review_state` is kept in step with the approvals by the application, in the same
-- transaction as each of them (see DATA_MODEL.md for the rule), and `current_version` is the number of the newest PUBLISHED version (1 while the first is still a draft).
CREATE TABLE deliverables (
  id TEXT PRIMARY KEY,
  -- `DLV-7K3M9XQH`: random, so one reference says nothing about another. A name to read out, never a key to anything.
  reference TEXT NOT NULL UNIQUE,
  project_id TEXT NOT NULL REFERENCES client_projects (id) ON DELETE CASCADE,
  task_id TEXT REFERENCES project_tasks (id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  customer_description TEXT NOT NULL DEFAULT '',
  internal_description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL CHECK (type IN ('website_preview', 'design', 'image', 'document', 'prototype', 'other')),
  publication_state TEXT NOT NULL DEFAULT 'draft' CHECK (publication_state IN ('draft', 'published', 'archived')),
  review_state TEXT NOT NULL DEFAULT 'not_submitted' CHECK (review_state IN ('not_submitted', 'awaiting_customer', 'changes_requested', 'approved', 'superseded')),
  current_version INTEGER NOT NULL DEFAULT 1 CHECK (current_version >= 1),
  -- Counted up by every change: an edit made from an out-of-date screen can say so and be refused.
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  -- When the first version was published: a customer can see a deliverable exactly when this is set (an archived one stays readable, read-only).
  published_at TEXT,
  last_customer_activity_at TEXT,
  created_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  updated_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- A deliverable is published or archived only after a version was published.
  CHECK (publication_state = 'draft' OR published_at IS NOT NULL)
);
CREATE INDEX idx_deliverables_project ON deliverables (project_id, created_at);
CREATE INDEX idx_deliverables_task ON deliverables (task_id) WHERE task_id IS NOT NULL;

-- A deliverable and its task belong to the same project.
CREATE TRIGGER deliverables_task_insert BEFORE INSERT ON deliverables
WHEN NEW.task_id IS NOT NULL AND (SELECT project_id FROM project_tasks WHERE id = NEW.task_id) IS NOT NEW.project_id
BEGIN SELECT RAISE(ABORT, 'a deliverable and its task belong to one project'); END;

CREATE TRIGGER deliverables_task_update BEFORE UPDATE OF task_id, project_id ON deliverables
WHEN NEW.task_id IS NOT NULL AND (SELECT project_id FROM project_tasks WHERE id = NEW.task_id) IS NOT NEW.project_id
BEGIN SELECT RAISE(ABORT, 'a deliverable and its task belong to one project'); END;

-- ---- its versions --------------------------------------------------------------------------------------------------------------------

-- What the customer reviews. A version is a DRAFT until the owner publishes it, and from then on it is NEVER changed: not its words, not its addresses, not its number, not
-- its fingerprint (`checksum`, the SHA-256 of exactly what was published). A later change is a new version. `superseded` is the one thing that still happens to a published
-- version: a newer one was published.
CREATE TABLE deliverable_versions (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
  number INTEGER NOT NULL CHECK (number >= 1),
  title TEXT NOT NULL CHECK (length(trim(title)) > 0),
  customer_description TEXT NOT NULL DEFAULT '',
  -- An https address the customer may open (and, when its origin is on the owner's allowlist, see embedded). Never a file path, never another scheme.
  preview_url TEXT CHECK (preview_url IS NULL OR (preview_url LIKE 'https://%' AND length(preview_url) <= 2000 AND preview_url NOT GLOB '*[^!-~]*')),
  -- An https address of a picture the customer can place comments on (its origin must be on the owner's allowlist: the application checks it).
  image_url TEXT CHECK (image_url IS NULL OR (image_url LIKE 'https://%' AND length(image_url) <= 2000 AND image_url NOT GLOB '*[^!-~]*')),
  checksum TEXT CHECK (checksum IS NULL OR (length(checksum) = 64 AND checksum NOT GLOB '*[^0-9a-f]*')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'superseded')),
  published_at TEXT,
  published_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (deliverable_id, number),
  -- A draft has no publication; everything else has a time and a fingerprint.
  CHECK ((status = 'draft' AND published_at IS NULL AND checksum IS NULL) OR (status <> 'draft' AND published_at IS NOT NULL AND checksum IS NOT NULL))
);
CREATE INDEX idx_deliverable_versions_deliverable ON deliverable_versions (deliverable_id, number);
-- At most one draft at a time: the next version is made only when nothing is being prepared.
CREATE UNIQUE INDEX idx_deliverable_versions_one_draft ON deliverable_versions (deliverable_id) WHERE status = 'draft';

-- Numbers increase by exactly one, whoever writes (the application also takes MAX + 1 inside one transaction; this is the last line of defence).
CREATE TRIGGER deliverable_versions_number BEFORE INSERT ON deliverable_versions
WHEN NEW.number <> COALESCE((SELECT MAX(number) FROM deliverable_versions WHERE deliverable_id = NEW.deliverable_id), 0) + 1
BEGIN SELECT RAISE(ABORT, 'version numbers increase by one'); END;

-- A published version is never changed. (The two administrator columns are left out on purpose: erasing an administrator sets them to NULL through their foreign keys.)
CREATE TRIGGER deliverable_versions_immutable BEFORE UPDATE ON deliverable_versions
WHEN OLD.status <> 'draft' AND (
  NEW.title IS NOT OLD.title OR NEW.customer_description IS NOT OLD.customer_description OR NEW.preview_url IS NOT OLD.preview_url OR NEW.image_url IS NOT OLD.image_url
  OR NEW.checksum IS NOT OLD.checksum OR NEW.number <> OLD.number OR NEW.deliverable_id <> OLD.deliverable_id OR NEW.published_at IS NOT OLD.published_at
  OR NEW.created_at <> OLD.created_at OR NEW.status = 'draft'
)
BEGIN SELECT RAISE(ABORT, 'a published version is never changed; a change is a new version'); END;

-- ---- feedback ------------------------------------------------------------------------------------------------------------------------

-- One comment on one version: the customer's (a DRAFT until they send it, then submitted), the owner's reply, a follow-up. A comment with no `parent_id` starts a thread and is
-- the only kind that may carry a position on the picture (`x`, `y`: normalized, 0 to 1, from the top left). SUBMITTED FEEDBACK IS NEVER CHANGED: what is said stays; more is said
-- as a follow-up. A thread is `resolved` by the owner and can be reopened. `author_id` is a plain value (no foreign key): an erased account leaves the words, not a link.
CREATE TABLE deliverable_comments (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES deliverable_versions (id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES deliverable_comments (id) ON DELETE CASCADE,
  author_type TEXT NOT NULL CHECK (author_type IN ('customer', 'admin')),
  author_id TEXT,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0 AND length(body) <= 5000),
  x REAL CHECK (x IS NULL OR (x >= 0 AND x <= 1)),
  y REAL CHECK (y IS NULL OR (y >= 0 AND y <= 1)),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'resolved')),
  submitted_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((x IS NULL) = (y IS NULL)),
  -- Only the start of a thread has a position.
  CHECK (parent_id IS NULL OR x IS NULL),
  -- The owner's words are never a draft and never start a thread; a draft has not been sent; a sent comment has a time.
  CHECK (author_type <> 'admin' OR (parent_id IS NOT NULL AND status = 'submitted')),
  CHECK ((status = 'draft') = (submitted_at IS NULL)),
  -- Only a thread can be resolved.
  CHECK (status <> 'resolved' OR (parent_id IS NULL AND resolved_at IS NOT NULL))
);
CREATE INDEX idx_deliverable_comments_version ON deliverable_comments (version_id, created_at);
CREATE INDEX idx_deliverable_comments_parent ON deliverable_comments (parent_id) WHERE parent_id IS NOT NULL;

-- A comment belongs to a version of ITS deliverable, and a reply to a comment of the same version.
CREATE TRIGGER deliverable_comments_relations BEFORE INSERT ON deliverable_comments
WHEN (SELECT deliverable_id FROM deliverable_versions WHERE id = NEW.version_id) IS NOT NEW.deliverable_id
  OR (NEW.parent_id IS NOT NULL AND (SELECT version_id FROM deliverable_comments WHERE id = NEW.parent_id) IS NOT NEW.version_id)
BEGIN SELECT RAISE(ABORT, 'a comment belongs to one version of its deliverable'); END;

CREATE TRIGGER deliverable_comments_immutable BEFORE UPDATE ON deliverable_comments
WHEN OLD.status <> 'draft' AND (
  NEW.body <> OLD.body OR NEW.x IS NOT OLD.x OR NEW.y IS NOT OLD.y OR NEW.version_id <> OLD.version_id OR NEW.deliverable_id <> OLD.deliverable_id
  OR NEW.parent_id IS NOT OLD.parent_id OR NEW.author_type <> OLD.author_type OR NEW.created_at <> OLD.created_at OR NEW.status = 'draft'
)
BEGIN SELECT RAISE(ABORT, 'submitted feedback is never changed; say more as a follow-up'); END;

-- ---- the owner's private notes ---------------------------------------------------------------------------------------------------------

-- Stored in their own table, selected by nothing a customer calls. Append-only.
CREATE TABLE deliverable_internal_notes (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
  version_id TEXT REFERENCES deliverable_versions (id) ON DELETE CASCADE,
  comment_id TEXT REFERENCES deliverable_comments (id) ON DELETE CASCADE,
  author_id TEXT,
  body TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_deliverable_internal_notes_deliverable ON deliverable_internal_notes (deliverable_id, created_at);
CREATE TRIGGER deliverable_internal_notes_no_update BEFORE UPDATE ON deliverable_internal_notes BEGIN SELECT RAISE(ABORT, 'a note is never changed'); END;

-- ---- approval -------------------------------------------------------------------------------------------------------------------------

-- The owner asks the customer to decide about ONE EXACT version. The request is `requested` until it is decided (`approved`, `changes_requested`), withdrawn or cancelled
-- (`cancelled`), or the version is replaced (`superseded`). Once it leaves `requested` it is never changed again. The customer's confirmation is kept: the number and the
-- fingerprint of the version they confirmed.
CREATE TABLE deliverable_approvals (
  id TEXT PRIMARY KEY,
  deliverable_id TEXT NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
  version_id TEXT NOT NULL REFERENCES deliverable_versions (id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'requested' CHECK (state IN ('requested', 'approved', 'changes_requested', 'cancelled', 'superseded')),
  requested_by TEXT,
  requested_at TEXT NOT NULL,
  -- The owner's words for the customer with the request.
  request_note TEXT,
  decided_at TEXT,
  decided_by_customer TEXT,
  -- The customer's explanation (required when they ask for changes).
  decision_note TEXT,
  confirmed_version INTEGER,
  confirmed_checksum TEXT,
  -- Who ended a request that was never decided: `admin` (cancelled) or `customer` (withdrawn).
  closed_by TEXT CHECK (closed_by IS NULL OR closed_by IN ('admin', 'customer', 'system')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (state <> 'approved' OR (decided_at IS NOT NULL AND decided_by_customer IS NOT NULL AND confirmed_version IS NOT NULL AND confirmed_checksum IS NOT NULL)),
  CHECK (state <> 'changes_requested' OR (decided_at IS NOT NULL AND decision_note IS NOT NULL AND length(trim(decision_note)) > 0))
);
CREATE INDEX idx_deliverable_approvals_deliverable ON deliverable_approvals (deliverable_id, created_at);
-- One request awaiting an answer per deliverable, and a version approved at most once: two requests at once cannot both be made, two approvals cannot both be recorded.
CREATE UNIQUE INDEX idx_deliverable_approvals_one_open ON deliverable_approvals (deliverable_id) WHERE state = 'requested';
CREATE UNIQUE INDEX idx_deliverable_approvals_one_approval ON deliverable_approvals (version_id) WHERE state = 'approved';

-- A request is about a version of ITS deliverable, and only a PUBLISHED one (nothing unpublished can be approved).
CREATE TRIGGER deliverable_approvals_relations BEFORE INSERT ON deliverable_approvals
WHEN (SELECT deliverable_id FROM deliverable_versions WHERE id = NEW.version_id) IS NOT NEW.deliverable_id
  OR (SELECT status FROM deliverable_versions WHERE id = NEW.version_id) IS NOT 'published'
BEGIN SELECT RAISE(ABORT, 'an approval is about a published version of its own deliverable'); END;

-- A decided or closed request is final (the one exception: an approved request keeps its state when its version is replaced; nothing changes).
CREATE TRIGGER deliverable_approvals_final BEFORE UPDATE ON deliverable_approvals
WHEN OLD.state <> 'requested'
BEGIN SELECT RAISE(ABORT, 'a decided approval is never changed'); END;

-- ---- the history ---------------------------------------------------------------------------------------------------------------------

-- Every step, append-only. `note` holds only words written FOR the customer or by the customer (never a private note); `visibility` says whether the customer's pages show it.
CREATE TABLE deliverable_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deliverable_id TEXT NOT NULL REFERENCES deliverables (id) ON DELETE CASCADE,
  version_id TEXT,
  version_number INTEGER,
  comment_id TEXT,
  approval_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'deliverable_created', 'deliverable_edited', 'version_created', 'version_edited', 'version_published', 'deliverable_archived',
    'feedback_submitted', 'follow_up_posted', 'reply_posted', 'comment_resolved', 'comment_reopened', 'note_added',
    'approval_requested', 'approval_approved', 'approval_changes_requested', 'approval_cancelled', 'approval_withdrawn', 'approval_superseded'
  )),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'customer', 'system')),
  actor_id TEXT,
  from_state TEXT,
  to_state TEXT,
  subject TEXT,
  note TEXT,
  visibility TEXT NOT NULL DEFAULT 'customer' CHECK (visibility IN ('customer', 'internal')),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_deliverable_events_deliverable ON deliverable_events (deliverable_id, id);
CREATE INDEX idx_deliverable_events_approval ON deliverable_events (approval_id) WHERE approval_id IS NOT NULL;
CREATE TRIGGER deliverable_events_no_update BEFORE UPDATE ON deliverable_events BEGIN SELECT RAISE(ABORT, 'the history is append-only'); END;

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
    'client_action_assigned', 'client_action_due_soon', 'client_action_overdue', 'client_action_submitted_admin', 'client_action_reviewed', 'client_action_changes_requested', 'client_milestone_completed',
    'client_deliverable_ready', 'client_deliverable_new_version', 'client_deliverable_approval_requested', 'client_deliverable_reply',
    'deliverable_feedback_admin', 'deliverable_changes_requested_admin', 'deliverable_approved_admin'
  )),
  related_type TEXT NOT NULL CHECK (related_type IN ('inquiry', 'quote_request', 'system', 'quote', 'quote_revision', 'email_delivery', 'booking_event', 'client_auth', 'client_audit', 'client_project_event', 'client_document', 'client_action_reminder', 'deliverable_event')),
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

-- Exactly one of each of these per thing it is about (migration 0013's list, plus the deliverables'): a message is about ONE line of the history, so a retried request, a double
-- click or a handler that runs twice can never make a second message.
CREATE UNIQUE INDEX idx_email_once_per_submission ON email_deliveries (related_type, related_id, kind)
  WHERE kind IN ('inquiry_received', 'quote_received', 'inquiry_confirmation', 'quote_confirmation', 'quote_accepted', 'quote_accepted_admin', 'quote_declined', 'quote_declined_admin', 'revision_requested_admin', 'revision_received', 'delivery_failed_admin',
                 'booking_received', 'booking_confirmed', 'booking_new_admin', 'booking_change_received', 'booking_change_requested_admin', 'booking_rescheduled', 'booking_proposal', 'booking_change_declined', 'booking_cancelled', 'booking_cancelled_admin',
                 'client_sign_in', 'client_activate', 'client_register', 'client_email_change', 'client_security_notice',
                 'client_project_created', 'client_project_status', 'client_document_published', 'client_deletion_requested_admin',
                 'client_action_assigned', 'client_action_due_soon', 'client_action_overdue', 'client_action_submitted_admin', 'client_action_reviewed', 'client_action_changes_requested', 'client_milestone_completed',
                 'client_deliverable_ready', 'client_deliverable_new_version', 'client_deliverable_approval_requested', 'client_deliverable_reply',
                 'deliverable_feedback_admin', 'deliverable_changes_requested_admin', 'deliverable_approved_admin');
