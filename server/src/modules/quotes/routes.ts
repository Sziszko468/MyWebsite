import type { AppContext } from '../../context.ts'
import { json } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { parseFullExperienceRequest, submitFullExperience } from '../shop/fullExperience.ts'
import { act, parseDecision, viewQuotation, viewRequest } from './customer.ts'
import { parseQuote, submitQuote } from './service.ts'

/**
 * The public side of the quotation system.
 *
 *  - `POST /api/quote-requests`: the request builder's endpoint, and (with `form: 'full_experience'`) the flagship offer's configurator's.
 *  - `GET /api/customer/quotations/:token`, `GET /api/customer/requests/:token`, `POST /api/customer/actions`: the customer's own pages.
 *    A token in the address is the only thing that opens them; no route here takes a reference, an e-mail address or an identifier.
 */
export function quoteRoutes(_app: AppContext): RouteDef[] {
  return [
    {
      method: 'POST',
      pattern: '/api/quote-requests',
      area: 'api',
      limit: 'quote',
      handler: async (ctx) => {
        const body = await ctx.json()
        if (body.form === 'full_experience') {
          const input = parseFullExperienceRequest(body, ctx.app.config.requireConsent)
          const result = submitFullExperience(ctx.app, input, ctx.ipHash)
          ctx.log.info('full experience request received', { duplicate: result.duplicate, answers: Object.keys(input.answers).length })
          return json(
            { reference: result.reference, status: 'received', createdAt: result.createdAt, pricing: result.pricing, statusToken: result.statusToken, confirmationEmail: result.confirmationEmail },
            { status: result.duplicate ? 200 : 201 },
          )
        }
        const input = parseQuote(body, ctx.app.config.requireConsent)
        const result = submitQuote(ctx.app, input, ctx.ipHash)
        ctx.log.info('quote request received', { duplicate: result.duplicate, items: input.items.length })
        return json(
          { reference: result.reference, status: 'received', createdAt: result.createdAt, pricing: result.pricing, statusToken: result.statusToken, confirmationEmail: result.confirmationEmail },
          { status: result.duplicate ? 200 : 201 },
        )
      },
    },
    {
      method: 'GET',
      pattern: '/api/customer/quotations/:token',
      area: 'api',
      limit: 'customer',
      handler: (ctx) => json(viewQuotation(ctx.app, ctx.params.token, ctx.ip)),
    },
    {
      method: 'GET',
      pattern: '/api/customer/requests/:token',
      area: 'api',
      limit: 'customer',
      handler: (ctx) => json(viewRequest(ctx.app, ctx.params.token, ctx.ip)),
    },
    {
      method: 'POST',
      pattern: '/api/customer/actions',
      area: 'api',
      limit: 'customer',
      handler: async (ctx) => {
        const input = parseDecision(await ctx.json())
        const result = act(ctx.app, input, ctx.ip, ctx.ipHash)
        ctx.log.info('customer action', { outcome: result.outcome })
        return json(result)
      },
    },
  ]
}
