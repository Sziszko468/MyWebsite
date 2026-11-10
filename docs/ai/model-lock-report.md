# CONTROL ROOM AI — strict Claude Haiku 5.5 production integration (PROMPT 16.1)

Written from what was run, not from what was intended. The manual is [`README.md`](README.md) (see "The model lock", "Identity verification", "The connection test and activation", "Failure handling"). Nothing here was committed, deployed, or sent to the live Anthropic API: **there was no API key to use, and none was looked for.**

## Status

> **The model lock is built and tested; the live verification has not been done and cannot be done without the owner's API key.**
> Until the owner sets `ANTHROPIC_API_KEY` and the connection test (administration → AI → Model and connection → *Run connection test*, or `npm run server:cli -- ai check`) has succeeded against Anthropic's real API, **nobody may say that CONTROL ROOM AI runs on Claude Haiku 5.5 in production.** By design the assistant is then unavailable (it starts switched off and unverified), and the rest of the website, the shop, the quote requests and the e-mail work without it.

## 1. The model identifier and the evidence for it

| | |
|---|---|
| Required model | **Anthropic Claude Haiku 5.5** |
| Exact identifier | **`claude-haiku-5-5`** |
| Where it is defined | `AI_MODEL_ID` in [`server/src/modules/ai/model.ts`](../../server/src/modules/ai/model.ts), the only place any model identifier is written in the server |
| Provider | Anthropic, through the Vercel AI SDK: `ai` 7.0.166, `@ai-sdk/anthropic` 4.0.99 |

Evidence for the identifier, and what each piece is worth:

| Evidence | What it shows | What it does **not** show |
|---|---|---|
| The model table of the Claude API reference used for this build (`claude-api` skill, `shared/models.md`): "Claude Haiku 5.5, `claude-haiku-5-5`, 1M context, 128K output, **Active**", no dated alias; USD 0.10 / 0.50 per million tokens (prompts up to 100K) | the identifier is the documented one and has no dated variant, so exact comparison is safe | that the identifier is accepted **today** for the owner's account |
| `@ai-sdk/anthropic` 4.0.99 lists `'claude-haiku-5-5'` among its known model identifiers and has a capability profile for it (`node_modules/@ai-sdk/anthropic/dist/index.d.ts`, `index.js`) | the SDK provider supports the identifier | live availability |
| The connection test against the local stand-in (below) | the **code path** that sends `claude-haiku-5-5`, reads the model the provider names back, and refuses anything else, works end to end with the real provider package | anything about Anthropic's API or the model's behaviour: the stand-in is not Anthropic |

**Not done (and why):** the brief says the identifier is "subject to verification against Anthropic's current API model identifiers before deployment". That verification is exactly what the connection test performs against the live API (it asks for `claude-haiku-5-5` and requires the reply to name it). It needs a real key, so it has **not been run**; the first thing the owner does after setting the key is run it. Expected result: `ok: true`, `reportedModel: "claude-haiku-5-5"`. If Anthropic answers 404, or names another identifier, the assistant stays unavailable and says why in the administration; a developer then updates `AI_MODEL_ID`.

## 2. What was built, against the brief

| Requirement | Where / how |
|---|---|
| One model, strictly | `AI_MODEL_ID` constant; `createAiModel` is the only place the provider is created and is only asked for it; `guardModel` wraps every model call and refuses strings (which the SDK would route through the Vercel AI Gateway), other identifiers and non-Anthropic providers |
| No alternative models, fallbacks, routing | none exist; `ANTHROPIC_MODEL` is no longer read as a setting (a leftover value other than `claude-haiku-5-5` is ignored and keeps the assistant off, `model_lock`); the only retry is one more attempt against the same model |
| Guard tests | `server/test/aiModelLock.test.ts` (13 tests): fails if any other model identifier or family, provider package, provider creation outside `model.ts`, fallback construct, model-selecting variable, model in a request body, or model/key in the website source appears; plus runtime refusals |
| Identity verification | the model the **provider reports back** (`message.model`, surfaced as `response-metadata` / `response.modelId`) is compared exactly with the required id on every call; recorded per request (`ai_requests.model`, `actual_model`, `model_verified`); a mismatch discards the reply before any text is passed on, breaks the verification and raises alerts; "no model reported" is never counted as verified |
| Unavailable message | "CONTROL ROOM AI is temporarily unavailable. The required AI model could not be verified." (Hungarian and Dutch in `src/content/ai/index.ts`) on the Control Room page and in the chat, with the contact link; the floating button is not drawn |
| API key | `ANTHROPIC_API_KEY`, server environment only; not in the bundle (searched), not in responses, logs or errors (tests), not in the database (only a keyed one-way fingerprint of model + address + key, so a changed key invalidates the proof); no `VITE_` name |
| Backend gateway | `POST /api/ai/chat` unchanged in shape; the browser sends a conversation id, the language and one new message only |
| Vercel AI SDK | `streamText` / `generateText` with tools, step limit, `maxOutputTokens`, timeouts, abort signal, usage metadata; the provider is imported in one server file only |
| PROMPT 16 capabilities | the eight tools, the approval gate, the planner, the quote hand-off: unchanged, the earlier AI tests all still pass (adapted only to start from a verified, switched-on assistant) |
| Cost and usage control | per-request token limits, per-session, per-address, daily and monthly limits (USD, plus daily tokens/requests/conversations), usage and estimated cost logging, **new:** administration alerts at a configurable percentage (`alertPercent`, default 80) and when a limit is used up (one alert per kind per day/month); an administrator changes limits in Settings; exhausted budget stops generation with a clear message and never switches models |
| Admin `/admin/ai` | new first tab **Model and connection**: required model and configured identifier (read-only), provider, key state, connection state, the model the provider named, last successful test, last API error, connection test button, activation switch, total requests (with how many the provider confirmed), tokens, estimated cost, today and this month with budget state, alerts, recent tests |
| Model not editable | the identifier is not a setting (`PUT /api/admin/ai/settings` rejects `model`, `ANTHROPIC_MODEL`, `provider`, `fallbackModel`, `models` as unknown fields, 422); the administrator can switch the assistant on and off, not change its model |
| Connection test | server side; checks the key, the lock, then sends one minimal request to the required model and requires the provider to name it; records the result; returns codes only; **never switches the assistant on** |
| Failure handling | missing key, invalid key, no credit, permission, model not found, rate limit, provider outage, network, timeout, unexpected model identity, budget exhausted: each a safe code, a log line without secrets, no retry with another model, quote requests untouched, a friendly message with a contact alternative (table in the manual) |

## 3. What was run

| Check | Result |
|---|---|
| `npx tsc -b`, `npx tsc -p tsconfig.server.json`, `npx oxlint` | no errors, no findings |
| `npx vitest run` | **95 files, 2050 tests passed** (93 files / 2012 tests before this work: +2 files, +38 tests, and three existing tests that assert the exact migration list now expect migration 8) |
| `server/test/aiModelLock.test.ts` | 13 tests: source scans and runtime refusals |
| `server/test/aiVerification.test.ts` | 25 tests, the **real `@ai-sdk/anthropic` package over HTTP** against the local stand-in, told to fail with 401, 402, 403, 404, 429, 500, 529, to name another model, a look-alike identifier, or no model at all: the test, the activation (refused before verification, allowed after, never done by the test), role checks, key/address binding of the proof, the mismatch discarded before any text reaches the visitor, quote requests and health checks during an outage, budget alerts (warning once, used-up once, refusal without contacting the provider, resumption after the limit is raised), no request ever naming another model |
| Browser journey `tools/e2e/ai-journey.cjs` (real Chrome, the built site, the real backend, the stand-in) | **38 of 38 steps**: the new section 0 (the assistant starts off; the switch refuses; the tab shows the required model and no field; the test sends exactly one request for `claude-haiku-5-5` and does not switch the assistant on; the administrator switches it on) and G2 (a reply from another model is discarded and the visitor reads the fixed message with a contact link; the page stays unavailable and the provider is not contacted; the alert is shown; a new test restores service; an invalid key is a failed test with its reason and no key or provider text), plus the earlier sections A to H |
| `tools/audit/audit-ai.cjs`, visitor states, 5 viewports (320 to 1920) × dark/light, English, layout checks and axe | 86 states, no findings |
| `tools/audit/audit-ai.cjs --unavailable`, the page after the model could not be verified, English, Hungarian and Dutch | 30 states (320, 390, 768, 1440, 1920 wide × dark/light × en/hu/nl), no findings; the fixed message and a contact link were present in every state |
| `tools/audit/audit-admin.cjs --only=/admin/ai`, the four tabs × viewports × themes × hu/en, layout checks and axe | **432 views checked, 0 findings** (all four tabs of the screen, the default sizes and both themes, Hungarian and English) |
| `npm run server:cli -- ai status` / `ai check` against the stand-in | `ai check`: `ok: true`, `requestedModel` and `reportedModel` both `claude-haiku-5-5`; the assistant stayed **unavailable** (`admin_disabled`) afterwards |
| The built website searched for a key, a model identifier or the provider's address | none found (the administration's bundle contains the *names* `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` in help text only) |

Defects found while doing this, all fixed: a stream that was torn down (instead of ended) when another model's reply was discarded; the journey and the admin-audit expectations that had gone stale since earlier prompts (the reference format and source of an assistant's request after PROMPT 17; a text that now appears in the table and in the card); the new tab's own labels matching a "model field" search. The first two are in the test tools, not in product code.

## 4. Decisions and deviations from the brief

- **`ANTHROPIC_MODEL` is gone as a setting.** The brief's example is a constant; an environment variable naming a model would itself be "an alternative model configuration". A leftover value does not stop the server (the website must not depend on the assistant); it keeps the assistant off.
- **Activation is separate from verification and from the other settings.** A successful test verifies; only the administrator's switch (audited) turns the assistant on; saving other settings can never do it. It starts **off**.
- **Verification is bound to the key and address** (a keyed fingerprint). A new key, or a new address, is a new proof; the earlier administrator's switch stays as it was, so a fresh successful test restores service without a second decision (the brief only forbids a test from switching on an assistant the administrator has not switched on).
- **A chat reply with no model statement** is allowed to finish but is recorded as not verified and counted separately; the connection test, which gates activation, requires the statement. The real Anthropic API always sends it.
- **A provider that is down, rate limiting or overloaded does not break the verification** (that would make a blip switch the assistant off for good); a 404 for the model, or a reply from another model, does.
- **Alerts are shown in the administration, not e-mailed.** The e-mail outbox is for customers and the owner's quote notifications; a second kind of unattended message would be a second thing that can fail. The brief asks for "admin alerts".
- **No monthly token or request limit was added**; the monthly limit is the USD budget (the daily limits cover tokens, requests and conversations). The administration shows the month's tokens.
- **Cost of the connection tests** is shown on each test; it is not added to the request statistics (a few tokens).
- **The default tab of the AI screen** is now *Model and connection*.

## 5. Owner items (nothing here was done)

1. Set `ANTHROPIC_API_KEY` (a production key, separate from any development key) in the server environment; remove any `ANTHROPIC_MODEL`.
2. Run the connection test from the administration or `npm run server:cli -- ai check` and **keep the result**: this is the verification evidence the brief asks for, and it does not exist yet. It must say `reportedModel: claude-haiku-5-5`.
3. Check the prices in `AI_PRICE_*` against Anthropic's price list on the day, and set budgets and the alert percentage.
4. Switch the assistant on in the administration. Watch the first days' requests: *confirmed by the provider as Claude Haiku 5.5* should equal the number of requests.
5. Read the privacy section; Anthropic's data terms and any legal review are the owner's.

## 6. Not verified

- **Anything about Anthropic's live API**, the real model's behaviour (how it follows the instructions, uses tools, resists prompt injection in free text), real latency, real tokens and cost. All figures from tests, the journey and the audits come from the stand-in.
- That `claude-haiku-5-5` is accepted for the owner's account (the connection test is the check).
- Physical devices, Safari and Firefox, a screen reader, native proofreading of the new Hungarian and Dutch texts.
- Behaviour under real provider outages or real rate limits (simulated with status codes only).
