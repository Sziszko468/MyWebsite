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

## Security probe

```bash
node tools/e2e/security-probe.mjs --base=http://127.0.0.1:8788 --email=admin@example.test --password=<the test password>
```

Restart the scratch server first (its rate limits live in memory). It checks, over plain HTTP: every route of the administration's API (35 paths × 5 methods) answers only 401/404/405 without a session; a wrong password and an unknown account get the same refusal; the public endpoints carry no private field; errors are plain JSON without stack, path or SQL; no cross-origin permission is given to a foreign origin or `null`; hostile text (script, SQL, spreadsheet formulas) is stored as text; after sign-in the cookie is `HttpOnly` + `SameSite=Strict`, a state change without the CSRF token or from a foreign origin is refused, list rows carry no address/content hashes, and a signed-out cookie stops working; a burst against the contact form is limited with a `Retry-After`.
