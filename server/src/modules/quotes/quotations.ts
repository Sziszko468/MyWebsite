import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext, SessionInfo } from '../../context.ts'
import type { Database } from '../../db/database.ts'
import { conflict, HttpError, notFound, validationFailed, type FieldErrors } from '../../http/errors.ts'
import { newId, sha256Hex } from '../../lib/crypto.ts'
import { cleanBlock, cleanLine, isRecord, length } from '../../lib/text.ts'
import { iso } from '../../lib/time.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { recordEvent } from './events.ts'
import { computeTotals, CURRENCIES, EXPONENT, fixedTotals, MoneyError, parseMoney, type Currency, type LineKind, type TaxMode, type TaxSetting, type Totals } from './money.ts'
import { quoteReference } from './references.ts'
import { getQuote, quoteItems, type QuoteRow } from './repository.ts'

/**
 * The quotation: a document the administrator writes for one request, in versions. A draft is edited freely; sending it freezes it (the
 * database refuses to change a sent version), and a change after that is a NEW version that replaces the old one when it is sent. Every
 * price is the administrator's own entry; the server only adds up what was entered, in whole minor units, and never invents or defaults one.
 */

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'superseded' | 'withdrawn'
export type PricingMode = 'fixed' | 'itemized' | 'custom'

export interface QuotationRow {
  id: string
  quote_request_id: string
  version: number
  reference: string
  status: QuotationStatus
  language: Language
  title: string
  introduction: string
  understanding: string
  scope: string
  deliverables: string
  exclusions: string
  payment_terms: string
  terms: string
  notes: string
  estimated_timeline: string
  valid_until: string | null
  pricing_mode: PricingMode
  pricing_note: string
  currency: Currency | null
  tax_mode: TaxMode
  tax_rate_bp: number | null
  tax_verified: number
  tax_note: string
  fixed_minor: number | null
  subtotal_minor: number | null
  discount_minor: number | null
  tax_minor: number | null
  total_minor: number | null
  revision_reason: string | null
  supersedes_id: string | null
  created_by: string | null
  content_hash: string | null
  created_at: string
  updated_at: string
  sent_at: string | null
  accepted_at: string | null
  accepted_ip_hash: string | null
  declined_at: string | null
  decline_reason: string | null
}

export interface LineRow {
  id: number
  quote_id: string
  position: number
  kind: LineKind
  description: string
  detail: string
  quantity: number
  unit_minor: number
  justification: string
}

export const getQuotation = (db: Database, id: string): QuotationRow | undefined => db.get<QuotationRow>('SELECT * FROM quotes WHERE id = ?', [id])
export const quotationsOf = (db: Database, requestId: string): QuotationRow[] => db.all<QuotationRow>('SELECT * FROM quotes WHERE quote_request_id = ? ORDER BY version', [requestId])
export const linesOf = (db: Database, quoteId: string): LineRow[] => db.all<LineRow>('SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position, id', [quoteId])

// ---- what the editor sends ---------------------------------------------------------------------------------------------

export const QUOTATION_LIMITS = { title: 160, section: 8000, line: 200, detail: 1000, justification: 500, lines: 60, note: 2000 } as const

export interface LineInput {
  kind: LineKind
  description: string
  detail: string
  quantity: number
  unitMinor: number
  justification: string
}

export interface DraftInput {
  language: Language
  title: string
  introduction: string
  understanding: string
  scope: string
  deliverables: string
  exclusions: string
  paymentTerms: string
  terms: string
  notes: string
  estimatedTimeline: string
  validUntil: string | null
  pricingMode: PricingMode
  pricingNote: string
  currency: Currency | null
  taxMode: TaxMode
  taxRateBp: number | null
  taxVerified: boolean
  taxNote: string
  fixedMinor: number | null
  lines: LineInput[]
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A date typed as YYYY-MM-DD, or `null` when it is not a real day. */
export function parseDay(value: unknown): string | null {
  if (typeof value !== 'string' || !DAY.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : value
}

/** "27", "27,5" or "7.25" per cent as basis points (2700, 2750, 725): digit by digit. `null` when it is not a percentage between 0 and 100. */
export function parsePercent(value: string): number | null {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(value.trim())
  if (!match) return null
  const basis = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0')
  return basis <= 10_000 ? basis : null
}

export function parseDraft(body: Record<string, unknown>): DraftInput {
  const errors: FieldErrors = {}
  const text = (field: string, max: number, multiline = true): string => {
    const raw = body[field]
    if (raw === undefined || raw === null) return ''
    if (typeof raw !== 'string') {
      errors[field] = 'invalid'
      return ''
    }
    const value = multiline ? cleanBlock(raw) : cleanLine(raw)
    if (length(value) > max) errors[field] = 'tooLong'
    return value
  }
  const choice = <T extends string>(field: string, allowed: readonly T[], fallback: T): T => {
    const raw = body[field]
    if (raw === undefined || raw === null || raw === '') return fallback
    if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) {
      errors[field] = 'invalid'
      return fallback
    }
    return raw as T
  }

  const language = choice('language', LANGUAGES, 'en')
  const pricingMode = choice<PricingMode>('pricingMode', ['fixed', 'itemized', 'custom'], 'itemized')
  const taxMode = choice<TaxMode>('taxMode', ['unspecified', 'excluded', 'included', 'exempt'], 'unspecified')
  const currencyRaw = body.currency
  let currency: Currency | null = null
  if (currencyRaw !== undefined && currencyRaw !== null && currencyRaw !== '') {
    if (typeof currencyRaw === 'string' && (CURRENCIES as readonly string[]).includes(currencyRaw)) currency = currencyRaw as Currency
    else errors.currency = 'invalid'
  }

  const validRaw = body.validUntil
  let validUntil: string | null = null
  if (validRaw !== undefined && validRaw !== null && validRaw !== '') {
    validUntil = parseDay(validRaw)
    if (validUntil === null) errors.validUntil = 'invalid'
  }

  let taxRateBp: number | null = null
  const rateRaw = body.taxRatePercent
  if (rateRaw !== undefined && rateRaw !== null && rateRaw !== '') {
    taxRateBp = typeof rateRaw === 'string' || typeof rateRaw === 'number' ? parsePercent(String(rateRaw)) : null
    if (taxRateBp === null) errors.taxRatePercent = 'invalid'
  }

  let fixedMinor: number | null = null
  const fixedRaw = body.fixedAmount
  if (pricingMode === 'fixed' && fixedRaw !== undefined && fixedRaw !== null && fixedRaw !== '') {
    if (!currency) errors.currency = 'required'
    else {
      fixedMinor = typeof fixedRaw === 'string' || typeof fixedRaw === 'number' ? parseMoney(String(fixedRaw), currency) : null
      if (fixedMinor === null) errors.fixedAmount = 'invalid'
    }
  }

  const lines: LineInput[] = []
  if (pricingMode === 'itemized') {
    const raw = body.lines
    if (raw !== undefined && raw !== null && !Array.isArray(raw)) errors.lines = 'invalid'
    else if (Array.isArray(raw)) {
      if (raw.length > QUOTATION_LIMITS.lines) errors.lines = 'tooMany'
      raw.slice(0, QUOTATION_LIMITS.lines).forEach((entry, index) => {
        const at = (name: string) => `lines.${index}.${name}`
        if (!isRecord(entry)) {
          errors[`lines.${index}`] = 'invalid'
          return
        }
        const kind = typeof entry.kind === 'string' && ['item', 'optional', 'discount'].includes(entry.kind) ? (entry.kind as LineKind) : null
        if (!kind) errors[at('kind')] = 'invalid'
        const description = typeof entry.description === 'string' ? cleanLine(entry.description) : ''
        if (!description) errors[at('description')] = 'required'
        else if (length(description) > QUOTATION_LIMITS.line) errors[at('description')] = 'tooLong'
        const detail = typeof entry.detail === 'string' ? cleanBlock(entry.detail) : ''
        if (length(detail) > QUOTATION_LIMITS.detail) errors[at('detail')] = 'tooLong'
        const quantity = entry.quantity === undefined || entry.quantity === null || entry.quantity === '' ? 1 : Number(entry.quantity)
        if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10_000) errors[at('quantity')] = 'invalid'
        let unitMinor = 0
        if (!currency) errors.currency ??= 'required'
        else {
          const parsed = typeof entry.unitPrice === 'string' || typeof entry.unitPrice === 'number' ? parseMoney(String(entry.unitPrice), currency) : null
          if (parsed === null) errors[at('unitPrice')] = entry.unitPrice === undefined || entry.unitPrice === '' ? 'required' : 'invalid'
          else unitMinor = parsed
        }
        const justification = typeof entry.justification === 'string' ? cleanBlock(entry.justification) : ''
        if (length(justification) > QUOTATION_LIMITS.justification) errors[at('justification')] = 'tooLong'
        if (kind === 'discount' && length(justification) < 3) errors[at('justification')] = 'required'
        if (kind && !errors[at('description')] && !errors[at('quantity')] && !errors[at('unitPrice')]) lines.push({ kind, description, detail, quantity, unitMinor, justification })
      })
    }
  }

  const draft: DraftInput = {
    language,
    title: text('title', QUOTATION_LIMITS.title, false),
    introduction: text('introduction', QUOTATION_LIMITS.section),
    understanding: text('understanding', QUOTATION_LIMITS.section),
    scope: text('scope', QUOTATION_LIMITS.section),
    deliverables: text('deliverables', QUOTATION_LIMITS.section),
    exclusions: text('exclusions', QUOTATION_LIMITS.section),
    paymentTerms: text('paymentTerms', QUOTATION_LIMITS.section),
    terms: text('terms', QUOTATION_LIMITS.section),
    notes: text('notes', QUOTATION_LIMITS.section),
    estimatedTimeline: text('estimatedTimeline', QUOTATION_LIMITS.detail),
    validUntil,
    pricingMode,
    pricingNote: text('pricingNote', QUOTATION_LIMITS.note),
    currency,
    taxMode,
    taxRateBp,
    taxVerified: body.taxVerified === true,
    taxNote: text('taxNote', QUOTATION_LIMITS.note),
    fixedMinor,
    lines,
  }
  if (draft.taxVerified && (draft.taxRateBp === null || (draft.taxMode !== 'excluded' && draft.taxMode !== 'included'))) errors.taxVerified = 'invalid'
  if (Object.keys(errors).length > 0) throw validationFailed(errors)
  return draft
}

// ---- the arithmetic ----------------------------------------------------------------------------------------------------

const taxOf = (draft: Pick<DraftInput, 'taxMode' | 'taxRateBp' | 'taxVerified'>): TaxSetting => ({ mode: draft.taxMode, rateBp: draft.taxRateBp, verified: draft.taxVerified })

/** The totals of a draft, or `null` for a custom quotation (a price in words) or while there is nothing to add up. Throws `validationFailed` if the arithmetic cannot hold. */
export function totalsOfDraft(draft: DraftInput): Totals | null {
  try {
    if (draft.pricingMode === 'custom') return null
    if (draft.pricingMode === 'fixed') return draft.fixedMinor === null ? null : fixedTotals(draft.fixedMinor, taxOf(draft))
    return computeTotals(draft.lines.map((line) => ({ kind: line.kind, quantity: line.quantity, unitMinor: line.unitMinor })), taxOf(draft))
  } catch (error) {
    if (error instanceof MoneyError) throw validationFailed({ lines: error.code === 'negative_total' ? 'invalid' : 'tooLong' }, error.code === 'negative_total' ? 'The discounts are larger than the items.' : 'An amount is too large.')
    throw error
  }
}

// ---- reading ----------------------------------------------------------------------------------------------------------

export function requireQuotation(app: AppContext, id: string): QuotationRow {
  const row = getQuotation(app.db, id)
  if (!row) throw notFound('The quotation')
  return row
}

/** What is still missing before a draft can be sent: the field and why. Empty means it can go. */
export function problemsBeforeSending(app: AppContext, quote: QuotationRow, lines: readonly LineRow[]): FieldErrors {
  const problems: FieldErrors = {}
  if (length(quote.title.trim()) < 3) problems.title = 'required'
  if (!quote.scope.trim()) problems.scope = 'required'
  if (!quote.terms.trim()) problems.terms = 'required'
  if (!quote.valid_until) problems.validUntil = 'required'
  else if (quote.valid_until < iso(app.clock.now()).slice(0, 10)) problems.validUntil = 'invalid'
  if (quote.pricing_mode === 'custom') {
    if (!quote.pricing_note.trim()) problems.pricingNote = 'required'
  } else {
    if (!quote.currency) problems.currency = 'required'
    if (quote.pricing_mode === 'fixed' && quote.fixed_minor === null) problems.fixedAmount = 'required'
    if (quote.pricing_mode === 'itemized' && !lines.some((line) => line.kind === 'item')) problems.lines = 'required'
  }
  if (quote.tax_mode === 'unspecified' && !quote.tax_note.trim() && quote.pricing_mode !== 'custom') problems.taxMode = 'required'
  if (quote.tax_verified === 1 && quote.tax_rate_bp === null) problems.taxRatePercent = 'required'
  return problems
}

// ---- writing ----------------------------------------------------------------------------------------------------------

function requireRequest(app: AppContext, id: string): QuoteRow {
  const row = getQuote(app.db, id)
  if (!row) throw notFound('The quote request')
  return row
}

/** Prices the catalogue published for what the customer chose, as lines to start from. A part with no published price becomes no line. */
function suggestedLines(app: AppContext, request: QuoteRow, language: Language): { currency: Currency | null; lines: LineInput[] } {
  const lines: LineInput[] = []
  let currency: Currency | null = null
  const nameOf = (names: unknown): string | null => (isRecord(names) && typeof names[language] === 'string' ? (names[language] as string) : null)
  for (const item of quoteItems(app.db, request.id)) {
    const parts: Array<{ part: { code: string; price: { kind: string; amount?: number; currency?: Currency } } | null; name: string | null }> = [
      { part: item.snapshot.plan, name: nameOf(item.names.package) },
      ...item.snapshot.extras.map((part) => ({ part, name: nameOf((item.names.extras as Array<{ code: string; names: unknown }> | undefined)?.find((extra) => extra.code === part.code)?.names) })),
    ]
    for (const { part, name } of parts) {
      if (!part || part.price.kind !== 'from' || typeof part.price.amount !== 'number' || !part.price.currency) continue
      if (currency && currency !== part.price.currency) continue
      currency = part.price.currency
      lines.push({ kind: 'item', description: name ?? part.code, detail: '', quantity: 1, unitMinor: part.price.amount * 10 ** EXPONENT[part.price.currency], justification: '' })
    }
  }
  return { currency, lines }
}

function insertLines(db: Database, quoteId: string, lines: readonly LineInput[]): void {
  lines.forEach((line, index) => db.run('INSERT INTO quote_lines (quote_id, position, kind, description, detail, quantity, unit_minor, justification) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [quoteId, index, line.kind, line.description, line.detail, line.quantity, line.unitMinor, line.justification]))
}

/** Starts a quotation for a request: the first version, or (with `from`) a revision of a version that was already sent. */
export function createDraft(app: AppContext, session: SessionInfo | null, requestId: string, options: { from?: string | null; reason?: unknown } = {}): QuotationRow {
  const actor = requirePermission(session, 'requests:write')
  const request = requireRequest(app, requestId)
  if (request.status === 'cancelled' || request.status === 'completed') throw conflict('This request is closed. Re-open it first.')
  const existing = quotationsOf(app.db, requestId)
  if (existing.some((row) => row.status === 'draft')) throw new HttpError(409, 'conflict', 'There is already a draft for this request. Finish or discard it first.', { details: { reason: 'draft_exists' } })
  const now = iso(app.clock.now())
  const version = (existing.length > 0 ? Math.max(...existing.map((row) => row.version)) : 0) + 1
  const id = newId()

  let source: QuotationRow | null = null
  let reason = ''
  if (options.from) {
    source = existing.find((row) => row.id === options.from) ?? null
    if (!source) throw notFound('The quotation')
    if (source.status !== 'sent' && source.status !== 'declined' && source.status !== 'withdrawn') throw conflict('Only a quotation that was sent (and not accepted) can be revised.')
    reason = typeof options.reason === 'string' ? cleanLine(options.reason) : ''
    if (length(reason) < 3) throw validationFailed({ reason: 'required' }, 'Say why the quotation is being revised.')
    if (length(reason) > 500) throw validationFailed({ reason: 'tooLong' })
  } else if (existing.some((row) => row.status === 'accepted')) {
    throw conflict('A quotation for this request was accepted. It cannot be replaced.')
  } else if (existing.length > 0) {
    // A second offer for the same request is a new VERSION of the first, with the reason written down, not a fresh start.
    throw new HttpError(409, 'conflict', 'This request already has a quotation. Make a new version of it and say why.', { details: { reason: 'use_revision' } })
  }

  app.db.transaction(() => {
    if (source) {
      app.db.run(
        `INSERT INTO quotes (id, quote_request_id, version, reference, status, language, title, introduction, understanding, scope, deliverables, exclusions, payment_terms, terms, notes, estimated_timeline, valid_until,
           pricing_mode, pricing_note, currency, tax_mode, tax_rate_bp, tax_verified, tax_note, fixed_minor, subtotal_minor, discount_minor, tax_minor, total_minor, revision_reason, supersedes_id, created_by, created_at, updated_at)
         SELECT ?, quote_request_id, ?, ?, 'draft', language, title, introduction, understanding, scope, deliverables, exclusions, payment_terms, terms, notes, estimated_timeline, NULL,
           pricing_mode, pricing_note, currency, tax_mode, tax_rate_bp, tax_verified, tax_note, fixed_minor, subtotal_minor, discount_minor, tax_minor, total_minor, ?, id, ?, ?, ? FROM quotes WHERE id = ?`,
        [id, version, quoteReference(request.reference, version), reason, actor.userId, now, now, source.id],
      )
      app.db.run(
        'INSERT INTO quote_lines (quote_id, position, kind, description, detail, quantity, unit_minor, justification) SELECT ?, position, kind, description, detail, quantity, unit_minor, justification FROM quote_lines WHERE quote_id = ?',
        [id, source.id],
      )
    } else {
      const suggestion = suggestedLines(app, request, request.language)
      const first = quoteItems(app.db, requestId)[0]
      const title = request.kind === 'full_experience' ? (request.source === 'control_room_ai' ? 'Control Room AI' : 'FULL EXPERIENCE') : ((first?.names.package as Record<string, string> | null | undefined)?.[request.language] ?? '')
      app.db.run(
        `INSERT INTO quotes (id, quote_request_id, version, reference, status, language, title, pricing_mode, currency, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, 'itemized', ?, ?, ?, ?)`,
        [id, requestId, version, quoteReference(request.reference, version), request.language, title, suggestion.currency, actor.userId, now, now],
      )
      insertLines(app.db, id, suggestion.lines)
    }
    // The working status follows the work: a request someone is writing an offer for is in quote preparation.
    if (request.status === 'new' || request.status === 'under_review' || request.status === 'waiting_customer' || request.status === 'declined') {
      app.db.run("UPDATE quote_requests SET status = 'quote_preparation', updated_at = ? WHERE id = ?", [now, requestId])
      recordEvent(app, { requestId, reference: request.reference, type: 'status_changed', actor: { type: 'admin', session: actor }, from: request.status, to: 'quote_preparation', summary: 'quotation started' })
    }
    recordEvent(app, { requestId, reference: request.reference, quoteId: id, type: source ? 'quote_version_created' : 'quote_created', actor: { type: 'admin', session: actor }, summary: `v${version}` })
    audit(app, actor, source ? 'quote.revise' : 'quote.create', 'quote', id, { request: request.reference, version })
  })
  return requireQuotation(app, id)
}

/** Replaces the content of a draft. */
export function saveDraft(app: AppContext, session: SessionInfo | null, id: string, body: Record<string, unknown>): QuotationRow {
  const actor = requirePermission(session, 'requests:write')
  const quote = requireQuotation(app, id)
  if (quote.status !== 'draft') throw new HttpError(409, 'conflict', 'A quotation that was sent is never edited. Make a new version.', { details: { reason: 'not_draft' } })
  const draft = parseDraft(body)
  const totals = totalsOfDraft(draft)
  const request = requireRequest(app, quote.quote_request_id)
  app.db.transaction(() => {
    app.db.run(
      `UPDATE quotes SET language = ?, title = ?, introduction = ?, understanding = ?, scope = ?, deliverables = ?, exclusions = ?, payment_terms = ?, terms = ?, notes = ?, estimated_timeline = ?, valid_until = ?,
         pricing_mode = ?, pricing_note = ?, currency = ?, tax_mode = ?, tax_rate_bp = ?, tax_verified = ?, tax_note = ?, fixed_minor = ?, subtotal_minor = ?, discount_minor = ?, tax_minor = ?, total_minor = ?, updated_at = ?
       WHERE id = ? AND status = 'draft'`,
      [
        draft.language, draft.title, draft.introduction, draft.understanding, draft.scope, draft.deliverables, draft.exclusions, draft.paymentTerms, draft.terms, draft.notes, draft.estimatedTimeline, draft.validUntil,
        draft.pricingMode, draft.pricingNote, draft.currency, draft.taxMode, draft.taxRateBp, draft.taxVerified, draft.taxNote, draft.pricingMode === 'fixed' ? draft.fixedMinor : null,
        totals?.subtotalMinor ?? null, totals?.discountMinor ?? null, totals?.taxMinor ?? null, totals?.totalMinor ?? null, iso(app.clock.now()), id,
      ],
    )
    app.db.run('DELETE FROM quote_lines WHERE quote_id = ?', [id])
    insertLines(app.db, id, draft.lines)
    recordEvent(app, { requestId: request.id, reference: request.reference, quoteId: id, type: 'quote_edited', actor: { type: 'admin', session: actor }, summary: `v${quote.version}` })
    audit(app, actor, 'quote.edit', 'quote', id, { version: quote.version })
  })
  return requireQuotation(app, id)
}

/** Throws away a draft nobody sent. A version that was sent stays on record. */
export function discardDraft(app: AppContext, session: SessionInfo | null, id: string): void {
  const actor = requirePermission(session, 'requests:write')
  const quote = requireQuotation(app, id)
  if (quote.status !== 'draft') throw new HttpError(409, 'conflict', 'Only a draft can be discarded.', { details: { reason: 'not_draft' } })
  const request = requireRequest(app, quote.quote_request_id)
  app.db.transaction(() => {
    app.db.run("DELETE FROM quotes WHERE id = ? AND status = 'draft'", [id])
    recordEvent(app, { requestId: request.id, reference: request.reference, type: 'quote_withdrawn', actor: { type: 'admin', session: actor }, summary: `draft v${quote.version} discarded` })
    audit(app, actor, 'quote.discard', 'quote', id, { version: quote.version })
  })
}

/** The fingerprint of everything the customer is shown. Stored when the version is sent. */
export function contentHashOfQuotation(quote: QuotationRow, lines: readonly LineRow[]): string {
  return sha256Hex(
    JSON.stringify([
      quote.reference, quote.language, quote.title, quote.introduction, quote.understanding, quote.scope, quote.deliverables, quote.exclusions, quote.payment_terms, quote.terms, quote.notes, quote.estimated_timeline, quote.valid_until,
      quote.pricing_mode, quote.pricing_note, quote.currency, quote.tax_mode, quote.tax_rate_bp, quote.tax_verified, quote.tax_note, quote.fixed_minor, quote.subtotal_minor, quote.discount_minor, quote.tax_minor, quote.total_minor,
      lines.map((line) => [line.kind, line.description, line.detail, line.quantity, line.unit_minor, line.justification]),
    ]),
  )
}

/** The stored totals of a draft, recomputed from its lines: a check that what is stored is what the arithmetic says. */
export function recomputed(quote: QuotationRow, lines: readonly LineRow[]): Totals | null {
  const tax: TaxSetting = { mode: quote.tax_mode, rateBp: quote.tax_rate_bp, verified: quote.tax_verified === 1 }
  if (quote.pricing_mode === 'custom') return null
  if (quote.pricing_mode === 'fixed') return quote.fixed_minor === null ? null : fixedTotals(quote.fixed_minor, tax)
  return computeTotals(lines.map((line) => ({ kind: line.kind, quantity: line.quantity, unitMinor: line.unit_minor })), tax)
}
