# The timeline and the schedule

## The history (`client_project_events`)

Every change of the work writes **one line in the same transaction** as the change. The table is append-only (a trigger refuses any update). Each line has a type, who made it (owner, customer or system), the task / request / milestone it is about (by id and by the **title it had at the time**), the status moved from and to (a *task* or *request* status on a task or request line; a *project* status on a project line), the words written for the customer (never a private note) and a **visibility**:

* `customer`: the customer's timeline and overview show it.
* `internal`: only the administration does.

| Types | Visibility |
| --- | --- |
| `created`, `status_changed`, `dates_changed`, `milestone_added`, `milestone_completed`, `document_published`, `feedback_requested`, `update_posted` (the portal's own) | `customer` (as before), except a milestone the customer cannot see: then `internal` |
| `task_created` | `customer` if the task is shared (and once more when it is shared later), else `internal` |
| `task_status_changed`, `task_completed`, `task_cancelled` | `customer` if the task is shared, else `internal` |
| `task_edited`, `task_assigned`, `dependency_added`, `dependency_removed`, `note_added` | **always `internal`** |
| `milestone_status_changed` | `customer` if the milestone is visible |
| `action_assigned`, `action_submitted`, `action_under_review`, `action_changes_requested`, `action_accepted`, `action_cancelled` | `customer` if the task is shared (it always is while a request is open), else `internal` |

The visibility is decided **by the code that writes the line**, in the same transaction. On top of it, the customer's queries add two more filters: a line about a task that is **not shared (any more) or no longer exists** is not shown, and a line about a milestone that is **hidden** is not shown. So hiding a task takes its lines off the customer's page at once, and sharing it again brings them back (a test does both). The customer's page shows the line as a sentence in their language built from the type, the title and the status in the customer's own words; the owner's words appear as the note.

The owner's view of a project and of a task shows **all** lines, each marked "internal" or "visible to the customer".

## "Today", dates and time zones

All task and milestone dates are **calendar days** (`YYYY-MM-DD`), with no hour and no zone, so no daylight-saving change and no browser zone can move one. **"Today" is decided by the server**, in the zone the owner schedules consultations in (the booking system's `timeZone`, the same setting) and, when none is set, in UTC. The server sends it with every progress figure (`today`); the owner's screen, the customer's screen and the reminders all use it, so they agree on what is overdue. Dates are written for people in the viewer's language (UTC formatting of a day, which cannot shift it). Moments (when something happened, when an answer was sent) are instants, shown in the viewer's own zone as everywhere else on the site.

"Overdue" means: not completed or cancelled, and the due day is before today. A task due **today** is not overdue.

## The schedule

One pure module, `src/utils/schedule.ts` (shared by the customer's page and the administration, with its own tests), turns tasks and milestones into rows:

* a thing with **both** dates is a bar from the start to the due day, inclusive; with **one** date it is a **point** on that day; with none it is listed under **Without a date**, never left out; **cancelled** things are not drawn; dates the wrong way round read as the span between them;
* positions are percentages of a range of days (the first to the last, widened to include today only if today is within 14 days of it); a bar is never thinner than 1.6 % so it can still be seen; weeks (Mondays) or, for a long range, months are the ticks;
* late work is marked by the end day, finished work is not.

**It is text first.** Every row is a list item with the kind ("Task" / "Milestone"), the title (a link to the task) and the **dates written out** (and "Past its date" when late); the bar is a picture of those words and is `aria-hidden`. Below 48 rem the words come first and the bar sits under them (a vertical list on a phone); from 48 rem the bar sits beside the words. There is no chart library and nothing moves, so reduced motion has nothing to take away (a test checks the stylesheets have no animation or transition). Dates are edited in the task's form, not by dragging.
