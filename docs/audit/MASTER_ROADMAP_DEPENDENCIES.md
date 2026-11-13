# Master roadmap dependency audit

The real codebase compared with the planned modules. Nothing here was implemented during the audit. "Existing" means present in the repository and tested; "missing" means absent. Every module must keep: **one database (SQLite), one e-mail system (the outbox), one authentication system (administrators and editors in `admin_users`; customers by tokenised link), Haiku 5.5 as the only model, Render + Cloudflare hosting.**

## Foundations every module stands on (and their state)

| Foundation | State | Blocks |
| --- | --- | --- |
| Persistent database and media disk | **unverified** (D-1) | everything that stores data |
| Outbound e-mail authentication | **missing** (E-1) | quotes, booking, client communication, portal, marketing, automation |
| Correct client address for limits (`TRUST_PROXY`) | **unverified** (B-1) | every public form and the AI |
| Canonical host | **conflicting** (I-1) | SEO, marketing, analytics attribution |
| Backups: freshness, encryption, verified restore | **partial** (K-1…K-4) | any growth in stored data |
| CI on the deployed branch, staging | **missing** (I-2, I-5) | safe delivery of every later module |
| Observability (uptime, alerts, error tracking) | **missing** | operating anything unattended |

## Modules

Order numbers refer to the sequence at the end.

### 1. Premium Shop 4.0 (order 6)
- **Existing:** inquiry-based shop: landing, four service pages, package pages, tier comparison, FULL EXPERIENCE offer and configurator, cart, six-step builder; prices server-side only; catalogue editable in the administration (`ServicesPage`, `CatalogEditPages`, `ShopComparisonPage`, `ShopOfferPage`); a **publish** action calls `DEPLOY_HOOK_URL` so edits reach the prerendered site.
- **Missing:** payment (deliberately absent), live catalogue without a rebuild, bundles/discounts, order history.
- **Reusable:** `src/shop`, `components/shop`, `server/modules/{catalog,shop,quotes}`, the catalogue overlay.
- **Backend / DB / admin:** `catalog`, `shop`; `services`, `packages`, `extras`, `shop_documents`, `site_content`; the editors above.
- **Security:** keep server-side pricing; if payment arrives use a hosted checkout (no card data on the server), webhook signatures like `webhook.ts`.
- **Risk:** the build-time catalogue overlay means a price change is live only after a deploy; with no CI on the deploy branch (I-2) a bad catalogue ships unchecked.

### 2. Quote Management (order 5, polish)
- **Existing:** requests → versioned quotations → customer accept / decline / ask-for-changes through private links; immutability triggers on sent quotes; events log; confirmations; three-language e-mails; admin screens (`QuotesPage`, `QuoteDetailPage`, `QuotationPage`); CSV/JSON export.
- **Missing:** PDF, e-signature, expiry reminders, invoicing, deposit handling.
- **Reusable:** `quotes/*`, `customer_action_tokens`, `quote_events`, `quoteTemplates.ts`.
- **Security:** token hashing and expiry exist; any PDF must be generated server-side from frozen versions.
- **Risk:** **E-1**: until the domain authenticates outbound mail, the main customer touchpoint is unreliable.

### 3. Dynamic Portfolio CMS (order 4)
- **Existing:** projects with draft / publish / archive / duplicate / preview, media upload (hash names, sniffed types), wording overrides (668 keys), settings, public API, build-time prerender of published projects.
- **Missing:** version history, scheduled publishing, block-based content beyond the fixed schema, video.
- **Reusable:** `modules/{projects,media,texts}`, `ProjectEditPage`, `ProjectCard`, `tools/images`.
- **Security:** upload rules are tested (probe §6b); drafts invisible to the public.
- **Risk:** media lives on local disk and is **re-uploaded in full by the daily Drive backup** (K-8: cost grows with the archive; use incremental or object storage before the media set grows).

### 4. Localization Engine (order 4)
- **Existing:** hu / en / nl, 2 587 texts, CI checks, spelling checks, admin wording editor, edge-Worker routing (not live), `cc_lang` cookie.
- **Missing:** database-managed translations for all content, a workflow for translators, a fourth language path, locale-aware formatting beyond currency.
- **Reusable:** `src/i18n`, `TranslationsPage`, `TextsPage`, `catalog/translations.ts`.
- **Risk:** I-4 (the country router does not run on Render); adding a language touches the prerender, sitemap, hreflang and the e-mail templates.

### 5. Consultation Booking (order 8)
- **Existing:** nothing but the contact and quote forms.
- **Missing:** availability rules, slots, time zones (Hungary / Netherlands, DST), calendar sync, reminders, cancel / reschedule links.
- **Reusable:** the token-link pattern, the e-mail outbox, rate limits, the admin list/detail pattern.
- **Backend / DB:** a `bookings` module and tables; calendar credentials follow the Drive OAuth pattern.
- **Security:** one-time tokens, per-address limits (B-1), abuse protection (no CAPTCHA today).
- **Risk:** deliverability (E-1) for confirmations; calendar API quotas; double booking needs a unique-slot constraint.

### 6. Client Portal (order 10)
- **Existing:** private pages for **one** quotation or **one** request through a link; no customer accounts.
- **Missing:** a customer identity, a dashboard of all requests, files, messages, invoices.
- **Security:** **no second authentication system**: build on the existing session machinery (a `customer` role with magic-link sign-in) or keep link-only access; never expose other customers' data by e-mail address guessing; sign-in rate limits.
- **Risk:** privacy law scope grows (retention, export, erasure: `erase <email>` exists); depends on 7, 8 and 9.

### 7. Project Management (order 11)
- **Existing:** request statuses (`new / in_progress / waiting_client / completed`) and notes only.
- **Missing:** projects, milestones, tasks, time, deliverables, handover.
- **Reusable:** `quote_requests`, `inquiry_notes`, the dashboard.
- **Risk:** scope: a full PM tool is a product; keep it to milestones and a client-visible timeline.

### 8. Feedback and Approval (order 9)
- **Existing:** the customer can accept, decline or ask for changes on a quotation; every step is an immutable event.
- **Missing:** approval of deliverables, review rounds, comments on assets, testimonials.
- **Reusable:** `customer_action_tokens`, `quote_events`, `customer_updates`.

### 9. Client Communication (order 9)
- **Existing:** `customer_updates` (written in the administration, shown on the status page), confirmations and quotation e-mails, replies through `Reply-To`.
- **Missing:** threaded messages, ingesting inbound mail (Cloudflare Email Routing only forwards), notification preferences, a template editor.
- **Risk:** inbound parsing needs an Email Worker or provider inbound webhook and strict handling of untrusted content; E-1.

### 10. CONTROL ROOM AI (order 2)
- **Existing:** built, gated, tested (99 AI tests); **off in production**; model unverified live (A-1).
- **Missing:** live verification, activation, real-conversation quality review in hu / nl, an evaluation set.
- **Next:** a key on the host, the administration's connection test, then switch on.

### 11. AI Project Discovery (order 12)
- **Existing:** a planner tool and an approved-plan → quote-request path.
- **Missing:** persisted structured briefs for the owner, summaries, scoring.
- **Reusable:** `ai/plan.ts`, `shop/brief.ts`, `quote_requests.brief_json`.
- **Security:** visitor text is untrusted input to the model; prices never come from the model.

### 12. AI Admin Assistant (order 13)
- **Existing:** administration screens for AI usage, settings and alerts only.
- **Missing:** an admin-scoped assistant (summaries, draft replies, search).
- **Security:** **inquiry and quote text is attacker-controlled** and would be read by a model that can act: start read-only, no tool that sends or changes anything, separate session and permissions, the same Haiku 5.5 lock and budgets.

### 13. Business Intelligence (order 14)
- **Existing:** dashboard counts, `audit_log`, AI usage tables, a consent-gated client analytics layer with **no collector configured** (`VITE_ANALYTICS_ENDPOINT` unset).
- **Missing:** an event store, funnels (visit → quote request → accepted), reports, export.
- **Choice:** cookie-less Cloudflare Web Analytics (no code) or an own collector endpoint with its own table and rate limits.

### 14. AI Automation (order 15)
- **Existing:** none. **Depends on** 10, 12, 13, 23. Every automated action needs a human-approval default, a budget and an audit trail.

### 15. LAB 2.0 (order 16)
- **Existing:** five immersive experiences (Generative Objects was removed on 2026-11-01), a quality governor, lazy loading, a hidden NFSU2 screen (external link, no iframe: the target forbids framing).
- **Missing:** new experiments, shared authoring helpers.
- **Reusable:** `components/lab/core`, `SceneLayer`, the governor.
- **Risk:** performance budget (LCP is already over target on a phone, P-1); the brief's earlier demand for "six" experiences conflicts with the removal.

### 16. Interactive Project Demos (order 17)
- **Existing:** project pages with screenshots and details.
- **Missing:** runnable demos.
- **Security:** the CSP is `frame-src 'none'`, `connect-src 'self'`: demos need self-hosted builds in a sandboxed iframe (relax `frame-src` to `'self'` only for the demo path) or plain links out. Never third-party scripts on the main origin.

### 17. Design System Playground (order 17)
- **Existing:** `DesignSystemPage` mounted **only in development** (`import.meta.env.DEV`), design tokens, an audit of the brand colours.
- **Missing:** a production, documented, `noindex` version.
- **Cheap:** one route and a build flag.

### 18. Command Center (order 3: pull forward)
- **Existing:** the administration SPA: dashboard, notifications and checks, AI, system page, publish, audit log.
- **Missing:** one screen for operational truth: **last backup (K-2), migrations, e-mail checks, client address seen (B-1), AI verification, deploy status, disk space**.
- **Why early:** it is where this audit's operational findings stop being invisible.

### 19. Digital Archive (order 18)
- **Existing:** the `media` table and upload pipeline.
- **Missing:** large-file storage, metadata, search, access rules.
- **Risk:** local disk and the Drive backup do not scale (K-8); needs object storage (Cloudflare R2) and incremental backup first.

### 20. Advanced Visual Experiences (order 19)
- **Existing:** hero scene, Lab, motion system. **Missing:** new scenes. **Depends on** 15 and on the prerendered-body work (P-1) so the first screen does not get heavier.

### 21. Analytics (order 7)
- **Existing:** consent store, tracker, event definitions, privacy page. **Missing:** a collector and a view (see 13).

### 22. Marketing Infrastructure (order 7)
- **Existing:** prerendered head, sitemap, hreflang, structured data, Open Graph images. **Missing:** newsletter (separate consent from transactional mail), UTM capture, social cards beyond the current set.
- **Depends on** I-1 (canonical host) and E-1.

### 23. Automation Center (order 14)
- **Existing:** in-process timers (outbox, maintenance, Drive backup), `DEPLOY_HOOK_URL`. **Missing:** a job table with run history and retries (B-4), outbound webhooks, rule definitions.

### 24. PWA (order 20)
- **Existing:** nothing: no manifest, no service worker (`public/` holds `favicon.svg`, `og/`, `projects/`); the CSP already allows `worker-src 'self' blob:`.
- **Security requirement:** a service worker must **never cache** `/api/*`, `/admin` or the customer token pages (`/…/quote/<token>`, `/…/request/<token>`); immutable `/assets` make cache-first safe.
- **Value:** low for a portfolio; do after P-1.

### 25. Monitoring and Reliability (order 1)
- **Existing:** `/api/health`, `/api/ready`, structured logs with request ids, an audit log, the e-mail set-up checks, a backup-failure e-mail.
- **Missing:** an external uptime monitor on `/api/ready`, error tracking, alert routing (to a mailbox that works), a status page, scheduled restore drills, staging.

## Recommended order

1. **Monitoring and Reliability** (uptime on `/api/ready`) with the **owner checks** of this audit: persistent disk, `TRUST_PROXY`, mail DNS, canonical host, CI on the deploy branch.
2. **CONTROL ROOM AI live verification** (a key, the connection test) because it is the one module built but unproven.
3. **Command Center**: last backup, client address seen, migrations, e-mail checks on one screen; backup freshness, catch-up and optional encryption.
4. **Portfolio CMS** and **Localization Engine** polish, plus the **prerendered body** (P-1).
5. **Quote Management** polish (PDF, reminders): customers' main path, after E-1.
6. **Premium Shop 4.0** on the hardened base.
7. **Analytics** and **Marketing Infrastructure** (after I-1 and consent).
8. **Consultation Booking.**
9. **Feedback and Approval**, **Client Communication.**
10. **Client Portal** (decide the authentication model first).
11. **Project Management.**
12. **AI Project Discovery.**
13. **AI Admin Assistant** (read-only first).
14. **Business Intelligence** and **Automation Center** (together).
15. **AI Automation.**
16. **LAB 2.0.**
17. **Interactive Project Demos**, **Design System Playground.**
18. **Digital Archive** (needs object storage and incremental backup).
19. **Advanced Visual Experiences.**
20. **PWA.**

## Recommended scope for PROMPT 20

**"Operational hardening and the Command Center foundation"** (one prompt, no new customer features).

*Owner inputs first (the prompt must start by asking for them, never guess):* the answer to Render **R-1** (persistent disk), the measured `TRUST_PROXY`, the choice of canonical host (`www` or apex), the e-mail provider and its verified domain, whether the Google OAuth app is published.

*In scope (code):*
1. **Backup truth:** record each backup (`settings.last_backup`: time, files, bytes, sha256), show it and a stale warning on the administration's System page, run a **catch-up backup on start** when none succeeded in 24 h, upload-then-delete (K-5), optional **AES-256-GCM encryption** (`BACKUP_ENCRYPTION_KEY`) with a documented `backup decrypt` command and a test.
2. **Migration safety:** an automatic `VACUUM INTO` snapshot before any pending migration, kept N days, with a test that a failing migration leaves the snapshot and the database untouched.
3. **Command Center, first screen:** client address as seen and the current `TRUST_PROXY`, migration state, disk free space, e-mail checks, AI verification, last deploy commit.
4. **CI for the deployed branch**, a `check:deploy` script (typecheck, tests, build, `check:seo`), and an optional smoke test of `/api/ready` after deploy.
5. **Canonical host** set by the owner's choice, verified by `check:seo`; a regression test that the sitemap host equals the host the apex redirect leaves.
6. **Refresh the browser journeys** (`shop-journey`, three steps of `journeys` A–E) to the current wording or, better, to `data-testid` selectors, exercise the FULL EXPERIENCE configurator end to end, and list "run the journeys" in the pre-release checklist.
7. A test that reads **every** admin route from the router and fails if the security probe does not cover it (so route coverage cannot drift again).

*In scope (documentation):* the Render and Cloudflare checklists answered in `REMEDIATION_LOG.md`, a restore drill from a real Drive snapshot onto a scratch disk, an incident / recovery runbook.

*Out of scope:* any new customer-facing module, payments, accounts, hosting moves, MFA (a separate prompt after the Command Center), the prerendered body (own prompt: it changes the SSR entry and every page's HTML).

*Acceptance:* typecheck, lint, tests, build and `check:seo` green; a restore from a backup **made by the new code** into an empty scratch database verified; the High findings D-1, E-1, B-1, I-1 each marked *answered* (with the evidence) or *open with an owner*; no production data touched, no deploy without the owner's explicit word.
