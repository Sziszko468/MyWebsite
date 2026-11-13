# Infrastructure audit (Render, Cloudflare, Git)

**What could and could not be inspected.** The built-in browser was **not signed in** to Render or Cloudflare (both showed their sign-in pages), and signing in is the owner's act: no password was entered and no dashboard was read. Everything below is from (a) the repository, (b) **read-only requests to the public site and public DNS** (`GET`/`HEAD`, `nslookup`; nothing was posted, changed or load-tested), and (c) the project's own docs. Items that only the dashboards can answer are listed as **owner checks** with the exact place to look. Nothing was deployed, no DNS or proxy setting was changed, no secret was displayed.

## What the live site shows (2026-11-13)

| Observation | Value | Meaning |
| --- | --- | --- |
| `https://szilardkiss.com/` | `301` → `https://www.szilardkiss.com/` | the apex redirects to `www` |
| `https://www.szilardkiss.com/` | `200`, `x-render-origin-server: Render`, `rndr-id`, `Server: cloudflare` | **Render serves the site; Cloudflare proxies it** (orange cloud) |
| `/api/health`, `/api/ready` | `200`; ready → `database: ok, migrations: current, email: configured` | the Node backend (not only static files) runs on Render and its schema is current |
| `http://www…` | `301` → `https://www…` | HTTPS enforced |
| HSTS | `max-age=31536000` (no `includeSubDomains`, no `preload`) | good baseline, not preloadable |
| CSP | `default-src 'self'; script-src 'self' 'sha256-…'; style-src 'self' 'sha256-…'; style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests` | strict: no inline script, no third party, only inline style *attributes* |
| Other headers | `x-frame-options: DENY`, `x-content-type-options: nosniff`, `referrer-policy: strict-origin-when-cross-origin`, `cross-origin-opener-policy: same-origin`, a `permissions-policy` denying 14 features | complete |
| Static assets | `Cache-Control: public, max-age=31536000, immutable` (hashed names) | correct |
| HTML pages | no `Cache-Control`; `cf-cache-status: DYNAMIC` | not edge-cached; correct for a site that is edited |
| Sensitive paths | `/.env` 404 JSON, `/data/app.sqlite` 404, `/server/src/config.ts` 404 | no file is served from outside `dist/` (the static server serves only a list of web file types and nothing hidden) |
| Customer links | `/hu/quote/<43-char token>`, `/en/request/<…>`, `/nl/quote/<…>` → `200`, `Cache-Control: no-store`, `x-robots-tag: noindex, nofollow`, `referrer-policy: no-referrer` | the e-mailed links work on Render and are private by header |
| `/api/ai/config` | `available: false` | the assistant is **off** in production, as intended until the model is verified |

## DNS (public records, Cloudflare nameservers `jessica` / `dilbert`)

| Record | Value | Assessment |
| --- | --- | --- |
| `A` apex and `www` | `188.114.96.7`, `188.114.97.7` (Cloudflare anycast) | proxied |
| `MX` | `route1/2/3.mx.cloudflare.net` (priorities 71, 11, 99) | **Cloudflare Email Routing is set up for inbound mail** |
| `TXT` apex | `v=spf1 include:_spf.mx.cloudflare.net ~all` | SPF authorises **only** Cloudflare's routing. No sending provider is in it |
| `TXT _dmarc` | `v=DMARC1; p=none;` | monitoring only, **no `rua`/`ruf`** reporting address, so nothing is learned |
| `TXT resend._domainkey`, `send.*` | **not found** | no DKIM or return-path records for Resend (or any other provider) exist on this domain |
| `CAA` | none observed | any CA may issue; optional hardening |
| `TXT _domainkey` | none | |

Consequence for outbound e-mail: [EMAIL_AUDIT.md](EMAIL_AUDIT.md) (finding **E-1**, High).

## Render (what to check; read-only)

The repository contains **no Render blueprint** (`render.yaml`), so the service is configured only in the dashboard. Open each item and note the answer in [REMEDIATION_LOG.md](REMEDIATION_LOG.md):

| # | Dashboard place | Expected | Why it matters |
| --- | --- | --- | --- |
| R-1 | Service → **Disks** | one persistent disk, mount path = folder of `DATABASE_PATH` and `MEDIA_DIR`; free space | **without it the database is wiped on every deploy** ([DATABASE_AUDIT.md](DATABASE_AUDIT.md)) |
| R-2 | **Environment** (names only) | `APP_ENV=production`, `APP_SECRET`, `PUBLIC_URL`, `API_PUBLIC_URL`, `STATIC_DIR`, `DATABASE_PATH`, `TRUST_PROXY`, the e-mail group, `GOOGLE_DRIVE_*`, `BACKUP_*`; **no** `ANTHROPIC_MODEL` (it is refused) | start-up validation names any missing or wrong variable in the logs |
| R-3 | Environment → `TRUST_PROXY` | a number matching the real proxy chain (Cloudflare + Render ≈ 2; **measure**, see below) | rate limits and the sign-in lock use it ([BACKEND_AUDIT.md](BACKEND_AUDIT.md) B-1) |
| R-4 | Settings → **Build & Deploy**: build command, start command | build runs `npm ci` (all dependencies) then `npm run build`; start `npm run server:start` (or the same through `node`); Node version pinned to ≥ 22.18 (`NODE_VERSION` or `.node-version`) | `node:sqlite` needs it |
| R-5 | Settings → **Health Check Path** | `/api/health` (liveness) or `/api/ready` (readiness) | automatic restarts and zero-downtime deploys |
| R-6 | Settings → **Branch** and **Auto-Deploy** | the deployment branch (`deployment/render-cloudflare`), auto-deploy on or off as the owner wants | see Git below |
| R-7 | **Events / Deploys** | recent deploys succeeded; the last deploy commit | which commit runs |
| R-8 | **Logs** (filter `warn`) | no `TRUST_PROXY is 0`, `RETENTION_DAYS is not set`, `EMAIL_WEBHOOK_SECRET`, `Google Drive backup … failed` lines | the server logs every misconfiguration it can see |
| R-9 | Plan | an **always-on** instance (not a free plan that sleeps) | the in-process timers (outbox, backup at 03:00 UTC) only run while the process runs |
| R-10 | Custom domains | `www` primary (or `szilardkiss.com`, see canonical finding) with a verified certificate | |
| R-11 | Instances | exactly **1** | SQLite single writer, in-memory limits |

To **measure** `TRUST_PROXY`: every administrator session stores a keyed hash of the address the server believes the client has (`admin_sessions.ip_hash`; the administration itself does not display it). Set `TRUST_PROXY=2`, then sign in once from home Wi-Fi and once from a phone on mobile data. In the Render Shell, run a read-only query on a **copy** of the database (`npm run server:backup -- /tmp/check.sqlite`, then `SELECT substr(ip_hash,1,8), created_at FROM admin_sessions ORDER BY created_at DESC LIMIT 5`): the two prefixes must **differ**. If they are equal, the number is too low (every visitor shares the proxy's address); if a request with a forged `X-Forwarded-For` header changes the prefix, it is too high. There is no built-in screen for this; adding "the client address as seen" to the administration's System page is a good PROMPT 20 item.

## Cloudflare (what to check)

| # | Place | Expected | Notes |
| --- | --- | --- | --- |
| C-1 | DNS | `www` and apex proxied; the records above | read from public DNS: matches |
| C-2 | SSL/TLS → Overview | **Full (strict)** | with Flexible, Cloudflare talks to Render over http; Render's certificate makes Strict work. Not readable from outside |
| C-3 | SSL/TLS → Edge Certificates | Always Use HTTPS on; minimum TLS 1.2; HSTS is already sent by the origin | |
| C-4 | Rules → Redirect Rules | one canonical host (see below) | |
| C-5 | Network → **IP Geolocation** | on (adds `CF-IPCountry` to origin requests) | only needed if the origin should read the country |
| C-6 | Email → Email Routing | the rules and the **verified destination address** | MX/SPF are in place; the rule and destination are not visible from outside |
| C-7 | Workers & Pages | the Worker `mywebsite` | exists per the repository's notes; **not in the request path** of `www` (Render answers), so its language routing never runs on production |
| C-8 | Security → WAF / Bot Fight / rate limiting | optional: a rule limiting `POST /api/*` and `/api/admin/login` per IP at the edge | complements B-1/B-2 |

## Country headers for IP-based localization

- The Worker (`worker/routing.ts`) reads **only `request.cf.country`**, which exists only inside a Cloudflare Worker and cannot be forged by a visitor. That is the correct trusted source.
- **It is not in the production path.** `www.szilardkiss.com` is answered by Render; Cloudflare only proxies. Evidence: live `GET /` with `Accept-Language: en` and `nl` both return the Hungarian page with `200` (no redirect), and responses carry Render's headers, not a Worker's.
- The Node origin does **not** read `CF-IPCountry` (grep: no occurrence), and should not be made to: any client that reaches the origin directly (the `*.onrender.com` address, unless Render access is restricted) can send that header. A trusted country at the origin would need origin lock-down (Cloudflare Authenticated Origin Pulls or Render's IP allow-list), which is more infrastructure than the feature is worth.
- Options for the owner: (1) accept client-side language choice (current behaviour: the page's own detection and the `cc_lang` cookie); (2) serve the static site from Cloudflare Workers as `wrangler.jsonc` was written for, keep Render for `/api/*` and `/admin` only (a route split: this is a hosting change and was **not** made); (3) leave the Worker undeployed and delete it later. Documented in [REMEDIATION_LOG.md](REMEDIATION_LOG.md) as decision D-2.

## Canonical host conflict (finding I-1, High for SEO)

Every page declares `<link rel="canonical" href="https://szilardkiss.com/hu/">`, the sitemap and `hreflang` list apex URLs, and `robots.txt` points at `https://szilardkiss.com/sitemap.xml`. **But the apex answers `301 → www`, and `www` is where the content is.** A canonical that redirects to the page declaring it is a contradictory signal on all 76 indexable pages, and `hreflang` alternates that redirect are not valid return links. Cause: `VITE_SITE_URL=https://szilardkiss.com` (set by commit `77c0df4` in `.env.example`, and in the build environment) versus the host Render makes primary.

Fix (owner's choice, **either one**; both need a rebuild/deploy or a dashboard change and so were not done):
1. **Make the declared host the real one:** set the build variable `VITE_SITE_URL=https://www.szilardkiss.com` in Render and redeploy. One variable; canonicals, sitemap, hreflang, `robots.txt` and structured data all follow (`npm run check:seo` verifies them).
2. **Make `szilardkiss.com` primary** (matches "the final domain is `szilardkiss.com`"): in Render → Custom Domains make the apex primary so `www` redirects to it, or add a Cloudflare Redirect Rule `www → apex`.

## Git and deployment workflow

| Item | Finding |
| --- | --- |
| Remote | `Sziszko468/MyWebsite` on GitHub |
| Branches | `main` (local `77c0df4`), `origin/main` (`254a202`), `origin/deployment/render-cloudflare` (`a75fa42`) |
| Which branch is live | the live build's `main-<hash>.js` differs from a fresh local build (different commit or environment); the deploy branch cannot be read from outside. Treat `deployment/render-cloudflare` as production until R-6 says otherwise |
| Divergence | `origin/main` lacks the 10 commits between `e9b9469` and `a75fa42` (Drive backup, e-mail layout) and holds `254a202`, the same patch as local `38e2374` on another parent. **Do not force-push.** A safe way to realign (owner's decision, not done): merge `origin/main` into local `main` (the identical patch merges cleanly), review, push `main`; and fast-forward the deployment branch only when a deploy is wanted |
| CI | `ci.yml` triggers on `push: [main]` and `pull_request`. **A push to the deployment branch runs no CI**, and is deployed if Render auto-deploy is on (R-6) (finding I-2, Medium). Fix: add `deployment/render-cloudflare` to the `push` branches (a one-line change, safe, **not applied** because it changes what runs on the owner's repository) |
| Deployment trigger | not visible (dashboard) |
| Secrets in Git | none: `.env` is ignored and untracked; secret-pattern scans of every tracked file, all branches' history and the built bundle found no key (only placeholders and UI text naming variables) |
| Local note | a stale `node server/src/main.ts` from 11 Nov still listens on `127.0.0.1:8788` on this development machine (not mine, left running) |

## Production / development separation

`APP_ENV=production` turns on: https-only origins, `Secure`/`__Host-` cookies, HSTS, refusal of `file` e-mail and of `none`/unverified SMTP TLS, a required 32-character `APP_SECRET`, refusal of an in-memory database. The repository has only one environment file template (`.env.example`); no staging service was found. Development and production cannot be confused by configuration (production refuses the development shortcuts), but there is **no staging**: every deploy goes straight to the live site.
