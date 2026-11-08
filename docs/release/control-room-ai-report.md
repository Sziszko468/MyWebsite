# CONTROL ROOM AI — final implementation report (PROMPT 16)

Written from what was run, not from what was intended. Full manual: [`../ai/README.md`](../ai/README.md). Nothing was committed or deployed.

## 1. The model and the packages

| | |
|---|---|
| Model | **`claude-haiku-5-5`** (exact identifier, from `ANTHROPIC_MODEL`; no fallback model; adaptive thinking, low effort, no temperature) |
| `ai` (Vercel AI SDK) | 7.0.164 |
| `@ai-sdk/anthropic` | 4.0.98 (server only) |
| `@ai-sdk/react` | 4.0.168 (website, lazy chunk) |
| `zod` | 4.6.7 (tool schemas) |

The backend's "no runtime dependencies" rule has one deliberate exception: these packages, loaded on demand by the assistant only.

## 2. Architecture in one paragraph

The browser sends a conversation id and the visitor's new text to `POST /api/ai/chat`. The backend checks the anonymous HMAC-signed session and the conversation's owner, applies the limits, **reserves the worst-case cost** in one `BEGIN IMMEDIATE` transaction, loads the history from its own stored copy, and streams `claude-haiku-5-5` through the AI SDK with eight closed tools. The tools read only published data, write only the current conversation's plan, and can create a quote request only for a plan the visitor approved with a button. The stream's UI-message protocol goes back to the browser (a floating `<dialog>` and the `/control-room` page share one conversation); when it ends, the reservation is reconciled with the provider's usage and the conversation is stored. The administration at `/admin/ai` shows usage, estimated cost, settings and knowledge. Details and a diagram: manual §Architecture.

## 3. Database changes

Migration `0006_control_room_ai.sql`: `ai_sessions`, `ai_conversations`, `ai_messages`, `ai_requests`, `ai_tool_calls`, `ai_approvals`, and `quote_requests.source` (`website | ai_assistant`). The words of a conversation are deleted on the visitor's request and after `AI_RETENTION_DAYS` (7); counts, language, a coarse topic and token numbers remain and contain nothing a visitor wrote.

## 4. Tools (all eight, closed set)

`getDeveloperProfile`, `searchPortfolioProjects`, `getProjectDetails`, `getPublishedServices`, `comparePackages`, `getFullExperienceDetails`, `createProjectPlan`, `submitApprovedQuoteRequest` (no arguments; needs the visitor's approval of the current plan).

## 5. Security restrictions in force

Key only in the backend environment, redacted in logs, never in a response or the public bundle · the browser cannot choose model, tools, history, system text or budget (tested against what the model receives) · conversations belong to their session (404 otherwise) · the tools reach published data only, so there is nothing for a prompt injection to reach · the quote needs the visitor's approval bound to the plan's content hash (10 minutes, one use), and contact details never reach the model (checked in the browser journey against what the provider received) · one answer at a time per conversation · answers are drawn as React elements from a safe subset (no HTML, `javascript:` or images) · provider errors become a code and a sentence of ours, never the provider's text · the site's Content-Security-Policy is unchanged for the page (the build adds the API origin to `connect-src` when it is another host).

## 6. Budget behaviour

Worst case reserved before the call; refused up front (friendly message to the visitor, reason in the administration) when it could pass the daily or monthly USD budget, the daily tokens, requests or new conversations, or a per-session or per-address limit. Reconciled with the provider's usage, else an estimate; a cancelled or crashed request still counts; a request that failed before any usage counts nothing (a bug found by the audits: it used to count its reserved tokens, so a provider outage could have used up the day's token budget). **Costs shown are estimates from token counts × the prices in the environment, not a bill.**

## 7. What was run, with results

| Check | Result |
|---|---|
| `npx vitest run` (website + backend) | 91 files, **1968 tests passed**, none skipped or failing |
| `npx tsc -b` and `npx tsc -p tsconfig.server.json` | no errors |
| `npx oxlint` | no findings |
| `npm run check:seo` | ok (86 files; all `noindex` because `VITE_SITE_URL` is not set, as intended) |
| Browser journey `tools/e2e/ai-journey.cjs` (real Chrome, built site, real backend, stand-in provider) | **31 of 31 steps** |
| `tools/audit/audit-ai.cjs`, English, nine viewports (320×640 … 1920×1080), dark and light, with axe | 154 states, **no findings** |
| `tools/audit/audit-ai.cjs`, Hungarian and Dutch, four viewports (320, 390, 768, 1440), dark and light, with axe | 132 states, no findings (one context timed out loading the home page under load; repeated alone: no findings) |
| `tools/audit/audit-admin.cjs` (now including `/admin/ai` and its tabs), nine viewports × themes × Hungarian/English | the first full run (1188 views) found two real defects on the new AI screen (an amount such as "US$0.00666" pushed a card out of the page at desktop widths; the Knowledge table did not fit a phone) and a console `InvalidStateError` that came with the overflow. After the fixes: the AI screen and its tabs at all nine sizes × both themes × Hungarian/English, **540 views, no findings**; and, because the fix touched a style the dashboard shares, the whole administration at 1440, 390 and 320 wide in English and Hungarian (dark), **192 views, no findings** (the full nine-size matrix was not repeated for the other screens after that style change) |
| `tools/audit/audit-i18n.cjs` (now including `/control-room`) | 28 pages × 3 languages (the Control Room page included, in its "not available" state because that audit has no backend), no finding; the available state in Hungarian and Dutch is covered by the browser journey and by `audit-ai.cjs` |
| `tools/audit/audit-structure.cjs` | nothing new: the assistant's files are reachable, no colour outside the tokens, every `AI_*` and `ANTHROPIC_*` variable the code reads is in `.env.example` (the two older findings, `ADMIN_PASSWORD` and `CATALOG_API_URL`, were already there) |

Defects found by these runs and fixed: the second answer of any conversation was not saved (the assistant message's id was empty); the submit tool took a plan version the model could get wrong; failed provider requests counted tokens; a `<header>` inside the panel counted as a second page banner; a link inside a form label was a second control in one target; the build did not put the API origin into `connect-src`.

## 8. Measured usage and cost

**None is real.** No API key was available and none was looked for, so no request reached Anthropic. The token and cost figures produced during the tests and audits come from a local stand-in whose usage numbers are made up (about 120 input and 12 output tokens per answer); they say nothing about Haiku's real consumption. The first real numbers will be in the administration after the first real sessions; compare them with the provider's own usage page.

## 9. Outstanding configuration (for the owner)

1. `ANTHROPIC_API_KEY` in the backend environment (never in a `VITE_` variable); then `npm run server:cli -- ai status` and one `ai check "…"` to prove key, model id and address.
2. Check the prices in the environment (defaults: USD 0.10 / 0.50 per million tokens, as of 2026-10-06 — assumptions, not verified against the provider's list) and the budgets (defaults: USD 1 a day, 10 a month).
3. Read the privacy section (`/privacy`, "Control Room AI") and adapt it: processor, data location, contact for data requests; Anthropic's own data terms apply and no legal compliance is claimed.
4. A real manual session with the real model before release: its behaviour (instructions, tools, language, injection resistance in free text, latency, real cost) is unmeasured.
5. A native speaker should read the Hungarian and Dutch interface texts.
6. Decide about committing (the work is uncommitted together with Shop 3.0) and about deploying (nothing was deployed).

## 10. Not verified

The real model's behaviour (see above) · physical phones, Safari, Firefox, a screen reader, real network conditions · a real e-mail provider for the assistant's quote notifications (the file mailer was used) · legal review of the privacy text.

## 11. Voice

Excluded from this release, as the brief says. Nothing records, plays or transcribes audio; `Permissions-Policy` still disables the microphone. Prepared for later: a text-in/stream-out API independent of the keyboard, one function through which the interface hands the model a string, short plain-text answers. See manual §Voice.
