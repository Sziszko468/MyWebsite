# Action catalogue

The brief named five candidates and said not to assume they are safe because they are technically possible. Each was read against the code that would carry it out (`customers/projects.ts`, `quotes/status.ts` and `quotes/admin.ts`, `bookings/admin.ts`, `communications/`), and for each the question was: *what could this do that the administrator did not see when they approved it?* Where the answer was "something that reaches a customer, or cannot be undone, or widens what the public can do", the action was narrowed until the answer was "nothing", or left out.

Every supported action:

* is proposed with the permission it needs, checked with the **current role** at proposal, at approval and again immediately before it runs;
* has a **closed set of parameters** (an unknown key is refused; a text is cleaned, length-limited, and refused if it contains an amount of money or anything that looks like a secret or a card number);
* is carried out by an **existing business function** with `notify: false` (and `show: false`), under the approving administrator's own session: **no action sends an e-mail or a message**;
* is assessed again, with a fingerprint of the state it depends on, at approval and before execution.

| Action | Needs | Second confirmation | Reversible | The customer sees it | Service |
| --- | --- | --- | --- | --- | --- |
| `communication.draft_reply` | `clients:read` | never | not applicable (nothing changes) | no | none |
| `project.note_add` | `clients:projects` | never | **no** | no | `customers/admin.ts` `addProjectNote` |
| `project.status_change` | `clients:projects` | **when the target is Completed or Cancelled** | partly | **yes** (the portal; no e-mail) | `customers/admin.ts` `setProjectStatus` |
| `quote_request.triage_status` | `requests:write` | never | partly (nothing returns to New) | no | `quotes/admin.ts` `changeStatus` |
| `consultation.close_days` | `system:write` | **always** | yes | **yes** (what can be booked) | `bookings/admin.ts` `closeDays` |

## 1. Draft a customer reply — `communication.draft_reply`

* **Judgement.** Supported, because the safe form is the whole point: *keep* a draft, never send one. There is no draft storage in the communications module, so the draft stays with the action; approving it records the administrator's acceptance of the wording and makes it available to copy. The administrator sends it themselves from the conversation page, through the ordinary, separate sending workflow.
* **Permission.** `clients:read` (the same as the read-only draft tool).
* **Parameters.** `language` (hu, en or nl), `adminAskedForThisLanguage` (boolean), `draft` (10–4,000 characters), and on every proposal the target conversation (by reference, inside the context) and the assistant's `reason`.
* **Validation.** The draft is in the customer's preferred language unless the administrator asked for another; no amounts of money, discounts or secrets; the conversation must exist and be reachable from the context. Private notes are never read.
* **Affected records.** The conversation (read only).
* **Side effects.** None on any record. Nothing is sent. `execute` writes nothing to a customer record.
* **Reversible.** Not applicable.
* **Second confirmation.** No.
* **Stale if** the conversation's status, its last message time or the customer's language changed since the proposal (the customer wrote again, so the draft may no longer fit).

## 2. Add an internal project note — `project.note_add`

* **Judgement.** Supported: internal, no e-mail, no portal line. **Not reversible**, because the administration has no way to delete a project note; that is stated on the proposal. The existing note function does not write a history line either.
* **Permission.** `clients:projects`.
* **Parameters.** `projectRef` (a project reference), `body` (2–2,000 characters), `reason`.
* **Validation.** The project must exist and be inside the conversation's context; no amounts, secrets or card numbers.
* **Affected records.** One new row of `client_project_notes`, authored by the approving administrator.
* **Side effects.** Internal only; not shown to the customer; no e-mail.
* **Second confirmation.** No (internal, low risk).
* **Stale if** the project's status changed.

## 3. Change a project's status — `project.status_change`

* **Judgement.** Supported, narrowed. "Prepare a project status update" could mean a message to the customer; that (the project's *update post*) is **not** supported (customer-facing text that was not assessed). A **status change** is: the customer sees the new status (and an optional short note) in their portal, as they do for any change, but the action always passes `notify: false`, so **no e-mail is sent**, even for a status the platform would normally e-mail about (`review`, `finalization`, `completed`, `on_hold`, `cancelled`, `waiting_customer`).
* **Permission.** `clients:projects`.
* **Parameters.** `projectRef`, `status` (one of the project statuses), `customerNote` (optional, 2–500 characters, no amounts or secrets: *the customer will read it*), `reason`.
* **Validation.** Only a move the project's own rules allow (`PROJECT_TRANSITIONS`: a working phase may move to any other status; a finished project can only be put back on hold; nothing moves to its own status).
* **Affected records.** The project's status; its start date is set to today when it first leaves *awaiting start* for a working phase; its completion time is set when it becomes *completed*; one line is added to the project's history (customer-visible), under the approver's name.
* **Side effects.** The customer sees the status and the note; no e-mail; history line; a terminal status can afterwards only be put back on hold.
* **Reversible.** Yes for a move between working phases; **partly** when it ends a project (only *on hold* follows) or sets the start date.
* **Second confirmation.** **Yes when the target is Completed or Cancelled.**
* **Stale if** the project's status, start date or completion time changed.

## 4. Quote request working status — `quote_request.triage_status`

* **Judgement.** The brief said "a quotation status change, if the existing business rules allow it". The **quotation** (a version of an offer: draft, sent, accepted, declined, superseded, withdrawn) does **not**: sending it e-mails the customer and binds the studio, accepting or declining is the customer's own act, and withdrawing ends the customer's links. What the existing rules *do* allow safely is the **quote request's internal working status**, narrowed to triage: from *new*, *under review*, *waiting for the customer* or *quote preparation* to one of *under review*, *waiting for the customer*, *quote preparation*.
* **Permission.** `requests:write`.
* **Parameters.** `quoteRef`, `status` (`under_review`, `waiting_customer` or `quote_preparation`), `reason`.
* **Validation.** The request exists, is inside the context, is not archived, is in one of the source states, and `checkManualMove` allows the move. `quote_sent`, `accepted`, `declined`, `in_progress`, `completed` and `cancelled` are never targets: *cancelled* would withdraw a sent quotation; *accepted* and *declined* are the customer's; the others are the studio's decisions.
* **Affected records.** The request's status; one line in its history.
* **Side effects.** Internal only; not shown on the customer's status page; no e-mail. A request cannot be moved back to *new*.
* **Reversible.** Yes between the three states; **partly** from *new* (it cannot return).
* **Second confirmation.** No.
* **Stale if** the request's status or archived state changed.

## 5. Close days for consultations — `consultation.close_days`

* **Judgement.** The brief said "a consultation availability change, if the booking rules allow it". `saveHours` replaces the **whole** weekly set and every exception at once, which an assistant has no business doing. The safe change is the smallest one that only takes availability away: **close a run of days** (one `closed` exception, the same row the hours editor writes). It cannot open extra time, cannot change the weekly hours or the settings, and is **refused if any booking, or any held reschedule time, falls inside the days**. Existing bookings are never touched.
* **Permission.** `system:write` (the same as the hours editor): the administrator, not the editor.
* **Parameters.** `startDate`, `endDate` (`YYYY-MM-DD`, the same day for one day), `label` (optional, ≤ 120 characters), `reason`. General business context only (not from a conversation about one record).
* **Validation.** A scheduling time zone is set; the dates are valid, in order, not in the past (in that zone), at most 31 days long, at most 366 days ahead; there are fewer than 300 exceptions; no booking in the range.
* **Affected records.** One new row of `availability_exceptions`; one `booking.closed_days` audit line.
* **Side effects.** Customers cannot book those days; no e-mail; no existing booking changed (there is none).
* **Reversible.** Yes: the exception is removed in the consultation hours editor.
* **Second confirmation.** **Always** (it changes what the public can book).
* **Stale if** any exception was added or removed, the time zone changed, or a booking appeared in the range.

## Not supported, and why

These are in the catalogue the screen shows (*What it can do* → *What it will not do*) and in `UNSUPPORTED` in the code; an assistant asked for one says so.

| Not supported | Why |
| --- | --- |
| Send a message to a customer; send an e-mail | It reaches a customer. The brief allows a separately approved communication workflow; none was built, so the assistant can only draft. |
| Send, accept, decline, withdraw or expire a quotation | Binding on the studio and customer-facing; accepting and declining are the customer's own acts. |
| Create or change a quotation or any price | The assistant never sets money. |
| Confirm, cancel or move a consultation booking | Each e-mails the customer. |
| Open extra consultation time; change the consultation settings or weekly hours | Widens what the public can book / changes how the system is set up. |
| Change a project's milestones or tasks; post an update to the customer | Not assessed. (A milestone completion is e-mailed to the customer by default; an update is customer-facing text.) |
| Delete anything | Cannot be undone. |
| Change roles, permissions, accounts, settings, keys or secrets | Security. |
| Make or record a payment | Financial. |
| Change hosting or deployment | Infrastructure. |
| Run code, queries or commands, open files or addresses | The assistant has no generic tools. |

## Adding an action later

An action is a new entry in `ACTION_TYPES`, `CATALOG` and the migration's `CHECK`, a new block in `actions.ts` (`parse`, `assess`, `execute`), a tool in `automation/tools.ts`, words in all three languages, and tests, including the permission, the stale state, the replay and the no-e-mail checks. The unit test that lists the dictionary against the server's own arrays fails until every code has its sentence.
