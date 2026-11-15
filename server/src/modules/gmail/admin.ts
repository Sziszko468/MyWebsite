import type { AppContext, SessionInfo } from '../../context.ts'
import { conflict, notFound, validationFailed } from '../../http/errors.ts'
import { can, requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import {
  detailOf,
  ENTITY_TYPES,
  getMessage,
  listForTarget,
  listPending,
  summaryOf,
  targetExists,
  targetOf,
  writeAssociation,
  type EntityType,
  type MessageDetail,
  type MessageRow,
  type MessageSummary,
  type Target,
} from './repository.ts'
import { SYNC_LIMITS, SyncBusyError, type SyncResult, type SyncStatus } from './sync.ts'
import type { GmailCheckedStatus, GmailErrorCategory } from './tokenService.ts'

/**
 * The administration's side of Gmail: the connection status and the check (step 2), and now the synchronisation and the messages it
 * stores (step 3). Every function checks the permission itself, so no route can forget to.
 *
 * Who may do what (least privilege):
 *   - the connection status, the sync status, the list of unassigned messages: `system:read` (administrators)
 *   - a check of the connection, a synchronisation: `system:write` (administrators): both make requests to Google
 *   - the messages of one request, one message that belongs to a request: `requests:read` (editors too: it is the conversation of
 *     a request they may already read)
 *   - placing a message on a request, or taking it off: `requests:write`; and a message that belongs to no request is visible only to
 *     those who may read the system page, because the mailbox also holds mail that has nothing to do with any customer. To anyone else
 *     it does not exist (404), not even as a refusal.
 *
 * What leaves this file is picked field by field (repository.ts: `summaryOf`, `detailOf`): never the raw payload, never a Gmail
 * attachment id, never a token. Message text is data: it is not put in a log line or in the administrator log.
 */

export interface GmailStatusView {
  configured: boolean
  connected: boolean
  /** The mailbox the integration is set up for. Shown only to someone who may read the system page. */
  accountEmail: string | null
  /** A category from a fixed list (never a message from Google or from the network); the administration words it in its own language. */
  lastError: GmailErrorCategory | null
  /** When the last request to Google finished (ISO 8601, UTC); null when no check has been made since the server started. */
  checkedAt: string | null
}

const view = (status: GmailCheckedStatus): GmailStatusView => ({
  configured: status.configured,
  connected: status.connected,
  accountEmail: status.accountEmail,
  lastError: status.lastError,
  checkedAt: status.checkedAt,
})

/** What is known now. Makes no request to Google, so it is cheap and cannot fail because Google does. */
export function gmailStatus(app: AppContext, session: SessionInfo | null): GmailStatusView {
  requirePermission(session, 'system:read')
  return view(app.gmail.snapshot())
}

/** A real check: asks Google for a new access token, records the outcome and returns it. A failed connection is a result, not an error. */
export async function gmailCheck(app: AppContext, session: SessionInfo | null): Promise<GmailStatusView> {
  const who = requirePermission(session, 'system:write')
  // Each check is a request to Google: a script (or a stuck button) cannot make hundreds of them. Counted per administrator, after the permission.
  app.limiters.check('gmailCheck', who.userId)
  const result = view(await app.gmail.check())
  // Only a check that really asked Google is worth a line in the log of administrator actions; the line says the outcome, nothing more.
  if (result.configured) audit(app, who, result.connected ? 'gmail.check' : 'gmail.check_failed', 'system', null, result.connected ? undefined : { category: result.lastError })
  return result
}

// -------------------------------------------------------------------------------------------------------------- sync

export function syncStatus(app: AppContext, session: SessionInfo | null): SyncStatus {
  requirePermission(session, 'system:read')
  return app.gmailSync.status()
}

function wholeNumber(body: Record<string, unknown>, field: 'windowDays' | 'maxImport', limits: { min: number; max: number }): number | undefined {
  const value = body[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < limits.min || value > limits.max) throw validationFailed({ [field]: 'invalid' })
  return value
}

/** One bounded synchronisation. What it imported is kept even when it could not finish; the answer says how far it got. */
export async function runSync(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): Promise<SyncResult> {
  const who = requirePermission(session, 'system:write')
  app.limiters.check('gmailSync', who.userId)
  if (!app.config.gmail.enabled) throw conflict('Gmail is not configured.')
  const options = { windowDays: wholeNumber(body, 'windowDays', SYNC_LIMITS.windowDays), maxImport: wholeNumber(body, 'maxImport', SYNC_LIMITS.maxImport) }
  let result: SyncResult
  try {
    result = await app.gmailSync.run(options)
  } catch (error) {
    if (error instanceof SyncBusyError) throw conflict('A synchronization is already running.')
    throw error
  }
  // Numbers and a category only: the administrator log never holds a subject, an address or a word of a message.
  const ended = result.error !== null && result.error !== 'partial_failure'
  audit(app, who, ended ? 'gmail.sync_failed' : 'gmail.sync', 'system', null, { imported: result.imported, duplicates: result.skippedDuplicates, failed: result.failed, category: result.error })
  return result
}

// ---------------------------------------------------------------------------------------------------------- messages

const MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const ENTITY_ID = /^[A-Za-z0-9-]{1,64}$/

export interface MessagePage {
  messages: MessageSummary[]
  total: number
  limit: number
  offset: number
}

function paging(query: URLSearchParams): { limit: number; offset: number } {
  const number = (name: string, fallback: number, min: number, max: number): number => {
    const raw = query.get(name)
    if (raw === null || raw === '') return fallback
    if (!/^\d{1,9}$/.test(raw)) throw validationFailed({ [name]: 'invalid' })
    return Math.min(max, Math.max(min, Number(raw)))
  }
  return { limit: number('limit', 50, 1, 100), offset: number('offset', 0, 0, 1_000_000) }
}

/** The row, or 404. A message that belongs to no request does not exist for someone who may not read the system page. */
function load(app: AppContext, session: SessionInfo, id: string): MessageRow {
  const row = MESSAGE_ID.test(id) ? getMessage(app.db, id) : undefined
  if (!row) throw notFound('The message')
  if (targetOf(row) === null && !can(session.role, 'system:read')) throw notFound('The message')
  return row
}

/** The messages of one request (an inquiry or a quote request), oldest first: its conversation. */
export function messagesOf(app: AppContext, session: SessionInfo | null, type: EntityType, id: string, query: URLSearchParams): MessagePage {
  requirePermission(session, 'requests:read')
  const target: Target = { type, id }
  if (!ENTITY_ID.test(id) || !targetExists(app.db, target)) throw notFound(type === 'inquiry' ? 'The message' : 'The quote request')
  const { limit, offset } = paging(query)
  const page = listForTarget(app.db, target, limit, offset)
  return { messages: page.rows.map(summaryOf), total: page.total, limit, offset }
}

/** Messages waiting for a request (newest first). */
export function unassignedMessages(app: AppContext, session: SessionInfo | null, query: URLSearchParams): MessagePage {
  requirePermission(session, 'system:read')
  const { limit, offset } = paging(query)
  const page = listPending(app.db, limit, offset)
  return { messages: page.rows.map(summaryOf), total: page.total, limit, offset }
}

export function readMessage(app: AppContext, session: SessionInfo | null, id: string): MessageDetail {
  const who = requirePermission(session, 'requests:read')
  return detailOf(load(app, who, id))
}

/** Places a message on a request by hand. The decision is final: no automatic rule changes it afterwards. */
export function associateMessage(app: AppContext, session: SessionInfo | null, id: string, body: Record<string, unknown>): MessageDetail {
  const who = requirePermission(session, 'requests:write')
  const row = load(app, who, id)
  const type = typeof body.entityType === 'string' && (ENTITY_TYPES as readonly string[]).includes(body.entityType) ? (body.entityType as EntityType) : null
  if (!type) throw validationFailed({ entityType: 'invalid' })
  if (typeof body.entityId !== 'string' || !ENTITY_ID.test(body.entityId)) throw validationFailed({ entityId: 'invalid' })
  const target: Target = { type, id: body.entityId }
  const saved = app.db.transaction(() => {
    if (!targetExists(app.db, target)) throw validationFailed({ entityId: 'invalid' })
    writeAssociation(app.db, row.id, target, 'manual', true)
    return getMessage(app.db, row.id)!
  })
  audit(app, who, 'gmail.message.associate', 'gmail_message', row.id, { entityType: target.type, entityId: target.id })
  return detailOf(saved)
}

/** Takes a message off its request, and says so for good: it is not offered again as waiting, and no rule puts it back. */
export function unassociateMessage(app: AppContext, session: SessionInfo | null, id: string): MessageDetail {
  const who = requirePermission(session, 'requests:write')
  const row = load(app, who, id)
  const previous = targetOf(row)
  const saved = app.db.transaction(() => {
    writeAssociation(app.db, row.id, null, null, true)
    return getMessage(app.db, row.id)!
  })
  audit(app, who, 'gmail.message.unassociate', 'gmail_message', row.id, previous ? { entityType: previous.type, entityId: previous.id } : undefined)
  return detailOf(saved)
}
