# Project, consultation and alert analytics

Permissions: projects `clients:read`; consultations `requests:read`; alerts `requests:read` and/or `clients:read` (see below).

## Projects

Source: `client_projects`, `client_milestones`, `project_tasks`, `project_customer_actions`. Filter: project status.

| id | kind | type | meaning |
| --- | --- | --- | --- |
| `activeProjects` | A | state | not completed or cancelled |
| `completedProjects` | A | flow | completed in the period (`completedProjectsSeries`) |
| `projectsOnHold` | A | state | status On hold |
| `delayedProjects` | D | state | active, with an expected date before today (business zone) |
| `overdueMilestones` | D | state | milestone not completed, due before today, in an active project |
| `milestoneCompletionRate` | D | — | share of the milestones **due in the period** that are completed; `unavailable` when none was due |
| `tasksCompleted` | A | flow | tasks completed in the period |
| `tasksInProgress`, `blockedTasks` | A | state | tasks by status now |
| `tasksAwaitingCustomer` | A | state | customer actions not started or with changes requested, in active projects |
| `averageProjectDurationDays` | D | — | days from the start date to completion for projects completed in the period **that have a start date**; `unavailable` otherwise |

Breakdowns: `projectsByStatus`, `tasksByStatus` (active projects), `milestonesByStatus`. Tables: `projectWorkload` (open and overdue tasks per active project, references only) and `upcomingDeadlines` (milestones and tasks due in the next 14 days, references and dates only).

* "Completed" is a status and a time an administrator set (`completed_is_a_status_an_administrator_set`).
* Project history comes from recorded events only; nothing is reconstructed from current statuses (`project_history_is_events_only`).
* `cancelledProjects` exists in the service (it uses the last update as the time of cancelling, `cancellation_time_is_last_update`) but is not drawn.

## Consultations

Source: `bookings`, `booking_events`. Permission `requests:read`. Filters: customer language, consultation status.

`consultationRequests` (bookings made in the period), `confirmedConsultations`, `cancelledConsultations`, `completedConsultations`, `noShows` (flows by the time of each event), `upcomingConsultations` (pending or confirmed, starting from now: a state), `bookingConversionRate` (D: of the consultations requested in the period, the share that has been confirmed). Breakdown `consultationsByStatus`; series `consultationRequestsSeries`.

**A past appointment time is not proof that the meeting happened.** Only the statuses an administrator set (*completed*, *no show*) are counted as such, and the screen says so (`past_time_is_not_attendance`).

## Operational alerts

Deterministic, deduplicated (one alert per record and kind), ordered by severity then age, at most 25 per rule and 100 in all. Each has a severity, the **rule that matched** (a code the screen words), the record's public reference, a date, a suggested next step and a link to the record. **No alert changes anything** (`no_status_changes`); no alert is not "all clear" (`fixed_rules`), and the screen says so.

| Kind | Rule | Severity | Needs |
| --- | --- | --- | --- |
| `unanswered_customer_message` | the customer wrote last and has waited more than two days | medium; high after four days | `clients:read` |
| `blocked_task` | a task of an active project is blocked | high | `clients:read` |
| `overdue_milestone` | a milestone's date has passed and it is not completed (listed once per project, by the project's reference) | high | `clients:read` |
| `project_on_hold` | the project is on hold | medium | `clients:read` |
| `pending_customer_approval` | a deliverable has waited for approval more than a week | low | `clients:read` |
| `quotation_waiting_long` | a quotation was sent more than two weeks ago without an answer, or its validity date has passed | medium; high when expired | `requests:read` |
| `request_not_reviewed` | a request has been New for more than two days | medium | `requests:read` |
| `consultation_requires_attention` | a consultation starts within three days and is not confirmed | high | `requests:read` |

A role that lacks one of the two permissions gets the alerts it may read and a note that the others are not available to it (`leftOut`).
