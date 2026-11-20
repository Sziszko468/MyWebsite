-- PROMPT 33 (CONTROLLED AI AUTOMATION): approval-gated administrative actions prepared by the admin assistant, and the history of every one of them.
--
-- Additive: no existing table loses or changes a column's meaning.
--
-- The assistant never changes anything. It PROPOSES an action (a row here, status `awaiting_approval`); a human administrator approves it with a dedicated control; the SERVER then
-- re-checks everything and executes it through the existing business functions. This file holds the proposal, its frozen content and its lifecycle; the business tables are
-- written only by those existing functions, never by this file's tables.
--
-- Lifecycle (every move is checked in the server AND here, by the trigger below):
--   proposed -> awaiting_approval -> approved -> executing -> completed
--   and `rejected`, `expired`, `cancelled`, `failed`. The five last-named and `completed` are final: a final row cannot be changed at all.
--
-- Frozen content. What an approval is bound to (the action type, the target record, the parameters, the reason, the preview the administrator saw, the state of the target when it
-- was proposed, the expiry) is written once and can never be updated (trigger). `payload_hash` is the SHA-256 of the canonical payload: the approval carries it, and the
-- execution recomputes it from the stored payload, so a row edited by hand cannot be executed.
--
-- History. `ai_action_events` is append-only (triggers refuse UPDATE and DELETE), one row per lifecycle step, each saying WHO did it (`ai` proposed, `admin` decided, `server`
-- executed) and chained to the previous one by a hash, so a missing, edited or reordered line is detectable. It holds codes, hashes and references: never a session, a key, an
-- e-mail address or a customer's words. (The proposal's own text, a draft or a note, is in `payload_json`; the privacy and retention consequences are in docs/ai-automation.)
--
-- No foreign key to `admin_users`: deleting an account must never delete what was approved in its name. The administrator's id stays; the name is looked up and may be gone.

CREATE TABLE ai_actions (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  action_type TEXT NOT NULL CHECK (action_type IN ('communication.draft_reply', 'project.note_add', 'project.status_change', 'quote_request.triage_status', 'consultation.close_days')),
  status TEXT NOT NULL CHECK (status IN ('proposed', 'awaiting_approval', 'approved', 'executing', 'completed', 'rejected', 'expired', 'cancelled', 'failed')),

  -- Whose conversation it came from. `admin_id` is the administrator the assistant was working for; `conversation_id` has no foreign key (a conversation may be deleted).
  admin_id TEXT NOT NULL,
  conversation_id TEXT,
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),

  -- The target record: its kind, internal id and public reference. The hours of the consultations are one record without either.
  target_type TEXT NOT NULL CHECK (target_type IN ('conversation', 'project', 'quote_request', 'booking_hours')),
  target_id TEXT,
  target_ref TEXT,

  -- Frozen at proposal time (see the triggers below).
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  payload_hash TEXT NOT NULL,
  preview_json TEXT NOT NULL CHECK (json_valid(preview_json)),
  fingerprint TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  requires_second_confirmation INTEGER NOT NULL CHECK (requires_second_confirmation IN (0, 1)),
  expires_at TEXT NOT NULL,
  -- A retry of a failed action is a NEW row that points at the one it retries.
  retry_of TEXT REFERENCES ai_actions (id),

  -- The decision and the execution.
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT,
  approved_hash TEXT,
  approval_key TEXT,
  second_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (second_confirmed IN (0, 1)),
  started_at TEXT,
  finished_at TEXT,
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  failure_code TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX ai_actions_status ON ai_actions (status, expires_at);
CREATE INDEX ai_actions_admin ON ai_actions (admin_id, created_at);
CREATE INDEX ai_actions_target ON ai_actions (target_type, target_ref);
CREATE INDEX ai_actions_created ON ai_actions (created_at);
-- The same proposal (same administrator, conversation, type, target and parameters) cannot be pending twice: a model that asks twice gets the first proposal back.
CREATE UNIQUE INDEX ai_actions_one_live ON ai_actions (idempotency_key) WHERE status IN ('proposed', 'awaiting_approval', 'approved', 'executing');

-- A row is final in one of six states and then never changes again.
CREATE TRIGGER ai_actions_final_is_final BEFORE UPDATE ON ai_actions
WHEN OLD.status IN ('completed', 'rejected', 'expired', 'cancelled', 'failed')
BEGIN
  SELECT RAISE(ABORT, 'a finished action cannot change');
END;

-- Only the moves of the lifecycle are possible.
CREATE TRIGGER ai_actions_valid_move BEFORE UPDATE OF status ON ai_actions
WHEN NEW.status <> OLD.status AND NOT (
  (OLD.status = 'proposed' AND NEW.status IN ('awaiting_approval', 'failed', 'cancelled')) OR
  (OLD.status = 'awaiting_approval' AND NEW.status IN ('approved', 'rejected', 'cancelled', 'expired', 'failed')) OR
  (OLD.status = 'approved' AND NEW.status IN ('executing', 'failed')) OR
  (OLD.status = 'executing' AND NEW.status IN ('completed', 'failed'))
)
BEGIN
  SELECT RAISE(ABORT, 'invalid action transition');
END;

-- What an approval is bound to is written once.
CREATE TRIGGER ai_actions_frozen BEFORE UPDATE OF reference, action_type, admin_id, conversation_id, language, target_type, target_id, target_ref, payload_json, payload_hash, preview_json, fingerprint, idempotency_key, requires_second_confirmation, expires_at, retry_of, created_at ON ai_actions
BEGIN
  SELECT RAISE(ABORT, 'the content of an action is frozen');
END;

-- Nothing is ever deleted.
CREATE TRIGGER ai_actions_no_delete BEFORE DELETE ON ai_actions
BEGIN
  SELECT RAISE(ABORT, 'actions are never deleted');
END;

CREATE TABLE ai_action_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id TEXT NOT NULL REFERENCES ai_actions (id),
  seq INTEGER NOT NULL,
  -- proposal_created (ai) · submitted (server) · approval_granted (admin) · rejected (admin) · cancelled (admin) · expired (server) · approval_invalidated (server)
  -- · execution_started (server) · execution_succeeded (server) · execution_failed (server)
  kind TEXT NOT NULL CHECK (kind IN ('proposal_created', 'submitted', 'approval_granted', 'rejected', 'cancelled', 'expired', 'approval_invalidated', 'execution_started', 'execution_succeeded', 'execution_failed')),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('ai', 'admin', 'server')),
  -- The administrator an `ai` proposal was made for, or who decided; null for the server.
  actor_id TEXT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  -- Codes and counts only (at most 500 characters): never a text, an address, a session or a key.
  detail_json TEXT CHECK (detail_json IS NULL OR (json_valid(detail_json) AND length(detail_json) <= 500)),
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (action_id, seq)
);

CREATE INDEX ai_action_events_action ON ai_action_events (action_id, seq);
CREATE INDEX ai_action_events_created ON ai_action_events (created_at);

CREATE TRIGGER ai_action_events_no_update BEFORE UPDATE ON ai_action_events
BEGIN
  SELECT RAISE(ABORT, 'the history of an action is append-only');
END;

CREATE TRIGGER ai_action_events_no_delete BEFORE DELETE ON ai_action_events
BEGIN
  SELECT RAISE(ABORT, 'the history of an action is append-only');
END;
