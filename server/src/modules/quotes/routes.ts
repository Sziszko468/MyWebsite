import type { AppContext } from '../../context.ts'
import { json } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { parseQuote, submitQuote } from './service.ts'

/** `POST /api/quote-requests`: the request builder's endpoint. */
export function quoteRoutes(_app: AppContext): RouteDef[] {
  return [
    {
      method: 'POST',
      pattern: '/api/quote-requests',
      area: 'api',
      limit: 'quote',
      handler: async (ctx) => {
        const input = parseQuote(await ctx.json(), ctx.app.config.requireConsent)
        const result = submitQuote(ctx.app, input, ctx.ipHash)
        ctx.log.info('quote request received', { duplicate: result.duplicate, items: input.items.length })
        return json(
          { reference: result.reference, status: 'received', createdAt: result.createdAt, pricing: result.pricing },
          { status: result.duplicate ? 200 : 201 },
        )
      },
    },
  ]
}
