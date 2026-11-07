# The administration (`src/admin/`, served at `/admin`)

A dashboard for the one person (or two) who run the website: read the messages and quote requests that arrive, move them along, write notes, keep the offering (services, packages, add-ons, FAQ) and its Hungarian, English and Dutch texts up to date, see whether e-mail works, and manage their own sign-in. It sits **on top of the backend in `server/`** ([docs/backend/README.md](../backend/README.md)): same process, same database, same accounts. It adds no second backend, no CMS and no new runtime dependency.

Contents: 1 Quick start · 2 Information architecture · 3 What each screen does · 4 How it is built · 5 Endpoints (reused and new) · 6 Database changes · 7 Security · 8 Accessibility and responsive behaviour · 9 Tests and what they showed · 10 What is not there, on purpose or for lack of an answer

## 1. Quick start

Development (two terminals):

```bash
npm run server:dev                      # the backend on 127.0.0.1:8787 (creates the database, loads the catalogue)
npm run server:admin create you@example.com admin   # once: asks for a password (12+ characters)
npm run dev                             # the website and the administration on http://localhost:5173
```

Open `http://localhost:5173/admin`. Vite forwards `/api/*` to the backend (if it listens elsewhere, start the dev server with `API_PROXY_TARGET=http://127.0.0.1:9000` in its environment) and answers `/admin/*` with the administration's page, so the browser sees one origin, exactly as in production.

Production: `npm run build` writes the website **and** the administration (`dist/admin.html`, `dist/assets/admin-*.js|css`); set `STATIC_DIR` to `dist/` and the backend serves `/admin` and everything below it. The administration must be served **by the same origin as the API** (that is how the session cookie, the CSRF check and the Content-Security-Policy stay simple: there is no CORS for the administration and none is ever sent). A website hosted elsewhere keeps working: the administration does not depend on it.

Languages of the interface: **Hungarian and English** (the owner's two languages; the website's Dutch is for visitors). The choice is the account's saved preference, else the browser's language, else English. Light and dark theme follow the system until the administrator picks one.

## 2. Information architecture

| Place | Route | Phone bottom bar | What it is for |
| --- | --- | :-: | --- |
| Dashboard (Áttekintés) | `/admin` | ✓ | What needs attention now: real counts, the newest items, quick actions |
| Inquiries (Üzenetek) | `/admin/inquiries`, `/admin/inquiries/:id` | ✓ | The contact form's messages |
| Quote requests (Ajánlatkérések) | `/admin/quotes`, `/admin/quotes/:id` | ✓ | The quote builder's requests |
| Package comparison (Csomag-összehasonlítás) | `/admin/comparison` | More | The tier comparison of the shop (PROMPT 09.1, [`../shop/README.md`](../shop/README.md)): each tier's label and the package it builds on, and the feature grid (what each package has) |
| FULL EXPERIENCE | `/admin/full-experience` | More | The flagship offer: copy, stages, components, the configurator's questions and options (the budget ranges), FAQ, with a draft and an explicit publish |
| Services & packages (Szolgáltatások és csomagok) | `/admin/services`, `/admin/services/{service,package,extra}/:key`, `/admin/services/new/{service,package,extra}` | ✓ | Services, packages, add-ons: texts in three languages, price, availability, order |
| Website content (Weboldal-tartalom) | `/admin/content`, `/admin/content/faq/:slug`, `/admin/content/new` | More | The FAQ (the only content the website reads from the backend) |
| Translations (Fordítások) | `/admin/translations` | More | Every translated field by language, what is missing, edited in place |
| Notifications (Értesítések) | `/admin/notifications` | More | Whether e-mail is configured, which messages are sent, the delivery log |
| Settings (Beállítások) | `/admin/settings` (`?tab=profile\|preferences\|security\|system`) | More | Profile, language and theme, password and sessions, and (administrator role) the server's state |

There is **no separate Media screen**: pictures are chosen and uploaded inside the project editor (PROMPT 13.1, [`../cms/README.md`](../cms/README.md) §5). The navigation lists only screens that exist (a test holds the list, the routes and the phone bar together).

## 3. What each screen does

**Dashboard.** Counts from the database when the page opens, nothing estimated: inquiries (total and archived, new and how many arrived in the last 7 days, in progress and how many wait for the client), pending quote requests (and how many have been quoted), what is completed or closed, then the latest inquiries and quote requests, the latest catalogue edits and the latest activity, with quick actions. Each number that has a list behind it is a link to that list, already filtered. Loading, empty and failed states are real states of the screen (a skeleton, a sentence and a "try again").

**Inquiries.** Search (name, e-mail, subject, text, reference), status filter (New, In progress, Waiting for the client, Completed, Archived), type, a date range, sort (newest, oldest, name), 25 per page; all of it lives in the address (`?status=new&q=anna&page=2`), so a filtered list can be bookmarked and survives a reload. A row shows who, what about, when, status, and a quick status control. The detail shows the message as it arrived (as text, never as markup), the sender with a `mailto:` link, the quote requests linked to it, **internal notes** (never shown to the sender or on the website; cannot be edited or removed — the history is the point), the **activity history**, and: change status (with an optional "e-mail the sender" box, off by default, and an optional note; the only other e-mail a customer gets is the confirmation, which is off until an administrator turns it on in Notifications), archive/restore, and (admin role) delete for good after a confirmation. Opening the mail program is a link; nothing is sent by the application unless that box is ticked.

**Quote requests.** The same list and detail machinery with the quote statuses (New, In review, Quoted, Accepted, Declined, Closed). The detail shows the items, add-ons and the **price each item was requested at** (as the request recorded it, unchanged), the description, aims, references, requirements and timing, and the inquiry it belongs to (a link; linking is done here). Export: CSV for the current filter (cells that could be read as spreadsheet formulas are neutralised) and JSON for one request. There is no budget field and no invented amount anywhere.

**FULL EXPERIENCE requests** (PROMPT 09.1). A request that came from the flagship configurator is in the same list, marked "FULL EXPERIENCE" where a catalogue request shows its items. Its detail has no items: it shows the **brief** (each question the visitor answered and the options they chose, in the interface language, "Not sure yet" marked as such, from the labels stored when the request was sent, so it still reads right after the questions are edited), the description, the contact and the company; status, notes and activity work as for any request.

**Package comparison** and **FULL EXPERIENCE** (PROMPT 09.1, [`../shop/README.md`](../shop/README.md)). Two editors for the shop's two *documents*. Each keeps a **draft** (Save draft) separate from what visitors see (Publish; Unpublish takes it back to the website's built-in copy, or turns the offer off). A line says whether the document is published as it is, saved but not published, unsaved or not published; a save made on top of someone else's newer save is refused, not merged. Every text is a field per language; lists (features, stages, components, questions, options, FAQ) are reordered with move-up/move-down buttons, never by dragging; the server's errors appear on the field they belong to. Reading needs the quote-requests permission, saving and publishing the catalogue-write one.

**Services & packages.** Three tabs (services, packages, add-ons) of tables that turn into cards on a phone; per row: status (enabled/disabled), edit, move up/down (a full, validated order is sent), delete (admin role; rows that requests refer to are disabled, not deleted — the server says so). The editor has a tab per language with a mark on the tab that is half-finished (empty where another language has text), counters against each field's limit, lists as one item per line, and the price as "on request", "to be decided" or "from" an amount in EUR or HUF with a VAT mode. A published price must be complete; the server checks again and its refusals appear next to the field. **Prices exist only where the owner entered them.**

**Website content.** The FAQ: add, edit (question and answer in three languages), enable/disable, reorder. It is the one content type the website reads from the backend (see §10); the screen says so.

**Projects** (PROMPT 13.1). The portfolio: a list of every project (draft, published, archived) in the order the website shows them, with the state, whether it is featured, whether it has a page of its own, and a mark for each language (*complete*, *incomplete*, *missing*); quick actions per row (edit, preview, feature, publish, unpublish, archive/restore, duplicate, delete, move up/down — each asks before it does anything that hides or deletes). The editor has seven tabs (General, Images, Descriptions, Technical, Sections, Links, Publication) and a language bar; saving writes the draft (incomplete is fine), publishing is a separate confirmed step that the server may refuse with a list of what is missing. *Categories and publishing* sets the Work page's filter categories and the all-languages rule. Details: [`../cms/README.md`](../cms/README.md).

**Website texts** (PROMPT 13.1). The website's own wording that may be changed without code (the home page, the shop's buttons, the request builder's questions and answers): search, group filter, "changed only"; each row shows the original in the three languages and a field per language; an empty field brings the original back; `{placeholders}` must be kept.

**Translations.** Every translated record of services, packages, add-ons and FAQ entries, grouped, with a language chooser, an "only what is missing" filter and a summary of how many fields are missing per language. Each record opens to its texts in the chosen language with the other languages beside them for reference, and one save for what changed, with its own saving/saved/error state. **Nothing is translated automatically.** "Missing" means: empty here, filled in another language.

**Notifications.** The integration's real condition, and only what has been **verified**: provider, whether the sender, the public contact address, the owner address and the webhook secret are *set* (never their values), paused or not; **nine set-up checks** (provider key, sending domain at the provider, DKIM, SPF, DMARC, Cloudflare Email Routing records, the forwarding rule and destination mailbox, the signed webhook, whether sending really works), each the answer to a question put to the provider, the public DNS, Cloudflare (read-only, optional) or the log of real messages, each marked *Verified*, *Not verified*, *Cannot be checked* or *Does not apply*, each with the time it was asked and a plain sentence of what was found (a setting merely being present is never shown as working); a **test e-mail** button; the switches for the owner's notifications **and for the confirmations to the sender (off by default)** and the optional sentence about timing per language; and the **delivery log** with the related inquiry or quote request (a link), recipient, state (Waiting, Retrying, Processing, **Sent**, **Delivered**, Bounced, Marked as spam, Failed, Cancelled), the failure in words and the provider's masked reason, a filter by state or by problems, paging, and **Send again** for a failed message. *Sent* means the provider accepted it; *Delivered* appears only when the provider's signed webhook said so, and with no webhook secret it never does. Full account: [docs/email/README.md](../email/README.md).

**Settings.** *Profile*: e-mail, role and what it allows, last sign-in. *Preferences*: the interface language and theme, saved to the account. *Security*: change the password (the current one is asked; every other session ends) and the list of sessions with the device and last use, with "end" for each (ending the current one asks first and signs you out) and "end all the others". *System* (administrator role): schema version, counters, the e-mail queue, maintenance and publish. No secret ever reaches the browser: the screens show whether something is set, never its value. The two notification switches live on the Notifications screen.

## 4. How it is built

- **A second page of the same Vite project** (`admin.html` → `src/admin/main.tsx`): React 19, `react-router` with `basename="/admin"`, no new dependency. The website's bundle is untouched (a test fails if anything outside `src/admin` imports it, or if the administration imports a website page, the Lab, the shop, analytics or three.js). What the administration page loads: about 463 kB of script (141 kB gzipped; of which 254 kB is the React/theme chunk it shares with the website and 36 kB the shared button) and 44 kB of style (10.5 kB gzipped), against the website's own much larger bundle that it never loads.
- **One design.** The administration uses the website's tokens (`src/styles/tokens.css`), its theme provider (extended with `followSystem`), its `Button` (wrapped as `AdminButton`: sentence case, tighter, a real link when it has `to`) and its focus, spacing and type scale. It adds a few colours in `src/admin/styles/admin.css` (a working green, an amber, a danger red, the brand red for tinted badges), checked for contrast in both themes (`src/admin/tokens.test.ts`).
- **One way to talk to the backend** (`src/admin/api/client.ts`): same-origin `fetch`, the CSRF token in `X-CSRF-Token` on every write, JSON only, every failure turned into one `ApiError`, a 401 anywhere (the session idled out) tells the application once so it returns to the sign-in. Screens never see the server's own wording: they show a sentence in the administrator's language plus the request id for support.
- **State in the address** for every list (`lib/listState.ts`); a `useResource` hook that cancels a request another one overtakes; forms that keep what was typed when the server refuses it.
- **Components** (all in `src/admin/components/`, each used by more than one screen): `AdminSidebar`, `AdminHeader`, `AdminMobileNavigation`, `DashboardStatCard`, `InquiryList`, `QuoteRequestList`, `StatusBadge`, `SearchInput`, `FilterDropdown`, `Pagination`, `DetailPanel`, `InternalNotes`, `ActivityTimeline`, `ConfirmationDialog` (`Confirm.tsx`), `EmptyState`/`LoadingState`/`ErrorState` (`states.tsx`), `ToastNotification` (`Toast.tsx`), plus the form controls, `DataList` (a table from 48 rem up, cards below), `Tabs`, `StatusForm`, `CatalogForm`, `CatalogTable`.
- **Browser storage:** the administration keeps one item of its own, `admin-sidebar` (whether the sidebar is collapsed), and reads/writes the website's `theme` item. Both are the administrator's interface preferences; neither is sent anywhere. (The privacy notice for visitors does not list them: visitors never load the administration, and a test enforces that.)

## 5. Endpoints

**Reused from the backend as they were:** `POST /api/admin/login`, `POST /api/admin/logout`, `GET /api/admin/session`, the quote-request list/detail/export routes, and the catalogue routes `…/services`, `…/packages`, `…/extras`, `…/content` (create, read, replace, delete).

**Extended:** inquiry and quote lists take `q`, `status`, `kind`, `from`, `to`, `archived`, `sort`, `dir`, `page`; both details carry `notes`, `activity` and (for inquiries) the linked `quotes`; quote requests can be linked to an inquiry; the session answer carries the account's language/theme, its permissions and the vocabularies the screens need (statuses, whether e-mail is on).

**New:**

| Route | Does |
| --- | --- |
| `GET /api/admin/dashboard` | The dashboard's counts and recent items |
| `PUT /api/admin/order/:kind` | Saves a new order of services, packages, add-ons or FAQ (the whole list must be sent: a missing or repeated entry is refused) |
| `GET /api/admin/translations` · `PUT /api/admin/translations/:group/:key/:lang` | The translation overview (`?lang=`, `?missing=1`, `?group=`) and a save of one language of one item |
| `GET /api/admin/notifications` (`?status=`, `?page=`) · `PUT …/preferences` · `POST …/deliveries/:id/retry` · `POST …/checks` · `POST …/test` | The integration's real state and log (filtered, paged), the switches and the confirmations' sentence, a retry of a failed delivery, the set-up checks, a test message |
| `GET /api/admin/settings` · `PUT …/settings/preferences` · `POST …/account/password` | Profile, language/theme, password change |
| `GET /api/admin/sessions` · `POST …/sessions/revoke-others` · `DELETE …/sessions/:id` | The account's sign-ins and ending them (by a public id, never the token) |
| `GET/POST /api/admin/projects` · `GET/PUT/PATCH/DELETE …/projects/:id` · `GET …/projects/:id/preview` · `POST …/projects/:id/{duplicate,publish,unpublish,archive,restore}` · `GET/PUT …/project-settings` · `PUT …/project-order` · `GET …/project-preview` | The portfolio (PROMPT 13.1; [`../cms/README.md`](../cms/README.md)) |
| `GET/POST /api/admin/media` · `DELETE …/media/:id` | The picture library: the upload takes the image itself as the request body |
| `GET /api/admin/texts` · `PUT …/texts/:key` | The website's changeable wording |
| `GET/PUT /api/admin/shop/documents/:code` · `POST …/shop/documents/:code/{publish,unpublish}` | The shop's two documents (`comparison`, `full_experience`): the draft and the published copy, saving a draft (`{ document, expectedUpdatedAt }`), publishing and taking it back (PROMPT 09.1) |

Every route needs a session; every write needs the CSRF token and a same-origin request; each is checked for its permission in the business function, not in the route (a test calls every route without a session and with the wrong role). The old server-rendered HTML pages (`/admin/*` as forms) are **gone**: the HTML renderer, its forms and its templates were deleted, and their tests rewritten against the JSON API.

## 6. Database changes

One forward-only migration, `server/src/db/migrations/0002_admin_dashboard.sql` (the runner learned one directive, `-- migration: foreign-keys-off`, for rebuilding a table other tables point to; it checks `foreign_key_check` afterwards):

- `inquiries` rebuilt with the new statuses `new, in_progress, waiting_client, completed` (existing `answered` rows became `waiting_client`, `closed` became `completed`; archiving is the existing `archived_at`); the history still reads right (the activity text maps the old names).
- `quote_requests.inquiry_id` (a nullable link to an inquiry).
- `admin_users.ui_language` and `ui_theme` (the account's choices).
- `admin_sessions.public_id` (a unique, non-secret name for the sessions list).
- `settings` (key/value, for the notification switches).

No data is dropped; rolling back means restoring a backup (§9 of the backend README).

PROMPT 09.1 added `0005_shop_experience.sql`: the `shop_documents` table (the comparison and the FULL EXPERIENCE offer, each a draft and a published JSON) and, on `quote_requests`, `kind` (`catalogue` or `full_experience`), `company` and `brief_json`.

## 7. Security

| Concern | What is done | Where it is tested |
| --- | --- | --- |
| Who may see it | The page itself is public HTML + script with no data in it; every number comes from `/api/admin/*`, which needs a session (HttpOnly, `SameSite=Strict`, hashed at rest, idle and absolute expiry). | `auth`, `admin`, `dashboard` |
| What each role may do | `admin` / `editor`, checked in the business functions; the screens hide what a role cannot do, the server refuses it anyway. | `auth`, `admin` |
| CSRF / cross-site | The session's token on every write + same-origin check (`Sec-Fetch-Site`, `Origin`); no CORS for the administration, ever. | `auth`, `security` |
| XSS | React escapes everything; the message, names, subjects and notes are rendered as text (a hostile `<script>`/`<img onerror>` message is in the test data and shown inertly); the administration's own CSP is `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'` (no inline script or style), plus `no-store` and `noindex`. | `security`, `admin`, `components` |
| Brute force | Per-account lockout and per-address limit on sign-in (seen against the real server during the browser runs: sign-ins beyond ten in 15 minutes got 429, and the audit script now signs in once). | `auth` |
| Secrets | None in the browser; the screens show "set" or "not set". | `security`, `reliability` |
| Audit | Sign-ins, status changes, notes, archives, deletes, catalogue and translation edits, preference and password changes, session endings: who, what, which record, never message text, passwords or tokens. The activity history of a record is read from it. | `admin`, `dashboard` |
| Confirmations | Deleting a record asks first in a modal dialog whose focus starts on the safe button; Escape cancels. | browser matrix |
| Customer e-mail | A status change e-mails the sender only when the box is ticked; the optional confirmation is off until an administrator turns it on (once per submission, at most 3 a day per address, promising nothing); with no provider the box is off and says why. | `admin`, `notifications`, `email` |

## 8. Accessibility and responsive behaviour

Built for the keyboard first: a skip link, one `h1` per screen that takes focus after a navigation, landmarks, labels tied to controls, errors as sentences tied to their field (`aria-describedby`, `aria-invalid`, announced), tabs with arrow/Home/End, native `<dialog>` for confirmations and the phone's "More" sheet (focus moves in, stays in, Escape leaves and focus returns to the control that opened it), on a tablet the sidebar opens as a layer over the page (focus moves into it; Escape closes it and returns focus to the menu button; choosing a place moves focus to the new page's title), toasts in live regions, status shown as a word as well as a colour, targets of at least 24 × 24 px (most 40+), motion off under `prefers-reduced-motion`. Tables scroll inside a labelled, focusable box when they must.

Layout: a sidebar from 1024 px (collapsible to a rail), a rail of icons on tablets that opens as a layer over the page, a bottom bar with the four most used places plus "More" on phones (short labels so they never truncate in Hungarian), lists as tables from 48 rem and as cards below, forms in one column on a phone.

## 9. Tests and what they showed

```bash
npm test                                         # everything (website, backend, administration)
npx vitest run src/admin server                  # the administration and the backend
node tools/audit/audit-admin.cjs --base=… --email=… --password=…   # the real-browser matrix (see tools/audit/README.md)
```

Run on 2026-11-04 (Windows 11, Node 22.23): **1691 passed, 0 failed in 71 files**, of which 422 are the backend (16 files) and 208 the administration's own (6 files); `tsc -b`: clean; `oxlint`: clean; `npm run build`: passes; `check:seo`: ok; `npm audit`: 0 vulnerabilities.

| File | Tests | What it exercises |
| --- | --: | --- |
| `server/test/dashboard.test.ts` | 35 | The dashboard, new statuses and migration of old rows, list filters/sort/paging, linking, activity, order, translations, notifications screen, settings, sessions list, system |
| `server/test/admin.test.ts`, `auth.test.ts`, `security.test.ts`, `notifications.test.ts`, `reliability.test.ts`, `process.test.ts` | 28 · 24 · 33 · 29 · 23 · 11 | The earlier backend suites, rewritten for the JSON-only administration (hostile input shown inertly, every route with no session and the wrong role, CSRF, headers, retries, a real process serving `/admin`) |
| `server/test/admin-contract.test.ts` | 39 | The editors' field lists and limits held against the server's parsers: exactly the limit is accepted, one more is "too long", required fields refused empty, in every language |
| `src/admin/api/client.test.ts` | 17 | CSRF header on writes only, no body on delete, error envelope, proxy pages, network failure, abort, the 401 handler |
| `src/admin/i18n/i18n.test.ts` | 15 | Hungarian and English have identical keys and placeholders, nothing empty, nothing left untranslated, no "delivered" claims |
| `src/admin/lib/lib.test.ts` | 39 | List state in the address, `mailto` against header injection, error sentences, activity text, navigation, catalogue form ⇄ save, prices |
| `src/admin/components/components.test.ts` | 34 | Markup of the badges, states (heading levels, alert/status roles), pagination, panels, tabs, the data list, form controls and their ARIA, notes (as text), the timeline |
| `src/admin/tokens.test.ts` | 99 | The administration's colours as text and as tinted badges, on every surface, both themes: AA |
| `src/admin/isolation.test.ts` | 4 | The website never loads the administration; the administration takes only the shared parts |

**Real browser** (`tools/audit/audit-admin.cjs`, system Chrome through Playwright, against a real server with example data, hostile messages included): every screen × 9 viewports (1920×1080, 1440×900, 1366×768, 1024×768, 768×1024, 430×932, 390×844, 360×800, 320×640) × dark/light × Hungarian/English = **540 views** (536 screen views plus the tablet menu with its layer open): no sideways scrolling, nothing outside the viewport, no control under 24 × 24 px, no control without an accessible name, one `h1` per screen, and **axe-core (WCAG 2.0/2.1/2.2 A and AA + best practice): no violations**; the confirmation dialog (focus on the safe button, Tab stays inside, Escape cancels and returns focus, the record still exists) and the phone's "More" sheet behave as described.

**What the browser run found and fixed** (each would have passed every unit test):

- The phone's bottom bar cut "Ajánlatkérések" and "Szolgáltatások" short: short labels added.
- A long hostile subject and long words pushed grids wider than a 320 px screen; links and checkboxes were 20–21 px high.
- The danger button in the delete dialog was red text on a red button (contrast 1.4:1); light-theme "New" badges were 4.33:1.
- Two landmarks had the same name (the notification toasts and a panel); the empty "not found" screen jumped from `h1` to `h3`.
- A table that scrolled sideways could not be reached from the keyboard.
- On a tablet the opened sidebar covered the menu button that had opened it and had no way out of its own; focus also stayed behind it. It now moves focus in, has a close button, and Escape or the button return focus to the menu button.
- The site's own audits caught the administration's skeleton loader (it animated `background-position` and looped under reduced motion): now an opacity pulse that starts only when motion is welcome.

## 10. What is not there, on purpose or for lack of an answer

- **Pictures only, and only inside a project.** There is an upload (PNG, JPEG, WebP, GIF; see [`../cms/README.md`](../cms/README.md) §5) but no general file or media library, no video upload and no document upload.
- **No priority, no budget, no assignee** on inquiries or quote requests: the forms do not collect a budget, and a single owner has nobody to assign to. Nothing was added that would need inventing.
- **"Website content" is the FAQ only.** The rest of the website's wording is edited on **Website texts** (PROMPT 13.1): the existing strings only, in the three languages, never a new string. Which part is editable is said on each screen.
- **Edits to the catalogue reach the website's pages without a build since PROMPT 13.1** (the browser lays the backend's catalogue over the website's own content when it starts; see [`../cms/README.md`](../cms/README.md) §6), **but the `<head>` a search engine reads still comes from the build** (`npm run catalog:pull`, then `npm run build`; the System page's "Publish" calls the deploy hook, if configured). What reaches it and what does not is in the backend README §8: prices, VAT modes, package and add-on texts, `featured`/`quoteRequired`, the services' names, summaries, feature lists, taglines and overviews, the FAQ — **not** which packages, add-ons and services exist, **nor their order on the website**: the order set here changes the API's `position` (and the FAQ's order), not the order of packages and add-ons the website's source defines. Disabling a package refuses requests for it at once but the website keeps offering it until it is removed from its source. The screens say this where it matters.
- **The website's Dutch is edited, not shown:** the interface of the administration itself is Hungarian and English.
- **Notification preferences are two switches** (new inquiry, new quote request) for the one owner address the backend knows (`NOTIFY_TO`); there is no per-administrator address, because the backend has none.
- **Not verified:** a real mail provider (see the backend README), a screen reader (NVDA/VoiceOver/TalkBack: none was used), Firefox and Safari (only Chromium was driven; the CSS uses nothing that is Chromium-only, but it was not looked at there), a real phone or tablet (emulation only), concurrent editing by two administrators (the last save wins, as in the rest of the backend; the server refuses a stale reorder but not a stale text edit), and any load. Contrast is checked by computation and by axe on the rendered pages, not by eye on every state (hover and focus colours of every control were not each measured).
