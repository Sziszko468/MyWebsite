# AI usage and cost analytics

Source: the usage ledger (`ai_requests`, `ai_tool_calls`) and the configured budgets. Permission: `system:read` (the administrator role; an editor does not see this section). No filters.

## What the ledger holds — and does not

Counts, tokens, costs, latency, an error code, the tool names. **No prompt, no answer, no message text, no key** (`ledger_has_no_text`). The analytics never read anything else about the assistants.

## Figures

| id | kind | meaning |
| --- | --- | --- |
| `aiRequestsCombined` | A | requests of both assistants in the period |
| `aiVisitorRequests`, `aiAdminRequests` | A | the website assistant and the administrator assistant **separately** |
| `aiTokensCombined` | A | input + output tokens the provider reported |
| `aiFailedRequestsCombined` | A | requests that ended in an error |
| `aiEstimatedCostUsdCombined` | **E** | estimated cost in US dollars |
| `aiBudgetDayPercent` | D | today's estimated cost as a share of the configured daily budget |

Tables: `aiUsageByAudience` (visitor, administrator, combined: requests, completed, failed, aborted, tokens, estimated cost, reserved-not-reconciled cost, requests with a provider-reported cost, requests whose cost was not measured, average response time), `aiToolUsage` (calls and failures per tool, top 40), `aiProviderErrors` (by recorded error code, top 20), `aiBudget` (today and this month against the budgets, with tokens and requests). Series: `aiRequestsVisitorSeries` and `aiRequestsAdminSeries` (stacked), `aiEstimatedCostSeries`.

## Cost: four different things, kept apart

* **Provider-reported usage** — the tokens the provider said it used (`cost_source = 'provider_usage'`). Counted in `providerReportedRequests`.
* **Estimated cost** — reported tokens × the configured prices (`actual_cost_usd`). It is an **estimate**, labelled so on the card, in the table, in the CSV (`kind = estimate`) and in the assistant's note. **It is never an invoice** (`cost_is_an_estimate`).
* **Reserved cost** — a hold placed before a request that then never completed (`reserved_cost_usd`). It is **not spend** and is shown separately as "reserved, not reconciled" (`reserved_cost_not_reconciled`).
* **Unmeasured** — completed requests with no cost (`unmeasuredCostRequests`). They are counted, not guessed.

Costs are in US dollars, the ledger's unit; they are never converted (`usd_unit`).

## Visitor and administrator

The two audiences are separate lines and separate series, with a combined total beside them for cost control. The two assistants share one model lock (Haiku 5.5) and one budget; the analytics change neither.
