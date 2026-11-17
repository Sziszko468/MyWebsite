# Integration plan (B-1 of the production readiness audit)

**A plan, not an action.** Nothing described here has been done: no branch was created, nothing was merged, rebased, cherry-picked or pushed, and no deployment or hosting setting was touched. What was done to write it: read-only git commands (`merge-tree` computes a merge in memory and writes only unreferenced objects; it changes no branch, no ref and no working tree), and one scratch rehearsal of the migration upgrade on in-memory databases. Written 2026-11-17 against `29f4b31` (the audited branch) and `217c6d4` (`deployment/render-cloudflare`), and **updated the same day with the owner's five decisions and the evidence gathered for them (section 0)**. Step 1 has not been started.

Evidence tags: **[E]** executed while writing this plan · **[R]** read in the repository · **[A]** an assumption or a prediction, labelled as such.

## 0. The five decisions and the evidence for them (updated 2026-11-17)

Nothing was started: no branch was created (the name below is free on GitHub, which lists 11 branches, and locally), nothing was merged or pushed, no deployment happened, `main` and `deployment/render-cloudflare` are unchanged, no production database was touched, and no credential was entered anywhere. The evidence below was gathered with unauthenticated read-only `GET` requests to GitHub's public API and to the live site, and with read-only `git`.

| ID | Decision | Final state | Status |
| --- | --- | --- | --- |
| D-1 | What release 1 contains | **Only the current line**: the deployment line (with Gmail) plus the audited line (hardening, booking, CMS, Lab, localization). The portal, project management and feedback line, and the other session's uncommitted work (migration 0015), are a **later release**. | **DECIDED** by the owner |
| D-2 | The integration branch | **`integration/release-1`**, to be created from `29f4b31` when step 1 is approved | **DECIDED** by the owner; the branch does **not** exist yet |
| D-3 | Render auto-deploy on the deployment branch | The dashboard was not reachable (the built-in browser is not signed in to Render; it showed the sign-in form and nothing was entered). GitHub shows nothing about Render. | **OWNER VERIFICATION REQUIRED** |
| D-4a | `217c6d4` runs in production | The live backend has exactly the routes that the three Gmail commits introduced, and none that exist only in the feature line. The commit id itself cannot be read from outside. | **VERIFIED** by behaviour; the exact commit **NOT VERIFIED** |
| D-4b | The Gmail migration (0030) is applied | The running code reports no pending migration and contains the file; so it is applied. The row itself was not read (the production database was not touched, by instruction). | **VERIFIED** indirectly; the row **NOT VERIFIED** |
| D-5a | A downloadable, integrity-checked backup is available | None on this machine; whether a recent one exists in Drive is unknown; the deployed backup format cannot be verified by the new `backup verify` (no manifest). | **NOT VERIFIED**; **OWNER ACTION REQUIRED** |
| D-5b | The key needed to restore an encrypted backup is safely available | The backups production writes today are **not encrypted** (the deployed code has no encryption), so no key is involved. No key value was read or displayed. | **NOT APPLICABLE** to existing backups; the sealed copy becomes necessary **before** the key is ever set |

### 0.1 D-3: Render auto-deploy

| What was tried | Result |
| --- | --- |
| GitHub, public API, for `217c6d4`, `254a202`, `77c0df4`, `29f4b31`: commit statuses and the repository's deployments | No Render status or check on any commit; `deployments`: 0. GitHub carries no trace of Render. |
| GitHub, the repository's webhooks (where a Render hook would be listed) | HTTP 401: not readable without the owner's sign-in |
| The Render dashboard in the built-in browser | Redirected to the sign-in form (`/login-next`). Signing in is the owner's act; nothing was entered. The tab was closed. |

What is known indirectly: production runs code that was pushed on 2026-11-15 (section 0.2), so **some** deploy of that push happened. Automatic or by hand cannot be told from outside. Nothing is assumed.

**The owner is asked to look** (Render, the service, the build and deploy settings: *Auto-Deploy*, and the branch it follows; and the *Events* list for the last deploy and its commit; names as used in `docs/audit/INFRASTRUCTURE_AUDIT.md`, the dashboard may label them differently) and to answer two things: is auto-deploy on or off, and which branch does the service follow. Until then, **any push to `deployment/render-cloudflare` must be treated as a possible release.**

### 0.2 D-4: what runs in production (2026-11-17, 14 unauthenticated `GET`s, no cookie, no body, no redirect followed)

| Request (host `www.szilardkiss.com`) | Answer | What it shows |
| --- | --- | --- |
| `/api/ready` | `200`, `database: ok`, `migrations: current`, `email: configured` | the running code has **no pending migration** |
| `/api/admin/gmail/status` | `401` | the route exists: introduced by `84b1d23` |
| `/api/admin/gmail/sync-status` | `401` | the route exists: introduced by `217c6d4` |
| `/api/admin/gmail/unassigned` | `401` | the route exists: introduced by `217c6d4` |
| `/api/admin/readiness-probe-does-not-exist` | `404` | control: a missing route answers 404 |
| `/api/admin/booking-config`, `/api/admin/media-storage`, `/api/consultations/config` | `404`, `404`, `404` | routes that exist only in the feature line are **absent** |
| `/api/admin/project-settings` | `401` | exists in the deployment tip (control) |
| `https://szilardkiss.com/` | `301` to `https://www.szilardkiss.com/` | the apex still redirects to `www` (the opposite of the owner's canonical decision); `www` is answered by Render behind Cloudflare |

The reasoning, step by step: the routes `sync-status` and `unassigned` and the file `0030_gmail_messages.sql` are introduced by the **same** commit, `217c6d4` [E: `git log -S` on the deployment branch]. The running code has those routes, so it contains the 0030 file. `/api/ready` counts pending migrations against the running code's own files and says none are pending (`server/src/modules/system/health.ts`). Therefore 0030 is applied in the production database. The feature line's routes are absent, so production is not running any of the 13 newer commits.

**Limits, stated plainly:** this is behaviour, not a commit id, and the `schema_migrations` row was not read. A later commit with the same route set would look identical; the deployment branch has none. The Render *Events* list (D-3) is the authority for the commit.

**Consequences for the plan.**

- The production database most probably holds migrations **1–8 and 30**. The case that matters is the rehearsed one: upgrade by the merged file set applies exactly **9, 10, 11, 40** (section 2.2).
- "The audited branch alone refuses to start on a database that has 30" is no longer a conditional risk. Deploying `29f4b31` as it is, onto this database, **would stop the service**.
- The fallback case (a database without 30) stays covered by the rehearsal and costs nothing.

### 0.3 D-5: a backup for the rehearsal

| What was searched (names only; no file was opened) | Result |
| --- | --- |
| Downloads, Desktop, Documents (three levels, `node_modules` and `.git` skipped), OneDrive (three levels) | no backup folder, no `manifest.json`, `manifest.json.enc`, `database.sqlite` or `database.sqlite.enc` |
| A Google Drive sync folder on this machine | none exists |
| Database files in the project folders | `MyWebsite/data/app.sqlite` (659 KB, last written 2026-11-10, ignored by git) and `Warehouse_project/dev.db` (another project). The first is a **local development database of unknown provenance; it was not opened and is not used**. |

Why a Drive backup cannot simply be verified with the new tool: production runs the **old** backup code (`217c6d4`). It writes a plain `database.sqlite` and `media/…` into one folder per UTC day, with **no manifest, no encryption and no record of success** [R: `git show origin/deployment/render-cloudflare:server/src/modules/backups/googleDrive.ts`]. The new `backup verify` and `backup restore` require a manifest and will refuse such a folder. Whether the production service has Drive backups switched on at all, and whether the last one succeeded, is **not visible from outside** (the old code has no screen for it; the only signal is the failure e-mail).

How the rehearsal will treat an old-format backup, stated now so that nobody mistakes it for the stronger check: "integrity-checked" means SQLite's own `PRAGMA integrity_check` is `ok` on the downloaded file, `schema_migrations` lists the versions production reports (1–8 and 30), and the downloaded size equals the size Drive shows. That is **weaker** than the manifest's SHA-256 check. A backup made by the new code (after the release) can be verified with `backup verify` and is what future rehearsals should use.

**The owner is asked** to open the Drive folder named by `GOOGLE_DRIVE_FOLDER_ID`, or *Portfolio Backups* (the default name in the code), and to tell me: does a folder with today's or yesterday's date (`YYYY-MM-DD`) exist, and does it hold `database.sqlite` and a `media` folder, with what size? If yes, download the day's folder to a place **outside the repository** and tell me where. It holds customer data: keep it on this machine only, and it will be deleted after the rehearsal. If no recent backup exists, that is itself a finding to settle before the release.

**The key (D-5b):** the existing backups are plain, so no key is needed to open them. No key was read, and none will be. When the owner later sets `BACKUP_ENCRYPTION_KEY`, the sealed copy outside the host comes **first**.

### 0.4 A finding made on the way: Cloudflare Workers Builds is connected and builds pushed branches

The GitHub checks of three commits carry a check run named *Workers Builds: mywebsite* from Cloudflare's app:

| Commit | Branch | When | Result |
| --- | --- | --- | --- |
| `254a202` | `main` | 2026-11-11 | **success** (a Worker version was produced) |
| `217c6d4` | `deployment/render-cloudflare` | 2026-11-15 | **failure** |
| `29f4b31` | `feature/consultation-booking` | 2026-11-17, the push of this branch | **failure** |

So the connection exists, it builds branch pushes (a feature branch included), and the last two builds failed. The cause is only in Cloudflare's build log (GitHub, the commit's checks, *Workers Builds: mywebsite*, Details). Production is not served by that Worker (Render answers `www`), so a failed build does not take the site down, but: **pushing `integration/release-1` will start another build and show another red check on the pull request**, and whether a *successful* build of a non-production branch deploys anything is **OWNER VERIFICATION REQUIRED**. (The earlier push of `29f4b31`, done on the owner's go-ahead, started the failed build above; nobody knew at the time.)

### 0.5 What is still needed from the owner before step 1 may start

| # | Needed | For |
| --- | --- | --- |
| 1 | Render: is auto-deploy on, which branch is followed, and which commit the last deploy ran (D-3) | knowing whether any push to the deployment branch is a release |
| 2 | Drive: does a recent dated backup folder exist, and a path to a downloaded copy outside the repository (D-5a) | step 2 on real data |
| 3 | Cloudflare: what the failed *Workers Builds* say, and whether a successful non-production build deploys anything (0.4) | step 3 (the first push) |
| 4 | Your approval to start step 1 | step 1 is **not started** |

## 1. The problem in one paragraph

Production is deployed from `deployment/render-cloudflare`, whose tip is `217c6d4`: the old base `a75fa42` plus three Gmail commits. Everything committed since then (13 commits: the localization worker and quality engine, the canonical-address fix, the audit documents, the Shop 4.0 end-to-end tests, the quotation checklist, the CMS media and profile pages, the Lab experiences, the consultation booking, and PROMPT 25's hardening) lives on `feature/consultation-booking` (`29f4b31`), which does not contain the Gmail commits. The two sides changed 18 files in common. The migration runner refuses to start on a database that holds a migration its code does not know (`server/src/db/migrate.ts:79`), so **neither side can be deployed alone onto a database that has the other's migrations**, and neither can be rolled back to once its migrations have run. Section 0.2 shows this is not hypothetical: the production database almost certainly already has the Gmail migration (30), so deploying the audited branch as it is would stop the service. Integration therefore means one branch that contains both, tried first on a copy of real data, with a green CI run on Linux before the deployment branch moves.

## 2. What was found [E]

### 2.1 The branches

```
a75fa42 ─┬─ 3 Gmail commits ─────────────────────────────────────────► deployment/render-cloudflare 217c6d4   (migrations 1-8, 30)
         └─ 13 commits: localization, audit documents, Shop 4.0 tests, quotation checklist, CMS pages, Lab,
            booking 46d4652 ─┬─ PROMPT 25 hardening ──────────────────► feature/consultation-booking 29f4b31  (migrations 1-11, 40)
                             └─ d47ebe1 → portal f685cee → project management f8db684 → feedback 8c377ad
                                                                       ► feature/client-feedback-approval 8c377ad (migrations 1-14)
```

| Line | Tip | Migrations | Relation |
| --- | --- | --- | --- |
| Deployment (production) | `217c6d4` | 1–8, **30** | 3 commits the others lack |
| Audited / hardening | `29f4b31` | 1–11, **40** | 13 commits the deployment line lacks (`git log a75fa42..29f4b31`) |
| Portal, project management, feedback | `8c377ad` | 1–11, 12, 13, 14 | branches from `46d4652`; does not contain PROMPT 25 or Gmail |
| Not committed yet | the other session's checkout | adds `0015_client_communications.sql` | pending work of another session; **not touched** |
| `main` | local `77c0df4`, `origin/main` `254a202` | 1–8 | stale; not part of this plan (decision D-3 of the audit) |

### 2.2 Migrations are purely additive and do not collide

- Nothing was modified on either side: since `a75fa42` the audited branch **added** 0009, 0010, 0011, 0040; the deployment branch **added** 0030; the portal line added 0012–0014. Migrations 0001–0008 are byte-identical on both sides, and the runner's checksum ignores line endings (`migrate.ts:45`). Numbers 9–14, 30, 40 are all different.
- The runner applies any pending file whatever its number (it does not need the numbers to be consecutive or higher than the applied ones).

A scratch rehearsal on in-memory databases, using the repository's own runner and the real migration files from both refs (`migration-rehearsal.ts`, kept outside the repository; all 10 checks passed):

| Check | Result |
| --- | --- |
| A database as the deployment branch leaves it (1–8, 30), upgraded by the merged file set | applies exactly **9, 10, 11, 40** |
| …its schema against a fresh database built from the merged set | **identical** (150 objects each), no foreign-key problem, `integrity_check` ok |
| A database built by the audited branch alone (1–11, 40), then the merged set | applies exactly **30**; schema identical to fresh |
| The deployment branch's code against the upgraded database | **refuses**: "The database has migration 9, which this version of the server does not know" |
| The audited branch alone against a database that has 30 | **refuses**: "…migration 30, which this version of the server does not know" |

### 2.3 The textual conflicts (dry run, `git merge-tree`)

`217c6d4` into `29f4b31`: **12 files conflict, 6 merge automatically**. Every conflict is "both sides added something next to each other"; none is two different edits of one line.

| File | What each side added | Resolution rule |
| --- | --- | --- |
| `server/src/app.ts` | the list of secrets to mask: the audited branch adds the backup key, the other adds the Gmail secrets | **keep both** in the one list |
| `server/src/config.ts` (3 hunks) | the config type, the config object and the redacted view: backup encryption, snapshots, canonical redirect, deployment commit vs the Gmail block | **keep both**; keep the Gmail parsing that merged automatically |
| `server/src/http/rateLimit.ts` | the limiter table: the other side adds `gmailCheck` and `gmailSync` | **keep both** kinds of limiter |
| `server/src/modules/admin/routes.ts` | the audited branch's `systemData(app, session, ctx.req)` vs the 10 Gmail routes after it | **take the audited `systemData` call**, then add the Gmail routes |
| `server/src/modules/system/maintenance.ts` | the erase result: `bookings` vs `gmailMessages` | **keep both counts**: `{ inquiries, quoteRequests, bookings, deliveries, gmailMessages }`, in the type, the doc comment and every caller |
| `src/admin/i18n/en.ts`, `hu.ts` | the `operations` dictionary vs the `gmail` dictionary | **keep both** sections, in both languages (the dictionary tests enforce parity) |
| `server/test/dashboard.test.ts`, `process.test.ts`, `quotation.test.ts` | a migration-list assertion: computed from the files (audited) vs hard-coded ending in 30 (Gmail) | **take the audited, computed form**: it already includes 30 once the file is present |
| `server/test/security.test.ts` | the limiter-size assertion: a fixed list of zeros vs one built from `Object.keys(LIMITS)` | **take the Gmail form** (it cannot go stale again) |
| `server/test/reliability.test.ts` | the expected erase result | **merge** to the five-key object above |

Merged automatically, still to be **read** after the merge (a clean merge is not a correct merge): `.env.example`, `docs/backend/README.md`, `server/src/main.ts` (a snapshot step vs a Gmail warning line), `src/admin/api/endpoints.ts`, `src/admin/api/types.ts`, `src/admin/pages/SettingsPage.tsx` (the System tab then shows the Command Center and the Gmail panel [R]).

The portal/management/feedback line (`8c377ad`) merges into `29f4b31` with **one** conflict, `server/src/config.ts` [E]. That matters for sequencing (section 4), not for this plan.

### 2.4 What the merge will break on purpose

The route-coverage test (PROMPT 25) fails until each new admin route has a policy line. Gmail adds ten. From the permission each handler checks [R] (`modules/gmail/admin.ts`), these are the **expected** lines (a prediction to confirm by running the test, not a decision):

| Route | Permission checked | Policy line |
| --- | --- | --- |
| `GET /api/admin/gmail/status` | `system:read` | `admin` |
| `POST /api/admin/gmail/check` | `system:write` | `admin` |
| `GET /api/admin/gmail/sync-status` | `system:read` | `admin` |
| `POST /api/admin/gmail/sync` | `system:write` | `admin` |
| `GET /api/admin/gmail/unassigned` | `system:read` | `admin` |
| `GET /api/admin/gmail/messages/:id` | `requests:read` | `authenticated` |
| `PUT` and `DELETE /api/admin/gmail/messages/:id/association` | `requests:write` | `authenticated` |
| `GET /api/admin/inquiries/:id/emails`, `GET /api/admin/quote-requests/:id/emails` | `requests:read` | `authenticated` |

This is the safety net doing its job: it is the reason the policy file exists.

## 3. Strategy

| Option | Verdict |
| --- | --- |
| **A. A new integration branch from `29f4b31`; merge `origin/deployment/render-cloudflare` into it with a merge commit** | **Recommended.** No pushed commit is rewritten; the Gmail commits keep their identities; the result contains the deployment tip as an ancestor, so the deployment branch can later move **forward** to it (a fast-forward, no force). The bigger body of work stays the base. |
| B. Merge `feature/consultation-booking` into the deployment branch directly | Same content, but conflicts are resolved on the production branch, and a mistake lands where Render looks. No. |
| C. Rebase the three Gmail commits onto the feature line | Rewrites commits that were already pushed to the deployment branch; needs a force-push. No. |
| D. Cherry-pick | Loses the ancestry that makes a later fast-forward possible; two copies of the Gmail commits. No. |

Nothing in A touches `main`, and no force-push is ever needed.

## 4. Decisions

All five decisions are recorded with their evidence in **section 0**. D-1 and D-2 are decided; D-3 needs the owner's look at Render; D-4 is established by behaviour (the commit id and the migration row are not); D-5 needs a backup folder from Drive. What is still needed before step 1 is the list in 0.5.

## 5. The steps

Each step has a condition to leave it. **Steps 1 and 2 are local only: nothing is pushed.**

### Step 1: Build the integration locally and make it pass (no push)

Work in the clean `MyWebsite-ops` worktree only; the other checkout (another session's uncommitted work, 52 files) is not touched.

1. `git switch -c integration/release-1` from `29f4b31` (a new local branch; `feature/consultation-booking` stays where it is).
2. `git merge --no-ff origin/deployment/render-cloudflare`; resolve the 12 files by the table in 2.3.
3. Read the six automatic merges (2.3). Check `server/src/main.ts` runs the snapshot step **before** anything else touches the database, and that both start-up warnings remain.
4. Add the policy lines from 2.4; adjust the erase result's type and callers.
5. Make the upgrade test permanent (small): `server/test/migrationUpgrade.test.ts`, the rehearsal of 2.2 as a unit test (database at "deployment" state, upgrade with the shipped files, schema equals fresh, old file set refuses). It needs only `0030` to be present, which it is after step 2.
6. Correct the rollback text of the runbook and the checklist (audit finding F-05): after a release whose migrations have run, a code rollback refuses to start; the way back is the pre-migration snapshot or a forward fix.
7. Run the whole gate, with the spell checker CI installs: `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run i18n:check`, `npm run i18n:validate` (after `npm install --no-save hunspell-asm`), the build with `VITE_SITE_URL=https://szilardkiss.com`, `EXPECTED_SITE_ORIGIN=https://szilardkiss.com npm run check:seo`.
8. Commit the merge and the follow-ups as separate commits (merge; policy and tests; docs) so each can be read alone.

*Expected test fallout [A]:* the route-coverage test (until 2.4 is done), the erase-result assertions, possibly the exact-key assertions of `operationsConfig.test.ts` and `systemOperations.test.ts` (they pin the redacted configuration), and the dictionary-parity tests if one language misses a Gmail key. Each is a one-line decision, not a redesign.

**Leave when:** the whole gate is green on the integration branch, and `git diff origin/deployment/render-cloudflare..integration/release-1 --stat -- server/src/db/migrations` shows only added files.

### Step 2: Rehearse the upgrade on a copy of real data (no push, no production access)

The owner downloads a recent backup from Google Drive and tells me where it is (section 0.3). **Production writes the old backup format** (a plain `database.sqlite` and `media/`, no manifest), which the new `backup verify` and `backup restore` refuse. So, for this rehearsal only:

1. Copy the downloaded `database.sqlite` (and `media/`) into a new scratch folder outside the repository. Integrity-check it with SQLite's own `PRAGMA integrity_check` (must be `ok`), read which versions `schema_migrations` lists (expected 1–8 and 30, section 0.2), and compare the file's size with what Drive shows. This is weaker than the manifest's SHA-256 check; the record of the rehearsal says so.
2. Run the integrated code against that copy: `npm run server:migrate`. It must write a snapshot first, apply exactly the missing migrations (**9, 10, 11, 40**; 30 only if the copy lacks it), and leave `integrity_check` ok.
3. Start a throw-away server on the copy; `GET /api/ready` must be ready; sign in as an administrator; open the System page (migrations current, a snapshot listed), the inquiry list, a quote request, the bookings list, the Gmail panel (disconnected is fine), and the shop.
4. Count rows of the main tables before and after: nothing is lost.
5. Prove the way back: restore the snapshot into a second scratch place and start the **deployment** code on it.

**Leave when:** all five pass on real data. If no recent backup exists in Drive, that is a finding to settle first (production would have no usable backup); only then run step 2 on a scratch database built by the deployment branch's code, and say plainly in the record that it proves less. The downloaded copy holds customer data: it stays on this machine, outside the repository, and is deleted after the rehearsal.

### Step 3: A pull request, so CI runs (the first push; still not a release)

1. Push the **new** branch `integration/release-1` (a new name; no existing branch is touched).
2. Open a pull request with base `deployment/render-cloudflare`. CI runs on pull requests, not on pushes to a new branch (`ci.yml`). It must be green: typecheck, lint, tests, language checks, build, SEO.
3. The only CI run this repository has ever had failed at `npm test` on a Linux runner (audit finding F-03). If this one fails, the first job is to read the log and find out whether it is the suite, the runner or the environment, and fix it **on the integration branch**.
4. Do not merge the pull request. Merging is the release (step 4).

**Before pushing:** the Cloudflare *Workers Builds* connection is real and builds pushed branches (section 0.4): the push of this branch will start a build and add a check to the pull request, and the last two such builds failed. Ask the owner (0.5, item 3) what the failure is and whether a successful non-production build deploys anything. A branch push is not a deploy to Render, but it must not be a surprise, and a red Cloudflare check must not be mistaken for the CI result.

**Leave when:** CI is green on the pull request head, and the owner has read the diff.

### Step 4: The release (the owner's act, on the owner's go-ahead)

Only after steps 1–3 and the owner's dashboard answers (audit B-3, B-4: disk, `DATABASE_PATH`, variables, Node version, build and start commands, health path, `TRUST_PROXY`). Moving the deployment branch is the release if auto-deploy is on; **until the owner answers D-3, treat any push to that branch as a release.**

1. A fresh backup exists and was downloaded and checked (production still writes the old, unencrypted format until this release; it will have no System-page state). Do not set `BACKUP_ENCRYPTION_KEY` in the same release: seal the key first, change one thing at a time.
2. Move the deployment branch **forward** to the integration tip (a fast-forward, or merging the pull request with a merge commit). Never force.
3. Watch the start: the log must show "database snapshot written before migrating" and "migrations applied" with the expected versions.
4. `npm run smoke:ready -- --url=https://szilardkiss.com`, then the System page checks of `RELEASE_CHECKLIST.md`.
5. **The way back, stated before it is needed:** once migrations 9–11, 30 and 40 have run, the old code refuses to start. Recovery is: suspend the service; restore the pre-migration snapshot (`pre-v<from>-to-v40-…sqlite`, in `MIGRATION_SNAPSHOT_DIR`) with the checks of `RESTORE_DRILL.md`; deploy the previous commit. Data written after the migration is lost. A forward fix is the other way and is usually better. Decide which before the release, not during it.

## 6. After release 1

| Step | What |
| --- | --- |
| Release 2 (if D-1 was S1) | The portal, project-management and feedback line, and the pending client-communication work (migration 0015, once committed): the same four steps. One known conflict (`config.ts`); migrations 12–14 (and 15) are additive. Do it from the first release's tip, not in parallel. |
| `main` | Realign it with the released line (decision D-3 of the first audit). Not needed for any step above. |
| Housekeeping | The audit's P1 and P2 items (documentation of the real e-mail provider, secrets in the redaction list, the database-path guard, backup size limits) are independent and can follow in any order. |

## 7. Risks

| Risk | Why it is real | How the plan handles it |
| --- | --- | --- |
| A clean automatic merge that is wrong | six files merged without a conflict; a textual merge cannot see a semantic one | step 1.3: read them; the gate and the route-coverage test |
| Production has migration 30 (very probably, 0.2) | the audited branch alone would refuse to start | the merged set contains 0030; rehearsed (2.2): the upgrade applies exactly 9, 10, 11, 40 |
| Production does not have 30 | the merged set applies 30 with the rest | rehearsed (2.2) as the fallback case |
| The first Linux CI run fails | the only prior run failed at `npm test` | step 3.3: investigate before anything else |
| A new branch triggers a Cloudflare build | confirmed: *Workers Builds: mywebsite* ran for `254a202` (success), `217c6d4` and `29f4b31` (failures) | ask the owner before step 3; do not read the red check as a CI failure |
| Render auto-deploy is on and a push is a release | not visible from outside (0.1) | nothing pushes to the deployment branch before the owner answers D-3 |
| The rehearsal backup is in the old format | `backup verify` and `restore` need a manifest | step 2 uses SQLite's integrity check and says it is weaker; the first backup made after the release is verifiable |
| No recent Drive backup exists | production's old backup code leaves no visible record | step 2 asks the owner to look in Drive first; none would be a finding to settle before the release |
| A release cannot be rolled back by code alone | migration refusal (2.2) | stated in step 4.5; snapshot restore rehearsed in step 2.5 |
| The privacy erase misses one of the two new tables | both sides added their own deletion | one merged result type and a test that every table is read after an erase (the existing booking privacy test reads every table) |
| Time pressure to skip the rehearsal on real data | it is the only step that sees real data | it is a condition to leave step 2, not an optional extra |

## 8. Definition of done for B-1

1. `integration/release-1` contains `217c6d4` and `29f4b31` as ancestors; no existing branch was rewritten or force-pushed.
2. All 12 conflicts resolved by the rules above; the six automatic merges read.
3. The ten Gmail routes have policy lines and the route-coverage test passes; the upgrade rehearsal is a permanent test.
4. The whole gate is green locally; CI is green on the pull request.
5. The upgrade was run on a restored copy of real data, with the snapshot and the way back proven.
6. The owner has answered what 0.5 asks, and the audit's dashboard items needed for step 4.
7. The runbook and the checklist no longer say that a code rollback is enough.

Until 5 and 6 are true, the audit's verdict stays **NO-GO**.
