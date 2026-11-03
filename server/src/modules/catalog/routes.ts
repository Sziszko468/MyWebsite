import type { AppContext, RequestCtx } from '../../context.ts'
import { notFound } from '../../http/errors.ts'
import { empty, json, type Reply } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { sha256Hex } from '../../lib/crypto.ts'
import { catalogOut, categoriesOut, extraOut, faqOut, packageOut, parseLang, serviceOut } from './read.ts'
import { loadCatalog } from './repository.ts'

/**
 * The public, read-only catalogue (`/api/services`, `/api/packages`, `/api/shop/*`, `/api/content/faq`). It is
 * the same data the website is built from, in the database the administrator edits; it holds no customer data,
 * so it is cacheable for a minute and answers conditional requests with a 304.
 */

function cached(ctx: RequestCtx, data: unknown, meta?: Record<string, unknown>): Reply {
  const reply = json(data, { meta })
  const etag = `"${sha256Hex(String(reply.body)).slice(0, 24)}"`
  const headers = { ETag: etag, 'Cache-Control': 'public, max-age=60', Vary: 'Origin' }
  if (ctx.req.headers['if-none-match'] === etag) return empty(304, headers)
  return { ...reply, headers: { ...reply.headers, ...headers } }
}

export function catalogRoutes(_app: AppContext): RouteDef[] {
  const get = (pattern: string, handler: RouteDef['handler']): RouteDef => ({ method: 'GET', pattern, area: 'api', limit: 'catalog', handler })
  const catalog = (ctx: RequestCtx) => loadCatalog(ctx.app.db)
  const lang = (ctx: RequestCtx) => parseLang(ctx.query.get('lang'))

  const services: RouteDef['handler'] = (ctx) => {
    const l = lang(ctx)
    return cached(ctx, catalog(ctx).services.map((item) => serviceOut(item, l)))
  }
  const packages: RouteDef['handler'] = (ctx) => {
    const l = lang(ctx)
    return cached(ctx, catalog(ctx).packages.map((item) => packageOut(item, l)))
  }

  return [
    get('/api/services', services),
    get('/api/services/:slug', (ctx) => {
      const item = catalog(ctx).services.find((service) => service.slug === ctx.params.slug)
      if (!item) throw notFound('The service')
      return cached(ctx, serviceOut(item, lang(ctx)))
    }),
    get('/api/packages', packages),
    get('/api/packages/:code', (ctx) => {
      const item = catalog(ctx).packages.find((pack) => pack.code === ctx.params.code)
      if (!item) throw notFound('The package')
      return cached(ctx, packageOut(item, lang(ctx)))
    }),
    get('/api/shop/services', services),
    get('/api/shop/packages', packages),
    get('/api/shop/extras', (ctx) => {
      const l = lang(ctx)
      return cached(ctx, catalog(ctx).extras.map((item) => extraOut(item, l)))
    }),
    get('/api/shop/categories', (ctx) => cached(ctx, categoriesOut(catalog(ctx)))),
    get('/api/shop/catalog', (ctx) => cached(ctx, catalogOut(catalog(ctx)).body)),
    get('/api/content/faq', (ctx) => {
      const l = lang(ctx)
      return cached(
        ctx,
        catalog(ctx).content.filter((item) => item.type === 'faq').map((item) => faqOut(item, l)),
      )
    }),
  ]
}
