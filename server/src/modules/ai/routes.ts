import { LANGUAGES, type Language } from '../../config.ts'
import type { AppContext, RequestCtx } from '../../context.ts'
import { HttpError, notFound, unauthorized, validationFailed } from '../../http/errors.ts'
import { empty, json, type Reply } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { sha256Hex } from '../../lib/crypto.ts'
import { isRecord } from '../../lib/text.ts'
import { acknowledgeAlerts } from './alerts.ts'
import { summaryOf, usageOverview, usageSeries } from './admin.ts'
import { classify, unavailable, type Trigger } from './gateway.ts'
import { isReady, missingFields, readPlanChanges, readStoredPlan, planHash, emptyPlan, type ProjectPlan } from './plan.ts'
import { approve, parseApproval } from './quote.ts'
import { availability, loadSettings, publicConfig, saveSettings } from './settings.ts'
import { CONVERSATION_ID, createSession, eraseConversation, getConversation, listConversations, loadMessages, markPlannerCompleted, resolveSession, savePlan, type ConversationRow, type SessionRow } from './store.ts'
import { requirePermission } from '../auth/permissions.ts'

/**
 * The assistant's HTTP surface.
 *
 *   public   GET /api/ai/config                       whether and how to offer the assistant (cacheable, no secret)
 *            POST /api/ai/session                     an anonymous session token (HMAC-signed, no account, no cookie)
 *            POST /api/ai/chat                        one message in, a streamed answer out
 *            GET/DELETE /api/ai/conversations[/:id]   the session's own conversations: list, read, delete
 *            PUT/DELETE /api/ai/conversations/:id/plan   the visitor edits or restarts the project plan
 *            POST /api/ai/conversations/:id/quote-approval   "Send this request": the approval the submit tool needs
 *   admin    GET /api/admin/ai · PUT /api/admin/ai/settings · GET /api/admin/ai/usage · POST /api/admin/ai/knowledge/refresh
 *            POST /api/admin/ai/connection-test (the server-side test of the required model) · POST /api/admin/ai/alerts/acknowledge
 *
 * A session token travels in the `X-AI-Session` header (not a cookie: the public API is cookie-free and may sit on another
 * origin). A conversation belongs to the session that started it; another session gets "not found", never "forbidden".
 */

const HEADER = 'x-ai-session'

function requireSession(ctx: RequestCtx): SessionRow {
  const raw = ctx.req.headers[HEADER]
  const session = resolveSession(ctx.app.db, ctx.app.clock, ctx.app.config.ai.sessionSecret, typeof raw === 'string' ? raw : undefined)
  if (!session) throw unauthorized('Start a new assistant session.')
  return session
}

function conversationOf(ctx: RequestCtx, session: SessionRow): ConversationRow {
  const id = ctx.params.id
  if (!CONVERSATION_ID.test(id)) throw notFound('The conversation')
  const row = getConversation(ctx.app.db, session.id, id)
  if (!row || row.deleted_at) throw notFound('The conversation')
  return row
}

const planState = (row: ConversationRow) => {
  const plan = readStoredPlan(row.plan_json)
  return { plan, version: row.plan_version, missing: plan ? missingFields(plan) : missingFields(emptyPlan()), ready: plan ? isReady(plan) : false, sent: row.quote_reference !== null, reference: row.quote_reference }
}

const summaryRow = (row: ConversationRow) => ({ id: row.id, title: row.title, language: row.language, topic: row.topic, messageCount: row.message_count, updatedAt: row.updated_at, createdAt: row.created_at, planReady: planState(row).ready, sent: row.quote_reference !== null })

function language(value: unknown, allowed: readonly Language[]): Language {
  if (typeof value !== 'string' || !(LANGUAGES as readonly string[]).includes(value) || !allowed.includes(value as Language)) throw validationFailed({ language: 'invalid' })
  return value as Language
}

export function aiRoutes(_app: AppContext): RouteDef[] {
  const pub = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler'], limit: RouteDef['limit'] = 'aiRead'): RouteDef => ({ method, pattern, area: 'api', limit, handler })
  const admin = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler']): RouteDef => ({ method, pattern, area: 'admin', auth: true, handler })

  return [
    pub('GET', '/api/ai/config', (ctx) => {
      const reply = json(publicConfig(ctx.app))
      const etag = `"${sha256Hex(String(reply.body)).slice(0, 24)}"`
      const headers = { ETag: etag, 'Cache-Control': 'public, max-age=60', Vary: 'Origin' }
      if (ctx.req.headers['if-none-match'] === etag) return empty(304, headers)
      return { ...reply, headers: { ...reply.headers, ...headers } }
    }),

    pub(
      'POST',
      '/api/ai/session',
      async (ctx) => {
        await ctx.json().catch(() => ({}))
        const state = availability(ctx.app)
        if (!state.available) throw unavailable(state.reason)
        const session = createSession(ctx.app.db, ctx.app.clock, ctx.app.config.ai.sessionSecret, ctx.ipHash)
        return json({ token: session.token, expiresAt: session.expiresAt }, { status: 201 })
      },
      'aiSession',
    ),

    pub(
      'POST',
      '/api/ai/chat',
      async (ctx): Promise<Reply> => {
        const session = requireSession(ctx)
        const body = await ctx.json()
        const settings = loadSettings(ctx.app)
        const id = body.conversationId
        if (typeof id !== 'string' || !CONVERSATION_ID.test(id)) throw validationFailed({ conversationId: 'invalid' })
        const trigger = body.trigger === 'regenerate-assistant-message' ? 'regenerate-assistant-message' : body.trigger === 'submit-user-message' ? 'submit-user-message' : null
        if (!trigger) throw validationFailed({ trigger: 'invalid' })
        if (trigger === 'submit-user-message' && typeof body.text !== 'string') throw validationFailed({ text: 'required' })
        // Anything else in the body (a model, tools, a system prompt, a message history) is ignored: the browser does not decide those.
        const response = await ctx.app.assistant.chat({
          sessionId: session.id,
          ip: ctx.ip,
          ipHash: ctx.ipHash,
          conversationId: id,
          language: language(body.language, settings.languages),
          trigger: trigger as Trigger,
          text: typeof body.text === 'string' ? body.text : '',
          signal: ctx.signal,
        })
        const headers: Record<string, string> = {}
        response.headers.forEach((value, key) => {
          if (!['content-length', 'cache-control'].includes(key.toLowerCase())) headers[key] = value
        })
        return { status: response.status, headers: { ...headers, 'Cache-Control': 'no-store' }, body: '', stream: response.body ?? undefined }
      },
      'aiRead',
    ),

    pub('GET', '/api/ai/conversations', (ctx) => {
      const session = requireSession(ctx)
      return json(listConversations(ctx.app.db, session.id).map(summaryRow))
    }),

    pub('GET', '/api/ai/conversations/:id', (ctx) => {
      const session = requireSession(ctx)
      const row = conversationOf(ctx, session)
      const messages = loadMessages(ctx.app.db, row.id).map((message) => JSON.parse(message.json) as unknown)
      return json({ ...summaryRow(row), messages, ...planState(row) })
    }),

    pub('DELETE', '/api/ai/conversations/:id', (ctx) => {
      const session = requireSession(ctx)
      const row = conversationOf(ctx, session)
      eraseConversation(ctx.app.db, ctx.app.clock, row.id)
      return empty(204)
    }),

    pub('PUT', '/api/ai/conversations/:id/plan', async (ctx) => {
      const session = requireSession(ctx)
      const row = conversationOf(ctx, session)
      const body = await ctx.json()
      const { expectedVersion, ...fields } = body
      if (typeof expectedVersion !== 'number' || expectedVersion !== row.plan_version) throw new HttpError(409, 'conflict', 'The plan changed. Reload it and try again.')
      if (row.quote_reference) throw new HttpError(409, 'conflict', 'This plan has already been sent.')
      const { changes, errors } = readPlanChanges(isRecord(fields) ? fields : {})
      if (Object.keys(errors).length > 0) throw validationFailed(errors)
      const next: ProjectPlan = { ...(readStoredPlan(row.plan_json) ?? emptyPlan()), ...changes }
      savePlan(ctx.app.db, ctx.app.clock, row.id, next, row.plan_version + 1)
      if (isReady(next)) markPlannerCompleted(ctx.app.db, ctx.app.clock, row.id)
      return json(planState(getConversation(ctx.app.db, session.id, row.id)!))
    }),

    pub('DELETE', '/api/ai/conversations/:id/plan', (ctx) => {
      const session = requireSession(ctx)
      const row = conversationOf(ctx, session)
      if (row.quote_reference) throw new HttpError(409, 'conflict', 'This plan has already been sent.')
      savePlan(ctx.app.db, ctx.app.clock, row.id, null, row.plan_version + 1)
      return json(planState(getConversation(ctx.app.db, session.id, row.id)!))
    }),

    pub(
      'POST',
      '/api/ai/conversations/:id/quote-approval',
      async (ctx) => {
        const session = requireSession(ctx)
        const row = conversationOf(ctx, session)
        const input = parseApproval(await ctx.json(), ctx.app.config.requireConsent)
        const result = approve(ctx.app, loadSettings(ctx.app), row, input)
        return json({ ...result, planHash: planHash(readStoredPlan(row.plan_json)!).slice(0, 8) })
      },
      'quote',
    ),

    // ---- the administration ----
    admin('GET', '/api/admin/ai', (ctx) => json(summaryOf(ctx.app, ctx.session))),
    admin('PUT', '/api/admin/ai/settings', async (ctx) => {
      saveSettings(ctx.app, ctx.session, await ctx.json())
      return json(summaryOf(ctx.app, ctx.session))
    }),
    // The server-side connection test: one minimal request to the required model. It records the result and never switches the assistant on.
    admin('POST', '/api/admin/ai/connection-test', async (ctx) => {
      const actor = requirePermission(ctx.session, 'system:write')
      await ctx.json().catch(() => ({}))
      const result = await ctx.app.assistant.connectionTest(actor.userId)
      return json({ result, summary: summaryOf(ctx.app, ctx.session) })
    }),
    admin('POST', '/api/admin/ai/alerts/acknowledge', async (ctx) => {
      const body = await ctx.json().catch(() => ({}))
      const id = isRecord(body) && typeof body.id === 'string' ? body.id : null
      acknowledgeAlerts(ctx.app, ctx.session, id)
      return json(summaryOf(ctx.app, ctx.session))
    }),
    admin('GET', '/api/admin/ai/usage', (ctx) => {
      requirePermission(ctx.session, 'system:read')
      return json({ ...usageOverview(ctx.app, ctx.query.get('range')), series: usageSeries(ctx.app, ctx.query.get('range')) })
    }),
    admin('POST', '/api/admin/ai/knowledge/refresh', async (ctx) => {
      requirePermission(ctx.session, 'system:write')
      await ctx.json().catch(() => ({}))
      ctx.app.assistant.knowledge.invalidate()
      return json(summaryOf(ctx.app, ctx.session))
    }),
  ]
}

export { classify }
