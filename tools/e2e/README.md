# End-to-end journeys and the security probe

Written for the PROMPT 15 integration pass. These run the **built website served by the real backend** (one process, one origin, a throw-away database, the `file` e-mail provider) in a real Chrome, and ask the running server questions over real HTTP. Nothing is mocked and nothing is sent anywhere: the server's "e-mails" are `.eml` files in a folder we read.

They are **not** part of `npm test` and Playwright is **not** a dependency of this project (the same convention as [`tools/audit`](../audit/README.md): a browser download of several hundred MB for a tool most contributors never run). Point `AUDIT_PLAYWRIGHT` at any installation, as the audit README describes. The project's own tests (Vitest: website, backend, administration) are what `npm test` runs.

## Set-up (all of it throw-away)

```bash
# 1. The website, built to talk to the backend on its own origin. On Windows Git Bash `VITE_API_URL=/` is rewritten to a path
#    (`C:/Program Files/Git/`) unless you also set MSYS_NO_PATHCONV=1: the forms then say they cannot send.
MSYS_NO_PATHCONV=1 VITE_API_URL=/ npm run build

# 2. A scratch backend that serves it, with e-mail written to files
export DATABASE_PATH=/tmp/e2e/app.sqlite APP_SECRET=<32+ random characters> APP_ENV=development PORT=8788
export EMAIL_PROVIDER=file EMAIL_FILE_DIR=/tmp/e2e/mail EMAIL_FROM='Controlled Chaos <notifications@example.test>'
export NOTIFY_TO=owner@example.test EMAIL_REPLY_TO=hello@example.test STATIC_DIR="$PWD/dist"
ADMIN_PASSWORD=<a test password> npm run server:cli -- admin create admin@example.test admin
node --disable-warning=ExperimentalWarning server/src/main.ts &
```

## Journeys

```bash
export AUDIT_PLAYWRIGHT=/path/to/node_modules/playwright
node tools/e2e/journeys.cjs --base=http://127.0.0.1:8788 --mail=/tmp/e2e/mail \
     --email=admin@example.test --password=<the test password> [--only=A,B,C,D,E] [--out=<dir>] [--verbose]
```

| Journey | Path | What it asserts |
| --- | --- | --- |
| **A** Recruiter | homepage (first visit) → the intro opens and is entered → About → a project from Selected work → Back/Forward → the contact page | the intro opens once and not again on in-app navigation or a refresh; the language switch keeps the page; the project page names its technology; the contact page offers a way to write; the theme switch flips the page and survives a reload; no console error |
| **B** Client | homepage → Services → a service → a package → cart (survives a refresh) → the six-step request builder → send | no price anywhere on the shop landing; the API answers 201 before the page claims success; the owner's notification is written with the configured sender, the owner as recipient and the **visitor as Reply-To (never as sender)**, as multipart plain + HTML; **no** e-mail goes to the visitor while confirmations are off |
| **C** Administrator | a visitor writes (public form) → wrong password refused → sign in → dashboard → open the message → change status + note → reload (persisted) → delete asks for confirmation (cancelled) → the quote request from B → status + note → the dashboard's numbers are re-counted from the lists → edit a **service description** → the public catalogue API serves it → (`--rebuild --repo=<path>`) `catalog:pull` + a production build put it on the public page | server-side state, not just the screen; the dashboard equals the database per status; the destructive action asks first; the documented "edits reach the website at its next build" really works, including the services' texts |
| **D** Mobile | a 390×844 touch phone: intro → no sideways scroll → the menu (Escape closes) → a project → Services → cart → builder → send | the same path works with touch; nothing overflows |
| **E** Hidden racing experience | the Lab → N F S U 2 (desktop) or a tap on the red full stop (phone) → loading state → the fallback screen → exit → open again → Escape; reduced motion | OPEN NFSU2 is a `target=_blank rel="noopener noreferrer"` link to `https://nfsu2.xyz/`, 48 px tall; no `iframe`; **nothing is requested from nfsu2.xyz and the page never navigates away**; Tab stays on the two choices; scrolling and focus are restored; no console error |

`--rebuild` rewrites `dist/` (the server serves it from disk, no restart) and removes the pulled catalogue afterwards (`catalog:pull -- --remove`), so the next build and the tests are not coloured by it.

Traps the journeys deal with, so nobody chases them again: after a navigation the **old page stays on screen** until the next one's code has arrived (React Router navigates in a transition), so "the URL changed" is not "the page changed" (the journeys wait for a different `document.title`); a headline can be momentarily empty while its words are revealed; the sign-in is limited to 10 per 15 minutes per address (restart the scratch server to clear it); the contact form is limited to 5 per 15 minutes per address.

## The portfolio's life (PROMPT 13.1)

```bash
node tools/e2e/cms-journey.cjs --base=http://127.0.0.1:8788 --email=admin@example.test --password=<the test password> [--out=<dir>] [--verbose]
```

One administrator creates a project through the administration's screens and the PUBLIC side is asked at every step what a visitor would see: sign in → the list shows what the website ships with → a new project saved as a **draft with one language only** → the draft is not in the public list, not at its address, not in the sitemap → the Publication tab lists what is missing and the server refuses to publish (422) → the language bar goes *incomplete / missing / missing* → *complete* after the three languages are written **by hand** → a thumbnail and two gallery pictures are uploaded (a 3200 × 2000 picture is made smaller in the browser: 3.6 MB → 62 kB) and described → an unchecked external link is stored but not public → the preview shows the saved draft with a banner and `noindex`, and shows nothing to a signed-out browser → publish (confirmed) → visible on the Work page and at its address in hu/en/nl **within the 30 s public cache** (the step prints how long it took) → featured → on the home page → moved up → unpublished (gone from list, home page and address; content kept) → published again → archived (out) → restored (a draft, not public) → duplicated → a cancelled delete deletes nothing → deleted. It needs a fresh scratch server for each run (the sign-in is limited to 10 per 15 minutes; the run signs in twice). The run **found a real bug** (the gallery's add button created an undefined item and the editor crashed) which is fixed and has a regression test.

## Shop 3.0: comparison and FULL EXPERIENCE (PROMPT 09.1)

```bash
node tools/e2e/shop-journey.cjs --base=http://127.0.0.1:8788 --email=admin@example.test --password=<the test password> [--out=<dir>]
```

Needs a **fresh** scratch server for every run (it signs in several times, the sign-in is limited to 10 per 15 minutes, and a server that an earlier run left with the offer unpublished starts the next run from a different state). Forty-one steps, in seven journeys, each asking the PUBLIC side what a visitor would see:

| Journey | Path | What it asserts |
| --- | --- | --- |
| **A** Desktop visitor | the shop's front page → the four-column comparison (headers, the "in every package" and "introduced with" groups, a cell's level in words as well as a mark, a feature's explanation) → select Grow → its package page (no price anywhere) → "Compare all packages" → Grow is still selected | what the table shows is what the seed says; no price; the selection survives the round trip |
| **B** Phone visitor | 390×844 touch: the tabs, arrow keys and Home, a swipe, a group opened, "Compare two packages" with and without "only the differences", back to one package; 320×640: no pair mode but all four tabs | the phone has its own component, not the table; the roving tabindex works; the pair mode is offered only where there is room |
| **C** FULL EXPERIENCE | the page (headline, 18+ stages, no price) → the band on the front page → the configurator: a required question refuses an empty answer, the answer survives Back, an optional question offers Skip, "Not sure yet" stands alone, a too short description is refused, then a real send with name, e-mail, company, Dutch as the preferred language and the acknowledgement | the request is accepted by the real backend (201, an `F-…` reference); the confirmation appears only after that |
| **D** Administrator: the request | sign in → Quote requests → the request from C is listed and marked FULL EXPERIENCE → its detail shows the company, the language asked for, every question with its answer, skipped ones marked, and the description | what the visitor chose is readable without the website |
| **E** Administrator: the comparison | the editor lists the tiers and 18+ features with their levels → an edit is a **draft** and does not reach the public page → publish → a new visitor sees it, in every language it was written in → a feature with a missing translation is refused on the field | a draft is not public; the server's rule is shown where it applies; the edit is put back at the end |
| **F** Administrator: FULL EXPERIENCE | edit the headline in three languages and add a budget range → save and publish → a new visitor sees the copy and the new option → unpublish → the website's own text returns and requests are not accepted meanwhile → put back as it was | the budget ranges are the administrator's; withdrawing the offer is honest |
| **G** Administrator on a phone | 390×844: both shop screens load without sideways scrolling, Publish is visible and Save is a tappable size | the editors are usable by thumb |

## Control Room AI (PROMPT 16)

`ai-journey.cjs` drives the floating assistant and the `/control-room` page in a real Chrome against the **built** site served by the real backend, whose model is a local stand-in for Anthropic's Messages API (`anthropic-standin.ts`). The real `@ai-sdk/anthropic` provider, the real streaming protocol, the real tools and the real database are in play; nothing is spent and nothing leaves the machine.

```bash
MSYS_NO_PATHCONV=1 VITE_API_URL=/ npm run build
node tools/e2e/anthropic-standin.ts 9911 &                       # prints its address; GET/DELETE /__requests shows or clears what it received
ANTHROPIC_API_KEY=test-key-not-real-0123456789abcdef ANTHROPIC_BASE_URL=http://127.0.0.1:9911/v1 STATIC_DIR=$PWD/dist \
  DATABASE_PATH=/tmp/e2e/app.sqlite APP_SECRET=<32+ characters> APP_ENV=development PORT=8788 node server/src/main.ts &
AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/ai-journey.cjs --base=http://127.0.0.1:8788 --standin=http://127.0.0.1:9911 \
  --email=admin@example.test --password=<the test password> [--out=<dir>]     # --out also saves a picture of every failing step
```

The stand-in can be told how to behave for **every** request while it runs (`POST /__control` with JSON, or `standIn.behaviour` in a test): `reportModel` is the model its replies name (default: the one asked for; another identifier, or `null` for none, shows what the assistant does when it is not Claude Haiku 5.5) and `failStatus` answers everything with an HTTP error (401, 402, 403, 404, 429, 5xx, 529). Otherwise it answers according to markers in the visitor's last message: `TOOL:<name>:<json>` makes the model call that tool, `FAIL:<status>` answers with an HTTP error, `SLOW` writes the answer word by word, and the "I approved the plan" sentences (in all three languages) make it call `submitApprovedQuoteRequest`. Everything else gets a plain answer. It never reproduces real model behaviour: this checks **our** code, not Haiku.

| | Steps |
| --- | --- |
| **0** Verification and activation (PROMPT 16.1) | the assistant starts off and the switch refuses → the Model and connection tab shows the required model, the key as set and no way to change the model → "Run connection test" sends exactly one request for `claude-haiku-5-5`, shows the model the provider named, and does **not** switch the assistant on → the administrator switches it on and the website offers it |
| **A** The floating assistant | the button appears when idle and no AI code or session exists before it is pressed → the panel opens with the cursor in the box, the welcome and six suggested questions → a streamed answer → Escape and focus → the same conversation again → "Open the full Control Room" shows the same conversation |
| **B** The page | three areas on a desktop → the conversation survives a reload → the button on another page opens the same conversation |
| **C** Stop, retry, copy, delete | stopping a long answer keeps what was written → copy and regenerate → a provider failure becomes a sentence with "Try again" and no provider text → deleting a conversation |
| **D** Plan and approval | the plan fills through the tool → the visitor edits it → sending validates name, e-mail and acknowledgement → after approval the request is sent and the reference shown → the provider never received the name or e-mail address → the administration lists the request, marked as written by the assistant |
| **E** Languages | the same conversation continues in Hungarian and Dutch and the model is told which language to answer in |
| **F** Switches | switching the assistant off removes the button and the page says so; an exhausted budget gives a friendly message; a welcome message and chips written in the administration replace the built-in ones |
| **G** The administration | the AI screen shows usage, tokens, cost (an estimate) and tools in charts with tables; the settings form saves and refuses a budget the server will not accept |
| **G2** The model cannot be verified (PROMPT 16.1) | a reply from another model is discarded and the visitor reads "The required AI model could not be verified." with a contact link → the assistant is unavailable, the page says so and the provider is not contacted → the administration shows the failure and the alert → a new test brings it back → an invalid key (401) is a failed test with its reason and no key or provider text on the page |
| **H** A phone | full-screen modal with the box visible → the keyboard shrinks the panel → the plan tab → the button rises above the shop's sticky bar → the page is one column with a drawer and a tab |

The assistant starts **switched off and unverified**, as in production, so the journey's first section is the administrator doing it in the browser. A script that needs a working assistant but is not about the activation (`audit-ai.cjs`) runs `node tools/e2e/ai-activate.cjs --base=… --email=… --password=…` first: it uses the administration's own API (connection test, then the switch).

It needs a fresh server (sign-in is limited to 10 per 15 minutes) and an administrator of a **throw-away database**; it changes the assistant's settings (and puts them back) and creates one quote request. This journey found a real defect: the second answer of a conversation was not being saved (its message id was empty), which is why steps D and E continue one conversation across several turns and a reload.

## Security probe

```bash
node tools/e2e/security-probe.mjs --base=http://127.0.0.1:8788 --email=admin@example.test --password=<the test password>
```

Restart the scratch server first (its rate limits live in memory). It checks, over plain HTTP: every route of the administration's API (35 paths × 5 methods) answers only 401/404/405 without a session; a wrong password and an unknown account get the same refusal; the public endpoints carry no private field; errors are plain JSON without stack, path or SQL; no cross-origin permission is given to a foreign origin or `null`; hostile text (script, SQL, spreadsheet formulas) is stored as text; after sign-in the cookie is `HttpOnly` + `SameSite=Strict`, a state change without the CSRF token or from a foreign origin is refused, list rows carry no address/content hashes, and a signed-out cookie stops working; a burst against the contact form is limited with a `Retry-After`. Since PROMPT 13.1 it also asks the content management: every new administration route answers only 401/404/405 without a session; the public portfolio and wording carry no private field; a real picture is accepted and served as an image with `nosniff` and `sandbox`, the same bytes are stored once, and an HTML page claiming to be a PNG, an SVG, a JPEG announced as a PNG, a 20000 × 20000 picture, an empty body and a body over the limit are all refused; a picture with a script glued on stays an inert image; nine path-traversal and odd-name attempts on `/media/…` are plain 404s; an upload without the CSRF token or from a foreign origin is refused; hostile text in a project title is stored exactly and a draft stays invisible; bad addresses (empty, capitals, slashes, `..`, reserved words), a `javascript:` link and an unknown category are refused with field errors; publishing an incomplete project is refused; the preview needs a session and its page carries no project data; a wording key that does not exist cannot be created and a 5000-character wording is refused; and the probe's own project and picture are deleted again.

## The quotation workflow (PROMPT 17)

```bash
node tools/e2e/quote-journey.cjs --base=http://127.0.0.1:8788 --mail=/tmp/e2e/mail --email=admin@example.test --password=<the test password> [--out=<dir>]
```

The scratch backend needs `PUBLIC_URL=http://127.0.0.1:8788` (the links in the e-mails point at it). A visitor on a 390 px phone builds a request (an invalid website is refused), sees the receipt (reference, date, summary, the private status link), the owner's notification and the visitor's confirmation are read from the `.eml` files; the administrator signs in, filters, opens the request, sets a priority, writes a quotation (the total is the server's whole-unit sum, with no VAT figure because none was confirmed) and sends it after a confirmation; the customer opens the secure link on a phone, is refused without the confirmation box, accepts; the page becomes a record, both sides were e-mailed once, no wording says a payment was made; the administrator sees *Accepted* (not *In progress*) and the history. 20 steps; needs a fresh server. A note that cost time: the site's brand ("Your Name") also matches `getByLabel('Your name')`, so the form's own fields are found by role and exact name.

## Languages (PROMPT 18)

**`l10n-journey.cjs`**: the starting language by country, the saved choice, and the language of the Shop, in a real Chrome against `wrangler dev` (the real Workers runtime). 31 checks: HU/NL/DE/FR/US/`XX`/`T1` and a VPN exit, the Shop in each starting language (no English fallback sentence, no raw key), the configurator's validation message in each language, a manual choice that survives navigation, a refresh, a new tab and a different country, an explicit `/nl/` address that is not redirected, a crawler that is not redirected, and a forged `CF-IPCountry` header that is ignored.

```bash
npm run build
npx wrangler dev --port 8799 --var SIMULATE_COUNTRY:1     # SIMULATE_COUNTRY only exists on this command line, never in wrangler.jsonc
AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/l10n-journey.cjs http://127.0.0.1:8799
```

**`quote-languages-journey.cjs`**: a quote request completed on a 390 × 844 touch phone in each language, through the six-step builder and the FULL EXPERIENCE questionnaire (55 checks), against the built site served by the real backend (set it up as above; use `RATE_LIMITS=false` for the throw-away server, six requests exceed the sending limit of one address).

```bash
AUDIT_PLAYWRIGHT=/path/to/playwright node tools/e2e/quote-languages-journey.cjs --base=http://127.0.0.1:8788 --mail=<the mail folder>
```

The older `journeys.cjs` journey A now accepts `/hu/`, `/en/` or `/nl/` after `/` (without the edge Worker the starting language is the saved choice, else English).
