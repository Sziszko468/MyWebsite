# Filter semantics — the project status filter

PROMPT 32.1. Written from the code as it is on `feature/business-intelligence-refinement`; every statement below is checked by `server/test/analyticsProjectFilter.test.ts` (18 tests), `src/admin/analytics/analytics.test.ts` and the browser journey (`tools/e2e/analytics-journey.cjs`).

## What `projectStatus` means

`projectStatus` is the project's **current** status (`client_projects.status`). Nothing else: not the status a project had during the period (the system does not store that, and the analytics never reconstruct it).

A selected status is a choice the dashboard must **not silently ignore** and must **not imply for a figure it does not touch**. So every figure that can be affected says, in the response and on the screen, which of three things happened to it. The note is present only when a status is selected; with none selected nothing changes and no note is added.

| Effect (`filterNote.effect`) | Meaning | What the figure shows |
| --- | --- | --- |
| `applied` | The figure is about projects (and their tasks, milestones, customer actions) **as they are now**, and counts only projects whose current status is the selected one | its value, badge "Filtered by project status" and "Counts only projects whose status now is X" |
| `empty_by_definition` | The figure is defined for **active projects only** (or for projects **On hold** only) and the selected status lies outside that definition, so there is nothing to count | **unavailable** with the reason (`status_not_active` / `status_not_on_hold`), badge "Empty by definition". **Never a zero.** |
| `not_applied` | The figure keeps its own meaning: an **event of the period**, or **not about projects at all** | its unfiltered value, badge "Not filtered by project status" and the reason (`historical_event` / `not_project_data`) |

## Historical events keep their historical meaning

A figure that counts **what happened in the period** — a project completed, a task completed, a project's duration — is an event with a timestamp. It is **never** filtered by the status the project has *today*: a project completed in the period and reopened since (now in Development) is still a project completed in the period, and a project that is Completed now but was completed before the period is still not in it. Filtering events by today's status would retroactively reinterpret history, which the analytics forbid (no historical status reconstruction). These figures say so on their own card.

## Every project figure

`A` = active-by-definition (scoped to active projects now; empty by definition for Completed and Cancelled). `S` = scoped to projects whose current status is the selected one, whatever it is. `E` = event of the period, not filtered.

| Figure | Class | With a status selected |
| --- | :-: | --- |
| `activeProjects` | A | active **and** in the selected status; **unavailable** for Completed / Cancelled |
| `delayedProjects` | A | active, expected date passed, in the selected status; unavailable for Completed / Cancelled |
| `overdueMilestones` | A | milestones not completed and past due, of active projects in the selected status; unavailable for Completed / Cancelled |
| `projectsOnHold` | — | defined for projects On hold: applied for On hold, **unavailable** (`status_not_on_hold`) for any other status |
| `tasksInProgress`, `blockedTasks` | A | tasks of active projects in the selected status; unavailable for Completed / Cancelled |
| `tasksAwaitingCustomer` | A | customer actions not started or with changes requested, of active projects in the selected status; unavailable for Completed / Cancelled |
| `milestoneCompletionRate` | S | milestones **due in the period** (not cancelled) **of projects now in the selected status** (any status: a completed project's milestones count), share completed now |
| `completedProjects` | E | projects completed in the period, whatever status they have today |
| `tasksCompleted` | E | tasks completed in the period |
| `averageProjectDurationDays` | E | projects completed in the period that have a start date |
| `completedProjectsSeries` | E | the same events over time |
| `projectsByStatus` | S | the selected status only (one bar) |
| `tasksByStatus` | A | tasks of active projects in the selected status; empty by definition for Completed / Cancelled (no data, with the note) |
| `milestonesByStatus` | S | all milestones of projects now in the selected status (any status) |
| `projectWorkload`, `upcomingDeadlines` | A | active projects in the selected status; empty by definition for Completed / Cancelled |
| `cancelledProjects` (computed, not drawn) | E | projects cancelled in the period (by last update) |

Task and milestone figures are therefore always scoped **to the projects they belong to, by those projects' current status** — never by a status of their own (a task has its own status; the project filter does not touch it).

## Where else the filter reaches

* **Overview.** The project KPIs (`activeProjects`, `delayedProjects`, `overdueMilestones`) follow the filter exactly as above; `completedProjects` is an event (not applied); **every other figure** — requests, contacts, customers, quotations, pipeline value, the response backlog, recorded revenue (unavailable) and all money cards — is declared `not_applied` with the reason `not_project_data`. Figures the role may not read stay `not_permitted` and nothing is said about them. The section summary says the filter applies to part of the overview.
* **Alerts.** Alerts about projects follow the filter (the project's current status): `overdue_milestone`, `project_on_hold`, `blocked_task`, `pending_customer_approval`. Alerts that are not about projects are not filtered: `unanswered_customer_message`, `quotation_waiting_long`, `request_not_reviewed`, `consultation_requires_attention`. The section summary lists both groups (`appliedKinds`, `notAppliedKinds`), the screen writes them, and the CSV has them.
* **Every other section** (financial, customers, funnel, consultations, communication, AI): the filter does not apply. The response says so (`filterSummary.projectStatus.effect = "not_applicable"`), **no figure changes**, and the screen offers no such filter there; if the address carries one, the screen says "Not used in this section: Project status" with a button to clear it (it is never dropped silently). The same notice covers every other filter set in the address but not used by the section.

## Response shape

```jsonc
// a figure
{ "id": "activeProjects", "state": "available", "value": 2, "filterNote": { "filter": "projectStatus", "effect": "applied", "reason": null } }
{ "id": "activeProjects", "state": "unavailable", "value": null, "reason": "status_not_active", "filterNote": { "filter": "projectStatus", "effect": "empty_by_definition", "reason": "status_not_active" } }
{ "id": "completedProjects", "state": "available", "value": 2, "filterNote": { "filter": "projectStatus", "effect": "not_applied", "reason": "historical_event" } }
// a section
"filterSummary": { "projectStatus": { "status": "development", "effect": "partial" } }          // overview, projects, alerts
"filterSummary": { "projectStatus": { "status": "development", "effect": "not_applicable" } }   // every other section
```

Metrics, money, series, distributions and tables all carry `filterNote` when it applies. The CSV adds a comment line (`# Project status filter: …`) and a `[filter-scope]` block (`kind,id,filter,effect,reason`, including the alert kinds). The assistant's analytics tools have **no** `projectStatus` input (a strict schema rejects it), so the model cannot select it.

## Before and after

| | Before (PROMPT 32) | After (PROMPT 32.1) |
| --- | --- | --- |
| Offered in | Projects only | Overview, Projects, Alerts (with a description of what it does and does not filter) |
| Honoured by | the three breakdowns and the workload table only | every project figure that can meaningfully be filtered (table above), the overview's project KPIs, the project alerts |
| Not honoured, silently | all KPIs (active, delayed, overdue, tasks, on hold…), the completed-projects chart, the deadlines table, the alerts, the overview | nothing silently: every figure says `applied`, `not_applied` (and why) or `empty_by_definition` |
| Contradictions | tasks-by-status and workload used "active **and** status", so *Completed* gave an empty list with no explanation | the empty list is declared "empty by definition" with the reason |
| A status that can never match | a zero or an empty list | `unavailable` with a sentence, never a zero |
| Other sections | the parameter was accepted and ignored | the response says `not_applicable`; the screen says the filter is not used there |
| Export | filters line only | filters line, a project-status note and a `[filter-scope]` block |

## Permissions

The filter never widens anything. A role that may not read a section gets `not_permitted` with no figure and **no `filterSummary`** whatever filter is asked; a figure the role may not read in the overview stays `not_permitted` with no note; the export of a section the role cannot read is still `403`; the assistant's analytics reader takes no project status and checks the permission at every call as before. An unknown status, an injection string or a wrong case (`DEVELOPMENT`) is a 422 naming the field.

## Limitations

* The filter is the **current** status. "How many projects were in Design last month" cannot be answered: no status history is stored, and none is invented.
* The other filters (language, currency, service, package, quotation status, consultation status) keep their existing per-section behaviour, which the screen states ("a figure that cannot be filtered shows everything") and, in the screen, lists when one is set but not used; the *API* gives a per-figure note only for the project status. Extending it to them is a follow-up.
* Customers with an active project (`customersWithActiveProjects`, segment *with an active project*) are customer figures about projects; they are not filtered by project status (the Customers section says the filter does not apply).
