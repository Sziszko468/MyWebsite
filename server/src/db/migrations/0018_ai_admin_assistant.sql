-- PROMPT 31 (AI ADMIN ASSISTANT): the administrator's own conversations with the read-only copilot, kept apart from the visitors'.
--
-- Additive: no existing table loses or changes a column's meaning.
--
-- Separation. A visitor's conversation belongs to an anonymous `ai_sessions` row; an administrator's belongs to an `admin_users` row. They live in
-- different tables, so a visitor's token can never reach an administrator's conversation (and the other way round), and the public assistant's
-- retention, listing and analytics never see these rows. The words of a conversation are deleted with the conversation (a hard delete: there is
-- no aggregate that needs the row), when the administrator deletes it or clears it, by retention, and when the administrator's account is deleted
-- (ON DELETE CASCADE). What stays after that is only the usage ledger (`ai_requests`), which holds numbers, never words.
--
-- A conversation has ONE context, fixed when it starts: the whole business, or one project, quote request, customer, conversation or consultation.
-- `context_ref` is that record's public reference (or, for a customer, its id); it is a reference, not an authorization: the server re-checks
-- access to it on every turn. Nothing else about the record (no name, no e-mail address) is stored here.

CREATE TABLE ai_admin_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES admin_users (id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  -- The administrator's first words, shortened: shown in their own history list, removed with the conversation.
  title TEXT,
  context_type TEXT NOT NULL DEFAULT 'general' CHECK (context_type IN ('general', 'project', 'quote', 'customer', 'conversation', 'consultation')),
  context_ref TEXT CHECK ((context_type = 'general' AND context_ref IS NULL) OR (context_type <> 'general' AND context_ref IS NOT NULL)),
  -- `active`, or `closed` when the conversation reached its length or time limit (it can be read and deleted, not continued).
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  message_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ai_admin_conversations_user ON ai_admin_conversations (user_id, updated_at);
CREATE INDEX ai_admin_conversations_created ON ai_admin_conversations (created_at);

CREATE TABLE ai_admin_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_admin_conversations (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message_json TEXT NOT NULL CHECK (json_valid(message_json)),
  created_at TEXT NOT NULL,
  UNIQUE (conversation_id, seq)
);

-- The usage ledger and the tool statistics are shared (one budget protects the money), but every row says WHO it was for, so the public assistant's
-- analytics can leave the administrators' requests out and the administration's own numbers can leave the visitors' out. `admin_user_id` is the
-- administrator a request was made for (a per-administrator rate limit counts it); it has no foreign key on purpose: deleting an account must
-- never change what was spent.
ALTER TABLE ai_requests ADD COLUMN audience TEXT NOT NULL DEFAULT 'visitor' CHECK (audience IN ('visitor', 'admin'));
ALTER TABLE ai_requests ADD COLUMN admin_user_id TEXT;
CREATE INDEX ai_requests_admin ON ai_requests (admin_user_id, created_at);
ALTER TABLE ai_tool_calls ADD COLUMN audience TEXT NOT NULL DEFAULT 'visitor' CHECK (audience IN ('visitor', 'admin'));
