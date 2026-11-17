# Test results

Everything below was **actually run** on 17 November 2026 on the machine this was built on (Windows 11, Node 22.23.1, vitest 5.0.5, Playwright 1.63.0 driving the installed Google Chrome, axe-core 4.11.1), on the branch `feature/client-communication` before it was committed. Nothing was run against production, a real e-mail provider, real DNS or real customer data. What was **not** verified is listed at the end and is as important as what was.

## Commands and results

| What | Command | Result |
| --- | --- | --- |
| Type check | `npx tsc -b` | exit 0, no output |
| Lint | `npx oxlint` | exit 0, no output |
| Words: structure | `npm run i18n:check` | **OK**: 3810 texts × 3 languages from 77 sources, 0 errors, 0 warnings |
| Words: spelling | `npm run i18n:validate` | **OK**: Hunspell found 0 unknown words (Hungarian 5249, English 2396, Dutch 3065 distinct words checked), 0 errors, 0 warnings. The Hunspell packages are installed with `--no-save`, as for the earlier prompts; `package.json` is unchanged. |
| Whole test suite | `npx vitest run` | **151 files, 3033 tests, all passing** (96 s). The base branch had 144 files and 2952 tests; the difference (+7 files, +81 tests) is exactly this feature's tests. |
| Production build | `npm run build` (default environment) | exit 0: 103 pages, sitemap, robots, `_headers` |
| SEO / head / sitemap | `npm run check:seo` | **OK**: 104 files, 82 indexable, 22 noindex; sitemap, hreflang reciprocity, canonicals, structured data and headers verified |
| Dependencies | `npm audit` | **0 vulnerabilities** (no dependency was added) |

Of the 3810 texts, 3806 are complete in all languages; the other four are `tri('', '', '')` placeholders that were already there (the shop's and the quotes' empty values), none from this feature.

### The tests this feature added (81, all in the full run above)

| File | Tests | What they cover |
| --- | ---: | --- |
| `server/test/communicationsCore.test.ts` | 14 | starting; contexts (a record of the customer's own, nothing else); validation; the ten-waiting cap; the status machine in each direction; announcements and notes change nothing; status by hand, stale and same status refused; resolved reopened by a message, archived refusing; the resolution request; confirmation of an announcement; removing and editing; the same send twice; concurrent sends in strict order; activity feeds are read only |
| `server/test/communicationsReadSearch.test.ts` | 12 | read markers (opening marks nothing; only what was drawn; clamped; never backwards; per administrator; never someone else's); what is never unread; the customer's and the owner's search, wildcards as text, hostile text answered as text; cursor paging; the owner's filters |
| `server/test/communicationsNotifications.test.ts` | 12 | one e-mail per wait, not per message; the owner's side; announcements and important messages; resolution and request; the owner's switches and the customer's own choices; a switched-off customer; Hungarian, English and Dutch; **no word of what was written in the e-mail, the outbox or any log line**; once per line; nothing queued and nothing failing without e-mail configured; erasure |
| `server/test/communicationsEvents.test.ts` | 8 | project, deliverable, booking and quote events mirrored once, only for a linked customer; lines the customer may not see, unlisted facts and old lines never shown; the same line again changes nothing; **a failing mirror never undoes the real action** (the table is broken on purpose); events never unread and never change a status; events inline in a project's conversation |
| `server/test/communicationsSecurity.test.ts` | 16 | strangers and the wrong kind of session; CSRF and cross-site; mass assignment; ownership on every address (another customer's conversation is the same answer as a missing one); **private notes and removed words in no customer answer**; no-store and no CORS; markup, scripts and SQL as plain text; size limits; the send and search rate limits; a stale status; immutability of messages; what each kind of message can be (database CHECKs); fixed ownership and one feed per customer and project; the lists in the code equal the lists in the migration; **the upgrade from schema 0014 keeps every row, creates nothing for anybody, and keeps the outbox's ids** |
| `src/components/portal/MessagesViews.test.ts` | 11 | the customer's inbox card and conversation rendered on the server: the state in words, unread, text never run as markup, removed messages without their words, events in their own words, announcements and important messages marked, no composer in an archived conversation or a feed, the resolution request, earlier messages and the link to what it is about; **a sentence for every system event the server can write in all three languages, with no placeholder left**; a moment written in the zone it names |
| `src/admin/pages/CommunicationPage.test.ts` | 8 | the owner's timeline: the customer's and the owner's words apart, a private note in its own look with the words *the customer never sees it*, removal and editing offered for the owner's own only, a removed message without its words, announcements and events; the English and Hungarian dictionaries have the same keys, texts and placeholders, are in the navigation, and name the same events, switches and refusals as the server |

`server/test/security.test.ts` was changed (not weakened): the limiter-size test used a hard-coded number of limiters and now derives it from the list, so two new limits do not break it.

## The browser journey

`tools/e2e/communication-journey.cjs`, **25 checks** (parts A–G, see `tools/e2e/README.md`): the owner's and the customers' screens in real Chrome, against the built site served by the real backend (one process, a fresh throw-away database per run, the `file` e-mail provider, every address `.test`), with **axe (WCAG 2.2 AA and best practice) and the layout checks on every screen** and the browser console watched. Each run is against a fresh server.

| Combination | Result |
| --- | --- |
| 1440 px, light | ALL OK: 25 passed, 0 failed |
| 1024 px, light | ALL OK: 25 passed, 0 failed |
| 768 px, light | ALL OK: 25 passed, 0 failed |
| 390 px, light | ALL OK: 25 passed, 0 failed |
| 320 px, light | ALL OK: 25 passed, 0 failed |
| 1440 px, dark | ALL OK: 25 passed, 0 failed |
| 390 px, dark, reduced motion | ALL OK: 25 passed, 0 failed |
| 1440 px, light, reduced motion | ALL OK: 25 passed, 0 failed |

That is the **final** matrix, run on the final build with nothing else running. Getting there:

* **A defect in the portal was found by the matrix and fixed**: at 390 px in the dark theme axe reported a colour contrast of 1.25 on the portal's current-page menu link. The hover rule of the shared `hover` mixin is more specific than the current-page rule, so under the mouse pointer the link lost its accent background and kept the dark text made for it. It is a pre-existing defect of the portal menu (it would show for any page in a narrow window with a mouse); the fix is a few lines in `Portal.module.scss`, and the rerun passed.
* **A test race was found and fixed**: at 768 px one check read the list's rows before the filter's reload had replaced the old ones; it now waits for the expected count.
* **Two mishaps of my own, for the record**: a build made without `MSYS_NO_PATHCONV=1` had a broken API address (every journey then stopped at the customer's sign-in), and stopping a background matrix did not stop its shell loop, which then ran a second journey on the same port and contaminated some results. Both were found from the evidence (the page said it was not connected to the server; the server log ended mid-run with no error; a "fresh" server held other runs' conversations), the leftover processes were stopped, and the whole matrix was run again alone. The table above is that clean run.

### Regression: the earlier journeys on the same code

| Journey | Result |
| --- | --- |
| `portal-journey.cjs` (client portal) at 1440 and 390 | 29 passed, 0 failed (each) |
| `work-journey.cjs` (project management) at 1440 and 390 | 24 passed, 0 failed (each) |
| `feedback-journey.cjs` (feedback and approval; built with the preview origin it needs) at 1440 and 390 | ALL OK: 30 passed, 0 failed (each) |

The other earlier journeys (booking, quotes, shop, lab, CMS, AI, localization) were **not** rerun; the whole vitest suite covering them passed.

## Mutation checks

To see whether the tests would notice a broken rule, 14 rules were broken one at a time in the source (the file restored from memory after each and compared byte for byte), and only the tests that are meant to guard that rule were run. A mutant is *killed* if a test fails.

| # | Rule broken | Result |
| --- | --- | --- |
| M1 | the customer's timeline stops filtering on visibility (private notes would show) | killed |
| M2 | a customer can open any conversation by its reference (no ownership check) | killed |
| M3 | the customer's search also reads private notes | killed |
| M4 | every message e-mails the other side, not only the one that starts a wait | killed |
| M5 | a system event is no longer one per source line (idempotency) | killed |
| M6 | a read marker may claim more than exists or than the reader can see | killed |
| M7 | an announcement goes without the owner's confirmation | **survived alone**; **killed** when both layers (the body reading and the service rule) were removed together. The rule is deliberately guarded twice; the second layer is the last line. |
| M8 | the owner can remove a customer's message | killed |
| M9 | the customer's own messages count as unread for them | killed |
| M10 | the wildcards of a search are not escaped | killed |
| M11 | the customer's e-mail choices are ignored | killed |
| M12 | a customer's message does not make the thread wait for the owner | killed |
| M13 | writing needs only the reading permission (`clients:read` instead of `clients:projects`) | **survived**: an *equivalent mutant today*. The only two roles (administrator, editor) both hold both permissions, so no test can tell the two checks apart without inventing a role. The split is in the code for a future read-only role; it is **not tested** and is not claimed as tested. |
| M14 | the settings need only `clients:read` instead of `system:write` | killed |

## Not verified (and therefore not claimed)

* **No real e-mail** was sent or received; the six e-mails were rendered and read from files, never viewed in a mail program, and no provider, sender domain, SPF/DKIM/DMARC or webhook was touched.
* **No production**: no real database was migrated (only a populated test database upgraded from schema 0014 in a test), no Render, Cloudflare or DNS setting was seen or changed, no real customer data existed or was read, and the live security headers of the new addresses were not checked.
* **Browsers and devices**: only Chrome (driven by Playwright). Not Safari, Firefox, a real phone, or a real touch screen.
* **Accessibility**: automated (axe, with WCAG 2.2 AA and best-practice rules) and keyboard-driven checks of the filters, the search and the preferences in the journey. **No person has used it with a screen reader**, and axe finds only part of what a human review would.
* **Language**: no native-speaker review of the Hungarian or Dutch; the English was not independently proofread either.
* **Load and timing**: no load test, no many-thousand-conversation test, no timing or enumeration measurement.
* **Security**: no penetration test and no independent review. The measures are proven only as far as the tests above assert them.
* **The deployment branch** was only *read* (its migration list and `0030`); the feature was not run on it.
* The restore of a backup after migration `0015` is documented but **was not drilled** here.
