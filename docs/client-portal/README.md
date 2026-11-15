# Client portal (PROMPT 25)

A private workspace where an invited customer signs in (with a link sent to their e-mail address: no password exists) and sees **their own** projects, quote requests, bookings and, once the site has a place to keep files, documents. It is an extension of the existing site and backend: the same Node process, the same SQLite database, the same migrations, the same e-mail outbox and the same HU / EN / NL machinery. Nothing was rebuilt, and no second backend, database, provider or authentication platform was added.

> **Status: implemented and tested locally on the branch `feature/client-portal`; not merged, not deployed, not production-ready.** What is and is not verified is in [TEST_RESULTS.md](TEST_RESULTS.md); what the owner still has to decide, configure or have reviewed is in [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md). Nothing here was run against production, a real provider, real DNS or a real customer.

## Where it is

| What | Address |
| --- | --- |
| The portal | `/<lang>/client-portal/` (`hu`, `en`, `nl`), and everything below it: `…/projects`, `…/projects/PRJ-XXXXXXXX`, `…/requests`, `…/bookings`, `…/documents`, `…/account` |
| The page a sign-in link opens | `/<lang>/client-portal/verify#<secret>` (the secret is after the `#`, so no server, log or other site ever sees it) |
| The customer's API | `/api/portal/*` (same origin only; no CORS) |
| The administration | `/admin/clients` (the list, the two switches, inviting), `/admin/clients/:id` (one customer), `/admin/client-projects/:id` (one project); the API under `/api/admin/clients*` and `/api/admin/client-*` |

## The owner's first steps

1. **E-mail must work.** The portal sends its sign-in links by e-mail: a provider, a sender (`EMAIL_FROM`) and the site's address (`PUBLIC_URL`) are all needed. Without them the sign-in page says it is not available, and inviting still creates the account but reports that no link went out. (Mail DNS is still the open finding E-1 of the platform audit: [../audit/EMAIL_AUDIT.md](../audit/EMAIL_AUDIT.md).)
2. **Invite a customer**: Administration → **Customers** → *Invite a customer* (an administrator; an editor can read and work on projects but not invite). The customer gets one e-mail in the language you chose; opening it and pressing the button signs them in and verifies their address.
3. **Link their records** (optional): on the customer's page, *Records*. A customer sees a quote request or a booking only if **you linked it** (or, when you switched that on, they claimed it with the address they have proven). Nothing is linked because two addresses look alike: [ACCOUNT_LINKING.md](ACCOUNT_LINKING.md).
4. **Make a project** (an administrator): *Projects → New project*, optionally from a linked quote request that has an **accepted** quote. A project is never a side effect of a request, an acceptance or an invitation.
5. **Work on it**: change its status, add milestones, post an update or a question for the customer (each can be e-mailed), keep private notes (only you see them).

## The two switches (both OFF until you decide)

| Switch | What it does |
| --- | --- |
| *Anyone who proves an email address may create an account* | Registration: an unknown address that opens a link gets an account (still empty: it sees nothing until you link something). Off: only invited addresses can sign in. |
| *Customers may link requests and bookings that carry their verified address* | A signed-in customer can claim records that carry the address they have proven. Off: you link records yourself. |

## What a customer sees

An overview (counts that come from real projects, what waits for them, recent activity, upcoming milestones and bookings), **Projects** (status, dates, the next milestone, "2 of 5 milestones done" and, since PROMPT 26, a percentage that is **counted from the real tasks or milestones** (and an honest "nothing to measure yet" when there are none), never an invented one: [../project-management/](../project-management/README.md)), one project (status in words, milestones, the timeline of what happened, documents), **Quote requests** (status, the quotes sent, the accepted one; a button opens the existing secure quote page), **Bookings** (the existing booking page behind a button), **Documents** (an honest empty state: files cannot be shared yet, [DOCUMENTS.md](DOCUMENTS.md)) and **Account** (details, change of address, devices, sign-out everywhere else, a request to delete the account).

## The documents

| File | What is in it |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The modules, the tables, the request's life, the project status model, how an accepted quote becomes a project, the endpoints, how to roll it back, what PROMPT 26 extends |
| [AUTHENTICATION.md](AUTHENTICATION.md) | Why there is no password, the link, the session, the cookie, CSRF, rate limits, the configuration |
| [SECURITY.md](SECURITY.md) | The authorization boundary, the threats and what answers each, privacy, retention and erasure, what is left |
| [ACCOUNT_LINKING.md](ACCOUNT_LINKING.md) | Who sees which record, the two ways a record is linked, what is never done |
| [DOCUMENTS.md](DOCUMENTS.md) | The document model and its authorization, and why publishing is switched off |
| [EMAILS.md](EMAILS.md) | The nine kinds of message, when each is sent, idempotency, retries, what is never claimed |
| [TEST_RESULTS.md](TEST_RESULTS.md) | The commands and their actual results; what was not verified |
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | The owner's decisions, legal review, production checks |

## Configuration (all optional; the defaults are in the code)

| Variable | Default | Meaning |
| --- | --- | --- |
| `CLIENT_SESSION_HOURS` | `168` (7 days) | The longest a sign-in lasts, whatever the customer does (1 to 720). |
| `CLIENT_IDLE_MINUTES` | `2880` (48 hours) | How long a sign-in may sit unused before it ends (5 to 43200). |
| `CLIENT_LINK_MINUTES` | `30` | How long a sign-in, registration or new-address link works (5 to 1440). |
| `CLIENT_INVITE_HOURS` | `72` | How long an invitation link works (1 to 720). |

The defaults are starting values chosen here, **not legal or security advice**: they are the owner's to confirm ([LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) A).

## Running the tests

```bash
npx vitest run server/test/clientPortal*.test.ts src/portal      # the portal's own tests
npm test                                                           # everything
MSYS_NO_PATHCONV=1 VITE_API_URL=/ VITE_SITE_URL=https://example.test npm run build && npm run check:seo
# the browser journey (Playwright and axe are not dependencies; see tools/e2e/README.md): a fresh scratch backend serving dist/, then
node tools/e2e/portal-journey.cjs --base=http://127.0.0.1:8801 --mail=<mail folder> --email=<admin> --password=<password> --width=1440
```

## What this does **not** do (PROMPT 26 and the owner's decisions)

No file delivery, no messages between customer and owner, no invoices or payments, no time tracking. **PROMPT 26 added** tasks, milestones with dependencies, requests the customer answers (with the owner's review), a schedule and progress: see [../project-management/](../project-management/README.md). A project's status list is still the documented model in [ARCHITECTURE.md](ARCHITECTURE.md). No blog.
