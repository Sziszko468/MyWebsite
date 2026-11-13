# Platform audit (PROMPT 19, Phase 0)

A complete technical audit of the existing Controlled Chaos platform, done on 2026-11-13 from commit `77c0df4`. The goal was to understand, verify, document and stabilise what exists: **nothing was rebuilt, deployed, merged, pushed or deleted, no customer data was read, and no production setting was changed.**

## Verdict

**Ready after required fixes.**

The code is in good shape (typecheck, lint, 2 149 tests, build, SEO checks and `npm audit` all green; a 94-check security probe passes; WebGL, layout and accessibility audits pass). What stands between the platform and "ready for further development" is **operational**, sits in dashboards and DNS that this audit could not open, and is answerable by the owner in minutes:

1. **D-1: is the production database on a persistent disk?** If **no**, the verdict becomes **Critical issues must be resolved first**: every deploy would erase the data. Check Render → Disks.
2. **E-1: the domain has no outbound-mail authentication** (no DKIM, SPF without a provider, DMARC monitor-only), so customer e-mails are likely to be rejected or spam-foldered.
3. **B-1: `TRUST_PROXY` is 0 by default**; behind Render and Cloudflare all visitors would share one address for rate limits and the sign-in lock.
4. **I-1: canonical, sitemap and hreflang point at the apex, which redirects to `www`**, where the content is.

## Read in this order

| File | What it answers |
| --- | --- |
| [PLATFORM_OVERVIEW.md](PLATFORM_OVERVIEW.md) | What the platform really is (there is **no Django**), status of every feature, Git state |
| [SECURITY_AUDIT.md](SECURITY_AUDIT.md) | The brief's security checklist and the **findings register** with severities |
| [INFRASTRUCTURE_AUDIT.md](INFRASTRUCTURE_AUDIT.md) | Render, Cloudflare, DNS, headers, country headers, Git workflow, owner checklists |
| [DATABASE_AUDIT.md](DATABASE_AUDIT.md) | Schema, indexes, migration safety assessment, the persistence question |
| [BACKEND_AUDIT.md](BACKEND_AUDIT.md) | API, authentication, validation, findings |
| [FRONTEND_AUDIT.md](FRONTEND_AUDIT.md) | Structure, localization, WebGL, findings |
| [EMAIL_AUDIT.md](EMAIL_AUDIT.md) | The one e-mail system, DNS evidence, findings |
| [AI_AUDIT.md](AI_AUDIT.md) | Model identifier verification (documentation and SDK: yes; live API: **not verified**) |
| [BACKUP_AND_RECOVERY.md](BACKUP_AND_RECOVERY.md) | Backup mechanisms, the restore drill, gaps, the recovery checklist |
| [TEST_RESULTS.md](TEST_RESULTS.md) | What ran, what passed, what failed, what could not run |
| [PERFORMANCE_AUDIT.md](PERFORMANCE_AUDIT.md) | Nine viewport widths, vitals, WebGL fallbacks, recommendations |
| [MASTER_ROADMAP_DEPENDENCIES.md](MASTER_ROADMAP_DEPENDENCIES.md) | 25 modules compared with the code, an order, and the scope of PROMPT 20 |
| [REMEDIATION_LOG.md](REMEDIATION_LOG.md) | Every change made (files, reason, verification), what was left alone, owner checklists and decisions |

## Honest limits of this audit

- The built-in browser was **not signed in** to Render or Cloudflare and sign-in is the owner's act: the dashboards were not read. Production facts come from **public, read-only** requests and DNS.
- **No live Anthropic call** (no key): Haiku 5.5 is verified against Anthropic's published model list and the installed SDK, **not** against the service.
- **No real e-mail** was sent and no Drive upload was made; both are tested against stand-ins.
- Lab numbers are desktop Chrome with an emulated phone, not real devices.
- The browser journeys had drifted behind the shop copy and were refreshed here: cms 22/22, quote 20/20, `journeys` A–E 72/72, shop 41/41 (155 steps, all pass), but they are copy-sensitive and not in CI ([TEST_RESULTS.md](TEST_RESULTS.md)).

No secret value appears in any of these files. Names of variables are listed; values never.
