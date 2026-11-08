-- PROMPT 16 (CONTROL ROOM AI): the assistant's anonymous sessions, the conversations it keeps for a short time, what each model
-- request cost (and the budget reserved for it before it started), which tools it called, and the approvals a visitor gives
-- before a project plan becomes a quote request.
--
-- Privacy shape: a visitor is an anonymous session (a random id; the address is only kept as a keyed hash). The words of a
-- conversation (`ai_messages`, the title, the plan) are deleted when the visitor deletes the conversation and after the
-- configured retention; what stays is counts, timestamps, the language, a coarse topic and token numbers, none of which
-- contain anything the visitor wrote. Usage rows have no foreign key to the conversation on purpose: deleting a conversation
-- must never change what was spent.

CREATE TABLE ai_sessions (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ai_sessions_ip ON ai_sessions (ip_hash, created_at);

CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES ai_sessions (id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  -- The visitor's first words, shortened: shown in their own history list, removed with the conversation.
  title TEXT,
  -- A coarse category derived from the tools that were used, never from the text: portfolio, services, packages,
  -- full_experience, profile, planner, general.
  topic TEXT NOT NULL DEFAULT 'general',
  -- The project plan being built in this conversation (structured, validated by the server).
  plan_json TEXT CHECK (plan_json IS NULL OR json_valid(plan_json)),
  plan_version INTEGER NOT NULL DEFAULT 0,
  message_count INTEGER NOT NULL DEFAULT 0,
  planner_completed_at TEXT,
  quote_reference TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  -- Set when the visitor deletes the conversation or retention removes its words; the row stays for the aggregates.
  deleted_at TEXT
);
CREATE INDEX ai_conversations_session ON ai_conversations (session_id, updated_at);
CREATE INDEX ai_conversations_created ON ai_conversations (created_at);

-- The conversation as the server will replay it to the model: the server's own copy, never the browser's.
CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations (id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  message_json TEXT NOT NULL CHECK (json_valid(message_json)),
  created_at TEXT NOT NULL,
  UNIQUE (conversation_id, seq)
);

-- One row per model request: it is born as a budget reservation and is reconciled with what the provider reported.
CREATE TABLE ai_requests (
  id TEXT PRIMARY KEY,
  conversation_id TEXT,
  session_id TEXT,
  ip_hash TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('reserved', 'completed', 'failed', 'aborted', 'abandoned')),
  reserved_cost_usd REAL NOT NULL,
  reserved_tokens INTEGER NOT NULL DEFAULT 0,
  -- Estimated from the token counts the provider reported and the configured prices: not a bill.
  actual_cost_usd REAL,
  cost_source TEXT CHECK (cost_source IN ('provider_usage', 'estimate')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_tokens INTEGER,
  cache_write_tokens INTEGER,
  reasoning_tokens INTEGER,
  steps INTEGER,
  tool_calls INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  latency_ms INTEGER,
  first_token_ms INTEGER,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX ai_requests_day ON ai_requests (day, status);
CREATE INDEX ai_requests_session ON ai_requests (session_id, created_at);
CREATE INDEX ai_requests_created ON ai_requests (created_at);

CREATE TABLE ai_tool_calls (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  conversation_id TEXT,
  tool TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'error', 'rejected')),
  duration_ms INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ai_tool_calls_day ON ai_tool_calls (day, tool);

-- A visitor's explicit "send this" on the plan they were shown. The tool that submits a request needs one that matches the
-- plan as it is now and the contact details it is called with; it is used once. The contact details are removed when it is
-- used or expires (the quote request holds them from then on).
CREATE TABLE ai_approvals (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_conversations (id) ON DELETE CASCADE,
  plan_version INTEGER NOT NULL,
  plan_hash TEXT NOT NULL,
  name TEXT,
  email TEXT,
  company TEXT,
  consent_at TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  quote_reference TEXT
);
CREATE INDEX ai_approvals_conversation ON ai_approvals (conversation_id, created_at);

-- Where a quote request was written: the website's own forms or the assistant. (`kind` still says what carries it: the
-- cart's lines or a brief.)
ALTER TABLE quote_requests ADD COLUMN source TEXT NOT NULL DEFAULT 'website' CHECK (source IN ('website', 'ai_assistant'));
