# Operations

How this website is kept running, and how it is brought back when something goes wrong. Written for PROMPT 25 (operational hardening and reliability) from what the code does and from what the owner reported. Nothing in these pages was checked against the live Render, Cloudflare or Google accounts: where a fact comes from the owner and has not been seen, it says so.

| Page | What it answers |
| --- | --- |
| [BACKUPS.md](BACKUPS.md) | What is backed up, when, how it is checked, how it is encrypted, where the key lives, what the administration shows |
| [RESTORE_DRILL.md](RESTORE_DRILL.md) | The exact commands to restore into a new empty place and prove the copy is good, with the evidence from the drill that was run |
| [INCIDENT_RUNBOOK.md](INCIDENT_RUNBOOK.md) | What to do, in order, when the site is down, a deploy is bad, a migration fails, backups stop, e-mail stops, or the database is lost |
| [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) | What to run before a release, which browser journeys to run and how, and what to look at after it |

The audit that found the gaps is in [../audit](../audit/README.md); what was changed for each finding is in [../audit/REMEDIATION_LOG.md](../audit/REMEDIATION_LOG.md).

## What PROMPT 25 added

| Area | What is there now | Where | How to see it |
| --- | --- | --- | --- |
| Backup reliability | every run is recorded (time, file count, bytes, SHA-256 of the database and of the manifest, encrypted or not, failure as a category); the upload is checked against what Drive reports before an older copy is deleted; a backup missing for 24 hours is run shortly after the server starts; optional AES-256-GCM encryption | `server/src/modules/backups/` (`artifacts`, `crypto`, `records`, `googleDrive`, `local`), migration `0040_operations_hardening.sql` | the System page of the administration; `npm run server:backup -- verify <folder>` |
| Migration safety | before pending migrations touch an existing database, a consistent copy is written next to it, opened and checked; a migration that fails leaves the database as it was and the message says where the copy is | `server/src/db/snapshot.ts`, used by `main.ts` and `cli.ts` | the System page (Database panel); the start-up log line "database snapshot written before migrating" |
| Command Center | one panel on the System page: last backup and its age, integrity, migrations and snapshots, disk space, e-mail set-up and delivery state, assistant verification, the client address the server sees, `TRUST_PROXY`, the commit that is running | `server/src/modules/system/operations.ts`, `src/admin/components/CommandCenter.tsx` | Administration → Settings → System (administrators only) |
| Deployment checks | CI also runs on the deployment branch and builds with the canonical address; `npm run check:deploy`; a manual, read-only smoke test of `/api/health` and `/api/ready` | `.github/workflows/ci.yml`, `smoke-ready.yml`, `scripts/check-deploy.mjs`, `scripts/smoke-ready.mjs` | the Actions tab; `npm run check:deploy` |
| Canonical host | one host everywhere (`https://szilardkiss.com`): the sitemap, canonical links and hreflang are checked against it in CI; an optional, off-by-default 301 safeguard in the server | `scripts/check-seo.mjs`, `server/src/http/canonical.ts`, `server/test/canonicalHost.test.ts` | `EXPECTED_SITE_ORIGIN=… npm run check:seo` |
| Admin route coverage | every route under `/api/admin` is found by asking the router and must have a line in the access policy; the test then checks 401, CSRF, origin and the editor/administrator split for each | `server/test/adminRoutePolicy.ts`, `server/test/adminRoutes.test.ts` | `npx vitest run server/test/adminRoutes.test.ts` |
| Journey stability | invisible `data-testid` hooks for toasts, statuses and the customer's booking page; the booking journey uses them; a ratchet stops new sentence-quoting assertions | `tools/e2e/selectors.cjs`, `server/test/journeySelectors.test.ts` | [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) |

## What the owner reported, and what is verified

The owner's answers are recorded here and in the [remediation log](../audit/REMEDIATION_LOG.md). **Unverified means unresolved**: no value below was seen in a dashboard by the person who wrote this, and no configuration value was invented to fill a gap.

| Item | The owner reported | Status |
| --- | --- | --- |
| Persistent disk | mounted at `/var/data` | **Unverified.** Check in Render → service → Disks, and that `DATABASE_PATH` and `MEDIA_DIR` are inside it. The System page's Database panel shows the free space of the folder the database lives in. |
| `TRUST_PROXY` | was `0` | **Unverified, and probably wrong.** Behind a proxy, `0` makes every visitor one address for the rate limits. The number must be measured, not guessed: see below. |
| Canonical host | `https://szilardkiss.com` (the apex) | **A decision, recorded and enforced in code and CI.** Production is not switched: it needs the manual steps below. |
| E-mail | Cloudflare Email Sending / SMTP `smtp.mx.cloudflare.net`; a test e-mail arrived | The test e-mail is a fact the owner saw. **SPF, DKIM and DMARC are unverified.** The e-mail page's checks (DNS lookups) show what a resolver sees; they were not run against the real domain. |
| Google OAuth consent screen | previously reported *In production* | **Unverified.** A client left in *Testing* ends its refresh token after 7 days and would silently stop the Drive backups (finding K-4). Check in the Google Cloud console. |

## The canonical host

Decision: **`https://szilardkiss.com`** (no `www`). In the code:

- `VITE_SITE_URL` (a build variable) is what the sitemap, the canonical links and the hreflang addresses are written with. CI builds with `https://szilardkiss.com` and `check:seo` fails if the built site declares any other host (`EXPECTED_SITE_ORIGIN`).
- `PUBLIC_URL` (a server variable) is the address links in e-mails and the sitemap served by the backend are made from. The server test `canonicalHost.test.ts` holds the sitemap's host to the host the redirect sends visitors to, and checks the Hungarian, English and Dutch routes.
- `CANONICAL_REDIRECT=true` makes the server answer a page request for any other host with a 301 to `PUBLIC_URL`'s. It is **off** by default, and it must never be switched on while a redirect rule in the DNS/CDN dashboard sends the traffic the other way, or the two redirect each other forever.

Manual steps for the owner, in this order, none of which was done by this work:

1. In Render, make the apex the primary custom domain and set `PUBLIC_URL` (and `API_PUBLIC_URL` if it is used) to `https://szilardkiss.com`; set `VITE_SITE_URL=https://szilardkiss.com` for the build.
2. In Cloudflare, make sure the only redirect rule sends `www` to the apex (and not the apex to `www`).
3. Deploy, then run the smoke test and the two `curl -I` checks in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
4. Only if a host other than these two can still reach the site (for example the `*.onrender.com` address), consider `CANONICAL_REDIRECT=true`, after step 2 is confirmed.

## Measuring `TRUST_PROXY`

`TRUST_PROXY` is how many proxies in front of the server append to `X-Forwarded-For`. Too low and everybody looks like the proxy's address (the limits count all visitors together); too high and a visitor can pick their own address. It depends on the chain in front of the server (here probably Cloudflare and Render's own proxy), which is why this page does not give a number.

1. Sign in as an administrator, from your own browser, and open Settings → System → Network.
2. The panel shows the address the server uses for you (with the current `TRUST_PROXY`), the connection's own address, the `X-Forwarded-For` chain and `CF-Connecting-IP` when Cloudflare sent it, and a verdict. When the Cloudflare address is found in the chain, it also shows the **measured number**.
3. The right value is the one for which "the address the server uses" is **your own public address**. Repeat from a second network (a phone off Wi-Fi) before changing anything.
4. Change `TRUST_PROXY` in Render's environment and redeploy. The panel must then say the address matches.

## What the Command Center does not show

No secret, key, token or password; no e-mail address, name or message of a customer. It shows counts, states, times, sizes and the names of things that are set. The tests (`systemOperations.test.ts`, `operationsConfig.test.ts`, `CommandCenter.test.ts`) fail if a configured secret value appears anywhere in the System answer.

## What was not done

- No production setting was read or changed: not Render, Cloudflare, Google Cloud, DNS or the e-mail provider. No deploy was started and nothing was merged into `main` or `deployment/render-cloudflare`.
- Nothing ran against the real Google Drive, the real e-mail provider or a real model. The Drive backup was tested against an in-memory stand-in that checks sizes and MD5 like Drive does; the restore against a scratch database.
- The migration number is **0040** because the Gmail work on `deployment/render-cloudflare` already uses numbers in the 30s; the runner accepts gaps, so the branches can be merged in either order. Confirm that when they are merged.
