import { audit } from '../../system/audit.ts'
import { containsMoney, cut, LIMITS, ToolRefusal } from './model.ts'
import { administrativeAlerts, businessActivity, businessOverview } from './readers/business.ts'
import type { ReadCtx } from './readers/common.ts'
import { summarizeConversation } from './readers/conversations.ts'
import { consultationBriefing } from './readers/consultations.ts'
import { customerActivity, customerOverview } from './readers/customers.ts'
import { pendingActions, projectRisks, summarizeProject } from './readers/projects.ts'
import { summarizeQuote } from './readers/quotes.ts'

/**
 * Structured reports (PROMPT 31). A report has two kinds of content, kept apart and labelled so the reader can tell them apart:
 *
 *  - `confirmedFacts`: read from the database by the SERVER when the report is generated (the model cannot put a number, a date, a name or a price in here);
 *  - `aiObservations` and `recommendations`: the model's own words, passed to the tool, checked here (length, count, no amount of money) and shown under the heading
 *    "AI interpretation: not verified data".
 *
 * Around them: a title, the time it was generated, the period, the data sources used, what is missing and the limitations. The titles and labels the screen shows are
 * worded by the interface in the administrator's language from the `kind` and these codes; nothing in a report is a price quote, a promise or a decision.
 */

export const REPORT_KINDS = ['project_status', 'customer_overview', 'quote_analysis', 'communication_summary', 'consultation_briefing', 'weekly_business_overview', 'administrative_actions'] as const
export type ReportKind = (typeof REPORT_KINDS)[number]

const SOURCES: Record<ReportKind, string[]> = {
  project_status: ['client_projects', 'client_milestones', 'project_tasks', 'project_customer_actions', 'deliverable_approvals', 'client_project_events'],
  customer_overview: ['customers', 'client_projects', 'quote_requests', 'bookings', 'conversations', 'client_project_events', 'quote_events', 'booking_events'],
  quote_analysis: ['quote_requests', 'quote_request_items', 'quotes', 'quote_lines', 'quote_revision_requests', 'quote_events'],
  communication_summary: ['conversations', 'conversation_messages (customer-visible only)'],
  consultation_briefing: ['bookings', 'booking_changes', 'booking_events', 'quote_requests'],
  weekly_business_overview: ['quote_requests', 'bookings', 'client_projects', 'project_tasks', 'conversations', 'customers'],
  administrative_actions: ['quote_requests', 'bookings', 'project_tasks', 'project_customer_actions', 'deliverable_approvals', 'conversations'],
}

/** What a report says it cannot do, as codes the interface words. */
const LIMITATIONS = ['stored_records_only', 'no_private_notes', 'no_estimates', 'ai_interpretation_unverified', 'human_review_required']

export interface Report {
  kind: ReportKind
  generatedAt: string
  /** Who is told what: the facts come from the database, the observations and recommendations are the assistant's. */
  labels: { confirmedFacts: 'database'; aiObservations: 'ai_interpretation'; recommendations: 'ai_interpretation' }
  /** The record the report is about (null for a business report). */
  subject: { type: 'project' | 'customer' | 'quote' | 'conversation' | 'consultation'; reference: string; path: string } | null
  period: { description: string; from?: string; to?: string } | null
  dataSources: string[]
  confirmedFacts: unknown
  aiObservations: string[]
  recommendations: string[]
  missingInformation: string[]
  limitations: string[]
  notAvailableToYou: string[]
}

export interface ReportInput {
  observations: string[]
  recommendations: string[]
}

/** The assistant's words in a report: a few short lines, no amounts of money, no markup that a screen could mistake for something else. */
export function checkWords(input: ReportInput): ReportInput {
  const clean = (list: string[], max: number, name: string): string[] => {
    if (list.length > max) throw new ToolRefusal('invalid', `At most ${max} ${name} per report.`)
    return list.map((item) => {
      const text = cut(item, LIMITS.observationChars) ?? ''
      if (text.length < 3) throw new ToolRefusal('invalid', `A ${name.slice(0, -1)} is empty.`)
      if (containsMoney(text)) throw new ToolRefusal('invalid', 'The text contains an amount of money. Leave amounts out: refer to the quotation\'s own stored figures instead, and never state a price or a discount of your own.')
      return text
    })
  }
  return { observations: clean(input.observations, LIMITS.observations, 'observations'), recommendations: clean(input.recommendations, LIMITS.recommendations, 'recommendations') }
}

interface Built {
  subject: Report['subject']
  period: Report['period']
  facts: unknown
  missing: string[]
  notAvailable?: string[]
}

function build(ctx: ReadCtx, kind: ReportKind, reference: string | undefined, days: number): Built {
  const { app } = ctx
  const now = app.clock.now().toISOString()
  if (kind === 'project_status') {
    const summary = summarizeProject(ctx, reference)
    return {
      subject: { type: 'project', reference: summary.reference, path: summary.link.path },
      period: { description: 'the state at the time of generation, with the last events of the project' },
      facts: { project: summary, risks: projectRisks(ctx, reference).risks, pending: pendingActions(ctx, reference) },
      missing: summary.derived.missingInformation,
    }
  }
  if (kind === 'customer_overview') {
    const overview = customerOverview(ctx, reference)
    return {
      subject: { type: 'customer', reference: overview.id, path: overview.link.path },
      period: { description: `the state at the time of generation, with the activity of the last ${days} days`, to: now },
      facts: { customer: overview, activity: customerActivity(ctx, reference, days) },
      missing: [...(overview.name ? [] : ['name']), ...(overview.company ? [] : ['company']), ...(overview.projects.length === 0 ? ['no_projects'] : [])],
    }
  }
  if (kind === 'quote_analysis') {
    const summary = summarizeQuote(ctx, reference)
    return { subject: { type: 'quote', reference: summary.reference, path: summary.link.path }, period: { description: 'the state at the time of generation' }, facts: summary, missing: summary.derived.missingInformation }
  }
  if (kind === 'communication_summary') {
    const summary = summarizeConversation(ctx, reference)
    return { subject: { type: 'conversation', reference: summary.reference, path: summary.link.path }, period: { description: 'the most recent customer-visible messages, up to 40' }, facts: summary, missing: [] }
  }
  if (kind === 'consultation_briefing') {
    const briefing = consultationBriefing(ctx, reference)
    return { subject: { type: 'consultation', reference: briefing.reference, path: briefing.link.path }, period: { description: 'the state at the time of generation' }, facts: briefing, missing: briefing.derived.unknowns }
  }
  if (kind === 'weekly_business_overview') {
    const overview = businessOverview(ctx, 'last_7_days')
    const activity = businessActivity(ctx, 7)
    const alerts = administrativeAlerts(ctx)
    return {
      subject: null,
      period: { description: 'the last 7 days (counts with "Now" are the state at generation)', from: overview.period.from, to: overview.period.to },
      facts: { overview, activity, alerts },
      missing: [],
      notAvailable: [...activity.notAvailableToYou],
    }
  }
  const alerts = administrativeAlerts(ctx)
  return { subject: null, period: { description: 'the state at the time of generation, judged by fixed rules with stated thresholds' }, facts: { alerts }, missing: [], notAvailable: [...alerts.notAvailableToYou] }
}

/** Generates a report: the facts from the database, the words from the assistant. */
export function generateReport(ctx: ReadCtx, kind: ReportKind, reference: string | undefined, words: ReportInput, days = 30): Report {
  const checked = checkWords(words)
  const built = build(ctx, kind, reference, days)
  const actor = ctx.access.session()
  // The audit log records that a report was made, about what, and by whom: never its content.
  audit(ctx.app, actor, 'ai.admin_assistant.report', 'report', built.subject?.reference ?? kind, { kind })
  return {
    kind,
    generatedAt: ctx.app.clock.now().toISOString(),
    labels: { confirmedFacts: 'database', aiObservations: 'ai_interpretation', recommendations: 'ai_interpretation' },
    subject: built.subject,
    period: built.period,
    dataSources: SOURCES[kind],
    confirmedFacts: built.facts,
    aiObservations: checked.observations,
    recommendations: checked.recommendations,
    missingInformation: built.missing,
    limitations: LIMITATIONS,
    notAvailableToYou: built.notAvailable ?? [],
  }
}
