import type { AppContext, SessionInfo } from '../../context.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { iso } from '../../lib/time.ts'
import { cleanBlock, cleanLine, length } from '../../lib/text.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import {
  addInquiryNote,
  deleteInquiry,
  getInquiry,
  INQUIRY_KINDS,
  INQUIRY_STATUSES,
  inquiryCounts,
  listInquiries,
  listInquiryNotes,
  setInquiryArchived,
  updateInquiryStatus,
  type InquiryRow,
  type InquiryStatus,
  type ListFilters,
  type NoteRow,
} from './repository.ts'

/**
 * What an administrator can do with the contact messages. Every function checks the permission itself, so no
 * route (HTML or JSON) can forget to: a missing session is a 401, the wrong role a 403.
 */

export const PAGE_SIZE = 25

export function parseListQuery(query: URLSearchParams): ListFilters & { archived: 'exclude' | 'only' | 'all' } {
  const page = Math.max(1, Math.min(10_000, Number.parseInt(query.get('page') ?? '1', 10) || 1))
  const status = query.get('status') ?? ''
  const kind = query.get('kind') ?? ''
  const archived = query.get('archived')
  const q = cleanLine(query.get('q') ?? '').slice(0, 100)
  return {
    page,
    pageSize: PAGE_SIZE,
    status: (INQUIRY_STATUSES as readonly string[]).includes(status) ? status : undefined,
    kind: (INQUIRY_KINDS as readonly string[]).includes(kind) ? kind : undefined,
    archived: archived === 'only' || archived === 'all' ? archived : 'exclude',
    q: q || undefined,
  }
}

export function listForAdmin(app: AppContext, session: SessionInfo | null, query: URLSearchParams) {
  requirePermission(session, 'requests:read')
  const filters = parseListQuery(query)
  return { filters, ...listInquiries(app.db, filters) }
}

export function detailForAdmin(app: AppContext, session: SessionInfo | null, id: string): { inquiry: InquiryRow; notes: NoteRow[] } {
  requirePermission(session, 'requests:read')
  const inquiry = getInquiry(app.db, id)
  if (!inquiry) throw notFound('The message')
  return { inquiry, notes: listInquiryNotes(app.db, id) }
}

export function changeStatus(app: AppContext, session: SessionInfo | null, id: string, input: { status: unknown; notify?: boolean; note?: unknown }): { notified: 'queued' | 'off' | 'not_requested' } {
  const actor = requirePermission(session, 'requests:write')
  if (typeof input.status !== 'string' || !(INQUIRY_STATUSES as readonly string[]).includes(input.status)) throw validationFailed({ status: 'invalid' })
  const note = typeof input.note === 'string' ? cleanBlock(input.note) : ''
  if (length(note) > 1000) throw validationFailed({ note: 'tooLong' })
  if (!getInquiry(app.db, id)) throw notFound('The message')
  updateInquiryStatus(app.db, id, input.status as InquiryStatus, iso(app.clock.now()))
  audit(app, actor, 'inquiry.status', 'inquiry', id, { status: input.status })
  if (!input.notify) return { notified: 'not_requested' }
  return { notified: app.notifier.notifyCustomer('inquiry_status', id, note || null) ? 'queued' : 'off' }
}

export function archive(app: AppContext, session: SessionInfo | null, id: string, archived: boolean): void {
  const actor = requirePermission(session, 'requests:write')
  if (!setInquiryArchived(app.db, id, archived, iso(app.clock.now()))) throw notFound('The message')
  audit(app, actor, archived ? 'inquiry.archive' : 'inquiry.unarchive', 'inquiry', id)
}

export function addNote(app: AppContext, session: SessionInfo | null, id: string, body: unknown): void {
  const actor = requirePermission(session, 'requests:write')
  const text = typeof body === 'string' ? cleanBlock(body) : ''
  if (!text) throw validationFailed({ note: 'required' })
  if (length(text) > 2000) throw validationFailed({ note: 'tooLong' })
  if (!getInquiry(app.db, id)) throw notFound('The message')
  addInquiryNote(app.db, id, actor.userId, text, iso(app.clock.now()))
  audit(app, actor, 'inquiry.note', 'inquiry', id)
}

/** Permanent deletion: a record cannot be brought back. Only an `admin`. */
export function remove(app: AppContext, session: SessionInfo | null, id: string): void {
  const actor = requirePermission(session, 'requests:delete')
  app.db.transaction(() => {
    app.db.run("DELETE FROM email_deliveries WHERE related_type = 'inquiry' AND related_id = ?", [id])
    if (!deleteInquiry(app.db, id)) throw notFound('The message')
  })
  audit(app, actor, 'inquiry.delete', 'inquiry', id)
}

export function overview(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'requests:read')
  return inquiryCounts(app.db)
}
