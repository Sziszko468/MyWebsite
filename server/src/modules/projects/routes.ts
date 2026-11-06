import type { AppContext, RequestCtx } from '../../context.ts'
import { HttpError, notFound, validationFailed } from '../../http/errors.ts'
import { empty, json, type Reply } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { sha256Hex } from '../../lib/crypto.ts'
import { isRecord } from '../../lib/text.ts'
import { deleteMedia, listMedia, mediaOut, saveUpload, serveMedia } from '../media/service.ts'
import { adminTexts, publicTexts, saveText } from '../texts/service.ts'
import * as projects from './service.ts'

/**
 * The portfolio's routes. Public (`/api/projects`, `/api/texts`, `/media/<file>`): published projects only, answered with an ETag
 * and a short cache (30 s), so a published change is visible to a visitor within about half a minute, and a
 * conditional request costs almost nothing. Administration (`/api/admin/projects`, `/api/admin/media`, `/api/admin/texts`): every
 * route needs a session, every write the CSRF token and a same-origin request (app.ts does both before a handler runs), and
 * each operation checks its own permission.
 */

function cached(ctx: RequestCtx, data: unknown, meta?: Record<string, unknown>): Reply {
  const reply = json(data, { meta })
  const etag = `"${sha256Hex(String(reply.body)).slice(0, 24)}"`
  const headers = { ETag: etag, 'Cache-Control': 'public, max-age=30, stale-while-revalidate=120', Vary: 'Origin' }
  if (ctx.req.headers['if-none-match'] === etag) return empty(304, headers)
  return { ...reply, headers: { ...reply.headers, ...headers } }
}

const ID = /^\d{1,9}$/

export function projectRoutes(_app: AppContext): RouteDef[] {
  const pub = (pattern: string, handler: RouteDef['handler']): RouteDef => ({ method: 'GET', pattern, area: 'api', limit: 'catalog', handler })
  const api = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler']): RouteDef => ({ method, pattern, area: 'admin', auth: true, handler })
  const numeric = (ctx: RequestCtx): number => {
    if (!ID.test(ctx.params.id)) throw notFound('The project')
    return Number(ctx.params.id)
  }

  return [
    // ---- public ----
    pub('/api/projects', (ctx) => {
      const { projects: list, categories } = projects.publicList(ctx.app)
      return cached(ctx, list, { categories })
    }),
    pub('/api/projects/:slug', (ctx) => {
      const { project, neighbours } = projects.publicOne(ctx.app, ctx.params.slug)
      return cached(ctx, project, { neighbours })
    }),
    pub('/api/texts', (ctx) => cached(ctx, publicTexts(ctx.app))),
    // An uploaded picture. Not under /api, so the website can use it as an image address; the file's name is its hash.
    { method: 'GET', pattern: '/media/:file', area: 'static', limit: 'catalog', handler: (ctx) => serveMedia(ctx.app, ctx.params.file) },

    // ---- projects ----
    api('GET', '/api/admin/projects', (ctx) => json(projects.adminList(ctx.app, ctx.session))),
    api('POST', '/api/admin/projects', async (ctx) => json(projects.create(ctx.app, ctx.session, await ctx.json()), { status: 201 })),
    api('GET', '/api/admin/project-settings', (ctx) => json(projects.projectSettings(ctx.app, ctx.session))),
    api('PUT', '/api/admin/project-settings', async (ctx) => json(projects.saveProjectSettings(ctx.app, ctx.session, await ctx.json()))),
    api('PUT', '/api/admin/project-order', async (ctx) => {
      projects.reorder(ctx.app, ctx.session, (await ctx.json()).ids)
      return empty(204)
    }),
    api('GET', '/api/admin/project-preview', (ctx) => json(projects.previewList(ctx.app, ctx.session))),
    api('GET', '/api/admin/projects/:id', (ctx) => json(projects.adminGet(ctx.app, ctx.session, numeric(ctx)))),
    api('PUT', '/api/admin/projects/:id', async (ctx) => json(projects.update(ctx.app, ctx.session, numeric(ctx), await ctx.json()))),
    api('PATCH', '/api/admin/projects/:id', async (ctx) => {
      const body = await ctx.json()
      if (!isRecord(body) || !('featured' in body) || Object.keys(body).length !== 1) throw validationFailed({ body: 'invalid' })
      return json(projects.setFeatured(ctx.app, ctx.session, numeric(ctx), body.featured))
    }),
    api('DELETE', '/api/admin/projects/:id', (ctx) => {
      projects.remove(ctx.app, ctx.session, numeric(ctx))
      return empty(204)
    }),
    api('GET', '/api/admin/projects/:id/preview', (ctx) => json(projects.previewOne(ctx.app, ctx.session, numeric(ctx)))),
    api('POST', '/api/admin/projects/:id/duplicate', async (ctx) => {
      await ctx.json()
      return json(projects.duplicate(ctx.app, ctx.session, numeric(ctx)), { status: 201 })
    }),
    ...(['publish', 'unpublish', 'archive', 'restore'] as const).map((action) =>
      api('POST', `/api/admin/projects/:id/${action}`, async (ctx) => {
        await ctx.json()
        return json(projects.transition(ctx.app, ctx.session, numeric(ctx), action))
      }),
    ),

    // ---- pictures ----
    api('GET', '/api/admin/media', (ctx) => json(listMedia(ctx.app, ctx.session, projects.mediaUsage(ctx.app)))),
    {
      method: 'POST',
      pattern: '/api/admin/media',
      area: 'admin',
      auth: true,
      handler: async (ctx) => {
        const type = String(ctx.req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase()
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(type)) throw new HttpError(415, 'unsupported_media_type', 'Send the image itself as image/png, image/jpeg, image/webp or image/gif.')
        const body = await ctx.body(ctx.app.config.mediaMaxBytes)
        const row = saveUpload(ctx.app, ctx.session, body, ctx.query.get('name'))
        // The file's own bytes decide what it is; a claim that does not match them is refused.
        if (row.mime !== type) throw validationFailed({ file: 'invalid' }, 'The file is not the kind of image its type says.')
        return json(mediaOut(row), { status: 201 })
      },
    },
    api('DELETE', '/api/admin/media/:id', (ctx) => {
      if (!ID.test(ctx.params.id)) throw notFound('The image')
      deleteMedia(ctx.app, ctx.session, Number(ctx.params.id), projects.mediaUsage(ctx.app))
      return empty(204)
    }),

    // ---- wording ----
    api('GET', '/api/admin/texts', (ctx) => json(adminTexts(ctx.app, ctx.session))),
    api('PUT', '/api/admin/texts/:key', async (ctx) => json(saveText(ctx.app, ctx.session, ctx.params.key, await ctx.json()))),
  ]
}
