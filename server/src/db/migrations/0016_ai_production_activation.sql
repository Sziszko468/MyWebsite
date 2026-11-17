-- PROMPT 29 (CONTROL ROOM AI: production activation and secure runtime integration).
--
-- Additive only: three columns on the usage rows and one table of counters. Nothing here holds a key, a prompt, an answer or anything a visitor
-- wrote: identifiers, codes, counts and timestamps. Nothing is created for anybody and no existing row changes.

-- The HTTP request id (the `X-Request-Id` the server returned) that started the model request, so an administrator can follow one request from the
-- visitor's report ("request id …") through the server's log to the usage row. It is a random id, never derived from the visitor.
ALTER TABLE ai_requests ADD COLUMN correlation_id TEXT;

-- Why the model stopped, as the provider reported it, mapped by the AI SDK: stop, length, tool-calls, content-filter, error, other. NULL: it never
-- reported one (the request failed or was cancelled first). `length` means the answer hit the output limit and was cut off.
ALTER TABLE ai_requests ADD COLUMN finish_reason TEXT;

-- What is known about the COST of the request, which is not the same as what is counted against the budget:
--   reported  the provider reported token counts; the cost is an estimate from those counts and the configured prices (never a bill)
--   none      the provider never answered (it failed before any usage); the request cost nothing and counts nothing
--   unknown   the request ended (cancelled, timed out, abandoned, a stream that broke) without the provider reporting usage, so what it really cost is
--             not known; the budget keeps counting the amount reserved for it (an upper bound), and the administration says the cost is unknown
-- NULL: a row written before this column existed (the screens derive the same three states from `cost_source` and `status`).
ALTER TABLE ai_requests ADD COLUMN cost_state TEXT CHECK (cost_state IN ('reported', 'none', 'unknown'));
CREATE INDEX ai_requests_correlation ON ai_requests (correlation_id);

-- Counters of the times a limit stopped a visitor, per day and kind (an address' rate limit, a session's limit, a busy conversation, the global
-- concurrency limit, a budget). Counts only: not who, not what they wrote, not from where.
CREATE TABLE ai_limit_events (
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  last_at TEXT NOT NULL,
  PRIMARY KEY (day, kind)
);
