# AI infrastructure audit: CONTROL ROOM AI

**Policy under audit:** Anthropic **Claude Haiku 5.5 only**. No alternative model, no fallback, no activation if it cannot be verified.

## Verdict on the model identifier

| Question | Answer | Basis |
| --- | --- | --- |
| What identifier does the code use? | `claude-haiku-5-5` ("Claude Haiku 5.5"), a **constant** in `server/src/modules/ai/model.ts`, not read from any environment variable, setting or request | source |
| Is it a real Anthropic identifier? | **Yes**: it is in Anthropic's published model list (Claude API reference, cached 2026-11-03: Claude Haiku 5.5, `claude-haiku-5-5`, 1M context, $0.10 / $0.50 per million tokens up to 100K-token prompts, $0.50 / $2.50 above) | the platform documentation loaded during the audit |
| Does the installed SDK know it? | **Yes**: `@ai-sdk/anthropic` **4.0.99** (with `ai` **7.0.166**) lists `claude-haiku-5-5` in its model-id type, next to `claude-haiku-4-5` | `node_modules/@ai-sdk/anthropic/dist/index.d.ts` |
| Was it verified against the **live Anthropic API**? | **NO.** No API key is available to the audit and none was requested, so no request to `api.anthropic.com` was made and `npm run server:cli -- ai check` (one real request) was **not run**. The identifier is *verified against documentation and the SDK*, **not against the service** | |
| Is the assistant active in production? | **No**: `GET /api/ai/config` on the live site → `"available": false` | live |

Status for this audit: **unverified against the live API: the assistant must stay off until the administrator's connection test (below) succeeds in production.** No other model was substituted and none was activated.

## How the lock works (read and tested)

1. `createAiModel` is the only place the Anthropic provider is created and it is asked only for `AI_MODEL_ID`. A bare model string is refused (the SDK would send it to the Vercel AI Gateway, i.e. another provider).
2. `guardModel` wraps every call and checks the identifier the provider **reports back** (`response-metadata` in a stream, the response in a non-streaming call), not the one asked for. Any other model answering raises `ModelLockError` before the visitor sees a word, and the request is recorded as a failed verification (`ai_requests.actual_model`, `model_verified`).
3. `ANTHROPIC_MODEL` in the environment is **never used**: its presence only marks `modelOverrideRejected: true` and makes the assistant unavailable (`model_lock`). Run during the audit: with `ANTHROPIC_MODEL=claude-sonnet-5-5` and a placeholder key, `ai status` printed `"modelOverrideRejected": true`, `"requiredModel": "Claude Haiku 5.5 (claude-haiku-5-5)"`.
4. **Activation is gated**: the assistant starts off; an administrator can switch it on only after a **successful connection test** verified the required model for the configured key and address; a successful test never switches it on by itself. Migration 8 stores the reported model per request.
5. `server/test/aiModelLock.test.ts` fails if another model identifier, provider package or fallback construct appears in `server/src`.

If Haiku 5.5 cannot be verified (rejected identifier, retired model, key without access, a different model reported) the visitor sees the fixed sentence "CONTROL ROOM AI is temporarily unavailable. The required AI model could not be verified." and **the rest of the site is unaffected**: the assistant is a lazy-loaded panel and `/api/ai/config` answers `available: false`.

## Haiku 5.5 request-shape compatibility

Checked against the model's documented constraints: the gateway sends `effort` (`low` by default, allowed `low`/`medium`/`high`) and `thinking: adaptive` (or `disabled`, which Haiku 5.5 accepts **only at effort `high` or below**: the configuration cannot exceed `high`, so it is always valid), no `temperature`/`top_p`/`top_k` (non-default values are rejected by this model), no assistant prefill, no forced `tool_choice`, no `budget_tokens`. Streaming is `streamText` with `stopWhen: isStepCount(AI_MAX_TOOL_CALLS)` and `maxOutputTokens`. Refusals have no server-side fallback on this model, and none is configured, which matches the "no alternative model" policy.

## Infrastructure review

| Area | Finding |
| --- | --- |
| Provider integration | `@ai-sdk/anthropic` loaded on demand; `ANTHROPIC_BASE_URL` (https outside development) exists for a proxy and for the local stand-in the tests use |
| AI SDK compatibility | `ai` 7 / `@ai-sdk/anthropic` 4 / `@ai-sdk/react` 4 work together in the tests (a real provider package against a stand-in Anthropic server over HTTP) |
| Backend gateway | `modules/ai/gateway.ts`: anonymous signed session tokens (`AI_SESSION_SECRET`, else derived from `APP_SECRET`), the browser never names a model, key or address |
| API key handling | server only; masked in logs; never in the bundle (checked); `ai status` prints only `set`/`missing` |
| Streaming | UI message stream; a failed or model-mismatched stream ends cleanly with an error part |
| Tool calling | six read-only tools (developer profile, portfolio search, project details, published services, package comparison, FULL EXPERIENCE) plus a plan tool and `submitApprovedQuoteRequest`, which sends a request into the **existing** quote system only after the visitor approves a plan; prices come from the server, never the model |
| Rate limiting | per session 40, per address 30 per ten minutes (memory), 100 conversations and 1 000 requests a day |
| Token limits | 1 200 input characters, 20 history messages, 60 per conversation, 1 500 output tokens (thinking included), 6 tool steps, 90 s timeout |
| Usage logging | `ai_requests` (25 columns: tokens, cost, reported model, verified flag), `ai_tool_calls`, `ai_connection_tests`, `ai_alerts` |
| Cost controls | daily budget **$1**, monthly **$10**, alert at 80 %; a request that could exceed a budget is refused **before** it starts; prices are configuration (`AI_PRICE_*`, as of 2026-10-06) and match the published $0.10 / $0.50. **Prompts above 100K tokens are priced higher ($0.50 / $2.50); the input limits keep a prompt far below that, so the single rate is correct today (A-2, Low)** |
| Retention | conversation text kept `AI_RETENTION_DAYS` (7), counts longer |
| Error handling | provider errors are stored redacted; an unavailable assistant degrades to a message |
| Admin analytics | `/api/admin/ai/usage`, settings, alerts, knowledge refresh, connection test (all 401 without a session: covered by the 17 probe routes added in this audit) |

## Findings

| ID | Severity | Finding | Fix | Safe now? |
| --- | --- | --- | --- | --- |
| A-1 | Medium | Model not verified against the live API; assistant off in production | owner sets `ANTHROPIC_API_KEY` on the host, signs in, runs the connection test, and only then switches the assistant on; or runs `npm run server:cli -- ai check` once on the host | No (needs a key; spends a few tokens) |
| A-2 | Low | One price pair; above 100K prompt tokens Haiku 5.5 costs $0.50 / $2.50 | harmless today (limits); revisit if limits are raised | n/a |
| A-3 | Info | AI test suite: 99 tests in six files pass (model lock, provider, verification, limits, tools, flow) | | n/a |

## Not verified

Any real model behaviour (answers, tool choice, Hungarian/Dutch quality, refusals), real latency and cost per conversation, the connection test and activation against production, and prompt-injection resistance beyond what the tests simulate.
