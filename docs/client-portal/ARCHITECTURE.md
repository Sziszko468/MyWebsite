# Client portal: architecture

## 1. What was audited first, and what that decided

| Question | What the code had | Decision |
| --- | --- | --- |
| Is there a customer identity? | **No.** Customers reach one quotation, one request or one booking through a secret in a link; the only accounts are the owner's (`admin_users`, password, scrypt). | A customer account is new. |
| Is there a safe customer password flow? | No. The administrator's flow is password based, with a lock after five failures. | **Passwordless**: a link sent to the address proves it. No password is stored anywhere; "forgot my password" does not exist. The brief names this as the fallback when no safe customer password flow exists. |
| Extend the existing session system or build a parallel one? | `modules/auth/sessions.ts` is hard-wired to `admin_users`/`admin_sessions` and the admin cookie. | The **same parts** are reused (`randomToken`, SHA-256 of the cookie's token, the cookie's shape, absolute + idle deadlines, a CSRF token per session, `sameOrigin`, the rate limiter, the audit helper, the outbox), but the customer's session is its **own principal**: its own tables and cookie (`cc_client`). A customer's cookie is never read by an administration route and the other way round, so no bug in one can turn a customer into an administrator. The roadmap said "no second authentication *system*": this is one mechanism with two kinds of principal, not two mechanisms. |
| Is "projects" a thing? | `modules/projects` is the **portfolio CMS** (case studies on the Work page), not customers' projects. | A new table `client_projects`; the portfolio is untouched. |
| Where do quote requests and bookings get their email? | Typed by whoever filled in the form, **never verified**. | Never a key. Ownership is an explicit row in `customer_links`: [ACCOUNT_LINKING.md](ACCOUNT_LINKING.md). |
| Is there private file storage? | The media module stores **public** pictures. | No. The document model and its authorization exist, publishing is refused: [DOCUMENTS.md](DOCUMENTS.md). |

## 2. Where the code is

```text
server/src/modules/customers/
  model.ts       the vocabulary: account, project statuses and transitions, event types, the two switches
  accounts.ts    the customers table, the account's history (customer_audit_events), the owner's two switches
  sessions.ts    the customer's session: cookie, CSRF, idle/absolute deadlines, listing, revoking
  auth.ts        asking for a link, minting its secret, opening it (sign in / activate / register / change address)
  linking.ts     customer_links: who owns which quote request or booking; the admin's link/unlink; the customer's claim
  projects.ts    the owner's work on a project (create, status, dates, milestones, updates, notes) and what a customer sees
  portal.ts      the customer's API logic: overview, requests, bookings, profile, devices, deletion request, document authorization
  admin.ts       the administration's side, every function checking its permission itself
  mail.ts        queueing the portal's messages; writing them when they are sent
  retention.ts   what an erasure removes
  routes.ts      every address
server/src/modules/notifications/clientTemplates.ts   the nine messages in HU / EN / NL
server/src/db/migrations/0012_client_portal.sql       the schema (additive)
src/portal/        the browser's side: api.ts, context/session/usePortal/text
src/components/portal/   the views (AuthViews, PortalViews, AccountView, PortalShell, ui) and Portal.module.scss
src/pages/ClientPortalPage.tsx   the one page for every address below /client-portal
src/content/portal/index.ts      every customer-facing word, in three languages
src/admin/pages/Client*.tsx, src/admin/api/clients.ts, src/admin/i18n/clients.ts   the administration's screens
tools/e2e/portal-journey.cjs     the browser journey (4 widths, axe)
```

## 3. The tables (migration `0012_client_portal.sql`)

The migration is **additive**: it creates tables and rebuilds `email_deliveries` exactly as migrations 0007, 0009 and 0011 did (SQLite cannot change a CHECK in place) to accept the portal's kinds of message. No existing row is changed.

| Table | Holds | Notes |
| --- | --- | --- |
| `customers` | the account: address (unique, case-insensitive), name, company, language, status (`invited` / `active` / `disabled`), origin, `email_verified_at`, `last_sign_in_at`, `deletion_requested_at` | `CHECK (status <> 'active' OR email_verified_at IS NOT NULL)`: an account whose address nobody proved cannot be active |
| `customer_auth_requests` | one "send me a link": purpose (`sign_in`, `activate`, `register`, `email_change`), the address it goes to, the language | the outbox's message points at this row; a registration has no account yet |
| `customer_auth_tokens` | the secret of a link: **only its SHA-256**, expiry, `used_at`, `revoked_at` | made when the e-mail is written, shown only inside it |
| `customer_sessions` | a sign-in: **hash** of the cookie's token, a public id, the CSRF token, deadlines, a keyed hash of the network address, the first 200 characters of the browser's description | deleting the row ends the session |
| `customer_links` | `(customer, quote request)` or `(customer, booking)` + `method` (`admin` / `verified_email`) | **the only thing that makes a record visible**; one owner per record (partial unique indexes); cascades both ways |
| `client_projects` | reference (`PRJ-` + 8 random characters), customer, optional quote request and **the accepted quote's id**, name, category, status, dates | `ON DELETE CASCADE` from the customer |
| `client_milestones` | title, due date, `completed_at`, position | progress is **counted** from these, never invented |
| `client_project_events` | the project's history, **append-only** (a trigger refuses updates), the words the owner wrote *for the customer* | the timeline a customer sees is read from here and nowhere else |
| `client_project_notes` | the owner's **private** notes | no query that builds a customer's answer touches this table |
| `client_documents` | title, kind, file facts, an opaque `storage_key`, `published_at` | `CHECK (published_at IS NULL OR storage_key IS NOT NULL)`: nothing can be published without a place for the bytes |
| `customer_audit_events` | the account's history: kind, who (`customer` / `admin` / `system`), a short fixed code | **append-only** (triggers refuse update and delete); no address, name, token **or network address** |
| `email_deliveries` (rebuilt) | + 9 kinds, + 4 related types (`client_auth`, `client_audit`, `client_project_event`, `client_document`) | one row per kind per thing it is about (the once-only index) |

## 4. The life of a request

`app.ts` knows the order: address and id → global limit → CORS (**not** for `/api/portal/*`) → route match → the route's own limit → for a portal route: same-origin check on every change (`Sec-Fetch-Site` / `Origin`) → for a signed-in route: **the customer is resolved from the cookie** (`resolveClientSession`) and a change needs the session's CSRF token → handler → error to envelope → headers (`no-store`, `noindex, nofollow`, `Referrer-Policy: no-referrer`) → log. A handler reads the customer from `ctx.customer` (never from the body, the query, a header or an address) and every SQL statement selects by that id. Anything that is not the customer's is answered exactly like something that does not exist (`404`, the same body).

## 5. The project status model

Eleven statuses (the brief's list), documented once in `model.ts` and mirrored by the migration's CHECK and the three languages (tests compare all three):

| Status | Means for the customer | Counts as |
| --- | --- | --- |
| `awaiting_start` | not started yet (the first status of every project) | active |
| `discovery`, `planning`, `design`, `development` | a working phase | active |
| `review` | the owner is reviewing what was made | active |
| `waiting_customer` | **the customer has something to do** | active, and "waiting for you" |
| `finalization` | finishing touches | active |
| `completed` | finished (`completed_at` is set) | completed |
| `on_hold` | paused | neither |
| `cancelled` | cancelled | neither |

**Transitions** (`PROJECT_TRANSITIONS`): from a working status to any other status; from `completed` or `cancelled` only to `on_hold` (a reopening); never to the same status. The rule is deliberately small: PROMPT 26 decides what a real workflow needs. **A customer never changes a status**: no portal address does it (a test tries every verb).

**E-mail** for a status change: sent by default for `waiting_customer`, `review`, `finalization`, `completed`, `on_hold`, `cancelled`; not for the working phases (they are shown in the portal only); the owner can overrule either way per change. A change of dates, a milestone or a private note is never e-mailed.

## 6. How an accepted quotation becomes a project

It does **not**, by itself. Accepting a quote (the existing, unchanged workflow) changes the quote's and the request's status and nothing else. The owner then, **on purpose**: (1) links the quote request to the customer's account (`admin`) or the customer claims it (`verified_email`, only if the owner allows it); (2) creates a project from it. `createProject` refuses unless **the request is linked to that very customer** (`request_not_linked`) **and has an accepted quote** (`quote_not_accepted`); it stores the accepted version's id. A project can also be created without a request (agreed outside the site). Every project creation is an administrator's act, written to the account's history and the administration's audit log. Tests: `clientPortalProjects.test.ts`, `clientPortalLinking.test.ts`.

## 7. The endpoints

**Customer** (`/api/portal/…`, all `no-store`, same-origin, no CORS; "signed in" = cookie + for changes the CSRF token):

| Method and address | Signed in | Does |
| --- | --- | --- |
| `GET /config` | no | whether sign-in is available, whether registration is open, the link's life |
| `POST /auth/request` | no | asks for a link; **the same answer for every address** (`202`) |
| `POST /auth/verify` | no | opens a link's secret; sets the cookie |
| `GET /session`, `POST /session/sign-out` | yes | who is signed in; end this sign-in |
| `GET /overview`, `/projects`, `/projects/:reference`, `/requests`, `/requests/:reference`, `/bookings`, `/bookings/:reference`, `/documents` | yes | the customer's own records |
| `POST /requests/:reference/open`, `/bookings/:reference/open` | yes | an ordinary secure link (2 hours) to the existing quote or booking page |
| `GET /documents/:id/download` | yes | authorizes, then stops at the missing file store (`503`) |
| `GET /link-candidates`, `POST /link-candidates/claim` | yes | only while the owner allows it |
| `PATCH /profile`, `POST /profile/email` | yes | name, company, language; a change of address (a link to the NEW address) |
| `GET /sessions`, `DELETE /sessions/:id`, `POST /sessions/revoke-others` | yes | the devices |
| `POST` / `DELETE /account/deletion-request` | yes | ask for, or withdraw, the deletion of the account |

**Administration** (`/api/admin/…`, an administrator's session + CSRF): `client-settings` (GET `clients:read`, PUT `system:write`), `clients` (list, invite), `clients/:id` (detail), `clients/:id/actions` (`disable`, `enable`, `revoke_sessions`, `send_link`, `clear_deletion_request`), `clients/:id/links` (link / unlink), `clients/:id/projects` (create), `client-projects/:id` (read, edit, `status`, `milestones`, `updates`, `notes`, `documents/:id/publish` → always `409 storage_unavailable`).

**Permissions** (`modules/auth/permissions.ts`): `clients:read` (admin, editor), `clients:projects` (admin, editor: status, milestones, updates, notes, edit), `clients:write` (admin only: invite, switch off/on, sign out, link, unlink, create a project), the settings switches need `system:write`. A customer's cookie is nothing in the administration (`401`).

## 8. Rolling back

The migration cannot be "un-applied" by the runner (the project's migrations are forward-only, and a database newer than the code refuses to start). To take the portal out: restore a backup taken before migration 0012, or (the owner's decision, after a backup) run, in a SQLite shell, `DROP TABLE client_documents; DROP TABLE client_project_notes; DROP TABLE client_project_events; DROP TABLE client_milestones; DROP TABLE client_projects; DROP TABLE customer_links; DROP TABLE customer_sessions; DROP TABLE customer_auth_tokens; DROP TABLE customer_auth_requests; DROP TABLE customer_audit_events; DROP TABLE customers;` and delete the row for version 12 from `schema_migrations`; the e-mail log keeps its rows (the widened CHECK is harmless). Nothing else depends on these tables.

## 9. What PROMPT 26 can extend without a rewrite

The status list and transitions (`model.ts`), the event types (a rebuild of `client_project_events`, as the project already does elsewhere), the `client_milestones` table (add owners, dependencies, weights), `client_documents` (the storage interface exists), the customer's timeline (it reads one table), the e-mail kinds (the once-only index lists them), and the permissions (`clients:projects`).
