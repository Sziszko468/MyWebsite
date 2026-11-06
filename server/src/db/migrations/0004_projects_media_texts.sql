-- The content management of the portfolio (PROMPT 13.1): projects, the images they use, and the wording an administrator may
-- override. Three tables, nothing rebuilt: the catalogue (services, packages, add-ons, FAQ) keeps the tables it has.
--
--   * `projects`: one row per project. What is searched, filtered and ordered by is a column (slug, status, featured, position,
--     category); everything a visitor reads is ONE JSON document (`content_json`) whose texts are `{ hu, en, nl }` objects, the
--     same shape the website's own project pages already have (src/content/projectDetails/types.ts), so the seed is a plain copy
--     and the page needs no translation layer. The document is validated in full before it is written (modules/projects/content.ts).
--     `site_content.type = 'project'` (migration 0001) was never used and has neither a publication state nor a featured flag;
--     it is left alone.
--   * `media`: the images. An upload is a file in the media directory (never a blob in the database), named by its own hash, so a
--     replaced image is a new file and the old address keeps working. `storage = 'public'` rows describe images that ship with the
--     website (public/projects/...): the existing screenshots appear in the same picker and cannot be deleted.
--   * `text_overrides`: a wording the administrator changed (a headline, a button label, a configurator question), per language.
--     No row = the website's own wording. The keys that may be overridden are listed in server/seed/texts.manifest.json.

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE CHECK (slug GLOB '[a-z0-9]*' AND length(slug) BETWEEN 2 AND 60),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  position INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'web' CHECK (length(category) BETWEEN 2 AND 40),
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_projects_status_position ON projects (status, position);

CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  storage TEXT NOT NULL CHECK (storage IN ('upload', 'public')),
  -- upload: the file's name in the media directory; public: the root-relative address of a file shipped with the website.
  path TEXT NOT NULL CHECK (length(path) BETWEEN 3 AND 200),
  mime TEXT NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif')),
  bytes INTEGER NOT NULL CHECK (bytes > 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  sha256 TEXT NOT NULL,
  original_name TEXT,
  created_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  UNIQUE (storage, path)
);

CREATE TABLE text_overrides (
  key TEXT NOT NULL CHECK (length(key) BETWEEN 3 AND 120),
  language TEXT NOT NULL CHECK (language IN ('hu', 'en', 'nl')),
  value TEXT NOT NULL CHECK (length(value) BETWEEN 1 AND 800),
  updated_at TEXT NOT NULL,
  updated_by TEXT REFERENCES admin_users (id) ON DELETE SET NULL,
  PRIMARY KEY (key, language)
);
