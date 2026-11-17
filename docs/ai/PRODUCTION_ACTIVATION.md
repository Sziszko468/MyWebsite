# CONTROL ROOM AI: production activation (PROMPT 29)

This is the one page to read before CONTROL ROOM AI is switched on for real visitors. It says what is done, what was tested, what was **not** verified, and what only the owner can do. The rest of the manual is [README.md](README.md); the other pages of this folder go deeper: [SECURITY.md](SECURITY.md), [COST_CONTROL.md](COST_CONTROL.md), [OPERATIONS.md](OPERATIONS.md), [PRIVACY.md](PRIVACY.md), [TEST_RESULTS.md](TEST_RESULTS.md), [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md).

> **Nothing in this branch deploys, merges or changes a host.** No request to the real provider was made while this was built, and no money was spent. The assistant is **off** until the owner sets a key, runs the connection test and switches it on (below).

## Status at a glance

| Legend | Meaning |
|---|---|
| **Implemented** | the code is in this branch |
| **Tested** | an automated test in this repository exercises it (against a scripted mock or the local stand-in, never the real provider) |
| **Not verified** | it could not be checked here; the owner must |
| **Owner** | only the owner can do it (a secret, a host setting, a legal decision) |

| Area | Implemented | Tested | Not verified / owner |
|---|---|---|---|
| Model fixed to Claude Haiku 5.5, identity proved from the provider's own reply | yes | yes (`aiModelLock`, `aiVerification`) | Anthropic's **live** API has not been asked: the identifier was checked against the official docs and the installed SDK (below). **Owner:** run the live test once |
| Key only on the server; missing or malformed key keeps the assistant off | yes | yes (`aiProduction`: "without a usable key", "the key never leaves the server") | a real key is **Owner** |
| Browser → backend → gateway → Anthropic, streamed, with the guards in front | yes | yes (`ai`, `aiLimits`, `aiProvider`, `aiProduction`) | real latency and streaming behaviour of the real model |
| Timeouts (connection, first chunk, step, total), one bounded retry, no fallback model | yes | yes (`aiProvider`: "connection timeout"; `aiLimits`: stalled provider) | |
| Provider errors: missing/invalid key, rate limit, overload, network, timeout, invalid reply, cut-off answer, aborted request | yes | yes (`aiProvider`, `aiProduction`, `aiLimits`) | what Anthropic's real error bodies look like beyond their documented status codes |
| Tools: eight, closed set; input schema, server-side ownership, output check | yes | yes (`aiTools`, `aiProduction`) | how the real model uses them (prompt-injection resistance in free text is unmeasured) |
| Quote requests only after the visitor's own approval | yes | yes (`aiTools`) | |
| Cost control: reservation before the call, ceilings, global concurrency, three honest cost states | yes | yes (`aiLimits`, `aiVerification`, `aiProduction`) | real token usage and real cost (the stand-in's numbers are not real) |
| Administration: availability, provider status, last answer/error, usage today/month, limits hit, failures, history, ceilings, audit | yes | yes (`aiProduction`, `aiVerification`, `admin/lib/ai.test`) | a screen-reader pass |
| Visitor experience in HU / EN / NL, dark and light, reduced motion | yes | partly (unit tests; browser audit: see [TEST_RESULTS.md](TEST_RESULTS.md)) | real devices, Safari, Firefox; **native proofreading of HU and NL** |
| Privacy notice and retention | yes (one sentence added) | yes (`privacy.test`) | Anthropic's data terms and a legal review are the **Owner's** |

## The model, exactly

| What | Value |
|---|---|
| Model | **Claude Haiku 5.5** |
| API identifier | **`claude-haiku-5-5`** (also the alias; there is no dated variant) |
| Where it is defined | one constant, `AI_MODEL_ID`, in `server/src/modules/ai/model.ts`. Nothing else in the server contains a model identifier |
| Who can change it | a developer, by editing that constant and deploying. Not an environment variable, not the administration, not a request |

**How the identifier was verified (2026-11-17):**

1. **Official documentation**: the models overview page, <https://platform.claude.com/docs/en/about-claude/models/overview>, lists *Claude Haiku 5.5* with *Claude API ID* `claude-haiku-5-5` and *Claude API alias* `claude-haiku-5-5` ("Every Claude model ID is a pinned snapshot, including the dateless IDs used from the 4.6 generation on"), 1M-token context, 128K output, retirement "not sooner than October 7, 2027".
2. **The installed SDK**: `@ai-sdk/anthropic` 4.0.99 lists `'claude-haiku-5-5'` in its `AnthropicModelId` type (`node_modules/@ai-sdk/anthropic/dist/index.d.ts`); `ai` 7.0.166.
3. **The Claude API reference bundled with the build tooling** (model table cached 2026-11-03) says the same.

What this does **not** prove: that *your* API key is allowed to use the model. That is what the connection test is for (it asks the provider, and requires the provider's reply to name `claude-haiku-5-5`).

## Environment variables

Set these in the **backend's** secret environment (Render, in this project), never in a `VITE_` variable and never in Git. The complete, commented list is in [`.env.example`](../../.env.example).

| Variable | Required? | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | **yes** for the assistant | the provider key. **Owner** creates it (see "Secret procedure"). Empty or malformed: the assistant stays off |
| `AI_ASSISTANT_ENABLED` | no (default `true`) | the operator's master switch. `false` turns the assistant off whatever else is set |
| `AI_CEILING_*` | no (defaults below) | the operator's **hard ceilings**: nothing the administration saves can exceed them. `AI_CEILING_DAILY_BUDGET` 25 (USD), `AI_CEILING_MONTHLY_BUDGET` 250, `AI_CEILING_DAILY_TOKENS` 50 000 000, `AI_CEILING_DAILY_REQUESTS` 20 000, `AI_CEILING_CONCURRENT` 25, `AI_CEILING_OUTPUT_TOKENS` 4 000, `AI_CEILING_INPUT_CHARS` 4 000, `AI_CEILING_TOOL_CALLS` 10, `AI_CEILING_REQUESTS_PER_SESSION` 200, `AI_CEILING_DAILY_CONVERSATIONS` 2 000 |
| `AI_DAILY_BUDGET`, `AI_MONTHLY_BUDGET` | no (1 / 10 USD) | the starting budgets. A starting value above its ceiling stops the server with a message naming the variable |
| `AI_MAX_CONCURRENT_REQUESTS` | no (8) | answers written at the same moment, all visitors together |
| `AI_TIMEOUT_MS`, `AI_CONNECT_TIMEOUT_MS` | no (90 000 / 20 000) | one answer's total time; the longest the provider may take to *start* answering |
| other `AI_*` limits | no | see [COST_CONTROL.md](COST_CONTROL.md) and `.env.example` |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK`, `AI_PRICES_AS_OF` | no | override the price list **only** if the provider changed prices before the code did (the list is in `pricing.ts`) |
| `ANTHROPIC_BASE_URL` | no | another provider address (a proxy; the local stand-in in tests). Leave empty for Anthropic |
| `ANTHROPIC_MODEL` | **do not set** | not a setting. A leftover value other than `claude-haiku-5-5` keeps the assistant off |

## Secret procedure (what the owner does, outside Git)

1. In the Anthropic Console create a **new** API key just for this site (a workspace of its own with a spend limit is the safest set-up: Anthropic enforces it even if this server's limits were bypassed). **Never reuse a key that was ever pasted into a chat, a ticket or a commit; if one was, revoke it.**
2. Put it in the backend's secret environment as `ANTHROPIC_API_KEY`. Not in the repository, not in `.env.example`, not in a chat.
3. Restart the backend. Check `npm run server:cli -- ai status`: `apiKey` must say `set` (never the value).
4. Do not paste the key anywhere else. The administration shows only "set", "missing" or "malformed"; there is no field to type a key into.

## What happens without a key (or with a bad one)

| Case | Visitors | Administration | Server |
|---|---|---|---|
| no key | the floating button is not drawn; `/control-room` says the assistant is not available and offers the contact page; the rest of the site is untouched | status "No API key is configured"; activation refused (409) | no request is ever made to anyone; `ai status` says `missing` |
| malformed key (too short, or contains white space) | same | status "The configured API key is malformed"; the value is dropped, never echoed | the server **starts** (the site must not depend on the assistant); a warning is not needed because the administration says it |
| key the provider rejects (401/403) | the answer fails with a friendly message and the contact alternative | alert `provider_auth`; last provider error; the connection test fails with `invalid_key` | recorded as a sanitized code; **no other model, no other provider is tried** |
| no credit (402) | friendly message | alert `provider_billing` | same |

## Provider failure behaviour

Every failure ends the same way: a short code, a safe log line (no key, no prompt, no provider text), at most **one** retry against the **same** model for a transient error, never another model or provider, the visitor's quote requests untouched, and a message in the visitor's language. The table of codes is in [README.md](README.md#failure-handling) and [OPERATIONS.md](OPERATIONS.md#failure-runbook). New in this change: an answer the provider returned **empty** or that **cannot be parsed** is told to the visitor as a failure (`provider_invalid_response`), an answer **cut off at the output limit** is kept and marked, and one that hit the limit before a single word is a failure (`output_limit`).

## Activation, step by step (Owner)

1. Merge/deploy this work by your own process (this branch does neither).
2. Set `ANTHROPIC_API_KEY` (above). Optionally lower or raise the ceilings. Check the price list against <https://platform.claude.com/docs/en/about-claude/pricing>.
3. Run the **live smoke test** once (next section). Keep its output as the evidence that the model answered.
4. In the administration, **AI → Model and connection**: *Run connection test* (it must verify), then switch the assistant **on**. A successful test never switches it on by itself.
5. Look at **AI → Operations** after the first real conversations: provider status "Working", the last answer, the cost against your own Anthropic usage page (the estimate is not a bill).

## The live smoke test (opt-in, off by default)

There is exactly one thing in this repository that talks to the real provider, and it only runs when a person asks:

```bash
npm run server:cli -- ai check --live
```

It sends **one** minimal request (a short sentence, at most 400 output tokens, no retry) to `claude-haiku-5-5` with the key in the environment, requires the provider's reply to name `claude-haiku-5-5`, records the result, and prints codes and numbers only (never the key, never the provider's message). It costs a fraction of a cent. Without `--live` the command prints what it would do and sends nothing (exit code 2). The administration's **Run connection test** button does the same on an administrator's click. **No test in the suite does this**, and **it has not been run by the author of this change**: no key was available.

## Rollback

| To… | Do |
|---|---|
| stop answering visitors at once | administration → AI → Model and connection → switch off (the button disappears, the page says so), or set `AI_ASSISTANT_ENABLED=false` and restart |
| stop spending | lower the budgets (administration), or remove `ANTHROPIC_API_KEY` and restart; the assistant is then unavailable and nothing is requested |
| undo the code | **the previous code will not start on a database that has migration 0016** ("Refusing to start on a newer schema": the migrator stops on a number it does not know). So rolling the *code* back means restoring the database backup taken before the first deploy of this change (that is why the checklist asks for one). **Rolling the *behaviour* back needs no deploy**: switch the assistant off or remove the key (rows above). Migration 0016 itself is additive (three columns on `ai_requests`, one new table) and changes no existing row |
| revoke a leaked key | revoke it in the Anthropic Console first, then set the new one |

## Outstanding owner actions

See [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md). In short: the key, the live test, the spend limit at Anthropic, Anthropic's data terms, the legal/privacy review, native proofreading (HU, NL), a decision on alert e-mails (alerts are shown in the administration only), and the migration-number question when branches are merged (this lineage's 0016 may clash with another branch's).
