# Cost control

The admin assistant spends **from the same wallet as the visitors' assistant**. There is one ledger, one reservation mechanism and one set of budgets; the only addition is a way to tell whose request a row was, so the two audiences' numbers can be shown apart. Nothing here can make a request to a model other than Claude Haiku 5.5, and **no real request has been made in this work** (the cost columns in the tests are the scripted model's numbers).

## What protects the money

| Control | Where | Default | Who sets it |
| --- | --- | --- | --- |
| The assistant is **off until switched on** | `adminAssistantEnabled` | off | the owner, in the AI screen (needs the verified connection) |
| **Reservation before the provider is called** | `budget.reserve()`: the worst case of this answer is reserved in `ai_requests` *before* the request goes out; a request that would exceed a budget is refused and the provider is never called | – | automatic |
| Daily and monthly **budget in dollars**, daily **token** and **request** budgets | shared with the visitors' assistant | the AI screen's values | the owner (never above the operator's ceilings) |
| Operator **ceilings** | environment variables (`AI_CEILING_*`) | – | the operator; the screen cannot exceed them |
| **Per administrator, per hour** | counted from the ledger by `admin_user_id` | 60 (`AI_ADMIN_MAX_REQUESTS_PER_HOUR`, 1–600) | the owner |
| Tool steps per answer | `stepCountIs(adminMaxToolCalls)` — the model is stopped after that many steps | 10 (`AI_ADMIN_MAX_TOOL_CALLS`, 1–20) | the owner |
| Output tokens per answer | `maxOutputTokens` | 3000 (`AI_ADMIN_MAX_OUTPUT_TOKENS`, 200–8000) | the owner |
| Characters per question | refused with 422 before anything is stored or sent | 4000 (`AI_ADMIN_MAX_INPUT_CHARS`, 100–20000) | the owner |
| Concurrency | one answer at a time per conversation (`409 busy`), at most two at once per administrator (429), the global limit on answers at once (503 capacity) | 2 / `AI_MAX_CONCURRENT_REQUESTS` | automatic / owner |
| Conversation length and age | closed after 60 messages or 24 hours | shared | the owner |
| HTTP rate limit | `aiAdmin`, 20 per minute per client on the chat route (when `RATE_LIMITS` is on) | 20/min | code |
| Client goes away | the provider request is aborted; the reservation is reconciled exactly once | – | automatic |
| Shutdown | answers in progress are settled before the process exits | – | automatic |

The reservation row is **reconciled** when the answer ends (completed, failed, cancelled): the tokens the provider reported times the configured prices, else a flagged estimate. A provider that answers as another model **stops the assistant** (the answer is not trusted, verification is withdrawn) until the connection test is run again — there is no retry with another model, because there is none.

## What the administration shows (numbers only)

`GET /api/admin/ai-assistant/usage?range=today|last_7_days|month` (needs `system:read`; shown in the AI screen's **Admin assistant** tab): requests (completed, failed), input and output tokens, **estimated** cost, average response time, tool calls, calls and errors **per tool** with the average time, error codes, the last eight failures (time and code), conversations started, **reports generated**, a daily series for 14 days, and the limits in force. The cost is "the reported token counts times the configured prices: an estimate, not a bill", and the screen says so.

- **No conversation text, no record references and no administrator names** are in these numbers (a test requires it).
- These requests are **included** in the budget, in the AI screen's other totals and in Operations (one ledger), and **excluded** from the *public assistant's* analytics (`audience = 'visitor'` filters), so neither audience's statistics are polluted by the other's.
- The audit log records when the assistant was switched on or off, when a conversation was started (kind of context only) and when a report was made — never content.

## Failure behaviour

Provider timeout, a refused key, an empty account, a model that is not found or answers as another: the answer is marked failed in the ledger with a code, the visitor-style alerts raise (refused key, empty account, budget at its alert percentage), the screen shows a sentence ("The assistant could not answer…") with *Try again* — **never the provider's own message** (a test throws a message containing a key-shaped string and a customer word and requires neither in the usage numbers, the ledger or the logs) — and the next request is not slowed down. A retry after an error asks the answer again if the question was stored, and re-sends the question if it was not, so nothing is asked twice.

## What to watch after activation

The first days: the cost line and the average response time in the Admin assistant tab; *recent failures* for refused keys or an empty account; the budget alert in the AI screen. The numbers are estimates until the first real answers show how many tokens a typical question uses (tool results can be large: the 24,000-character cap per result is the ceiling, and the history window is 20 messages).
