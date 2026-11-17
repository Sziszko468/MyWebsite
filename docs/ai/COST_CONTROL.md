# CONTROL ROOM AI: cost control

How the assistant is kept from spending more than the owner decided, and how honestly it reports what it spent. **Every cost shown anywhere is an ESTIMATE** (the provider's token counts times the price list). It is not a bill: the provider's own usage page is the truth.

## The layers, outermost first

| Layer | Set by | What it does | Where |
|---|---|---|---|
| **Anthropic spend limit** (recommended) | the owner, in the Anthropic Console | the provider stops serving the workspace even if this server's limits were bypassed | **Owner** (not in this repository) |
| **Operator ceilings** `AI_CEILING_*` | the operator, environment only | hard maxima no saved setting can exceed: daily/monthly budget, tokens/day, requests/day, answers at once, output tokens, input characters, tool rounds, requests per session, new conversations per day | `config.ts`, applied in `settings.ts` |
| **Settings** | an administrator (inside the ceilings) | the working limits and budgets | administration → AI → Settings |
| **Reservation** | automatic | before the provider is called, the worst case of the request is reserved in one database transaction; a request that could take the day or month over a budget is refused | `budget.ts` |
| **Per-request caps** | settings | `maxOutputTokens` per model step, `maxToolCalls` steps, input and history limits, the connection/first-chunk/step/total timeouts | `gateway.ts` |
| **Rates** | settings | per network address (10 min), per session (24 h), session creation, one answer per conversation, two per session, **and a global limit on answers at once** | `gateway.ts`, `budget.ts` |

An administrator **can lower** any limit, **cannot raise** one above its ceiling (the save is refused with the field marked, and the screen shows the ceiling next to the field), and **cannot touch the prices** (a price of 0 would switch every budget off). A value that was saved while a ceiling was higher is applied as the lower ceiling from then on.

## What is counted

| Limit | Counted as | Refusal (to the visitor) |
|---|---|---|
| daily / monthly budget (USD) | finished requests at their cost; unfinished ones and ones with an *unknown* cost at the amount reserved for them | 503 "not available right now" + a friendly message; alert `cost_*_exhausted` |
| daily tokens | finished requests at the provider's token counts, unfinished/unknown ones at the reserved tokens, **requests that failed before the provider produced anything at zero** | same |
| daily requests, new conversations | every request / conversation of the day | same |
| per session | the session's requests in the last 24 hours | 429 with `Retry-After` |
| per address | requests in a 10-minute window (in memory) | 429 |
| answers at once | the number of answers being written now | 503 "busy", `Retry-After: 5`, not queued |

Days and months are **UTC calendar** periods: the daily budget starts again at 00:00 UTC and the monthly one on the 1st. That is the only "reset"; nothing resets a budget by hand and no administrator action can: the budgets are computed from the usage rows, which an administrator cannot edit.

The counters of refusals ("limits that stopped visitors": per kind, per day) are in `ai_limit_events`. They hold counts only.

## The reservation

Before the provider is called: `steps × (prompt tokens + 1500)` input and `steps × maxOutputTokens` output, priced from the price list. The request is refused if the day's or month's spend plus this reservation would pass the budget, or any counter would pass its limit. Because SQLite has one writer and the check and the insert are one transaction, many requests at once cannot all pass a budget that only one fits (test: "holds under concurrency"). When the stream ends, the reservation is replaced by what the provider reported.

## The price list (one place)

`server/src/modules/ai/pricing.ts`, read from <https://platform.claude.com/docs/en/about-claude/pricing> on **2026-11-17**:

| Claude Haiku 5.5 | Input | Output |
|---|---|---|
| prompts up to 100 000 tokens | **$0.10** / million | **$0.50** / million |
| prompts over 100 000 tokens | $0.50 / million | $2.50 / million |

Cache reads ($0.01) and writes ($0.125) are **not used**: this assistant sets no cache control, so no cached tokens are priced separately (if the provider ever reported some they would be counted as ordinary input). When a request's input is over the threshold, the **whole request** is priced at the long-prompt rate: that can only over-estimate. Normal use is far below it (a message is at most a few thousand characters, the history is windowed, a tool result is capped at 24 000 characters).

The operator may override the two main prices in the environment (`AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK`, `AI_PRICES_AS_OF`) if the provider changes them before the code does. The administration shows the prices, their date and their source, read-only.

## Usage accounting: reported, estimated, unknown

Every request is a row of `ai_requests`. What is stored, and how it is labelled:

| What | Stored as | Never |
|---|---|---|
| **Token counts the provider reported** | `input_tokens`, `output_tokens` (and the cache and reasoning counts when given) | invented: when the provider reported nothing the columns are **NULL**, not 0 |
| **Cost** | `actual_cost_usd` = reported tokens × price list, `cost_source = 'provider_usage'`, `cost_state = 'reported'` | presented as a bill |
| **No cost** | `cost_state = 'none'`: the provider never produced anything (it was down, refused the key…), so nothing was generated and nothing is booked (0, and 0 tokens against the daily token budget) | |
| **Unknown cost** | `cost_state = 'unknown'`: the visitor cancelled, the server shut down, the request was abandoned, or the stream broke after output had started, **and the provider reported no usage**. It may have been billed. The **budget keeps counting the reserved amount** (an upper bound); the administration shows it as "unknown cost, counted at the reserved amount" with the number of such requests | counted as zero |
| **Model and provider** | `model` (requested), `actual_model` and `model_verified` (what the provider said answered) | |
| **Duration** | `latency_ms`, `first_token_ms` | |
| **Why it stopped** | `finish_reason` (`stop`, `length`, `tool-calls`, `content-filter`, `error`) | |
| **Which HTTP request** | `correlation_id` = the `X-Request-Id` | |

Rows written before migration 0016 have no `cost_state`; the screens derive the same three states from `cost_source` and `status`.

## When a budget is used up

The visitor is told, in their language, that the assistant "has reached its capacity for now" with the contact page as the alternative (`errors.budget` in `src/content/ai/index.ts`); the floating button disappears when the assistant is unavailable. The administration gets one alert per kind per day or month (`cost_day_exhausted`, `cost_month_exhausted`, `tokens_day_exhausted`, `requests_day_exhausted`), a warning at the alert percentage (default 80 %), and a counter in "limits that stopped visitors". The rest of the site, the shop, the quote requests and e-mail are unaffected, and an administrator cannot switch the limit off.

## Configuring it

Starting values and ceilings are in `.env.example`. After the first real conversations compare **AI → Operations → Usage** with the Anthropic usage page; if they disagree, the provider is right and `pricing.ts` (or the environment override) needs the correction.

## Not verified

The real model's token usage and cost per conversation have never been measured (no real request was made). The default budgets (USD 1 a day, 10 a month; ceilings 25 and 250) are deliberate guesses of "small for a portfolio". The live test and the first days of real use are the measurement.
