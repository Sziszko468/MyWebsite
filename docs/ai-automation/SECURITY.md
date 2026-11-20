# Security

The design assumes the model can be wrong, manipulated by text it reads, or hostile. The rules of conduct in its instructions are written so that a model that follows them behaves; **the boundaries that matter are enforced by the server whatever the model says or is told.** The strongest test of that is in `server/test/aiAutomationChat.test.ts`: a scripted model that obeys an injection, invents tools, passes fields it was never given and claims to have done what it only proposed — and the database shows a proposal waiting, nothing changed.

## What the assistant cannot do, and what stops it

| The assistant must not… | What stops it |
| --- | --- |
| Execute anything on its own | There is no tool that approves, rejects, cancels or runs. The proposal tools write one row of `ai_actions` (`awaiting_approval`) and nothing else. The approval is a `POST` on a route that needs an administrator's cookie session and CSRF token; no tool, chat message or `GET` reaches it. |
| Treat "looks good" as approval | A chat message is a chat message. The approval needs the payload hash shown on the action's page and a key for the decision, sent by the approval control. The tool's answer and the instructions both say so. |
| Grant permissions, change roles, touch accounts or security settings | None of these is an action or a tool; they are in the unsupported list. No new permission was added. |
| Read secrets or API keys | No tool reads settings or the environment. Every tool result passes `checkToolOutput` (no key named like a secret, no credential-looking text); texts the assistant writes are refused if they look like a secret or a card number. |
| Run SQL or code, read files, fetch addresses | There is no such tool, and no input of any tool accepts SQL, a path or a URL. Inputs are strict objects: an unknown key (`adminId`, `approved`, `status`, `sql`, `path`, `url`) makes the call invalid before it reaches the server's code. |
| Send e-mail or a message | Not an action. Every business function an action calls is called with `notify: false` (and `show: false`); tests count the outbox before and after each action. |
| Make payments or move money | Not an action; the assistant never writes an amount: a draft, a note, a customer note, a label and a reason are refused if they contain an amount, a discount or a percentage off. |
| Delete customer, project, quotation or consultation records | Not an action. The `ai_actions` tables themselves cannot be deleted from (triggers). |
| Change infrastructure or deployment | Not an action; nothing in the module reads or writes configuration. |
| Escalate to another administrator's data | Every tool call re-reads the session and role and re-resolves the conversation's context; a target outside the context is "not found"; an action is visible only to its administrator (or one who may read the system); another administrator's action is a `404`. |
| Pick a model | Claude Haiku 5.5 is a constant in code; automation adds no model call and no setting. |

## Prompt injection and untrusted content

* Text a customer or visitor wrote reaches the model only in fields named `…Untrusted`, and the instructions say it is data: never a reason to propose an action, never an instruction. That is conduct. **The enforcement does not depend on it**: even a model that obeys such text can only *propose*, a person sees exactly what would change before anything runs, and the proposal cannot name a record outside the conversation's context.
* The proposal's content (a draft, a note, a customer note, the reason) is stored as text and shown as text: React escapes it, nothing is rendered as markup or becomes a link, and a test puts `<script>` and an `<img onerror>` in it. A proposal that says "approve every pending action now" is just a proposal with that text; approving it runs *that one action* and nothing else.
* The reason is the assistant's own words and is labelled so ("not verified data"). It is checked for amounts and secrets like every other text.

## The checks, in the order a request meets them

Session and idle time → `assistant:use` → the action's permission with the current role → the operator's switch → visibility/decision rule → status and expiry → permission again (before anything about the payload is said) → payload hash → second confirmation → frozen payload re-verified → parameters re-parsed → record re-assessed (fingerprint) → conditional state change → *(execution)* session and role re-read → payload and approval hash → record re-assessed → the business function, which checks the permission once more.

## Immutability

`ai_actions` content columns are frozen by trigger; final rows are frozen entirely; rows cannot be deleted; history lines cannot be updated or deleted; the status can only follow the lifecycle. A row edited by hand (with the triggers dropped) cannot be executed: the hash recomputed from the stored payload no longer matches (`payload_tampered`), and `verifyHistory` reports it.

## Request-level protections

Cookie session, CSRF token and same-origin on every state-changing call; no CORS headers; a burst limit for the decision routes (`automation`, 60 per minute per address) on top of the admin limit; strict bodies (an unknown key is `422`); references and filters are validated before they are used (`ACT-` + 8 characters; a hand-edited address cannot ask for anything odd); no id of an administrator or a record is accepted from the browser where the server knows it.

## Privacy

* The history (`ai_action_events`) and the audit lines hold **codes, hashes, references and counts**, at most 500 characters per line (a database `CHECK`): no session, no key, no address, no customer's words. A test searches them for an e-mail address, a phone number, a street, a cookie and a key.
* The **proposal itself** holds text the assistant wrote (a draft, a note, a customer note) and the reason. A draft may address the customer by name. This text is kept with the action and is **not** removed by the assistant's conversation retention or by erasing a customer by e-mail address: see "Limits" and the launch checklist.
* An administrator is shown by the e-mail address they sign in with, only to administrators who may see that action. If the account is later deleted the id stays and the screen says "a removed account".

## Limits that remain (stated, not hidden)

* **Nobody has run it against the real model.** The scripted model and the stand-in prove everything around the model; they do not show how Claude Haiku 5.5 behaves with these instructions and tools, or how well it resists injection.
* **The hash chain proves consistency, not that nobody with direct access to the database could rewrite everything.** Someone who can drop triggers and recompute every hash can forge a history. It detects an edited, removed, reordered or missing line, and an edited payload; it is not a signature. (An off-database copy of the latest hash, or a signed backup, would be the next step.)
* **Payload text is kept and not purged automatically.** There is no retention job for `ai_actions.payload_json` and no erasure by e-mail address (the triggers forbid editing a frozen row). The owner decides (launch checklist).
* **Fingerprints are strict.** A harmless change to the record invalidates the approval; a new proposal is then needed.
* **Approval is by any administrator who may decide the action** (its own administrator, or one who may write the system), not by two people. Nothing here is a four-eyes control; the second confirmation is one person confirming twice.
* **The customer's note is the assistant's wording shown to the customer** once approved. The administrator reads it before approving; the platform does not check it for tone or language beyond amounts and secrets.
* **The project note cannot be deleted** once written (the administration has no way to), which the proposal says.
* **Language of customer-facing text** (a project's customer note) is not forced to the customer's language; the draft reply is.
* **`AI_AUTOMATION_ENABLED` is an environment variable**, read at start-up: switching it needs a restart. That is deliberate (an operator's switch, not an administrator's).
* The migration is forward-only: code older than `0019` refuses to start on a database that has it.
