import type { AppContext, SessionInfo } from '../../context.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { toCsv } from '../../lib/csv.ts'
import { cleanBlock, cleanLine, length } from '../../lib/text.ts'
import { iso } from '../../lib/time.ts'
import { requirePermission } from '../auth/permissions.ts'
import { PAGE_SIZE } from '../inquiries/admin.ts'
import { totalsOf } from '../shop/pricing.ts'
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

/** What an administrator can do with the quote requests: the same shape as the inquiries' (modules/inquiries/admin.ts), plus export. */

export function parseQuoteQuery(query: URLSearchParams): QuoteFilters & { archived: 'exclude' | 'only' | 'all' } {
  const page = Math.max(1, Math.min(10_000, Number.parseInt(query.get('page') ?? '1', 10) || 1))
  const status = query.get('status') ?? ''
  const archived = query.get('archived')
  const q = cleanLine(query.get('q') ?? '').slice(0, 100)
  return {
    page,
    pageSize: PAGE_SIZE,
    status: (QUOTE_STATUSES as readonly string[]).includes(status) ? status : undefined,
    archived: archived === 'only' || archived === 'all' ? archived : 'exclude',
    q: q || undefined,
  }
}

export function listForAdmin(app: AppContext, session: SessionInfo | null, query: URLSearchParams) {
  requirePermission(session, 'requests:read')
  const filters = parseQuoteQuery(query)
  return { filters, ...listQuotes(app.db, filters) }
}

export function detailForAdmin(app: AppContext, session: SessionInfo | null, id: string) {
  requirePermission(session, 'requests:read')
  const quote = getQuote(app.db, id)
  if (!quote) throw notFound('The quote request')
  const items = quoteItems(app.db, id)
  return { quote, items, notes: listQuoteNotes(app.db, id), pricing: totalsOf(items.map((item) => item.snapshot)) }
}

export function changeStatus(app: AppContext, session: SessionInfo | null, id: string, input: { status: unknown; notify?: boolean; note?: unknown }): { notified: 'queued' | 'off' | 'not_requested' } {
  const actor = requirePermission(session, 'requests:write')
  if (typeof input.status !== 'string' || !(QUOTE_STATUSES as readonly string[]).includes(input.status)) throw validationFailed({ status: 'invalid' })
  const note = typeof input.note === 'string' ? cleanBlock(input.note) : ''
  if (length(note) > 1000) throw validationFailed({ note: 'tooLong' })
  if (!getQuote(app.db, id)) throw notFound('The quote request')
  updateQuoteStatus(app.db, id, input.status as QuoteStatus, iso(app.clock.now()))
  audit(app, actor, 'quote.status', 'quote_request', id, { status: input.status })
  if (!input.notify) return { notified: 'not_requested' }
  return { notified: app.notifier.notifyCustomer('quote_status', id, note || null) ? 'queued' : 'off' }
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
  app.db.transaction(() => {
    app.db.run("DELETE FROM email_deliveries WHERE related_type = 'quote_request' AND related_id = ?", [id])
    if (!deleteQuote(app.db, id)) throw notFound('The quote request')
  })
  audit(app, actor, 'quote.delete', 'quote_request', id)
}

export function overview(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'requests:read')
  return quoteCounts(app.db)
}

/** One request, complete, as JSON: the thing to hand to whoever writes the quote. */
export function exportOne(app: AppContext, session: SessionInfo | null, id: string): Record<string, unknown> {
  const { quote, items, notes, pricing } = detailForAdmin(app, session, id)
  const { id: _id, ip_hash: _ip, content_hash: _hash, ...visible } = quote
  return { ...visible, items, pricing, notes: notes.map((note) => ({ author: note.author_email, body: note.body, createdAt: note.created_at })) }
}

const summaryOf = (quote: QuoteRow, itemsText: string): unknown[] => [
  quote.reference, quote.created_at, quote.status, quote.name, quote.email, quote.phone, quote.language, itemsText, quote.objective, quote.timing, quote.description, quote.requirements, quote.reference_notes,
]

/** The current list (all pages, same filters) as CSV; cells that a spreadsheet could run as a formula are neutralised (lib/csv.ts). */
export function exportCsv(app: AppContext, session: SessionInfo | null, query: URLSearchParams): string {
  requirePermission(session, 'requests:read')
  const filters = { ...parseQuoteQuery(query), page: 1, pageSize: 5000 }
  const { rows } = listQuotes(app.db, filters)
  return toCsv(
    ['reference', 'received', 'status', 'name', 'email', 'phone', 'language', 'services', 'objective', 'timing', 'description', 'requirements', 'references'],
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
