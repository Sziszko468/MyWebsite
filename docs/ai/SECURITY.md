# CONTROL ROOM AI: security

What stands between a visitor, the model and the rest of the system, and the test that shows it. Every row says **what the server enforces**; none depends on the model behaving. "Tested" always means an automated test against a scripted mock or the local stand-in: **no real provider was involved** (see [TEST_RESULTS.md](TEST_RESULTS.md)).

## The request path

```
browser ──(text only, X-AI-Session)──► POST /api/ai/chat ──► Assistant.chat (gateway.ts) ──► @ai-sdk/anthropic ──► api.anthropic.com
   ▲                                      origin check · session · rate limit        guards, reservation        server's key
   └────────────── validated UI-message stream (errors as codes) ◄──────────────────────────────────────────────┘
```

The browser never talks to Anthropic and never holds a key, a model name, a tool list, a system prompt or a history. The conversation the model sees is the server's own stored copy. Order inside the gateway: availability → draining? → language → the client address's rate limit → the message (empty, too long, card/secret) → the conversation (exists, yours, not expired, not full, not busy) → the session's own limit on answers at once → the **global** limit on answers at once → the **budget reservation** (one transaction) → only then the model. Streaming bypasses none of it: the guards run before the first byte, and whatever ends the stream reconciles the reservation exactly once.

## Controls and the tests that show them

| Risk | What the server does | Test |
|---|---|---|
| **Key exposure** | read once from `ANTHROPIC_API_KEY`; registered with the log redactor; in no response (public, admin, error, health), no log line, no database row; a malformed key is dropped and never echoed | `aiProduction` "the key never leaves the server" (3 tests), "treats a malformed key as no key"; `aiModelLock` (source scan: no `VITE_` key, no key in the bundle); `aiLimits`/`aiVerification` (provider error that quotes the key is redacted) |
| **Key in a client bundle** | the browser has no provider SDK and no key; the build scan finds none | `aiModelLock` "keeps the model identifier and the provider out of every browser bundle and every key out of the source"; built-site scan in [TEST_RESULTS.md](TEST_RESULTS.md) |
| **Missing / invalid key** | assistant unavailable, no request to anyone (missing); alert + sanitized code (rejected) | `aiProduction` "without a usable key"; `aiVerification` "fails safely on …" |
| **Browser chooses the model, tools, history, system prompt** | the body is read for `conversationId`, `trigger`, `language`, `text` only; everything else is ignored; the model is a code constant wrapped by `guardModel`; any other model, provider or a bare string is refused | `ai` "sends the model the server's instructions and the server's history, and nothing the browser adds"; `aiModelLock` (14 tests); `aiVerification` "cannot have its model chosen" |
| **No fallback model or provider** | the only retry is one more attempt against the same model; a source scan fails on any other model/provider/fallback construct | `aiModelLock`; `aiProvider` "never retries with another model" |
| **Unauthorized request / invalid session** | a missing, forged, expired or unknown `X-AI-Session` is refused (401); the token is an HMAC-signed random id | `ai` "needs an anonymous session, which is a signed token and nothing else" |
| **Another site makes a visitor's browser send a request** | the public API sets no cookie (`credentials: 'omit'`), so there is nothing to ride on; an unsafe request from an origin that is not the site's or an allowed one is refused (403 `origin_not_allowed`) | `aiProduction` "refuses a request from another site" |
| **CSRF on the administration** | admin routes need the session cookie **and** an `X-CSRF-Token` **and** the same origin; each admin AI endpoint is tested for all three | `aiProduction` "the administration's endpoints refuse a visitor, a request without the CSRF token and a request from another site" |
| **Cross-customer access** | a conversation belongs to the session that made it; any other session gets 404 (never 403); every store query names the session | `ai` "keeps a conversation to the session that started it"; `aiProduction` "private data stays out of reach of the model" |
| **Private data in the model's context** | the tools read only published tables (`services`, `packages`, `extras`, `site_content`, `projects`, `shop_documents`, the published profile); the only per-visitor data is the plan of **this** conversation | `aiProduction` source scan of `knowledge.ts`, `tools.ts`, `plan.ts`, `prompt.ts`, `toolGuard.ts`; `aiTools` (drafts, archived projects, internal notes are unreachable) |
| **Admin-only data to a visitor** | no tool reaches `settings` other than the published profile, `audit_log`, users, inquiries, quotes, bookings, customers or messages | same scan |
| **Prompt too long / history too long / too many tool rounds** | 422 for a long message; the model sees the last N messages starting with a visitor message; at most `maxToolCalls` rounds; at most 3× that many tool *calls* | `ai` "refuses a message that is empty, too long…", "replays only the last messages the settings allow"; `aiLimits`; `aiTools` "stops a runaway answer" |
| **Token limit** | `maxOutputTokens` is sent to the provider; an answer that reaches it is kept and marked, or (before any word) is a failure | `aiProvider` "reads what the provider says about the end of an answer"; `aiProduction` |
| **Concurrency** | one answer per conversation (409), two per session, and a **global** cap (503 "capacity", `Retry-After: 5`); not queued | `aiLimits` "lets one answer at a time…", `aiProduction` "the global limit on answers at once" |
| **Duplicate processing** | a second identical request while one is being written is refused (409 `busy`) rather than run twice; the budget reservation and the quote approval are each used once | `aiProduction` ("counts every other refusal too"), `aiTools` (a consumed approval cannot be used again) |
| **Rate limiting** | per network address (10 min), per session (24 h), session creation, plus the site's global limiter | `aiLimits` "limits" (3 tests) |
| **Budget exhaustion** | refused **before** the model is called, with a friendly message, an alert, and a counter; quote requests keep working | `aiLimits`, `aiVerification` "warns once…" |
| **Provider timeout / rate limit / overload / network / invalid reply / aborted stream** | each maps to one code; nothing the provider said is quoted; an aborted stream stops the paid generation and keeps what was used | `aiProvider`, `aiProduction` "what the provider returns", `aiLimits` "stops paying for an answer the visitor cancelled" |
| **Tool misuse** | each tool has an input schema (zod) that is checked before it runs; the set is closed (eight tools); a call to a tool that does not exist is ignored; the model is not an authorization layer | `aiTools`, `aiProduction` "has no tool that takes a model, an address, a query, a key or a file name" |
| **Tool results** | checked before the model sees them: plain JSON, ≤ 24 000 characters, no key that names a secret/credential/session/hash/internal note, nothing that looks like a credential. A failed check is a rejected call, not a result | `aiProduction` "what a tool hands back" |
| **A quote request without consent** | `submitApprovedQuoteRequest` takes **no arguments** and does nothing unless the visitor pressed "Send this request" for the **current** plan (version and content hash) within 10 minutes; the contact details never reach the model | `aiTools` (7 tests on the approval) |
| **Card numbers, API keys in a message** | refused (422, reason `sensitive_data`) before the message is stored or sent; counted, not logged | `aiProduction` "what must not be sent" |
| **Output as markup** | the website draws answers as React elements from a small safe subset (no HTML, no `javascript:`) | `RichText.test` |
| **Logging privacy** | one structured line per request: ids, codes, durations, token counts. Never a prompt, an answer, an address or a key; fields whose names look like secrets are masked by the logger | `aiProduction` "stores the request id… and never logs the question" |
| **Secret redaction** | the logger replaces the configured secrets and anything key-shaped in any message it writes | `logger` tests; `aiLimits`/`aiVerification` |
| **Administration** | read needs `system:read`, every change `system:write`; no endpoint changes the model, shows or edits the key, or turns a safety limit off; the prices are not editable; ceilings cannot be exceeded; every change is audited | `aiVerification` "only an administrator may…", `aiProduction` "the operator's ceilings", "the configuration is audited" |
| **Private conversations via analytics** | the administration shows counts, codes and durations; no text, title, conversation id, session id or visitor | `aiProduction` "show operations and never a conversation" |

## The model lock

CONTROL ROOM AI runs exclusively on Claude Haiku 5.5 (`claude-haiku-5-5`). If it cannot be reached or verified the assistant is unavailable. See [README.md](README.md#the-model-lock) and [PRODUCTION_ACTIVATION.md](PRODUCTION_ACTIVATION.md#the-model-exactly). `aiModelLock.test.ts` fails if the server's source names any other model, imports any other provider package, creates the provider anywhere but `model.ts`, or adds a fallback construct.

## Known limits (honest list)

- **Prompt injection in free text is bounded structurally, not proven.** The protection is that there is nothing sensitive for an injected instruction to reach: read-only tools over published content, a plan of the visitor's own, and a submission that needs a click the model cannot make. How the *real* model resists manipulation in a long conversation is **unmeasured** (no real call was made).
- **The sensitive-data guard is narrow on purpose**: Luhn-valid card numbers and credential-shaped strings. It does not detect names, addresses, phone numbers or health details a visitor types; the privacy notice and the interface tell visitors not to.
- **The global concurrency count and the per-address limiter live in one process's memory.** With one backend instance (as deployed) that is exact; with several instances each has its own count (the budget, which is in the database, is shared and exact).
- **Anonymous sessions are not accounts.** Anyone who can open the site can start a session; the controls above (rate limits, budgets, ceilings) bound what that costs.
- **The administration trusts its administrators** with the settings inside the ceilings. A compromised administrator account can lower limits or switch the assistant off, and can read counts, never conversations.
