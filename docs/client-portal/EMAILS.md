# Client portal: e-mails

The portal reuses the existing outbox (`email_deliveries`), the configured provider and the retry rules; it adds nine kinds of message in Hungarian, English and Dutch (`server/src/modules/notifications/clientTemplates.ts`, rendered by `modules/customers/mail.ts`). Nothing was sent to a real address, a real provider or from a real domain while building it: the tests use a recording mailer and the browser journey the `file` provider with addresses ending `.test`.

## The kinds

| Kind | To | About (`related_type` / id) | Sent when |
| --- | --- | --- | --- |
| `client_activate` | the invited customer | `client_auth` / the request for a link | the owner invites, or sends a link to an account that was never opened (72 hours by default) |
| `client_sign_in` | the customer | `client_auth` | the customer asks for a link and has an active account |
| `client_register` | the visitor | `client_auth` | an unknown address asks for a link **and** the owner opened registration |
| `client_email_change` | the **new** address | `client_auth` | the customer asks to change their address |
| `client_security_notice` | the customer (the **old** address for a change) | `client_audit` / a line of the account's history | an address change was asked for or done; a deletion was requested; the owner signed the customer out everywhere. **No link, no secret** |
| `client_project_created` | the customer | `client_project_event` | the owner creates a project (can be switched off per project) |
| `client_project_status` | the customer | `client_project_event` | a status change to an important status (or any, if the owner chooses); a question (`feedback`); an update the owner chose to e-mail |
| `client_document_published` | the customer | `client_document` | **reserved**: no document can be published yet |
| `client_deletion_requested_admin` | the owner (`NOTIFY_TO`, `NOTIFY_LANGUAGE`) | `client_audit` | a customer asks for their account to be deleted |

**Not e-mailed, on purpose:** a change of dates, a milestone, a private note, a working-phase status change (unless the owner says so), anything about a switched-off account, and any internal change. A customer never gets a message the owner did not cause or the customer did not ask for.

## Language

Each message is written in the language stored on its outbox row, which the sender set: the **page's language** for a link the customer asked for (what they just chose), the **account's language** for everything else (the owner chooses it when inviting; the customer can change it in the profile). The link's own path carries that language (`/nl/client-portal/verify#…`), so the portal opens in it. Nothing falls back to another language; a status or a category has a word in every language (a test).

## Idempotency and retries

- **One message per kind per thing it is about**: a unique index over `(related_type, related_id, kind)` lists every portal kind. A retried request, a double click or a handler that runs twice cannot make a second message (a test queues every event twice and counts the rows). The owner's *send again* reuses the row.
- A message is **written when it is sent**, not when it is queued: the outbox keeps only the kind and what it is about. A message about something that was **erased** since, or about an account that was **switched off**, is cancelled instead of sent (a test).
- **Retries** follow the outbox's schedule (1, 5, 30, 120, 720 minutes; `EMAIL_MAX_ATTEMPTS`). A retried sign-in link gets a **fresh secret** and the earlier one stops working, so only the newest message's link is live (a test: first attempt fails, second succeeds, the first secret is dead).
- A security notice is queued **inside the transaction** that writes the history line it is about, so it cannot exist without it and a rolled-back change sends nothing.

## What is never claimed

A message is "accepted" by the provider, never "delivered", until a signed provider event says so (the existing webhook). The portal's pages say "we will send", never "we have sent"; the privacy notice says acceptance is not arrival. The administration's list of messages shows the real state and the recipient; it shows **no body and no secret**.

## Safety limits

At most **5 links per address per hour** are queued (further requests answer the same and send nothing); a change of address at most 3 per hour per account; the sender is the verified `EMAIL_FROM`, the reply goes to the public contact address, the owner's own notice has the customer as Reply-To.

## What was not verified

Real delivery, SPF/DKIM/DMARC (finding E-1 is still open: [../audit/EMAIL_AUDIT.md](../audit/EMAIL_AUDIT.md)), how the messages look in real mail programs (a Gmail, Outlook or Apple Mail rendering was **not** checked; the layout is the one the quote and booking mails already use), whether a corporate mail scanner prefetches the link (it cannot spend it: only the button does), and native-speaker proofreading of the Hungarian and Dutch texts.
