# Platform overview (PROMPT 19, Phase 0)

Audit date: 2026-11-13. Audited commit: `77c0df4` (local `main`), work branch `audit/prompt-19-platform-audit`.
This file is the map. The other files in this folder hold the evidence: [Frontend](FRONTEND_AUDIT.md) · [Backend](BACKEND_AUDIT.md) · [Database](DATABASE_AUDIT.md) · [Infrastructure](INFRASTRUCTURE_AUDIT.md) · [E-mail](EMAIL_AUDIT.md) · [Security](SECURITY_AUDIT.md) · [AI](AI_AUDIT.md) · [Backup and recovery](BACKUP_AND_RECOVERY.md) · [Test results](TEST_RESULTS.md) · [Performance](PERFORMANCE_AUDIT.md) · [Roadmap dependencies](MASTER_ROADMAP_DEPENDENCIES.md) · [Remediation log](REMEDIATION_LOG.md).

## The brief and the real platform disagree

The audit brief assumes a **Django / Python** backend. **There is none.** No `manage.py`, `requirements.txt`, `pyproject`, `Dockerfile`, `Procfile` or `render.yaml` is tracked, and no Python or Django is used as infrastructure anywhere in the repository (the word appears only in portfolio skill texts). The audit therefore covers what exists:

| Layer | What it really is | Evidence |
| --- | --- | --- |
| Public website | React 19.3, TypeScript 6, Vite 8, React Router 8.5, SCSS modules with design tokens; prerendered to **91 static pages** (76 indexable) in hu / en / nl | `package.json`, `npm run build` output |
| 3D | Three.js 0.186 through `@react-three/fiber`, lazy loaded behind `SceneLayer` with fail-soft error boundaries and a quality governor | `src/components/SceneLayer`, `docs/mobile/README.md` |
| Backend | **Node ≥ 22.18**, TypeScript run natively (no build step), **`node:sqlite`**, one runtime package family (`ai`, loaded for the assistant); 139 files under `server/` | `server/src`, `package.json` |
| Database | SQLite file (WAL, foreign keys on), 44 tables, 8 migrations | [DATABASE_AUDIT.md](DATABASE_AUDIT.md) |
| Admin | React SPA at `/admin` over the JSON API (`src/admin`, 86 files), cookie sessions | `docs/admin/README.md` |
| E-mail | Outbox in the backend; providers `resend`, `smtp`, `file`; Cloudflare Email Routing is inbound only | [EMAIL_AUDIT.md](EMAIL_AUDIT.md) |
| AI | CONTROL ROOM AI: Vercel AI SDK 7 + `@ai-sdk/anthropic` 4, model locked in code to `claude-haiku-5-5` | [AI_AUDIT.md](AI_AUDIT.md) |
| Hosting (observed) | **Render** runs one Node process that serves the built site and the API, behind **Cloudflare** (proxied DNS, TLS) | live response headers `x-render-origin-server: Render`, `rndr-id`, `Server: cloudflare` |
| Hosting (in repo) | `wrangler.jsonc` + `worker/` describe a Cloudflare Workers deployment (language routing by country). **Not what serves `www.szilardkiss.com`** | [INFRASTRUCTURE_AUDIT.md](INFRASTRUCTURE_AUDIT.md) |

## Status of every feature named in the brief

Legend: **V** implemented and verified (a test or a live check ran and passed) · **IU** implemented, not verified · **P** partially implemented · **PL** planned, not implemented · **B** broken · **D** deprecated · **U** unknown.

| Feature in the brief | Status | Basis |
| --- | --- | --- |
| React / TypeScript / Vite | V | typecheck, lint, 2 149 tests, production build and `check:seo` pass |
| Python / Django backend | **PL / does not exist** | not in the repository; the Node backend is the backend |
| Existing database and migrations | V | 8 migrations applied to a scratch database; integrity, FK checks pass |
| Render hosting | V (observed) / U (settings) | live headers prove Render serves the site; the dashboard was not accessible (login) |
| Cloudflare domain and infrastructure | V (observed) / U (settings) | public DNS and headers read; the dashboard was not accessible (login) |
| Transactional e-mail | IU | code and its tests pass; **no real send, DNS authentication absent** (see E-mail) |
| HU / EN / NL localization | V | `i18n:check` 2 587 texts × 3 languages, Hunspell spelling 0 unknown words |
| Racing Red design system | V | design audit (`audit-design.cjs`), token files present |
| Three.js / WebGL experiences | V | five Lab experiences, no-WebGL and context-loss audit (see Performance) |
| Premium Shop (catalogue → request → quote) | V | `quote-journey` 20/20, phone path in `journeys` D; inquiry based, no payment |
| FULL EXPERIENCE configurator | V | `shop-journey` 41/41 incl. the configurator end to end on a phone (201, confirmation, administrator sees every answer); backend tests |
| Dynamic portfolio | V | CMS journey, security probe (drafts invisible to the public) |
| Admin Dashboard | V | 94/94 security probe checks, 66 admin routes × 5 methods |
| CONTROL ROOM AI | IU | built, 99 AI tests pass; **no live Anthropic call was made**, assistant is off in production (`/api/ai/config` → `available:false`) |
| Quote-based ordering | V | quotation tests, `quote-journey` 20/20 incl. customer acceptance on a phone, customer links answer 200 / no-store / noindex live |
| Edge language routing (PROMPT 18) | **IU, and not in the production path** | the Worker's unit tests pass; Render, not the Worker, answers `www` |
| Automatic Google Drive backup | IU | **no test existed**; 6 added (stand-in Drive); never run against real Google |
| Consultation booking, client portal, project management, BI, PWA, automation center, monitoring stack | PL | see [MASTER_ROADMAP_DEPENDENCIES.md](MASTER_ROADMAP_DEPENDENCIES.md) |

## Git and deployment state

| Item | Finding |
| --- | --- |
| Remote | `https://github.com/Sziszko468/MyWebsite.git` |
| Branches | local `main` (`77c0df4`), `origin/main` (`254a202`), `origin/deployment/render-cloudflare` (`a75fa42`) |
| Working tree | clean when the audit started |
| Deployment branch | by name and content, `deployment/render-cloudflare` (the branch holding the Drive-backup and e-mail commits). The **trigger configuration lives in the Render dashboard and was not readable** |
| Divergence | `origin/main` is **10 commits behind the code that runs** and carries one commit (`254a202`) that is the same patch as local `38e2374` on a different parent. Local `main` is ahead of the deployment branch by two commits (`38e2374` Worker and language tests, `77c0df4` `.env.example`). A plain `git push origin main` would be rejected; it must not be forced |
| CI | `.github/workflows/ci.yml` runs on **push to `main` and on pull requests only**. A push to `deployment/render-cloudflare` runs **no checks** (and deploys, if Render auto-deploy is on) |
| Nothing was merged, pushed or deployed by this audit | |

## Where to go next

The ranked list of findings is in [SECURITY_AUDIT.md](SECURITY_AUDIT.md) (security and operations) and [REMEDIATION_LOG.md](REMEDIATION_LOG.md) (what was changed). The proposed scope of PROMPT 20 is at the end of [MASTER_ROADMAP_DEPENDENCIES.md](MASTER_ROADMAP_DEPENDENCIES.md).
