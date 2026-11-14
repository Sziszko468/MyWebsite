-- migration: foreign-keys-off
-- PROMPT 24 (consultation booking): the owner's consultation types and hours, the bookings visitors make, the history of each booking, the
-- visitor's change requests, the private notes, the secure links, and the new kinds of e-mail they send.
--
-- Nothing here is open to the public until the owner opens it: every consultation type starts disabled, no weekly hours or exceptions
-- exist, and the settings (stored in `settings` under `booking.settings`, not here) start with booking switched off. No hours, no prices and
-- no policy are written by this file.
--
-- The one table that is rebuilt is `email_deliveries` (SQLite cannot change a CHECK in place, exactly as migrations 0007 and 0009 did): it
-- takes the kinds of the booking e-mails and one more thing a message can be about (`booking_event`). Every row, index and once-only rule is kept.

-- ---- consultation types ---------------------------------------------------------------------------------------------------------------

CREATE TABLE consultation_types (
  id TEXT PRIMARY KEY,
  -- The type's address-safe name, chosen by the owner (a lowercase word with hyphens); what the booking page and analytics call it.
  code TEXT NOT NULL UNIQUE CHECK (length(code) BETWEEN 2 AND 40 AND code NOT GLOB '*[^a-z0-9-]*' AND code NOT GLOB '-*' AND code NOT GLOB '*-'),
  -- How long the consultation lasts. NULL until the owner decides: the suggested types are written without a duration, and a type
  -- without one cannot be switched on.
  duration_minutes INTEGER CHECK (duration_minutes IS NULL OR duration_minutes BETWEEN 5 AND 480),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (enabled = 0 OR duration_minutes IS NOT NULL)
);

CREATE TABLE consultation_type_translations (
  type_id TEXT NOT NULL REFERENCES consultation_types (id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  PRIMARY KEY (type_id, language)
);

-- ---- the owner's hours ----------------------------------------------------------------------------------------------------------------

-- A weekly window: on this weekday (1 Monday to 7 Sunday), from this minute to that minute of the LOCAL day in the scheduling time zone.
-- A rule with a type applies to that type only; a type that has rules of its own uses only those, a type without uses the general ones.
CREATE TABLE availability_rules (
  id TEXT PRIMARY KEY,
  consultation_type_id TEXT REFERENCES consultation_types (id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  created_at TEXT NOT NULL,
  CHECK (end_minute > start_minute)
);
CREATE INDEX idx_availability_rules_type ON availability_rules (consultation_type_id, weekday);

-- A day or a period the owner closes (`closed`, with or without times), or a one-off window outside the weekly hours (`open`, with times).
-- Dates are local calendar dates in the scheduling time zone, both ends included. A closure always wins over an opening.
CREATE TABLE availability_exceptions (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('closed', 'open')),
  start_date TEXT NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  end_date TEXT NOT NULL CHECK (end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  start_minute INTEGER CHECK (start_minute IS NULL OR start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER CHECK (end_minute IS NULL OR end_minute BETWEEN 1 AND 1440),
  -- The owner's own words ("Christmas", "conference"); never shown to a visitor.
  label TEXT,
  created_at TEXT NOT NULL,
  CHECK (end_date >= start_date),
  CHECK ((start_minute IS NULL) = (end_minute IS NULL)),
  CHECK (start_minute IS NULL OR end_minute > start_minute),
  -- A one-off opening is a window on one day: it needs its times.
  CHECK (kind = 'closed' OR (start_minute IS NOT NULL AND start_date = end_date))
);
CREATE INDEX idx_availability_exceptions_dates ON availability_exceptions (start_date, end_date);

-- ---- bookings -------------------------------------------------------------------------------------------------------------------------

CREATE TABLE bookings (
  id TEXT PRIMARY KEY,
  -- `BK-2026-000001`: a name to read out on the phone. Sequential, so never a secret; no public address accepts it.
  reference TEXT NOT NULL UNIQUE,
  consultation_type_id TEXT NOT NULL REFERENCES consultation_types (id) ON DELETE RESTRICT,
  -- The language the visitor booked in: every message and page about this booking uses it.
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  website TEXT,
  description TEXT,
  -- The appointment, as instants in UTC (ISO 8601, always with milliseconds and a Z, so text order is time order), and the zone the owner
  -- scheduled it in. The times shown to people are these instants read in that zone, never in the visitor's.
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'reschedule_requested', 'rescheduled', 'cancelled', 'completed', 'no_show')),
  -- What the visitor typed as "related quote or inquiry reference", and the quote request it was matched to (only when the e-mail address is the same).
  related_reference TEXT,
  quote_request_id TEXT REFERENCES quote_requests (id) ON DELETE SET NULL,
  -- The key the browser made for this submission and a hash of what was submitted: a repeat of the same submission is answered with the
  -- booking it made, a different submission under the same key is refused.
  idempotency_key TEXT UNIQUE,
  request_hash TEXT,
  ip_hash TEXT,
  consent_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  confirmed_at TEXT,
  cancelled_at TEXT,
  cancelled_by TEXT CHECK (cancelled_by IS NULL OR cancelled_by IN ('customer', 'owner')),
  -- The reason given for a cancellation, in the words of whoever gave it: the visitor's, or what the owner chose to tell them.
  cancellation_note TEXT,
  completed_at TEXT,
  CHECK (end_at > start_at),
  CHECK (status <> 'cancelled' OR cancelled_at IS NOT NULL)
);
CREATE INDEX idx_bookings_start ON bookings (start_at);
CREATE INDEX idx_bookings_status ON bookings (status, start_at);
CREATE INDEX idx_bookings_email ON bookings (email COLLATE NOCASE);
CREATE INDEX idx_bookings_type ON bookings (consultation_type_id, start_at);
CREATE INDEX idx_bookings_created ON bookings (created_at);

-- ---- a visitor's request to cancel or move a booking, and the owner's proposal of a new time -----------------------------------------------

CREATE TABLE booking_changes (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('cancel', 'reschedule')),
  -- Who asked: `customer` (a request the owner answers) or `owner` (a proposal the customer answers).
  initiator TEXT NOT NULL CHECK (initiator IN ('customer', 'owner')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'declined', 'withdrawn', 'expired')),
  -- A reschedule names the replacement slot; while the change is open that slot is HELD: no other booking can take it.
  new_start_at TEXT,
  new_end_at TEXT,
  -- The visitor's own words (why), or the owner's note to the visitor with a proposal.
  message TEXT,
  -- What the booking was before the request, so a declined request puts it back exactly there.
  booking_status_before TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT CHECK (decided_by IS NULL OR decided_by IN ('customer', 'owner', 'system')),
  CHECK ((kind = 'reschedule') = (new_start_at IS NOT NULL)),
  CHECK ((new_start_at IS NULL) = (new_end_at IS NULL)),
  CHECK (new_end_at IS NULL OR new_end_at > new_start_at)
);
-- One open request or proposal per booking.
CREATE UNIQUE INDEX idx_booking_changes_one_open ON booking_changes (booking_id) WHERE status = 'open';
CREATE INDEX idx_booking_changes_booking ON booking_changes (booking_id, created_at);

-- ---- the history ----------------------------------------------------------------------------------------------------------------------

-- One line per thing that happened, written by the code that did it, in the same transaction. The database refuses to change or delete a
-- line, and a line carries references, statuses and times: never a name, an address or what a person wrote.
CREATE TABLE booking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id TEXT NOT NULL,
  reference TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'confirmed', 'rescheduled', 'cancelled', 'completed', 'no_show', 'change_requested', 'change_declined', 'change_withdrawn', 'change_expired', 'note_added', 'links_revoked', 'email_failed')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('customer', 'admin', 'system')),
  actor_id TEXT,
  from_status TEXT,
  to_status TEXT,
  from_start_at TEXT,
  to_start_at TEXT,
  change_id TEXT,
  -- A short fixed phrase or code, never free text.
  summary TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_booking_events_booking ON booking_events (booking_id, id);
CREATE TRIGGER booking_events_no_update BEFORE UPDATE ON booking_events BEGIN SELECT RAISE(ABORT, 'the booking history is append-only'); END;
CREATE TRIGGER booking_events_no_delete BEFORE DELETE ON booking_events BEGIN SELECT RAISE(ABORT, 'the booking history is append-only'); END;

-- The owner's private notes. Never in a customer's page or e-mail.
CREATE TABLE booking_notes (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  author_id TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_booking_notes_booking ON booking_notes (booking_id, created_at);

-- The secure link to one booking. Only the SHA-256 of the secret is kept. A token opens exactly one booking and nothing else, and
-- it is not a token of the quotation system: the two tables share no scope.
CREATE TABLE booking_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  booking_id TEXT NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX idx_booking_tokens_booking ON booking_tokens (booking_id);

-- ---- two appointments can never overlap -----------------------------------------------------------------------------------------------
--
-- The application checks this inside one write transaction (the database has one writer), and these triggers are the last line of defence
-- that holds whatever code or process writes: a booking that is still alive (`pending`, `confirmed`, `reschedule_requested`, `rescheduled`)
-- cannot overlap another one, nor a slot HELD by somebody else's open reschedule request. A buffer between consultations is the
-- availability rules' business; this is only "never the same moment twice".

CREATE TRIGGER bookings_no_overlap_insert BEFORE INSERT ON bookings
WHEN NEW.status IN ('pending', 'confirmed', 'reschedule_requested', 'rescheduled')
BEGIN
  SELECT RAISE(ABORT, 'booking_overlap')
  WHERE EXISTS (SELECT 1 FROM bookings o WHERE o.id <> NEW.id AND o.status IN ('pending', 'confirmed', 'reschedule_requested', 'rescheduled') AND o.start_at < NEW.end_at AND o.end_at > NEW.start_at)
     OR EXISTS (SELECT 1 FROM booking_changes c WHERE c.status = 'open' AND c.kind = 'reschedule' AND c.booking_id <> NEW.id AND c.new_start_at < NEW.end_at AND c.new_end_at > NEW.start_at);
END;

CREATE TRIGGER bookings_no_overlap_update BEFORE UPDATE OF start_at, end_at, status ON bookings
WHEN NEW.status IN ('pending', 'confirmed', 'reschedule_requested', 'rescheduled')
BEGIN
  SELECT RAISE(ABORT, 'booking_overlap')
  WHERE EXISTS (SELECT 1 FROM bookings o WHERE o.id <> NEW.id AND o.status IN ('pending', 'confirmed', 'reschedule_requested', 'rescheduled') AND o.start_at < NEW.end_at AND o.end_at > NEW.start_at)
     OR EXISTS (SELECT 1 FROM booking_changes c WHERE c.status = 'open' AND c.kind = 'reschedule' AND c.booking_id <> NEW.id AND c.new_start_at < NEW.end_at AND c.new_end_at > NEW.start_at);
END;

CREATE TRIGGER booking_changes_hold_insert BEFORE INSERT ON booking_changes
WHEN NEW.kind = 'reschedule' AND NEW.status = 'open'
BEGIN
  SELECT RAISE(ABORT, 'booking_overlap')
  WHERE EXISTS (SELECT 1 FROM bookings o WHERE o.id <> NEW.booking_id AND o.status IN ('pending', 'confirmed', 'reschedule_requested', 'rescheduled') AND o.start_at < NEW.new_end_at AND o.end_at > NEW.new_start_at)
     OR EXISTS (SELECT 1 FROM booking_changes c WHERE c.id <> NEW.id AND c.status = 'open' AND c.kind = 'reschedule' AND c.new_start_at < NEW.new_end_at AND c.new_end_at > NEW.new_start_at);
END;

-- ---- the e-mails ----------------------------------------------------------------------------------------------------------------------

CREATE TABLE email_deliveries_rebuilt (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN (
    'inquiry_received', 'quote_received', 'inquiry_status', 'quote_status', 'inquiry_confirmation', 'quote_confirmation', 'test',
    'quote_sent', 'quote_revised', 'quote_accepted', 'quote_accepted_admin', 'quote_declined', 'quote_declined_admin', 'revision_requested_admin',
    'revision_received', 'delivery_failed_admin',
    'booking_received', 'booking_confirmed', 'booking_new_admin', 'booking_change_received', 'booking_change_requested_admin',
    'booking_rescheduled', 'booking_proposal', 'booking_change_declined', 'booking_cancelled', 'booking_cancelled_admin'
  )),
  related_type TEXT NOT NULL CHECK (related_type IN ('inquiry', 'quote_request', 'system', 'quote', 'quote_revision', 'email_delivery', 'booking_event')),
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

-- Exactly one of each of these per thing it is about. A booking's e-mails are about one EVENT of the booking (its creation, a change, a
-- cancellation), so a retried request, a double click or a handler that runs twice can never make a second message for the same event.
-- Migration 0009's list, plus the booking kinds.
CREATE UNIQUE INDEX idx_email_once_per_submission ON email_deliveries (related_type, related_id, kind)
  WHERE kind IN ('inquiry_received', 'quote_received', 'inquiry_confirmation', 'quote_confirmation', 'quote_accepted', 'quote_accepted_admin', 'quote_declined', 'quote_declined_admin', 'revision_requested_admin', 'revision_received', 'delivery_failed_admin',
                 'booking_received', 'booking_confirmed', 'booking_new_admin', 'booking_change_received', 'booking_change_requested_admin', 'booking_rescheduled', 'booking_proposal', 'booking_change_declined', 'booking_cancelled', 'booking_cancelled_admin');
