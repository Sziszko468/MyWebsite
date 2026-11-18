-- PROMPT 30 (AI PROJECT DISCOVERY): the structured state behind the assistant's project discovery: what the visitor wants to build, what is
-- known about it and who said so, the requirements, and the plan versions that were generated from them.
--
-- Additive and EXTENDING: nothing here duplicates conversation storage. Every table hangs off `ai_conversations` (the conversation, its owner
-- session and its retention are the existing ones) through `ai_discovery`, which has one row per conversation that started a discovery. The
-- words in these tables are the visitor's and the assistant's, exactly like `ai_messages`: they are deleted with the conversation (the
-- application deletes the `ai_discovery` row, which cascades) and by the same retention. Nothing here holds contact details, a price or a key.
--
-- What is stored as DATA (enumerations the server validates), not as conversation text: the stage, the project type, the priorities, the
-- statuses, the complexity signals. The assistant proposes, the server validates, the visitor confirms: `origin` says who wrote a value and
-- `confirmed` / `status` says whether the visitor accepted it. A value the visitor wrote or confirmed is never overwritten by the assistant.

CREATE TABLE ai_discovery (
  conversation_id TEXT PRIMARY KEY REFERENCES ai_conversations (id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'idea' CHECK (stage IN ('idea', 'type', 'goal', 'audience', 'requirements', 'features', 'infrastructure', 'complexity', 'budget', 'timeline', 'maintenance', 'summary', 'plan')),
  -- The classification. `other` is "Other / not sure": the visitor can always choose it.
  project_type TEXT CHECK (project_type IS NULL OR project_type IN ('portfolio', 'business_site', 'ecommerce', 'booking', 'web_app', 'saas', 'dashboard', 'api_backend', 'redesign', 'custom_product', 'other')),
  type_origin TEXT CHECK (type_origin IS NULL OR type_origin IN ('visitor', 'assistant')),
  type_confirmed INTEGER NOT NULL DEFAULT 0 CHECK (type_confirmed IN (0, 1)),
  -- Stages the visitor chose to skip (a JSON array of stage ids): optional questions are never forced.
  skipped TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(skipped)),
  -- The complexity signals ({"roles": {"value": "few", "origin": "assistant"}, ...}); the assessment is computed from these and the requirements.
  signals TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(signals)),
  -- 1 when something the plan is built from changed after the last plan version was made: the plan must be regenerated before it is sent.
  plan_stale INTEGER NOT NULL DEFAULT 1 CHECK (plan_stale IN (0, 1)),
  -- Optimistic concurrency of the working draft: every change adds one (a draft nobody has changed is version 0), and a change that names an older version is refused (409).
  version INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- What the visitor said about the project, one row per question. `origin` is who wrote the value; `confirmed` is the visitor's own
-- acceptance. The visitor's edits are origin 'visitor' and confirmed; the assistant's are origin 'assistant' and unconfirmed.
CREATE TABLE ai_discovery_facts (
  conversation_id TEXT NOT NULL REFERENCES ai_discovery (conversation_id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK (key IN ('projectName', 'objective', 'problem', 'audience', 'existingSite', 'budget', 'timeline', 'maintenance')),
  value TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('visitor', 'assistant')),
  confirmed INTEGER NOT NULL DEFAULT 0 CHECK (confirmed IN (0, 1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, key)
);

-- The structured requirements. An assistant suggestion is born 'unconfirmed' and is never counted as confirmed until the visitor says so.
CREATE TABLE ai_discovery_requirements (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_discovery (conversation_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN ('content', 'design', 'accounts', 'commerce', 'booking', 'data', 'integration', 'admin', 'communication', 'automation', 'security', 'performance', 'localization', 'other')),
  priority TEXT NOT NULL CHECK (priority IN ('essential', 'important', 'optional', 'future')),
  -- Required or optional, as its own question (an essential requirement is always required; a future consideration never is).
  required INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0, 1)),
  origin TEXT NOT NULL CHECK (origin IN ('visitor', 'assistant')),
  -- For an assistant requirement: whether the assistant says the visitor STATED it, or suggests it itself. The interface labels the two differently.
  basis TEXT NOT NULL CHECK (basis IN ('stated', 'suggested')),
  status TEXT NOT NULL CHECK (status IN ('unconfirmed', 'confirmed', 'rejected')),
  complexity TEXT NOT NULL CHECK (complexity IN ('low', 'medium', 'high')),
  -- Ids of other requirements of the same conversation (a JSON array).
  depends_on TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(depends_on)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ai_discovery_requirements_conversation ON ai_discovery_requirements (conversation_id, position);

-- The plan versions: IMMUTABLE snapshots. A version is made by "generate" or "regenerate" (the visitor's button or the assistant's tool) and is
-- never edited afterwards; the quote request that is sent preserves the version it was approved at. `content_hash` is what an approval binds to.
CREATE TABLE ai_discovery_plans (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES ai_discovery (conversation_id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content TEXT NOT NULL CHECK (json_valid(content)),
  content_hash TEXT NOT NULL,
  origin TEXT NOT NULL CHECK (origin IN ('visitor', 'assistant')),
  -- Why the version was made: 'generate' or 'regenerate' with the sections, as a short code string.
  reason TEXT NOT NULL,
  -- What changed against the version before it (counts and section names, as JSON): the revision history the interface shows.
  summary TEXT NOT NULL CHECK (json_valid(summary)),
  created_at TEXT NOT NULL,
  UNIQUE (conversation_id, version)
);
CREATE INDEX ai_discovery_plans_conversation ON ai_discovery_plans (conversation_id, version);

-- The visitor's own notes on a plan section: they survive every regeneration (a regenerated section never loses what the visitor wrote).
CREATE TABLE ai_discovery_notes (
  conversation_id TEXT NOT NULL REFERENCES ai_discovery (conversation_id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('overview', 'requirements', 'architecture', 'phases', 'risks', 'next_steps')),
  note TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (conversation_id, section)
);
