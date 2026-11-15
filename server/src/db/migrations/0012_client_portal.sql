-- migration: foreign-keys-off
-- PROMPT 25 (client portal): customer accounts that sign in with a link sent to their address (no password is stored anywhere), their sessions, the explicit
-- links between an account and the quote requests and bookings that are theirs, the customer's projects with their milestones, history, private notes
-- and documents, and the new kinds of e-mail they send.
--
-- Everything here is ADDITIVE. No existing row is changed; no existing table is touched except `email_deliveries`, which is rebuilt exactly as migrations
-- 0007, 0009 and 0011 did (SQLite cannot change a CHECK in place) to accept the portal's kinds of message. Nothing is open to the public: no account
-- exists until the owner invites someone (or switches self-registration on in the settings, which starts OFF), and no quote request or booking belongs
-- to any account until it is linked on purpose.
--
-- To take the portal out again (a rollback is a decision, not an accident), see docs/client-portal/ARCHITECTURE.md ("Rolling back"): the tables below are
-- dropped child first, and the e-mail log keeps its older rows.

-- ---- customers -------------------------------------------------------------------------------------------------------------------------

CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  -- The address the account is reached at. It is changed only after the new address has been proven (a link sent to it was opened).
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT,
  company TEXT,
  -- The language of every message to this customer and of their portal; they can change it in their profile.
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  -- invited: the owner created the account, nobody has opened its first link yet (the address is NOT verified).
  -- active: the address was verified. disabled: the owner switched it off; no one can sign in.
  status TEXT NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'active', 'disabled')),
  origin TEXT NOT NULL CHECK (origin IN ('invitation', 'registration')),
  email_verified_at TEXT,
  last_sign_in_at TEXT,
  -- The customer asked for their account and data to be deleted. The deletion itself is the owner's act (server:cli erase), as for every other record.
  deletion_requested_at TEXT,
  disabled_at TEXT,
  invited_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- An account whose address nobody has proven cannot be active.
  CHECK (status <> 'active' OR email_verified_at IS NOT NULL)
);
CREATE INDEX idx_customers_status ON customers (status, created_at);
CREATE INDEX idx_customers_deletion ON customers (deletion_requested_at) WHERE deletion_requested_at IS NOT NULL;

-- ---- the links that sign someone in --------------------------------------------------------------------------------------------------

-- One row per "send me a link": what for, to which address, in which language. The outbox's message points at THIS row; the secret itself is made when the
-- message is written (never stored in the clear), exactly as the quotation's and the booking's links are.
CREATE TABLE customer_auth_requests (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('sign_in', 'activate', 'register', 'email_change')),
  -- A registration has no account yet (it is made when the link is opened); everything else belongs to one.
  customer_id TEXT REFERENCES customers (id) ON DELETE CASCADE,
  -- Where the link is sent. For an address change this is the NEW address.
  email TEXT NOT NULL COLLATE NOCASE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  ip_hash TEXT,
  created_at TEXT NOT NULL,
  CHECK ((purpose = 'register') = (customer_id IS NULL))
);
CREATE INDEX idx_customer_auth_requests_email ON customer_auth_requests (email, created_at);
CREATE INDEX idx_customer_auth_requests_customer ON customer_auth_requests (customer_id, purpose);

-- The secret of a link: only the SHA-256 of 256 random bits is kept. It works once, for a short time, and a newer link of the same request replaces it.
CREATE TABLE customer_auth_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL REFERENCES customer_auth_requests (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX idx_customer_auth_tokens_request ON customer_auth_tokens (request_id);
CREATE INDEX idx_customer_auth_tokens_expires ON customer_auth_tokens (expires_at);

-- ---- sessions ------------------------------------------------------------------------------------------------------------------------

-- A sign-in. The cookie holds the secret; only its SHA-256 is kept. It ends at an absolute time and after a period without use; revoking deletes the row.
CREATE TABLE customer_sessions (
  token_hash TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT
);
CREATE INDEX idx_customer_sessions_customer ON customer_sessions (customer_id);
CREATE INDEX idx_customer_sessions_expires ON customer_sessions (expires_at);

-- ---- which records are whose ---------------------------------------------------------------------------------------------------------

-- The ONLY thing that makes a quote request or a booking visible to a customer. A record belongs to at most one account, and is never linked because two
-- e-mail addresses look alike: `admin` is the owner's decision, `verified_email` is the customer's own claim of a record that carries the address THEY
-- have proven (the account's verified address, at the moment of the claim). Deleting the record or the account removes the link.
CREATE TABLE customer_links (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  quote_request_id TEXT REFERENCES quote_requests (id) ON DELETE CASCADE,
  booking_id TEXT REFERENCES bookings (id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('admin', 'verified_email')),
  linked_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  -- A link is about exactly one record.
  CHECK ((quote_request_id IS NULL) <> (booking_id IS NULL))
);
CREATE UNIQUE INDEX idx_customer_links_request ON customer_links (quote_request_id) WHERE quote_request_id IS NOT NULL;
CREATE UNIQUE INDEX idx_customer_links_booking ON customer_links (booking_id) WHERE booking_id IS NOT NULL;
CREATE INDEX idx_customer_links_customer ON customer_links (customer_id);

-- ---- the customer's projects ---------------------------------------------------------------------------------------------------------

-- A project exists only because the owner created it for a customer (an explicit act, never a side effect of a request or an acceptance). When it comes
-- from a quote request, that request must be linked to the same customer and have an accepted quotation: the application checks it; the version
-- that was accepted is remembered here. The status list is the one in docs/client-portal/ARCHITECTURE.md; PROMPT 26 extends it by rebuilding this table.
CREATE TABLE client_projects (
  id TEXT PRIMARY KEY,
  -- `PRJ-7K3M9XQH`: random, not sequential, so a reference cannot be guessed from another. It is a name to read out, never a key to anything.
  reference TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  quote_request_id TEXT REFERENCES quote_requests (id) ON DELETE SET NULL,
  quote_id TEXT REFERENCES quotes (id) ON DELETE SET NULL,
  -- The name the owner gave it, in the words the owner chose (shown as written, like a quotation's title).
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('website', 'webapp', 'ui', 'integrations', 'ai', 'other')),
  status TEXT NOT NULL DEFAULT 'awaiting_start' CHECK (status IN ('awaiting_start', 'discovery', 'planning', 'design', 'development', 'review', 'waiting_customer', 'finalization', 'completed', 'on_hold', 'cancelled')),
  started_on TEXT CHECK (started_on IS NULL OR started_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  expected_on TEXT CHECK (expected_on IS NULL OR expected_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  completed_at TEXT,
  created_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_client_projects_customer ON client_projects (customer_id, status);
CREATE INDEX idx_client_projects_request ON client_projects (quote_request_id);

-- A step the owner chose to show. Progress is only ever counted from these rows ("2 of 5 done"); no percentage is invented.
CREATE TABLE client_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES client_projects (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_on TEXT CHECK (due_on IS NULL OR due_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  completed_at TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_client_milestones_project ON client_milestones (project_id, position);

-- What happened to a project, one line each, written by the code that did it in the same transaction. The timeline a customer sees is read from here and
-- nowhere else; a line carries a kind, statuses and (for an update the owner wrote for the customer) that update's words, never anything private.
CREATE TABLE client_project_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL REFERENCES client_projects (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'status_changed', 'dates_changed', 'milestone_added', 'milestone_completed', 'document_published', 'feedback_requested', 'update_posted')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'customer', 'system')),
  actor_id TEXT,
  from_status TEXT,
  to_status TEXT,
  milestone_id TEXT,
  document_id TEXT,
  -- The words the owner wrote FOR the customer with this event (an update, a question). NULL for the rest; never a private note.
  note TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_client_project_events_project ON client_project_events (project_id, id);
CREATE TRIGGER client_project_events_no_update BEFORE UPDATE ON client_project_events BEGIN SELECT RAISE(ABORT, 'the project history is append-only'); END;

-- The owner's private notes about a project. Never in a customer's page, a customer's e-mail or the timeline.
CREATE TABLE client_project_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES client_projects (id) ON DELETE CASCADE,
  author_id TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_client_project_notes_project ON client_project_notes (project_id, created_at);

-- A file that belongs to a project. PRIVATE BY DEFAULT: a customer sees a document only when `published_at` is set, and it can only be set when the bytes
-- have a place (`storage_key`). The site has no private file storage yet, so today no document can be published (the CHECK below says so); the table and the
-- authorization around it are ready for the day a storage exists (docs/client-portal/DOCUMENTS.md).
CREATE TABLE client_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES client_projects (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('brief', 'design', 'deliverable', 'other')),
  file_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  -- An opaque key in a store that does not exist yet. Never a path, never an address, never shown to anyone.
  storage_key TEXT,
  published_at TEXT,
  created_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  CHECK (published_at IS NULL OR storage_key IS NOT NULL)
);
CREATE INDEX idx_client_documents_project ON client_documents (project_id, created_at);

-- ---- the account's history -----------------------------------------------------------------------------------------------------------

-- One line per thing that happened to an account, written by the code that did it. It holds the kind, who did it and a short fixed code: never an
-- address (not even a network address), a name, a token or what a person wrote. It has no foreign key (an erased account leaves lines that say an account with this id existed and
-- nothing more), and the database refuses to change or remove a line.
CREATE TABLE customer_audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'invited', 'invitation_resent', 'registered', 'verified', 'signed_in', 'signed_out', 'sessions_revoked', 'email_change_requested', 'email_changed',
    'profile_updated', 'disabled', 'enabled', 'record_linked', 'record_unlinked', 'deletion_requested', 'deletion_cancelled', 'project_created'
  )),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'admin', 'system')),
  actor_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_customer_audit_customer ON customer_audit_events (customer_id, id);
CREATE TRIGGER customer_audit_events_no_update BEFORE UPDATE ON customer_audit_events BEGIN SELECT RAISE(ABORT, 'the account history is append-only'); END;
CREATE TRIGGER customer_audit_events_no_delete BEFORE DELETE ON customer_audit_events BEGIN SELECT RAISE(ABORT, 'the account history is append-only'); END;

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
    'client_project_created', 'client_project_status', 'client_document_published', 'client_deletion_requested_admin'
  )),
  related_type TEXT NOT NULL CHECK (related_type IN ('inquiry', 'quote_request', 'system', 'quote', 'quote_revision', 'email_delivery', 'booking_event', 'client_auth', 'client_audit', 'client_project_event', 'client_document')),
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

-- Exactly one of each of these per thing it is about. A link's message is about ONE request for a link, a project's message about ONE event, a security
-- notice, or the owner's notice of a deletion request, about ONE line of the account's history: a retried request, a double click or a handler that runs twice can never make a second message for the
-- same thing. (Sending the same message again on purpose is the administration's "send again", which reuses the row.) Migration 0011's list, plus the portal's.
CREATE UNIQUE INDEX idx_email_once_per_submission ON email_deliveries (related_type, related_id, kind)
  WHERE kind IN ('inquiry_received', 'quote_received', 'inquiry_confirmation', 'quote_confirmation', 'quote_accepted', 'quote_accepted_admin', 'quote_declined', 'quote_declined_admin', 'revision_requested_admin', 'revision_received', 'delivery_failed_admin',
                 'booking_received', 'booking_confirmed', 'booking_new_admin', 'booking_change_received', 'booking_change_requested_admin', 'booking_rescheduled', 'booking_proposal', 'booking_change_declined', 'booking_cancelled', 'booking_cancelled_admin',
                 'client_sign_in', 'client_activate', 'client_register', 'client_email_change', 'client_security_notice',
                 'client_project_created', 'client_project_status', 'client_document_published', 'client_deletion_requested_admin');
