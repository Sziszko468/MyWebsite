# Task workflow

## Statuses

`backlog` → `planned` → `in_progress` → `in_review` → `completed`, with `waiting_customer`, `blocked` and `cancelled` as the other places a task can be. Priorities: `low`, `normal`, `high`, `urgent`.

**Moves** (`TASK_TRANSITIONS` in `projectwork/model.ts`; the tests check the table itself and then the moves through the real endpoint, allowed and refused):

| From | May go to |
| --- | --- |
| `backlog`, `planned`, `in_progress`, `in_review`, `waiting_customer`, `blocked` | any other of the eight (including `completed` and `cancelled`) |
| `completed` | `planned`, `in_progress`, `in_review` (a reopening) |
| `cancelled` | `backlog`, `planned` (a reinstatement) |

Nothing moves to the status it has. A task **starts open**: creating one as `completed` or `cancelled` is refused (create, then complete or cancel).

## The rules between a move and the rest of the data (`moveTask`)

1. **A task cannot be started, put in review or completed while something it depends on is open** (a predecessor is resolved when it is `completed` or `cancelled`). The answer is `409 blocked_by_dependency` and names the open tasks. `planned`, `blocked` and `waiting_customer` are not "starting the work", so a waiting task can still be planned.
2. **A task with a customer action that is still open cannot be completed** until the action is accepted or cancelled (`409 action_open`). Accepting an action may complete the task **in the same move, only when the owner asks** (`completeTask`), and is refused as a whole if the task still waits for something.
3. **Cancelling a task cancels its open action** in the same transaction (a transition and a line of history each).
4. **Completing a task never completes another.** What depends on it is only *released*: it keeps its status and shows no "waiting for" any more. Completing a **milestone** does not complete its tasks either.
5. **A task with an open customer action cannot be hidden** from the customer (`409 action_open`): the customer would be asked for something they cannot see.
6. A stale screen cannot move a task: `revision` in the request must match, else `409 stale`. The move is also a conditional UPDATE on the old status and revision, so two requests at once make one move.
7. Every move writes one line of history: `task_status_changed`, `task_completed` or `task_cancelled`, with who, from and to. The line is the customer's if the task is shared, the owner's alone if not.

The customer's answer can move a task by itself in exactly two cases, both recorded as a move by the system: a task that was `waiting_customer` goes to `in_review` when the customer answers, and a task in `in_review` goes to `waiting_customer` when the owner asks for changes. A system move goes round the dependency rule on purpose (a customer's answer never fails because of the owner's own plan).

## Editing

`PATCH` takes only the fields that exist (`title`, `description`, `customerDescription`, `priority`, `categoryId`, `milestoneId`, `startOn`, `dueOn`, `assignedTo`, `customerVisible`, `revision`); **a status is not editable here**, nor a completion time, a reference or a creator (`422`). A start date after the due date, a milestone or category of another project / a disabled one, and an unknown assignee are refused (`422`). An edit that changes nothing writes nothing and counts no revision. Editing writes one line for the owner (`task_edited`, naming the fields, never the values); sharing a task writes one line for the customer (`task_created`), because from their side it appears then.

## Dependencies

"A depends on B" means A cannot be started before B is done. **Refused:** a task on itself (`self_dependency`), a pair that exists (`dependency_exists`), a task of another project or one that does not exist (`404`), and **any loop** (`dependency_cycle`; the answer names the loop, for example `A → C → B → A`). The check is a breadth-first search in the application **and** a trigger in the database, so no other writer can make a loop. Adding a dependency to a task that has already started moves nothing: it shows what it now waits for. Removing a task removes its dependencies; the owner sees both directions on a task's page; the customer sees only the **shared** tasks a task waits for (a private one is never named).

## Bulk moves and order

`POST …/tasks/bulk-status` moves up to 100 named tasks to one status; **each task is its own transaction** and the answer lists, per task, whether it moved or why not (`blocked_by_dependency`, `invalid_transition`, `action_open`, `stale`, `not_found`). `POST …/tasks/reorder` puts the tasks **named** in the given order among the places they already held (a task left out keeps its place), so a filtered board can reorder what it shows without disturbing what it hides. On the board a card moves by drag and drop **or** by a menu on the card **or** by up / down buttons (each named after the task), so a mouse is never needed.

## Deleting

Only a task nobody has worked on: not a `completed` one, and not one the customer has answered (`has_responses`); those are history, cancel them instead. A line (`task_edited`, "deleted") stays; the customer's timeline never shows lines of a task that is gone or no longer shared.

## Filters, sort and search

By status (several), priority (several), category, assignee (`me`, `none` or a person), milestone, shared / private, overdue, waiting for the customer, to review; text search on title and reference (`%` and `_` are literal); sort by the owner's order, due date, priority, last change, title. All of it is parameterised SQL with fixed sort expressions; a test sends `' OR 1=1 --` and `%`.

## Progress

`percent = completed ÷ (all − cancelled)` over the project's **tasks**; if it has none, over its **milestones**; if it has neither, **`null`**, and the screens say *nothing to measure yet* instead of "0 %". It is counted by the server at the moment it is asked, from real records; no endpoint accepts a number. The owner sees two figures: everything recorded, and **what the customer sees** (which counts only shared tasks and visible milestones, so it cannot be used to find out how many private ones there are). "Overdue" uses the same definition of today as the reminders ([TIMELINE.md](TIMELINE.md)).
