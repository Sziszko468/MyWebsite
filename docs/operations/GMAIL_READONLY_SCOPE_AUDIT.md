# Gmail read-only OAuth scope: audit and hardening (PROMPT 27)

Written 2026-11-17 on the branch `feature/gmail-readonly-scope`, which is based on `deployment/render-cloudflare` (`217c6d4`). **This is an isolated code-hardening change. It is not a Gmail activation and not a production release**: nothing was pushed, merged, deployed or configured, and no Google, Gmail, Render, Cloudflare or Drive setting was read or changed. Every value used in the tests is made up.

**Result in one line:** the Gmail integration only ever *reads* mail, so it now requires one scope, `https://www.googleapis.com/auth/gmail.readonly`, instead of two. The audit found no operation that needs `gmail.send`.

## 1. Initial branch and commit

| | |
| --- | --- |
| Where the work started | the worktree `MyWebsite-ops`, branch `feature/consultation-booking`, `e50f122b0560b0ebac84093e72cb6eba55e75f52`, working tree clean |
| Is the Gmail implementation on that branch? | **No.** `git ls-files` there lists no Gmail file and there is no `server/src/modules/gmail`. Gmail exists only on the deployment line. |
| Where the Gmail implementation is | `deployment/render-cloudflare` = `origin/deployment/render-cloudflare` = `217c6d42104cd6e9f6009760fa8546ab65c534fb`: eight modules in `server/src/modules/gmail/` from three commits (`7488670` OAuth foundation, `84b1d23` connection status, `217c6d4` message import) |
| Does that code match the intended production implementation? | **PARTIALLY VERIFIED.** It is the line the repository's documents treat as production, and read-only observations of the live site earlier the same day (the three Gmail routes exist, none of the feature line's routes do) are consistent with it. The deployed commit id itself is only visible in Render's dashboard: not verified. |
| Branch created | `feature/gmail-readonly-scope`, created from `217c6d4` in its own worktree `MyWebsite-gmail` (`git worktree add -b`), so no existing branch or worktree was switched. It did not exist before, locally or on GitHub. |
| Base used | `217c6d4`, after confirming the Gmail implementation is there |

## 2. Files inspected

On the deployment ref, read with `git show` and `git grep`, and then in the new worktree:

- **The Gmail module, all eight files:** `server/src/modules/gmail/{tokenService,api,sync,admin,repository,association,mime,html}.ts`.
- **Configuration and wiring:** `server/src/config.ts` (the four variables, the e-mail provider list), `server/src/app.ts`, `server/src/context.ts`, `server/src/main.ts`, `server/src/http/rateLimit.ts`, `server/src/modules/admin/routes.ts`, `server/src/modules/system/maintenance.ts`.
- **Everything else that mentions a Gmail scope or API:** a repository-wide search of `server`, `src`, `docs`, `tools`, `scripts` and `.env.example` for `gmail.send`, `gmail.readonly`, `gmail.modify`, `gmail.compose`, `mail.google.com`, `GMAIL_SCOPES`, `insufficient_scope`, `users.messages`, `users/me`, `drafts`, `trash`, `batchModify`.
- **Tests:** `server/test/gmail{OAuth,Admin,Api,Sync,Mime,MessagesAdmin}.test.ts`, `gmailKit.ts`, `src/admin/components/GmailPanel.test.ts`, `src/admin/lib/gmail.test.ts`.
- **Administration:** `src/admin/components/GmailPanel.tsx`, `src/admin/lib/gmail.ts`, the Gmail section of `src/admin/i18n/en.ts` and `hu.ts`.
- **Documentation:** `docs/backend/README.md` (the Gmail sections) and `.env.example` (the Gmail block).
- **The Drive backup, to check it is separate:** `server/src/modules/backups/*` (read, not changed).

## 3. Does any Gmail sending functionality exist? **No.**

| Question | Answer | Evidence |
| --- | --- | --- |
| Gmail API methods used | exactly two: `users.messages.list` and `users.messages.get` (`format=full`) | `api.ts:12,143,150,183,200`: one `fetchImpl` call, `method: 'GET'`, reached by two fixed paths, `/messages` and `/messages/{id}` |
| Is `users.messages.send` called anywhere? | **No** | a search of the whole repository for `messages/send`, `users.messages`, `users/me` finds only the module's own list and get calls and comments |
| Any write, modify, delete, trash, insert, import, draft or attachment call? | **No** | the module has one more HTTP call, a `POST` to Google's token endpoint (`tokenService.ts:160-161`); nothing else |
| Does synchronisation use only list and get? | **Yes** | `sync.ts` goes through the API client of `api.ts`, which has only those two calls. It reads the `SENT` label only to mark a stored message as outbound (`sync.ts:147`); it does not change a label. |
| Does any other module depend on `gmail.send`? | **No** | outside the Gmail module, only wiring refers to it: `app.ts` (builds the services), `config.ts`, `context.ts`, `main.ts` (a warning line), `rateLimit.ts` (two limiters), `maintenance.ts` (deletes the **local** copy when a person is erased). None sends or names a scope. |
| Is Gmail a way the site sends its own e-mail? | **No** | the providers are `none`, `smtp`, `file`, `resend` (`config.ts:38,311`); the notifications module never mentions Gmail |
| Where was `gmail.send` named? | only the constant, its one reader, three texts and two tests | `tokenService.ts:20` (the constant) and `:179` (`GMAIL_SCOPES.every(...)`); `.env.example:243`, `docs/backend/README.md:333`, `src/admin/i18n/en.ts:783` and `hu.ts:780` |

The scope was therefore **asked for and enforced** (a token without it was refused) but never **used**.

## 4. Exact scope changes

`server/src/modules/gmail/tokenService.ts`:

```diff
-/** What the mailbox must have granted: read it, send from it. Nothing broader is asked for. */
-export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'] as const
+/** What the mailbox must have granted: the right to READ it, and nothing else. (comment: lists and fetches only; a token with more is accepted;
+ *  one without gmail.readonly is not) */
+export const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'] as const
```

- **Validation.** The check is unchanged (`GMAIL_SCOPES.every((scope) => granted.includes(scope))`, `tokenService.ts:179`); with one required scope it now means: the token must list `gmail.readonly`. A token that also lists `gmail.send` or anything else is accepted; one that does not list `gmail.readonly` is refused with `insufficient_scope`. When Google's answer lists no scopes at all, the check is skipped, as before.
- **Strictness on purpose.** A token that holds only a broader scope that does not name `gmail.readonly` (for example `gmail.modify` or `https://mail.google.com/`) is **refused**: accepting broader tokens would contradict the point of the change.
- **The error text** of `insufficient_scope` was reworded from "the permissions the integration needs" to "permission to read Gmail (gmail.readonly)". It is a fixed text; the category list, the HTTP status handling and every other category are unchanged.
- **The words the administration shows** for that failure (English and Hungarian) said "reading and sending Gmail, authorize with both": now "reading Gmail ... with that permission" (`src/admin/i18n/en.ts`, `hu.ts`, one line each).
- **Not changed, as required:** the four variable names (`GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_ACCOUNT_EMAIL`); `config.ts`; the Drive credentials and backup code; migrations and message storage; routes and the administration's behaviour; the OAuth flow (no callback and no browser flow was added); no sending feature was added.

## 5. Tests executed, with their actual results

All run in `MyWebsite-gmail`, Node v22.23.1, Windows. "Executed" means run during this task.

| # | Command | Result |
| --- | --- | --- |
| 1 | `npx vitest run` on the 8 Gmail suites, **before any change** (baseline) | **8 files, 254 tests passed** |
| 2 | the same 8 suites, after the scope change and before touching a test | **1 failed**, 253 passed: `gmailOAuth.test.ts`, "refuses a token that was not granted the permissions the integration needs": the one test that encoded the old two-scope rule |
| 3 | that test replaced by one that states the new rule, and `server/test/gmailReadOnly.test.ts` added (14 tests); the fake Google in `gmailKit.ts` now also records the HTTP method (test code) | passes |
| 4 | **mutation checks** (each reverted afterwards, files compared byte for byte): (M1) the send scope required again; (M2) a `/messages/send` path added to `api.ts`; (M3) the list call changed to `POST` | M1: **4 tests failed**; M2: **1 failed**; M3: **2 failed**; after restoring: all pass |
| 5 | `npm run typecheck` | **exit 0** |
| 6 | `npm run lint` | **exit 0** |
| 7 | `npx vitest run` on the 9 Gmail files (`gmailReadOnly`, `gmailOAuth`, `gmailAdmin`, `gmailApi`, `gmailSync`, `gmailMime`, `gmailMessagesAdmin`, `GmailPanel`, `lib/gmail`) | **9 files, 268 tests passed** |
| 8 | `npx vitest run` (the whole suite), two consecutive runs with the final code | **2 316 passed, 2 failed** both times; the two failures are described below |
| 9 | the same whole suite on the **pristine base** (my tracked changes reverted in this worktree only, my new file moved aside, then restored and compared) | **2 302 passed, 2 failed**: the same two failures |
| 10 | `npm run i18n:check`, `npm run i18n:validate` | **NOT RUN**: the scripts do not exist on this base (`Missing script`); they were added on the other line. The two dictionary strings that changed were therefore not put through a language check. |
| 11 | `npm run build`, `npm run check:seo` | **NOT RUN**: not required for this change, and no site code is affected |

**The two failing tests are not caused by this change.** `server/test/email.test.ts` ("treats a hostile name as text...") and `server/test/quotationFlow.test.ts` ("writes the quotation in the language of the offer...") still expect `max-width:600px` in an e-mail whose column is 620 px. They fail identically on the untouched base (row 9) and are the stale-test finding of the earlier platform audit, fixed on the other line. They would turn a CI run of this branch red.

**One defect of my own was found and fixed along the way.** My first version of `gmailReadOnly.test.ts` read about nine hundred source files twice; in the whole-suite run that made an unrelated CPU-bound test (`auth.test.ts`, "limits password attempts...", 5-second timeout) time out. It passed alone and on the base, and a run with only my new file excluded had only the two stale failures, which is how it was traced. The scan now runs once and skips files that never mention Gmail; rows 7 and 8 are with the fixed file, and the timeout did not return.

**What the new tests prove** (`server/test/gmailReadOnly.test.ts`, 14 tests, and the replaced scope test in `gmailOAuth.test.ts`):

| Required proof | Where |
| --- | --- |
| A token with `gmail.readonly` is accepted | `gmailOAuth.test.ts`, "requires gmail.readonly and nothing else": read-only alone, with other scopes, in either order, and with no scope listed |
| A token with `gmail.readonly` and `gmail.send` is also accepted | the same test; and `gmailReadOnly.test.ts` runs a whole synchronisation on such a token |
| A token without `gmail.readonly` is rejected | the same test: `gmail.send` alone, `gmail.modify`, `https://mail.google.com/`, another service, an empty list; and a synchronisation on a send-only token imports nothing and never reaches Gmail |
| An incomplete OAuth configuration stays disabled safely | the existing "stays off when a value cannot be used" and "makes no request at all without a complete configuration" (pass) |
| Invalid credentials and invalid refresh tokens keep their safe errors | the existing cases in `gmailAdmin.test.ts` and `gmailSync.test.ts` (`invalid_credentials`, `invalid_grant`, `rate_limited`, `provider_unavailable`, `network`, `invalid_response`; no secret in any answer, status or log line) (pass) |
| Synchronisation uses only read-only operations | `gmailReadOnly.test.ts`: every request a real synchronisation made is a `GET` to `/gmail/v1/users/me/messages` or `/messages/{id}`, or a `POST` to Google's token endpoint, and nothing else |
| No sending was introduced | the same file reads the module's source: no Gmail permission beyond reading anywhere in `server/src` or `src`; no send, draft, modify, delete, trash, import, insert or attachment path; exactly two outbound call sites (one `GET`, one `POST` to the token endpoint); two fixed paths; Gmail is not an e-mail provider the mailer can be switched to |

## 6. Documentation changes

- `docs/backend/README.md`: the Gmail OAuth section now says the refresh token needs `gmail.readonly`, the only required scope; a token that was also granted more is accepted. A new subsection, **Scope and permissions**, states: Gmail requires only `gmail.readonly`; it reads and imports messages and does not send, modify or delete them; the Gmail credentials are independent of the Google Drive backup credentials (and the Drive scope is unchanged); Google's OAuth verification may still be required for the restricted Gmail read scope (not checked here; where to look); an existing refresh token may need to be re-authorized (a token cannot be narrowed: a token with both scopes keeps working, and to stop granting `gmail.send` the mailbox must be authorized again with `gmail.readonly` only and the old token revoked). The sentence "Nothing reads or sends mail" now says the token service itself reads and sends no mail.
- `.env.example`: the Gmail comment now names `gmail.readonly` as the only required scope.
- No unrelated documentation was changed.

## 7. Security and regression review

| Check | Result | Evidence |
| --- | --- | --- |
| `GOOGLE_DRIVE_CLIENT_ID` is separate from `GMAIL_CLIENT_ID`; the secrets and the refresh tokens likewise | **VERIFIED** | `gmailReadOnly.test.ts` loads both sets and checks each value lands in its own field; the existing "uses its own credentials even when the Google Drive ones are set too" test passes; the Gmail module never mentions `GOOGLE_DRIVE`, `config.backup` or `drive.file`, and the backup module never mentions Gmail (both asserted by the new test) |
| No backup credential is reused for Gmail | **VERIFIED** | same evidence |
| No secrets or tokens in logs, test output or documentation | **VERIFIED** for what was added | a scan of every added line (the diff and the new file) for credential patterns found 0 matches; the tests use the kit's made-up values and the existing tests that assert nothing leaks into an error, status or log line pass |
| The Drive backup code and its credentials were not modified | **VERIFIED** | `git diff` against `217c6d4` for `server/src/modules/backups`: empty; the Drive lines of `.env.example` are not in the diff |
| Migrations and Gmail message storage were not altered | **VERIFIED** | `git diff` for `server/src/db`, `repository.ts`, `sync.ts`, `api.ts`, `admin.ts`, `mime.ts`, `association.ts`, `html.ts`, `config.ts`, `app.ts` and `modules/admin/routes.ts`: empty |
| No production configuration was changed | **VERIFIED** | nothing outside this worktree was written; no service was contacted |

Files changed against the base: `.env.example`, `docs/backend/README.md`, `server/src/modules/gmail/tokenService.ts`, `server/test/gmailKit.ts`, `server/test/gmailOAuth.test.ts`, `src/admin/i18n/en.ts`, `src/admin/i18n/hu.ts`, plus the new `server/test/gmailReadOnly.test.ts` and this report.

## 8. Protected branches

`main` (local `77c0df4`, `origin/main` `254a202`) and `deployment/render-cloudflare` (local and origin `217c6d4`) were **not modified**: nothing was merged, rebased, cherry-picked or pushed; the work is one local branch with one local worktree. The primary checkout and the other worktrees were not touched.

## 9. Remaining blockers and Google requirements

| Item | Status |
| --- | --- |
| **The deployed code still requires both scopes.** Production runs the code before this change. Until this branch is released, a refresh token granted `gmail.readonly` **only** would be refused there with `insufficient_scope`. | BLOCKER for creating a read-only-only token for production now |
| This branch is local: not pushed, no pull request, not merged, not deployed. | by instruction |
| Google's OAuth verification for the restricted Gmail read scope | NOT VERIFIED. It may still be required; whether it is, and for what consent-screen status, depends on Google's current rules, which were not researched. The owner checks it in the Google Cloud console (the consent screen's publishing status, scopes and verification state). |
| An existing refresh token | OWNER ACTION REQUIRED if one exists: it may carry both scopes (still accepted) or lack `gmail.readonly` (refused). It cannot be narrowed; narrowing means a new authorization with `gmail.readonly` only and revoking the old token. Whether Gmail is configured in production at all is not visible from outside. |
| The two stale e-mail tests on the deployment line | they fail on the base and would make a CI run of this branch red until the fix from the other line is merged |
| The language checks of the two changed texts | NOT RUN (the scripts do not exist on this base); they should be run after the lines are merged |
| Integration with the feature line | this branch is based on the deployment line, so it must be part of the integration. A search of the other branches for the strings this change's source scan forbids found none, so it will not trip there. |
| Pushing creates a Cloudflare *Workers Builds* check on the branch (observed on earlier pushes; the last two failed). Not a CI result. | informational |

## 10. GO / NO-GO for the next OAuth configuration step

- **GO** for reviewing this change and for merging it into the deployment line **through the planned integration**: the audit found no operation that needs `gmail.send`, the change is one constant plus its texts, and it is covered by tests that fail when the rule is broken.
- **NO-GO for installing a read-only-only refresh token in production until this change is deployed.** The order is: (1) release this code, (2) authorize the mailbox with `gmail.readonly` only (and revoke any older token that also carries `gmail.send`), (3) put the new `GMAIL_REFRESH_TOKEN` in Render, (4) check the connection in the administration. Doing step 3 first would produce an `insufficient_scope` failure on the deployed code.
- If Gmail must work **before** the release, the token must carry both scopes, which is what the deployed code demands; that would grant a permission the integration never uses and is not recommended.
- **Before step 2,** the owner confirms Google's verification requirements for the restricted read scope (section 9). That is an owner action and was not researched here.

This is a statement about the code and the order of steps. It is not an activation: Gmail synchronisation was not run, no Gmail or Google service was contacted, and nothing in production changed.
