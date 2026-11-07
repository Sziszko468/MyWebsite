-- PROMPT 09.1 (Shop 3.0): the tier comparison and the FULL EXPERIENCE offer as documents the administrator edits, and the
-- quote request that can carry a FULL EXPERIENCE brief.

-- One row per document: the comparison matrix (which features each package has, and how the tiers build on one another) and the
-- FULL EXPERIENCE offer (its copy, stages, components, configurator questions and options, budget ranges, FAQ). Both are JSON with
-- the text of every language in each leaf, validated by the server before it is stored (modules/shop/documents.ts). `draft_json` is
-- what the administrator is writing; `published_json` is what visitors see, set only by an explicit publish; a document with no
-- published copy is not public.
CREATE TABLE shop_documents (
  code TEXT PRIMARY KEY CHECK (code IN ('comparison', 'full_experience')),
  draft_json TEXT NOT NULL CHECK (json_valid(draft_json)),
  published_json TEXT CHECK (published_json IS NULL OR json_valid(published_json)),
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- A quote request is either one built from the catalogue (the cart: the lines in quote_request_items) or a FULL EXPERIENCE
-- request, which has no lines but a brief: the visitor's answers to the configurator, each stored with the question and the
-- option labels in every language as they were when it was sent, so the administrator reads the complete requirements even
-- after the questions were edited.
ALTER TABLE quote_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'catalogue' CHECK (kind IN ('catalogue', 'full_experience'));
ALTER TABLE quote_requests ADD COLUMN company TEXT;
ALTER TABLE quote_requests ADD COLUMN brief_json TEXT CHECK (brief_json IS NULL OR json_valid(brief_json));
