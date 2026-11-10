# CONTROL ROOM AI

The portfolio's AI assistant (PROMPT 16): a floating panel on every page and a full page at `/{hu,en,nl}/control-room`, answered by **Claude Haiku 5.5** (`claude-haiku-5-5`) through the **Vercel AI SDK**, behind the site's own backend. It explains the published work, services, packages and FULL EXPERIENCE, helps a visitor plan a project, and, only after the visitor presses a button, turns the plan into a quote request in the existing quote system.

Everything here is read from, or enforced by, the code in this repository. Where something could not be checked, the section "What was not verified" says so.

- [Architecture](#architecture)
- [Packages](#packages)
- [Configuration](#configuration)
- [The model and the key](#the-model-and-the-key)
- [The eight tools](#the-eight-tools)
- [Security: what the server enforces](#security-what-the-server-enforces)
- [The project planner and the approval](#the-project-planner-and-the-approval)
- [Budgets and limits](#budgets-and-limits)
- [Data, privacy and retention](#data-privacy-and-retention)
- [The administration](#the-administration)
- [The website](#the-website)
- [API](#api)
- [Operating it](#operating-it)
- [Tests and checks](#tests-and-checks)
- [Deviations from the brief](#deviations-from-the-brief)
- [What was not verified](#what-was-not-verified)
- [Voice: prepared, not built](#voice-prepared-not-built)

## Architecture

```
 browser                                   backend (server/)                              provider
 ───────                                   ─────────────────                              ────────
 floating panel ─┐                         /api/ai/session  ── signed anonymous token
 /control-room  ─┼─ text only ───────────► /api/ai/chat ──► Assistant (gateway.ts)
 (one shared     │   conversationId        │   1. session + conversation ownership
  conversation)  │   + the new message     │   2. limits, then budget RESERVATION (BEGIN IMMEDIATE)
                 │                         │   3. history loaded from the SERVER's own copy
 ◄── UI message stream ◄─────────────────  │   4. streamText(claude-haiku-5-5, 8 closed tools) ──────► Anthropic Messages API
                                           │   5. tools read published data / write the plan / submit an approved request
                                           │   6. reconcile with the provider's usage, store the answer
                                           └── SQLite (ai_* tables)  ·  quote_requests  ·  notifications
 admin /admin/ai ──► /api/admin/ai[/settings|/usage|/knowledge/refresh]
```

- The browser sends **only** a conversation id and the visitor's new text. It never sends history, a model name, tools, a system prompt or a budget, and the server would ignore them if it did. The conversation the model sees is the server's stored copy.
- The provider SDK and the key exist **only** in the backend. The browser bundle contains no AI library for the provider: the website uses `@ai-sdk/react`'s chat client (a lazy chunk, loaded when the assistant is first opened) against the site's own `/api/ai/*`.
- Server code: `server/src/modules/ai/` — `gateway.ts` (the request lifecycle), `tools.ts` (the closed tool set), `knowledge.ts` (read-only access to published data), `plan.ts`, `quote.ts` (approval and submission), `budget.ts` (reservation, limits, cost), `store.ts` (sessions, conversations, messages), `settings.ts`, `prompt.ts`, `routes.ts`, `admin.ts`.
- Website code: `src/ai/` (client, availability, shared conversation), `src/components/ai/` (panel, launcher, chat surface, plan panel, history), `src/pages/ControlRoomPage.tsx`, `src/content/ai/` (every word, in three languages).
- Administration: `src/admin/pages/AiPage.tsx`, `src/admin/lib/ai.ts`, `src/admin/components/AiCharts.tsx`.

## Packages

| Package | Version installed | Where |
|---|---|---|
| `ai` (Vercel AI SDK) | 7.0.166 | server (streaming, tools, UI message protocol) and the chat client's types |
| `@ai-sdk/anthropic` | 4.0.99 | server only: the Anthropic provider |
| `@ai-sdk/react` | 4.0.168 | website: `Chat` / `useChat` over the site's own endpoint |
| `zod` | 4.6.7 | server: tool input schemas |

**An exception to "no runtime dependencies"**: the backend had none; these are now loaded by the assistant only, with a dynamic `import()` the first time a request needs them. A deployment that does not use the assistant (no key, or `AI_ASSISTANT_ENABLED=false`) never loads them, but `npm ci` still installs them. `server/test/security.test.ts` records the exception and the reason.

## Configuration

All variables are in `.env.example` (section "CONTROL ROOM AI"). The ones that matter:

| Variable | Meaning | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | The provider key. Secret; backend only. Empty = the assistant is not offered. | empty |
| ~~`ANTHROPIC_MODEL`~~ | **Not a setting any more** (PROMPT 16.1). The model is a constant in code. A leftover value other than `claude-haiku-5-5` is ignored and keeps the assistant switched off (see "The model lock"). | n/a |
| `ANTHROPIC_BASE_URL` | Another provider address ending in `/v1` (a proxy, or the test stand-in). | Anthropic |
| `AI_ASSISTANT_ENABLED` | The operator's master switch. The administrator's own activation (a setting, **off** until switched on) comes on top of it. | `true` |
| `AI_SESSION_SECRET` | Signs anonymous session tokens; derived from `APP_SECRET` when empty (≥ 32 characters if set, in production). | derived |
| `AI_EFFORT`, `AI_THINKING` | `low\|medium\|high` and `adaptive\|disabled`. Thinking counts as output tokens. | `low`, `adaptive` |
| `AI_PRICE_INPUT_PER_MTOK`, `AI_PRICE_OUTPUT_PER_MTOK`, `AI_PRICES_AS_OF` | USD per million tokens, and when they were read. **Check them against the provider's price list**: costs are computed from these. | 0.10 / 0.50, 2026-10-06 |
| `AI_DAILY_BUDGET`, `AI_MONTHLY_BUDGET` | USD. | 1 / 10 |
| `AI_ALERT_PERCENT` | An administration alert is raised when a budget (cost, tokens, requests) reaches this percentage, and again when it is used up. | 80 |
| `AI_DAILY_TOKEN_BUDGET`, `AI_DAILY_REQUESTS`, `AI_MAX_DAILY_CONVERSATIONS` | Daily ceilings. | 2 000 000 / 1000 / 100 |
| `AI_MAX_INPUT_CHARS`, `AI_MAX_HISTORY_MESSAGES`, `AI_MAX_CONVERSATION_MESSAGES`, `AI_MAX_OUTPUT_TOKENS`, `AI_MAX_TOOL_CALLS` | Per message / per answer. | 1200 / 20 / 60 / 1500 / 6 |
| `AI_MAX_REQUESTS_PER_SESSION`, `AI_MAX_REQUESTS_PER_IP` | Per visitor session, and per address in 10 minutes. | 40 / 30 |
| `AI_CONVERSATION_MAX_HOURS`, `AI_TIMEOUT_MS` | A conversation's lifetime, and one answer's total time. | 24 / 90000 |
| `AI_RETENTION_DAYS` | Days the **words** of a conversation stay on the server. | 7 |

The environment gives the **starting values**; what an administrator saves in the AI screen wins, field by field. The key and the provider address are never settings: they are environment only. **The model is not even that**: it is fixed in code.

## The model lock

**CONTROL ROOM AI runs exclusively on Anthropic Claude Haiku 5.5. If that model cannot be reached or verified, the assistant stays unavailable. It never switches to another model or provider, and availability is never bought with a different model.** The rest of the website, the shop, the quote requests and the e-mail do not depend on the assistant and keep working.

| What | Value |
|---|---|
| Provider | Anthropic, through the Vercel AI SDK (`ai` 7.0.166, `@ai-sdk/anthropic` 4.0.99) |
| Model identifier | **`claude-haiku-5-5`** (Claude Haiku 5.5; Active; no dated alias, so no other string is ever accepted for it) |
| Where it is defined | one constant, `AI_MODEL_ID`, in `server/src/modules/ai/model.ts`. Nothing else in the server contains a model identifier. |
| How it is changed | by a **developer**, by editing that constant, reviewing and deploying it. Not by an environment variable, an administration field or a request. |

How the lock is built:

- `createAiModel` (`model.ts`) is the only place the Anthropic provider is created, and it is only ever asked for `AI_MODEL_ID`. The key and the address come from the server's own configuration.
- Every model call (`streamText` in `gateway.ts`, `generateText` in the connection test) receives the model through `guardModel`: it refuses a bare string (the AI SDK would resolve one through the Vercel AI Gateway, i.e. another provider), any model not named `claude-haiku-5-5`, and any provider whose name does not start with `anthropic`.
- There is **no** fallback list, router, model setting, alternative provider package, or "try another model" branch. The only retry the SDK makes is one more attempt against the same model for a transient error (`maxRetries: 1`).
- `ANTHROPIC_MODEL` was removed as a setting. If a leftover value is present and differs from `claude-haiku-5-5`, the server still starts (the website must not depend on the assistant) but the assistant is unavailable with the reason `model_lock`, and the connection test reports it without calling the provider.
- `server/test/aiModelLock.test.ts` fails if the server source names any other model or model family, imports any other provider package, creates the provider anywhere but `model.ts`, adds a fallback construct or a model-selecting variable, lets a request body carry a model, puts a model name or key in the website's source, or adds another AI provider to `package.json`. Its runtime half hands the gateway other models, a model from another provider, a string, and a model that lies about its identity, and checks each one is refused and nothing was requested from it.

## Identity verification

Asking for a model is not proof that it answered. The assistant therefore reads the model the **provider reports back** (`message.model` in Anthropic's reply, surfaced by the SDK as the `response-metadata` part of a stream, or `response.modelId` of a non-streamed call) and compares it **exactly** with `claude-haiku-5-5`. A dated variant, a different case or any other family does not match.

- **A request** whose reply names another model fails before any of its text is passed on: the stream ends with the error code `model_mismatch`, the request is recorded with the requested and the reported identifier (`ai_requests.model`, `actual_model`, `model_verified`), the verification is marked **failed**, an administration alert is raised, and the assistant is unavailable until a connection test succeeds again. Nothing is retried with another model.
- A request whose reply reports **no** model at all is allowed to finish (a visitor is not punished for a provider that omits a field) but is recorded as **not verified**; the administration counts such requests separately and never counts them as "answered by Claude Haiku 5.5".
- The administration shows, for the whole history: how many requests were **confirmed by the provider** as the required model, how many had no model statement, and how many were answered by another model (and so refused).
- The record `ai.verification` (one row of `settings`) holds the state `unverified | verified | failed`, the identifier it is about, what the provider reported, when, and a **keyed one-way fingerprint** of (model, provider address, API key). The key itself is never stored. If the key or the address changes, the earlier proof no longer matches the fingerprint and the assistant is unavailable (`stale`) until the test is run again, because another key is another account and another proof is needed.

## The connection test and activation

The server-side connection test (`POST /api/admin/ai/connection-test`, the administration's "Run connection test" button, or `npm run server:cli -- ai check`) does this, in order:

1. checks that a key is configured and that the model lock is intact (no leftover `ANTHROPIC_MODEL`);
2. sends **one minimal request** (a short sentence, at most 400 output tokens, no retry) to `claude-haiku-5-5` with the server's key and address;
3. requires the provider's reply to name `claude-haiku-5-5` as the model that answered;
4. records the result (the history of tests, the verification record, the last error) and, on failure, raises alerts;
5. returns codes and numbers only: never the key, never the provider's message.

A successful test **verifies** the model. It does **not** switch the assistant on. Visitors are offered the assistant only while **all** of these hold: the operator's master switch is on, the administrator has switched the assistant on, a key is set, no model override is present, and the model is verified for the configured key and address. Switching it on while the model is not verified is refused (`409`, `verification_required`); switching it off is always allowed. Saving other settings can never switch the assistant on or off: the activation is its own action (`PUT /api/admin/ai/settings` with `{ "enabled": … }`, audited as `ai.activate` / `ai.deactivate`).

## Failure handling

Every failure ends the same way: a short code, a safe log line (no key, no provider text, no prompt), an alert where the administrator has to act, **no retry with another model**, the customer's quote requests untouched, and a friendly message with a contact alternative.

| Case | Code | Effect on the assistant | Administration |
|---|---|---|---|
| Missing key | `no_api_key` | unavailable | status "No API key"; the test does not call anyone |
| Invalid key (401) | `provider_auth` / `invalid_key` | requests fail; the verification stays (it is bound to the key) | alert `provider_auth`; last error |
| No credit / billing (402) | `provider_billing` / `billing` | requests fail | alert `provider_billing` |
| Key may not use the model (403) | `provider_auth` / `permission` | requests fail | alert `provider_auth` |
| Model not found (404) | `model_not_found` | **verification failed**: unavailable until a test succeeds | alerts `model_not_found`, `model_unverified` |
| Another model answered | `model_mismatch` | **verification failed**; the reply is discarded | alerts `model_mismatch`, `model_unverified` |
| No model statement in a test | `model_unreported` | the test fails: not verified | alert `model_unverified` |
| Rate limited (429) | `provider_rate_limit` | that request fails; one retry against the same model by the SDK | last error |
| Provider down / overloaded (5xx, 529) | `provider_unavailable` | that request fails | last error |
| Network error / timeout | `network` / `timeout` | that request fails | last error |
| Invalid tool call | the tool's own refusal | the model is told; nothing is executed | tool statistics |
| Budget used up | `daily_budget`, `monthly_budget`, … | new answers pause; clear message | alert `cost_*_exhausted` etc. |

A `404` is read as "the provider does not know the required model", which is what Anthropic answers for an unknown model identifier; the same status also comes from a wrong `ANTHROPIC_BASE_URL` (a missing `/v1`, for example). The effect is the safe one either way (the assistant is unavailable until a test succeeds), but if the test says "model not found" on a fresh set-up, check the address first.

What a visitor sees: when the administrator has switched the assistant on but the model is not verified (or a reply came from another model), the Control Room page and the chat say, in the visitor's language, **"CONTROL ROOM AI is temporarily unavailable. The required AI model could not be verified."** (Hungarian and Dutch texts are in `src/content/ai/index.ts`), followed by the contact page link and the note that the rest of the site works. A budget that is used up says the assistant "has reached its capacity for now" with the same alternatives. The floating button is simply not drawn while the assistant is unavailable.

## The key

- The key is `ANTHROPIC_API_KEY`, in the backend environment only. It is never hardcoded, never has a `VITE_` name, is never sent to the browser, never stored in the database (only the keyed fingerprint above), never committed, never written to a log, and never part of an error message (a provider error that contains it is redacted: `server/test/aiLimits.test.ts` and `aiVerification.test.ts` check the visitor's response, the administration's responses and the log).
- It is read once at start-up, registered with the log redactor, and is not part of `redactedConfig` (which says only "set" or "missing"). Use separate keys for development and production.
- A search of the built site finds no key and no model identifier in the public bundles; the administration shows the model name it is told by the server.
- Requests go out with adaptive thinking and low effort (`providerOptions.anthropic`), `maxOutputTokens` from the settings, and no temperature (the model family does not take one). The wire format was captured against the local stand-in: `thinking: {type: "adaptive"}`, `output_config: {effort: "low"}`, `tool_choice: {type: "auto"}`, `stream: true`, and the eight tool definitions.
- `npm run server:cli -- ai status` says whether the assistant is available and why not (the key is shown as "set"/"missing"). `npm run server:cli -- ai check` runs the connection test: **one real request** (a few tokens). Nothing in the test suite does that: the suite uses a scripted mock model and a local stand-in for Anthropic's API.

## The eight tools

The set is closed: the model can call these and nothing else, and every tool is validated by the server whatever the model sends. Every claim the assistant makes about the developer, a project, a service, a package, a price or FULL EXPERIENCE must come from one of them; the standing instructions say so, and the server returns only published data.

| Tool | Reads / writes | Notes |
|---|---|---|
| `getDeveloperProfile` | published profile | Fields that are not filled in are reported as not published. |
| `searchPortfolioProjects` | published projects | Query and filters are length-limited; drafts are not reachable. |
| `getProjectDetails` | one published project | By slug; an unknown or unpublished slug answers "not published". |
| `getPublishedServices` | services and add-ons | As in the catalogue, including "custom quote". |
| `comparePackages` | Launch / Grow / Build / Care | Only packages that exist; prices exactly as published. |
| `getFullExperienceDetails` | FULL EXPERIENCE | A custom quote, never a price. |
| `createProjectPlan` | the plan of **this** conversation | Validated fields and lengths; the visitor's edits and this tool share one versioned plan. |
| `submitApprovedQuoteRequest` | creates one quote request | Takes **no arguments**. Works only for a plan the visitor has approved with the button; see below. |

Tool calls are recorded (name, status, duration, no text) for the administration's statistics. When the planner or the assistant's quote sending is switched off in the administration, the corresponding tools are not offered to the model at all.

## Security: what the server enforces

The instructions ask the model to behave; the server does not depend on it.

| Risk | What stops it |
|---|---|
| Key exposure | Key only in the backend environment; redacted in logs; not in responses or the bundle. |
| The browser choosing model / tools / history | The chat endpoint reads a conversation id, the trigger, the language and the new text only (empty or over-long text is refused with 422). History is the server's stored copy: a `model`, `tools`, `system`, `instructions`, `toolChoice` or `messages` (even a `system` one) in the body is ignored, which `server/test/ai.test.ts` checks against what the model actually received. |
| Someone else's conversation | Conversations belong to the session that created them; any other session gets 404. The session token is an HMAC-signed random id; there is no account and no cookie. |
| Prompt injection from a visitor or from tool results | Both are treated as data in the instructions, but the protection is structural: the tools are read-only over **published** data, the planner touches only the current conversation's plan, and the one write that matters needs the approval below. No tool reaches drafts, inquiries, customer data, accounts, settings or the filesystem, so there is nothing for an injected instruction to reach. |
| Tool misuse | Closed tool set; per-tool input schemas; at most `maxToolCalls` steps per answer; the submit tool has no input to forge. |
| Sending a request without consent | Approval gate (below). The model cannot create an approval. |
| Unbounded cost | Budget reservation before the model is called; per-session, per-address, daily and monthly limits (below). |
| Concurrent abuse | One answer at a time per conversation (409 `busy`); at most two open answers per session. |
| Output as markup | The website draws answers as React elements from a tiny safe subset (paragraphs, lists, bold, code, links to site pages or `https:`); `javascript:`, images and HTML come out as text (`RichText.test.ts`). |
| Provider text reaching visitors | Errors are mapped to a code; the interface has its own sentence for each code in three languages. Provider messages are logged (redacted), never shown. |
| Browser policy | The site's CSP is unchanged: `connect-src 'self'` (plus the API origin when it is another host; the build now adds it), no inline script, no frames. The floating panel is a native `<dialog>`. |

The assistant also never states a price, discount, delivery time, certification, testimonial or result that a tool did not return, and the interface texts themselves contain none (`src/content/ai/ai.test.ts`).

## The project planner and the approval

1. The visitor describes an idea; the assistant asks one question at a time and records answers with `createProjectPlan` (project type, goal, audience, features, technology categories, integrations, authentication, admin, languages, mobile, complexity, timeline, optional budget idea, open questions, next steps). The plan panel shows it live; the visitor can edit any field, restart it, or ask the assistant to change it. Complexity is labelled an estimate and no price or date is ever part of a plan.
2. When the plan is complete, the panel offers **"Send this request"** with name, e-mail address, optional company and an acknowledgement of the privacy notice. These are typed **in the panel, not in the chat**, and posted to `/api/ai/conversations/:id/quote-approval`.
3. The server stores an **approval** bound to the plan's version and content hash, valid for 10 minutes, and the interface tells the assistant "approved". The contact details sit in the approval row and **never go to the model**: the provider request contains neither the name nor the address (checked in the browser journey by reading what the stand-in received).
4. Only now does `submitApprovedQuoteRequest` do anything. It re-checks that the approval exists, has not expired, is unused and matches the **current** plan; if the plan changed, even by the visitor's own edit, it refuses and the visitor must approve again. On success it inserts a `quote_requests` row (`kind = full_experience`, `source = ai_assistant`, an `A-` reference, the brief built from the stored plan) and sends the same notifications as the website's form. The contact fields in the approval are then cleared.

In the administration the request appears in the normal Quotes list, marked as written by the assistant, with the plan as its brief.

## Budgets and limits

Before the model is called, the server **reserves the worst case** for the request in one `BEGIN IMMEDIATE` transaction (SQLite has a single writer, so two concurrent requests cannot both pass a budget that only one fits): `steps × (prompt tokens + 1500)` input and `steps × maxOutputTokens` output, priced from the settings. A request that could take the day or the month over its USD budget, or the daily token, request or new-conversation count, is refused before it starts, with a friendly message to the visitor and the specific reason in the administration.

When the stream ends, the reservation is reconciled with what the provider reported (`provider_usage`), or, if it reported nothing, with an estimate (`estimate`); a visitor closing the page marks the request `aborted` and still counts what was used; a crash is swept after a while as `abandoned` and counts at the reserved cost, so a failure can only make the books more conservative. A request that failed before the provider reported any usage (the provider was down, say) costs nothing **and counts no tokens**: otherwise retries against a provider that is down would use up the day's token budget while nothing was spent (found by a browser audit and covered by `aiLimits.test.ts`). **A cost shown anywhere is an estimate from token counts and the configured prices, not a bill.**

Other limits: message length, history window, conversation length and lifetime, answer tokens, tool steps, one answer at a time per conversation, per-session and per-address request limits, session creation rate. The interface says "Control Room AI has reached its capacity for now" when a budget is exhausted: it is a normal state, not an error page.

## Data, privacy and retention

New tables (migration `0006_control_room_ai.sql`): `ai_sessions` (random id, keyed hash of the address, counters), `ai_conversations` (language, title, coarse topic, plan, counts), `ai_messages` (the server's copy of the conversation), `ai_requests` (one row per model request: reservation, actual tokens, cost, status, steps, tool calls, error code, latency), `ai_tool_calls`, `ai_approvals`; plus `quote_requests.source` (`website | ai_assistant`).

- **Words** (messages, title, plan) are deleted when the visitor deletes the conversation (immediately) and after `AI_RETENTION_DAYS` (default 7), by the daily maintenance job. **What stays**: counts, timestamps, language, a coarse topic derived from the tools used (never from the text), token numbers and costs. None of it contains anything a visitor wrote, and usage rows have no foreign key to conversations, so deleting a conversation never changes what was spent.
- The visitor's address is stored only as a keyed hash.
- The browser keeps one `sessionStorage` item, `cc-ai`: a session token and a conversation id. It is listed in the privacy notice (`/privacy`), which also has a "Control Room AI" section: what is processed, that the text goes to Anthropic to be answered, how long it stays, how to delete it, and that sensitive personal data should not be entered. The notice is **not a legal opinion**: nothing here claims GDPR or any other compliance without a review by someone qualified, and the processor details (Anthropic's terms, data location, any data processing agreement) must be checked by the owner.
- Anthropic's own retention and training terms are the provider's; check the terms that apply to your account.

## The administration

`/admin/ai` (reading needs the `system:read` permission; saving settings and refreshing the knowledge need `system:write`):

- **Model and connection** (the first tab): the required model (Claude Haiku 5.5) and its configured identifier, shown but **not editable**; the provider, the API key's state ("set"/"missing", never the value), the connection state (connected / not tested / failed / stale / no key / blocked by the lock), the model the provider named in its last proof, the last successful test and the last API error; the **Run connection test** button; the **activation** switch (off until switched on, refused while the model is unverified); total requests with how many the provider confirmed as the required model, tokens, estimated cost, today and this month against the budgets with their state (within budget / warning / used up); the **alerts** (mark as seen); and the recent tests. An administrator can switch the assistant on and off here; nobody can switch its model.
- **Overview**: today, this month and all time against the budgets; requests, conversations, tokens, **estimated** cost, failures by cause, latency; "What visitors do" (counts only): question categories, tools used (calls, refusals/failures, time), project plans completed, quote requests sent from a conversation, average conversation length; and charts over the last 30 days, 12 weeks or 12 months, each with a "Show the numbers" table alternative.
- **Settings**: the switches (planner, quote sending), languages, every limit and budget, the alert percentage, effort and thinking, prices and their date, welcome message and suggested questions per language. The server validates every field and marks the ones it refuses (a daily budget above the monthly one, for example).
- **Knowledge**: what the assistant can read (profile, projects, services, packages, FULL EXPERIENCE) with counts and a fingerprint, and a button that refreshes the cache. It shows nothing the assistant cannot say.

The administration never shows the key, and no conversation text is listed there: it has statistics, not transcripts.

## The website

- **Floating assistant**: a button on every page (hidden on `/control-room` and the privacy page, and when the assistant is off or there is no backend). The page asks the backend whether to offer it when the browser is idle, with one tiny cacheable request; **no AI code and no session** exist until the button is pressed. It is a native `<dialog>`: modal and full screen on phones, a non-modal corner panel on desktops; it follows the on-screen keyboard (`visualViewport`), keeps clear of the consent banner and the shop's sticky request bar, and returns focus to the button on close.
- **`/control-room`**: three areas on a desktop (the visitor's conversations in this tab, the conversation, the plan); on a phone one column with the conversations in a drawer and the plan on a tab. It shows the **same conversation** as the floating panel (a conversation id in `sessionStorage`; the server holds it).
- Streaming with stop, retry, regenerate, copy, new conversation, delete; an `aria-live` region announces the answer; the box keeps the draft; Enter sends, Shift+Enter breaks the line.
- Languages: Hungarian, English, Dutch. The interface follows the site's language switch; the assistant is told the visitor's selected language and answers in it; the same conversation can continue after switching.
- Every word of the interface is in `src/content/ai/index.ts` in three languages (a missing translation fails the type check).

## API

Public (`/api/ai`): `GET /config`, `POST /session`, `POST /chat` (streamed UI message protocol), `GET|DELETE /conversations[/:id]`, `PUT|DELETE /conversations/:id/plan`, `POST /conversations/:id/quote-approval`. Administration (`/api/admin/ai`): `GET /`, `PUT /settings`, `GET /usage?range=daily|weekly|monthly`, `POST /knowledge/refresh`, `POST /connection-test`, `POST /alerts/acknowledge`. Session creation and the reads are rate-limited; the chat is governed by the limits above.

## Operating it

1. Set `ANTHROPIC_API_KEY` in the backend environment (never in a `VITE_` variable) and check `ai status`. Remove any `ANTHROPIC_MODEL`. Then run the **connection test** (`ai check`, or AI > Model and connection > Run connection test): it must say the provider named `claude-haiku-5-5`.
2. Check the prices in the environment against the provider's current list, and set the budgets you are comfortable with. The defaults are deliberately small (USD 1 a day, 10 a month).
3. Read the privacy section and adapt it to your situation (processor, location, contact for data requests).
4. After deployment, look at the AI screen: errors, refusals, latency, and the estimated cost against the provider's own usage page. **Do not trust the estimate over the provider's bill.**
5. Switch the assistant **on** on the Model and connection tab (it starts off, and a successful test does not switch it on). To switch it off at once: the same switch (the button disappears, the page says so) or `AI_ASSISTANT_ENABLED=false`.
   If Anthropic renames or retires `claude-haiku-5-5`, the assistant becomes unavailable by itself (404 or a changed identifier) until a developer updates `AI_MODEL_ID`, reviews it and deploys it.
6. The migration runs with the others at start-up (`npm run server:migrate`); backups include the new tables.

Nothing in this change deploys itself.

## Tests and checks

- **Backend (vitest)**: `server/test/ai.test.ts` (routes, sessions, ownership, streaming protocol, stored conversation, retention, deletion), `aiTools.test.ts` (each tool, plan, approval and submission, every refusal), `aiLimits.test.ts` (limits, atomic reservation under concurrency, reconciliation, abandoned sweep, budgets, administration), `aiProvider.test.ts` (the real `@ai-sdk/anthropic` provider over HTTP against the stand-in: wire format, streaming, errors, no key/model leakage), `aiModelLock.test.ts` (the model lock: source scans and the runtime refusals), `aiVerification.test.ts` (the connection test, identity verification, activation, every provider failure, alerts and budget limits, with the real provider package over HTTP). The model is the AI SDK's `MockLanguageModelV4` fed a script.
- **Website (vitest)**: interface texts (three languages, placeholders, no price/promise), safe rich text, error mapping and session storage, the administration's form and charts, the privacy notice's storage list.
- **Browser journey** (`tools/e2e/ai-journey.cjs`, real Chrome, real backend, stand-in provider): 31 steps from opening the panel to the request appearing in the administration, including a phone with the keyboard open. See `tools/e2e/README.md`.
- **Audits** (`tools/audit/audit-ai.cjs`): the page and the panel in every state at nine viewport sizes, with the layout checks and axe.

## Deviations from the brief

- **A dependency exception** in the backend (see Packages).
- **Hungarian welcome wording**: "a projektekről" (about the projects) instead of "a projektjeimről" (about my projects), and the suggested questions say "the projects": the assistant is not the owner and must not speak as them, which the brief also requires.
- **Endpoint paths** of the administration are under `/api/admin/ai` to match the other administration modules.
- **No CAPTCHA** is used (nothing in the site has one); abuse is bounded by the limits and budgets instead.
- **Cost is an estimate**, never presented as a bill.

## What was not verified

- **No real Haiku call was made**: there was no API key to use. The model identifier `claude-haiku-5-5` was checked against the model table in the Claude API reference available to the build (Claude Haiku 5.5, Active, no dated alias, USD 0.10 / 0.50 per million tokens), **not** against Anthropic's live API: that check is the connection test, and it has not been run with a real key. The assistant's behaviour with the real model (how well it follows the instructions, calls tools, resists prompt injection in free text, answers in the right language, its real latency, token use and cost) is **unmeasured**. The protection against misuse is structural and tested without the model, but the model's own conduct needs a real run (`ai check`, then a manual session) before release.
- The numbers produced by tests and the journey come from the stand-in: tokens and cost there are **not** real usage.
- Physical devices, Safari and Firefox, a screen reader, and real-world network conditions were not tested; the browser checks ran in Chromium (system Chrome) with emulated phones.
- Hungarian and Dutch texts were written without a native proofreader.
- A real e-mail provider and the Cloudflare routing were not exercised for the quote notifications of the assistant (the file mailer was).
- Anthropic's data terms, privacy implications and any legal review are the owner's to complete.

## Voice: prepared, not built

Voice is excluded from this release; nothing records, plays or transcribes audio, and the site's `Permissions-Policy` still disables the microphone (`src/security/headers.ts`). What is ready for a later phase: the conversation API is text-in/stream-out and independent of the keyboard, the interface hands the model a plain string through one function (`controlRoom.send(text)`), answers arrive as a stream that a speech layer could read aloud, and the assistant's replies are already short, plain text without tables or emoji. A voice phase would add a speech-to-text input, optional read-aloud, new privacy wording, and a deliberate change of the permission policy.
