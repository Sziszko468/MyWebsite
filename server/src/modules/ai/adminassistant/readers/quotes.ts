import { briefRows } from '../../../shop/brief.ts'
import { linesOf, quotationsOf } from '../../../quotes/quotations.ts'
import { getQuote, quoteItems, type QuoteRow } from '../../../quotes/repository.ts'
import { ageDays, cut, daysAgo, dayStart, LIMITS, likeOf, NOT_FOUND, pageOf, untrusted } from '../model.ts'
import { inScope, scopeClause, scopeIds } from '../scope.ts'
import { link, listed, type ReadCtx } from './common.ts'

/**
 * Quote requests for the admin assistant. Permission: `requests:read`. The customer's e-mail address, phone number, IP hash and every internal note are NOT returned; what
 * the customer wrote comes back in fields that end in `Untrusted`, cut to a short length. Quotation figures are the stored ones (never computed, never rounded off by
 * the assistant): the assistant has no tool that creates or changes one.
 */

const NEED = 'requests:read'

const OPEN_STATUSES = ['new', 'under_review', 'waiting_customer', 'quote_preparation']

interface ListRow {
  id: string
  reference: string
  request_type: string
  source: string
  name: string
  company: string | null
  language: string
  status: string
  priority: string
  created_at: string
  updated_at: string
  archived_at: string | null
  description: string
}

export interface QuoteSearch {
  query?: string | undefined
  status?: string | undefined
  priority?: string | undefined
  receivedSinceDays?: number | undefined
  includeArchived?: boolean | undefined
  limit?: number | undefined
  page?: number | undefined
}

export function searchQuotes(ctx: ReadCtx, input: QuoteSearch) {
  ctx.access.need(NEED)
  const { app } = ctx
  const conditions: string[] = ['1 = 1']
  const params: Array<string | number> = []
  if (!input.includeArchived) conditions.push('archived_at IS NULL')
  if (input.status) {
    conditions.push('status = ?')
    params.push(input.status)
  }
  if (input.priority) {
    conditions.push('priority = ?')
    params.push(input.priority)
  }
  if (input.receivedSinceDays !== undefined) {
    conditions.push('created_at >= ?')
    params.push(dayStart(daysAgo(app.clock.now(), input.receivedSinceDays)))
  }
  if (input.query) {
    const like = likeOf(input.query)
    conditions.push("(reference LIKE ? ESCAPE '!' OR name LIKE ? ESCAPE '!' OR company LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!')")
    params.push(like, like, like, like)
  }
  const restricted = scopeClause(scopeIds(ctx.scope, 'quote'), 'id')
  const where = `${conditions.join(' AND ')}${restricted.sql}`
  const all = [...params, ...restricted.params]
  const page = pageOf(input)
  const total = app.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM quote_requests WHERE ${where}`, all)?.n ?? 0
  const rows = app.db.all<ListRow>(
    `SELECT id, reference, request_type, source, name, company, language, status, priority, created_at, updated_at, archived_at, description
       FROM quote_requests WHERE ${where} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`,
    [...all, page.limit, page.offset],
  )
  const now = app.clock.now()
  return listed(
    ctx,
    rows.map((row) => ({
      reference: row.reference,
      status: row.status,
      priority: row.priority,
      requestType: row.request_type,
      source: row.source,
      receivedAt: row.created_at,
      updatedAt: row.updated_at,
      ageDays: ageDays(now, row.created_at),
      archived: row.archived_at !== null,
      language: row.language,
      customer: { name: cut(row.name, 80), company: cut(row.company, 80) },
      descriptionUntrusted: untrusted(row.description, LIMITS.excerpt),
      link: link.quote(row.reference, row.id),
    })),
    total,
    page,
  )
}

/** The request a reference names, if it exists AND is reachable from this conversation's scope (otherwise: not found, for both). */
export function quoteByReference(ctx: ReadCtx, reference: string | undefined): QuoteRow {
  ctx.access.need(NEED)
  const ref = reference ?? (ctx.scope.type === 'quote' ? ctx.scope.ref : null)
  if (!ref) throw NOT_FOUND()
  const row = ctx.app.db.get<{ id: string }>('SELECT id FROM quote_requests WHERE reference = ?', [ref])
  if (!row || !inScope(ctx.scope, 'quote', row.id)) throw NOT_FOUND()
  const quote = getQuote(ctx.app.db, row.id)
  if (!quote) throw NOT_FOUND()
  return quote
}

const money = (minor: number | null): number | null => minor

export function quoteDetails(ctx: ReadCtx, reference: string | undefined) {
  const quote = quoteByReference(ctx, reference)
  const { app } = ctx
  const items = quoteItems(app.db, quote.id)
  const quotations = quotationsOf(app.db, quote.id)
  const revisions = app.db.all<{ id: string; quote_id: string; message: string; created_at: string; handled_at: string | null }>(
    'SELECT id, quote_id, message, created_at, handled_at FROM quote_revision_requests WHERE quote_request_id = ? ORDER BY created_at DESC LIMIT 10',
    [quote.id],
  )
  const events = app.db.all<{ event_type: string; from_status: string | null; to_status: string | null; created_at: string }>(
    'SELECT event_type, from_status, to_status, created_at FROM quote_events WHERE quote_request_id = ? ORDER BY id DESC LIMIT 20',
    [quote.id],
  )
  const referenceOf = new Map(quotations.map((row) => [row.id, row.reference]))
  return {
    basis: 'actual' as const,
    reference: quote.reference,
    status: quote.status,
    customerVisibleStatus: quote.customer_status,
    priority: quote.priority,
    requestType: quote.request_type,
    source: quote.source,
    kind: quote.kind,
    language: quote.language,
    receivedAt: quote.created_at,
    updatedAt: quote.updated_at,
    ageDays: ageDays(app.clock.now(), quote.created_at),
    archived: quote.archived_at !== null,
    customer: { name: cut(quote.name, 80), company: cut(quote.company, 80), phoneOnFile: quote.phone !== null, websiteOnFile: quote.website !== null },
    request: {
      descriptionUntrusted: untrusted(quote.description, LIMITS.detailText),
      objective: quote.objective,
      timing: quote.timing,
      requirementsUntrusted: untrusted(quote.requirements, LIMITS.detailText),
      budgetStatedByCustomerUntrusted: untrusted(quote.budget_range, 200),
      referenceNotesUntrusted: untrusted(quote.reference_notes, 400),
    },
    items: items.map((item) => ({ need: item.need, plan: item.plan, service: item.service, package: item.package, extras: item.extras })),
    briefUntrusted: briefRows(quote, quote.language)
      .slice(0, 30)
      .map((row) => ({ label: cut(row.label, 120), value: untrusted(row.value, 400) })),
    quotations: quotations.slice(-5).map((row) => {
      const lines = linesOf(app.db, row.id).slice(0, 20)
      return {
        reference: row.reference,
        version: row.version,
        status: row.status,
        titleText: cut(row.title, LIMITS.titleChars),
        language: row.language,
        pricingMode: row.pricing_mode,
        currency: row.currency,
        // The STORED figures, in minor units (cents). The assistant states these as they are and never works out another.
        storedTotals: { subtotalMinor: money(row.subtotal_minor), discountMinor: money(row.discount_minor), taxMinor: money(row.tax_minor), totalMinor: money(row.total_minor) },
        estimatedTimelineText: cut(row.estimated_timeline, 200),
        validUntil: row.valid_until,
        sentAt: row.sent_at,
        acceptedAt: row.accepted_at,
        declinedAt: row.declined_at,
        understandingText: cut(row.understanding, 800),
        scopeText: cut(row.scope, 800),
        deliverablesText: cut(row.deliverables, 800),
        exclusionsText: cut(row.exclusions, 600),
        lines: lines.map((line) => ({ kind: line.kind, description: cut(line.description, 160), quantity: line.quantity, unitMinor: line.unit_minor })),
      }
    }),
    customerRevisionRequests: revisions.map((row) => ({ quotationReference: referenceOf.get(row.quote_id) ?? null, messageUntrusted: untrusted(row.message, 600), at: row.created_at, answered: row.handled_at !== null })),
    history: events.map((event) => ({ type: event.event_type, from: event.from_status, to: event.to_status, at: event.created_at })),
    link: link.quote(quote.reference, quote.id),
  }
}

/** What is missing from a request, as codes (the assistant words them in the administrator's language). Derived from the stored fields only. */
export function missingInRequest(quote: QuoteRow, itemCount: number): string[] {
  const missing: string[] = []
  if (!quote.objective) missing.push('objective')
  if (!quote.timing || quote.timing === 'unsure') missing.push('timing')
  if (!quote.budget_range) missing.push('budget_expectation')
  if (!quote.requirements) missing.push('requirements')
  if (!quote.phone) missing.push('phone')
  if (quote.description.trim().length < 40) missing.push('short_description')
  if (quote.kind === 'full_experience' && !quote.brief_json) missing.push('brief')
  if (quote.kind === 'catalogue' && itemCount === 0) missing.push('items')
  return missing
}

export function summarizeQuote(ctx: ReadCtx, reference: string | undefined) {
  const details = quoteDetails(ctx, reference)
  const quote = quoteByReference(ctx, details.reference)
  const itemCount = details.items.length
  const open = OPEN_STATUSES.includes(quote.status)
  const latest = details.quotations[details.quotations.length - 1] ?? null
  const today = ctx.app.clock.now().toISOString().slice(0, 10)
  return {
    ...details,
    derived: {
      basis: 'derived_from_stored_fields' as const,
      awaitingReview: quote.status === 'new' || quote.status === 'under_review',
      waitingForCustomer: quote.status === 'waiting_customer',
      open,
      daysSinceReceived: details.ageDays,
      missingInformation: missingInRequest(quote, itemCount),
      unansweredCustomerQuestions: details.customerRevisionRequests.filter((request) => !request.answered).length,
      quotationCount: details.quotations.length,
      latestQuotation: latest ? { reference: latest.reference, status: latest.status, expired: latest.validUntil !== null && latest.validUntil < today && latest.status === 'sent' } : null,
      hasQuotationDraftOrSent: details.quotations.length > 0,
    },
  }
}

export function compareQuotes(ctx: ReadCtx, references: string[]) {
  ctx.access.need(NEED)
  const unique = [...new Set(references)]
  const rows = unique.map((reference) => quoteByReference(ctx, reference))
  return {
    basis: 'actual' as const,
    compared: rows.map((quote) => {
      const items = quoteItems(ctx.app.db, quote.id)
      const quotations = quotationsOf(ctx.app.db, quote.id)
      const latest = quotations[quotations.length - 1] ?? null
      return {
        reference: quote.reference,
        status: quote.status,
        priority: quote.priority,
        requestType: quote.request_type,
        source: quote.source,
        language: quote.language,
        receivedAt: quote.created_at,
        customer: { name: cut(quote.name, 80), company: cut(quote.company, 80) },
        objective: quote.objective,
        timing: quote.timing,
        needs: items.map((item) => item.need),
        packages: [...new Set(items.map((item) => item.package).filter((code): code is string => code !== null))],
        extras: [...new Set(items.flatMap((item) => item.extras))],
        descriptionUntrusted: untrusted(quote.description, 400),
        budgetStatedByCustomerUntrusted: untrusted(quote.budget_range, 120),
        missingInformation: missingInRequest(quote, items.length),
        latestQuotation: latest ? { reference: latest.reference, status: latest.status, currency: latest.currency, storedTotalMinor: latest.total_minor } : null,
        link: link.quote(quote.reference, quote.id),
      }
    }),
  }
}
