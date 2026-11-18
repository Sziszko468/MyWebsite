# Test results

Run on 2026-11-18 on the final code of the branch `feature/ai-project-discovery` (Windows, Node with the built-in SQLite, system Chrome through Playwright). Every number below was produced by the command beside it in this work; where something could **not** be checked, the last section says so.

## Summary

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc -b` | **pass** (exit 0) |
| Lint | `npx oxlint` | **pass** (exit 0, no warning) |
| Full test suite | `npx vitest run` | **156 files, 3199 tests, all passed** (the base branch had 152 files and 3075 tests: **124 new tests**, no existing test removed or weakened except the three named below) |
| Language checks | `npm run i18n:check` · `npm run i18n:validate` | **OK**: 4224 texts × 3 languages, 0 errors, 0 warnings; Hunspell spelling HU 5480 words, EN 2499, NL 3208: 0 not found |
| Production build | `MSYS_NO_PATHCONV=1 VITE_API_URL=/ VITE_SITE_URL=https://example.test npm run build` | **OK** (tsc, i18n check, vite build, 103 pages prerendered) |
| SEO | `npm run check:seo` | **ok**: 104 files, 82 indexable, 22 noindex; sitemap, hreflang, canonicals, structured data, headers (identical to the base branch) |
| Dependency audit | `npm audit` · `npm audit --omit=dev` | **7 high, all in development tooling** (`vite`, `vitest`, `@vitejs/plugin-react`, `picomatch`, `tinyglobby`, `fdir`, `@parcel/watcher`), the same seven as on the base branch; **0 in production dependencies**. No dependency was added, changed or upgraded |
| Secrets in the built site | scan of `dist/` | `claude-haiku`, `sk-ant`, `test-key-not-real`, `api.anthropic.com`, `AI_CEILING`, `AI_DISCOVERY_ENABLED`: **0 files**. `ANTHROPIC_API_KEY`: 1 file, the administration bundle, which only *names* the variable in its help text (as before) |
| Rule mutations | scratch script (see below) | **10 of 10 mutants killed**, the sources restored byte for byte, 66 tests passing afterwards |
| Discovery journey (real Chrome, built site, real backend, stand-in provider) | `node tools/e2e/discovery-journey.cjs …` | **38/38 steps** on each of the last three runs (the earlier runs found mistakes in the journey itself and the two defects named below) |
| Older AI journey | `node tools/e2e/ai-journey.cjs …` | **47/47 steps** (run alone twice: 47/47 both times). In one run inside the long sequence **one step, "a stopped answer is shown calmly", failed** (a timing race on the Stop button, already known from the previous prompt, unrelated to the discovery); the same step passed in the two isolated runs |
| Discovery audit: layout + axe (WCAG 2.2 AA + best practice) | `node tools/audit/audit-discovery.cjs --sizes=320x640,390x844,768x1024,1024x768,1440x900 --langs=en,hu,nl --themes=dark,light` | **390 states, no findings** |
| Older plan form audit | `node tools/audit/audit-ai.cjs --sizes=320x640,390x844,768x1024,1440x900 --langs=en,hu,nl --themes=dark,light` (backend with `AI_DISCOVERY_ENABLED=false`) | **282 states, no findings** |
| Administration audit: layout + axe | `node tools/audit/audit-admin.cjs --only=/admin/ai --sizes=1440x900,1024x768,768x1024,390x844,320x640 --themes=dark,light --langs=hu,en` | **240 views, 0 findings** (the AI screen with the new switch and counters) |
| Live provider | – | **NOT RUN** (no key was used or requested; nothing was sent to Anthropic) |

## The new tests (124)

| File | Tests | What it holds |
| --- | --- | --- |
| `server/test/aiDiscoveryEngine.test.ts` | 28 | The rule engines without a server: the complexity assessment (determinism, explanations, floors, **the thresholds exactly at 5/6, 13/14 and 24/25 points**, no price), the stage machine (applicability, current stage, skipping, what a plan and an approval need), what a caller may send (validation of every input), the plan generator (sections, carrying unchanged sections over, staleness, the projection into the quote plan within its limits, no price), the words (every code has a label in three languages), and the upgrade to migration 0017 from a copy of a database at the previous migration |
| `server/test/aiDiscovery.test.ts` | 38 | The HTTP API and the tools against a real server and database: ownership (another session finds nothing), same-origin refusal, stale writes (409), validation (422), size and flood limits, SQL and markup as plain text, the assistant's proposals as unconfirmed, never overwriting what the visitor wrote or confirmed or rejected, the eighth tool (completeness), output-schema rejection, malformed tool calls, **the approval path** (only a confirmed plan, a stale plan refused, an approval dropped when the draft changes, a tampered snapshot refused, **a drifted draft refused even if an approval survived**), the request in the existing quote system with the structured brief, in Hungarian and Dutch, **every write refused after sending with the reason `sent`**, the older plan editor refused for a discovery plan, deletion and retention, the prompt's rules, no contact detail anywhere |
| `src/ai/discoveryText.test.ts` | 29 | The website's vocabulary equals the server's (lists, limits, signals, and the generated label tables word for word in three languages), and every sentence of the panel exists in three languages with the same placeholders, no unfinished marker, no price, currency sign or guarantee, and says "not an estimate", "not a quote", "not a promise", "not confirmed" where it must |
| `src/components/ai/discovery/DiscoveryViews.test.ts` | 29 | The panel drawn from the server's state: progress, the eleven types, origin and confirmation on every fact and requirement, nothing changeable while locked or sent, the plan (sections, stale notice, versions, notes, the review, **the send form only when nothing is missing**), Hungarian and Dutch, no price in any language |

Existing tests that **had to change** (and why): `server/test/ai.test.ts`, `aiProvider.test.ts`, `aiTools.test.ts`, `aiProduction.test.ts` (the tool set, the public configuration's keys and the migration filter now include the discovery), `src/content/ai/ai.test.ts` (sixteen tool names), `src/content/privacy.test.ts` (the check that the assistant's code cannot reach bookings now forbids the *module, the tables and the word "consultation"*, because "booking" is now one of the project types a visitor can name), `src/admin/lib/ai.test.ts` (a new setting).

## Mutation checks

A script broke one rule at a time in the source, ran the two server test files, required a failure, and restored the file byte for byte. All ten were **killed**: the assistant overwriting a fact the visitor wrote or confirmed; the assistant changing a confirmed type; the assistant changing a requirement the visitor wrote, confirmed or rejected; approving without a confirmed requirement; the quote workflow not checking the discovery plan on approval; deleting a conversation leaving its discovery behind; accepting a write that names an older version; changing a sent conversation; moving a complexity threshold; the request being created without re-checking the draft. (Three of them first **survived**, which showed three tests too weak: the "frozen after sending" test used a stale version and so passed for the wrong reason, no test sat on the thresholds, and no test covered a drifted draft after an approval. They were strengthened and the mutants killed.)

## What the browser journey covers (38 steps)

**A** the assistant fills the discovery through its tools and the panel shows who wrote what (proposals unconfirmed; the visitor confirms, edits, rejects, restores, adds, skips; the assistant cannot overwrite what the visitor confirmed or wrote; a script in a title is only text); **B** the plan (generated by rules, stale after a change, regenerated, versions listed, an older version opened read only, a note kept through a regeneration, the assistant's own plan tools); **C** the review, the approval form (what is wrong where), the assistant sending with the reference, **the contact details never reaching the model**, every change refused after sending, and the administration listing the request with the structured brief and **no price**; **D** a plan of suggestions only cannot be sent; **E** Hungarian and Dutch; **F** security (another session, another origin, a stale write, invalid and oversize input, SQL in an id, no-store and nosniff headers); **G** deleting the conversation removes the discovery (the five tables read directly from the scratch database: zero rows); **H** a phone (one tap from the chat, nothing scrolls sideways, every control at least 44 px, arrow keys on the tabs).

Two real defects were found by browser runs and fixed: the plan panel kept showing the discovery for up to a minute after the administrator switched it off (the public configuration is cached for 60 seconds; the panel now asks again when the discovery routes stop answering), and "every step is done" was shown while optional steps were still open.

## What was not verified

- **Anything with the real model.** The stand-in answers from markers; it proves the integration, the tools, the schemas, the database, the rules and the quote workflow, **not** how Claude Haiku 5.5 uses the discovery prompt.
- **A real Anthropic request, real e-mail delivery, Render, Cloudflare, production data**: none involved. Migration 0017 was applied to new databases and to a copy of a database at migration 0016 made by the tests, not to a copy of production.
- **Browsers and devices other than Chrome**: nothing was run in Safari or Firefox, on a physical phone, or with a screen reader. Accessibility was checked with axe and by keyboard in a few flows.
- **The Hungarian and Dutch wording** passed the automated checks, not a native speaker's reading.
- **Load and long-running behaviour** beyond the rate-limit tests.
