# Notifications

The work uses the **existing outbox** (`email_deliveries`, the notifier, the retry and the provider's notifications). No second sender exists. Messages are written **at the moment of sending** from the record they are about, in the language of the person they go to, as an HTML part and a plain-text part, through the same layout and escaping as every other e-mail of the site. **In this work, nothing was sent anywhere**: the tests use a recording mailer and the browser journey the `file` provider.

## The seven messages (`notifications/workTemplates.ts`, HU / EN / NL)

| Kind | To | When | What it carries | About (the outbox's once-only key) |
| --- | --- | --- | --- | --- |
| `client_action_assigned` | the customer | the owner gave them a request | the project, the task's title, the owner's words for the request, a link | the line of history |
| `client_action_due_soon` | the customer | the request is still open and its date is within *N* days | the project, the title, the date, a link | `<action id>:<date>` |
| `client_action_overdue` | the customer | the date has passed (**off unless switched on**) | the same | `<action id>:<date>` |
| `client_action_submitted_admin` | **the owner** (`NOTIFY_TO`) | a customer answered | the project, the title, **who** answered (so the owner can reply to them), a link to the project in the administration; **not** the answer's words | the line of history |
| `client_action_reviewed` | the customer | the owner accepted the answer | thanks, no further work | the line of history |
| `client_action_changes_requested` | the customer | the owner asked for changes | **the owner's words for the customer** | the line of history |
| `client_milestone_completed` | the customer | a milestone **they can see** was completed | the milestone's title | the line of history |

A message never contains a private note, a task's internal description, another customer's anything, or a promise (no time for an answer, no outcome of a review). A task the customer cannot see is never written about: if it was hidden between queueing and sending, the message is **cancelled**, not sent.

## The owner's choices (`/admin/work/settings`, administrator; stored in `settings`)

| Choice | Default |
| --- | --- |
| Tell the customer when a request is given | **on** |
| Remind them when the date is near (and how many days before: 1–30, default 3) | **on** |
| Remind them when the date has passed | **off** (a reminder about a missed date is a decision) |
| Tell the owner when a customer answers | **on** |
| Tell the customer their answer was accepted | **on** |
| Tell the customer changes are requested | **on** |
| Tell the customer a milestone they can see is completed | **off** (completing a milestone has always been silent; it stays so until switched on) |
| Tell the customer about important **project** status changes | **on** (what it always did) |

Changes of a *task's* status are **not** e-mailed: the customer sees them on the page. Every choice is validated (a boolean, or an integer 1–30), unknown choices are refused, and an editor can read them but not change them.

## Reminders (`projectwork/reminders.ts`)

Run by the **daily maintenance** (also `npm run server:maintenance`, and the "run maintenance" button of the system page). For each request that waits for the customer (`not_started` or `changes_requested`) on a **shared**, unfinished task with a date, in a project that is not on hold, finished or cancelled, for a customer who is not switched off: if today (the owner's zone: [TIMELINE.md](TIMELINE.md)) is within *N* days of the date, one "due soon"; if it has passed and the owner switched it on, one "overdue".

**Idempotent by construction:** a reminder is about **one request on one date** (`<action id>:<date>`); the outbox allows one of each kind for it (a unique index); the pass looks before it queues; so running the pass twice in a day, restarting the server or running it by hand makes no second message (tests). A date that **moves** is a new date and gets its own reminder; the old one is never repeated. A reminder queued whose reason disappears before it is written (the customer answered, the task was finished or hidden, the date moved) is **cancelled at that moment** (test). The pass reports what it queued (`workReminders: { dueSoon, overdue }` in the maintenance result).

## What the owner can see

*E-mails* tab of a project's workspace: every message the work queued for that project, to whom, and its state in four words that do not overclaim: **Queued** (waiting or being retried), **Handed to the provider** (accepted), **Delivery confirmed by the provider** (only when the provider's own notification said so), **Did not go through** (failed, bounced, complained or cancelled), with the error. The site never says "delivered" on its own authority (a test of the administration's texts enforces it).

## Failure, retention and erasure

A message that cannot be queued is logged and **never undoes** the change it announces (the same rule as everywhere). Provider failures use the existing retry, backoff and the owner's alert about a message that did not get through. Erasing a customer deletes the e-mails about their projects, including the reminders (`email_deliveries` rows of `client_project_event` and `client_action_reminder`); the age-based clean-up of the delivery log is unchanged.

## What was not verified

Nothing was sent to a real provider; the real provider's rendering in real mail clients was not looked at; the DNS for the sender (the platform audit's finding E-1) is the owner's open item. HU / EN / NL wording passes the site's checks (completeness, placeholders, glossary, register, spelling) but **was not proofread by native speakers**.
