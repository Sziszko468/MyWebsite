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
