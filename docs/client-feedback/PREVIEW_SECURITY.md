# Preview security

A deliverable's preview is **somebody else's page**: the owner hosts it, the customer's browser loads it. This page is about what could go wrong, and what stops it.

## 1. Who can see what

| Rule | How |
| --- | --- |
| Only the signed-in customer who owns the project | the customer's session cookie (`HttpOnly`, `SameSite=Strict`, `Secure` when the backend is served over https; stored hashed on the server) on **every** request, and a CSRF token on every change |
| Ownership on **every request**, from the project's customer | `ownDeliverable` joins deliverable → project → customer; the reference in the address is never a key by itself |
| A made-up, foreign or unpublished reference are **indistinguishable** | all three answer **404** with the same body (tested for the list, the page, every write, and for the page in the browser) |
| No internal data | the customer's read model (`views.ts`) selects named columns: never `internal_description`, never a private note, never an administrator's address, never a draft version, never another customer's comments |
| The page is private | `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, no canonical, no sitemap entry |
| Nothing about it is measured | the portal's addresses are collapsed to `/client-portal` before any analytics provider sees them; a provider with consent still receives no event from a portal address |
| No tokens or addresses in logs | access lines carry the method, path, status and a request id. The path holds references (`PRJ-…`, `DLV-…`), which are not secrets and grant nothing; a preview address is in a **body**, never in a path or a query, and is not logged. The deliverable tests assert that no private word reaches a log line |

## 2. The address itself

An address is accepted only if `parsePreviewUrl` (one function, `preview.ts`) says so:

* the scheme is **`https`** (no `http`, `javascript:`, `data:`, `file:`, `blob:`, protocol-relative `//…`);
* **no user name or password** (`https://user:pass@host`), **no port**;
* the host is an ordinary **public host name** (dotted labels), not an **IP address**, not `localhost`, not a name that only exists inside a network (`.local`, `.internal`, `.intranet`, `.lan`, `.home`, `.corp`, `.onion`);
* **printable ASCII only**, no whitespace or control characters, at most **2000** characters; it is stored as the URL parser wrote it (so a `<script>` in a path is stored percent-encoded, never as markup);
* the database repeats the cheap part (`https://`, length, printable ASCII) as a `CHECK`.

**The server never fetches an address.** Nothing here makes a request to a preview host: no proxy, no thumbnail, no "is it up?" check, no oEmbed, no redirect following. That removes the whole class of server-side request forgery. A redirect is never *issued* either: no answer of the portal carries a `Location` that came from a stored address (tested).

## 3. Opening a preview

Every preview is, first of all, a **link**: `target="_blank" rel="noopener noreferrer nofollow external"`. The page says which host it goes to (*"This goes to previews.example.com and opens in a new tab"*). `noopener` cuts the new tab's access to the portal, `noreferrer` stops the portal's address from being sent, and there is no `javascript:` form because the scheme is checked.

## 4. Showing a preview inside the portal (opt-in)

By default **nothing is embedded**: `frame-src 'none'` is the site's policy everywhere, and an address is a link. The owner can allow **exact origins**:

* **`PREVIEW_ORIGINS`** (backend): comma-separated `https://host` origins. The backend marks a version `embeddable` **only if the origin of its address is exactly in the list**. `https://previews.example.com.evil.test`, `https://sub.previews.example.com`, `https://evilpreviews.example.com` and `https://previews.example.com@evil.test/` are all **not** embeddable (tested). A picture's origin **must** be in the list or the version is refused.
* **`VITE_PREVIEW_ORIGINS`** (build): the same list. The build adds it to the Content-Security-Policy of **`/<lang>/client-portal/*` only** (`frame-src` and `img-src`); every other page keeps `frame-src 'none'`, and `script-src`, `style-src` and `connect-src` never get it.
* **Config guards.** An entry must be an exact https origin: no `*`, no wildcard host, no path, query or fragment, no credentials, no IP address, no `localhost`/internal name; and it must **not be this site's own origin or the API's** (the backend refuses to start). The build ignores a bad entry and says so.
* **The frame is sandboxed**: `sandbox="allow-scripts allow-same-origin allow-forms"`, **no** `allow-top-navigation`, `allow-popups`, `allow-modals`, `allow-downloads` or `allow-pointer-lock`; `allow=""` (no camera, microphone, geolocation, payment…), `referrerpolicy="no-referrer"`, `loading="lazy"`. `allow-same-origin` lets the previewed site keep its own storage and load its own fonts; because the origin **is never ours** (the guard above), it gives the frame nothing of the portal's. If the owner would rather have no scripts at all, they should not list the origin: it becomes a link.
* **If the page cannot be embedded** (the preview host sends `X-Frame-Options` or its own `frame-ancestors`), the browser shows an empty frame: the page says *"If it does not load, open it in a new tab"* and the link is always there.
* **The picture** is drawn with `referrerpolicy="no-referrer"` and never from an unlisted origin.

### Hosts that join headers

The static server inside the backend applies the **last** matching rule of `dist/_headers`, so the portal's policy replaces the general one. Cloudflare Pages and similar hosts **join** the values of several matching rules, so both policies apply and the stricter `frame-src 'none'` wins: **embedding silently stays off** (it fails closed, and every preview stays a link). To embed on such a host, serve the portal's policy from that host's own configuration instead (the owner's step, in LAUNCH_CHECKLIST.md). This project is served by its own backend (Render) behind Cloudflare, so the generated file is used as written.

## 5. What this does not protect against

* **The owner's own preview host.** Whatever is at the address is what the customer sees; the fingerprint of a version covers the *address and words*, **not the content behind it**, which the owner can change without publishing a new version. For anything that must be exact, use a **versioned address** (a path or subdomain per version), or a picture.
* **A malicious or compromised preview host.** It runs in a sandbox with no access to the portal, but it can show the customer a misleading page. Only list origins you control.
* **The customer's own device and the e-mail account** that receives their sign-in links (as for the rest of the portal).
* **Availability.** If the preview host is down, the customer sees an empty frame or a failed link; nothing in the portal depends on it.
* **No malware scanning** is needed because **no file is ever stored or served**; that is the reason uploads do not exist.
