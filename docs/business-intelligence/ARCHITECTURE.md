# Architecture

## The pieces

```
server/src/modules/analytics/
  period.ts      presets, business time zone, whole-local-day periods, previous period, time-series buckets
  model.ts       the shapes (Metric, MoneyMetric, Series, Distribution, Section, Meta, Filters) and the helpers that make them
  quotes.ts      requests, quotations, money per currency, the financial section, the funnel, service/package interest
  operations.ts  customers, projects, consultations, communication
  ai.ts          the AI usage ledger
  alerts.ts      deterministic operational alerts
  service.ts     filter parsing, access, the executive section, buildSection / buildSectionFor
  export.ts      CSV of a section
  routes.ts      GET /api/admin/analytics and /api/admin/analytics/export

server/src/modules/ai/adminassistant/readers/analytics.ts   the assistant's read of the same service (compact form)
server/src/modules/ai/adminassistant/tools.ts               + getAnalyticsOverview, getFinancialAnalytics, getFunnelAnalytics

src/admin/pages/AnalyticsPage.tsx    the screen: tabs, filter bar, results, export, print
src/admin/analytics/                 format.ts · model.ts · text.tsx · Charts.tsx · Kpi.tsx · Sections.tsx · analytics.test.ts
src/admin/api/analytics.ts           the client (types, load, CSV download)
src/admin/i18n/analytics.ts          Hungarian, English, Dutch
src/admin/styles/analytics.module.scss
```

## A request

1. The browser asks `GET /api/admin/analytics?section=financial&period=last_30_days&currency=EUR&lang=hu` with its session cookie (same origin).
2. `routes.ts` requires a signed-in administrator who may read at least one of the three areas, validates the section name, and calls `buildSection`.
3. `parseFilters` accepts only known parameters and values (an unknown parameter or value is a 422 naming the field, never a silent default); `resolvePeriod` turns the preset or custom range into whole local days of the business zone and their UTC instants.
4. `buildSectionFor(app, access, name, query)` builds the section, or answers `not_permitted` when the role may not read the data behind it. All SQL is parameterised; the few fragments interpolated into a statement are constants of the module held in a local `sql` object (a static test enforces this for the whole server).
5. The answer is `{ meta, filters, access, section }`. `Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`.

The CSV (`/export?report=financial&…`) runs the same steps, refuses a section the role cannot read (403), writes an audit event (`analytics.export`: report, period, no data) and renders the *same* section object as CSV.

## What the section carries

| Part | Meaning |
| --- | --- |
| `metrics[]` | `id`, `kind` (actual · derived · estimate), `state` (available · unavailable · not_permitted), `value`, `previous`, `change`, `changePercent`, `comparison` (period · snapshot · none), `reason`, `drill` |
| `money[]` | per currency: whole minor units, previous period, how many quotations carry an amount, how many there are; `withoutAmount` counts quotations priced in words |
| `series[]` | points per local day (up to 62 days) or local month; `unit` count · minor · usd |
| `distributions[]` | breakdowns (status, language, channel, segment…) |
| `tables[]` | small tables (workload, deadlines, AI usage, budget) |
| `extra` | the funnel's stages and cohort, the alerts' list |
| `limitations[]` | codes the screen words: what these figures cannot tell you |

## How the numbers are made trustworthy

* **Integers.** Money is `INTEGER` minor units; SQLite sums integers exactly. The browser formats; it never adds, averages, converts or compares money (a source test forbids it).
* **Honest absence.** `unavailable(id, reason)` and `notPermitted(id)` are the only ways to say "no value"; there is no code path that turns a missing figure into 0.
* **Flows and snapshots.** A flow (`flow`) is counted in the period and compared with the previous equivalent period; a snapshot (`snapshot`) describes now and has no comparison.
* **Time series in one sorted pass.** The rows of the period are read once; the bucket starts and the rows are ordered together and each row takes the running maximum bucket key. One sort instead of rows × buckets comparisons; identical result.
* **Read-only.** No analytics statement writes. The assistant's reader calls the same functions.

## What was not built, and why

* **No cache.** At the measured sizes (see [PERFORMANCE.md](PERFORMANCE.md)) a section answers in well under two seconds even at 150,000 messages; a cache would need invalidation across ten tables and could show stale money. Not justified.
* **No migration / no indexes.** The one slow query was fixed in the query, not with an index.
* **No snapshot tables.** A "pipeline over time" would need a history that does not exist; fabricating one is exactly what the brief forbids.
* **No charting dependency.** The chart set is small and drawn as SVG/HTML; a dependency would add weight to the owner's tool for nothing it needs.
