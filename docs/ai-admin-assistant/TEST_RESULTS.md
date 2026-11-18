# Test results

What was run for PROMPT 31, what it showed, and — as important — what could **not** be run. Everything below was executed on 2026-11-18 on branch `feature/ai-admin-assistant` (working tree, before the commit), on Windows, with Node's built-in SQLite. **No request was ever made to the real Anthropic API, and no real e-mail was sent**: the model is a scripted mock in Vitest and a local stand-in that speaks Anthropic's API in the browser runs; e-mail is written to files (and the journey proves a draft writes none).

## Summary

| Check | Result |
| --- | --- |
| `npx tsc -b` | clean |
| `npx oxlint` | clean (no warnings, no errors) |
| **Complete test suite** (`npx vitest run`, run alone) | **159 files, 3317 tests, all passed** (94.9 s). Before this work: 156 files, 3199 tests. New: 3 files, **118** tests |
| `npm run i18n:check` · `npm run i18n:validate` | OK · OK (4,225 texts × 3 languages, 0 errors, 0 warnings; unaffected by the assistant's own dictionary, which they do not scan; the added privacy item is included and passed) |
| Production build (`VITE_API_URL=/ VITE_SITE_URL=https://example.test npm run build`) | OK (103 pages prerendered) |
| `npm run check:seo` | OK (104 files, 82 indexable, 22 noindex; sitemap, hreflang, canonicals, structured data, headers) |
| `npm audit` | 0 vulnerabilities (production and development); `package.json` and `package-lock.json` untouched |
| Build scanned for secrets | no key, no key-shaped text; the only matches of the words `ANTHROPIC_API_KEY` are the *names of the environment variable* in the administration's existing error texts |
| **Mutation checks** of the assistant's rules | 24 rules broken one at a time, **all caught** (one further attempt was an *equivalent* mutation — see below) |
| **Browser journey** `admin-assistant-journey.cjs` (real Chrome, built administration, real backend, local stand-in) | **30/30 steps** |
| **Layout and accessibility audit** `audit-assistant.cjs` | **360 views, 0 findings** (3 languages × 2 themes × 1440, 1024, 768, 390, 320 px × 12 states, each with layout checks, reduced-motion check and axe-core WCAG 2.0/2.1/2.2 A/AA + best practice) |
| Existing visitor-AI regression in the browser | `discovery-journey` **38/38**, `ai-journey` **47/47** |
| Existing administration audit on the AI screens (now including the two new screens) | **240 views, 0 findings** (hu/en × dark/light × 5 sizes) |

## The new tests

### `server/test/aiAdminTools.test.ts` (39) — the tools, called as the model would, for a real administrator's session

- **The set**: exactly 31 names, named for reading/drafting/reporting; no field named for SQL, a path, a URL, an administrator, a model, a prompt, a recipient; an unknown key is refused by every tool.
- **Read-only**: every tool in every context leaves a digest of **every business table** unchanged, and every answer really answers (no refusal hiding behind "nothing written"); the source of the module contains no write statement, no `.run`, no file/network/process/eval.
- **Permissions**: without `clients:read`, without `requests:read`, without `assistant:use`; a permission removed between two calls of one answer; a role changed between two calls; sign-out, an expired session and a disabled account; reading never extends a session; a real and an invented reference answer identically.
- **Context**: a customer context reaches only that customer's projects, quote requests, conversations and consultations; a project, quote, conversation and consultation context only theirs; the business tools are out of context there; a gone context and a forbidden one answer identically; another administrator's conversation (and a missing one) answer identically.
- **Minimum data**: no e-mail address, phone, token, hash or private note in any answer of any tool (all test accounts' addresses are searched for); customer words only in `…Untrusted` fields; conversation search does not read message text; stored quotation figures are returned exactly.
- **Injection**: eleven hostile search words to five search tools; twenty malformed references/ids/statuses/dates/limits refused before any lookup; the tool-call limit.
- **Lists**: paging, totals, `hasMore`, a page beyond the end, caps, long texts cut.
- **Projects, business, consultations**: status/progress/overdue/risks against the database, "no rule fired" is not "no risk", counts against independent queries for a stated period, alerts with thresholds, the daily briefing, scheduling conflicts (named in the general context, counted in a record context), an expired proposal reported and **not closed**.
- **Drafts and outlines**: language mismatch turned back; amounts, discounts, card numbers and keys refused; nothing sent, nothing stored, no quotation created; an extra field (price, date) refused.
- **Reports**: facts from the server, the model's words labelled, money refused, counts limited, an extra `confirmedFacts` field refused, the audit entry holds no content, business reports out of a record context.

### `server/test/aiAdminApi.test.ts` (31) — over HTTP and through the gateway, with a scripted model

Availability (off by default; not switchable before verification; an editor cannot switch it; independent of the visitors' switch); who may call (every route 401 for a visitor, customer, stranger; CSRF and same-origin; after sign-out; a role without `assistant:use` refused before anything exists); an answer (the stream, the stored conversation, the ledger as `audience = 'admin'`, **what is sent to the provider**: model, instructions, 31 tools, no key, no address, no history of anyone else); the body decides nothing (a model, tools, system prompt, administrator, forged history are ignored); language and context handling (fixed per conversation, unavailable context 404 with nothing created); 16 invalid inputs; regenerate from the stored conversation; history (own conversations only, search with wildcards neutralised, foreign ids 404 for reading, deleting **and writing**); deletion removes the words and keeps the numbers; **no word of a question or of a customer in the ledger, the audit log or the server log**; the per-hour limit, the per-minute route limit, busy conversation, client cancel, provider failure and timeout (no provider text anywhere), a provider answering as another model (switches itself off), the tool-step limit, the shared daily budget; the usage numbers (and their absence from the visitors' statistics); retention, account deletion, erasure of what was opened about a person; the visitors' assistant untouched.

### `src/admin/assistant/assistant.test.ts` (48)

Three languages with the same keys/placeholders and nothing untranslated; names for all 31 tools, 7 reports, every limitation and missing-information code and every refusal reason **read from the server's source**; what the screen reads from messages (links only to the administration's own record pages, tool states, the three result shapes); error codes; the markup of an answer (references link only if a tool returned them; no HTML, no foreign link; lists, headings, tables); a report (facts versus the assistant's words, in three languages), a draft ("Nothing has been sent"), an outline ("requires human review"); the thread's states; the history; the context pane and which kinds a role is offered; and the **source**: no sentence of its own, no `fetch`, no HTML injection, no storage but the language, no raw colour, a focus ring, reduced motion, the column layout.

### Changed existing tests

`src/content/privacy.test.ts`: the guarantee "no AI file mentions bookings" now covers the **visitors'** assistant (everything under `ai/` except `adminassistant/`) and additionally requires that the visitors' tools cannot import the administrators' module. `src/admin/lib/ai.test.ts`: the settings fixture has the five new fields.

## Mutation checks

`mutate-assistant.py` (a scratch tool): break one rule in the source, run the assistant's tests, require a failure, restore the file byte for byte. Caught: a session past its deadline still working; the permission not checked against the current role; `assistant:use` not needed; a record outside the context reachable; a context the administrator may not read opening; the business totals available in a record context; private notes read with the messages; another customer's bookings named in a record context (**this one first survived** — the list had no test for it; a test was added and it is now caught); an amount allowed in a draft/outline; in a report; a draft in the wrong language; another administrator's conversation found by a tool; a foreign conversation id reaching the insert; administrator requests booked as visitors'; the public statistics including them; the numbers readable by anybody who may use the assistant; the switch working without a verified model; the hourly limit not applied; retention not removing conversations; erasure leaving the conversations opened about a person; an unsafe link accepted by the screen; an unsafe report subject address linked; a draft not saying it was not sent; a report not labelling the model's words. *Equivalent (discarded):* "an answer may make a link of its own" — the screen only recognises tokens that are keys of the map a tool produced, so no such token can reach the point that was mutated.

## What the browser journey and audit found and fixed

In the first runs: the conversation list ignored the real statuses (`waiting_owner`), the shared guard refused `customerId`, a reselect of the same kind emptied the context list, "Clear conversation" skipped the delete when the list had not caught up with a finished answer (a real bug: the question stayed stored), the "New conversation" button put its icon above its label, and the report's fact tree wasted its width. The audit then found a scrolling box without a keyboard stop (the report's data) and a duplicated landmark name (the AI screen's usage block). All are fixed; the final runs above are on the final code.

## What was **not** run, and what these results do not show

- **The real model.** Nothing shows how Claude Haiku 5.5 behaves with these instructions and tools: whether its summaries are good, whether it keeps to Dutch or Hungarian, whether it resists an injected instruction. The stand-in plays the model from markers in the message.
- **Production.** Nothing was deployed or run on Render or Cloudflare; the production CSP, proxy and host logging were not exercised; no real provider key, billing or rate limit; a real database's size and real customers' text.
- **Real e-mail**, DNS and the outstanding items of earlier prompts.
- **Devices and engines.** Chrome only (desktop and emulated phone widths). No Safari, no Firefox, no physical phone, no screen reader. Printing was checked with print-media emulation, not on paper.
- **Native-language review.** Hungarian and Dutch texts were not proofread by a native speaker; the Hungarian spell check is inconclusive (see [LOCALIZATION.md](LOCALIZATION.md)).
- **Load and concurrency** beyond what the unit tests show.
- **Other regression journeys** (booking, portal, quotes, communication, feedback, work) were not re-run in a browser; their **server and administration unit tests are part of the 3,317 that passed**.
