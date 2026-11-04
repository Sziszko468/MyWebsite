import type { AppContext, SessionInfo } from '../../context.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { iso } from '../../lib/time.ts'
import { cleanBlock, length } from '../../lib/text.ts'
import { parseListing, type Listing } from '../admin/listing.ts'
import { requirePermission } from '../auth/permissions.ts'
import { activityOf, type ActivityEvent } from '../system/activity.ts'
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
 * route can forget to: a missing session is a 401, the wrong role a 403.
 */

export function parseListQuery(query: URLSearchParams): ListFilters & Listing {
  const listing = parseListing(query)
  const status = query.get('status') ?? ''
  const kind = query.get('kind') ?? ''
  return {
    ...listing,
    status: (INQUIRY_STATUSES as readonly string[]).includes(status) ? status : undefined,
    kind: (INQUIRY_KINDS as readonly string[]).includes(kind) ? kind : undefined,
  }
}

export function listForAdmin(app: AppContext, session: SessionInfo | null, query: URLSearchParams) {
  requirePermission(session, 'requests:read')
  const filters = parseListQuery(query)
  return { filters, ...listInquiries(app.db, filters) }
}

export interface LinkedQuote {
  id: string
  reference: string
  status: string
  created_at: string
}

export function detailForAdmin(app: AppContext, session: SessionInfo | null, id: string): { inquiry: InquiryRow; notes: NoteRow[]; quotes: LinkedQuote[]; activity: ActivityEvent[] } {
  requirePermission(session, 'requests:read')
  const inquiry = getInquiry(app.db, id)
  if (!inquiry) throw notFound('The message')
  return {
    inquiry,
    notes: listInquiryNotes(app.db, id),
    quotes: app.db.all<LinkedQuote>('SELECT id, reference, status, created_at FROM quote_requests WHERE inquiry_id = ? ORDER BY created_at, id', [id]),
    activity: activityOf(app, 'inquiry', id, inquiry.created_at),
  }
}

export function changeStatus(app: AppContext, session: SessionInfo | null, id: string, input: { status: unknown; notify?: boolean; note?: unknown }): { notified: 'queued' | 'off' | 'not_requested' } {
  const actor = requirePermission(session, 'requests:write')
  if (typeof input.status !== 'string' || !(INQUIRY_STATUSES as readonly string[]).includes(input.status)) throw validationFailed({ status: 'invalid' })
  const note = typeof input.note === 'string' ? cleanBlock(input.note) : ''
  if (length(note) > 1000) throw validationFailed({ note: 'tooLong' })
  const existing = getInquiry(app.db, id)
  if (!existing) throw notFound('The message')
  updateInquiryStatus(app.db, id, input.status as InquiryStatus, iso(app.clock.now()))
  const emailed = input.notify === true ? app.notifier.notifyCustomer('inquiry_status', id, note || null) !== null : false
  if (existing.status !== input.status || emailed) audit(app, actor, 'inquiry.status', 'inquiry', id, { from: existing.status, to: input.status, emailed })
  if (!input.notify) return { notified: 'not_requested' }
  return { notified: emailed ? 'queued' : 'off' }
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
  const reference = getInquiry(app.db, id)?.reference
  app.db.transaction(() => {
    app.db.run("DELETE FROM email_deliveries WHERE related_type = 'inquiry' AND related_id = ?", [id])
    if (!deleteInquiry(app.db, id)) throw notFound('The message')
  })
  audit(app, actor, 'inquiry.delete', 'inquiry', id, { reference: reference ?? null })
}

export function overview(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'requests:read')
  return inquiryCounts(app.db)
}
