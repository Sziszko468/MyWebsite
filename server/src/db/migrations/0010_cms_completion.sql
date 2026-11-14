-- PROMPT 22 (portfolio CMS completion): two additions, nothing rebuilt, nothing removed.
--
--   * `project_preview_tokens`: a link an administrator can send to somebody without an account so they can read ONE project in any state
--     (a draft, for a client's approval). Only the SHA-256 of the secret is stored, so a copy of the database opens nothing; a link has
--     an end date (the application caps it at 30 days), can be revoked, and goes with the project when the project is deleted.
--   * `media.alt_json`: the description of a picture in each language, kept with the picture in the library (the editor offers it when the
--     picture is put on a project; the description a project uses stays its own, in the project's document).

CREATE TABLE project_preview_tokens (
  id TEXT PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  last_used_at TEXT
);
CREATE INDEX idx_preview_tokens_project ON project_preview_tokens (project_id, created_at);
CREATE INDEX idx_preview_tokens_expires ON project_preview_tokens (expires_at);

ALTER TABLE media ADD COLUMN alt_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(alt_json));
