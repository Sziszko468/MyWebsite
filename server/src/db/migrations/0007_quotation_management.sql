-- migration: foreign-keys-off
-- PROMPT 17: quotation and order management. The runner turns foreign keys off around this file because two tables are
-- rebuilt (SQLite cannot change a CHECK in place): `quote_requests`, for the eleven statuses, the request type, the source and the
-- new fields, and `email_deliveries`, for the new kinds of message. Every other table keeps its rows.

-- ---------------------------------------------------------------------------------------------------- quote_requests

CREATE TABLE quote_requests_rebuilt (
  id TEXT PRIMARY KEY,
  -- The public reference, `CC-2026-000001` by default (QUOTE_REFERENCE_FORMAT). Requests made before this migration keep the code they had.
  reference TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  kind TEXT NOT NULL DEFAULT 'catalogue' CHECK (kind IN ('catalogue', 'full_experience')),
  -- What kind of request it is, decided by the server from what was sent, never taken from the browser.
  request_type TEXT NOT NULL DEFAULT 'standard_inquiry' CHECK (request_type IN ('standard_inquiry', 'package_quote', 'custom_service', 'full_experience', 'custom_application', 'custom_website', 'ai_project', 'general_business')),
  -- Where it was written: the shop's forms, CONTROL ROOM AI, a contact-form message an administrator turned into a request, or entered by hand.
  source TEXT NOT NULL DEFAULT 'shop' CHECK (source IN ('shop', 'control_room_ai', 'contact_form', 'other')),
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT,
  company TEXT,
  website TEXT,
  description TEXT NOT NULL,
  objective TEXT CHECK (objective IN ('present', 'leads', 'sell', 'process', 'improve', 'other')),
  reference_notes TEXT,
  timing TEXT CHECK (timing IN ('unsure', 'asap', 'weeks', 'months', 'flexible')),
  requirements TEXT,
  -- What the visitor wrote about the budget, in their own words (the site publishes no ranges of its own to choose from).
  budget_range TEXT,
  brief_json TEXT CHECK (brief_json IS NULL OR json_valid(brief_json)),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'under_review', 'waiting_customer', 'quote_preparation', 'quote_sent', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled')),
  -- The last status the customer was shown. It moves only when an administrator chooses to show a change, or when the customer
  -- themself did something (the request arrived, a quotation was sent, accepted or declined): an internal change is not announced.
  customer_status TEXT NOT NULL DEFAULT 'new' CHECK (customer_status IN ('new', 'under_review', 'waiting_customer', 'quote_preparation', 'quote_sent', 'accepted', 'declined', 'in_progress', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  inquiry_id TEXT REFERENCES inquiries (id) ON DELETE SET NULL,
  archived_at TEXT,
  consent_at TEXT,
  -- The separate, optional agreement to hear about other things. Nothing in this system sends marketing: this only records a choice.
  marketing_consent_at TEXT,
  ip_hash TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO quote_requests_rebuilt (id, reference, language, kind, request_type, source, name, email, phone, company, website, description, objective, reference_notes, timing, requirements, budget_range, brief_json, status, customer_status, priority, inquiry_id, archived_at, consent_at, marketing_consent_at, ip_hash, content_hash, created_at, updated_at)
SELECT q.id, q.reference, q.language, q.kind,
       CASE
         WHEN q.source = 'ai_assistant' THEN 'ai_project'
         WHEN q.kind = 'full_experience' THEN 'full_experience'
         WHEN EXISTS (SELECT 1 FROM quote_request_items i WHERE i.quote_request_id = q.id AND i.plan = 'custom') THEN 'custom_service'
         ELSE 'package_quote'
       END,
       CASE q.source WHEN 'ai_assistant' THEN 'control_room_ai' ELSE 'shop' END,
       q.name, q.email, q.phone, q.company, NULL, q.description, q.objective, q.reference_notes, q.timing, q.requirements, NULL, q.brief_json,
       CASE q.status WHEN 'in_review' THEN 'under_review' WHEN 'quoted' THEN 'quote_sent' WHEN 'closed' THEN 'completed' ELSE q.status END,
       CASE q.status WHEN 'in_review' THEN 'under_review' WHEN 'quoted' THEN 'quote_sent' WHEN 'closed' THEN 'completed' ELSE q.status END,
       'normal', q.inquiry_id, q.archived_at, q.consent_at, NULL, q.ip_hash, q.content_hash, q.created_at, q.updated_at
FROM quote_requests q;

DROP TABLE quote_requests;
ALTER TABLE quote_requests_rebuilt RENAME TO quote_requests;

CREATE INDEX idx_quote_requests_status_created ON quote_requests (status, created_at);
CREATE INDEX idx_quote_requests_created ON quote_requests (created_at);
CREATE INDEX idx_quote_requests_archived ON quote_requests (archived_at);
CREATE INDEX idx_quote_requests_email ON quote_requests (email);
CREATE INDEX idx_quote_requests_dedupe ON quote_requests (content_hash, created_at);
CREATE INDEX idx_quote_requests_inquiry ON quote_requests (inquiry_id);
CREATE INDEX idx_quote_requests_type ON quote_requests (request_type, created_at);

-- Names as they were when the request was made (service, package, add-ons, in every language), so the administrator reads what the
-- visitor chose even after the catalogue was edited. Older rows have none and fall back to the catalogue.
ALTER TABLE quote_request_items ADD COLUMN names_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(names_json));

-- ---------------------------------------------------------------------------------------------------- references

-- One counter per scope (a year): incremented inside the transaction that stores the request, so two requests cannot get one number.
CREATE TABLE reference_counters (
  scope TEXT PRIMARY KEY,
  value INTEGER NOT NULL CHECK (value >= 0)
);

-- ---------------------------------------------------------------------------------------------------- quotations

-- One row per VERSION of a quotation. A draft is edited freely; once sent, the customer-visible content never changes (the triggers
-- below refuse it): a change is a new version that supersedes the old one.
CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  quote_request_id TEXT NOT NULL REFERENCES quote_requests (id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 1),
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'superseded', 'withdrawn')),
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  title TEXT NOT NULL,
  introduction TEXT NOT NULL DEFAULT '',
  understanding TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  deliverables TEXT NOT NULL DEFAULT '',
  exclusions TEXT NOT NULL DEFAULT '',
  payment_terms TEXT NOT NULL DEFAULT '',
  terms TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  estimated_timeline TEXT NOT NULL DEFAULT '',
  -- The last day the offer can be accepted, as YYYY-MM-DD (UTC).
  valid_until TEXT CHECK (valid_until IS NULL OR valid_until GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  -- fixed: one amount; itemized: lines that add up; custom: a price described in words (pricing_note), no figure.
  pricing_mode TEXT NOT NULL DEFAULT 'itemized' CHECK (pricing_mode IN ('fixed', 'itemized', 'custom')),
  pricing_note TEXT NOT NULL DEFAULT '',
  currency TEXT CHECK (currency IS NULL OR currency IN ('EUR', 'HUF')),
  tax_mode TEXT NOT NULL DEFAULT 'unspecified' CHECK (tax_mode IN ('unspecified', 'excluded', 'included', 'exempt')),
  -- A rate in basis points (2700 = 27 %). Used only when the administrator confirmed it was verified; otherwise no tax figure is computed.
  tax_rate_bp INTEGER CHECK (tax_rate_bp IS NULL OR (tax_rate_bp >= 0 AND tax_rate_bp <= 10000)),
  tax_verified INTEGER NOT NULL DEFAULT 0 CHECK (tax_verified IN (0, 1)),
  tax_note TEXT NOT NULL DEFAULT '',
  -- Money is whole minor units (cents for EUR, forints for HUF); never a floating-point number. Totals are the server's arithmetic.
  fixed_minor INTEGER CHECK (fixed_minor IS NULL OR fixed_minor >= 0),
  subtotal_minor INTEGER,
  discount_minor INTEGER,
  tax_minor INTEGER,
  total_minor INTEGER,
  revision_reason TEXT,
  supersedes_id TEXT REFERENCES quotes (id) ON DELETE SET NULL,
  created_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  -- Fingerprint of everything the customer was shown, set when the version is sent: what acceptance refers to.
  content_hash TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  accepted_at TEXT,
  accepted_ip_hash TEXT,
  declined_at TEXT,
  decline_reason TEXT,
  UNIQUE (quote_request_id, version),
  CHECK (pricing_mode = 'custom' OR currency IS NOT NULL OR status = 'draft'),
  CHECK (pricing_mode <> 'custom' OR length(trim(pricing_note)) > 0 OR status = 'draft')
);
CREATE INDEX idx_quotes_request ON quotes (quote_request_id, version);
CREATE INDEX idx_quotes_status ON quotes (status, valid_until);
-- At most one version is being written and at most one is out with the customer: the database refuses a second of either.
CREATE UNIQUE INDEX idx_quotes_one_draft ON quotes (quote_request_id) WHERE status = 'draft';
CREATE UNIQUE INDEX idx_quotes_one_open ON quotes (quote_request_id) WHERE status = 'sent';

CREATE TABLE quote_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_id TEXT NOT NULL REFERENCES quotes (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  -- item: part of the price; optional: offered, not in the total; discount: subtracted, and only with a reason.
  kind TEXT NOT NULL DEFAULT 'item' CHECK (kind IN ('item', 'optional', 'discount')),
  description TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 10000),
  unit_minor INTEGER NOT NULL CHECK (unit_minor >= 0),
  justification TEXT NOT NULL DEFAULT '',
  CHECK (kind <> 'discount' OR length(trim(justification)) > 0)
);
CREATE INDEX idx_quote_lines_quote ON quote_lines (quote_id, position);

-- A sent quotation is never edited in place. (A cascading delete of the whole request is allowed: its parent row is already gone when
-- the line's trigger runs, so the condition below is false.)
CREATE TRIGGER quotes_sent_is_immutable
BEFORE UPDATE OF version, reference, language, title, introduction, understanding, scope, deliverables, exclusions, payment_terms, terms, notes, estimated_timeline, valid_until, pricing_mode, pricing_note, currency, tax_mode, tax_rate_bp, tax_verified, tax_note, fixed_minor, subtotal_minor, discount_minor, tax_minor, total_minor, quote_request_id
ON quotes
WHEN OLD.status <> 'draft'
BEGIN
  SELECT RAISE(ABORT, 'a quotation that was sent is never edited; make a new version');
END;

CREATE TRIGGER quote_lines_no_insert_after_send BEFORE INSERT ON quote_lines
WHEN EXISTS (SELECT 1 FROM quotes WHERE id = NEW.quote_id AND status <> 'draft')
BEGIN SELECT RAISE(ABORT, 'a quotation that was sent is never edited; make a new version'); END;

CREATE TRIGGER quote_lines_no_update_after_send BEFORE UPDATE ON quote_lines
WHEN EXISTS (SELECT 1 FROM quotes WHERE id = OLD.quote_id AND status <> 'draft')
BEGIN SELECT RAISE(ABORT, 'a quotation that was sent is never edited; make a new version'); END;

CREATE TRIGGER quote_lines_no_delete_after_send BEFORE DELETE ON quote_lines
WHEN EXISTS (SELECT 1 FROM quotes WHERE id = OLD.quote_id AND status <> 'draft')
BEGIN SELECT RAISE(ABORT, 'a quotation that was sent is never edited; make a new version'); END;

-- ---------------------------------------------------------------------------------------------------- customer links

-- What a link in an e-mail or on a page can do. Only the SHA-256 of the 256-bit random token is stored. A token has one quotation (or
-- one request) and one action; accepting, declining and asking for a revision use a token that works once and for a short time.
CREATE TABLE customer_action_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  quote_request_id TEXT NOT NULL REFERENCES quote_requests (id) ON DELETE CASCADE,
  quote_id TEXT REFERENCES quotes (id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('view_request', 'view_quote', 'accept_quote', 'decline_quote', 'request_revision')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  CHECK ((action = 'view_request' AND quote_id IS NULL) OR (action <> 'view_request' AND quote_id IS NOT NULL))
);
CREATE INDEX idx_tokens_quote ON customer_action_tokens (quote_id, action);
CREATE INDEX idx_tokens_request ON customer_action_tokens (quote_request_id, action);
CREATE INDEX idx_tokens_expires ON customer_action_tokens (expires_at);

-- What a customer wrote when asking for clarification or a different offer. It changes nothing by itself.
CREATE TABLE quote_revision_requests (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES quotes (id) ON DELETE CASCADE,
  quote_request_id TEXT NOT NULL REFERENCES quote_requests (id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL,
  handled_at TEXT
);
CREATE INDEX idx_revision_requests_quote ON quote_revision_requests (quote_id, created_at);

-- What the administrator chose to show on the customer's status page (the page never shows internal notes or the history).
CREATE TABLE customer_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_request_id TEXT NOT NULL REFERENCES quote_requests (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('status', 'message', 'quote')),
  status TEXT,
  body TEXT NOT NULL DEFAULT '',
  author_id TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_customer_updates_request ON customer_updates (quote_request_id, created_at);

-- ---------------------------------------------------------------------------------------------------- the history

-- Status history and quotation events in one append-only log. It holds references and statuses, never what a person wrote, and it has no foreign
-- key: erasing a request for privacy leaves a line that says a request with this reference existed, nothing more. The database itself refuses
-- to change or remove a line.
CREATE TABLE quote_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_request_id TEXT NOT NULL,
  quote_id TEXT,
  reference TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('admin', 'customer', 'system', 'assistant')),
  actor_id TEXT,
  from_status TEXT,
  to_status TEXT,
  summary TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_quote_events_request ON quote_events (quote_request_id, id);
CREATE INDEX idx_quote_events_created ON quote_events (created_at);

CREATE TRIGGER quote_events_no_update BEFORE UPDATE ON quote_events BEGIN SELECT RAISE(ABORT, 'the quotation history is append-only'); END;
CREATE TRIGGER quote_events_no_delete BEFORE DELETE ON quote_events BEGIN SELECT RAISE(ABORT, 'the quotation history is append-only'); END;

-- ---------------------------------------------------------------------------------------------------- e-mail

CREATE TABLE email_deliveries_rebuilt (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN (
    'inquiry_received', 'quote_received', 'inquiry_status', 'quote_status', 'inquiry_confirmation', 'quote_confirmation', 'test',
    'quote_sent', 'quote_revised', 'quote_accepted', 'quote_accepted_admin', 'quote_declined', 'quote_declined_admin', 'revision_requested_admin'
  )),
  related_type TEXT NOT NULL CHECK (related_type IN ('inquiry', 'quote_request', 'system', 'quote', 'quote_revision')),
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

-- Exactly one owner notification and one customer confirmation per submission, and one acceptance or decline message to each side per
-- quotation, one revision notice per revision request: whatever happens around it (a retried request, a double click, a handler that runs
-- twice), the database refuses the second row. A quotation e-mail itself may be sent again on purpose (a lost link), so it is not here.
CREATE UNIQUE INDEX idx_email_once_per_submission ON email_deliveries (related_type, related_id, kind)
  WHERE kind IN ('inquiry_received', 'quote_received', 'inquiry_confirmation', 'quote_confirmation', 'quote_accepted', 'quote_accepted_admin', 'quote_declined', 'quote_declined_admin', 'revision_requested_admin');
