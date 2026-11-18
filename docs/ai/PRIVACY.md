# CONTROL ROOM AI: privacy and data retention

What the assistant holds, where it goes, how long it stays, and what it cannot promise. This page describes **what the code does**. It is not a legal opinion, claims no GDPR (or other) compliance, and does not replace the review in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

## Who is a "user" of the assistant

A visitor is an **anonymous session** (a random id in an HMAC-signed token, kept in the tab's `sessionStorage` and sent in a header; no account, no cookie). The assistant has **no link to a customer account, a booking, a quote or a portal project**; it cannot read any of them (there is no tool that could). The only way a visitor's words reach a customer record is the one the visitor starts: after approving a plan they type their name and e-mail address into the **plan panel** (not the chat), and a normal quote request is created.

## What is stored, where, for how long

| Data | Table | Holds | Kept | Removed by |
|---|---|---|---|---|
| Session | `ai_sessions` | random id, a **keyed hash** of the network address, counters | until idle for 14 days with no conversation | maintenance |
| Conversation words | `ai_messages`, `ai_conversations.title`, `plan_json` | what the visitor and the assistant said; the first words as a title; the project plan | `AI_RETENTION_DAYS` (default **7**) after the last activity | the visitor ("delete" in the panel: **at once**); daily maintenance |
| Conversation shell | `ai_conversations` | language, a coarse topic (derived from the tool used, never from words), counts, timestamps | indefinitely (nothing in it is the visitor's text) | – |
| Usage | `ai_requests`, `ai_tool_calls` | per request: tokens the provider reported, estimated cost, duration, outcome code, finish reason, **the HTTP request id**, which model answered. No text, no link to a conversation's words | indefinitely | – |
| Refusal counters | `ai_limit_events` | per day and kind: a count | indefinitely | – |
| Approval | `ai_approvals` | the plan's version and hash, and the visitor's name/e-mail/company **until used or expired** (10 minutes) | cleared when the request is sent; cleared by maintenance if it expires | consumed / maintenance |
| Alerts, connection tests, verification record | `ai_alerts`, `ai_connection_tests`, `settings` | codes, identifiers, numbers; a keyed fingerprint of (model, address, key). **Never the key** | indefinitely | – |
| Administrators' changes | `audit_log` | who, when, which setting, old → new value (texts are named, not copied) | as long as the site's audit log is kept (no deletion rule of its own) | – |

No API secret is stored anywhere in the database, in `localStorage`, `sessionStorage` or a cookie; the browser stores one `sessionStorage` item, `cc-ai`, with a session token and a conversation id (listed in the privacy notice).

## What goes to Anthropic, and what does not

**Sent** to the Anthropic Messages API, over the server's key: the operator's instructions (with the visitor's language), the last messages of **this** conversation (up to the history limit), the visitor's new message, and the results of the eight tools (published site content, and the visitor's own plan). Nothing else.

**Never sent:** the visitor's name, e-mail address or company typed in the plan panel (tested: the provider request does not contain them); the network address; the session token; any other visitor's conversation; any customer, booking, quote, portal, message or administration record; administrators' private notes (no tool reaches them; a source scan in `aiProduction.test.ts` fails if a tool file ever names a table other than the published ones); the key of any other service.

**Refused before it is stored or sent:** a message containing a Luhn-valid payment card number or something shaped like an API key / private key / bearer token (422, `sensitive_data`; counted, not logged). This is deliberately narrow: **names, addresses, phone numbers and health or other sensitive details written in free text are not detected.** The visitor is told not to enter sensitive personal data (the panel's notice, and the privacy page).

**Training:** this system sends no training flag and has no setting for one; conversations are not used by this site for anything but answering. **What Anthropic does with API data (retention, training, human review) is set by Anthropic's terms for your account. They were not reviewed here: the owner must read them** (see the checklist). The privacy page says this too.

## Logs

Request logs carry ids, codes, durations and token counts (see [OPERATIONS.md](OPERATIONS.md#logs)). They never carry the message, the answer, the instructions, the key, an address or an e-mail. Logs are the host's (Render) and have the host's retention.

## The customer deletion and retention workflow

- **The assistant's own data** follows the table above. A visitor deleting a conversation removes its words at once; the usage rows stay because they contain nothing the visitor wrote.
- **A quote request created through the assistant** is an ordinary quote request (`source = control_room_ai`) in the existing quote system. The existing retention (`RETENTION_DAYS`) and the existing erase procedure (`npm run server:cli -- erase <e-mail>`) apply to it unchanged. The assistant does not keep a second copy of the contact details: they are cleared from the approval when the request is created.
- Deleting a customer account never needs to touch the assistant's tables: there is nothing linking them.
- Anonymous-session data cannot be looked up by a person ("give me everything about me"): there is no identifier to search by, by design. A visitor can delete their own conversations while they have the tab.

## What changed in the processing in this work (PROMPT 29)

The privacy notice (`/privacy`, section "Control Room AI", `src/content/privacy.ts`) was **changed in one place**, because one thing about the processing really changed: **a message that looks like a payment card number or a secret key is now refused before it is stored or sent** — a new sentence in Hungarian, English and Dutch, directly after "Do not enter sensitive personal data". Everything else the notice says is still accurate; the new stored items are not personal data: the HTTP request id on a usage row (a random identifier, not derived from the visitor) and the per-day refusal counters. The notice still says that the provider's own terms must be reviewed by the owner and stated before launch: **that sentence stays until the owner has done it.**

## What changed in the processing in PROMPT 30 (project discovery)

The discovery stores the project's *structure* (type, requirements, plan versions, notes) in five tables that hang off the conversation, with the same owner session, the same retention and the same deletion (`eraseDiscovery`, in the same transaction). It adds no contact detail, price or key, and no new party. One sentence was added to the assistant section of the privacy notice (Hungarian, English, Dutch). Details: [../ai-project-discovery/PRIVACY.md](../ai-project-discovery/PRIVACY.md).

## Limitations

- Anonymous does not mean unlinkable: the keyed address hash can show that two sessions came from one address to someone with the server's secret and the database.
- Words are kept for up to 7 days (default) so a conversation can continue; backups made in that time contain them until the backup expires.
- Text a visitor types is processed by the provider before any server-side check of its meaning; only the narrow guard above runs first.
- Hungarian and Dutch wording of the notice has not been proofread by native speakers.
