import { HttpError } from '../../../../http/errors.ts'
import { buildSectionFor } from '../../../analytics/service.ts'
import type { Section } from '../../../analytics/model.ts'
import { OUT_OF_CONTEXT, ToolRefusal } from '../model.ts'
import { isGeneral } from '../scope.ts'
import type { ReadCtx } from './common.ts'

/**
 * The business analytics, for the assistant (PROMPT 32). The assistant gets the SAME deterministic figures the analytics dashboard shows (it calls the same service with the
 * administrator's own, re-checked permissions), and it only reads them: it cannot calculate a total, compare two currencies, fill a gap or state a figure that is not in the result.
 * Each figure keeps what makes it honest: its kind (stored fact, derived by a rule, or an estimate), its period, its previous-period value where one is valid, the reasons a figure is
 * unavailable, and the limits that apply. General business context only (a conversation about one customer must not turn into a count of the others).
 *
 * The result is a COMPACT form of the section (no time series, no tables: those are for the screen's charts): the metrics, the money by currency, the top of each distribution and the
 * funnel stages.
 */

export type AnalyticsTool = 'overview' | 'financial' | 'funnel'
const SECTION_OF = { overview: 'executive', financial: 'financial', funnel: 'funnel' } as const
/** The permission the data behind each tool needs (the executive overview builds only the parts the role may read, and marks the others not permitted). */
const NEEDS = { overview: null, financial: 'requests:read', funnel: 'requests:read' } as const

export interface AnalyticsInput {
  period?: string
  fromDay?: string
  toDay?: string
  currency?: 'EUR' | 'HUF'
}

const TOP = 8

function compact(section: Section) {
  const extra = section.extra as { stages?: Array<Record<string, unknown>> } | undefined
  return {
    metrics: section.metrics.map((m) => ({ id: m.id, kind: m.kind, state: m.state, value: m.value, previousPeriod: m.previous, changePercent: m.changePercent, comparison: m.comparison, reason: m.reason })),
    money: section.money.map((m) => ({
      id: m.id,
      kind: m.kind,
      state: m.state,
      comparison: m.comparison,
      byCurrency: m.lines.map((line) => ({ currency: line.currency, minorUnits: line.minor, previousPeriodMinorUnits: line.previousMinor, quotationsWithAmount: line.priced, quotations: line.count })),
      quotationsWithoutAmount: m.withoutAmount,
      reason: m.reason,
    })),
    distributions: section.distributions.map((d) => ({ id: d.id, total: d.total, top: d.items.slice(0, TOP).map((item) => ({ key: item.key, value: item.value })), moreItems: Math.max(0, d.items.length - TOP) })),
    ...(extra?.stages ? { funnelStages: extra.stages } : {}),
    limitations: section.limitations,
  }
}

export function analyticsReport(ctx: ReadCtx, tool: AnalyticsTool, input: AnalyticsInput) {
  ctx.access.session()
  if (!isGeneral(ctx.scope)) throw OUT_OF_CONTEXT()
  const need = NEEDS[tool]
  if (need) ctx.access.need(need)
  const access = { requests: ctx.access.has('requests:read'), clients: ctx.access.has('clients:read'), system: ctx.access.has('system:read') }
  const query = new URLSearchParams()
  query.set('period', input.period ?? 'last_30_days')
  if (input.fromDay) query.set('from', input.fromDay)
  if (input.toDay) query.set('to', input.toDay)
  if (input.currency) query.set('currency', input.currency)
  let built: ReturnType<typeof buildSectionFor>
  try {
    built = buildSectionFor(ctx.app, access, SECTION_OF[tool], query)
  } catch (error) {
    // A period that cannot be (from after to, a range longer than five years, a date that does not exist): the model is told so, in words that do not repeat what it sent.
    if (error instanceof HttpError && error.status === 422) throw new ToolRefusal('invalid', 'That period or filter is not valid. Use a preset, or a custom range of real dates no longer than about five years, and try again.')
    throw error
  }
  const { meta, section } = built
  return {
    basis: 'computed_by_the_server_from_stored_records' as const,
    section: section.name,
    state: section.state,
    generatedAt: meta.generatedAt,
    businessTimeZone: meta.period.zone,
    period: { preset: meta.period.preset, from: meta.period.from, to: meta.period.to, days: meta.period.days },
    previousPeriod: meta.previous ? { from: meta.previous.from, to: meta.previous.to } : null,
    ...compact(section),
    note:
      'Every figure here was computed by the server from stored records; state a figure only as it appears here, with its period and, for money, its currency. ' +
      'Money is in whole minor units (cents for EUR, forints for HUF) and EUR and HUF are NEVER added together. An accepted quotation is accepted contract value, not cash received; no payment is recorded. ' +
      'A metric whose state is "unavailable" or "not_permitted" has NO value: say it is unknown or not available to this administrator, never zero. Kind "estimate" means an estimate, not an invoice. ' +
      'Do not calculate totals, rates or forecasts yourself.',
  }
}
