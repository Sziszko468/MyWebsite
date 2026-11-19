import { writeFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SECTIONS, type SectionName } from '../src/modules/analytics/model.ts'
import { buildSection } from '../src/modules/analytics/service.ts'
import { sectionCsv } from '../src/modules/analytics/export.ts'
import { startServer, type TestServer } from './helpers.ts'
import { N, buildSyntheticDataset } from './analyticsSynthetic.ts'

/**
 * PROMPT 32, performance: every analytics section against a SYNTHETIC dataset of a size well beyond a one-person studio's real data. Everything here is generated, labelled `SYN-…`, lives
 * only in the in-memory database of this test and is never written anywhere else. What is measured is the time of the real queries (the same functions the API calls) on this machine;
 * the thresholds are deliberately generous (they catch an accidental full-table scan or a quadratic join, not a 20 % change) and the measured times are recorded in
 * `docs/business-intelligence/PERFORMANCE.md`.
 *
 * Size: see `analyticsSynthetic.ts` (25,000 quote requests, 150,000 messages, 70,000 AI ledger rows and so on: far beyond what one studio produces in years).
 */

let s: TestServer
const timings: Record<string, number> = {}

beforeAll(async () => {
  s = await startServer()
  const t0 = performance.now()
  buildSyntheticDataset(s.db)
  timings.build = Math.round(performance.now() - t0)
}, 300_000)

afterAll(async () => {
  // The measured times are printed (and written where ANALYTICS_PERFORMANCE_OUT says, for the documentation); nothing is written into the repository by default.
  console.log(`analytics performance (synthetic, ms): ${JSON.stringify({ rows: N, timingsMs: timings })}`)
  if (process.env.ANALYTICS_PERFORMANCE_OUT) writeFileSync(process.env.ANALYTICS_PERFORMANCE_OUT, JSON.stringify({ rows: N, timingsMs: timings }, null, 2))
  await s.close()
})

const session = () => ({ userId: 'x', email: 'x', role: 'admin', csrfToken: '', tokenHash: '' }) as never
const run = (name: SectionName, query: string) => {
  const started = performance.now()
  const built = buildSection(s.app.context, session(), name, new URLSearchParams(query))
  const ms = Math.round(performance.now() - started)
  timings[`${name} ${query}`] = ms
  return { built, ms }
}

describe('the analytics on a synthetic dataset (SYN-…, in memory only)', () => {
  it('has the size the test says it has', () => {
    const count = (table: string) => s.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n
    expect(count('quote_requests')).toBe(N.requests)
    expect(count('conversation_messages')).toBe(N.messages)
    expect(count('ai_requests')).toBe(N.ai)
    expect(s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM quote_requests WHERE reference NOT LIKE 'SYN-%'")!.n).toBe(0)
  })

  it.each(SECTIONS.map((name) => [name]))('%s answers in good time for 30 days, a year and the longest allowed range', (name) => {
    for (const [query, limit] of [['period=last_30_days', 1500], ['period=this_year', 2500], ['period=custom&from=2021-12-01&to=2026-11-03', 4000]] as const) {
      const { built, ms } = run(name, query)
      expect(built.section.state, `${name} ${query}`).toBe('available')
      expect(ms, `${name} ${query} took ${ms} ms`).toBeLessThan(limit)
    }
  })

  it('returns the same numbers as a direct count, at this size', () => {
    const { built } = run('financial', 'period=custom&from=2021-12-01&to=2026-11-03')
    // The same instants the service used (the period's local days, as UTC): a quotation accepted a few days after the last day of the period is not in it.
    const stored = s.db.all<{ currency: string; n: number; minor: number }>("SELECT currency, COUNT(*) AS n, SUM(total_minor) AS minor FROM quotes WHERE accepted_at >= ? AND accepted_at < ? GROUP BY currency ORDER BY currency", [built.meta.period.fromUtc, built.meta.period.toUtc])
    const accepted = built.section.money.find((m) => m.id === 'acceptedQuotationValue')!
    for (const row of stored) expect(accepted.lines.find((l) => l.currency === row.currency)).toMatchObject({ minor: row.minor, count: row.n })
    const funnel = run('funnel', 'period=custom&from=2021-12-01&to=2026-11-03').built.section.extra as { stages: Array<{ stage: string; count: number }> }
    expect(funnel.stages[0].count).toBe(N.requests)
    expect(funnel.stages.find((x) => x.stage === 'sent')!.count).toBe(s.db.get<{ n: number }>("SELECT COUNT(DISTINCT quote_request_id) AS n FROM quotes WHERE sent_at IS NOT NULL")!.n)
  })

  it('exports a big section without trouble, and a page of detail is bounded', () => {
    const { built } = run('alerts', 'period=last_30_days')
    expect((built.section.extra as { items: unknown[] }).items.length).toBeLessThanOrEqual(100)
    const { built: big, ms } = run('financial', 'period=custom&from=2021-12-01&to=2026-11-03')
    const started = performance.now()
    const csv = sectionCsv(big.section, big.meta, big.filters, 'financial')
    timings['csv financial 5y'] = Math.round(performance.now() - started)
    expect(csv.length).toBeGreaterThan(1000)
    expect(ms).toBeLessThan(4000)
  })
})
