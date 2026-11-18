# AI admin assistant

PROMPT 31. A **read-only copilot inside the administration** (`/admin/ai-assistant`). It reads the records the signed-in administrator is allowed to read, summarises them, compares them, finds what is missing or late, prepares reports, briefings, quotation *outlines* and customer-message *drafts*, and recommends next steps. It **cannot** change, create, send, accept, reject, cancel, reschedule or delete anything: it has no tool for any of that, and nothing a customer writes can give it one.

It uses **the same Claude Haiku 5.5, the same verified connection and the same key** as the visitors' CONTROL ROOM AI (no model selector, no fallback, no second provider, no second key, no browser-side call). It is **off until the owner switches it on** in the AI screen, and it can only be switched on while the required model is verified.

> Status: implemented on branch `feature/ai-admin-assistant`, tested with a **mocked provider** (Vitest) and with the **local Anthropic stand-in** over real HTTP in a real Chrome. **No request to the real Anthropic API has ever been made for this work**, and it has not been run in production. See [TEST_RESULTS.md](TEST_RESULTS.md) for what was and was not verified and [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) for what the owner has to do before using it.

## Documents

| Document | What it answers |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | What exists, the design, the eight boundaries, and what changed against the plan |
| [CAPABILITIES.md](CAPABILITIES.md) | What it can do (A–G), what it will never do, what is deliberately not included |
| [TOOL_SECURITY.md](TOOL_SECURITY.md) | The thirty-one tools, how each call is checked, injection and validation |
| [PERMISSIONS.md](PERMISSIONS.md) | Roles, the permission of every tool, what the permission system cannot express |
| [CONTEXT_MANAGEMENT.md](CONTEXT_MANAGEMENT.md) | The six contexts, what each reaches, re-validation, isolation between customers |
| [REPORTING.md](REPORTING.md) | The seven reports, facts versus AI words, export and print |
| [PRIVACY.md](PRIVACY.md) | What is sent to the provider, what is stored, retention, deletion, erasure |
| [COST_CONTROL.md](COST_CONTROL.md) | One ledger, limits, usage numbers |
| [LOCALIZATION.md](LOCALIZATION.md) | Hungarian, English, Dutch: where the words are and how they are checked |
| [TEST_RESULTS.md](TEST_RESULTS.md) | Commands run, results, what could not be run |
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | Safe activation, owner actions, known limitations |

## Where the code is

| Part | Path |
| --- | --- |
| Migration (additive) | `server/src/db/migrations/0018_ai_admin_assistant.sql` |
| Tools, readers, scope, access, reports, prompt, routes, usage, store | `server/src/modules/ai/adminassistant/` |
| Entry point (reservation, model lock, streaming) | `Assistant.adminChat()` in `server/src/modules/ai/gateway.ts` |
| Settings, budget, analytics, retention, erasure hooks | `ai/settings.ts`, `ai/budget.ts`, `ai/admin.ts`, `ai/store.ts`, `system/maintenance.ts` |
| Permission `assistant:use` | `server/src/modules/auth/permissions.ts` |
| Screen | `src/admin/pages/AiAssistantPage.tsx`, `src/admin/assistant/`, `src/admin/styles/assistant.module.scss` |
| Words (Hungarian, English, Dutch) | `src/admin/i18n/assistant.ts` |
| AI-screen tab (switch, limits, numbers) | `src/admin/assistant/Settings.tsx`, wired in `src/admin/pages/AiPage.tsx` |
| Tests | `server/test/aiAdminTools.test.ts`, `server/test/aiAdminApi.test.ts` (kit: `aiAdminKit.ts`), `src/admin/assistant/assistant.test.ts` |
| Browser journey and audit | `tools/e2e/admin-assistant-journey.cjs`, `tools/audit/audit-assistant.cjs` |

## The API

All under `/api/admin/ai-assistant/`, with the administrator's cookie session, a CSRF token and a same-origin request on everything that changes something. No CORS headers: a visitor's token can never reach it.

| Route | Needs | What |
| --- | --- | --- |
| `GET config` | `assistant:use` | availability and reason, languages, limits shown to the screen, what this role may ask about, the model's name |
| `GET conversations?q=` | `assistant:use` | the administrator's own conversations (newest first, at most 50), found by title or by the words they asked |
| `GET conversations/:id` · `DELETE conversations/:id` | `assistant:use` | read / delete one of **their own** (another administrator's, a visitor's and a guessed id are all "not found") |
| `GET contexts?type=&q=` | `assistant:use` + the data permission | records an administrator can pick as a context (found through the same permission checks as the tools) |
| `POST chat` | `assistant:use` | one question (or "again") in a conversation; streamed answer |
| `GET usage?range=` | `system:read` | numbers only (no words): requests, tokens, estimated cost, time, tools, failures, conversations, reports |

Settings are changed where they always were (`PUT /api/admin/ai/settings`, `system:write`): `adminAssistantEnabled`, `adminMaxRequestsPerHour`, `adminMaxToolCalls`, `adminMaxOutputTokens`, `adminMaxInputChars`.

## Changes against the plan (ARCHITECTURE.md)

Written after the work, from what actually happened:

1. **Conversation status words.** The customer conversations use `waiting_owner` / `waiting_customer` besides `open`. The first version of the readers treated only `open` as live and so reported *no* waiting messages. Found by the tests and fixed: *live* is now `open`, `waiting_owner` or `waiting_customer`.
2. **A key name the shared guard refuses.** The shared tool-output guard (built for visitors) refuses any result containing the key `customerId`. The admin readers return the customer's id as `id`, and the tools still accept `customerId` as *input*.
3. **A conversation id that belongs to another administrator** is answered "not found" before anything is written (it would otherwise collide with the other administrator's row). A visitor conversation with the same id is simply a different table: the administrator gets a new, empty conversation.
4. **The privacy notice was changed.** The processing really changed (the owner can send excerpts of customer records to the AI provider), so one item was added to the public notice in three languages (no retention period, legal basis or guarantee is stated: those are the owner's to decide). An older test that said "no AI file mentions bookings" was narrowed to the *visitors'* assistant, and now also checks that the visitors' tools cannot import the administrators' module.
5. **Dutch.** The administration has two languages; the assistant screen has three (a screen-only dictionary, held against itself by tests). The report *data* (the field names inside "Show the data") is shown in its stored English names.
6. **Not built, on purpose:** no `PUT`/`POST` action tool and no confirmation dialog for one (nothing can be executed, so there is nothing to confirm); no scheduled briefing e-mail and no background AI job (the daily briefing is produced only when asked).
