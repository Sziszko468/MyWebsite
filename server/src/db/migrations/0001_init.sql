-- The first schema. Conventions (docs/backend/architecture.md, section 4):
--   * customer-facing records have random text ids and a short `reference`; catalogue rows have integer ids and a slug/code
--   * timestamps are UTC ISO-8601 text
--   * every foreign key is declared; catalogue rows that requests point at are never deleted (ON DELETE RESTRICT), only disabled
--   * enumerations are CHECK constraints; a published price must be complete (see the packages and extras checks)

-- ---------------------------------------------------------------------------------------------------- administration

CREATE TABLE admin_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  failed_logins INTEGER NOT NULL DEFAULT 0 CHECK (failed_logins >= 0),
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Only the SHA-256 of the session token is stored: a copy of the database cannot be used to sign in.
CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  ip_hash TEXT,
  user_agent TEXT
);
CREATE INDEX idx_admin_sessions_user ON admin_sessions (user_id);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions (expires_at);

-- What an administrator did, for the operator; it carries no customer text.
CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_audit_log_created ON audit_log (created_at);

-- ---------------------------------------------------------------------------------------------------- the catalogue

CREATE TABLE services (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE CHECK (slug GLOB '[a-z0-9]*' AND length(slug) BETWEEN 2 AND 40),
  category TEXT NOT NULL CHECK (length(category) BETWEEN 2 AND 40),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_services_status_position ON services (status, position);

CREATE TABLE service_translations (
  service_id INTEGER NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  tagline TEXT NOT NULL DEFAULT '',
  overview TEXT NOT NULL DEFAULT '',
  features_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(features_json)),
  PRIMARY KEY (service_id, language)
);

CREATE TABLE packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (code GLOB '[a-z0-9]*' AND length(code) BETWEEN 2 AND 40),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  price_kind TEXT NOT NULL DEFAULT 'quote' CHECK (price_kind IN ('quote', 'tbd', 'from')),
  price_amount INTEGER,
  price_currency TEXT CHECK (price_currency IN ('EUR', 'HUF')),
  vat_mode TEXT NOT NULL DEFAULT 'unspecified' CHECK (vat_mode IN ('unspecified', 'excluded', 'included', 'exempt')),
  quote_required INTEGER NOT NULL DEFAULT 1 CHECK (quote_required IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- A published price is complete: an amount, a currency and a VAT mode that says something.
  CHECK (
    (price_kind = 'from' AND price_amount IS NOT NULL AND price_amount > 0 AND price_currency IS NOT NULL AND vat_mode <> 'unspecified')
    OR (price_kind IN ('quote', 'tbd') AND price_amount IS NULL AND price_currency IS NULL)
  )
);
CREATE INDEX idx_packages_status_position ON packages (status, position);

CREATE TABLE package_translations (
  package_id INTEGER NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT '',
  scope TEXT NOT NULL DEFAULT '',
  customization TEXT NOT NULL DEFAULT '',
  support TEXT NOT NULL DEFAULT '',
  price_note TEXT,
  includes_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(includes_json)),
  fits_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(fits_json)),
  deliverables_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(deliverables_json)),
  PRIMARY KEY (package_id, language)
);

CREATE TABLE extras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE CHECK (code GLOB '[a-z0-9]*' AND length(code) BETWEEN 2 AND 40),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  position INTEGER NOT NULL DEFAULT 0,
  price_kind TEXT NOT NULL DEFAULT 'quote' CHECK (price_kind IN ('quote', 'tbd', 'from')),
  price_amount INTEGER,
  price_currency TEXT CHECK (price_currency IN ('EUR', 'HUF')),
  vat_mode TEXT NOT NULL DEFAULT 'unspecified' CHECK (vat_mode IN ('unspecified', 'excluded', 'included', 'exempt')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (
    (price_kind = 'from' AND price_amount IS NOT NULL AND price_amount > 0 AND price_currency IS NOT NULL AND vat_mode <> 'unspecified')
    OR (price_kind IN ('quote', 'tbd') AND price_amount IS NULL AND price_currency IS NULL)
  )
);
CREATE INDEX idx_extras_status_position ON extras (status, position);

CREATE TABLE extra_translations (
  extra_id INTEGER NOT NULL REFERENCES extras (id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  name TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (extra_id, language)
);

-- Which needs an add-on can be put on (the visitor's vocabulary: see src/content/services/ids.ts).
CREATE TABLE extra_needs (
  extra_id INTEGER NOT NULL REFERENCES extras (id) ON DELETE CASCADE,
  need TEXT NOT NULL CHECK (need IN ('website', 'webapp', 'improve', 'ui', 'integrations', 'unsure')),
  PRIMARY KEY (extra_id, need)
);

-- Which needs a package is suggested for, and which add-ons it can carry: associations the admin manages.
CREATE TABLE package_needs (
  package_id INTEGER NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  need TEXT NOT NULL CHECK (need IN ('website', 'webapp', 'improve', 'ui', 'integrations', 'unsure')),
  PRIMARY KEY (package_id, need)
);

CREATE TABLE package_extras (
  package_id INTEGER NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  extra_id INTEGER NOT NULL REFERENCES extras (id) ON DELETE CASCADE,
  PRIMARY KEY (package_id, extra_id)
);
CREATE INDEX idx_package_extras_extra ON package_extras (extra_id);

-- The packages a service's page offers first, in order.
CREATE TABLE service_packages (
  service_id INTEGER NOT NULL REFERENCES services (id) ON DELETE CASCADE,
  package_id INTEGER NOT NULL REFERENCES packages (id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (service_id, package_id)
);
CREATE INDEX idx_service_packages_package ON service_packages (package_id);

-- Editable website content that is not a service or a package: the FAQ, text blocks, project presentation.
CREATE TABLE site_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('faq', 'text', 'project')),
  slug TEXT NOT NULL CHECK (slug GLOB '[a-z0-9]*' AND length(slug) BETWEEN 1 AND 60),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (type, slug)
);
CREATE INDEX idx_site_content_type_status ON site_content (type, status, position);

CREATE TABLE site_content_translations (
  content_id INTEGER NOT NULL REFERENCES site_content (id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data_json)),
  PRIMARY KEY (content_id, language)
);

-- ---------------------------------------------------------------------------------------------------- what visitors send

CREATE TABLE inquiries (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  kind TEXT NOT NULL CHECK (kind IN ('job', 'collaboration', 'project', 'other')),
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'answered', 'closed')),
  archived_at TEXT,
  consent_at TEXT,
  -- A keyed hash of the network address, for spotting abuse; the address itself is never stored.
  ip_hash TEXT,
  -- A hash of the normalised content, so the same message sent twice is recognised.
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_inquiries_status_created ON inquiries (status, created_at);
CREATE INDEX idx_inquiries_created ON inquiries (created_at);
CREATE INDEX idx_inquiries_archived ON inquiries (archived_at);
CREATE INDEX idx_inquiries_email ON inquiries (email);
CREATE INDEX idx_inquiries_dedupe ON inquiries (content_hash, created_at);

CREATE TABLE inquiry_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inquiry_id TEXT NOT NULL REFERENCES inquiries (id) ON DELETE CASCADE,
  author_id TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_inquiry_notes_inquiry ON inquiry_notes (inquiry_id, created_at);

CREATE TABLE quote_requests (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT,
  description TEXT NOT NULL,
  objective TEXT CHECK (objective IN ('present', 'leads', 'sell', 'process', 'improve', 'other')),
  reference_notes TEXT,
  timing TEXT CHECK (timing IN ('unsure', 'asap', 'weeks', 'months', 'flexible')),
  requirements TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'quoted', 'accepted', 'declined', 'closed')),
  archived_at TEXT,
  consent_at TEXT,
  ip_hash TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_quote_requests_status_created ON quote_requests (status, created_at);
CREATE INDEX idx_quote_requests_created ON quote_requests (created_at);
CREATE INDEX idx_quote_requests_archived ON quote_requests (archived_at);
CREATE INDEX idx_quote_requests_email ON quote_requests (email);
CREATE INDEX idx_quote_requests_dedupe ON quote_requests (content_hash, created_at);

-- One line of the visitor's cart. `plan` is a package code or 'custom'; `price_snapshot` is the approved price the
-- catalogue had when the request arrived (the request itself never carries a price).
CREATE TABLE quote_request_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_request_id TEXT NOT NULL REFERENCES quote_requests (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  need TEXT NOT NULL CHECK (need IN ('website', 'webapp', 'improve', 'ui', 'integrations', 'unsure')),
  service_id INTEGER REFERENCES services (id) ON DELETE RESTRICT,
  package_id INTEGER REFERENCES packages (id) ON DELETE RESTRICT,
  plan TEXT NOT NULL,
  price_snapshot TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(price_snapshot)),
  UNIQUE (quote_request_id, need)
);
CREATE INDEX idx_quote_request_items_request ON quote_request_items (quote_request_id, position);
CREATE INDEX idx_quote_request_items_service ON quote_request_items (service_id);
CREATE INDEX idx_quote_request_items_package ON quote_request_items (package_id);

CREATE TABLE quote_request_item_extras (
  item_id INTEGER NOT NULL REFERENCES quote_request_items (id) ON DELETE CASCADE,
  extra_id INTEGER NOT NULL REFERENCES extras (id) ON DELETE RESTRICT,
  PRIMARY KEY (item_id, extra_id)
);
CREATE INDEX idx_quote_request_item_extras_extra ON quote_request_item_extras (extra_id);

CREATE TABLE quote_request_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quote_request_id TEXT NOT NULL REFERENCES quote_requests (id) ON DELETE CASCADE,
  author_id TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_quote_request_notes_request ON quote_request_notes (quote_request_id, created_at);

-- ---------------------------------------------------------------------------------------------------- e-mail

-- The outbox and the delivery log in one: a row is queued, tried, and ends accepted (the provider took the
-- message: that is all that is ever claimed) or failed. The message is rendered from the related record at send
-- time, so no copy of its text is kept here.
CREATE TABLE email_deliveries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('inquiry_received', 'quote_received', 'inquiry_status', 'quote_status')),
  related_type TEXT NOT NULL CHECK (related_type IN ('inquiry', 'quote_request')),
  related_id TEXT NOT NULL,
  recipient TEXT NOT NULL,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  -- Text an administrator chose to add to a customer's status e-mail.
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'accepted', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  last_error TEXT,
  provider_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  accepted_at TEXT
);
CREATE INDEX idx_email_deliveries_due ON email_deliveries (status, next_attempt_at);
CREATE INDEX idx_email_deliveries_related ON email_deliveries (related_type, related_id);
CREATE INDEX idx_email_deliveries_created ON email_deliveries (created_at);
