# Architecture

## 1. How it fits

```
customer's browser ──▶ /api/portal/projects/:reference/tasks…        (cookie cc_client, CSRF on changes, same origin, no CORS)
owner's browser   ──▶ /api/admin/client-projects/:id/…              (admin session, CSRF, permission checked in the business function)
                          │
                 server/src/modules/projectwork/routes.ts  ──▶ admin.ts | portal.ts
                                                                  │
                         tasks.ts ◀── actions.ts ◀── (respondToAction, the customer's one move)
                              │             │
        customers/projects.ts (events, milestones, status)   progress.ts  reminders.ts  settings.ts  categories.ts
                              │
                       SQLite (migration 0013) ── email_deliveries (the existing outbox) ── notifications/workTemplates.ts
```

Nothing new runs in the background: the reminders ride the existing daily maintenance (`runMaintenance`, started by the server's daily timer or by `npm run server:maintenance`). The customer's identity is **only** the session (`ctx.customer`); no address, query or body names a customer.

## 2. Modules

| File | Responsibility |
| --- | --- |
| `projectwork/model.ts` | The vocabulary: task statuses, priorities, the transition table, action types / statuses / transitions, milestone statuses, the owner's notification choices and their defaults, the size limits. A test compares the lists with the migration's CHECK lists. |
| `projectwork/tasks.ts` | Create, edit (with the revision), delete, **move** (the status rules), bulk move, reorder, dependencies (cycle check), listing with filters. Every function is one transaction. |
| `projectwork/actions.ts` | Give a request, reword it, start the review, accept, ask for changes (words for the customer required), cancel, and the customer's **respond**. |
| `projectwork/portal.ts` | What a customer sees: built field by field from shared tasks of a project the session's customer owns. |
| `projectwork/progress.ts` | The percentage: counted from tasks, else milestones, else `null`. |
| `projectwork/reminders.ts` | "Due soon" / "overdue" reminders, idempotent by construction. |
| `projectwork/settings.ts` | The owner's choices; `todayKey` (the one definition of "today"). |
| `projectwork/categories.ts` | Manageable task categories (data, not code). |
| `projectwork/admin.ts`, `routes.ts` | Permissions, field-by-field body parsing (unknown fields refused), the addresses. |
| `customers/projects.ts` (extended) | `recordProjectEvent` (visibility, task, action, subject), milestones with description / status / visibility, the customer's timeline filtered by visibility. |
| `notifications/workTemplates.ts` | The seven messages in HU / EN / NL. `customers/mail.ts` writes them at send time. |

## 3. The life of a request

*The customer answers* (`POST …/tasks/:task/respond`): same-origin check → session → CSRF → body (one field, `response`, 2 to 5000 characters, cleaned) → `respondToAction`: one transaction that finds the task **through the project of the session's customer and only if it is shared** (otherwise 404, the same as no task), checks the action awaits an answer and the task and project are not closed, then a **conditional UPDATE** (`WHERE status = … AND revision = …`) moves it to `submitted` (a second click finds nothing to move: 409), inserts the immutable answer as the next revision, writes the transition and the line of history, lets a task that waited for the customer follow to `in_review` (a recorded move by the system), and queues the owner's e-mail. All of it or none of it.

*The owner reviews*: `accept` / `changes` / `cancel` / `review` are four doors, each a transaction with the same conditional update, one transition row and one history line, then the (optional, switchable) e-mail to the customer.

## 4. The endpoints

**Customer** (`/api/portal/…`; cookie + same origin; changes need the CSRF token)

| Method and address | Does |
| --- | --- |
| `GET /projects/:reference/tasks` | The progress (as the customer's own count) and the shared tasks |
| `GET /projects/:reference/tasks/:task` | One shared task, its request, the customer's answers, the history in the customer's words |
| `POST /projects/:reference/tasks/:task/respond` | `{ response }` → the next revision; `201` with the refreshed task |
| `GET /overview` (extended) | adds `needsYou` (open requests, most urgent first) and shared tasks to `upcoming` |
| `GET /projects`, `/projects/:reference` (extended) | add `progress`, milestone description / status, `subject` on timeline lines |

**Administration** (`/api/admin/…`; session + CSRF)

| Method and address | Permission | Does |
| --- | --- | --- |
| `GET client-projects/:id/work` | `clients:read` | summary (owner's and customer's progress, counts), the filtered tasks, milestones with task counts, categories, assignees, the allowed moves |
| `GET /work/tasks` | `clients:read` | the owner's tasks across projects (filters: assignee `me`, overdue, needs review…) |
| `POST client-projects/:id/tasks`, `GET/PATCH/DELETE …/tasks/:taskId` | `clients:projects` (read: `clients:read`) | make, read, edit (with `revision`), delete |
| `POST …/tasks/:taskId/status`, `POST …/tasks/bulk-status`, `POST …/tasks/reorder` | `clients:projects` | a move; up to 100 at once (answer per task); the order of the tasks named |
| `POST …/tasks/:taskId/dependencies`, `DELETE …/dependencies/:dependsOnId` | `clients:projects` | what a task waits for |
| `POST …/tasks/:taskId/notes` | `clients:projects` | a private note about the task |
| `POST …/tasks/:taskId/action`, `PATCH …/actions/:actionId`, `POST …/actions/:actionId/{review,accept,changes,cancel}` | `clients:projects` | the request and its review |
| `POST/PATCH client-projects/:id/milestones…` (extended) | `clients:projects` | title, description, date, status, customer visibility |
| `GET …/work-notifications` | `clients:read` | the work's e-mails and their state |
| `GET/POST/PATCH/DELETE /task-categories`, `POST /task-categories/suggested` | read `clients:read`, write `clients:write` | the categories |
| `GET/PUT /work-settings` | read `clients:read`, write `system:write` | the owner's e-mail choices |

An editor can do everything on tasks and requests; only an administrator changes categories and e-mail choices. A customer's cookie is nothing in the administration (`401`).

## 5. How it plugs into the portal (and what did not change)

The empty state of a portal with no project is kept, with a sentence that says a project appears after an accepted quote **and** after the owner has created it. The quote, booking, linking and sign-in semantics are untouched: no migration before 0013 was edited, no portal rule changed except: a milestone's e-mail is a new, **off-by-default** choice; the overview and the project timeline are now filtered by the new `visibility`; the percentage `null` / counted figure replaced "never a percentage" (an earlier test and journey assertion was updated for that, and only that).

## 6. Rolling back

Forward-only like every migration here. To take the work out: restore a backup taken before migration 0013, or (the owner's decision, after a backup) drop the new tables in dependency order (`project_action_transitions`, `project_action_submissions`, `project_customer_actions`, `project_task_dependencies`, `project_tasks`, `task_category_names`, `task_categories`), restore the two rebuilt tables from their 0012 definitions, drop the three added `client_milestones` columns and `client_project_notes.task_id`, and delete the row for version 13 from `schema_migrations`. The migration was written and tested to be applied to a database that already holds 0012's data ([TEST_RESULTS.md](TEST_RESULTS.md)).
