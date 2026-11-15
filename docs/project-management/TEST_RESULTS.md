# Test results

Everything below was run on this branch on a development machine (Windows 11, Node 22, Chrome through Playwright). The numbers are from the real runs; nothing is rounded up. **Nothing was run against production, a real provider, real DNS or a real customer, and no e-mail was sent anywhere.**

## The commands and what they said

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, no output |
| `npx oxlint` | exit 0, no findings |
| `npx vitest run` (the whole project: website, administration, backend, scripts) | **136 files, 2826 tests, all passed** (100 s) |
| `npm run i18n` (`i18n:check` + `i18n:validate`, Hunspell dictionaries for HU, EN, NL) | **errors 0, warnings 0**; spelling: HU 5074 words, EN 2369, NL 3026, 0 not found. The "3471 of 3475 complete" line is the same four texts that were incomplete **before** this work (checked against the base branch). |
| `MSYS_NO_PATHCONV=1 VITE_API_URL=/ VITE_SITE_URL=https://example.test npm run build` | built (`tsc -b`, `i18n:check`, `vite build`, the SEO prerender: 103 pages) |
| `npm run check:seo` | `check:seo ok: 104 files, 82 indexable, 22 noindex` (the portal and everything below it stays `noindex`) |
| `npm audit` | found 0 vulnerabilities |

## The tests added for this work (134, all in `npm test`)

| File | Tests | What it proves |
| --- | --- | --- |
| `server/test/projectWorkTasks.test.ts` | 24 | creating and reading tasks (private by default, defaults, validation naming the fields, **mass assignment refused**, a task starts open, references to another project's milestone / a disabled category / an unknown user refused, a task of another project is "not found" for every verb); editing with the **revision** (a stale edit refused and nothing changed, a no-op writes nothing, dates in either order, assignment); every status move against the table, refusals are 409 and change nothing, reopening, reinstating, the stale-screen refusal, **bulk** answers per task, **reordering** among the places held; **dependencies** (blocked tasks cannot start / review / complete and the answer names what they wait for, finishing a predecessor releases without completing, a cancelled one holds nothing up, self / duplicate / cross-project / unknown refused, **every loop refused and named**, removal, and the **database's own** refusals); deleting; **roles and sessions** (401 without a session, 403 without the token, an editor works but cannot change categories or e-mail choices, a customer's cookie is nothing); filters, sorting, search (including `' OR 1=1 --`, `%`, `_`) |
| `server/test/projectWorkActions.test.ts` | 27 | giving a request (only for a shared, unfinished task in an open project, one per task, validated, a status cannot be set); a task with an open request cannot be hidden or completed, **cancelling the task cancels the request**; **what the customer sees** (shared tasks only, in the owner's words, the exact list of fields returned, no internal description / priority / assignee / note, a hidden task is "not found", only shared tasks named as what a task waits for, a hidden milestone not named); the **whole life of a request** with the customer's view (answers, history in the customer's words, the private review note nowhere in any page or API answer); answering (once, a double click changes nothing, validation, markup stored as text, **immutable answers and append-only history**, not mine / not shared / finished / closed project all "not found" or "closed" with the same message, CSRF and sessions, mixed references); the review (submitted → under review → accepted, the owner **completes the task only when asked**, a request for changes **needs words for the customer**, next revision, every move a transition, stale refused, editor allowed and a customer not, rewording only before an answer); the overview ("needs you", most urgent first); the timeline (only lines written for the customer, **including that the owner's own lines about a SHARED task never reach it**, hiding a task takes its lines off and sharing it brings them back); **progress** (nothing → nothing to measure, tasks, hidden and cancelled excluded, the owner's and the customer's figures differ, no number can be set); milestones (description, status, visibility, a completed one stays completed, completing does not complete tasks, a milestone of another project refused by trigger) |
| `server/test/projectWorkNotifications.test.ts` | 19 | the request e-mail in **EN, HU and NL** with the project, the task, the words and the link and **nothing private**; the owner's switches; the owner's e-mail (once, to `NOTIFY_TO`, with the customer to reply to, without the customer's words); accepted and changes-requested e-mails (the owner's words, never the private note); the milestone e-mail (**off by default**, only for a milestone the customer can see, never twice); **reminders** (due soon once, not before, a second pass or a restart makes none, overdue off by default and once when on, a moved date is a new reminder, never for answered / finished / hidden / on-hold / switched-off, **a queued reminder whose reason went away is cancelled**, the daily maintenance runs them); what the owner sees (queued vs handed to the provider); the choices validated and limited to the administrator; **erasing a customer** removes tasks, requests, answers, history and e-mails |
| `server/test/projectWorkData.test.ts` | 23 | the code's lists equal the migration's CHECK lists; the e-mail kinds are in the outbox's CHECK and once-only index; **the upgrade from 0012 with data** (ids kept, backfills right, rules came back, foreign keys intact, nothing created for anybody); what the database refuses by itself (inconsistent completion, dates, statuses, malformed days, a second request for a task, a repeated revision, an empty answer); a project's removal cascades; **two requests at once** (three answers at once make one; two edits and two moves from one screen make one; two reviews make one e-mail); **a refused step leaves nothing behind** (accept + complete refused as a whole, a bulk move, cancelling closes the request); text stays text (HTML and header-injection attempts in titles and answers, in the e-mails and the API); the status-e-mail choice and the maintenance; the categories (slug, duplicate, names, in use, suggested set once, none named in the front end); **every address** answers a stranger 401 and a missing token 403; the customer's addresses never believe a customer id; the audit log names the administrator and never the words |
| `src/portal/work.test.ts` | 13 | every line of the timeline reads in every language with the title in it and no raw code; the words have the same placeholders in all three languages and a word for every status; "no file can be attached" said in all three; no promised time; the progress says nothing to measure when it is `null`; the schedule is text first with its bars `aria-hidden`, late work in words, cancelled left out, dates in the customer's language; what is sent is one field to one address; **the stylesheets of the work have no animation or transition** |
| `src/admin/components/work/work.test.ts` | 16 | the board has one column per status; **a card moves without a mouse** (a select and two buttons, each named after the task); only the moves the server allows are offered; a card says in words what matters; the list is a captioned table with a labelled checkbox per row; the schedule; the form says what the customer will see, is private by default, and holds a task shared while a request is open; a day is written the same wherever the browser is; "delivered" only as the provider's confirmation; HU and EN have the same shape |
| `src/utils/schedule.test.ts` | 12 | days and their arithmetic across clock changes; the schedule's rows, points, ordering, bar widths, ticks, today, cancelled and undated |
| `server/test/clientPortalProjects.test.ts` (changed, 20) | – | **two assertions were changed on purpose and only those**: the list of event types now reads migration 0013's rebuilt table (the first eight are still 0012's), and "never a percentage" became "a percentage only when it is counted from records, `null` when there is nothing to count, and nobody can set it" |

### Mutation checks (does a test fail when the rule is broken?)

| Rule removed | The test that failed |
| --- | --- |
| the answer endpoint's ownership (`p.customer_id = ?`) | `cannot answer a task that is not yours…`, `only the customer who owns the project…` |
| the loop check | `refuses a task on itself, a duplicate…, and every loop` |
| the board select's accessible name | `moves a card without a mouse…`, `links every card…` |
| the project timeline's `visibility = 'customer'` | `keeps the owner's own lines about a SHARED task off…` (this check **found a gap**: no test covered it; the test was added, then both this filter and the overview's were removed in turn and each failed it) |
| the overview's `visibility = 'customer'` | the same test |

## The browser journeys

`tools/e2e/work-journey.cjs` (24 checks, parts A to F: the owner's setup, the administration, the customer, what a customer must never see, three languages, **no console error from any page** and **axe WCAG 2.2 AA + best practice on every screen**) against the **built** site served by the real backend (one process, one origin, a throw-away database, the `file` e-mail provider, addresses ending `.test`):

| Width | Result |
| --- | --- |
| 1440 | 24 passed, 0 failed |
| 1024 | 24 passed, 0 failed |
| 768 | 24 passed, 0 failed |
| 390 | 24 passed, 0 failed |
| 320 | 24 passed, 0 failed |
| 1440, dark theme | 24 passed, 0 failed |
| 390, dark theme, reduced motion | 24 passed, 0 failed |

The earlier `tools/e2e/portal-journey.cjs` (29 checks, the PROMPT 25 portal, with axe) was re-run as a regression: **29 passed at 1440 and 29 at 390**. One assertion of it was changed on purpose (the projects page showed no percentage; it may now show the count's own, 25 % for 1 of 4 milestones, and nothing else).

The journey covers, among other things: the board moved with the keyboard; a card that waits for another refused in words; reordering; the list with a bulk move and its per-task answer; filters and search; the schedule; milestones; the e-mails tab; a loop refused in words; the customer's overview, project, task and the answer form with its errors, the confirmation receiving focus, the review, a new answer, acceptance and the progress that follows; every page and API answer searched for private marker words; another customer's "not found"; Hungarian and Dutch end to end including the e-mails; no sideways scroll on any screen.

## What went wrong on the way, and what it led to (so it is not hidden)

* **A real bug, found by a test:** erasing a customer failed because the "answers are immutable" trigger also fired on the foreign key's own `SET NULL`. The trigger now protects only the columns that *are* the answer.
* **A real layout bug, found by the journey:** the board's visually hidden button labels were absolutely positioned outside the scrolling box and widened the whole page. The scrolling boxes are now their own containing block, and every scroll box in the work sits in a grid column that may shrink.
* **A behaviour I would have changed silently:** completing a milestone had always been silent; my first version e-mailed it by default. The earlier portal journey caught it (a second e-mail to a newly invited customer). It is now an **off-by-default** choice.
* The house rule "no SQL built from a value" failed on a dynamic `UPDATE`; it is now one fixed statement. A locale tag outside the site's three, a Dutch compound the dictionary does not know, and a "delivered" word without the provider's confirmation were caught by the language checks and fixed. Two heading levels skipped (axe `heading-order`) were fixed.
* The earlier portal journey once failed two checks at 390 px on a server already used for a 1440 px run, and did not on the next run; **I did not find the cause** and it did not recur in the final runs (29 of 29 at both widths). If it happens again it deserves a look.
* A first run of my own journey failed on timing (a check read the board before it had reloaded); the check now waits for the move to show.

## What was **not** verified

* Anything in production, with a real provider, real DNS, real mail clients, a real customer, or a copy of the production database (the upgrade was tested on 0012's schema with test data).
* Screen readers and other assistive technology used by a person; only axe and keyboard operation by script.
* Native-speaker quality of the HU / EN / NL texts and e-mails.
* Load, a penetration test, the rate limits of the new customer endpoints (they use the portal's existing limit; the journeys run with `RATE_LIMITS=false`).
* A cross-project "my tasks" screen: the API (`/api/admin/work/tasks`, filter `assignee=me`) exists and is tested, but the administration has **no screen** for it yet.
* Behaviour with thousands of tasks in one project (not the design target).
