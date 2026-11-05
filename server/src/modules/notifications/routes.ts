import type { AppContext } from '../../context.ts'
import { json } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { handleWebhook } from './webhook.ts'

/**
 * `POST /api/webhooks/email`: where the e-mail provider reports what happened to a message. Public by necessity (the
 * provider is not signed in), so it is answered only for a request whose signature verifies (webhook.ts); anything else
 * is a 401, and with no `EMAIL_WEBHOOK_SECRET` configured the address does not exist. It has no CORS and takes no cookie.
 */
export function emailRoutes(_app: AppContext): RouteDef[] {
  return [
    {
      method: 'POST',
      pattern: '/api/webhooks/email',
      area: 'api',
      limit: 'webhook',
      handler: async (ctx) => {
        const result = handleWebhook(ctx.app, ctx.req.headers, await ctx.raw())
        ctx.log.info('e-mail event', { duplicate: result.duplicate, outcome: result.outcome })
        // 200 for every verified event, new or repeated, so the provider stops sending it.
        return json({ received: true, duplicate: result.duplicate })
      },
    },
  ]
}
