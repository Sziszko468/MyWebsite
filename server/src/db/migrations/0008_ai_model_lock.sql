-- PROMPT 16.1 (strict Claude Haiku 5.5 production integration): the evidence that the assistant really ran on the required model,
-- the connection tests an administrator ran, and the alerts the assistant raises for the administration.
--
-- Nothing here holds a key, a prompt, an answer or anything a visitor wrote: identifiers, codes, counts and timestamps only.

-- What the provider said answered each request. NULL: the provider reported nothing for it (so it is not counted as verified).
-- `model_verified` is 1 only when the reported identifier is exactly the required one.
ALTER TABLE ai_requests ADD COLUMN actual_model TEXT;
ALTER TABLE ai_requests ADD COLUMN model_verified INTEGER NOT NULL DEFAULT 0 CHECK (model_verified IN (0, 1));

-- Every connection test, from the administration or the command line: a minimal request to the required model and what came back.
CREATE TABLE ai_connection_tests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  actor_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('verified', 'failed')),
  -- A short code (no_api_key, invalid_key, model_not_found, model_mismatch, ...), never a provider message.
  reason TEXT,
  requested_model TEXT NOT NULL,
  reported_model TEXT,
  -- The host of the provider address that was used (not the path, never a key).
  endpoint TEXT NOT NULL,
  latency_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL
);
CREATE INDEX ai_connection_tests_created ON ai_connection_tests (created_at);

-- Alerts for the administration: a budget threshold reached, the model not verified, the provider refusing the key or the account.
-- One alert per kind per period (a day or a month), so a threshold that stays exceeded does not raise a new alert on every request.
CREATE TABLE ai_alerts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('info', 'warning', 'critical')),
  period TEXT NOT NULL,
  -- JSON with numbers and codes only.
  detail TEXT,
  created_at TEXT NOT NULL,
  acknowledged_at TEXT,
  acknowledged_by TEXT,
  UNIQUE (kind, period)
);
CREATE INDEX ai_alerts_created ON ai_alerts (created_at);
