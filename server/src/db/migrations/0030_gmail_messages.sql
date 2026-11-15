-- Gmail, step 3: the mailbox's incoming messages, kept as a conversation history, and where the synchronisation stands.
--
-- Why 0030 and not 0009: the feature branches of this repository already use 0009 to 0013 for other tables (quote integration, CMS,
-- booking, client portal, project management). The runner refuses two files with one version, and a migration that has been applied
-- can never be renamed, so this one was numbered clear of them. Versions need not be consecutive; they are applied in order.
--
-- What is stored, and what is not: the decoded plain-text body (an HTML-only message is converted to text, never kept as HTML), the
-- addresses and the headers that tie a message to a conversation, and attachment METADATA (name, type, size). The raw MIME payload,
-- the HTML, the attachments themselves and every credential or token are never stored.

CREATE TABLE gmail_messages (
  id TEXT PRIMARY KEY,
  -- Gmail's own id: what makes an import idempotent. A message that is already here is never imported again.
  gmail_message_id TEXT NOT NULL UNIQUE,
  gmail_thread_id TEXT NOT NULL,
  -- The message's own `Message-ID` header, so a later reply (`In-Reply-To` / `References`) can be tied to it.
  rfc_message_id TEXT,
  -- `inbound`: from someone else. `outbound`: sent from the mailbox itself (kept for the sent mail a later step may import).
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  sender_address TEXT NOT NULL COLLATE NOCASE,
  sender_name TEXT NOT NULL DEFAULT '',
  -- [{ "address", "name", "type": "to" | "cc" }]
  recipients_json TEXT NOT NULL DEFAULT '[]',
  subject TEXT NOT NULL DEFAULT '',
  body_text TEXT NOT NULL DEFAULT '',
  -- The body was longer than the limit and was cut, or part of it could not be read.
  body_truncated INTEGER NOT NULL DEFAULT 0 CHECK (body_truncated IN (0, 1)),
  -- When Gmail received it (its `internalDate`), which the sender cannot choose. `sent_at` is the `Date` header: the sender's claim.
  received_at TEXT NOT NULL,
  sent_at TEXT,
  in_reply_to TEXT,
  references_json TEXT NOT NULL DEFAULT '[]',
  -- [{ "partId", "filename", "mimeType", "size", "inline" }]. Metadata only: nothing is downloaded or served.
  attachments_json TEXT NOT NULL DEFAULT '[]',

  -- The request this message belongs to, if any: at most one of the two. Two real foreign keys instead of a (type, id) pair, so the
  -- database itself refuses an association to something that does not exist, and ON DELETE SET NULL says what deleting a request
  -- does: the message (a copy of what is in the mailbox) stays, back in the pool of messages waiting for an association. Nothing
  -- cascades, so deleting a request can never delete mail or touch an unrelated row.
  inquiry_id TEXT REFERENCES inquiries (id) ON DELETE SET NULL,
  quote_request_id TEXT REFERENCES quote_requests (id) ON DELETE SET NULL,
  -- How the association was made. NULL with `association_locked` = 1 means an administrator took the message off its request on
  -- purpose (it is not "pending" and no automatic rule may put it back).
  association_source TEXT CHECK (association_source IN ('thread', 'reference', 'sender', 'manual')),
  association_locked INTEGER NOT NULL DEFAULT 0 CHECK (association_locked IN (0, 1)),
  imported_at TEXT NOT NULL,
  CHECK (inquiry_id IS NULL OR quote_request_id IS NULL)
);
CREATE INDEX idx_gmail_messages_thread ON gmail_messages (gmail_thread_id);
CREATE INDEX idx_gmail_messages_received ON gmail_messages (received_at);
CREATE INDEX idx_gmail_messages_sender ON gmail_messages (sender_address);
CREATE INDEX idx_gmail_messages_rfc ON gmail_messages (rfc_message_id) WHERE rfc_message_id IS NOT NULL;
CREATE INDEX idx_gmail_messages_inquiry ON gmail_messages (inquiry_id, received_at) WHERE inquiry_id IS NOT NULL;
CREATE INDEX idx_gmail_messages_quote_request ON gmail_messages (quote_request_id, received_at) WHERE quote_request_id IS NOT NULL;
CREATE INDEX idx_gmail_messages_unassigned ON gmail_messages (received_at) WHERE inquiry_id IS NULL AND quote_request_id IS NULL;

-- One row: where the last synchronisation stands. No cursor is kept on purpose: a run looks at a recent window of the inbox and skips what
-- is already stored (the unique Gmail id), so a run that stopped half way, or a restart, loses nothing and repeats nothing.
CREATE TABLE gmail_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  last_attempt_at TEXT,
  -- The last run that was not cut short by an error of the whole run.
  last_success_at TEXT,
  -- A category (never a message from Google or from the network): why the last run did not complete, or `partial_failure`.
  last_error TEXT,
  last_imported INTEGER NOT NULL DEFAULT 0,
  last_failed INTEGER NOT NULL DEFAULT 0
);
INSERT INTO gmail_sync_state (id) VALUES (1);
