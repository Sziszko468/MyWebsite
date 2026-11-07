import type { AppContext } from '../../context.ts'
import { json } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { parseFullExperienceRequest, submitFullExperience } from '../shop/fullExperience.ts'
import { parseQuote, submitQuote } from './service.ts'

/** `POST /api/quote-requests`: the request builder's endpoint, and (with `form: 'full_experience'`) the flagship offer's configurator's. */
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
          return json({ reference: result.reference, status: 'received', createdAt: result.createdAt, pricing: result.pricing }, { status: result.duplicate ? 200 : 201 })
        }
        const input = parseQuote(body, ctx.app.config.requireConsent)
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
