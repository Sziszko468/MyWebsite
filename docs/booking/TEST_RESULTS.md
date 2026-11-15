# Consultation booking: test results

Date: 2026-11-14. Branch `feature/consultation-booking`, cut from `feature/localization-quality-engine` at `ce5a2e9`. Everything below was **actually executed** on one Windows 11 PC (Node 22.23.1, vitest 5.0.5, Chrome from the system install driven by Playwright, an emulated 390 px touch phone). Every database was a throw-away (`:memory:`, a temporary file, or a scratch folder); the e-mail provider was the in-memory `RecordingMailer` or the `file` provider (no message left the machine, every address ends in `.test` or `example.com`); nothing was deployed and no production setting was touched. Where a run failed first, it says so.

## Static checks and the test suite

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, no error |
| `npx oxlint` | exit 0, no finding |
| `npx vitest run` | **120 files, 2,532 tests, all passed** (PROMPT 23 ended at 114 files and 2,412: +6 files, +120 tests, listed below) |
| `npm run i18n` | 3,010 texts × 3 languages from 68 sources (was 2,738 from 65); **0 errors, 0 warnings**; spelling checked with Hunspell: HU 4,645, EN 2,296, NL 2,905 distinct words, **0 not found** |
| `npm run build` (with `VITE_API_URL=/`, `VITE_SITE_URL=https://example.test`) | exit 0; 100 prerendered pages (was 94: the booking page and the customer's page in three languages) |
| `npm run check:seo` | ok: 101 files, 82 indexable, 19 noindex (the three booking pages are indexable, the three customer pages noindex), sitemap, hreflang reciprocity, canonicals, structured data and headers verified |
| `npm audit` | 0 vulnerabilities |

### The new tests

| File | Tests | What it proves |
| --- | --- | --- |
| `server/test/bookingAvailability.test.ts` | 29 | calendar dates; time zones; **the day the clocks go forward (a time that does not exist is a gap) and back (a time that exists twice is ambiguous)** in Budapest and New York; weekly hours, per-type hours, overlapping windows, closures, one-off openings; booked and held time, **buffer both sides**, minimum notice, horizon in local days; **daylight saving inside the engine** (no 02:xx on 28 March 2027; the repeated 02:00 twice and flagged on 31 October 2027; 09:00 is a different instant on each side of a change); another zone; a window edge in the skipped hour |
| `server/test/booking.test.ts` | 28 | **closed until the owner opens it** (the four suggested types are off, without a length, without hours; nothing offered, the server refuses); a type cannot be switched on without a length or all three languages; booking cannot open without a zone; opens only when everything is in place; a type is offered only in a language it has words in; **creation** (UTC, zone, receipt without personal data, one history line, e-mail in each language with the zone named, manual confirmation, the field errors, every kind of refused time, **idempotency** by body and by header, one address's three-booking limit, the hidden field, the link limit); public privacy (free slots only; fully booked vs closed; range limits; errors without internals); **concurrency** (ten simultaneous requests for one slot → one `201`; overlapping slots of a 90-minute type; the buffer; **the database trigger itself refuses overlapping rows written with SQL**; cancelling frees the time); **abuse** (six per 15 minutes then `429` with `Retry-After`; no route opens anything for a reference, an id or an address); **the state machine** (the table pinned, the arrows refused through the administration, closing only after the start, a final state is final, the history cannot be edited and holds no person) |
| `server/test/bookingChanges.test.ts` | 24 | **the secure link** (shows only the customer's own booking, no notes, `no-store`; unknown and malformed answer alike and a guesser is made to wait; a link opens exactly one booking and a quotation's link opens none; only a hash is stored and **the secret is in no log line**; revoked and expired links say so, and a later e-mail carries a working one); **a customer asks to cancel** (waits for the owner, a second request is refused, granted → cancelled and the time is free, declined with a message the customer receives, approval switched off → at once, withdrawn, not offered when disabled or too close); **a customer asks to move** (the new time is held, the booking stays; approved → one appointment at the new time, old time free; declined and withdrawn restore it and free the hold; refused times; **two customers asking for one time → one is told it is taken**; approval off); **the owner proposes** (the booking stays until accepted, accepted, declined, **lapses unanswered and goes back**, moves at once when no confirmation is needed, only offered times, one open change at a time, no proposal without a link) |
| `server/test/bookingAdmin.test.ts` | 21 | nobody without a session sees or changes anything; CSRF is required; an editor works with bookings but cannot change the owner's hours, types or settings; the audit log holds the reference and no personal text; the list searches, filters, sorts and pages (a `%` is a character); the detail shows history, notes, e-mail state and the **quote request matched only because the address is the same**; **private notes are in no e-mail and no customer page**; e-mails escape `<script>`, `<img onerror>`, `"><svg onload>`; a list with one mistake changes nothing; **a one-off time that does not exist or exists twice is refused** (`nonexistentTime`, `ambiguousTime`); closures, openings and per-type hours through the API; the day the clocks go forward and back **through the API and the e-mail** (03:00 CEST); an offset-bearing time is accepted as the instant it is; the two e-mail switches; no provider → still books; one address is not written to without end; **erasure by address** and **retention by age** (a live booking is never deleted by age) |
| `server/test/bookingProcess.test.ts` | 1 | **two real server processes on one database file, eight simultaneous bookings for one slot → exactly one succeeds** |
| `src/booking/booking.test.ts` | 17 | the visitor page's calendar and date helpers (month layout Monday first; DST-proof calendar arithmetic; every instant shown in the **owner's** zone whatever the browser's; the repeated hour told apart by the zone's short name; the zone named); the pages in the registry (listed vs private; the secret resolves to the private page; the language switch keeps the secret); a title and description in each language; the headers a static host needs for a booking link; the analytics allow-list for the new events; **the secret is stripped from the analytics page path** |

Existing tests changed because the change was additive: `dashboard.test.ts` (two more notification types and two more preference keys), `reliability.test.ts` (`bookings` in the erasure result), `security.test.ts` (one more rate limiter), `admin/i18n.test.ts` (the booking e-mail *states* may be called "Delivered": they are names of states).

## Real-browser journey: `tools/e2e/booking-journey.cjs`

A fresh scratch backend per run serving the built site (one origin), the `file` e-mail provider read back, `RATE_LIMITS=false` (the limit of six bookings per 15 minutes is the point of the limit; the journey makes more).

| Run | Result |
| --- | --- |
| 1440 × 1000 desktop, parts A–H | **40/40** |
| 390 × 844 touch phone, parts A–H | **40/40** |

Parts: **A** closed until opened (three languages: no calendar, not indexed, not in the sitemap, the server refuses) · **B** the owner opens booking through the administration's own screens · **C** a visitor books in Hungarian, English and Dutch (type, day, time, details, review, confirmation; the e-mail in the same language with the zone and a secure link; the owner told once; no script error) · **D** invalid data in each language with the first problem focused, a double click (one booking, one e-mail), a time taken first (kind refusal, back to the time step, the loser e-mailed nothing) · **E** the customer's page (not cached, not indexed; a made-up secret; move request; withdraw; cancel request) · **F** the administration answers (list and search; decline with a message the customer receives; a private note found in no e-mail and no customer page; propose a time the customer accepts; cancel the Dutch booking with a message) · **G** the contact page and the shop lead to booking in each language, the sitemap lists the page · **H** axe (WCAG 2.2 AA + best practice): **no violation** on the type, calendar, times, the form with errors and the review in all three languages, the customer's page, and the administration's list, detail and three set-up tabs.

Regression journeys, run on the final build (the outbox, templates, settings, footer and shop pages were touched): `quote-lifecycle-journey.cjs` **33/33** steps; `journeys.cjs` (recruiter, client, administrator, phone, hidden screen, messages in three languages) **72/72**.

## Honest history: what failed first, and what it was

* **A real bug, found by a unit test, not by a journey:** the page's `instantClock(…, zoneName = true)` combined `timeStyle` with `timeZoneName`, which the platform refuses (`Invalid option`). That path is used only on the day the clocks go back (the repeated hour), so no journey touches it, and the page would have thrown there. Fixed (explicit fields) and pinned by a test.
* **Found by axe and fixed:** a complementary landmark nested inside the page's own section (it is a plain group now); and on a phone, the finished steps in the step bar were buttons with no name (the names were `display: none`; they are visually hidden now).
* **Found by reading the first run:** the number of booking attempts a journey makes exceeds the booking limit (`429`, the page said so in the visitor's language); the journey now runs with `RATE_LIMITS=false`, as the quote journeys do.
* **Journey harness, not the site:** a focus check that ran before the next frame; a "double click" written as two `click()` calls (one waited out its timeout), now a real `dblclick`; a reschedule to the booking's own time (422, correctly) chosen by position; a search field matched twice by label; the shared notes component's own label.
* **Server tests first written wrong:** a closed system answers `409 closed` (not 404) to a booking; an administrator's session idles out when the test clock jumps two days; Hungarian writes the hour as `9:00`; after the clocks go forward 03:00 is `CEST`.
* The existing assertions of five tests were updated for the additive changes listed above.

## Not run, and what that means

* **Other browsers** (Safari, Firefox), **a tablet width** (768 px), and **real devices or a screen reader**: not tested. Keyboard operation of the calendar (arrow keys, Home/End, Page Up/Down) is implemented and axe-clean but was not driven by hand-written keyboard tests.
* **The repeated-hour day in a browser:** covered by the engine tests, the API tests and the formatting unit test, not by a journey (the server clock cannot be moved in a journey).
* **A real e-mail provider, DNS, SPF/DKIM/DMARC, the production host, Cloudflare, Render:** not touched; nothing was deployed. The e-mails were verified through the recording and `file` providers only.
* **Other journeys** (`localization-journey`, `shop*-journey`, `cms*-journey`, the nine-width Shop layout matrix, `audit-shop-languages`): not re-run for this change.
* **Load**: concurrency was tested with 8–10 simultaneous requests, not at volume.
* **The administration's Hungarian and English words** are held to parity and placeholders only (like the rest of the administration's dictionaries), not spell-checked.
* **Native proofreading** of the new Hungarian, Dutch and English texts, and **legal review** of the consent sentence, the privacy notice and any cancellation rule: not done (see [SECURITY.md](SECURITY.md)).
* `npm run check:seo` and the build ran with the placeholder site address `https://example.test`, not the real one.

---

# PROMPT 24.1: privacy, booking SEO and launch readiness

Date: 2026-11-15. Branch `feature/booking-launch-readiness`, cut from `feature/consultation-booking` at `46d4652`. Same machine and the same rules as above: everything **actually executed** on one Windows 11 PC (Node 22.23.1, vitest 5.0.5, Chrome driven by Playwright), throw-away databases, the recording or `file` e-mail provider, nothing deployed, no production setting read or changed, no real e-mail sent. **None of this is a production verification.**

## Static checks and the suite

| Command | Result |
| --- | --- |
| `npx tsc -b` | exit 0, no error |
| `npx oxlint` | exit 0, no finding |
| `npx vitest run` | **123 files, 2,575 tests, all passed** (PROMPT 24 ended at 120 files and 2,532 tests: **+3 files, +43 tests**, listed below) |
| `npm run i18n` | 3,026 texts × 3 languages from 68 sources (was 3,010); **0 errors, 0 warnings**; Hunspell: HU 4,789, EN 2,328, NL 2,950 distinct words, **0 not found** |
| `npm run build` (with `VITE_API_URL=/`, `VITE_SITE_URL=https://example.test`) | exit 0; 100 prerendered pages |
| `npm run check:seo` | ok: 101 files, 82 indexable, 19 noindex, with the new booking checks below |
| `npm audit` | 0 vulnerabilities |

### The new and changed tests

| File | Tests | What it proves |
| --- | --- | --- |
| `server/test/bookingSeo.test.ts` (new) | 10 | **Closed**: the consultation page answers `X-Robots-Tag: noindex` in every language and is not in the live sitemap, while the rest of the sitemap is passed on; nothing is offered (no types, no zone) and a booking is refused; configured-but-switched-off is closed too. **Open**: no header against the page; listed in every language with the alternates the build wrote; closing booking again withdraws it at once and opening restores it; **a language without words closes all three** (the page and the sitemap ask one question). **The customer's page**, with booking closed and open: the same shell for a real and a made-up secret (status, body and headers identical), `no-store`, `noindex, nofollow`, `no-referrer`, no secret and no address in any log line, never in a sitemap; an address that cannot be a secret is 404 |
| `src/booking/seo.test.ts` (new) | 13 | The public page is indexable with its own canonical address, four alternates and `x-default`, a title and description of its own per language, in the sitemap the build writes; the closed head (what the page switches to) says `noindex, follow` with no canonical address, alternates or structured data; everything is `noindex, nofollow` while the site address is not configured; `robots.txt` hides nothing. **The customer's page**: a private page whatever the secret; `noindex, nofollow` with no canonical, alternates or JSON-LD in every language and in the file the build writes; no sitemap entry; a head that cannot hold the secret (the head code never reads the address). **Measurement**: an event sent from the private page, in each language, carries `/consultation/booking` and not the secret (the real tracker, with a stubbed window); the tracker reads the pathname only |
| `server/test/bookingPrivacy.test.ts` (new) | 6 | **Retention**: with no period set, 400 days pass and no booking, e-mail line, inquiry or quote request is deleted, but the link fingerprints that expired more than a month ago are forgotten; with a period, cancelled, completed and no-show bookings go with the old e-mail log and a live booking stays however old. **Erasure**: after it, **every row of every table** is read as text and holds none of the name, address, company, website, description, the customer's reason, the owner's private note or the link (the history lines stay, with the reference only; somebody else's booking is untouched). **The fingerprint**: 32 hex characters, equal to the keyed hash with the server secret, not the plain SHA-256, not another key's, not the address, and in no administration view, customer page, e-mail or log line. **"Accepted"**: both booking e-mails end `accepted`, none `delivered`; the owner's note is the only text on a message row and the log has no subject or body column |
| `src/content/privacy.test.ts` (extended) | 21 (was 7) | Each kind of booking data is described in each language, in the same order; **every column of the `bookings` table is accounted for**; no digit in the booking and recipient sections (no invented period); the sentences on retention, erasure, private notes, link fingerprints and "accepted is not arrived" are held to the code (`config.ts`, `maintenance.ts`, `retention.ts`, `main.ts`, `repository.ts`, `notifier.ts`, `webhook.ts`); the only server files that call the erasure or read the notes table are the expected ones; no legal basis, agreement, certification, guarantee, encryption claim or named e-mail provider; Cloudflare is never tied to e-mail and Google Drive appears only as "if the owner switched backups on"; the assistant's code never mentions bookings; the booking code writes nothing to browser storage; the page description no longer says "no cookies". The existing browser-storage, cookie and "no promises" tests pass unchanged |
| `src/seo/seo.test.ts` (one assertion changed) | 46 | The rule "a page that is not indexable says `noindex, follow`" now has one exception, tested: a customer's private page says `noindex, nofollow` |

**The tests were attacked to see whether they fail.** Three rules were broken in turn in a scratch copy and restored: `isPrivatePage` always false (3 SEO tests failed), `consultationIndexable` always true (4 server tests failed), and the retention purge widened to `confirmed` bookings (the code-reading test and the behaviour test failed). Likewise, the `check:seo` additions failed when the private page's `robots` and a `_headers` block were altered in `dist/`, and passed again after the build was restored.

### What `check:seo` now also checks

For each language: the consultation page and the customer shell exist; the public page is indexable by design (canonical address, three alternates and `x-default`, listed in the built sitemap); the customer shell says exactly `noindex, nofollow` with no canonical, alternate or structured data; `_headers` sends `no-store`, `no-referrer` and `noindex, nofollow` for `/<lang>/consultation/booking/*`; `_redirects` answers it with the quiet shell; and the sitemap never lists a customer page.

## Browser journeys

A fresh scratch backend per run serving the built site, `RATE_LIMITS=false`, the `file` provider read back, axe (WCAG 2.2 AA and best practice).

| Run | Result |
| --- | --- |
| `booking-journey.cjs`, 1440 × 1000, parts A–I | **46/46** (the 40 of PROMPT 24, one new step in G, five in I) |
| `booking-journey.cjs`, 390 × 844 touch phone, parts A–I | **46/46** |
| `journeys.cjs` (recruiter, client, administrator, phone, hidden screen, messages in three languages) | **72/72** |
| `localization-journey.cjs` (29 pages × 3 languages on desktop and phone, switcher, country, saved choice; against two backends) | **37/37** |
| `quote-lifecycle-journey.cjs` (the quotation page's robots meta changed in this work) | **33/33** |

Parts added to the booking journey: **A** (the closed page's own head says `noindex`, no canonical address, no alternates, in three languages); **G** (the open page: no header against it, `index, follow`, its own canonical address, four alternates); **I** (the customer's page is `noindex, nofollow` in the header and the head, `no-store`, `no-referrer`, no canonical, a title and head without the secret; changing the language and reloading send the secret to **no other host** and it is in no storage or cookie; the privacy notice in each language has the booking and recipients sections with the same facts, no number, no horizontal scroll, no script error and **no axe violation**). A step in part E that could never fail (`… || true`) was removed rather than kept.

`tools/audit/seo-browser.cjs` (every built page under the real CSP; the head the build wrote must equal the head after the app ran): **with a backend-less build, which is what it expects, 2 problems, both unrelated to this work and not compared with a build from before it**: the root address does not move on to `/hu/` (the audit predates English being the fallback language), and a CSP `script-src eval` violation in the assistant's `PlanPanel` chunk. With the `VITE_API_URL=/` build the journeys use, it reports 145 problems of two kinds only: the case-study pages `spendly` and `bookinghub` become "page not found" because the static server it uses answers the API's requests with 404, and the console shows those 404s. **None concerns the consultation, privacy, quote or request pages**, which were among the 88 pages checked.

## Honest history: what failed first

* A first heredoc-based patch for the journey failed to parse (an apostrophe inside it); the patch was written as a file instead.
* **Tests written wrong, then fixed**: the closed refusal's reason is in `error.details.reason` (`conflict` is the code); the build's no-script language links contain `hreflang` (the check now looks for `rel="alternate"` and JSON-LD in the head); the address fingerprint is 32 hex characters (128 bits of the HMAC), not 64; the e-mail log is cleaned by age **whatever the booking's state** (the live booking's old lines go with the others, and the test now says so); the table reader's file list excludes the `.sql` migration; the templates' own header comment contains the word "notes" (comments are now stripped before that check).
* **Wording the tooling caught**: Hunspell did not know "Render" and "Drive" (added to the names list: brand names), the Hungarian compound "Drive-fiókjába" (rephrased) and the Dutch "taalcookie" (rephrased).
* **Found by the privacy test, not by reading**: the notice had to mention the submission key and fingerprint (`request_hash`) the booking stores against a double click; it now does.

## Not run, and what that means

* **Everything on the production host**: Render and Cloudflare dashboards, DNS (SPF, DKIM, DMARC), a real e-mail provider and mailbox, the persistent disk, `TRUST_PROXY`, response headers on the live domain, the migration on a copy of production data. All are listed with a status in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md); none is claimed.
* **Other browsers** (Safari, Firefox), **a tablet width**, **real devices and a screen reader**; the repeated-hour day in a browser; hand-driven keyboard tests of the calendar (as above).
* **`shop*`, `cms*` and `ai-journey` journeys, the nine-width layout matrix**: not re-run; this work did not touch them.
* **Native proofreading** of the new notice text in three languages, and **legal review** of everything the notice says or does not say: not done. The tests prove the notice matches the code; they cannot prove it is sufficient.
* The seo-browser audit was not compared with a build from before this work (see above).
