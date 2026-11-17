import type { AppContext } from '../../context.ts'
import { validationFailed } from '../../http/errors.ts'
import type { LimitName } from '../../http/rateLimit.ts'
import type { RouteDef } from '../../http/router.ts'
import { json } from '../../http/reply.ts'
import { Fields } from '../../lib/validate.ts'
import { clientOf } from '../customers/sessions.ts'
import { changeStatus, contexts, editOwnNote, list, markAsRead, overview, post, read, readSettings, remove, search, searchWithin, start, writeSettings } from './admin.ts'
import { askForResolution, contextOptions, markConversationRead, preferencesOf, reply, savePreferencesOf, startConversation } from './customer.ts'
import { contextFrom, exact, tokenOf } from './input.ts'
import { LIMITS } from './model.ts'
import { pageSize, searchTerm, sequenceOf } from './search.ts'
import { customerConversation, customerInbox, customerSearch, customerSummary, INBOX_FILTERS, type InboxFilter } from './views.ts'

/**
 * The addresses of the communication system (PROMPT 28). The customer's (`/api/portal/messages…`) are the portal's: same-origin only, `no-store`, behind the customer's own session
 * (the customer is whoever the cookie says; nothing in an address or a body can say otherwise) and CSRF-protected when they change anything. The administration's
 * (`/api/admin/communications…`) are behind an administrator's session, their CSRF token and a permission checked in the business function. Searching and sending have their own,
 * tighter rate limits. The fixed addresses are listed before `:reference`, so a conversation can never be called `summary`.
 */

export function communicationRoutes(_app: AppContext): RouteDef[] {
  const signedIn = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler'], limit: LimitName = 'portal'): RouteDef => ({ method, pattern, area: 'portal', limit, customerAuth: true, handler })
  const admin = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler'], limit?: LimitName): RouteDef => ({ method, pattern, area: 'admin', auth: true, limit, handler })
  const mine = '/api/portal/messages'
  const base = '/api/admin/communications'

  const page = (ctx: Parameters<RouteDef['handler']>[0]) => ({ before: sequenceOf(ctx.query.get('before')), limit: pageSize(ctx.query.get('limit')) })

  return [
    // ---- the customer ----
    signedIn('GET', `${mine}/summary`, (ctx) => json({ ...customerSummary(ctx.app, clientOf(ctx).customerId), canStart: preferencesOf(ctx.app, clientOf(ctx).customerId).customersCanStart, attachments: false })),
    signedIn('GET', `${mine}/contexts`, (ctx) => json({ items: contextOptions(ctx.app, clientOf(ctx).customerId) })),
    signedIn('GET', `${mine}/search`, (ctx) => json(customerSearch(ctx.app, clientOf(ctx).customerId, searchTerm(ctx.query.get('q')), pageSize(ctx.query.get('limit')))), 'messageSearch'),
    signedIn('GET', mine, (ctx) => {
      const filter = (ctx.query.get('filter') ?? 'all') as InboxFilter
      if (!INBOX_FILTERS.includes(filter)) throw validationFailed({ filter: 'invalid' })
      return json(customerInbox(ctx.app, clientOf(ctx).customerId, { filter, cursor: ctx.query.get('cursor'), limit: pageSize(ctx.query.get('limit')) }))
    }),
    signedIn(
      'POST',
      mine,
      async (ctx) => {
        const body = await ctx.json()
        exact(body, ['subject', 'body', 'context', 'clientToken'])
        const fields = new Fields(body)
        const subject = fields.text('subject', { max: LIMITS.subject, required: true })
        const text = fields.text('body', { max: LIMITS.message, required: true, multiline: true })
        const context = contextFrom(fields, body)
        const clientToken = tokenOf(fields)
        fields.done()
        return json(startConversation(ctx.app, clientOf(ctx).customerId, { subject: subject!, body: text!, context, clientToken }), { status: 201 })
      },
      'messageSend',
    ),
    signedIn('GET', `${mine}/:reference`, (ctx) => json(customerConversation(ctx.app, clientOf(ctx).customerId, ctx.params.reference, page(ctx)))),
    signedIn(
      'POST',
      `${mine}/:reference/messages`,
      async (ctx) => {
        const body = await ctx.json()
        exact(body, ['body', 'clientToken'])
        const fields = new Fields(body)
        const text = fields.text('body', { max: LIMITS.message, required: true, multiline: true })
        const clientToken = tokenOf(fields)
        fields.done()
        return json(reply(ctx.app, clientOf(ctx).customerId, ctx.params.reference, { body: text!, clientToken }), { status: 201 })
      },
      'messageSend',
    ),
    signedIn('POST', `${mine}/:reference/read`, async (ctx) => {
      const body = await ctx.json()
      exact(body, ['upTo'])
      const upTo = body.upTo
      if (typeof upTo !== 'number' || !Number.isInteger(upTo) || upTo < 0 || upTo > Number.MAX_SAFE_INTEGER) throw validationFailed({ upTo: 'invalid' })
      return json({ ...markConversationRead(ctx.app, clientOf(ctx).customerId, ctx.params.reference, upTo), ...customerSummary(ctx.app, clientOf(ctx).customerId) })
    }),
    signedIn('POST', `${mine}/:reference/request-resolution`, async (ctx) => {
      const body = await ctx.json().catch(() => ({}))
      if (Object.keys(body).length > 0) throw validationFailed({ body: 'invalid' })
      return json(askForResolution(ctx.app, clientOf(ctx).customerId, ctx.params.reference))
    }),
    signedIn('GET', '/api/portal/message-preferences', (ctx) => json(preferencesOf(ctx.app, clientOf(ctx).customerId))),
    signedIn('PUT', '/api/portal/message-preferences', async (ctx) => {
      const body = await ctx.json()
      exact(body, ['replies', 'announcements', 'important', 'resolution'])
      const changes: Partial<Record<'replies' | 'announcements' | 'important' | 'resolution', boolean>> = {}
      for (const [key, value] of Object.entries(body)) {
        if (typeof value !== 'boolean') throw validationFailed({ [key]: 'invalid' })
        changes[key as keyof typeof changes] = value
      }
      savePreferencesOf(ctx.app, clientOf(ctx).customerId, changes)
      return json(preferencesOf(ctx.app, clientOf(ctx).customerId))
    }),

    // ---- the administration ----
    admin('GET', `${base}/overview`, (ctx) => json(overview(ctx.app, ctx.session))),
    admin('GET', `${base}/search`, (ctx) => json(search(ctx.app, ctx.session, ctx.query)), 'messageSearch'),
    admin('GET', `${base}/contexts`, (ctx) => json(contexts(ctx.app, ctx.session, ctx.query.get('customerId')))),
    admin('GET', base, (ctx) => json(list(ctx.app, ctx.session, ctx.query))),
    admin('POST', base, async (ctx) => json(start(ctx.app, ctx.session, await ctx.json()), { status: 201 }), 'messageSend'),
    admin('GET', `${base}/:reference`, (ctx) => json(read(ctx.app, ctx.session, ctx.params.reference, ctx.query))),
    admin('GET', `${base}/:reference/search`, (ctx) => json(searchWithin(ctx.app, ctx.session, ctx.params.reference, ctx.query)), 'messageSearch'),
    admin('POST', `${base}/:reference/messages`, async (ctx) => json(post(ctx.app, ctx.session, ctx.params.reference, await ctx.json()), { status: 201 }), 'messageSend'),
    admin('PATCH', `${base}/:reference/messages/:id`, async (ctx) => json(editOwnNote(ctx.app, ctx.session, ctx.params.reference, ctx.params.id, await ctx.json()))),
    admin('DELETE', `${base}/:reference/messages/:id`, (ctx) => json(remove(ctx.app, ctx.session, ctx.params.reference, ctx.params.id))),
    admin('POST', `${base}/:reference/status`, async (ctx) => json(changeStatus(ctx.app, ctx.session, ctx.params.reference, await ctx.json()))),
    admin('POST', `${base}/:reference/read`, async (ctx) => json(markAsRead(ctx.app, ctx.session, ctx.params.reference, await ctx.json()))),
    admin('GET', '/api/admin/communication-settings', (ctx) => json(readSettings(ctx.app, ctx.session))),
    admin('PUT', '/api/admin/communication-settings', async (ctx) => json(writeSettings(ctx.app, ctx.session, await ctx.json()))),
  ]
}
