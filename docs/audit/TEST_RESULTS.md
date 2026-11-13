# Test results

Everything below was run on 2026-11-13 on the audited code plus the changes in [REMEDIATION_LOG.md](REMEDIATION_LOG.md). **Ran and passed**, **ran and failed**, and **could not run** are kept apart. Nothing was counted as a pass that was not executed.

## Ran: automated gates

| Gate | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` (`tsc -b`, five project references) | **pass**, exit 0 |
| Lint | `npm run lint` (oxlint) | **pass**, no findings, exit 0 |
| Localization | `npm run i18n:check`, `npm run i18n:validate` | **pass**: 2 587 texts × 3 languages, 0 errors, 0 warnings, Hunspell spelling 0 unknown words (HU 4 343, EN 2 192, NL 2 761 distinct words) |
| Tests | `npm test` (vitest) | **100 files, 2 149 tests, all pass** (72 website and worker files, 28 backend files). See "what failed first" |
| Production build | `npm run build` | **pass**: 91 pages, `404.html`, `robots.txt`, `sitemap.xml`, `_headers`, `_redirects` written; client bundle in ≈ 4 s |
| SEO check | `npm run check:seo` | **pass**: 92 files, 76 indexable, 16 noindex; sitemap, hreflang reciprocity, canonicals, structured data and headers verified (against the **declared** host: it cannot see the apex→www redirect, finding I-1) |
| Dependencies | `npm audit` | **0 vulnerabilities** |

### What failed first, and why

The first full run was **2 failed, 2 141 passed** (99 files): `server/test/email.test.ts` ("treats a hostile name as text…") and `server/test/quotationFlow.test.ts` ("writes the quotation in the language of the offer…") both asserted `max-width:600px` in the e-mail HTML, while the layout redesign `0840a3d` made the column `620px`. The tests were stale, not the e-mails; both were corrected and the full suite re-run (2 143 + 6 new tests = 2 149 pass).

## Ran: backend checks beyond the unit tests

| Check | Result |
| --- | --- |
| **Security probe** (`tools/e2e/security-probe.mjs`) against a throw-away backend and database | **94/94 passed** (after adding 17 admin routes it had not covered). Includes: 66 admin routes × 5 methods without a session → only 401/404/405; no account enumeration; 11 public reads without private fields; hostile text stored as text; clean JSON errors with no stack/path/SQL; sign-in, session cookie flags, CSRF and foreign-origin refusal; picture upload rules (SVG, HTML-as-PNG, oversize, pixel bomb, path traversal); sign-out invalidation; burst rate limit (10 of 12 limited) |
| **Migrations** | CLI `migrate` on an empty scratch database: 8 applied; on the restored copy: "up to date"; checksum refusal covered by `database.test.ts` |
| **Backup and restore drill** | pass, see [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) (44 tables, 201 rows, 0 differences, integrity ok, 0 FK violations; corrupted copy detected on open) |
| **AI** | 99 AI tests in six files pass; `ai status` with a hostile `ANTHROPIC_MODEL` → override rejected |
| **Live, read-only** | health and readiness ok (`database: ok`, `migrations: current`); admin API 401; sensitive paths 404; customer-link shapes 200 / no-store / noindex; CORS gives a foreign origin nothing; assets immutable; assistant `available: false` |

## Ran: browser audits (real Chrome, built site)

| Audit | Result |
| --- | --- |
| Layout matrix, 9 widths, every page, en dark (252 loads) and hu + nl light at 320/390 (112 loads) | **pass**: no overflow, nothing outside the viewport, no console/CSP error. Informational: "no footer" on five immersive Lab pages; one 13–16 px hidden-trigger button on `/lab` |
| No WebGL / context loss / what loads where (`webgl.cjs`) | **all OK** (28/28 pages with no WebGL; hero and Lab survive loss and restore; Three.js only where intended) |
| axe-core (WCAG 2.0/2.1/2.2 A, AA, best practice), every page, en, dark and light (56 page views) | **0 violations**; 5 informational structure notes (decorative overlay links with no name and `aria-hidden`, the same link text "Start a project" with two destinations) |
| Web vitals (emulated phone and desktop) | recorded in [PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md): CLS 0 everywhere; phone LCP 4.0–5.2 s (target 2.5 s **not met**, as in the earlier report) |

## Ran: end-to-end journeys (`tools/e2e`, real Chrome, built site served by a throw-away backend)

| Journey | Result | What it proves, and what the failures are |
| --- | --- | --- |
| `cms-journey.cjs` (the portfolio's life: create, publish, edit, unpublish, delete through the administration; the public side asked at every step) | **22/22 pass** | published content reaches the public API and pages, drafts do not, picture upload, no console error |
| `quote-journey.cjs` (quotation workflow on a phone) | **20/20 pass** after the harness was brought up to the current wording; the first run passed 11 of 20 | a visitor builds a request in the shop and gets a reference and a private status link; the owner's notification and the visitor's confirmation are written; the administrator writes and sends a quotation (whole-unit arithmetic); the customer opens the secure link **on a phone, accepts only after an explicit confirmation**, both sides are e-mailed once, nothing claims a payment; the administrator sees *Accepted* with the history and the e-mail states. The server log agrees: `quote request received` 201 and the e-mail attempts `accepted` |
| `journeys.cjs` A–E (recruiter, client, administrator, mobile, hidden racing experience) | **57 of 60 steps pass** after fixing one selector (first run: 52 of 56, because the required-consent checkbox was mis-picked) | A: homepage, intro, About, project, contact; C: a visitor sends a **contact message through the real form and API** (201), the administrator signs in (a wrong password is refused first), the dashboard counts it, status and note persist, destructive actions ask first; D: the whole phone path at 390×844 including sending a quote request; E: the hidden racing screen on desktop and phone. **3 steps fail**: (A) "the intro does not come back…" times out waiting for a URL (not diagnosed; a live visit to `/` does land on `/hu/`); (B) expects *no* visitor confirmation e-mail, but quote requests now send one with the private status link (the quote journey asserts that as intended); (C) the dashboard cross-check reads a counter (`quotes.inReview`) the API no longer returns. All three read as expectations that predate PROMPT 17/18; **not diagnosed further** |
| `shop-journey.cjs` (tier comparison, package page, FULL EXPERIENCE configurator, administrator edits and publishes) | **31 of 41 pass, 10 fail** | the phone switcher, swipe, groups and side-by-side compare pass. The failures begin with wording that no longer exists (the `Detailed features` section, tier labels) and then, in the FULL EXPERIENCE configurator, a reworded question heading (`Which components…` is gone from the source), so the configurator was **never submitted** in this run (0 requests reached the server). Consequence: **the FULL EXPERIENCE request path is not verified end to end in a browser by this audit** (its server side is covered by the backend tests) |

**The journeys are copy-sensitive and had drifted** after the plain-language rewrite of the shop (PROMPT 18: "quotation" became "quote", "e-mail" became "email", sections and questions were reworded) and the optional marketing checkbox (PROMPT 17). Two harness files were updated here (`journeys.cjs`: the required consent is the first checkbox; `quote-journey.cjs`: the current wording). `shop-journey.cjs` and parts of `journeys.cjs` still need the same, and would be sturdier written against `data-testid` and values than against English sentences. They are not part of CI (finding T-4, Low): add "run the journeys" to the pre-release checklist.

## Could NOT run (and why)

| Not run | Why |
| --- | --- |
| Anything against **Render** or **Cloudflare** dashboards | not signed in; sign-in is the owner's |
| `npm run server:cli -- ai check`, any real Anthropic request | no API key; it would spend tokens |
| A real e-mail send, provider connection test, webhook delivery | no provider account or key; no customer mail may be sent without authorization |
| A real Google Drive upload and restore | no OAuth credentials |
| `tools/e2e/l10n-journey.cjs` (country routing under `wrangler dev`) | needs the Workers runtime; the Worker is not in the production path anyway (finding I-4); its unit tests pass |
| `audit-admin.cjs` (540 admin views), `audit-quotes.cjs`, `audit-shop3.cjs`, `audit-keyboard-strict.cjs`, `audit-lab-overlap.cjs`, `tools/audit/mobile/*` (touch, safe areas, throttled governor) | long-running tools from earlier prompts; not repeated here, their last recorded results stand in `docs/release/*` |
| Real devices, Safari, Firefox, screen readers, Lighthouse, field Core Web Vitals | not available in this environment |
| A migration from an older schema holding real rows | the production database is already at version 8; only the empty-database path was exercised |
| A load or abuse test of production | out of scope: only non-destructive checks are permitted |

## Environment notes (traps hit during the audit, for the next person)

- Git Bash rewrites arguments such as `--pages=/hu/` or `VITE_API_URL=/` into `C:/Program Files/Git/…`: use `MSYS_NO_PATHCONV=1`, and **pass Windows-style absolute paths to Node** (a `/c/Users/…` path is read as `C:\c\Users\…`, which is where some tool outputs ended up).
- Each journey needs a **fresh** backend (rate limits live in memory); the probe's burst test leaves it exhausted.
- A stale `node server/src/main.ts` from 11 Nov already listens on `127.0.0.1:8788` on this machine; scratch servers were run on other ports.
