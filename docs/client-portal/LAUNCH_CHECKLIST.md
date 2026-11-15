# Client portal: launch checklist

The things that stand between "the code works" and "a customer may sign in". Written on 2026-11-15 for the branch `feature/client-portal` (PROMPT 25). **This checklist does not open the portal and nothing here was deployed, merged or run against production.** The portal is reachable on any deployment of this code, but **no account exists until the owner invites someone** (registration is off by default), so nothing can be seen by anyone until then.

## How to read the statuses

| Status | Meaning |
| --- | --- |
| **Verified** | Shown by an automated test or run **on this branch**, named in the evidence column. Always a local result (a throw-away database, a scratch server, Chrome driven by Playwright, a recording mailer): never a statement about production. |
| **Not verified** | Nobody checked it, or it can only be checked with access this work did not have (the Render and Cloudflare dashboards, DNS, a real mailbox, a real device). It may be fine; nobody knows. |
| **Owner action required** | A decision, a setting or a check that only the owner (or their lawyer) can make. The code does not choose it for them. |
| **Not applicable** | Does not apply, with the reason. |

**Technical implementation is not legal approval.** Where a row touches the law (privacy, retention, consent, erasure, an account's data), the *implementation* and the *approval* are separate rows. Nothing in this repository is legal advice.

---

## A. Owner decisions and configuration

| # | Item | Status | Evidence / what to do |
| --- | --- | --- | --- |
| A1 | **Session length** (`CLIENT_SESSION_HOURS`, default 168 = 7 days) and **idle limit** (`CLIENT_IDLE_MINUTES`, default 2880 = 48 hours) | Owner action required | Starting values chosen here, not advice. A shorter life is safer on a shared computer; a longer one is kinder to a customer who looks twice a month. The deadlines themselves are **Verified** (`clientPortalAuth.test.ts`). |
| A2 | **Link life** (`CLIENT_LINK_MINUTES`, default 30; `CLIENT_INVITE_HOURS`, default 72) | Owner action required | Short on purpose. An expired link is replaced by asking for a new one (**Verified**). |
| A3 | **Registration**: leave it **off** (only invited customers) or switch it on | Owner action required | Off by default. On: anyone who proves an address gets an *empty* account and can see nothing until you link something. It also lets a stranger make the site send them a link (limited: 5 per address per hour, 12 per 15 minutes per network address). |
| A4 | **Customer self-linking** ("Customers may link requests and bookings that carry their verified address") | Owner action required | Off by default. On: a signed-in customer can claim records that carry the address they proved. **Verified** that it claims only that, never an unverified address, never someone else's. Read [ACCOUNT_LINKING.md](ACCOUNT_LINKING.md) first. |
| A5 | **Who may do what** | Owner action required | Administrators: everything. Editors: read customers, work on projects (status, milestones, updates, private notes), **not** invite, switch off, sign out, link records or create projects. **Verified** (`clientPortalAdmin.test.ts`). Decide whether that split fits. |
| A6 | **What a project status means in practice**, and which ones you tell customers about by e-mail | Owner action required | The eleven statuses and the default of which change is e-mailed are in [ARCHITECTURE.md](ARCHITECTURE.md) §5. The default "important" list (waiting for the customer, review, finalisation, completed, on hold, cancelled) is a starting choice. |
| A7 | **The owner's own e-mail** (`NOTIFY_TO`, `NOTIFY_LANGUAGE`) | Owner action required | The owner is told when a customer asks to delete their account. Without `NOTIFY_TO` that notice is not sent: watch the Customers list's "Deletion requested" filter instead. |
| A8 | **The words the owner writes for customers** (project names, milestones, updates, questions) | Owner action required | They are shown **as written**, in the language you wrote them in; the portal does not translate them (a quote's own text is marked with its language, a project's name is not). Decide a convention for customers who read another language than you write. |
| A9 | **Inviting is a business act**: decide who is invited, and when (after a quote is accepted? at the start of a project?) | Owner action required | No invitation is ever sent automatically. |
| A10 | **Closing the loop**: who answers a deletion request, and within what time | Owner action required | The portal records it and tells you; the deletion is `npm run server:cli -- erase <address>`, **by hand**. Nobody has promised the customer a time, and the notice says none. |

## B. Privacy and legal review

### What is implemented (technical)

| # | Item | Status | Evidence |
| --- | --- | --- | --- |
| B-T1 | The privacy notice has a **client portal** section and a second cookie paragraph, in HU / EN / NL, written only from what the code does: the account's data, how sign-in works, the records shown, the e-mails, the account's history, no file sharing, deletion by hand | Verified | `src/content/privacy.ts`, `PrivacyPage.tsx`; `privacy.test.ts` (26: 5 about the portal) |
| B-T2 | The notice gives **no** retention number, legal basis, processor agreement, guarantee, certification or encryption claim, and does not name the e-mail provider | Verified | the notice's text and `privacy.test.ts` |
| B-T3 | No password exists or is stored; link secrets and session tokens are stored only as SHA-256 hashes; the account's history holds no address, name, token or network address | Verified | `clientPortalAuth.test.ts`, `clientPortalAdmin.test.ts` |
| B-T4 | A customer's data is reachable only by that customer (and the owner): no portal address takes an id; B's records answer like records that do not exist | Verified | `clientPortalIsolation.test.ts`; the browser journey (D) |
| B-T5 | Private notes (on a project, a quote request, a booking) never reach a customer's page or e-mail | Verified | `clientPortalIsolation.test.ts` |
| B-T6 | Nothing on the portal is measured; the secret of a link is never in a `Referer`, a log, a head tag or an event | Verified | `src/portal/portal.test.ts`; the journey (B, G) |
| B-T7 | Erasure by address removes the account, its sessions, links, record links, projects (milestones, history, private notes, documents) and the e-mails about them, and leaves only history lines that name no one | Verified | `clientPortalAdmin.test.ts` |
| B-T8 | A customer can ask for their account to be deleted, withdraw the request, and is told plainly that nothing is deleted until the owner acts | Verified | `clientPortalAdmin.test.ts`; the journey (E) |
| B-T9 | An e-mail "accepted" by the provider is never reported as delivered | Verified | the same tests; the pages say "we will send" |

### What needs the owner or a lawyer (approval, not implementation)

| # | Item | Status | What to decide or check |
| --- | --- | --- | --- |
| B1 | The **legal basis** for holding a customer's account and project data, and whether the notice must name it | Owner action required | Not written anywhere on purpose. |
| B2 | **Retention** of accounts, projects, milestones, history, private notes and the account's history lines | Owner action required | The code **never deletes an account or a project by age** (`RETENTION_DAYS` does not touch them). Expired sign-ins and spent links go about a month after they expire. Decide the periods and whether to automate them. |
| B3 | **The customer's rights**: access to their data, correction, **export**, erasure, objection | Owner action required | **Erasure** exists (by hand, `erase <address>`); **correction** is the customer's own profile and your edits; **there is no export** of a customer's data in a portable file: access requests are a manual job today. Decide the process and who does it. |
| B4 | **The e-mail provider** as a processor (agreement, location, retention), and whether the notice must name it | Owner action required | The portal's e-mails go through the configured provider like the quote and booking e-mails. Which one is live is unverified. |
| B5 | **Cookie classification**: is the portal's sign-in cookie "strictly necessary" for the purposes of the cookie rules that apply to you (it is a sign-in cookie, set only when a customer signs in, holding no personal data) | Owner action required | The notice states what the cookie does and says it is used for nothing else; whether a consent step is required is a legal question. |
| B6 | **The consequence of erasing an address**: it also deletes quote requests, bookings and inquiries with that address, and the account's projects | Owner action required | This is the existing erasure's behaviour extended to the portal, not a new design. A customer who changed their address is erased by their **current** one; check for the old one. Business records you must keep (invoices, contracts) are **not** in this system: decide before erasing a customer who has a running project. |
| B7 | **Whether customers under any age** may use the portal | Owner action required | Nothing in the code asks. |
| B8 | **Terms of use** for the portal (if any) | Owner action required | None exists; the sign-in page links the privacy notice and the contact page only. |
| B9 | **A review of the notice's new section and of the deletion process by a lawyer** | Owner action required | Nobody has reviewed it. |
| B10 | **Hungarian and Dutch proofreading by a native reader** of the portal's pages, the nine e-mails and the administration's Hungarian | Owner action required | Machine checks only (spelling with Hunspell, glossary, register, foreign words). They cannot find a correct word in the wrong place. |

## C. E-mail

| # | Item | Status | What to do |
| --- | --- | --- | --- |
| C1 | **A provider, `EMAIL_FROM` and `PUBLIC_URL` are set** | Owner action required | Without all three no link can be sent: the sign-in page says it is not available and inviting reports `emailQueued: false` (**Verified**). |
| C2 | **SPF, DKIM and DMARC for the sending domain** (platform finding **E-1**, still open) | Owner action required | Without them a sign-in link may land in spam or not arrive. As of the 2026-11-14 public DNS look nothing was in place; **not re-checked**. |
| C3 | **A real test**: invite yourself from a real address and sign in from a real mailbox, on a phone | Not verified | Never done. Check the message's look in Gmail, Outlook and Apple Mail, the spam folder, and that a mail program's link preview does not break the link (it cannot spend it, **Verified** in a browser, not in a mail program). |
| C4 | **The sender and reply-to address** that customers see | Owner action required | `EMAIL_REPLY_TO` is the public contact address; the customer's replies go there. |
| C5 | **The delivery log** (Administration → Notifications) is read at least once after launch | Owner action required | It shows "accepted", never "delivered" unless the provider's signed event said so. |

## D. Production

| # | Item | Status | What to do |
| --- | --- | --- | --- |
| D1 | **The website and the API on one origin** (the backend serves `dist/`, `VITE_API_URL=/`) | Owner action required | The sign-in cookie is `SameSite=Strict` and the API sends no CORS headers: a site on another origin cannot use the portal (it says so). Render serves both today per the platform audit; **not re-checked**. |
| D2 | **`APP_ENV=production` or an `https://` `API_PUBLIC_URL`**, so the cookie is `Secure` and named `__Host-cc_client` | Owner action required | The flag and the name are **Verified** in a test; a real HTTPS connection was not. |
| D3 | **`TRUST_PROXY`** is set to the number of proxies in front of the server | Owner action required | Without it every visitor looks like the proxy's address: the per-address limits (links, sign-ins) then count everybody together. Finding from the platform audit. |
| D4 | **The migration (`0012`) on a copy of the production database first**, then on production, **by the owner** | Owner action required | Never run from here. It is additive and rebuilds only `email_deliveries`. **Take a backup first.** Rollback: [ARCHITECTURE.md](ARCHITECTURE.md) §8. |
| D5 | **A persistent disk** for the SQLite file (platform finding D-1) | Owner action required | Accounts, sessions and projects are in that file. If the disk is not persistent, every deploy loses them. |
| D6 | **Backups** include the new tables (they are in the same file) | Not verified | A backup now contains hashes of link secrets and sessions, customers' addresses and project text: protect it as you protect the database. |
| D7 | **The static host's rules**: `_headers` and `_redirects` are written by the build; the Node server applies the headers and answers any `/<lang>/client-portal/…` address with the portal's shell itself | Verified (locally) | A host that serves `dist/` without this backend needs `_redirects` support, **and** has no backend for the portal anyway. |
| D8 | **One server process** | Owner action required | The rate limits are in memory; a second process needs a shared limiter. |
| D9 | **Logs on the host** | Not verified | They record request paths (a project reference is in a path); a link's secret is in a fragment and never reaches them. |
| D10 | **Monitoring** of `/api/ready` and the e-mail log | Owner action required | Existing platform items. |

## E. Manual testing before the first real customer

| # | Item | Status |
| --- | --- | --- |
| E1 | Invite yourself, sign in on a **real phone** and a real computer, in each language | Not verified |
| E2 | Safari (iOS and macOS) and Firefox | Not verified |
| E3 | A screen reader (VoiceOver, NVDA) through the sign-in and one project | Not verified |
| E4 | Reduced motion on a real device | Not verified |
| E5 | Link a real quote request, accept its quote, create a project from it, change its status through the screens, and read it as the customer | Not verified (the same path is **Verified** with test data) |
| E6 | Ask for the deletion of a test account, watch the owner's notice, run `erase` on the **test** address | Not verified |
| E7 | Sign in from two browsers, "sign out everywhere else" | **Verified** in tests and the journey; not on real devices |

## F. Known limits and what PROMPT 26 can rely on

- **No files** ([DOCUMENTS.md](DOCUMENTS.md)), no messages, no invoices, no approvals of deliverables, no tasks.
- **No second factor**, no "remember this device".
- **No export** of a customer's data.
- **A project is never created automatically** and has no price, no contract and no invoice: nothing about money lives in the portal.
- **The status model is small** on purpose ([ARCHITECTURE.md](ARCHITECTURE.md) §5, §9).
- **The owner's words are not translated.**
- **A customer who changes their address loses nothing**: the links and projects belong to the account, not to the address.
