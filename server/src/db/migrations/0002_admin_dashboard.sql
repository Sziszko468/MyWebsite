-- migration: foreign-keys-off
-- What the administration dashboard (PROMPT 13) needs beyond the first schema. The runner turns foreign keys off
-- around this file because the first statement group rebuilds `inquiries`, which other tables refer to.

-- ---------------------------------------------------------------------------------------------------- inquiry statuses
-- New, In Progress, Waiting for Client, Completed (and Archived, which is `archived_at`, not a status: an archived
-- inquiry keeps the status it had). The old `answered` and `closed` become `waiting_client` and `completed`.

CREATE TABLE inquiries_rebuilt (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  kind TEXT NOT NULL CHECK (kind IN ('job', 'collaboration', 'project', 'other')),
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'waiting_client', 'completed')),
  archived_at TEXT,
  consent_at TEXT,
  ip_hash TEXT,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO inquiries_rebuilt (id, reference, language, kind, name, email, subject, message, status, archived_at, consent_at, ip_hash, content_hash, created_at, updated_at)
SELECT id, reference, language, kind, name, email, subject, message,
       CASE status WHEN 'answered' THEN 'waiting_client' WHEN 'closed' THEN 'completed' ELSE status END,
       archived_at, consent_at, ip_hash, content_hash, created_at, updated_at
FROM inquiries;

DROP TABLE inquiries;
ALTER TABLE inquiries_rebuilt RENAME TO inquiries;

CREATE INDEX idx_inquiries_status_created ON inquiries (status, created_at);
CREATE INDEX idx_inquiries_created ON inquiries (created_at);
CREATE INDEX idx_inquiries_archived ON inquiries (archived_at);
CREATE INDEX idx_inquiries_email ON inquiries (email);
CREATE INDEX idx_inquiries_dedupe ON inquiries (content_hash, created_at);

-- ---------------------------------------------------------------------------------------------------- a quote request and its inquiry
-- An administrator can say which inquiry a quote request belongs to (the same person writing twice). Deleting the
-- inquiry leaves the quote request, unlinked.
ALTER TABLE quote_requests ADD COLUMN inquiry_id TEXT REFERENCES inquiries (id) ON DELETE SET NULL;
CREATE INDEX idx_quote_requests_inquiry ON quote_requests (inquiry_id);

-- ---------------------------------------------------------------------------------------------------- administrator preferences
-- The language of the administration (hu or en) and its theme; NULL means "not chosen" (the browser's setting).
ALTER TABLE admin_users ADD COLUMN ui_language TEXT CHECK (ui_language IN ('hu', 'en'));
ALTER TABLE admin_users ADD COLUMN ui_theme TEXT CHECK (ui_theme IN ('light', 'dark'));

-- A session's public name, for the list of sign-ins an administrator can end: not the token and not its hash.
ALTER TABLE admin_sessions ADD COLUMN public_id TEXT;
UPDATE admin_sessions SET public_id = lower(hex(randomblob(8)));
CREATE UNIQUE INDEX idx_admin_sessions_public ON admin_sessions (public_id);

-- ---------------------------------------------------------------------------------------------------- settings
-- The few switches an administrator may change at run time (which notifications are sent). Secrets and server
-- configuration never go here: they are environment variables.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL
);
