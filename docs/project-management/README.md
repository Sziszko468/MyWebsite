# Project management and timeline (PROMPT 26)

The client portal ([../client-portal/](../client-portal/README.md)) now has a working project workspace: **tasks**, **milestones**, **dependencies**, **requests made of the customer** (and their answers and review), a **schedule**, a **progress** figure counted from real records, and the e-mails that follow from them. It is an extension of the existing Node backend, SQLite database, migrations, e-mail outbox and HU / EN / NL machinery. Nothing new was installed, no second backend, database, provider or chart library was added.

> **Status: implemented and tested locally on the branch `feature/project-management-timeline` (based on `feature/client-portal` at `f685cee`); not merged, not deployed, not production-ready.** What was and was not verified is in [TEST_RESULTS.md](TEST_RESULTS.md); what the owner still has to decide or configure is in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md). Nothing was run against production, a real provider, real DNS or a real customer, and no e-mail was sent anywhere.

## The principle

**The administration is the source of truth.** The owner makes the tasks, decides which of them the customer sees, and decides what is asked of the customer. The customer sees only what was **shared**, and can do exactly one thing: **answer a request in words** (and, if changes were asked for, answer again). Everything else on the customer's pages is read-only, built field by field from what the owner shared.

## Where it is

| What | Address |
| --- | --- |
| The workspace of a project (the owner) | `/admin/client-projects/:id/work` (summary, filters, **Board**, **List**, **Schedule**, **Milestones**, **E-mails**) |
| One task (the owner) | `/admin/client-projects/:id/tasks/:taskId` |
| Categories and the choices about what is e-mailed | `/admin/work/settings` (administrator) |
| A project, as the customer sees it | `/<lang>/client-portal/projects/PRJ-…` (progress, tasks, schedule, milestones, timeline) |
| One task, and the answer form | `/<lang>/client-portal/projects/PRJ-…/tasks/TSK-…` |
| The customer's API | `/api/portal/projects/:reference/tasks`, `…/tasks/:task`, `POST …/tasks/:task/respond` |
| The owner's API | `/api/admin/client-projects/:id/work`, `…/tasks…`, `…/actions…`, `…/work-notifications`, `/api/admin/task-categories`, `/api/admin/work-settings`, `/api/admin/work/tasks` |
| The code | `server/src/modules/projectwork/` (model, tasks, actions, progress, reminders, portal, admin, routes), `server/src/modules/notifications/workTemplates.ts`, `server/src/db/migrations/0013_project_management.sql`; in the site `src/components/portal/WorkViews.tsx`, `src/admin/pages/{ProjectWorkPage,TaskDetailPage,WorkSettingsPage}.tsx`, `src/admin/components/work/`, `src/utils/schedule.ts` |

## The owner's first steps

1. Administration → **Customers** → a customer → a project → **Open the work**.
2. *Project work: categories and e-mails* → **Add the suggested categories** (or your own; nothing is created for you).
3. **New task.** A task is **private** until you tick *Share with the customer*. A shared task shows its title, the words you wrote *for the customer*, its dates and its status, and nothing else.
4. To ask the customer something, open a **shared** task → *Customer action* → write what you ask. They answer in the portal; you review.
5. Nothing is e-mailed unless the owner's choices say so (see [NOTIFICATIONS.md](NOTIFICATIONS.md)): "an action was given" is on by default, **reminders about a passed date and milestone e-mails are off until you switch them on**.

## The documents

| File | What is in it |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The modules, the request's life, the files, the endpoints and the permissions, how it plugs into the portal, how to roll it back |
| [DATA_MODEL.md](DATA_MODEL.md) | Migration 0013 table by table: columns, constraints, triggers, what was rebuilt, what a backup must hold |
| [TASK_WORKFLOW.md](TASK_WORKFLOW.md) | Task statuses and the rules between them, dependencies and loops, bulk moves, ordering, progress |
| [CUSTOMER_ACTIONS.md](CUSTOMER_ACTIONS.md) | The request / answer / review workflow, revisions, what the customer can and cannot see, why there is no upload |
| [TIMELINE.md](TIMELINE.md) | The history lines and which are the customer's, the schedule view, "today", time zones |
| [NOTIFICATIONS.md](NOTIFICATIONS.md) | The seven messages, the owner's choices, reminders and their idempotence, queued versus delivered |
| [SECURITY.md](SECURITY.md) | The threat list from the brief, each with where it is enforced and the test that proves it |
| [TEST_RESULTS.md](TEST_RESULTS.md) | The commands, the real output, and what was not verified |
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | What the owner must decide, configure and have reviewed before this is used for real |

## What this does **not** do

No file upload or delivery (the site still has no private file store: a response is text; see [CUSTOMER_ACTIONS.md](CUSTOMER_ACTIONS.md)), no messages between customer and owner beyond the answer / review loop, no time tracking, no invoices or payments, no recurring tasks, no task comments from the customer, no assignment of work to a customer, no per-customer task visibility beyond shared / private, no external calendar export, no drag-and-drop timeline editing (dates are edited in the task form), no real-time updates (a page shows what it loaded; the owner's board reloads after each change). The percentage on a project is a count, never an estimate of effort.
