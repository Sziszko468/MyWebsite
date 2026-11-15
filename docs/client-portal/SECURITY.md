# Client portal: security

## The boundary

**A signed-in customer can see a record if and only if a row of `customer_links` (or, for a project or a document, the project's `customer_id`) joins their account to it, where their account is the one the session cookie resolves to.** Every portal query selects by that id; there is no address that takes a customer id, and a test sends one in every way a browser can (query, body, headers, a neighbour's reference) and checks that nothing changes.

*Fail safely without revealing existence:* a record that belongs to someone else, does not exist or was never linked answers **the same `404`** with the same body (`clientPortalIsolation.test.ts` compares the two bodies byte for byte, for a project, a request, a booking and a document; the browser journey does the same through a second customer's session).

## Threats and what answers each

| Threat | Answer | Evidence |
| --- | --- | --- |
| Customer A reads customer B's project, quote, booking or document, by reference, id, a guessed neighbour, a header or a body field | the boundary above; references are random (`PRJ-`) or sequential (`CC-`, `BK-`) but **never** a key; neighbours are guessed in a test (12 each) and only the customer's own is found | `clientPortalIsolation.test.ts` |
| A customer changes a status, creates a project or a document | no portal address does it (a test tries `PATCH`, `POST`, `PUT`, `DELETE` on the obvious ones and on the administration's) | same file |
| A customer uses an administration address, or an administrator's cookie opens the portal | different cookies, tables and resolvers; `401` both ways | `clientPortalAuth.test.ts` |
| Someone learns whether an address has an account | `/auth/request` answers `202` and the same body for known, invited, switched-off and unknown addresses; the address-change request does the same; an unknown account and a known one differ only in whether an e-mail is later queued (**see "What is left"**) | `clientPortalAuth.test.ts` |
| Guessing a link | 256-bit secrets; a miss costs the guesser (`tokenMiss`, 20 per 15 minutes per address) | same |
| A stolen database or backup | only SHA-256 of link secrets and session tokens; no password exists; the e-mail log holds no secret (the secret is made at send time) | `clientPortalAdmin.test.ts` ("no secret is ever…") |
| A link spent by a mail scanner | the link opens a page; only a `POST` from its button spends it; the secret is in the fragment | the journey (B) |
| The secret leaking through a server log, a `Referer`, analytics or the address bar | fragment; removed from the address and history at once; `Referrer-Policy: no-referrer`; **no event is ever sent from a portal address** (`track()` returns early; a test) | `src/portal/portal.test.ts` |
| Session theft by script | `HttpOnly`; the CSRF token is in memory; strict CSP on the site | the journey (B) checks the flags and that `document.cookie` does not show it |
| Cross-site request forgery / login CSRF | `SameSite=Strict`, no CORS, same-origin check on every change, CSRF token; opening a link must be a `POST` from the portal's own origin | `clientPortalAuth.test.ts` |
| Brute force and floods | `portalAuth` (12 per 15 minutes per address), 5 links per address per hour, `tokenMiss`, `portal` (180 a minute) on signed-in routes | `security.test.ts` counts the limiters |
| Account takeover through "change my e-mail" | a link to the **new** address, a notice to the **old** one, every session ended on completion, history written | `clientPortalAuth.test.ts` |
| An old, revoked or expired session | deleted on first use; absolute and idle deadlines; disabled accounts stop at once | same |
| Private notes reaching a customer | separate tables; nothing a customer's answer is built from reads them; a marker string is planted in a project note, a quote note and a booking note and searched for in **every** portal answer | `clientPortalIsolation.test.ts` |
| An administrator reading a secret | no answer carries a token, a hash or the CSRF token; sessions are shown as a browser label and times | `clientPortalAuth.test.ts`, `clientPortalAdmin.test.ts` |
| A customer's file served to the wrong person | there is no file delivery yet; the authorization before it exists and is tested | [DOCUMENTS.md](DOCUMENTS.md) |

## Headers and caching

Every `/api/portal/*` answer: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, a policy that loads nothing, and **no `Access-Control-*`**. The page (`/<lang>/client-portal/…`): the one quiet shell, `no-store`, `noindex, nofollow`, `no-referrer`, `<meta name="robots" content="noindex, nofollow">`, no canonical address, no alternates, no structured data, not in the sitemap, not prerendered with anybody's data (`check:seo` and `src/portal/portal.test.ts` keep this).

## Privacy

- The page's title and description are the same for everybody; nothing personal is ever in `<head>`.
- **Nothing on the portal is measured** (`isPortalPath` in the tracker).
- The privacy notice has a new section and a second cookie paragraph, written only from what the code does; it gives **no** retention period, legal basis, processor agreement, guarantee or encryption claim. The legal text is not approved: [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) B.
- The account's history (`customer_audit_events`) holds a kind, an actor and a short code: **no address, no name, no token, no network address** (the column was removed on purpose, because the table is append-only).
- A session stores a keyed hash of the network address and the first 200 characters of the browser's description, and says so in the notice.

## Retention and erasure

- **Accounts and projects are never deleted by age**: `RETENTION_DAYS` does not touch them. Whether and when they should go is the owner's decision (checklist B).
- Expired sign-ins and spent or expired links (with their requests) are removed by the maintenance task about a month after they stop mattering.
- A customer can **ask** for deletion (recorded, a receipt to them, a notice to the owner; nothing is deleted). The owner then runs `npm run server:cli -- erase <address>`: that removes the account, its sessions, links, record links, **projects with their milestones, history, private notes and documents**, the e-mails about them, **and** the quote requests, bookings and inquiries with that address (the existing erasure). What stays is the account's history lines (a number, a kind, a code) and the e-mail log lines of messages to someone else. A customer who changed their address is erased by their **current** address; an old address's records are erased separately.

## What is left (known, documented, not hidden)

1. **Timing.** An address with an account and one without differ in the time of the database writes that precede the (identical) answer; the difference is small and not equalised. The e-mail is queued, not sent, before the answer.
2. **The mailbox is the account.** Whoever reads the mailbox can sign in and request a change of address (the old address gets a notice, which only helps if someone reads it).
3. **A single process.** The rate limiter is in memory (as for every other limit on this server); a second process would need a shared one.
4. **Same origin only.** A deployment that serves the API from another origin cannot use the portal (by design: cookies are `SameSite=Strict`, no CORS).
5. **`Secure` and `__Host-`** apply only when the server knows it is on HTTPS (`APP_ENV=production` or an `https://` `API_PUBLIC_URL`).
6. **Mail authentication (SPF/DKIM/DMARC) is still the open finding E-1**: until it is fixed a sign-in link may land in spam or not arrive.
7. **No second factor.**
8. **Hosting logs** (Render, Cloudflare) record the *path* of a request, which contains a project reference (`PRJ-…`) but never a secret.
9. **Not reviewed** by a security professional or a lawyer.
