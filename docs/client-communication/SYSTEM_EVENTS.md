# System events

A system event is a message that **nobody wrote**: a key and a few facts, shown to the customer (in their language) as a line in their activity feed and, for a conversation about a project, inline in that conversation's timeline. They exist so the customer sees the platform's activity in one place; they are **mirrors of records that already exist**, never new facts.

## The principle: one source of truth, mirrored once

The four modules that already keep an append-only history (project events, deliverable events, booking events, quote events) write their own line exactly as before, in the same transaction as the fact. After it, each makes **one call** (`mirrorProjectEvent`, `mirrorDeliverableEvent`, `mirrorBookingEvent`, `mirrorQuoteEvent`) with the new line's id. The mirror then **reads the line back** (its type, whether the customer may see it, the few customer-visible words) and does not take anything from the caller. The business rule is not copied; the line is the truth.

## What is mirrored

| Event key | From | Params (what the page shows) |
| --- | --- | --- |
| `project.created`, `project.status_changed` | project events (customer-visible) | project name; the new status |
| `milestone.completed` | project events | the milestone's title |
| `task.submitted`, `task.accepted`, `task.changes_requested` | project events | the task's title |
| `deliverable.published`, `deliverable.feedback_submitted`, `deliverable.changes_requested`, `deliverable.approved` | deliverable events (customer-visible, and the deliverable is published) | title, reference, version, count |
| `consultation.confirmed`, `.rescheduled`, `.cancelled` | booking events, **only for a booking linked to the customer** (`customer_links`) | reference, the moment (UTC) and the zone |
| `quote.sent`, `quote.accepted` | quote events, **only for a request linked to the customer** | request and quote references |
| `conversation.resolved`, `.reopened`, `.archived`, `.resolution_requested` | the conversation itself | who (`owner` / `customer`) |

Everything else the modules record (internal lines, reminders, anything not on the list) is **not** mirrored. A line the customer may not see is not mirrored.

## Why none is invented

* **Only a line written *now* calls the mirror.** Nothing walks old history, so no event appears for something that happened before the feature existed, and no backfill exists.
* **Idempotency.** The message's `idempotency_key` is `<source>:<line id>` and is `UNIQUE`; the insert says `ON CONFLICT DO NOTHING`. A handler that runs twice, a retried request and a replay write one event.
* **Never throws, never undoes the fact.** A mirror runs inside a savepoint and swallows any failure: the fact stands and the event is simply missing. A test **breaks the table on purpose** and checks that the project, deliverable, booking and quote acts still succeed.
* **No automatic creation.** A feed is created when its first event arrives (one per customer and project, by a unique index); no project is created, no thread is started, nobody is e-mailed because of an event.
* **No free text of anybody's.** An event carries a key and the few facts a customer already sees on the matching page (a title, a reference, a number, a status). The words that explain it come from the dictionary in the reader's language; an unknown key is shown as a neutral line, never as raw data.
* **A booking or a quote request is shown only to the customer it was linked to**, by the owner's or the customer's explicit act. An unlinked booking has no customer, so it produces nothing.

## Where they appear

* **Activity feed** (`ACT-…`): the customer's *Project activity* entries in the inbox, read only, never unread.
* **Inline in a project's conversations**: the feed's events *after the conversation began* (by `seq`), so the timeline reads as one story: the words and what happened around them.
* **The owner's timeline** shows the same events.

## What an event never does

It is **never unread** (an event is context, not a question), **never changes a conversation's status**, **never sends an e-mail** (the module that made the fact already sends what it sends), and **never carries a private note's words**.
