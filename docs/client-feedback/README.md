# Feedback, approval and preview (PROMPT 27)

The client portal ([../client-portal/](../client-portal/README.md)) and the project workspace ([../project-management/](../project-management/README.md)) now have a way to **share something with one customer for review**: a website preview, a design, a picture, a document, a prototype. The customer opens a **private** page, looks at it, gives **general or position-specific feedback**, asks for changes, or **approves one exact version**. The owner answers, makes a new version, and keeps a record that cannot be rewritten.

> **Status: implemented and tested locally on the branch `feature/client-feedback-approval` (based on `feature/project-management-timeline` at `f8db684`); not merged, not deployed, not production-ready.** What was and was not verified is in [TEST_RESULTS.md](TEST_RESULTS.md); what the owner still has to do is in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

## The principle

**The administration is the source of truth, and a published version is a fact.** The owner prepares a *draft* that nobody else can see, looks at it as the customer will, and **publishes** it. From then on that version is never changed (a database trigger refuses it). To change something, the owner makes a **new version**, which starts from the last one. The customer's feedback belongs to one version; an approval belongs to **one exact version** and to a **fingerprint** of what it said; nothing is approved by opening, viewing or replying.

## What the site does not do (on purpose)

* **No file upload and no download.** The site has no private place to keep a customer's file. A deliverable is *somewhere to look* (a link to a preview the owner hosts, or a picture on an allow-listed address) *and words*. Nothing here says a file can be sent or fetched.
* **The server never fetches an address a person typed.** No proxy, no thumbnail, no "check this link". The browser alone loads a preview, and only from an origin on the owner's list (see [PREVIEW_SECURITY.md](PREVIEW_SECURITY.md)).
* **No automatic approval, no approval by silence, no approval on behalf of the customer.** The owner can *ask*; only the customer can *approve*, with an explicit confirmation of one version.

## Where it is

| What | Address |
| --- | --- |
| The deliverables of a project (the owner) | `/admin/client-projects/:id/deliverables` (list, new, allowed origins) |
| One deliverable (the owner) | `/admin/client-projects/:id/deliverables/:deliverableId` (edit, versions, feedback, approval, notes, history, archive) |
| The e-mail choices | `/admin/work/settings` → *E-mails about deliverables* (administrator) |
| Deliverables of a project, as the customer sees them | `/<lang>/client-portal/projects/PRJ-…` → *Deliverables for review* |
| One deliverable (the customer) | `/<lang>/client-portal/projects/PRJ-…/deliverables/DLV-…` |
| The customer's API | `/api/portal/projects/:reference/deliverables…` |
| The owner's API | `/api/admin/client-projects/:id/deliverables…`, `/api/admin/deliverable-settings` |
| The code | `server/src/modules/deliverables/` (model, preview, service, customer, views, admin, routes, notify, settings), `server/src/modules/notifications/deliverableTemplates.ts`, `server/src/db/migrations/0014_client_feedback.sql`, `src/components/portal/Deliverable*.tsx`, `AnnotatedImage.tsx`, `src/utils/annotations.ts`, `src/admin/pages/Deliverable*.tsx`, `src/admin/api/deliverables.ts` |

## The owner's first steps

1. Administration → a customer → a project → **Open the work** → **Deliverables for review** → **New deliverable**.
2. Give it a title, a type, and the first version: a title, words for the customer, and an **https address** of the preview (and/or of a picture). The version is a **draft**.
3. Look at **Preview before you publish** (what the customer will read, and whether the address will be shown inside the portal or only as a link). Edit the draft as often as you like.
4. **Publish this version.** The customer is e-mailed once (unless you switched that off). From now on that version cannot be edited.
5. When the customer sends feedback, **reply**, **resolve** threads, make a **new version**, and when you are ready **ask for approval** of the current version.
6. The **history** and **approval history** show every step, who took it, and which fingerprint the customer confirmed.

Showing a preview or a picture **inside** the portal needs two matching settings (`PREVIEW_ORIGINS` for the backend and `VITE_PREVIEW_ORIGINS` for the build); without them everything still works, and a preview is a link that opens in a new tab. See [PREVIEW_SECURITY.md](PREVIEW_SECURITY.md).

## The documents

| File | What is in it |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The modules, the request's life, the endpoints and permissions, how it plugs into the portal and the work module, how to roll it back |
| [DATA_MODEL.md](DATA_MODEL.md) | Migration 0014 table by table: columns, constraints, triggers, indexes, what was rebuilt, what a backup must hold |
| [VERSIONING.md](VERSIONING.md) | Drafts, publishing, numbering, immutability, fingerprints, superseding |
| [FEEDBACK_WORKFLOW.md](FEEDBACK_WORKFLOW.md) | Drafts, sending, follow-ups, replies, resolving and reopening, internal notes, limits |
| [APPROVAL_WORKFLOW.md](APPROVAL_WORKFLOW.md) | The state machine, exact-version confirmation, concurrency, the review state |
| [PREVIEW_SECURITY.md](PREVIEW_SECURITY.md) | Ownership, private pages, URL rules, the embedding allow-list and its CSP, what is never logged |
| [ANNOTATIONS.md](ANNOTATIONS.md) | Normalized positions, the picture, mouse, touch and keyboard, accessibility |
| [NOTIFICATIONS.md](NOTIFICATIONS.md) | The seven e-mails, who gets them, once-only, the owner's choices |
| [LOCALIZATION.md](LOCALIZATION.md) | Hungarian, English, Dutch: where the words are and how they are checked |
| [TEST_RESULTS.md](TEST_RESULTS.md) | What was run and what it said, and what was **not** verified |
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | What the owner must do before using it with a real customer |
