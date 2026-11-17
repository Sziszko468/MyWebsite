# CONTROL ROOM AI: operations

Running the assistant: what to look at, what the logs say, what each failure means and what to do, how it shuts down, and how to roll it back.

## The administration screen (AI)

Reading needs `system:read`, changing needs `system:write` (administrators). The tabs:

| Tab | What it shows |
|---|---|
| **Model and connection** | the required model (read-only), the provider, the key's state (`set`, `missing` or `malformed`, never the value), the connection state, the last successful test and the last error, **Run connection test**, the **activation switch**, alerts (mark as seen), the recent tests |
| **Overview** | requests, conversations, tokens, estimated cost, average response time, failures by cause, tools, categories; charts for 30 days / 12 weeks / 12 months; today and this month against the budgets |
| **Operations** *(new)* | provider status (not configured / no request yet / working / failing); the **last answered request** and the **last provider error**; answers being written now against the limit; **today** and **this month**: requests, answered, failed, cancelled, tokens, estimated cost, average response time, answers cut off at the output limit, **how much of each budget is used**; **how the cost is known** (reported / none / unknown, and what unknown requests are counted at); **limits that stopped visitors** (per kind, today and this month); the operator's **ceilings**; the **recent failed requests** (cause, time, request id); the **configuration history** (who changed what, when) |
| **Settings** | the switches, languages, limits and budgets (inside the ceilings), effort and thinking, welcome text and suggestions. No model, no key, no prices |
| **Knowledge** | what the assistant can read, with counts and a fingerprint, and a refresh button |

The administration shows **counts, codes, durations and estimated costs**. It never shows a conversation, a prompt, an answer, a title, a visitor or an address.

## Health

- `GET /api/health` (liveness) and `GET /api/ready` (database, migrations, e-mail on/off) are public and say **nothing** about the assistant, the model or the key (tested). There is **no public endpoint** with AI infrastructure details.
- The assistant's own status is in the authenticated administration and in the command line:

```bash
npm run server:cli -- ai status      # availability and why not, key set/missing/malformed, ceilings, settings (no secret)
npm run server:cli -- ai check --live   # the live smoke test: ONE real request (see PRODUCTION_ACTIVATION.md)
```

- `GET /api/ai/config` (public, cached 60 s) says only whether to offer the assistant, in which languages, the welcome texts and the message length limit.

## Logs

One JSON object per line on stdout. For an assistant request the lines carry the **request id** (`requestId`, the `X-Request-Id` the visitor's client was given; a client may send its own, 8–64 safe characters) and the usage row (`aiRequest`):

```json
{"msg":"assistant request finished","requestId":"…","aiRequest":"…","requestRef":"…","status":"completed","code":null,"finish":"stop","ms":1840,"ttfbMs":520,"inTok":1312,"outTok":211,"steps":2,"toolCalls":1,"modelVerified":true}
```

Other lines you may see: `assistant request failed` (a code and the error's class), `assistant answer unusable`, `assistant tool failed`, `assistant tool result rejected`, `assistant alert`, `assistant request could not start`. **Never logged:** the visitor's message, the answer, the instructions, the key, the provider's error text, an address, an e-mail. (The logger additionally masks any field whose name looks like a secret, which is why token counts are `inTok`/`outTok`.) To follow one request: take the request id from the failed-requests table (or the visitor's report) and search the log for it; the same id is in `ai_requests.correlation_id`.

## Failure runbook

| What you see | Meaning | What to do |
|---|---|---|
| status "No API key" / "malformed" | the key is missing or cannot be one | set `ANTHROPIC_API_KEY`, restart |
| alert **provider_auth**, last error `provider_auth` | Anthropic rejected the key or the key may not use the model | check the key and its workspace in the Console; replace it; run the connection test |
| alert **provider_billing** | no credit / billing problem at Anthropic | top up or fix billing; run the connection test |
| alert **model_not_found** (and the assistant goes unavailable) | the provider does not know `claude-haiku-5-5` (or `ANTHROPIC_BASE_URL` is wrong: a missing `/v1`) | check the address first; if Anthropic renamed or retired the model, a **developer** updates `AI_MODEL_ID`, reviews and deploys |
| alert **model_mismatch** | a different model answered; the answer was discarded and the assistant is unavailable | run the connection test; if it keeps happening, investigate the route (`ANTHROPIC_BASE_URL`) |
| `provider_rate_limit` in failures | Anthropic's own rate limit for the key | wait; raise the limit in the Console if it recurs |
| `provider_unavailable` | Anthropic 5xx / overloaded (529) or the network | usually transient; check Anthropic's status page; nothing to change here |
| `timeout` | the provider did not start answering (20 s) or the answer took over 90 s | transient; if it recurs, check the network and the provider |
| `provider_invalid_response` | an empty or unparsable reply | transient; if it recurs, report to the provider with the request ids |
| `output_limit` / answers marked "cut off" | the output limit was reached | raise `maxOutputTokens` (within the ceiling) only if it is common |
| "limits that stopped visitors": `concurrent_global` often | many visitors at once | raise the limit (within the ceiling) if the provider and the server can bear it |
| budget alerts | spend reached the alert percentage / the budget | decide: leave it (the assistant pauses by itself) or raise the budget (within the ceiling) |
| an **unknown**-cost count that grows | requests are being cancelled or abandoned without usage | normal in small numbers (visitors closing the page); if large, look at the failures and timeouts |

## Shutdown and restart

On `SIGTERM`/`SIGINT` the server first stops the assistant: no new answer is accepted (a visitor gets "not available", `Retry-After: 30`), answers under way get **4 seconds** to finish, the rest are **cancelled and reconciled** (status `aborted`, code `shutdown`, cost *unknown* and counted at the reservation), then the HTTP server stops and the database closes. A request that was never reconciled (a crash, `kill -9`) is marked `abandoned` by the next daily maintenance run (anything still reserved after 15 minutes) and counts at its reserved cost the whole time, so a crash can only make the books more conservative. A visitor who closes the page cancels the paid generation and keeps what was used.

## Duplicate processing

A second message in a conversation while an answer is being written is refused (409 `busy`), so a double click or a replayed request runs once. The quote approval is used once. The reservation and the usage row are written once per request.

## Rollback

See [PRODUCTION_ACTIVATION.md](PRODUCTION_ACTIVATION.md#rollback): switch the assistant off in the administration (or `AI_ASSISTANT_ENABLED=false`), lower the budgets, or remove the key. Rolling the *code* back also needs the database backup from before migration 0016 (the previous code refuses to start on a newer schema).

## Alerts are screen-only

Alerts appear in the administration (and as a count on the AI screen). They are **not e-mailed**: a second kind of unattended message would be a second thing that can fail. If you want e-mail, that is a separate decision (an **Owner** item); until then, look at the AI screen after the first days and after any Anthropic incident.
