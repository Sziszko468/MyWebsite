import type { UIMessage } from 'ai'
import { LANGUAGES, type Language } from '../../../config.ts'
import type { RequestCtx } from '../../../context.ts'
import { forbidden, notFound, validationFailed } from '../../../http/errors.ts'
import { empty, json } from '../../../http/reply.ts'
import type { RouteDef } from '../../../http/router.ts'
import { can, requirePermission } from '../../auth/permissions.ts'
import type { Trigger } from '../gateway.ts'
import { AI_MODEL_NAME, AI_PROVIDER_NAME } from '../model.ts'
import { adminAvailability, loadSettings } from '../settings.ts'
import { AccessDenied, accessFor, type Authority } from './access.ts'
import { LIMITS, RECORD_ID, REFERENCE, ToolRefusal } from './model.ts'
import type { ReadCtx } from './readers/common.ts'
import { searchConsultations } from './readers/consultations.ts'
import { searchConversations } from './readers/conversations.ts'
import { searchCustomers } from './readers/customers.ts'
import { searchProjects } from './readers/projects.ts'
import { searchQuotes } from './readers/quotes.ts'
import { ContextUnavailable, GENERAL, resolveScope } from './scope.ts'
import { ADMIN_CONVERSATION_ID, CONTEXT_TYPES, deleteAdminConversation, getAdminConversation, listAdminConversations, loadAdminMessages, type AdminConversationRow, type ContextType } from './store.ts'
import { adminUsage } from './usage.ts'

/**
 * The AI admin assistant's HTTP API (PROMPT 31), `/api/admin/ai-assistant/*`. Like the rest of the administration's API it needs the administrator's cookie session, a
 * CSRF token and a same-origin request on every state-changing call (the application does both before a handler runs), and it sends no CORS headers: a visitor's token can never
 * reach it. Every route needs `assistant:use`; reading the usage numbers needs `system:read`; changing the settings stays where it was (`system:write`, the AI screen).
 * A conversation is found only through the signed-in administrator: another administrator's conversation, a visitor's and a guessed id are all "not found".
 */

const authorityOf = (ctx: RequestCtx): Authority => ({ userId: ctx.session!.userId, tokenHash: ctx.session!.tokenHash })

function conversationOf(ctx: RequestCtx): AdminConversationRow {
  const id = ctx.params.id
  if (!ADMIN_CONVERSATION_ID.test(id)) throw notFound('The conversation')
  const row = getAdminConversation(ctx.app.db, ctx.session!.userId, id)
  if (!row) throw notFound('The conversation')
  return row
}

const summaryOf = (row: AdminConversationRow) => ({ id: row.id, title: row.title, language: row.language, contextType: row.context_type, contextRef: row.context_ref, status: row.status, messageCount: row.message_count, updatedAt: row.updated_at, createdAt: row.created_at })

/** A refusal from a reader, as the HTTP error the screen understands (no detail about why: not found and not allowed read the same). */
function asHttp(error: unknown): never {
  if (error instanceof AccessDenied) throw forbidden()
  if (error instanceof ToolRefusal || error instanceof ContextUnavailable) throw notFound('That')
  throw error
}

export function adminAssistantRoutes(): RouteDef[] {
  const admin = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler'], limit?: RouteDef['limit']): RouteDef => ({ method, pattern, area: 'admin', auth: true, handler, ...(limit ? { limit } : {}) })
  const base = '/api/admin/ai-assistant'

  return [
    // Whether the assistant can be used now and by this administrator, and what it will tell them about the data it uses.
    admin('GET', `${base}/config`, (ctx) => {
      const who = requirePermission(ctx.session, 'assistant:use')
      const settings = loadSettings(ctx.app)
      const state = adminAvailability(ctx.app, settings)
      return json({
        available: state.available,
        reason: state.available ? null : state.reason,
        languages: LANGUAGES,
        maxInputChars: settings.adminMaxInputChars,
        retentionDays: settings.retentionDays,
        canManage: can(who.role, 'system:write'),
        model: { name: AI_MODEL_NAME, provider: AI_PROVIDER_NAME },
        // What this administrator's role may ask the assistant about: the interface shows a context only when it can work.
        access: { quotes: can(who.role, 'requests:read'), consultations: can(who.role, 'requests:read'), customers: can(who.role, 'clients:read'), projects: can(who.role, 'clients:read'), conversations: can(who.role, 'clients:read') },
      })
    }),

    admin('GET', `${base}/conversations`, (ctx) => {
      requirePermission(ctx.session, 'assistant:use')
      const raw = ctx.query.get('q')
      const q = raw === null ? null : raw.replace(/\s+/g, ' ').trim().slice(0, LIMITS.query) || null
      return json(listAdminConversations(ctx.app.db, ctx.session!.userId, q).map(summaryOf))
    }),

    admin('GET', `${base}/conversations/:id`, (ctx) => {
      requirePermission(ctx.session, 'assistant:use')
      const row = conversationOf(ctx)
      const access = accessFor(ctx.app, authorityOf(ctx))
      let contextAvailable = true
      try {
        resolveScope(ctx.app, access, row.context_type, row.context_ref)
      } catch (error) {
        if (!(error instanceof ContextUnavailable)) throw error
        contextAvailable = false
      }
      return json({ ...summaryOf(row), contextAvailable, messages: loadAdminMessages(ctx.app.db, row.id).map((message) => JSON.parse(message.json) as UIMessage) })
    }),

    admin('DELETE', `${base}/conversations/:id`, (ctx) => {
      requirePermission(ctx.session, 'assistant:use')
      const row = conversationOf(ctx)
      deleteAdminConversation(ctx.app.db, ctx.session!.userId, row.id)
      return empty(204)
    }),

    // The records an administrator can pick as a context: found through the same readers (and permissions) the tools use, in the general scope.
    admin('GET', `${base}/contexts`, (ctx) => {
      requirePermission(ctx.session, 'assistant:use')
      const type = ctx.query.get('type') ?? ''
      if (!(CONTEXT_TYPES as readonly string[]).includes(type) || type === 'general') throw validationFailed({ type: 'invalid' })
      const q = (ctx.query.get('q') ?? '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.query) || undefined
      const rc: ReadCtx = { app: ctx.app, access: accessFor(ctx.app, authorityOf(ctx)), scope: GENERAL }
      try {
        const options = (() => {
          if (type === 'project') return searchProjects(rc, { query: q, limit: 10 }).items.map((item) => ({ ref: item.reference, label: `${item.reference} — ${item.name ?? ''}`.trim() }))
          if (type === 'quote') return searchQuotes(rc, { query: q, limit: 10 }).items.map((item) => ({ ref: item.reference, label: `${item.reference} — ${item.customer.name ?? ''} · ${item.status}`.trim() }))
          if (type === 'customer') return searchCustomers(rc, { query: q, limit: 10 }).items.map((item) => ({ ref: item.id, label: item.name ?? item.company ?? item.id }))
          if (type === 'conversation') return searchConversations(rc, { query: q, limit: 10 }).items.map((item) => ({ ref: item.reference, label: `${item.reference} — ${item.subject ?? ''}`.trim() }))
          return searchConsultations(rc, { query: q, when: 'all', limit: 10 }).items.map((item) => ({ ref: item.reference, label: `${item.reference} — ${item.startAt.slice(0, 16).replace('T', ' ')} UTC` }))
        })()
        return json(options)
      } catch (error) {
        return asHttp(error)
      }
    }),

    admin(
      'POST',
      `${base}/chat`,
      async (ctx) => {
        requirePermission(ctx.session, 'assistant:use')
        const body = await ctx.json()
        const conversationId = body.conversationId
        if (typeof conversationId !== 'string' || !ADMIN_CONVERSATION_ID.test(conversationId)) throw validationFailed({ conversationId: 'invalid' })
        const trigger = body.trigger === 'submit-user-message' || body.trigger === 'regenerate-assistant-message' ? (body.trigger as Trigger) : null
        if (!trigger) throw validationFailed({ trigger: 'invalid' })
        if (trigger === 'submit-user-message' && typeof body.text !== 'string') throw validationFailed({ text: 'required' })
        const language = body.language
        if (typeof language !== 'string' || !(LANGUAGES as readonly string[]).includes(language)) throw validationFailed({ language: 'invalid' })
        // The context of a NEW conversation; an existing conversation keeps the one it started with, whatever is sent here. Anything else in the body (a model, a tool, a
        // prompt, an administrator id, a history) is ignored: the browser decides none of those.
        let context: { type: ContextType; ref: string | null } = { type: 'general', ref: null }
        if (body.context !== undefined && body.context !== null) {
          const raw = body.context as Record<string, unknown>
          const type = typeof raw === 'object' ? raw.type : undefined
          const ref = typeof raw === 'object' ? raw.ref : undefined
          if (typeof type !== 'string' || !(CONTEXT_TYPES as readonly string[]).includes(type)) throw validationFailed({ context: 'invalid' })
          if (type === 'general' ? ref !== null && ref !== undefined : typeof ref !== 'string' || !(REFERENCE.test(ref) || RECORD_ID.test(ref))) throw validationFailed({ context: 'invalid' })
          context = { type: type as ContextType, ref: type === 'general' ? null : (ref as string) }
        }
        const response = await ctx.app.assistant.adminChat({
          authority: authorityOf(ctx),
          ip: ctx.ip,
          ipHash: ctx.ipHash,
          conversationId,
          language: language as Language,
          context,
          trigger,
          text: typeof body.text === 'string' ? body.text : '',
          signal: ctx.signal,
          requestId: ctx.requestId,
          log: ctx.log,
        })
        const headers: Record<string, string> = {}
        response.headers.forEach((value, key) => {
          if (!['content-length', 'cache-control'].includes(key.toLowerCase())) headers[key] = value
        })
        return { status: response.status, headers: { ...headers, 'Cache-Control': 'no-store' }, body: '', stream: response.body ?? undefined }
      },
      'aiAdmin',
    ),

    // The numbers of the admin assistant's use (no words): for the AI screen.
    admin('GET', `${base}/usage`, (ctx) => json(adminUsage(ctx.app, ctx.session, ctx.query.get('range')))),
  ]
}

