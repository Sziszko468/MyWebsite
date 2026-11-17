# Notifications

The conversation system sends e-mail **through the existing outbox** (the same table, worker, retries, `Reply-To`, status page and e-mail provider as every other notification). No new provider, no new queue. **No e-mail was sent for real while this was built**: every test runs against the test mailer and the file/mock transports.

## The six e-mails

| Kind (`email_deliveries.kind`) | To | When | Subject (English) |
| --- | --- | --- | --- |
| `client_message_reply` | the customer | the owner's reply **starts a wait** (the thread was not already waiting for the customer) | *We have a message for you[: Project]* |
| `client_message_announcement` | the customer | an announcement (always) | *An announcement[: Project]* |
| `client_message_important` | the customer | a reply the owner marked **important** (always) | *An important message[: Project]* |
| `client_conversation_resolved` | the customer | the owner sets *resolved* | *We resolved a conversation[: Project]* |
| `message_received_admin` | the owner (`NOTIFY_TO`, in `NOTIFY_LANGUAGE`) | a customer's message **starts a wait** (the thread was not already waiting for the owner), or the customer starts a thread | *A customer wrote[: Project]* |
| `resolution_requested_admin` | the owner | a customer asks for resolution (once) | *A customer asked to resolve a conversation[: Project]* |

All six exist in **Hungarian, English and Dutch**. The customer's e-mail is in the language saved on their account; the owner's is in `NOTIFY_LANGUAGE`.

## What an e-mail says, and what it never says

It says **that** something new is waiting and **where** (a button to the conversation in the portal, or in the administration for the owner), and names the project and the conversation reference (to the owner also the customer's name, and `Reply-To` is the customer's address).

It **never contains the text of a message, the subject of a conversation, a private note, a file name, or the fact that the other side has read anything.** The intro even says it: *"We do not put its text in an email: sign in to read it."* A private conversation is not something to send through other people's mail servers. A test asserts that none of those words are in the e-mail, the outbox row or any log line.

The words are written **at the moment of sending**, from the record (`customers/mail.ts`), not stored in the outbox. If the line was removed or is only the owner's by then, or the customer was switched off, **nothing is sent** (the outbox marks the row `cancelled`: *"the record this message was about no longer exists"*).

## Once only, and not a flood

* The outbox allows **one e-mail per `(related_type, related_id, kind)`** (`idx_email_once_per_submission`), and `related_id` is the *message's* id. A retried request, a double click or a handler that runs twice cannot make a second e-mail. The send itself carries a `clientToken`, so the same send twice is one message.
* **Five messages in a row are one e-mail, not five**: a message e-mails the other side only when it *starts a wait* (the status was not already waiting for that side), or is an announcement, or was marked important. The customer is e-mailed again only after they have answered and the owner writes again.
* Events, private notes, removals, edits, *archived* and *reopened* e-mail **nobody**.

## Two gates, and the owner's is the wider

A message is queued only if **both** allow it:

1. **The owner's switches** (*Work settings → Messages and conversations*, administrator only): replies, announcements, important messages, resolutions (to customers); new customer messages, resolution requests (to the owner). A message switched off here is never sent, whatever the customer chose.
2. **The customer's own choices** (*Messages → Email notifications*): replies, announcements, important messages, resolutions. All on until they say otherwise; validated on the server; apply to that customer alone (`customer_message_preferences`).

A disabled customer account gets nothing, and no recipient is invented: with no `NOTIFY_TO` the owner's e-mails are simply not queued, and a conversation works exactly the same without e-mail configured.

## Logs and failures

Queueing never throws into the act that caused it (a conversation works when e-mail does not). The outbox's own failure handling, retries and alerts apply unchanged. The request log carries only the method, the route *pattern* (`/api/portal/messages/:reference`, never the real reference or a query string), the status and the time; the notifier logs the *kind* of a message. The notification tests read every log line for the words of a message, its subject and a private note; they assert nothing about addresses, so that is not claimed here.

## What was not done

No real e-mail was sent, no provider account or DNS was touched, and the **real rendering in mail programs was not checked** (only the HTML/text produced and the three languages' wording). Delivery and the sender domain remain the owner's open items from the earlier prompts; see LAUNCH_CHECKLIST.md.
