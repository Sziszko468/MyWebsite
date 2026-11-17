import type { AppContext, SessionInfo } from '../../context.ts'
import { validationFailed } from '../../http/errors.ts'
import { Fields } from '../../lib/validate.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { contextOptions } from './customer.ts'
import { contextFrom, exact, plainId, tokenOf } from './input.ts'
import { CONTEXT_TYPES, DEFAULT_SETTINGS, LIMITS, type CommunicationSettings, type ContextType } from './model.ts'
import { markRead } from './reads.ts'
import { pageSize, searchTerm, sequenceOf } from './search.ts'
import { createThread, editNote, postMessage, removeMessage, resolveContext, setStatus } from './service.ts'
import { communicationSettings, saveCommunicationSettings } from './settings.ts'
import {
  ADMIN_FILTERS,
  adminConversation,
  adminConversationRow,
  adminInbox,
  adminOverview,
  adminSearch,
  searchInConversation,
  type AdminConversation,
  type AdminFilter,
  type AdminInboxQuery,
} from './views.ts'

/**
 * The administration's side of the conversations (PROMPT 28). Reading needs `clients:read`; everything that writes needs `clients:projects` (an editor has it); the owner's choices
 * need `system:write`. The check is HERE, in the business function, so no route can forget it. Every body is read field by field against the fields that exist: one that is not on
 * the list is refused, so a request cannot set what it has no business setting (a sender, a status through a message, a customer on an existing conversation). An administrator's
 * id comes from the session. The audit lines carry ids and kinds, never what was written.
 */

const PAGE = { before: null, limit: LIMITS.pageDefault } as const

// ---- reading ---------------------------------------------------------------------------------------------------------------------------

export function overview(app: AppContext, session: SessionInfo | null) {
  const who = requirePermission(session, 'clients:read')
  return { ...adminOverview(app, who.userId), settings: communicationSettings(app) }
}

export function list(app: AppContext, session: SessionInfo | null, query: URLSearchParams) {
  const who = requirePermission(session, 'clients:read')
  const filter = (query.get('filter') ?? 'all') as AdminFilter
  if (!ADMIN_FILTERS.includes(filter)) throw validationFailed({ filter: 'invalid' })
  const contextType = query.get('context')
  if (contextType !== null && contextType !== '' && !(CONTEXT_TYPES as readonly string[]).includes(contextType)) throw validationFailed({ context: 'invalid' })
  const date = (name: string): string | null => {
    const raw = query.get(name)
    if (!raw) return null
    if (!/^\d{4}-\d\d-\d\d$/.test(raw) || Number.isNaN(Date.parse(`${raw}T00:00:00Z`))) throw validationFailed({ [name]: 'invalid' })
    return raw
  }
  const id = (name: string): string | null => plainId(query.get(name), name)
  const from = date('from')
  const to = date('to')
  if (from && to && from > to) throw validationFailed({ to: 'invalid' })
  const input: AdminInboxQuery = {
    filter,
    customerId: id('customerId'),
    projectId: id('projectId'),
    contextType: contextType ? (contextType as ContextType) : null,
    from,
    to,
    cursor: query.get('cursor'),
    limit: pageSize(query.get('limit')),
  }
  return adminInbox(app, who.userId, input)
}

export function search(app: AppContext, session: SessionInfo | null, query: URLSearchParams) {
  const who = requirePermission(session, 'clients:read')
  return adminSearch(app, who.userId, searchTerm(query.get('q')), pageSize(query.get('limit')))
}

export function read(app: AppContext, session: SessionInfo | null, reference: string, query: URLSearchParams): AdminConversation {
  const who = requirePermission(session, 'clients:read')
  return adminConversation(app, who.userId, reference, { before: sequenceOf(query.get('before')), limit: pageSize(query.get('limit')) })
}

export function searchWithin(app: AppContext, session: SessionInfo | null, reference: string, query: URLSearchParams) {
  const who = requirePermission(session, 'clients:read')
  return searchInConversation(app, who.userId, reference, searchTerm(query.get('q')), pageSize(query.get('limit')))
}

/** What a thread for this customer could be about (the records they can see in the portal). */
export function contexts(app: AppContext, session: SessionInfo | null, rawCustomerId: string | null) {
  requirePermission(session, 'clients:read')
  const customerId = plainId(rawCustomerId, 'customerId')
  if (!customerId) throw validationFailed({ customerId: 'required' })
  return { items: contextOptions(app, customerId) }
}

// ---- writing ---------------------------------------------------------------------------------------------------------------------------

/** The owner starts a conversation with a customer: a text (the customer is asked to answer) or an announcement (they are told; it needs the owner's confirmation). */
export function start(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): AdminConversation {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['customerId', 'subject', 'body', 'kind', 'important', 'confirm', 'context', 'clientToken'])
  const fields = new Fields(body)
  const customerId = fields.text('customerId', { max: 64, required: true })
  const subject = fields.text('subject', { max: LIMITS.subject, required: true })
  const text = fields.text('body', { max: LIMITS.message, required: true, multiline: true })
  const kind = fields.oneOf('kind', ['reply', 'announcement'] as const) ?? 'reply'
  const important = 'important' in body ? body.important === true : false
  if ('important' in body && typeof body.important !== 'boolean') fields.fail('important', 'invalid')
  fields.consent('confirm', kind === 'announcement')
  const context = contextFrom(fields, body)
  const clientToken = tokenOf(fields)
  fields.done()
  plainId(customerId, 'customerId')
  const resolved = resolveContext(app, customerId!, context)
  if (important && kind === 'announcement') throw validationFailed({ important: 'invalid' })
  const { conversation } = createThread(app, { customerId: customerId!, starter: { type: 'admin', id: who.userId }, subject: subject!, body: text!, context: resolved, kind, important, clientToken })
  audit(app, who, 'communications.started', 'conversation', conversation.id, { kind, context: resolved?.type ?? null })
  return adminConversation(app, who.userId, conversation.reference, PAGE)
}

/** A reply, an announcement (confirmed) or a private note, in a conversation. */
export function post(app: AppContext, session: SessionInfo | null, reference: string, body: Record<string, unknown>): AdminConversation {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['body', 'kind', 'important', 'confirm', 'clientToken'])
  const fields = new Fields(body)
  const text = fields.text('body', { max: LIMITS.message, required: true, multiline: true })
  const kind = fields.oneOf('kind', ['reply', 'announcement', 'note'] as const, { required: true })
  const important = body.important === true
  if ('important' in body && typeof body.important !== 'boolean') fields.fail('important', 'invalid')
  const confirmed = fields.consent('confirm', kind === 'announcement')
  const clientToken = tokenOf(fields)
  fields.done()
  const conversation = adminConversationRow(app, reference)
  const { message } = postMessage(app, { conversation, sender: { type: 'admin', id: who.userId }, kind: kind!, body: text!, important, confirmed, clientToken })
  audit(app, who, `communications.${kind}`, 'conversation', conversation.id, { message: message.id })
  return adminConversation(app, who.userId, reference, PAGE)
}

export function changeStatus(app: AppContext, session: SessionInfo | null, reference: string, body: Record<string, unknown>): AdminConversation {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['status', 'revision'])
  const fields = new Fields(body)
  const status = fields.text('status', { max: 30, required: true })
  const revision = body.revision
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1 || revision > 1_000_000) fields.fail('revision', 'invalid')
  fields.done()
  const conversation = adminConversationRow(app, reference)
  const updated = setStatus(app, conversation, status!, revision as number)
  audit(app, who, 'communications.status', 'conversation', conversation.id, { from: conversation.status, to: updated.status })
  return adminConversation(app, who.userId, reference, PAGE)
}

/** The administrator's screen has shown messages up to `upTo`: their own marker (and nobody else's) moves there. */
export function markAsRead(app: AppContext, session: SessionInfo | null, reference: string, body: Record<string, unknown>): { marker: number } {
  const who = requirePermission(session, 'clients:read')
  exact(body, ['upTo'])
  const upTo = body.upTo
  if (typeof upTo !== 'number' || !Number.isInteger(upTo) || upTo < 0 || upTo > Number.MAX_SAFE_INTEGER) throw validationFailed({ upTo: 'invalid' })
  const conversation = adminConversationRow(app, reference)
  return { marker: markRead(app, conversation, { type: 'admin', id: who.userId }, upTo) }
}

export function remove(app: AppContext, session: SessionInfo | null, reference: string, messageId: string): AdminConversation {
  const who = requirePermission(session, 'clients:projects')
  const conversation = adminConversationRow(app, reference)
  removeMessage(app, conversation, messageId, who.userId)
  audit(app, who, 'communications.removed', 'conversation', conversation.id, { message: messageId })
  return adminConversation(app, who.userId, reference, PAGE)
}

export function editOwnNote(app: AppContext, session: SessionInfo | null, reference: string, messageId: string, body: Record<string, unknown>): AdminConversation {
  const who = requirePermission(session, 'clients:projects')
  exact(body, ['body'])
  const fields = new Fields(body)
  const text = fields.text('body', { max: LIMITS.note, required: true, multiline: true })
  fields.done()
  const conversation = adminConversationRow(app, reference)
  editNote(app, conversation, messageId, who.userId, text!)
  audit(app, who, 'communications.note_edited', 'conversation', conversation.id, { message: messageId })
  return adminConversation(app, who.userId, reference, PAGE)
}

// ---- the owner's choices ---------------------------------------------------------------------------------------------------------------

export function readSettings(app: AppContext, session: SessionInfo | null): CommunicationSettings {
  requirePermission(session, 'clients:read')
  return communicationSettings(app)
}

export function writeSettings(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): CommunicationSettings {
  const who = requirePermission(session, 'system:write')
  exact(body, Object.keys(DEFAULT_SETTINGS))
  const next = { ...communicationSettings(app) }
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== 'boolean') throw validationFailed({ [key]: 'invalid' })
    next[key as keyof CommunicationSettings] = value
  }
  saveCommunicationSettings(app, next, who.userId)
  audit(app, who, 'communications.settings', 'system', null)
  return next
}
