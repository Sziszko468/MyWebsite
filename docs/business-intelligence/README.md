# Business intelligence and analytics dashboard

PROMPT 32 · branch `feature/business-intelligence` (base: `feature/ai-admin-assistant`, `c64cf75`).

`/admin/analytics` is the administration's executive dashboard: what came in, what is out with customers, what is running, what is waiting, what the assistants cost — **every number counted by the server from stored records, none estimated unless it says so, none computed in the browser, none produced by a language model**.

| Document | What it holds |
| --- | --- |
| [DATA_DICTIONARY.md](DATA_DICTIONARY.md) | What the system stores and does not store; one definition per KPI (written before the code) |
| [METRIC_DEFINITIONS.md](METRIC_DEFINITIONS.md) | Every metric id the API sends, by section: kind, period rule, comparison, the code behind it |
| [FINANCIAL_METRICS.md](FINANCIAL_METRICS.md) | Requested vs quoted vs accepted vs open: what money means here and what it never means |
| [CUSTOMER_ANALYTICS.md](CUSTOMER_ANALYTICS.md) | Accounts, lifecycle, the exact segment rules |
| [CONVERSION_FUNNEL.md](CONVERSION_FUNNEL.md) | The cohort funnel, stage by stage |
| [PROJECT_ANALYTICS.md](PROJECT_ANALYTICS.md) | Projects, tasks, milestones, workload, consultations, operational alerts |
| [COMMUNICATION_ANALYTICS.md](COMMUNICATION_ANALYTICS.md) | Who waits for whom, volume, time to a first reply |
| [AI_USAGE_ANALYTICS.md](AI_USAGE_ANALYTICS.md) | The usage ledger, visitor and administrator separately and together; estimate vs reported |
| [REPORTING_AND_EXPORTS.md](REPORTING_AND_EXPORTS.md) | CSV and the printed report |
| [PERMISSIONS.md](PERMISSIONS.md) | Which role reads which section; the assistant's tools |
| [PRIVACY.md](PRIVACY.md) | What an analytics answer can and cannot contain |
| [PERFORMANCE.md](PERFORMANCE.md) | Measured on a synthetic dataset; the one bottleneck found and fixed |
| [LOCALIZATION.md](LOCALIZATION.md) | Hungarian, English, Dutch: words, numbers, dates |
| [LOCALIZATION_AUDIT.md](LOCALIZATION_AUDIT.md) | PROMPT 32.1: the four "incomplete" entries (blank on purpose) and the audit of the dashboard's own dictionary, with every correction |
| [FILTER_SEMANTICS.md](FILTER_SEMANTICS.md) | PROMPT 32.1: what the project status filter does to every figure (filtered, empty by definition, not filtered) and why |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Where the code is and how a request flows |
| [TEST_RESULTS.md](TEST_RESULTS.md) | What was run and what it showed |
| [LAUNCH_CHECKLIST.md](LAUNCH_CHECKLIST.md) | What the owner decides and checks before relying on it |

## What it is, in one paragraph

A read-only backend module (`server/src/modules/analytics`) computes nine sections — overview, financial pipeline, customers, quote funnel, projects, consultations, communication, AI usage and cost, alerts — with parameterised SQL over the existing tables. A React screen (`src/admin/pages/AnalyticsPage.tsx`) lays them out with KPI cards, an own SVG chart library (line, grouped and stacked bars, ring, horizontal bars, funnel, trend line), tables and notes; every chart has its numbers as a table. The period and filters are in the address; CSV export and a printable report are built from the same data. Three read-only tools let the AI admin assistant read the same figures; it can neither calculate nor invent them.

## Decisions not to undo

1. **No migration, no new table, no cache.** Nothing is stored for analytics, so there is nothing to go stale, nothing to migrate back and no history that could be fabricated. Every answer is computed when asked and says when (`generatedAt`).
2. **No new permission.** Each section needs the permission of the data behind it (`requests:read`, `clients:read`, `system:read`), checked per request against the role stored now. A role that may not read a section gets `not_permitted` — never a zero.
3. **Zero is a number the data produced.** A figure the system cannot know (revenue, receivables, a numeric budget, customer country or source) is `unavailable` with a reason code and a sentence.
4. **Money is integer minor units per currency and is never added across currencies.** No exchange rate is stored; none is invented. An accepted quotation is accepted contract value, not cash.
5. **Snapshots are not compared with the past.** "Active projects now" has no previous-period value, because no history of it is stored and none is reconstructed from current statuses.
6. **A funnel is a cohort**: the requests received in the period, followed to wherever they got. Statuses *now* are a separate snapshot and never feed a conversion.
7. **The assistant reads, it does not compute.** Its three tools return the dashboard's own compact figures; the Haiku 5.5 lock, the permissions re-check and the read-only rule of PROMPT 31 are unchanged.
8. **A selected filter is never silently ignored** (PROMPT 32.1): every figure the project status can touch says whether it was filtered, empty by definition or not filtered (an event of the period, or not about projects); events keep their historical meaning ([FILTER_SEMANTICS.md](FILTER_SEMANTICS.md)).
9. **The business time zone is the consultations' zone** (booking settings); UTC when none is set. A period is whole local days; daylight-saving days of 23 or 25 hours are handled.

## Changes against the plan in the data dictionary

* The "awaiting action" segment is **"awaiting your reply"** only (an open conversation whose last customer-visible message is from the customer). A due customer action is not part of it.
* **Returning customer** = at least two projects, **or** at least two *different* accepted quote requests (a re-quoted request counts once).
* Interest in services, packages and add-ons carries, per item, how many of the requests that asked for it were followed by an accepted quotation (`accepted`). It is interest, not sales.
* Extra breakdowns that turned out useful: customers by language / account status / how the account was made, request channels, and the current status of all requests (a snapshot).
* Time series are built in one sorted pass instead of joining every bucket to the table (see [PERFORMANCE.md](PERFORMANCE.md)); the result is identical.
* The assistant got three tools (31 → 34): `getAnalyticsOverview`, `getFinancialAnalytics`, `getFunnelAnalytics`.
* `CommunicationsPage` now starts from a known `?filter=` in the address, so the overview's drill-down ("waiting for your reply") opens the list already filtered.

## What it deliberately does not do

No revenue, receivable or cash figure (no payments are recorded). No open-pipeline history. No numeric requested budget. No customer country or acquisition source. No forecast. No decline-reason breakdown (reasons are free text). No automatic action from an alert. No PDF (no secure server-side PDF mechanism exists in this project; the printed report uses the browser's own print). No third-party analytics, no cookies, no tracking.
