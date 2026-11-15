# Customer actions

A **customer action** is something the owner asks of the customer ("send us your logo", "which of these two do you prefer?", "please approve the design") attached to **one shared task**, and the customer's answer to it. The task is the work; the action is the customer's part of it. "This task requires a customer action" is **derived** (the task has an action and the customer is the one who has to move it), never stored twice.

## Kinds

`provide_content`, `answer_question`, `confirm_direction`, `review_deliverable`, `approve_stage`, `other`. The kind is a label for the customer and the owner; it changes no rule.

## States and who moves them

| Status | Who has to move | The customer sees |
| --- | --- | --- |
| `not_started` | the **customer** | "Waiting for your answer" and the form |
| `submitted` | the owner | "Sent" (the answer is shown; no form) |
| `under_review` | the owner | "Being reviewed" |
| `changes_requested` | the **customer** | "Changes requested", the owner's words, and the form again |
| `accepted` | nobody (final) | "Accepted" |
| `cancelled` | nobody (final) | "No longer needed" |

**Moves** (`ACTION_TRANSITIONS`): `not_started` → `submitted` (the customer) or `cancelled`; `submitted` → `under_review`, `accepted`, `changes_requested`, `cancelled`; `under_review` → `accepted`, `changes_requested`, `cancelled`; `changes_requested` → `submitted` (the customer) or `cancelled`; `accepted` and `cancelled` go nowhere. **The customer's only move is to answer.** An answer to anything that is not waiting for one is `409 not_awaiting_response`; to a finished task or a finished or cancelled project, `409 task_finished`.

## What the owner can do (`clients:projects`; an editor too)

* **Give the request**: only for a task that is **shared** (`task_hidden` otherwise), not finished, in a project that is not finished or cancelled, and that has none yet (one per task). It writes the first transition, a line for the customer (`action_assigned`) and, if the owner's choices say so, the e-mail.
* **Reword it** while the customer has not answered it (before the first answer, or after a request for changes).
* **Start the review**, **accept**, **ask for changes**, **cancel**. Accepting may also **complete the task**, only if asked (`completeTask`), and is refused as a whole if the task still waits for something. **Asking for changes requires words for the customer** (3 to 1000 characters): the customer must be able to see what to change. Every move may carry the owner's **private note**.

## What is kept, and what is not shown

* **Answers are immutable.** A customer's answer is a row of `project_action_submissions` with its revision; a new answer after a request for changes is the **next revision**, never an edit. A trigger refuses any update. Every revision is shown to the customer ("Your answers so far") and to the owner.
* **Every move is a row** of `project_action_transitions`: who (owner, customer or system), from, to, the revision, the words for the customer, the private note, when. Append-only. The same moment writes a line of the project's history.
* **The private note is never shown to the customer.** It is stored in its own column that the customer's queries do not select (`internal_note`), it is not in any customer endpoint, timeline or e-mail (a test puts a marker word in it and looks for it in every page, every API answer and every e-mail), and the owner's notes about a *task* live in their own table.
* **An answer is text.** Up to 5000 characters, cleaned, stored as written and **shown as text** (React escapes it; the e-mails escape it; a test sends `<script>` and `<img onerror>`).

## Why there is no file upload

The site has **no private place to keep a file** (the same reason documents cannot be published: [../client-portal/DOCUMENTS.md](../client-portal/DOCUMENTS.md)). An upload endpoint without one would either store a customer's file somewhere public or in the database unscanned. So the form says plainly, in all three languages, that **a file cannot be attached here**: the customer writes what is needed in the answer and the owner agrees with them how the file is sent. When a private store exists, an attachment can be added to `project_action_submissions` without changing anything else.

## The customer's pages

`GET …/tasks/:task` returns the shared task, its request (kind, the owner's words, status, who has to move it, whether the customer can answer now, the latest request for changes in the owner's words), the customer's answers and the history **in the customer's words only** (`customer_note`; the private note is not in the query). The form: a labelled textarea, a character count, an error that says what is wrong (empty, too short, too long, no longer open), focus moved to the confirmation when it is sent, the form gone afterwards. A double click or a second tab changes nothing the second time (a conditional UPDATE; a test sends three at once).

## Moves the system makes by itself

Two, both written as a line of the task's history by the system: a task that was *waiting for the customer* goes to *in review* when the customer answers, and a task *in review* goes to *waiting for the customer* when the owner asks for changes (see [TASK_WORKFLOW.md](TASK_WORKFLOW.md)). Nothing is completed or cancelled by the customer's answer.
