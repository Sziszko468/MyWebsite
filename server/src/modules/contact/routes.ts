import type { AppContext } from '../../context.ts'
import { json } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { parseContact, submitContact } from './service.ts'

/** `POST /api/contact`: the contact form's endpoint. */
export function contactRoutes(_app: AppContext): RouteDef[] {
  return [
    {
      method: 'POST',
      pattern: '/api/contact',
      area: 'api',
      limit: 'contact',
      handler: async (ctx) => {
        const input = parseContact(await ctx.json(), ctx.app.config.requireConsent)
        const result = submitContact(ctx.app, input, ctx.ipHash)
        ctx.log.info('contact received', { duplicate: result.duplicate })
        // 201 for a new message, 200 for the same message seen again: either way the visitor is told it was received.
        return json({ reference: result.reference, status: 'received', createdAt: result.createdAt }, { status: result.duplicate ? 200 : 201 })
      },
    },
  ]
}
