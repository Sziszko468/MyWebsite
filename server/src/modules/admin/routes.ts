import type { AppContext, RequestCtx } from '../../context.ts'
import { LANGUAGES, redactedConfig } from '../../config.ts'
import { migrationStatus } from '../../db/migrate.ts'
import { HttpError, notFound, validationFailed } from '../../http/errors.ts'
import { empty, json, textReply } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { permissionsOf, requirePermission } from '../auth/permissions.ts'
import { changePassword, listSessions, profile, revokeOtherSessions, revokeSession, savePreferences as saveAccountPreferences, UI_LANGUAGES } from '../auth/account.ts'
import { authenticate, clearedCookie, destroySession, sessionCookie } from '../auth/sessions.ts'
import * as catalog from '../catalog/admin.ts'
import type { ContentType } from '../catalog/repository.ts'
import * as translations from '../catalog/translations.ts'
import * as inquiries from '../inquiries/admin.ts'
import { INQUIRY_KINDS, INQUIRY_STATUSES, LIST_SORTS, type InquiryRow } from '../inquiries/repository.ts'
import * as notifications from '../notifications/admin.ts'
import type { DeliveryRow } from '../notifications/notifier.ts'
import * as quotes from '../quotes/admin.ts'
import { QUOTE_STATUSES, type QuoteRow } from '../quotes/repository.ts'
import { audit, recentAudit } from '../system/audit.ts'
import { runMaintenance } from '../system/maintenance.ts'
import { dashboard } from './dashboard.ts'

/**
 * The administration's API, `/api/admin/*`. The administration itself is a separate application (src/admin/, built into
 * the website's files and served by this server at `/admin`) that does nothing but call these routes, so every rule
 * lives here: each route is thin (read the request, call the business function in modules/*\/admin.ts, which checks
 * the permission and the input, and serialise the result). Every route except the sign-in requires a session; every
 * state-changing request needs the session's CSRF token in `X-CSRF-Token` and a same-origin request (app.ts does both
 * before a handler runs). Nothing here is public: no route answers without a session, and none sends CORS headers.
 */

const session = (ctx: RequestCtx) => ctx.session!

const inquiryOut = (row: InquiryRow) => {
  const { ip_hash: _a, content_hash: _b, ...rest } = row
  return rest
}
const quoteOut = (row: QuoteRow) => {
  const { ip_hash: _a, content_hash: _b, ...rest } = row
  return rest
}

function systemData(app: AppContext, who: ReturnType<typeof session>) {
  requirePermission(who, 'system:read')
  return {
    config: redactedConfig(app.config),
    migrations: migrationStatus(app.db),
    stats: app.stats,
    email: app.notifier.summary(),
    failedDeliveries: app.db.all<DeliveryRow>("SELECT * FROM email_deliveries WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 10").map((row) => ({ id: row.id, kind: row.kind, status: row.status, attempts: row.attempts, lastError: row.last_error, updatedAt: row.updated_at })),
    audit: recentAudit(app, 15),
    hasDeployHook: app.config.deployHookUrl !== null,
  }
}

/** The session, as the application needs it at start-up: who, what they may do, their preferences, and the vocabularies the screens offer. */
function sessionOut(app: AppContext, who: ReturnType<typeof session>) {
  const me = profile(app, who)
  return {
    user: { email: me.email, role: me.role, permissions: permissionsOf(me.role), preferences: me.preferences },
    csrfToken: who.csrfToken,
    meta: {
      statuses: { inquiry: INQUIRY_STATUSES, quote: QUOTE_STATUSES },
      kinds: INQUIRY_KINDS,
      sorts: LIST_SORTS,
      languages: LANGUAGES,
      interfaceLanguages: UI_LANGUAGES,
      translationGroups: translations.TRANSLATION_GROUPS,
      idleMinutes: app.config.adminIdleMinutes,
      sessionHours: app.config.adminSessionHours,
      emailEnabled: app.notifier.enabled,
    },
  }
}

function contentType(value: string): ContentType {
  if (value === 'faq' || value === 'text' || value === 'project') return value
  throw notFound('The content type')
}

const PATCH_KEYS = ['status', 'notify', 'note', 'archived', 'addNote']

export function adminRoutes(_app: AppContext): RouteDef[] {
  const api = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler'], limit?: RouteDef['limit']): RouteDef => ({ method, pattern, area: 'admin', auth: true, handler, ...(limit ? { limit } : {}) })

  return [
    // ---- the way in (no session yet) ----
    {
      method: 'POST',
      pattern: '/api/admin/login',
      area: 'admin',
      limit: 'login',
      handler: async (ctx) => {
        const body = await ctx.json()
        const result = await authenticate(ctx.app, typeof body.email === 'string' ? body.email : '', typeof body.password === 'string' ? body.password : '', ctx.ipHash, String(ctx.req.headers['user-agent'] ?? ''))
        const user = { email: result.user.email, role: result.user.role, permissions: permissionsOf(result.user.role), preferences: { language: result.user.ui_language, theme: result.user.ui_theme } }
        return json({ csrfToken: result.csrfToken, user }, { headers: { 'Set-Cookie': sessionCookie(ctx.app, result.token, result.maxAgeSeconds) } })
      },
    },

    // ---- session ----
    api('POST', '/api/admin/logout', (ctx) => {
      destroySession(ctx.app, session(ctx).tokenHash)
      return empty(204, { 'Set-Cookie': clearedCookie(ctx.app) })
    }),
    api('GET', '/api/admin/session', (ctx) => json(sessionOut(ctx.app, session(ctx)))),

    // ---- overview ----
    api('GET', '/api/admin/dashboard', (ctx) => json(dashboard(ctx.app, ctx.session))),

    // ---- messages ----
    api('GET', '/api/admin/inquiries', (ctx) => {
      const data = inquiries.listForAdmin(ctx.app, ctx.session, ctx.query)
      return json(data.rows.map(inquiryOut), { meta: { page: data.filters.page, pageSize: data.filters.pageSize, total: data.total } })
    }),
    api('GET', '/api/admin/inquiries/:id', (ctx) => {
      const data = inquiries.detailForAdmin(ctx.app, ctx.session, ctx.params.id)
      return json({ ...inquiryOut(data.inquiry), notes: data.notes, quotes: data.quotes, activity: data.activity })
    }),
    api('PATCH', '/api/admin/inquiries/:id', async (ctx) => {
      const body = await ctx.json()
      if (!Object.keys(body).every((key) => PATCH_KEYS.includes(key)) || Object.keys(body).length === 0) throw validationFailed({ body: 'invalid' })
      let notified = 'not_requested'
      if ('status' in body) notified = inquiries.changeStatus(ctx.app, ctx.session, ctx.params.id, { status: body.status, notify: body.notify === true, note: body.note }).notified
      if (typeof body.archived === 'boolean') inquiries.archive(ctx.app, ctx.session, ctx.params.id, body.archived)
      if ('addNote' in body) inquiries.addNote(ctx.app, ctx.session, ctx.params.id, body.addNote)
      const data = inquiries.detailForAdmin(ctx.app, ctx.session, ctx.params.id)
      return json({ ...inquiryOut(data.inquiry), notes: data.notes, quotes: data.quotes, activity: data.activity }, { meta: { notification: notified } })
    }),
    api('DELETE', '/api/admin/inquiries/:id', (ctx) => {
      inquiries.remove(ctx.app, ctx.session, ctx.params.id)
      return empty(204)
    }),

    // ---- quote requests ----
    api('GET', '/api/admin/quote-requests', (ctx) => {
      const data = quotes.listForAdmin(ctx.app, ctx.session, ctx.query)
      return json(data.rows.map((row) => ({ ...quoteOut(row), items: data.itemsOf[row.id] ?? [] })), { meta: { page: data.filters.page, pageSize: data.filters.pageSize, total: data.total } })
    }),
    api('GET', '/api/admin/quote-requests/export.csv', (ctx) => textReply(quotes.exportCsv(ctx.app, ctx.session, ctx.query), 'text/csv; charset=utf-8', 200, { 'Content-Disposition': 'attachment; filename="quote-requests.csv"' })),
    api('GET', '/api/admin/quote-requests/:id', (ctx) => {
      const data = quotes.detailForAdmin(ctx.app, ctx.session, ctx.params.id)
      return json({ ...quoteOut(data.quote), items: data.items, notes: data.notes, pricing: data.pricing, inquiry: data.inquiry, candidates: data.candidates, activity: data.activity })
    }),
    api('GET', '/api/admin/quote-requests/:id/export', (ctx) => json(quotes.exportOne(ctx.app, ctx.session, ctx.params.id))),
    api('GET', '/api/admin/quote-requests/:id/export.json', (ctx) => {
      const data = quotes.exportOne(ctx.app, ctx.session, ctx.params.id)
      return textReply(JSON.stringify(data, null, 2), 'application/json; charset=utf-8', 200, { 'Content-Disposition': `attachment; filename="${String(data.reference)}.json"` })
    }),
    api('PATCH', '/api/admin/quote-requests/:id', async (ctx) => {
      const body = await ctx.json()
      if (!Object.keys(body).every((key) => [...PATCH_KEYS, 'inquiryId'].includes(key)) || Object.keys(body).length === 0) throw validationFailed({ body: 'invalid' })
      let notified = 'not_requested'
      if ('status' in body) notified = quotes.changeStatus(ctx.app, ctx.session, ctx.params.id, { status: body.status, notify: body.notify === true, note: body.note }).notified
      if ('inquiryId' in body) quotes.linkInquiry(ctx.app, ctx.session, ctx.params.id, body.inquiryId)
      if (typeof body.archived === 'boolean') quotes.archive(ctx.app, ctx.session, ctx.params.id, body.archived)
      if ('addNote' in body) quotes.addNote(ctx.app, ctx.session, ctx.params.id, body.addNote)
      const data = quotes.detailForAdmin(ctx.app, ctx.session, ctx.params.id)
      return json({ ...quoteOut(data.quote), items: data.items, notes: data.notes, pricing: data.pricing, inquiry: data.inquiry, candidates: data.candidates, activity: data.activity }, { meta: { notification: notified } })
    }),
    api('DELETE', '/api/admin/quote-requests/:id', (ctx) => {
      quotes.remove(ctx.app, ctx.session, ctx.params.id)
      return empty(204)
    }),

    // ---- catalogue and content ----
    api('GET', '/api/admin/services', (ctx) => json(catalog.adminCatalog(ctx.app, ctx.session).services)),
    api('POST', '/api/admin/services', async (ctx) => json(catalog.createService(ctx.app, ctx.session, await ctx.json()), { status: 201 })),
    api('GET', '/api/admin/services/:slug', (ctx) => json(catalog.findService(ctx.app, ctx.params.slug))),
    api('PUT', '/api/admin/services/:slug', async (ctx) => json(catalog.updateService(ctx.app, ctx.session, ctx.params.slug, await ctx.json()))),
    api('DELETE', '/api/admin/services/:slug', (ctx) => {
      catalog.deleteService(ctx.app, ctx.session, ctx.params.slug)
      return empty(204)
    }),
    api('GET', '/api/admin/packages', (ctx) => json(catalog.adminCatalog(ctx.app, ctx.session).packages)),
    api('POST', '/api/admin/packages', async (ctx) => json(catalog.createPackage(ctx.app, ctx.session, await ctx.json()), { status: 201 })),
    api('GET', '/api/admin/packages/:code', (ctx) => json(catalog.findPackage(ctx.app, ctx.params.code))),
    api('PUT', '/api/admin/packages/:code', async (ctx) => json(catalog.updatePackage(ctx.app, ctx.session, ctx.params.code, await ctx.json()))),
    api('DELETE', '/api/admin/packages/:code', (ctx) => {
      catalog.deletePackage(ctx.app, ctx.session, ctx.params.code)
      return empty(204)
    }),
    api('GET', '/api/admin/extras', (ctx) => json(catalog.adminCatalog(ctx.app, ctx.session).extras)),
    api('POST', '/api/admin/extras', async (ctx) => json(catalog.createExtra(ctx.app, ctx.session, await ctx.json()), { status: 201 })),
    api('GET', '/api/admin/extras/:code', (ctx) => json(catalog.findExtra(ctx.app, ctx.params.code))),
    api('PUT', '/api/admin/extras/:code', async (ctx) => json(catalog.updateExtra(ctx.app, ctx.session, ctx.params.code, await ctx.json()))),
    api('DELETE', '/api/admin/extras/:code', (ctx) => {
      catalog.deleteExtra(ctx.app, ctx.session, ctx.params.code)
      return empty(204)
    }),
    api('GET', '/api/admin/content', (ctx) => {
      const type = ctx.query.get('type')
      return json(catalog.adminCatalog(ctx.app, ctx.session).content.filter((item) => !type || item.type === type))
    }),
    api('POST', '/api/admin/content', async (ctx) => json(catalog.createContent(ctx.app, ctx.session, await ctx.json()), { status: 201 })),
    api('GET', '/api/admin/content/:type/:slug', (ctx) => json(catalog.findContent(ctx.app, contentType(ctx.params.type), ctx.params.slug))),
    api('PUT', '/api/admin/content/:type/:slug', async (ctx) => json(catalog.updateContent(ctx.app, ctx.session, contentType(ctx.params.type), ctx.params.slug, await ctx.json()))),
    api('DELETE', '/api/admin/content/:type/:slug', (ctx) => {
      catalog.deleteContent(ctx.app, ctx.session, contentType(ctx.params.type), ctx.params.slug)
      return empty(204)
    }),
    api('PUT', '/api/admin/order/:kind', async (ctx) => {
      const kind = ctx.params.kind
      if (!(catalog.ORDERABLE as readonly string[]).includes(kind)) throw notFound('The list')
      catalog.reorder(ctx.app, ctx.session, kind as catalog.Orderable, (await ctx.json()).keys)
      return empty(204)
    }),

    // ---- translations ----
    api('GET', '/api/admin/translations', (ctx) => json(translations.overview(ctx.app, ctx.session, ctx.query))),
    api('PUT', '/api/admin/translations/:group/:key/:lang', async (ctx) => {
      if (!(translations.TRANSLATION_GROUPS as readonly string[]).includes(ctx.params.group)) throw notFound('The group')
      return json(translations.save(ctx.app, ctx.session, ctx.params.group as translations.TranslationGroup, ctx.params.key, ctx.params.lang, await ctx.json()))
    }),

    // ---- notifications ----
    api('GET', '/api/admin/notifications', (ctx) => json(notifications.overview(ctx.app, ctx.session))),
    api('PUT', '/api/admin/notifications/preferences', async (ctx) => json(notifications.savePreferences(ctx.app, ctx.session, await ctx.json()))),
    api('POST', '/api/admin/notifications/deliveries/:id/retry', async (ctx) => {
      await ctx.json()
      notifications.retry(ctx.app, ctx.session, ctx.params.id)
      return json({ queued: true })
    }),

    // ---- settings and the administrator's own account ----
    api('GET', '/api/admin/settings', (ctx) => json({ profile: profile(ctx.app, ctx.session) })),
    api('PUT', '/api/admin/settings/preferences', async (ctx) => json(saveAccountPreferences(ctx.app, ctx.session, await ctx.json()))),
    api(
      'POST',
      '/api/admin/account/password',
      async (ctx) => json(await changePassword(ctx.app, ctx.session, await ctx.json())),
      // Guessing the current password is what an attacker with a stolen session would try: the sign-in limit applies here too.
      'login',
    ),
    api('GET', '/api/admin/sessions', (ctx) => json(listSessions(ctx.app, ctx.session))),
    api('POST', '/api/admin/sessions/revoke-others', async (ctx) => {
      await ctx.json()
      return json({ closed: revokeOtherSessions(ctx.app, ctx.session) })
    }),
    api('DELETE', '/api/admin/sessions/:id', (ctx) => {
      const { current } = revokeSession(ctx.app, ctx.session, ctx.params.id)
      return empty(204, current ? { 'Set-Cookie': clearedCookie(ctx.app) } : {})
    }),

    // ---- system (administrators only) ----
    api('GET', '/api/admin/system', (ctx) => json(systemData(ctx.app, session(ctx)))),
    api('POST', '/api/admin/system/maintenance', async (ctx) => {
      await ctx.json()
      const who = requirePermission(ctx.session, 'system:write')
      const result = runMaintenance(ctx.app)
      audit(ctx.app, who, 'system.maintenance', 'system', null, { ...result })
      return json(result)
    }),
    api('POST', '/api/admin/system/publish', async (ctx) => {
      await ctx.json()
      const who = requirePermission(ctx.session, 'system:write')
      const hook = ctx.app.config.deployHookUrl
      if (!hook) throw new HttpError(409, 'conflict', 'No publish hook is configured (DEPLOY_HOOK_URL).')
      let ok = false
      try {
        ok = (await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(10_000) })).ok
      } catch {
        ok = false
      }
      audit(ctx.app, who, ok ? 'site.publish' : 'site.publish_failed', 'system', null)
      if (!ok) throw new HttpError(502, 'bad_gateway', 'The publish hook did not accept the request.')
      return json({ published: true })
    }),
  ]
}
