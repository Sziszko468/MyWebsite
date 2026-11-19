import type { AppContext, SessionInfo } from '../../context.ts'
import { validationFailed, type FieldErrors } from '../../http/errors.ts'
import { loadSettings as loadBookingSettings, BOOKING_STATUSES } from '../bookings/model.ts'
import { PROJECT_STATUSES } from '../customers/model.ts'
import { CURRENCIES, type Currency } from '../quotes/money.ts'
import { can } from '../auth/permissions.ts'
import { aiSection } from './ai.ts'
import { alertsSection } from './alerts.ts'
import { emptySection, notPermitted, unavailable, type Filters, type Meta, type Section, type SectionName, SECTIONS } from './model.ts'
import { communicationMetrics, communicationSection, consultationSection, customerSection, flowOf, projectMetrics, projectSection } from './operations.ts'
import { resolvePeriod, validZone, type Period } from './period.ts'
import { financialSection, funnelSection, interestDistributions, quoteMetrics, type Ctx } from './quotes.ts'

/**
 * The analytics service (PROMPT 32): one function per section, all read-only, all deterministic. A section is built only for a role that may read the data behind it (the same
 * permissions the administration already has: `requests:read`, `clients:read`, `system:read`); for any other role it is `not_permitted`, never a zero. Nothing is cached: every
 * answer is computed from the database at the moment of the request and says when (`generatedAt`).
 */

const QUOTATION_STATUSES = ['draft', 'sent', 'accepted', 'declined', 'superseded', 'withdrawn'] as const
const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/

const KNOWN = new Set(['section', 'period', 'from', 'to', 'currency', 'language', 'service', 'package', 'projectStatus', 'quoteStatus', 'consultationStatus', 'lang', 'report'])

/** The query string as filters; an unknown parameter or a value that is not one of the known ones is a 422 naming the field, never a silent default. */
export function parseFilters(query: URLSearchParams): { filters: Filters; period: { period: string | null; from: string | null; to: string | null } } {
  const errors: FieldErrors = {}
  for (const key of query.keys()) if (!KNOWN.has(key)) errors[key] = 'unknown'
  const get = (name: string): string | null => {
    const value = query.get(name)
    return value === null || value === '' ? null : value
  }
  const choice = <T extends string>(name: string, allowed: readonly T[]): T | null => {
    const value = get(name)
    if (value === null) return null
    if (!(allowed as readonly string[]).includes(value)) {
      errors[name] = 'invalid'
      return null
    }
    return value as T
  }
  const slug = (name: string): string | null => {
    const value = get(name)
    if (value === null) return null
    if (!SLUG.test(value)) {
      errors[name] = 'invalid'
      return null
    }
    return value
  }
  const filters: Filters = {
    currency: choice<Currency>('currency', CURRENCIES),
    language: choice('language', ['hu', 'en', 'nl'] as const),
    service: slug('service'),
    packageCode: slug('package'),
    projectStatus: choice('projectStatus', PROJECT_STATUSES),
    quoteStatus: choice('quoteStatus', QUOTATION_STATUSES),
    consultationStatus: choice('consultationStatus', BOOKING_STATUSES),
    lang: choice('lang', ['hu', 'en', 'nl'] as const) ?? 'en',
  }
  if (Object.keys(errors).length > 0) throw validationFailed(errors)
  return { filters, period: { period: get('period'), from: get('from'), to: get('to') } }
}

export interface Access {
  requests: boolean
  clients: boolean
  system: boolean
}

export const accessOf = (session: SessionInfo): Access => ({ requests: can(session.role, 'requests:read'), clients: can(session.role, 'clients:read'), system: can(session.role, 'system:read') })

/** The business time zone: the one the owner schedules consultations in (UTC when none is set or the name is unknown). */
export function businessZone(app: AppContext): string {
  const zone = loadBookingSettings(app.db).timeZone
  return zone && validZone(zone) ? zone : 'UTC'
}

export function contextFor(app: AppContext, query: URLSearchParams): { ctx: Ctx; period: Period; filters: Filters } {
  const parsed = parseFilters(query)
  const now = app.clock.now()
  const period = resolvePeriod(parsed.period, now, businessZone(app))
  return { ctx: { app, db: app.db, period, f: parsed.filters, now }, period, filters: parsed.filters }
}

export function metaOf(app: AppContext, period: Period): Meta {
  return { generatedAt: app.clock.now().toISOString(), period: { preset: period.preset, zone: period.zone, today: period.today, from: period.from, to: period.to, fromUtc: period.fromUtc, toUtc: period.toUtc, days: period.days }, previous: period.previous, currencyNote: 'never_summed_across_currencies' }
}

function executiveSection(ctx: Ctx, access: Access): Section {
  const section = emptySection('executive')
  const q = access.requests ? quoteMetrics(ctx) : null
  const p = access.clients ? projectMetrics(ctx) : null
  const c = access.clients ? communicationMetrics(ctx) : null
  section.metrics.push(
    q ? q.newRequests : notPermitted('newQuoteRequests'),
    q ? q.newContacts : notPermitted('newContactMessages'),
    access.clients ? flowOf(ctx, 'newCustomers', 'SELECT COUNT(*) AS n FROM customers WHERE created_at >= ? AND created_at < ? AND (? IS NULL OR language = ?)', [ctx.f.language, ctx.f.language], '/clients') : notPermitted('newCustomers'),
    p ? p.active : notPermitted('activeProjects'),
    p ? p.completed : notPermitted('completedProjects'),
    q ? q.openQuotations : notPermitted('openQuotations'),
    q ? q.acceptedQuotations : notPermitted('acceptedQuotations'),
    unavailable('recordedRevenue', 'no_payment_data'),
    c ? c.waitingForAdministrator : notPermitted('customerWaitingForAdministrator'),
    p ? p.overdueMilestones : notPermitted('overdueMilestones'),
    p ? p.delayedProjects : notPermitted('delayedProjects'),
  )
  if (q) section.money.push(q.acceptedValue, q.pipelineValue, q.averageValue)
  else section.money.push(...['acceptedQuotationValue', 'potentialPipelineValue', 'averageQuotationValue'].map((id) => ({ id, kind: 'actual' as const, state: 'not_permitted' as const, comparison: 'none' as const, lines: [], withoutAmount: 0, reason: 'not_permitted', drill: null })))
  section.limitations.push('no_payment_data', 'accepted_value_is_not_cash', 'currencies_not_summed', 'snapshots_not_compared')
  return section
}

const notAllowed = (name: SectionName): Section => ({ ...emptySection(name, 'not_permitted'), limitations: ['not_permitted'] })

/** One section for this administrator and these filters. */
export function buildSection(app: AppContext, session: SessionInfo, name: SectionName, query: URLSearchParams): { meta: Meta; filters: Filters; section: Section } {
  return buildSectionFor(app, accessOf(session), name, query)
}

/** The same, for an access that is already decided (the AI admin assistant decides it with its own, re-checked policy; the data and the rules are the same). */
export function buildSectionFor(app: AppContext, access: Access, name: SectionName, query: URLSearchParams): { meta: Meta; filters: Filters; section: Section } {
  const { ctx, period, filters } = contextFor(app, query)
  let section: Section
  switch (name) {
    case 'executive':
      section = executiveSection(ctx, access)
      break
    case 'financial':
      section = access.requests ? financialSection(ctx) : notAllowed(name)
      if (access.requests) section.distributions.push(...interestDistributions(ctx))
      break
    case 'customers':
      section = access.clients ? customerSection(ctx) : notAllowed(name)
      break
    case 'funnel':
      section = access.requests ? funnelSection(ctx) : notAllowed(name)
      break
    case 'projects':
      section = access.clients ? projectSection(ctx) : notAllowed(name)
      break
    case 'consultations':
      section = access.requests ? consultationSection(ctx) : notAllowed(name)
      break
    case 'communication':
      section = access.clients ? communicationSection(ctx) : notAllowed(name)
      break
    case 'ai':
      section = access.system ? aiSection(ctx) : notAllowed(name)
      break
    case 'alerts':
      section = access.requests || access.clients ? alertsSection(ctx, { requests: access.requests, clients: access.clients }) : notAllowed(name)
      break
  }
  return { meta: metaOf(app, period), filters, section }
}

export { SECTIONS }
