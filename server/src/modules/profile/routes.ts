import type { AppContext } from '../../context.ts'
import { empty, json } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { sha256Hex } from '../../lib/crypto.ts'
import { adminProfile, publicProfile, resetProfile, saveProfile } from './service.ts'

/** The profile's routes: public `GET /api/profile` (the saved document, cached 30 s like the projects) and the administration's read, save and reset. */
export function profileRoutes(_app: AppContext): RouteDef[] {
  const api = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler']): RouteDef => ({ method, pattern, area: 'admin', auth: true, handler })
  return [
    {
      method: 'GET',
      pattern: '/api/profile',
      area: 'api',
      limit: 'catalog',
      handler: (ctx) => {
        const reply = json(publicProfile(ctx.app))
        const etag = `"${sha256Hex(String(reply.body)).slice(0, 24)}"`
        const headers = { ETag: etag, 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120', Vary: 'Origin' }
        if (ctx.req.headers['if-none-match'] === etag) return empty(304, headers)
        return { ...reply, headers: { ...reply.headers, ...headers } }
      },
    },
    api('GET', '/api/admin/profile', (ctx) => json(adminProfile(ctx.app, ctx.session))),
    api('PUT', '/api/admin/profile', async (ctx) => json(saveProfile(ctx.app, ctx.session, await ctx.json()))),
    api('DELETE', '/api/admin/profile', (ctx) => json(resetProfile(ctx.app, ctx.session))),
  ]
}
