-- migration: foreign-keys-off
-- PROMPT 28 (client communication): conversations between one customer and the owner, their messages (the customer's, the owner's, the owner's PRIVATE notes, the owner's
-- announcements, and the system events mirrored from what other modules recorded), who has read what, and what each customer wants e-mailed. The e-mail outbox is REBUILT
-- (as migrations 0007, 0009, 0011, 0012, 0013 and 0014 did: SQLite cannot change a CHECK in place) so it can carry the new messages; every existing row is copied with its id.
--
-- Additive for everything that exists, and nothing is created for anybody: no conversation exists until the owner (or, when the owner allows it, the customer) starts one,
-- and an "activity" feed is made only when the first real event of a customer's project (or booking, or quote) is mirrored into it. No file is stored anywhere: there is no
-- message attachment, because the site has no private place to keep one.

-- ---- the conversation ----------------------------------------------------------------------------------------------------------------

-- `thread`: a conversation people write in. `activity`: the read-only feed of system events of ONE customer's ONE project (or, with no project, of their bookings and quotes);
-- it is made by the system, has no subject (the screens name it in the reader's language) and no status other than `open`, and is not counted as a conversation anywhere.
-- `status` of a thread is kept by the application (see CONVERSATION_WORKFLOW.md): customer and owner write, the status follows who is expected to answer; only the owner
-- resolves or archives. `reference` is random (`MSG-7K3M9XQH`): a name to read out, never a key.
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'thread' CHECK (kind IN ('thread', 'activity')),
  customer_id TEXT NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  project_id TEXT REFERENCES client_projects (id) ON DELETE CASCADE,
  -- What a thread is about, when it is about one thing: the id of a record of that customer's (the application checks the ownership; the kinds are not one table).
  context_type TEXT CHECK (context_type IS NULL OR context_type IN ('project', 'deliverable', 'task', 'booking', 'quote')),
  context_id TEXT,
  subject TEXT CHECK (subject IS NULL OR (length(trim(subject)) > 0 AND length(subject) <= 200)),
  status TEXT NOT NULL DEFAULT 'waiting_owner' CHECK (status IN ('open', 'waiting_owner', 'waiting_customer', 'resolved', 'archived')),
  started_by TEXT NOT NULL CHECK (started_by IN ('customer', 'admin', 'system')),
  -- The customer asked for the thread to be resolved (a request, not a status).
  resolution_requested_at TEXT,
  resolved_at TEXT,
  archived_at TEXT,
  -- The last CUSTOMER-VISIBLE human message (what the inbox shows), and the last thing of any kind (a private note, an event) that happened in it.
  last_message_at TEXT,
  last_activity_at TEXT NOT NULL,
  -- Counted up by every status change: a change made from an out-of-date screen can say so and be refused.
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((context_type IS NULL) = (context_id IS NULL)),
  CHECK (kind = 'thread' OR (subject IS NULL AND context_type IS NULL AND status = 'open' AND started_by = 'system')),
  CHECK (kind = 'activity' OR (subject IS NOT NULL AND started_by <> 'system')),
  CHECK (status <> 'resolved' OR resolved_at IS NOT NULL),
  CHECK (status <> 'archived' OR archived_at IS NOT NULL)
);
CREATE UNIQUE INDEX idx_conversations_activity ON conversations (customer_id, COALESCE(project_id, '')) WHERE kind = 'activity';
CREATE INDEX idx_conversations_customer ON conversations (customer_id, last_activity_at);
CREATE INDEX idx_conversations_project ON conversations (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX idx_conversations_status ON conversations (kind, status, last_activity_at);
CREATE INDEX idx_conversations_context ON conversations (context_type, context_id) WHERE context_type IS NOT NULL;

-- A conversation and its project belong to one customer, whoever writes.
CREATE TRIGGER conversations_project_owner BEFORE INSERT ON conversations
WHEN NEW.project_id IS NOT NULL AND (SELECT customer_id FROM client_projects WHERE id = NEW.project_id) IS NOT NEW.customer_id
BEGIN SELECT RAISE(ABORT, 'a conversation and its project belong to one customer'); END;

-- Whose it is and what it is about never change (the status, the revision, the times and the request for resolution do).
CREATE TRIGGER conversations_fixed BEFORE UPDATE ON conversations
WHEN NEW.customer_id <> OLD.customer_id OR NEW.project_id IS NOT OLD.project_id OR NEW.kind <> OLD.kind OR NEW.reference <> OLD.reference OR NEW.created_at <> OLD.created_at
  OR NEW.started_by <> OLD.started_by OR NEW.context_type IS NOT OLD.context_type OR NEW.context_id IS NOT OLD.context_id OR NEW.subject IS NOT OLD.subject
BEGIN SELECT RAISE(ABORT, 'whose a conversation is, and what it is about, never changes'); END;

-- ---- its messages ----------------------------------------------------------------------------------------------------------------------

-- `seq` is the order of the whole conversation and the unit of reading: a read marker is a `seq`, never a time (a message written a second ago can carry an older time than a
-- marker set a second ago, a sequence number cannot). `visibility = 'internal'` is the owner's private note: it is written by an administrator, is a plain text, and is not
-- selected by anything a customer calls. A system event has no words of its own: `event_key` names it and `event_params` holds the few customer-visible facts (a title, a number)
-- the screens put into the reader's language; `idempotency_key` makes the same fact one message however often it is mirrored. A text or an announcement has `body`.
CREATE TABLE conversation_messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'admin', 'system')),
  -- A customer's or an administrator's id as a plain value (no foreign key): an erased administrator leaves the words, not a link.
  sender_id TEXT,
  message_type TEXT NOT NULL CHECK (message_type IN ('text', 'system_event', 'announcement')),
  visibility TEXT NOT NULL DEFAULT 'customer' CHECK (visibility IN ('customer', 'internal')),
  body TEXT CHECK (body IS NULL OR (length(trim(body)) > 0 AND length(body) <= 5000)),
  -- The owner marked a message to the customer as important (it is e-mailed even when nothing unread came before it).
  important INTEGER NOT NULL DEFAULT 0 CHECK (important IN (0, 1)),
  event_key TEXT CHECK (event_key IS NULL OR (length(event_key) BETWEEN 3 AND 60 AND event_key NOT GLOB '*[^a-z._]*')),
  event_params TEXT CHECK (event_params IS NULL OR (length(event_params) <= 1000 AND json_valid(event_params))),
  source_type TEXT CHECK (source_type IS NULL OR source_type IN ('project_event', 'deliverable_event', 'booking_event', 'quote_event', 'conversation')),
  source_id TEXT,
  idempotency_key TEXT UNIQUE,
  -- A token the sender's screen made for THIS message: sending it twice (a double click, a retry, a second tab) stores it once.
  client_token TEXT CHECK (client_token IS NULL OR (length(client_token) BETWEEN 8 AND 64 AND client_token NOT GLOB '*[^A-Za-z0-9_-]*')),
  created_at TEXT NOT NULL,
  edited_at TEXT,
  deleted_at TEXT,
  CHECK (message_type <> 'system_event' OR (sender_type = 'system' AND event_key IS NOT NULL AND body IS NULL AND visibility = 'customer' AND idempotency_key IS NOT NULL AND important = 0 AND source_type IS NOT NULL)),
  CHECK (message_type = 'system_event' OR (body IS NOT NULL AND event_key IS NULL AND event_params IS NULL AND source_type IS NULL AND sender_type <> 'system')),
  CHECK (message_type <> 'announcement' OR (sender_type = 'admin' AND visibility = 'customer')),
  CHECK (visibility = 'customer' OR (sender_type = 'admin' AND message_type = 'text' AND important = 0)),
  CHECK (sender_type <> 'customer' OR (message_type = 'text' AND visibility = 'customer' AND important = 0)),
  CHECK (important = 0 OR (sender_type = 'admin' AND visibility = 'customer'))
);
CREATE INDEX idx_conversation_messages_conversation ON conversation_messages (conversation_id, seq);
CREATE INDEX idx_conversation_messages_visible ON conversation_messages (conversation_id, visibility, seq);
CREATE UNIQUE INDEX idx_conversation_messages_token ON conversation_messages (conversation_id, sender_type, sender_id, client_token) WHERE client_token IS NOT NULL;

-- An activity feed holds only mirrored events of other modules; a thread holds people's words and its own events (resolution), never another module's.
CREATE TRIGGER conversation_messages_relations BEFORE INSERT ON conversation_messages
WHEN ((SELECT kind FROM conversations WHERE id = NEW.conversation_id) = 'activity' AND (NEW.message_type <> 'system_event' OR NEW.source_type = 'conversation'))
  OR ((SELECT kind FROM conversations WHERE id = NEW.conversation_id) = 'thread' AND NEW.message_type = 'system_event' AND NEW.source_type <> 'conversation')
BEGIN SELECT RAISE(ABORT, 'an activity feed holds only events of other records, and a thread only its own'); END;

-- A message is never changed. The two exceptions are the owner's own PRIVATE notes (the words may be edited, once, while the note is not removed) and removal (`deleted_at`
-- is set once and stays; the words stay in the record and are no longer shown).
CREATE TRIGGER conversation_messages_immutable BEFORE UPDATE ON conversation_messages
WHEN NEW.seq <> OLD.seq OR NEW.id <> OLD.id OR NEW.conversation_id <> OLD.conversation_id OR NEW.sender_type <> OLD.sender_type OR NEW.sender_id IS NOT OLD.sender_id
  OR NEW.message_type <> OLD.message_type OR NEW.visibility <> OLD.visibility OR NEW.important <> OLD.important OR NEW.created_at <> OLD.created_at
  OR NEW.event_key IS NOT OLD.event_key OR NEW.event_params IS NOT OLD.event_params OR NEW.source_type IS NOT OLD.source_type OR NEW.source_id IS NOT OLD.source_id
  OR NEW.idempotency_key IS NOT OLD.idempotency_key OR NEW.client_token IS NOT OLD.client_token
  OR (NEW.body IS NOT OLD.body AND NOT (OLD.visibility = 'internal' AND OLD.deleted_at IS NULL))
  OR (OLD.deleted_at IS NOT NULL AND (NEW.deleted_at IS NOT OLD.deleted_at OR NEW.body IS NOT OLD.body OR NEW.edited_at IS NOT OLD.edited_at))
BEGIN SELECT RAISE(ABORT, 'a message is never changed; say more in a new one'); END;

-- ---- who has read what -------------------------------------------------------------------------------------------------------------------

-- One marker per reader per conversation: the highest `seq` that reader has been shown. A customer is read as themselves, an administrator as that one administrator (two
-- administrators have two markers). No marker is "nothing read". It never moves back.
CREATE TABLE conversation_reads (
  conversation_id TEXT NOT NULL REFERENCES conversations (id) ON DELETE CASCADE,
  reader_type TEXT NOT NULL CHECK (reader_type IN ('customer', 'admin')),
  reader_id TEXT NOT NULL,
  last_read_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_read_seq >= 0),
  last_read_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, reader_type, reader_id)
);
CREATE TRIGGER conversation_reads_forward BEFORE UPDATE ON conversation_reads
WHEN NEW.last_read_seq < OLD.last_read_seq
BEGIN SELECT RAISE(ABORT, 'a read marker never moves back'); END;

-- ---- what a customer wants e-mailed ---------------------------------------------------------------------------------------------------

-- No row means the defaults (everything on). The owner's own switches (system settings) stay above these: a message the owner switched off is never sent, whatever is here.
CREATE TABLE customer_message_preferences (
  customer_id TEXT PRIMARY KEY REFERENCES customers (id) ON DELETE CASCADE,
  replies INTEGER NOT NULL DEFAULT 1 CHECK (replies IN (0, 1)),
  announcements INTEGER NOT NULL DEFAULT 1 CHECK (announcements IN (0, 1)),
  important INTEGER NOT NULL DEFAULT 1 CHECK (important IN (0, 1)),
  resolution INTEGER NOT NULL DEFAULT 1 CHECK (resolution IN (0, 1)),
  updated_at TEXT NOT NULL
);

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
    'deliverable_feedback_admin', 'deliverable_changes_requested_admin', 'deliverable_approved_admin', 'client_message_reply', 'client_message_announcement', 'client_message_important', 'client_conversation_resolved', 'message_received_admin', 'resolution_requested_admin'
  )),
  related_type TEXT NOT NULL CHECK (related_type IN ('inquiry', 'quote_request', 'system', 'quote', 'quote_revision', 'email_delivery', 'booking_event', 'client_auth', 'client_audit', 'client_project_event', 'client_document', 'client_action_reminder', 'deliverable_event', 'conversation_message')),
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

-- Exactly one of each of these per thing it is about (migration 0014's list, plus the conversations'): a message is about ONE line of the history, so a retried request, a double
-- click or a handler that runs twice can never make a second message.
CREATE UNIQUE INDEX idx_email_once_per_submission ON email_deliveries (related_type, related_id, kind)
  WHERE kind IN ('inquiry_received', 'quote_received', 'inquiry_confirmation', 'quote_confirmation', 'quote_accepted', 'quote_accepted_admin', 'quote_declined', 'quote_declined_admin', 'revision_requested_admin', 'revision_received', 'delivery_failed_admin',
                 'booking_received', 'booking_confirmed', 'booking_new_admin', 'booking_change_received', 'booking_change_requested_admin', 'booking_rescheduled', 'booking_proposal', 'booking_change_declined', 'booking_cancelled', 'booking_cancelled_admin',
                 'client_sign_in', 'client_activate', 'client_register', 'client_email_change', 'client_security_notice',
                 'client_project_created', 'client_project_status', 'client_document_published', 'client_deletion_requested_admin',
                 'client_action_assigned', 'client_action_due_soon', 'client_action_overdue', 'client_action_submitted_admin', 'client_action_reviewed', 'client_action_changes_requested', 'client_milestone_completed',
                 'client_deliverable_ready', 'client_deliverable_new_version', 'client_deliverable_approval_requested', 'client_deliverable_reply',
                 'deliverable_feedback_admin', 'deliverable_changes_requested_admin', 'deliverable_approved_admin', 'client_message_reply', 'client_message_announcement', 'client_message_important', 'client_conversation_resolved', 'message_received_admin', 'resolution_requested_admin');
