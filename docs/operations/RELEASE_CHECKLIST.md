# Release checklist

The order to follow before the deployment branch is updated, and what to look at afterwards. A release here means: the commit that the host builds and runs. **Nothing on this page deploys anything**: the CI workflow only runs checks, the smoke test only reads two public endpoints, and the host deploys when the branch it follows changes.

## 1. Before pushing to the deployment branch

Run on the commit that is about to go out, on a clean checkout of it.

```bash
# The five checks CI runs, in order, stopping at the first failure: typecheck, lint, tests, build, SEO checks on what the build wrote.
VITE_SITE_URL=https://szilardkiss.com EXPECTED_SITE_ORIGIN=https://szilardkiss.com npm run check:deploy
```

Without the two variables the build is deliberately `noindex` and the SEO check has no host to hold the sitemap against; with them it fails if any page, the sitemap or an hreflang address names another host. `npm run check:deploy -- --keep-going` runs every step and lists all failures.

Also:

- [ ] CI is green on the commit, including on the deployment branch (the workflow now runs on a push to it, not only on `main` and pull requests).
- [ ] The language checks pass (`npm run i18n:check`, `npm run i18n:validate`; CI installs the spell checker for its run, locally Hungarian spelling is reported as *not checked* without it, never as passed).
- [ ] A change to the database has a migration, and a test that upgrades a database from an older version (`migrationSnapshot.test.ts` has one).
- [ ] A new admin route has a line in `server/test/adminRoutePolicy.ts` (the test `adminRoutes.test.ts` fails until it does).
- [ ] No new variable is missing from `.env.example`.
- [ ] The release's host settings that need the owner (a variable, a DNS record, a dashboard rule) are written down in the pull request, not assumed.

## 2. Browser journeys

The journeys drive a real Chrome against the **built** website served by the **real** backend (one process, one origin, a throw-away database, the `file` e-mail provider). They are not part of `npm test` and not part of CI: Playwright is not a dependency of the project, and the journeys take minutes. Set-up is in [tools/e2e/README.md](../../tools/e2e/README.md).

Run the ones that cover what changed; run **all** of them before a release that touches the administration, the forms or the e-mails.

```bash
# The website, built to talk to the backend on its own origin (NOT the production build: that one has no backend address)
MSYS_NO_PATHCONV=1 VITE_API_URL=/ VITE_SITE_URL=https://example.test npm run build
# Then a FRESH scratch backend per journey (see the README for its environment), and:
AUDIT_PLAYWRIGHT=<path to playwright> AUDIT_AXE=<path to axe.min.js> node tools/e2e/<journey>.cjs --base=http://127.0.0.1:<port> --mail=<mail folder> --email=<admin> --password=<password> [--only=…] [--width=…] [--out=<screenshot folder>]
```

| Journey | Covers | Server |
| --- | --- | --- |
| `journeys.cjs` (A to E) | recruiter, client request, administrator, phone, hidden experience | fresh; sign-in is limited to 10 per 15 minutes |
| `shop-journey.cjs`, `shop4-journey.cjs` | the shop, the package finder, add-ons, FULL EXPERIENCE | fresh; `shop4` part F needs `RATE_LIMITS=false`, part G the real limits on a fresh server |
| `quote-journey.cjs`, `quote-lifecycle-journey.cjs`, `quote-languages-journey.cjs` | quote requests and quotations, per language, on a phone | fresh; the lifecycle one needs `VITE_API_URL=/` and takes `--customer-width` |
| `booking-journey.cjs` | the consultation booking, the customer's page, the owner's answers, axe on every screen | fresh, **`RATE_LIMITS=false`** (one visitor may book six times in 15 minutes) |
| `cms-journey.cjs`, `cms22-journey.cjs` | the portfolio CMS, blocks, previews, pictures | fresh for each run |
| `ai-journey.cjs` | the assistant, against a local stand-in for the model (nothing is spent) | fresh; needs the stand-in (`tools/e2e/anthropic-standin.ts`) |
| `localization-journey.cjs`, `l10n-journey.cjs` | three languages end to end; the country step | the country step needs a second backend with `COUNTRY_HEADER=CF-IPCountry`, or `wrangler dev` locally (the country is simulated; no Cloudflare account is touched) |

A journey that fails is a finding until proven otherwise. Do not edit an expectation to make it pass without reading the page and the server log first.

### How the journeys find things

- **Accessible names stay.** `getByRole(…, { name })` and `getByLabel` are the accessibility contract: a journey that finds a control that way also proves a person with a screen reader can. They are not replaced.
- **Outcomes use the page's invisible hooks, not its wording.** A toast, a status, a field error, a booking's state carry `data-testid` and `data-*` attributes that say what happened (`tools/e2e/selectors.cjs` lists them and how to wait for a toast that is *newer* than the last one). A journey that waits for "The settings are saved." breaks when the sentence is reworded or translated, for a reason that is not a defect.
- **What may still quote text:** the translations of one screen per language (the sentence is the thing under test) and data the journey created itself (a reference, a name).
- **A ratchet holds the line.** `server/test/journeySelectors.test.ts` counts the literal `getByText('…')` assertions per journey and fails if the number goes **up**, or goes down without the baseline being lowered. Every `data-testid` a journey asks for must exist in the website's source, so removing a hook fails a unit test and not only the next manual run.
- **Status of the conversion.** The booking journey no longer quotes any sentence and was run (40 checks, 0 failed, axe included). The others still do (87 assertions in total, counted in the test): they are converted when somebody changes that part of the product and can run the journey, one journey at a time.

## 3. Pushing

- [ ] Push to the branch the host deploys from **only with the owner's go-ahead**. Never force-push; never push `main` from here.
- [ ] If the release has a **migration**, check free disk space first (System page, Database): the snapshot is a full copy of the database, written before anything is migrated.
- [ ] If the release **changes the canonical host**, do the dashboard steps in [README.md](README.md#the-canonical-host) in the order given, and not `CANONICAL_REDIRECT` yet.

## 4. After the deploy

Wait until the host says the deploy is live, then:

```bash
npm run smoke:ready -- --url=https://szilardkiss.com        # or: Actions → "Smoke test a deployed site (manual)"
curl -sI https://www.szilardkiss.com/ | head -5               # expect a 301 to https://szilardkiss.com/ (the dashboard rule); a 200 or a redirect the other way is a finding
curl -sI https://szilardkiss.com/ | head -5                   # expect 200 or the language redirect, never a redirect to www
curl -s https://szilardkiss.com/sitemap.xml | head -5         # every <loc> on https://szilardkiss.com
```

The smoke test is read-only: `GET /api/health` and `GET /api/ready`, no cookie, no body. It reports a redirect as a failure on purpose: test the canonical address.

Then, signed in as an administrator, on the System page:

- [ ] Deployment: the commit is the one that was pushed.
- [ ] Database: migrations current; after a migration release, a new snapshot is listed.
- [ ] Backup: state *ok* (after the first run following the deploy, within a day); encrypted: yes, if a key is set.
- [ ] E-mail: sending on, no failed deliveries piling up.
- [ ] Network: the address the server sees for **you** is your own (the `TRUST_PROXY` measurement, README).
- [ ] Assistant: available, if it is switched on.

## 5. If it is wrong

[INCIDENT_RUNBOOK.md](INCIDENT_RUNBOOK.md): redeploy the last good commit first; the database needs touching only if a migration ran and its result is wrong.
