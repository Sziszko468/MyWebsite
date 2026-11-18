# Privacy and data handling

What the AI admin assistant holds, what it sends to the AI provider, how long it keeps it, and what it cannot promise. This page describes **what the code does**. It is not a legal opinion, claims no GDPR (or other) compliance, and does not replace the owner's own review ([LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)).

## What goes to the AI provider (Anthropic, Claude Haiku 5.5)

On every question the server sends, over its own key, to the Anthropic Messages API:

1. the **instructions** (`prompt.ts`; they contain the language, today's date and the context's kind and reference);
2. the **tool definitions** (names, descriptions, schemas of the thirty-one tools);
3. the **last messages of this conversation** (20 by default): the administrator's questions, the assistant's earlier answers and **the results of the tools it called earlier**;
4. the new question, and the **tool results of this answer**.

The tool results are the part that carries business data. What they can contain (cut and whitelisted by the readers, see [TOOL_SECURITY.md](TOOL_SECURITY.md)): customers' **names and companies**, language and account status; project names, statuses, dates, tasks; quote requests with what the customer wrote — a **cut excerpt** (240 characters in a list, up to 1,500 in a detail), the brief, quotation titles and stored figures; consultation times, status and what the customer wrote when booking; the **customer-visible messages** of a conversation (up to 40, each cut to 1,200 characters) when the administrator asks about one. So **customer information can reach the provider** — in the screen's footer, in every language, the administrator is told: *"Your question and what the assistant looks up are sent to the AI provider configured for this site (Anthropic, Claude Haiku 5.5) so it can write the answer. That can include customer information. Conversations are kept for N days, or until you delete them."*

**Never sent:** an API key, an administrator's e-mail address or id, a session token, a cookie or a CSRF token, a password or a hash, **a customer's e-mail address or phone number**, an IP hash, any sign-in or invitation detail, **internal/private notes** of any record, a visitor's conversation, another administrator's conversation, the system's configuration. (Tests inspect every request the provider receives for the key and for the e-mail addresses of every test account and customer, and for the private-note words.) **Refused before it is stored or sent:** a question that looks like a payment-card number or a secret key (422).

The system tells the model that customer text is data to summarise, never instructions. The assistant has no tool that sends, changes, fetches or runs anything.

## What is stored, where, for how long

| Data | Table | Holds | Kept | Removed by |
| --- | --- | --- | --- | --- |
| Conversation | `ai_admin_conversations` | the administrator's id, language, the **first 60 characters of the first question as a title**, the context's kind and its public reference (or a customer's id), status, counts, timestamps | `AI_RETENTION_DAYS` (default **7**, the AI screen's retention setting) after the last activity | the administrator ("Delete conversation", "Clear conversation"), retention, deleting the account (cascade) |
| Messages | `ai_admin_messages` | each UI message as JSON: the question, the answer, **and the tool calls with their results** (so a conversation can be re-read and continued) | with the conversation | the same |
| Usage | `ai_requests` (`audience = 'admin'`, `admin_user_id`), `ai_tool_calls` (`audience = 'admin'`) | per request: tokens, estimated cost, duration, outcome, request id; per tool call: the tool's name, outcome, duration. **No text, no input, no output** | indefinitely | – (`admin_user_id` has no foreign key on purpose: deleting an account never changes what was spent) |
| Audit | `audit_log` | that a conversation was started (and the kind of context), that a report was made (kind and reference), that the assistant was switched on or off, and every settings change. **Never content** | as long as the audit log is kept | – |
| Settings | `settings` | the switch and four limits | indefinitely | – |

No API secret is stored anywhere; the browser keeps **one** item for this screen: the language pick (`cc-admin-assistant-language` in `localStorage`, an interface preference of the administrator, like the sidebar's collapsed state). Conversations are not kept in the browser.

## Not in the logs, not in analytics, not in errors

Request logs carry ids, codes, durations and token counts; the tests check that neither the question, the answer, nor a customer's words appear in the ledger, the tool-call table, the audit log or the server log — also when the provider fails with a message that contains a key-shaped string and a customer word. The usage numbers contain no conversation text, no references and no names. The public assistant's analytics exclude the administrators' requests. Error messages shown to the administrator are the interface's own sentences; the provider's text is never shown.

## Retention, deletion and erasure

- **Delete / clear / retention / account deletion** remove the conversation and every message for good (a hard delete; nothing aggregates over the rows).
- **Erasing a person** (`npm run server:cli -- erase <e-mail>`, `eraseByEmail`) deletes the administrators' conversations that were **opened about** that person's records: a customer context with their id, a project context with one of their projects, a conversation context with one of theirs, a quote-request context with a request of that e-mail, a consultation context with one of their bookings (tested). **Not found by this:** a conversation in the *general* context in which the person was merely mentioned or looked up (there is no reference to search by). Retention removes it (default 7 days); until then it exists, and so may a **backup** made in that time. This is a limitation; it is not hidden.
- What the **provider** does with the text it was sent (retention, training, human review, region) is set by Anthropic's terms for the owner's account. This system sends no training flag and has no setting for one. **Do not rely on any statement about the provider's retention until the owner has read and confirmed those terms.**

## The public privacy notice

The processing really changed (the owner can send details of customer records to the AI provider), so **one item was added** to the public privacy notice (`src/content/privacy.ts`, section "Who handles your data", in Hungarian, English and Dutch): the owner can use a read-only AI assistant in the administration, the details it needs from inquiries, quote requests, messages and bookings pass through the server to the same AI provider, it changes and sends nothing, and the questions and answers are kept in the administration for a limited time. It states **no retention period, legal basis, guarantee or compliance claim** (a test forbids them): those are the owner's decision. The item before it, "Control Room AI has no access to bookings", remains true of the *visitors'* assistant, and a test now holds that statement against the code of the visitors' side (and checks that the visitors' tools cannot import the administrators' module).

## Limitations

- Customer-written free text can contain personal data of any kind; the output guard looks for credentials, not for personal data.
- The administrator's own question is processed by the provider before any server-side check of its meaning; only the narrow card/secret guard runs first.
- Words are kept for the retention period so a conversation can continue; backups made in that time contain them until the backup expires.
- Hungarian and Dutch wording of the notice and the screen has not been proofread by native speakers.
