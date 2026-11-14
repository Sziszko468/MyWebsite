# CMS security

The review PROMPT 22 asked for, written against the code as it is. The CMS is part of the existing backend: it uses the same sessions, CSRF rule, permissions, rate limiter, audit log and Content-Security-Policy as before, and none of those was loosened. Evidence is in `server/test/security.test.ts`, `server/test/cms22.test.ts`, `server/test/projects.test.ts` and `tools/e2e/security-probe.mjs` (95 checks against a real process).

## Who may do what

- **Every administration route needs a session.** `app.ts` rejects a request without one before a handler runs (401), and each operation then checks its own permission: `content:write` for editing, preview links, pictures and the profile, `content:delete` for deleting a project or a picture (administrators only; the editor role gets 403). The probe tries every administration route with every method without a session and accepts only 401, 404 or 405; the new routes (`preview-links`, `media/:id/replace`, `media-storage`, `profile`) are in its list.
- **CSRF and origin.** Every state-changing administration request needs the CSRF token and a same-origin request (a missing token is 403, a foreign origin is 403 even with the token). The new routes use the same wrapper; `cms22.test.ts` checks the missing token on preview links and the profile.
- **IDOR.** An identifier that is not a number, a preview link that does not belong to the project in the path, and a picture id that does not exist are 404, never another record. A preview link opens exactly one project.

## Drafts never leak

The public API, the list, the project address, the sitemap and the prerendered pages show a project only while it is published, has a page, and has something to say in that language. A draft's address is 404 with `noindex`. A section the owner hid is removed on the server before the answer is built, and the internal title never appears in a public answer (tested: the string is searched for in the response). Previews are the only way to read a non-public project, and each is gated (session or secret, below).

## Preview links

A **bearer secret**. 256 random bits (43 base64url characters); **only its SHA-256 is stored**, so a copy of the database opens nothing; the secret is shown once, at creation, and is not in the list of links, in the audit log or in any log. A link:

- names one project and shows it in whatever state it is in;
- lives 1 to 30 days (default 7) and can be withdrawn at any moment; a project may have at most ten active links;
- when opened is answered `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow` and `Referrer-Policy: no-referrer`; the page carries a `no-referrer` meta as well, so the secret in the address does not travel to anything the page links to;
- is never in a list or a sitemap; its page is `noindex`;
- an **unknown or malformed secret is 404 in the same words**; a real one that has ended is 410 ("withdrawn" or "expired"); failed guesses are counted per address by the same `tokenMiss` limiter as customers' quote links (20 per 15 minutes).
Deleting the project deletes its links. The creation and withdrawal of a link are audited.

## Content, XSS and uploads

- No HTML, rich text or script is accepted or stored as markup anywhere: every text is plain text, the website draws text as text, and the administration's own pages do the same. Typing `<script>alert(1)</script>` into a block is stored as those characters and appears on the page as those characters (checked in the server test and in the browser journey). Addresses must be `https://` without credentials; `javascript:` and `http:` are refused.
- Uploads are decided by their own bytes (PNG, JPEG, WebP, GIF), with byte and pixel limits, a content-hash file name (the visitor's name is never a path), no SVG and no HTML; a mismatched type claim is refused. Served with `nosniff`, a `sandbox` CSP and an immutable cache. Path traversal variants are a plain 404.
- The Content-Security-Policy and the other security headers are unchanged (the build's `_headers` and the server's own); the new pages use no inline script and no new origin.

## Integrity

- **Transactions.** Replacing a picture changes every use and records the new picture in one transaction; the profile and every project save are single statements; the preview token insert and its audit line are made together.
- **Concurrent edits.** Saving a project or the profile sends the time it was read; a stale copy is 409 and nothing is overwritten (tested for both).
- **Accidental deletion.** Every delete asks first in the screen; the server also refuses to delete a picture anything uses, never deletes a customer record from the CMS, and a project's deletion leaves its pictures. Unpublishing deletes nothing.
- **Double click.** Publishing twice in a row has the same result as once; creating a preview link twice makes two links (visible in the list, withdrawable).
- **Audit log.** Every change names the actor, the action and the project's address, never its text or a secret.

## Known limits (stated, not hidden)

- The public lists are cached for 30 seconds by design; a withdrawn project is gone from its address and the sitemap at once, and from a browser that cached the list within half a minute.
- The preview token limiter is per address and in memory, like the others: it resets when the process restarts, and it counts the address the proxy reports (`TRUST_PROXY` must be set correctly in production; see the infrastructure audit).
- The "is the media folder on the application's filesystem" check is a heuristic, not proof (see [MEDIA_MANAGEMENT.md](MEDIA_MANAGEMENT.md)).
- A person who is sent a preview link can forward it. It ends by itself and can be withdrawn; that is the control, and the administration says so beside the "Make a link" button.

## Canonical host (documented, not changed)

The infrastructure audit's finding **I-1** is still open and **this work did not change it**: every page declares `https://szilardkiss.com/...` as canonical, but the apex answers `301` to `www`, which is where the content is. The cause is the build variable `VITE_SITE_URL` against the host Render makes primary. It is the owner's production decision (either set `VITE_SITE_URL=https://www.szilardkiss.com` and redeploy, or make the apex primary in Render or with a Cloudflare redirect rule; details in `docs/audit/INFRASTRUCTURE_AUDIT.md`). What the CMS adds follows whichever they choose: a project's canonical address is *computed* from the configured site address (`/<language>/work/<slug>/`), cannot be overridden per project (so no two pages can claim one address), and the live sitemap takes its origin from the sitemap the build wrote. Until the owner resolves I-1, project pages inherit the same contradiction as every other page.
