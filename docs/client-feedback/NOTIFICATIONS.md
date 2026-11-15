# Notifications

Seven messages, all through the **existing e-mail outbox** (`email_deliveries`, the notifier, the retries and the provider settings of the e-mail module). **Nothing was sent to a real address while building or testing this**: the tests use a recording mailer and the browser journeys use the `file` provider (messages are `.eml` files in a folder), with addresses that end in `.test`.

| Kind | Goes to | When | What it holds |
| --- | --- | --- | --- |
| `client_deliverable_ready` | the customer | the **first** version of a deliverable is published | the project, the deliverable, version, a button into the portal |
| `client_deliverable_new_version` | the customer | a **later** version is published | the same, with the new version's number |
| `client_deliverable_approval_requested` | the customer | the owner asks for approval | the same, and the owner's word if there is one |
| `client_deliverable_reply` | the customer | the owner replies to a thread | the same, and the reply |
| `deliverable_feedback_admin` | the owner | the customer **sends** their feedback | the customer, the deliverable, version, **how many comments** (not their text), a button into the administration |
| `deliverable_changes_requested_admin` | the owner | the customer asks for changes | the same, and the customer's **explanation** |
| `deliverable_approved_admin` | the owner | the customer approves | the same, naming the exact version |

## Rules

* **Once.** Each message is about **one line of the deliverable's history** (`related_id` is the event's id) and the outbox's once-only unique index `(related_type, related_id, kind)` allows one of a kind per line. A retried request, a double click, a handler that runs twice, or the notifier running again cannot make a second one. A new version is a new line, so it gets its own message.
* **Idempotent and retried by the outbox** like every other message: an unsent one is retried; a delivered one is never re-sent.
* **The customer's language** (Hungarian, English or Dutch, from their account). **The owner's** is `NOTIFY_LANGUAGE`. The words are written at the moment of sending from the record, so a changed wording applies to messages not yet sent.
* **No private data.** The messages carry the *customer's* words and the owner's words *for the customer*, never the internal description, a private note, a draft, another customer's name, or an administrator's address. Tests send a journey through every message and search them (and every page and log line) for private words.
* **Text is text.** Markup in a title, a comment, a reply or an explanation is escaped in the HTML part and printed as typed in the plain part; the journey checks that `<b>…</b>` from a customer is never live in an e-mail.
* **The owner's mail** is addressed to `NOTIFY_TO`, with the **customer as Reply-To** (never as sender), as the existing owner notifications are.
* **No link carries a secret.** The button leads to the portal's or the administration's page; the customer signs in there as always. (There are no magic links in these messages.)
* **A switched-off customer** gets nothing; an account that was erased has its messages deleted with it.
* **Nothing is claimed that was not confirmed.** The administration says a message was *queued*; it says *delivered* only with a provider's confirmation, as the rest of the e-mail module does.

## The owner's choices

*Administration → Work settings → E-mails about deliverables* (administrator only): seven switches, **all on by default**, saved under `deliverables.settings`. A switch off means the message is **not queued at all** (not queued-then-skipped), so turning it on later does not send old messages. The bodies are validated (booleans only, unknown keys refused). An editor can work with deliverables but cannot change these choices.

## What is deliberately not sent

* No e-mail when the customer **saves a draft**, edits one, or **withdraws** an approval request, or when the owner makes a private note, edits a draft, or archives (the customer reads the page).
* No reminder or "nobody has answered" e-mail: nothing here promises or measures an answer time.
* No e-mail to a customer about **their own** actions.

## Failure behaviour

Writing to the outbox never makes an action fail: `tellCustomer`/`tellOwner` do not throw, and the action's own transaction has already decided. A message that cannot be sent is retried by the outbox and stays visible in the administration's e-mail list.
