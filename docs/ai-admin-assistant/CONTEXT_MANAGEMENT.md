# Context management

A conversation has **one context**, chosen when it starts and fixed for its life: the whole business, or one project, quote request, customer, conversation or consultation. The context is a **reference, not an authorization**.

## The six contexts and what each reaches (`scope.ts`)

When a conversation is about a record, every tool can reach **only** that record and the records tied to it; everything else answers `not_found`. Searches are restricted in SQL to the scope's ids (`AND id IN (…)`, or `AND 0` for an empty scope) — they do not fetch and then filter.

| Context (`ref`) | Projects | Quote requests | Customers | Conversations | Consultations |
| --- | --- | --- | --- | --- | --- |
| **General** | all | all | all | all | all |
| **Project** (`PRJ-…`) | that project | its quote request | **none** | that project's conversations | none |
| **Quote request** (`CC-…`) | projects made from it | itself | none | conversations opened about it | consultations linked to it |
| **Customer** (customer id) | their projects | requests linked to them or their projects | themselves | their conversations | consultations linked to them |
| **Conversation** (`MSG-…`) | its project | the request it is about | none | itself | the consultation it is about |
| **Consultation** (`BK-…`) | none | its quote request | none | none | itself |

The business tools (overview, activity, alerts, briefing, business reports) are **general-only**: inside a record's conversation they answer `out_of_context`, because a count of "all customers" in a conversation about one customer is exactly the leak the context exists to prevent.

## Re-validated every time

- On **every question** the route/gateway resolves the context again against the database with the administrator's *current* permissions (`resolveScope`). A context whose record was deleted, or which the administrator may no longer read, answers `404 context_unavailable` — the **same answer for both**, so a context cannot be used to find out whether a record exists. The conversation can still be read and deleted; it cannot be continued (the screen says so).
- On **every tool call** it is resolved once more (a record can disappear in the middle of an answer).
- The browser's context in a request is used **only for a new conversation**. An existing conversation keeps the context it started with, whatever is sent (tested: a later message naming another context changes nothing and the prompt does not mention it).
- The model cannot switch contexts or invent an identifier: a reference must match a strict pattern, must exist, and must be inside the scope; the model only ever has references an earlier tool result gave it.

## Switching

Changing the context **starts a new conversation** ("Ask about something else" on the right; "New conversation" on the left). Nothing said about one customer stays in the model's window in a conversation about another. The screen shows the current context in the thread's heading and in the right pane; for a record context it is a link to the record once a tool has returned its page.

A link from elsewhere in the administration can start one: `/admin/ai-assistant?context=project&ref=PRJ-ABC123` (the kind must be one of the five, the reference must match the server's pattern; the address is cleaned afterwards).

## What goes into the model's window

Per answer: the instructions (with the context stated: "ONE project (PRJ-…); the tools reach only that record and what is tied to it"), the **last `AI_MAX_HISTORY_MESSAGES` messages of this conversation only** (20 by default; the window always starts with a question), the new question, and the tool results of this answer. The **complete history is not sent**: a conversation is at most `AI_MAX_CONVERSATION_MESSAGES` (60) messages and `AI_CONVERSATION_MAX_HOURS` (24) hours old, after which it is closed (readable and deletable, not continuable). Tool results are capped (24,000 characters each; lists at 25 items; customer-written text cut to a short excerpt).

## Isolation between customers

- A record context has no way to reach another customer (no search crosses; every lookup is by reference inside the scope).
- In the **general** context all customers are reachable, as they are for the administrator in the administration. The prompt tells the assistant not to mention another customer's data when working on one, and to suggest a new conversation when the question is about something else. **This part is conduct, not enforcement**: if an administrator asks a general-context question about two customers, the assistant may legitimately answer about both. Use a record context for confidentiality-sensitive work.
- Another administrator's conversation is never reachable (the conversation is found only through its owner), and a customer or visitor session never reaches any of this.
