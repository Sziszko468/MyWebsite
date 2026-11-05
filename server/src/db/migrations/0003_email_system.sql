-- The e-mail system (PROMPT 14): what `email_deliveries` has to remember once a transactional provider tells us what
-- happened to a message after it accepted it, and customer confirmations exist next to the owner's notifications.
--
-- `accepted` stays the name of "the provider took the message" (the administration calls it "Sent"); `delivered`,
-- `bounced` and `complained` are only ever set from a provider event whose signature was verified. A retry that an
-- administrator starts gets a new `send_generation`, which is part of the idempotency key sent to the provider: an
-- automatic retry after a timeout reuses the key (so a message the provider did receive is not sent twice), a manual one
-- after a confirmed failure does not.

CREATE TABLE email_deliveries_rebuilt (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('inquiry_received', 'quote_received', 'inquiry_status', 'quote_status', 'inquiry_confirmation', 'quote_confirmation', 'test')),
  related_type TEXT NOT NULL CHECK (related_type IN ('inquiry', 'quote_request', 'system')),
  related_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  -- Text an administrator chose to add to a customer's status e-mail.
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'accepted', 'delivered', 'bounced', 'complained', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  send_generation INTEGER NOT NULL DEFAULT 0 CHECK (send_generation >= 0),
  next_attempt_at TEXT,
  -- A short, masked reason, and the kind of reason (auth, quota, rate_limited, rejected, unavailable, timeout, network, bounced, …) the administration words for itself.
  last_error TEXT,
  error_code TEXT,
  provider_message_id TEXT,
  -- Which sender handled the last attempt (resend, smtp, file). What a message proves about "sending works" is only true of the provider that sent it.
  provider TEXT,
  -- The type of the latest provider event that was applied or noted (for example `email.delivery_delayed`), nothing more.
  provider_event TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  accepted_at TEXT,
  delivered_at TEXT
);

INSERT INTO email_deliveries_rebuilt (id, kind, related_type, related_id, recipient, language, note, status, attempts, next_attempt_at, last_error, provider_message_id, created_at, updated_at, accepted_at)
SELECT id, kind, related_type, related_id, recipient, language, note, status, attempts, next_attempt_at, last_error, provider_message_id, created_at, updated_at, accepted_at FROM email_deliveries;

DROP TABLE email_deliveries;
ALTER TABLE email_deliveries_rebuilt RENAME TO email_deliveries;

CREATE INDEX idx_email_deliveries_due ON email_deliveries (status, next_attempt_at);
CREATE INDEX idx_email_deliveries_related ON email_deliveries (related_type, related_id);
CREATE INDEX idx_email_deliveries_created ON email_deliveries (created_at);
CREATE INDEX idx_email_deliveries_provider ON email_deliveries (provider_message_id);
CREATE INDEX idx_email_deliveries_recipient ON email_deliveries (recipient COLLATE NOCASE, created_at);

-- One owner notification and one customer confirmation per submission, whatever happens around it (a retried
-- request, a double click, a handler that runs twice): the database refuses the second row. Status e-mails are
-- the administrator's, and there may be several.
CREATE UNIQUE INDEX idx_email_once_per_submission ON email_deliveries (related_type, related_id, kind)
  WHERE kind IN ('inquiry_received', 'quote_received', 'inquiry_confirmation', 'quote_confirmation');

-- What a provider told us, one row per event. The event's own id is the key, so the same event delivered twice (a
-- provider retries until it is answered) is recognised and ignored. Nothing of the message is kept here: no address,
-- no subject, no text.
CREATE TABLE email_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  delivery_id TEXT REFERENCES email_deliveries (id) ON DELETE CASCADE,
  provider_message_id TEXT,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  -- applied: it changed the message's state; ignored: it was older than what we know, or not a state change;
  -- unmatched: no message of ours has that id.
  outcome TEXT NOT NULL CHECK (outcome IN ('applied', 'ignored', 'unmatched'))
);
CREATE INDEX idx_email_events_delivery ON email_events (delivery_id);
CREATE INDEX idx_email_events_received ON email_events (received_at);
