-- Operational hardening (PROMPT 25): what the server remembers about its own backups.
--
-- Why 0040 and not 0012: the branches that follow this one already use 0012 (client portal) and 0013 (project management), and the
-- deployment branch uses 0030 (Gmail). The runner refuses two files with one version, and a migration that has been applied can never be
-- renamed, so this one was numbered clear of all of them. Versions need not be consecutive; they are applied in order.
--
-- One row per backup attempt. It records facts about the backup, never its content, and never a credential: how many files and bytes,
-- the SHA-256 of the database as it was backed up and of the manifest that lists every file, whether it was encrypted, and (when it
-- failed) a category from a fixed list and an HTTP status, never the text of an answer.

CREATE TABLE backup_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- scheduled: the daily run. startup: the catch-up after a start with no recent success. manual: reserved (no screen starts one yet).
  run_trigger TEXT NOT NULL CHECK (run_trigger IN ('scheduled', 'startup', 'manual')),
  -- running: a row left running when the process stopped is turned into `failed` (interrupted) at the next start.
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  -- The dated folder on the destination (a day, `2026-11-16`).
  folder TEXT,
  -- Database and pictures; the manifest is not counted. `total_bytes` is what was stored (after encryption, if any).
  file_count INTEGER NOT NULL DEFAULT 0 CHECK (file_count >= 0),
  total_bytes INTEGER NOT NULL DEFAULT 0 CHECK (total_bytes >= 0),
  database_sha256 TEXT,
  manifest_sha256 TEXT,
  encrypted INTEGER NOT NULL DEFAULT 0 CHECK (encrypted IN (0, 1)),
  error_category TEXT,
  http_status INTEGER
);
CREATE INDEX idx_backup_runs_status_finished ON backup_runs (status, finished_at);
CREATE INDEX idx_backup_runs_started ON backup_runs (started_at);
