# CONTROL ROOM AI: test results (PROMPT 29)

What was actually run on **2026-11-17** (Windows 11, Node v22.23.1, vitest 5.0.5, TypeScript ~6.0.3, `ai` 7.0.166, `@ai-sdk/anthropic` 4.0.99), with the real outcome. Nothing here is a claim about the real provider: **no request was made to Anthropic and no money was spent.** Every provider in these tests is a scripted mock (`MockLanguageModelV4`) or the local stand-in for Anthropic's Messages API (`tools/e2e/anthropic-standin.ts`) that the real `@ai-sdk/anthropic` package talks to over HTTP.

## Summary

| Check | Command | Result |
|---|---|---|
| TypeScript (both projects) | `npx tsc -b` | **pass** (exit 0) |
| Lint | `npx oxlint` | **pass** (exit 0) |
| Full test suite | `npx vitest run` | **152 files, 3075 tests, all passed** |
| Language checks | `npm run i18n:check` · `npm run i18n:validate` | **OK**: 3817 texts × 3 languages, 0 errors, 0 warnings; spelling (Hunspell) HU 5268 words, EN 2400, NL 3075: 0 not found |
| Production build | `MSYS_NO_PATHCONV=1 VITE_API_URL=/ VITE_SITE_URL=https://example.test npm run build` | **OK** (tsc, i18n check, vite build, 103 pages prerendered) |
| SEO | `npm run check:seo` | **ok**: 104 files, 82 indexable, 22 noindex; sitemap, hreflang, canonicals, structured data, headers |
| Dependency audit | `npm audit` / `npm audit --omit=dev` | **7 high, all in development tooling** (`vite`, `vitest`, `@vitejs/plugin-react`, `picomatch`, `tinyglobby`, `fdir`, `@parcel/watcher`); **0 in production dependencies**. Not upgraded (unrelated to this task; the brief forbids unrelated upgrades) |
| Browser journey (real Chrome, built site, real backend, stand-in provider) | `node tools/e2e/ai-journey.cjs …` | **45/45 steps** (section I is new); run a second time against the final server code, again **45/45** |
| Visitor audit: layout + axe (WCAG 2.2 AA + best practice) | `node tools/audit/audit-ai.cjs --sizes=320x640,390x844,768x1024,1440x900 --langs=en,hu,nl --themes=dark,light` | **282 states, no findings** |
| Administration audit: layout + axe | `node tools/audit/audit-admin.cjs --only=/admin/ai --sizes=1440x900,1024x768,768x1024,390x844,320x640 --themes=dark,light --langs=hu,en` | **240 views, 0 findings** (model, overview, **operations**, settings, knowledge) |
| Secrets in the built site | scan of `dist/` | `claude-haiku`, `sk-ant`, `test-key-not-real`, `api.anthropic.com`, `AI_CEILING`: **0 files**. `ANTHROPIC_API_KEY`: 1 file, the administration bundle, which only *names* the variable in its help text (no value) |
| Live provider | `ai check --live` | **NOT RUN** (no key; opt-in; see below) |

### Honest record of the failures along the way

- First full run: **3069 passed, 2 failed.** (1) my new `aiProvider` test of four provider failures needed its retries' time (5 s default): given a 40 s limit. (2) an older migration test (`communicationsSecurity`: "upgrade from migration 0014") asserted that migration 15 was the *last* one; it now filters on version 15 itself. Both fixed; the final run is clean.
- First journey run: **40/45.** Three steps failed on wording that had been stale since an earlier change ("e-mail" → "email" in the plan panel); one failure was a **real bug found by the new section**: pressing **Stop** could submit the empty box ("Write a message first." flashed) because *Stop* and *Send* were one DOM element whose type changed. Fixed in `ChatSurface.tsx` (separate keyed buttons + `preventDefault`); one failure was a mistake in the new step (it clicked a disabled "Discard changes").
- First audit run: every combination failed after the provider-failure state because the stand-in answers every message of a conversation that still contains a `FAIL:` marker with that failure (the provider merges consecutive user messages). The new states were moved before it. Not an application defect.
- While testing the log line I found that **every request id in the logs was masked as `[token]`** (a UUID is 36 characters and looked like a token to the redactor), which made correlation impossible. Fixed in `lib/logger.ts` for the id fields only (secrets in them are still masked); `aiProduction` tests it with a real generated id.

## The AI test files (all passing)

| File | Tests | What it covers |
|---|---|---|
| `server/test/ai.test.ts` | 13 | availability switches, anonymous sessions, streaming protocol, stored conversation, **nothing the browser adds reaches the model**, ownership (another session gets 404), input validation, history window, retention and deletion |
| `server/test/aiLimits.test.ts` | 20 | per-session/address/session-creation limits, daily request/token/conversation limits, budgets, **reservation + reconciliation, concurrency**, abandoned sweep, provider errors, **provider timeout**, **cancelled stream**, tool-loop bound, administration permissions and settings |
| `server/test/aiProvider.test.ts` | 7 | the **real `@ai-sdk/anthropic` over HTTP** to the stand-in: wire format (model, key, limits, closed tool set, thinking), tool round, error codes, language; **new:** output-limit / empty / unparsable replies, **connection timeout**, 401/402/429/529 mapping and no second model |
| `server/test/aiModelLock.test.ts` | 13 | one model in the whole server, no other provider/fallback construct (source scans), identity check on every reply, refusal of look-alike identifiers |
| `server/test/aiTools.test.ts` | 24 | the eight tools, each tool's data and refusals, plan building, **quote approval requirement** and its failure modes |
| `server/test/aiVerification.test.ts` | 25 | connection test, activation needs proof, every provider failure, alerts, key redaction, budget thresholds |
| `server/test/aiProduction.test.ts` | **38 (new)** | missing / malformed key; key in no response, no database row, no log; public config and health leak nothing; **ceilings**; prices not editable; long-prompt rate; **settings audit**; admin endpoints (401 / CSRF / origin); analytics show no conversation; **global concurrency** (including six requests at once); refusal counters; request id in the usage row and the log; output limit / empty / invalid replies; error classification; connection timeout; **shutdown**; card/secret refusal; tool-output check; private-data source scan; **cost states reported / none / unknown**; the upgrade to migration 0016; another site's origin |
| `src/ai/client.test.ts` | 11 | the browser's error mapping, **words in HU/EN/NL for every state** |
| `src/content/ai/ai.test.ts`, `src/admin/lib/ai.test.ts`, `src/content/privacy.test.ts` | 12 · 8 · 26 | interface texts, the administration's form and charts (**no price field**), the privacy notice |

## Required test topics → where they are

| Topic | Test |
|---|---|
| API key missing · never exposed | `aiProduction` "without a usable key", "the key never leaves the server" |
| Client cannot select a model · no provider fallback | `aiModelLock`, `aiVerification` "cannot have its model chosen", `aiProvider` "never retries with another model" |
| Unauthorized request · invalid session · CSRF · another site | `ai` (session), `aiProduction` (administration endpoints, "another site") |
| Cross-customer access · private data isolation | `ai` (ownership), `aiProduction` "private data stays out of reach of the model" |
| Prompt size · history · token limits | `ai`, `aiLimits`, `aiProvider`/`aiProduction` (output limit) |
| Concurrent request limit · rate limiting · budget exhaustion | `aiLimits`, `aiProduction` "the global limit on answers at once", `aiVerification` |
| Provider timeout · rate limit · invalid reply · aborted stream | `aiLimits`, `aiProvider`, `aiProduction` |
| Tool authorization · quote approval requirement | `aiTools`, `aiProduction` "what a tool hands back" |
| Secret redaction · logging privacy · usage accounting | `aiProduction` (logs, cost states), `aiLimits`, `aiVerification` |
| Admin permission checks | `aiVerification`, `aiProduction` |

## Responsive, themes, motion, accessibility

- **Viewports** audited for the visitor: 320×640, 390×844, 768×1024, 1440×900; for the administration also 1024×768. Layout checks (sideways scrolling, elements off screen, text and touch targets too small, header/footer) and axe on every state: the empty page, with a plan, with the send form's problems, **an answer cut off at the output limit, a stopped answer, a message refused for a card number**, after a provider failure, the floating button, the open panel, its plan tab, after a failure.
- **Dark and light**: both, at every size, in Hungarian, English and Dutch.
- **Reduced motion**: every browser context in the journey and the audits is created with `prefers-reduced-motion: reduce`; the typing dots' animation is switched off by the stylesheet in that mode.
- **Keyboard / screen reader**: the journey includes the focus trap in the phone panel and Escape/focus return; status notes use `role="status"`, errors `role="alert"`. **No screen reader was used.**

## Not run, and why

| Not run | Why |
|---|---|
| any request to the real Anthropic API (`ai check --live`, a real conversation) | no key; opt-in; the owner's explicit step ([LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md)) |
| Safari, Firefox, real phones | only Chromium (system Chrome) with emulated phones was available |
| a screen reader | not available |
| real e-mail, Render, Cloudflare, DNS | no provider or host access |
| native-speaker review of the Hungarian and Dutch texts | not available; the spell-check passes, which proves spelling and structure only |
| the administration in Dutch | the administration app has two languages (English, Hungarian) by design; the visitor-facing assistant has three |
