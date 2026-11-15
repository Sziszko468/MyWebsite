# Architecture

Everything reuses what the project already has: React 19 + TypeScript + Vite, the Node backend with `node:sqlite`, additive numbered migrations, the customer sessions and ownership checks of the client portal, the administration's permissions, the e-mail outbox, the three languages and the Racing Red design system. **No new runtime dependency, no second backend, no second database, no external file storage, no new e-mail provider.**

## The modules

```
server/src/modules/deliverables/
  model.ts      the lists (types, states, events), LIMITS, the row types, the settings' shape
  preview.ts    parsePreviewUrl / isEmbeddable / hostOf: the one place an address is judged
  service.ts    the owner's rules: create, edit, version, publish, archive, remove, reply, resolve,
                note, ask for approval, cancel, the review state, the history, the fingerprint
  customer.ts   the customer's rules: ownership, drafts, send, follow-up, reopen, approve, ask for
                changes, withdraw
  views.ts      the two read models: what the customer may see, what the owner sees
  admin.ts      the owner's endpoints' bodies (field by field), permissions, audit lines, settings
  routes.ts     the addresses
  notify.ts     the seven messages, gated by the owner's choices, written to the outbox
  settings.ts   the owner's choices (stored under `deliverables.settings`)
server/src/modules/notifications/deliverableTemplates.ts   the words of the seven e-mails (HU/EN/NL)
server/src/db/migrations/0014_client_feedback.sql
src/components/portal/   DeliverableViews.tsx (the list and the page), AnnotatedImage.tsx,
                         Dialog.tsx, Deliverables.module.scss
src/content/portal/deliverables.ts   the customer's words (HU/EN/NL)
src/utils/annotations.ts             the position arithmetic (shared by the portal and tests)
src/admin/pages/Deliverables(Page).tsx, src/admin/api/deliverables.ts, src/admin/i18n/deliverables.ts
src/config/preview.ts                VITE_PREVIEW_ORIGINS, parsed
src/security/headers.ts              the portal's own Content-Security-Policy when origins are allowed
```

## The life of a request

**The customer** (`/api/portal/projects/:reference/deliverables…`) → the portal's rate limit → the customer's session cookie and CSRF token (every change) → `ownDeliverable` joins **project → customer** and requires `published_at` (a draft, someone else's, or a made-up reference all answer the same **404**) → the rule in `customer.ts` inside one transaction → the answer is the **whole refreshed deliverable** (so the page never guesses what the server decided).

**The owner** (`/api/admin/client-projects/:id/deliverables…`) → the administrator's session and CSRF → `requirePermission` → `service.ts` → the answer is the refreshed detail.

Every body is read **field by field** with an exact-keys check (`exact()`): an unknown key is refused, an author, a project, a version or a customer in a body is never believed.

## The endpoints

| | Method and address | Does |
| --- | --- | --- |
| Customer | `GET …/deliverables` | the list: states, current version, open threads |
| | `GET …/deliverables/:deliverable[?version=n]` | one deliverable at one version (default: current) |
| | `POST …/comments` | a **draft** comment (optional position, only if the version has a picture) |
| | `PATCH` / `DELETE …/comments/:comment` | change or remove one's own **draft** |
| | `POST …/feedback` | send every draft on the current version at once |
| | `POST …/comments/:comment/follow-up` | add to a sent thread |
| | `POST …/comments/:comment/reopen` | reopen a resolved thread |
| | `POST …/approvals/:approval/approve` | approve: `{ confirm: true, versionNumber, checksum, revision }` |
| | `POST …/approvals/:approval/changes` | ask for changes: `{ explanation, revision }` |
| | `POST …/approvals/:approval/withdraw` | "I am not ready to decide": `{ revision }` |
| Owner (`clients:read`) | `GET …/deliverables`, `GET …/deliverables/:id` | list, detail (versions, comments, notes, approvals, history) |
| Owner (`clients:projects`) | `POST …/deliverables`, `PATCH` / `DELETE …/:id` | create, edit (with `revision`), remove a never-published one |
| | `POST …/:id/versions`, `PATCH …/versions/:v`, `POST …/versions/:v/publish` | next draft, edit a draft, publish |
| | `POST …/:id/archive` | archive (read-only for the customer; cancels a waiting request) |
| | `POST …/comments/:c/replies`, `…/resolve`, `…/reopen` | answer and close threads |
| | `POST …/:id/notes` | a private note (append-only) |
| | `POST …/:id/approvals`, `POST …/approvals/:a/cancel` | ask for approval of the current version; cancel a waiting request |
| Administrator (`system:write`) | `GET` / `PUT /api/admin/deliverable-settings` | which e-mails are sent |

Every customer answer carries `Cache-Control: no-store` and no CORS header; the site is same-origin only.

## How it plugs in

* **Client portal.** The project page lists the deliverables; the portal overview lists what **waits for the customer's approval** (`overview.awaitingApproval`); the page is `/<lang>/client-portal/projects/:reference/deliverables/:deliverable`, a private page like every portal page (no cache, no index, no referrer, no analytics).
* **Project work (PROMPT 26).** A deliverable may point at a **task** of the same project (a trigger refuses another project's); the task's page is unchanged. The e-mail choices live next to the work's in *Work settings*.
* **E-mail outbox.** One new related type (`deliverable_event`) and seven kinds; the outbox table was rebuilt once more (ids kept).
* **Erasure.** Erasing a customer deletes their deliverables, versions, feedback, approvals, history and the e-mails about them (`customers/retention.ts`).

## Rolling it back

Nothing is created for anybody until the owner makes a deliverable, so the feature can be left unused. To remove it from the code, revert the branch; the migration is **forward-only** (like the others), so a database that has run `0014` keeps its (empty or full) tables, which nothing else reads. Do not delete the tables from a live database without a backup: the history is the record of what was approved.
