# Remediation log

Work branch: **`audit/prompt-19-platform-audit`**, created locally from `main` at `77c0df4`. **Nothing is committed, pushed, merged or deployed**: the changes sit in the working tree for the owner to review and commit (the owner commits their own work). The checkpoint is the branch point itself: `git switch main` returns to the audited state untouched. `main`, `origin/main` and `origin/deployment/render-cloudflare` were not modified.

For each change below: the issue, the files, whether production data could be affected (**none was**: no code path of these changes touches the live system), the test that was run and the result.

## Applied fixes

| # | Issue | Files | Production effect | Verification | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | Two backend tests failed since the e-mail redesign (`0840a3d`, column `max-width:620px`): both still asserted `max-width:600px`. The **tests** were stale; the e-mails are fine | `server/test/email.test.ts` (line 397), `server/test/quotationFlow.test.ts` (line 586) | none (tests only) | the two files re-run: 79 passed; full suite 2 149 passed | **fixed** |
| 2 | The security probe listed 66 − 17 = 49 admin routes; 17 routes added later (AI administration, quotation management, shop documents) were never probed for "401 without a session" | `tools/e2e/security-probe.mjs` (route list) | none (a tool run only against a throw-away local server) | probe against a scratch backend: **94/94 checks passed**, "66 admin routes × 5 methods (330 calls): only 401, 404 or 405" | **fixed** |
| 3 | `modules/backups/googleDrive.ts` (the automatic Drive backup) had **no test** | `server/test/googleDriveBackup.test.ts` (new, 6 tests, in-memory Drive stand-in) | none (no network, no Google account) | 6/6 pass; the logic is covered: consistent upload, media names, no duplicates, retention only after success and only dated folders, credentials only in the token body, failure e-mail without secrets, rescheduling | **added** |
| 4 | `TRUST_PROXY=0` in production behind a proxy makes every visitor one address for the limits (B-1) and nothing said so | `server/src/main.ts` (one start-up `log.warn` in production when the value is 0) | **logging only**: no behaviour, limit or setting changes; the line appears in the Render log after the next deploy | `process.test.ts`, `security.test.ts`, `googleDriveBackup.test.ts` re-run: 51 passed; `tsc -b` and `oxlint` clean | **added** |
| 5 | The end-to-end journeys had drifted behind the shop's plain-language rewrite (PROMPT 18) and the optional marketing checkbox (PROMPT 17): the quote builder's required consent was picked as `.last()` (now the optional box), and the quote journey asserted "quotation" / "e-mail" wording that is now "quote" / "email" | `tools/e2e/journeys.cjs` (consent is the first checkbox), `tools/e2e/quote-journey.cjs` (current wording) | none (tools run against throw-away servers) | `quote-journey` 11/20 → **20/20**; `journeys` A–E 52/56 → **57/60**; `shop-journey` (31/41) and 3 steps of A–E were **not** brought up to date | **partly fixed** |
| 6 | The audit's findings had nowhere to live | `docs/audit/*` (13 files) | none | read through; every number traced to a run or a live read-only request | **added** |

Final gate after all changes (2026-11-13): `tsc -b` exit 0 · `oxlint` exit 0 · `i18n:check` and `i18n:validate` OK (spelling 0 unknown) · **100 test files, 2 149 tests passed** · `npm run build` OK (91 pages) · `check:seo` OK (92 files, 76 indexable) · `npm audit` 0 vulnerabilities.

## Deliberately NOT changed (and why)

| Item | Why left |
| --- | --- |
| `VITE_SITE_URL` / canonical host (I-1) | a build variable on Render or a dashboard redirect; a deploy is needed; the owner chooses the host |
| `.github/workflows/ci.yml` (I-2) | one line would add the deployment branch, but it changes what runs on the owner's repository; proposed in PROMPT 20 |
| Backup encryption, last-backup record, catch-up, pre-migration snapshot (K-1…K-3, D-3) | each changes start-up or the backup format on production data; designed in PROMPT 20 scope |
| DNS (SPF/DKIM/DMARC), Cloudflare, Render settings | production configuration: not to be changed without explicit authorization; exact instructions are in the audit files |
| Unreferenced source files (F-3), hard-coded colours (F-2) | the brief: do not remove code that merely looks unused; no user impact |
| `docs/production/README.md` (`TRUST_PROXY=1`) | the right number must be measured; the measuring method is in INFRASTRUCTURE_AUDIT.md |
| `data/app.sqlite` (local), `.env`, `dist/` | not touched (the local database was only **copied** for the structure audit; `dist/` is a build output and was rebuilt several times, as `npm run build` does) |

## Owner checklist: answers to fill in

Open each, note what you see (names only; never paste a value) and the date.

| ID | Where | Question | Answer |
| --- | --- | --- | --- |
| R-1 | Render → service → Disks | persistent disk mounted at the folder of `DATABASE_PATH` and `MEDIA_DIR`? size? | |
| R-2 | Render → Environment | all expected variable names present, no `ANTHROPIC_MODEL`? | |
| R-3 | Render → Environment | `TRUST_PROXY` value; measured? | |
| R-4 | Render → Settings | build command, start command, Node version ≥ 22.18 | |
| R-5 | Render → Settings | health check path | |
| R-6 | Render → Settings | deployed branch; auto-deploy on/off | |
| R-7 | Render → Events | last successful deploy and its commit | |
| R-8 | Render → Logs | any `warn` from the start-up checks (now including `TRUST_PROXY`) | |
| R-9 | Render → plan | always-on instance (no sleeping) | |
| R-10 | Render → Custom Domains | which host is primary | |
| R-11 | Render → scaling | exactly 1 instance | |
| C-2 | Cloudflare → SSL/TLS | mode **Full (strict)** | |
| C-6 | Cloudflare → Email Routing | rules and verified destination | |
| C-7 | Cloudflare → Workers | does the Worker `mywebsite` exist, is it routed to the domain? | |
| E-1 | e-mail provider dashboard | domain verified? DNS records published? | |
| K-4 | Google Cloud console | OAuth consent screen status: **In production** (not Testing)? | |
| A-1 | the host / admin | `ANTHROPIC_API_KEY` set? connection test result? | |

## Decisions the owner must take

| ID | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D-1 | Canonical host | `www` (set `VITE_SITE_URL=https://www.szilardkiss.com`) or apex (make it primary) | the apex, matching "the final domain is `szilardkiss.com`"; either is fine, **mixed is not** |
| D-2 | Where static files are served | keep Render for everything (accept client-side language choice) or Workers for static + Render for API | keep Render; delete or park the Worker until a real need appears |
| D-3 | Branch policy | merge `origin/main` into local `main`, push `main`, fast-forward `deployment/render-cloudflare` only when deploying; add CI to the deploy branch | yes, in that order, by the owner |
| D-4 | MFA for the administration | TOTP in the app, Cloudflare Access in front of `/admin`, or accept password-only | Cloudflare Access is the cheapest strong step |
