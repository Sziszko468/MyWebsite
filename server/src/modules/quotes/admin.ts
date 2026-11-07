import type { AppContext, SessionInfo } from '../../context.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { toCsv } from '../../lib/csv.ts'
import { cleanBlock, length } from '../../lib/text.ts'
import { iso } from '../../lib/time.ts'
import { parseListing, type Listing } from '../admin/listing.ts'
import { requirePermission } from '../auth/permissions.ts'
import { getInquiry } from '../inquiries/repository.ts'
import { briefRows, readBrief } from '../shop/brief.ts'
import { totalsOf } from '../shop/pricing.ts'
import { activityOf } from '../system/activity.ts'
import { audit } from '../system/audit.ts'
import {
  addQuoteNote,
  deleteQuote,
  getQuote,
  listQuoteNotes,
  listQuotes,
  QUOTE_STATUSES,
  quoteCounts,
  quoteItems,
  setQuoteArchived,
  updateQuoteStatus,
  type QuoteFilters,
  type QuoteRow,
  type QuoteStatus,
} from './repository.ts'

/** What an administrator can do with the quote requests: the same shape as the inquiries' (modules/inquiries/admin.ts), plus linking to an inquiry and export. */

export function parseQuoteQuery(query: URLSearchParams): QuoteFilters & Listing {
  const listing = parseListing(query)
  const status = query.get('status') ?? ''
  return { ...listing, status: (QUOTE_STATUSES as readonly string[]).includes(status) ? status : undefined }
}

export function listForAdmin(app: AppContext, session: SessionInfo | null, query: URLSearchParams) {
  requirePermission(session, 'requests:read')
  const filters = parseQuoteQuery(query)
  const { rows, total } = listQuotes(app.db, filters)
  return { filters, rows, total, itemsOf: itemsSummary(app, rows.map((row) => row.id)) }
}

/** What each listed request asked for, in a word each (the need and the package), fetched for the whole page in one query. */
function itemsSummary(app: AppContext, ids: string[]): Record<string, { need: string; plan: string }[]> {
  const out: Record<string, { need: string; plan: string }[]> = {}
  if (ids.length === 0) return out
  const placeholders = ids.map(() => '?').join(', ')
  for (const row of app.db.all<{ quote_request_id: string; need: string; plan: string }>(`SELECT quote_request_id, need, plan FROM quote_request_items WHERE quote_request_id IN (${placeholders}) ORDER BY position`, ids)) {
    ;(out[row.quote_request_id] ??= []).push({ need: row.need, plan: row.plan })
  }
  return out
}

export interface InquirySummary {
  id: string
  reference: string
  name: string
  subject: string
  status: string
  created_at: string
}

const SUMMARY = 'SELECT id, reference, name, subject, status, created_at FROM inquiries'

export function detailForAdmin(app: AppContext, session: SessionInfo | null, id: string) {
  requirePermission(session, 'requests:read')
  const quote = getQuote(app.db, id)
  if (!quote) throw notFound('The quote request')
  const items = quoteItems(app.db, id)
  const linked = quote.inquiry_id ? app.db.get<InquirySummary>(`${SUMMARY} WHERE id = ?`, [quote.inquiry_id]) ?? null : null
  return {
    quote,
    items,
    notes: listQuoteNotes(app.db, id),
    pricing: totalsOf(items.map((item) => item.snapshot)),
    inquiry: linked,
    // The messages the same address has sent: the likely ones to link this request to.
    candidates: app.db.all<InquirySummary>(`${SUMMARY} WHERE email = ? ORDER BY created_at DESC LIMIT 10`, [quote.email]),
    activity: activityOf(app, 'quote_request', id, quote.created_at),
  }
}

export function changeStatus(app: AppContext, session: SessionInfo | null, id: string, input: { status: unknown; notify?: boolean; note?: unknown }): { notified: 'queued' | 'off' | 'not_requested' } {
  const actor = requirePermission(session, 'requests:write')
  if (typeof input.status !== 'string' || !(QUOTE_STATUSES as readonly string[]).includes(input.status)) throw validationFailed({ status: 'invalid' })
  const note = typeof input.note === 'string' ? cleanBlock(input.note) : ''
  if (length(note) > 1000) throw validationFailed({ note: 'tooLong' })
  const existing = getQuote(app.db, id)
  if (!existing) throw notFound('The quote request')
  updateQuoteStatus(app.db, id, input.status as QuoteStatus, iso(app.clock.now()))
  const emailed = input.notify === true ? app.notifier.notifyCustomer('quote_status', id, note || null) !== null : false
  if (existing.status !== input.status || emailed) audit(app, actor, 'quote.status', 'quote_request', id, { from: existing.status, to: input.status, emailed })
  if (!input.notify) return { notified: 'not_requested' }
  return { notified: emailed ? 'queued' : 'off' }
}

/** Says which inquiry a quote request belongs to, or (with `null`) that it belongs to none. */
export function linkInquiry(app: AppContext, session: SessionInfo | null, id: string, inquiryId: unknown): void {
  const actor = requirePermission(session, 'requests:write')
  if (inquiryId !== null && typeof inquiryId !== 'string') throw validationFailed({ inquiryId: 'invalid' })
  if (!getQuote(app.db, id)) throw notFound('The quote request')
  const inquiry = inquiryId === null ? null : getInquiry(app.db, inquiryId)
  if (inquiryId !== null && !inquiry) throw validationFailed({ inquiryId: 'invalid' })
  app.db.run('UPDATE quote_requests SET inquiry_id = ?, updated_at = ? WHERE id = ?', [inquiryId, iso(app.clock.now()), id])
  audit(app, actor, inquiry ? 'quote.link' : 'quote.unlink', 'quote_request', id, { inquiry: inquiry?.reference ?? null })
}

export function archive(app: AppContext, session: SessionInfo | null, id: string, archived: boolean): void {
  const actor = requirePermission(session, 'requests:write')
  if (!setQuoteArchived(app.db, id, archived, iso(app.clock.now()))) throw notFound('The quote request')
  audit(app, actor, archived ? 'quote.archive' : 'quote.unarchive', 'quote_request', id)
}

export function addNote(app: AppContext, session: SessionInfo | null, id: string, body: unknown): void {
  const actor = requirePermission(session, 'requests:write')
  const text = typeof body === 'string' ? cleanBlock(body) : ''
  if (!text) throw validationFailed({ note: 'required' })
  if (length(text) > 2000) throw validationFailed({ note: 'tooLong' })
  if (!getQuote(app.db, id)) throw notFound('The quote request')
  addQuoteNote(app.db, id, actor.userId, text, iso(app.clock.now()))
  audit(app, actor, 'quote.note', 'quote_request', id)
}

export function remove(app: AppContext, session: SessionInfo | null, id: string): void {
  const actor = requirePermission(session, 'requests:delete')
  const reference = getQuote(app.db, id)?.reference
  app.db.transaction(() => {
    app.db.run("DELETE FROM email_deliveries WHERE related_type = 'quote_request' AND related_id = ?", [id])
    if (!deleteQuote(app.db, id)) throw notFound('The quote request')
  })
  audit(app, actor, 'quote.delete', 'quote_request', id, { reference: reference ?? null })
}

export function overview(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'requests:read')
  return quoteCounts(app.db)
}

/** One request, complete, as JSON: the thing to hand to whoever writes the quote. */
export function exportOne(app: AppContext, session: SessionInfo | null, id: string): Record<string, unknown> {
  const { quote, items, notes, pricing } = detailForAdmin(app, session, id)
  const { id: _id, ip_hash: _ip, content_hash: _hash, inquiry_id: _inquiry, brief_json: briefJson, ...visible } = quote
  // The brief of a FULL EXPERIENCE request is an object in the export, not the text it is stored as.
  return { ...visible, ...(briefJson ? { brief: readBrief(briefJson) } : {}), items, pricing, notes: notes.map((note) => ({ author: note.author_email, body: note.body, createdAt: note.created_at })) }
}

const summaryOf = (quote: QuoteRow, itemsText: string): unknown[] => [
  quote.reference, quote.created_at, quote.status, quote.name, quote.email, quote.phone, quote.language, quote.kind === 'full_experience' ? 'FULL EXPERIENCE' : itemsText, quote.objective, quote.timing, quote.description, quote.requirements, quote.reference_notes,
  quote.kind, quote.company, quote.kind === 'full_experience' ? briefRows(quote, 'en').map((row) => `${row.label}: ${row.value}`).join('; ') : null,
]

/** The current list (all pages, same filters) as CSV; cells that a spreadsheet could run as a formula are neutralised (lib/csv.ts). */
export function exportCsv(app: AppContext, session: SessionInfo | null, query: URLSearchParams): string {
  requirePermission(session, 'requests:read')
  const filters = { ...parseQuoteQuery(query), page: 1, pageSize: 5000 }
  const { rows } = listQuotes(app.db, filters)
  return toCsv(
    ['reference', 'received', 'status', 'name', 'email', 'phone', 'language', 'services', 'objective', 'timing', 'description', 'requirements', 'references', 'kind', 'company', 'brief'],
    rows.map((quote) =>
      summaryOf(
        quote,
        quoteItems(app.db, quote.id)
          .map((item) => `${item.need}:${item.plan}${item.extras.length ? `+${item.extras.join('+')}` : ''}`)
          .join('; '),
      ),
    ),
  )
}
