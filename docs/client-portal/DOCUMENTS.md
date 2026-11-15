# Client portal: documents

## Status: the model and the authorization exist; **publishing is switched off**

The brief asks for customer-visible project documents (a brief, approved designs, deliverables) that are private by default, explicitly associated, authorized on every request, never listed publicly, never reachable by a predictable URL, never exposing a server path or a storage credential, and **no new cloud storage provider**. The site has no suitable place to keep a private file: the media module stores **public** pictures under predictable names. So this work built the table and the authorization, and refuses to publish; it did not invent a store.

## The model

`client_documents (id, project_id, title, kind, file_name, mime_type, size_bytes, storage_key, published_at, created_by, created_at)`:

- **Private by default**: `published_at IS NULL` means no customer can see it, ever.
- **Explicit association**: a document belongs to one project, which belongs to one customer; there is no other path to it.
- **`storage_key` is an opaque key** in a store that does not exist yet. It is never a path or an address, and it is never in any answer (a test reads the answer of an authorized download and the list, and searches for it).
- **The database refuses what is not yet possible**: `CHECK (published_at IS NULL OR storage_key IS NOT NULL)`. Nothing can be marked published without a place for the bytes, whatever code (or person with a SQLite shell) tries (a test).

## The authorization (every request)

`GET /api/portal/documents` lists the signed-in customer's published documents (title, kind, file facts, the project's name and reference). `GET /api/portal/documents/:id/download` runs `documentFor(app, customerId, documentId)`: the document must belong to a project of **this** customer **and** be published; otherwise `404` with the same body as a document that does not exist (a test compares them). Only then does it ask the file store, and the only store there is (`NO_DOCUMENT_STORE`) answers `503 service_unavailable` with no detail.

The administration: `POST /api/admin/client-projects/:id/documents/:documentId/publish` always answers `409 conflict` with `reason: storage_unavailable`; the screen says files cannot be shared yet. A customer **cannot upload** anything: there is no such address.

## What the customer sees

The Documents page shows the published documents (none, today) and, whenever the feature is not available, a sentence saying so honestly: "Downloading files from this page is not available yet. If you need a document, write to us." The portal never claims a file was shared.

## What it takes to switch it on (not done here)

1. **Choose a private store** (the owner's decision: a private bucket, a protected volume, the existing Google Drive credentials used differently…) and its cost, region, backup and erasure rules; do **not** put files under `STATIC_DIR` or `MEDIA_DIR`.
2. **Implement `DocumentStore.open(storageKey)`** (`modules/customers/portal.ts`) and an upload path for the administration (size limit, type allow-list, a virus-scan decision, the file name never used as a path).
3. **Let `publishProjectDocument` set `published_at`** (the constraint then allows it), write the `document_published` event and queue `client_document_published` (the e-mail and its template already exist).
4. **Stream** the file with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`, after the same authorization.
5. Extend **erasure** and the **privacy notice** (the notice now says the site stores no file shared with the customer; that sentence must change at the same moment), and the backup's scope.
6. Re-run the authorization tests with real bytes.

## Why not now

A file store is infrastructure with a cost, a legal footprint (the notice, the processors, the erasure) and a security surface (uploads) that the brief itself says not to invent. A half-built one would be worse than none.
