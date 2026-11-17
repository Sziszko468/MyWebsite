# Conversation workflow

The rules are in one file, `server/src/modules/communications/service.ts`. Every act runs in **one transaction**, on a conversation read again inside it, so two people acting at the same moment are told apart by the database and not by luck. Who is acting is the session; a body that names a sender, a customer, a status or a visibility is refused.

## Two kinds of conversation

| Kind | What it is | Who writes in it |
| --- | --- | --- |
| `thread` | A conversation: a subject, words from the customer and the owner, optional private notes | the customer (when allowed) and the owner |
| `activity` | A customer's **activity feed**, one per customer and project (and one with no project for consultations and quotes that have none) | nobody: only the platform, by mirroring facts (SYSTEM_EVENTS.md). Read only. |

A reference is `MSG-XXXXXXXX` (threads) or `ACT-XXXXXXXX` (feeds): random, unique, and not a counter, so nothing can be guessed or counted from it.

## Statuses

| Status | Meaning | Set by |
| --- | --- | --- |
| `open` | Nobody is expected to answer (an announcement started it, or the owner reopened it by hand) | the owner |
| `waiting_owner` | The customer wrote last: the owner is expected to answer | a customer's message |
| `waiting_customer` | The owner wrote last: the customer is expected to answer | the owner's text |
| `resolved` | Finished; the customer was told | the owner |
| `archived` | Put away; takes nothing new from the customer | the owner |

* **A customer's text** moves the thread to `waiting_owner`. **The owner's text** moves it to `waiting_customer`. A second message from the same side changes nothing (and sends no second e-mail).
* **An announcement and a private note change nothing.** An announcement expects nobody; a note is a record for the owner.
* **A message in a `resolved` thread reopens it** (to `waiting_owner` or `waiting_customer` by who wrote), and the timeline says so with an event written *before* the message that caused it, so it reads: resolved, reopened, the words.
* **An `archived` thread takes no text, no announcement and nothing from the customer.** The owner reopens it first. A private note is always allowed.
* **The owner may set any status by hand** (`POST …/:reference/status`, with the revision they saw). Setting the one it already has is refused; a stale revision is refused with *"changed by someone else — reload"* (`409`).
* **The customer can only ask.** *"Request resolution"* records the request once (asking twice is asking once), writes one event, and e-mails the owner. It is **not** a status: the owner decides. A status the owner sets by hand clears the request; a message does not.

## Starting a conversation

* **The owner** can start one with any customer (a subject and a first message, optionally about a project, deliverable, task, booking or quote of that customer). The first message may be a normal text (the customer is expected to answer: `waiting_customer`) or an announcement (`open`), and may be marked important.
* **A customer** can start one **only if the owner switched on *Customers may start conversations*** (off by default). The context can only be a record they can see in the portal (`resolveContext` looks it up *through the customer*; a stranger's project and a missing one give the same refusal).
* The same submission twice (a double click, a retry, a second tab) is **one** conversation: every send carries a `clientToken`, and the unique index and the lookup return the first one.
* Limits for a customer: at most **10** threads waiting for an owner's answer, **300** in all; **2000** messages in a thread (then *"start a new one"*).

## Messages

| Kind | By | Visible to | Status effect | E-mail |
| --- | --- | --- | --- | --- |
| Reply | customer or owner | both | as above | the other side, **only if it starts a wait** |
| Important reply | owner | both | as a reply | the customer, always (their *Important* choice) |
| Announcement | owner, after confirming | both | none | the customer, always (their *Announcements* choice) |
| Private note | owner | **the owner only** | none | none |
| Event | the platform | both | none | none |

* **Words**: 1 to 4000 characters (the database allows 5000 as a last line of defence), line breaks kept, no control characters, never trimmed into nothing. A subject is 1 to 200 characters on one line.
* **An announcement needs `confirm: true`.** The admin screen asks *"This is sent to the customer by e-mail and cannot be taken back"* and the server refuses an unconfirmed one (`422 consentRequired`).
* **Removing**: the owner can remove **their own** message or note. The record keeps the line; the customer sees *"A message was removed"*, never what it said. **A customer's message is never removed** by anybody (it is the customer's word). **Editing**: the owner can edit **their own private note**; a message the customer can see is never edited (a correction is a new message).
* **A disabled customer account** takes no message from either side (the owner can still write a private note).

## What a status change e-mails

Only *resolved* e-mails the customer (once, if both switches allow it). *Archived*, *reopened* and *open* tell nobody. See NOTIFICATIONS.md.
