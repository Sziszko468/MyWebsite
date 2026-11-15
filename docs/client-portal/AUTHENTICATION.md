# Client portal: authentication

## The decision: no password

The site had no customer password flow, and a customer who logs in a few times a year is the person most likely to reuse or forget a password. So **no password exists**: a link sent to the address proves the customer can read that mailbox, and opening it signs them in. "I lost access" and "I forgot my password" are the same thing: ask for a new link. Account recovery is therefore exactly as strong as the customer's mailbox, which is the same trust the quotation and booking links already rest on; [SECURITY.md](SECURITY.md) says what that means.

## The flow

```text
customer: types an address on /<lang>/client-portal/            POST /api/portal/auth/request {email, language}
server:   ALWAYS answers 202 {accepted: true}  (nothing says whether an account exists)
          then, only if it should:
            active account   -> a sign-in link
            invited account  -> an activation link (verifies the address)
            unknown address  -> a registration link, ONLY if the owner opened registration
            switched-off     -> nothing
          (at most 5 links per address per hour; further ones are silently not sent)
outbox:   the message is written when it is SENT: a fresh 256-bit secret is made, only its SHA-256 is stored, and the link
          https://<site>/<lang>/client-portal/verify#<secret>   goes into the e-mail and nowhere else
customer: opens the link -> a page that shows "Confirm your sign-in" and a button; the secret is taken out of the address bar at once
          presses the button                                   POST /api/portal/auth/verify {token}
server:   one transaction: spend the link (the UPDATE is the check), make or activate the account, start the session, write the history
          -> Set-Cookie: cc_client=<256-bit secret>; HttpOnly; SameSite=Strict; Path=/ (+ Secure and the __Host- prefix over HTTPS)
```

## The secret of a link

| Property | How |
| --- | --- |
| At least 256 bits of randomness | `randomToken(32)` (`crypto.randomBytes`), base64url: 43 characters |
| Only a hash is stored | SHA-256 in `customer_auth_tokens.token_hash`; the database alone opens nothing |
| Short-lived and configurable | `CLIENT_LINK_MINUTES` (default 30) for a sign-in, a registration and a new address; `CLIENT_INVITE_HOURS` (default 72) for an invitation |
| Single use | `UPDATE … SET used_at = ? WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > ?` must change exactly one row; three simultaneous clicks produce one `200` and two `410` (a test) |
| Replaced by a newer one | minting revokes every unused link of the same address (or, for a new address, of the same account) |
| Never logged | the log line says `portal sign-in` with the purpose and nothing else; the secret is in the e-mail body and nowhere else (a test searches the logs, the stored errors, the delivery list and every administration answer for every secret that was mailed) |
| Not in a URL a server sees | after a `#`, which a browser never sends: not in an access log, a `Referer`, analytics or page metadata. The page removes it from the address bar and the history at once, and **a mail program that opens the link to check it spends nothing**: only the button (a `POST`) does |
| Same answer for a wrong one | an invented, malformed or empty secret is `404 not_found`, and each one counts against `tokenMiss` (20 per 15 minutes per address; the 21st is a `429`). A link that **was** real says why it fails (`410`: `expired`, `used` or `revoked`) so its holder knows to ask again |
| Bound to the address | a link made for an address the account no longer has proves nothing and is not spent |

## The session

| Property | Value |
| --- | --- |
| Identity | resolved from the cookie, server-side, on every request; **a customer id in a body, query, header or address is never read** |
| Absolute deadline | `CLIENT_SESSION_HOURS`, default 168 (7 days), whatever the customer does |
| Idle limit | `CLIENT_IDLE_MINUTES`, default 2880 (48 hours); use keeps it alive (a once-a-minute touch) |
| Storage | `customer_sessions`: the **hash** of the cookie's token; ending a session deletes the row |
| New token at every sign-in | never one the visitor chose |
| Revocation | the customer (this device, or every other), the owner (`revoke_sessions`, `disable`), a change of address (every session), an erasure; a disabled or unverified account's session stops resolving at once |
| CSRF | every state-changing request needs `X-CSRF-Token` = the session's token (held in the page's memory only); plus a same-origin check (`Sec-Fetch-Site` / `Origin`) on **every** state-changing portal request, including the two that come before a session |
| Browser storage | **nothing**: no `localStorage`, `sessionStorage`, IndexedDB or script-readable cookie; the privacy tests read the portal's source for it |
| Cross-origin | the cookie is `SameSite=Strict` and the API sends **no CORS headers**, so the website and the API must be one origin (the backend serving the site, `VITE_API_URL=/`). The portal says it cannot be used when the build points at another origin |

## Changing the address

A signed-in customer asks to use a new address. A link goes to the **new** address and a notice (no link; the new address shown only as `a*****@example.com`) goes to the **old** one. Nothing changes until the link is opened; opening it changes the address (re-verified), ends **every** session, revokes every pending link, writes the history, tells the old address, and signs the device that opened the link in. An address that already belongs to another account gets no link and no answer (the same `202`).

## Owner and account states

`invited` (the address is not verified; no session can exist; no claim by address is possible) → `active` (the first link opened) ⇄ `disabled` (the owner: sessions end, pending links stop working, no new link is sent, the account is not offered anything). A switched-off account is back to `active` or `invited` depending on whether its address was ever verified.

## Existing links

The quotation links (`/quote/<secret>`, `/request/<secret>`) and the booking link (`/consultation/booking/<secret>`) are **unchanged**: the same tokens, the same lifetimes, the same rules. Nothing converts one into a sign-in. The portal can mint an *ordinary* one of them for a record the signed-in customer owns (`POST …/open`), valid for two hours, so a customer can open the usual quote page from the portal; that is the customer's own right to read their own quote, not a login.

## Not done

No second factor, no "remember this device for 30 days" cookie, no passkeys, no social sign-in, no step-up for a change of address beyond the notice, no per-account lock (a link cannot be guessed; the limits are per address). Each is a decision for the owner or a later phase.
