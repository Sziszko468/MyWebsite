import type { AppContext, RequestCtx } from '../../context.ts'
import { migrationStatus } from '../../db/migrate.ts'
import { redactedConfig } from '../../config.ts'
import { HttpError, notFound, validationFailed } from '../../http/errors.ts'
import { empty, htmlReply, json, redirect, textReply, type Reply } from '../../http/reply.ts'
import type { RouteDef } from '../../http/router.ts'
import { addMs, DAY, iso } from '../../lib/time.ts'
import { verifyPassword } from '../../lib/crypto.ts'
import { isRecord } from '../../lib/text.ts'
import { requirePermission } from '../auth/permissions.ts'
import { authenticate, clearedCookie, destroySession, destroyUserSessions, loginCsrfToken, resolveSession, sessionCookie, sessionCookieName, verifyLoginCsrf } from '../auth/sessions.ts'
import { getUser, setPassword } from '../auth/users.ts'
import * as catalog from '../catalog/admin.ts'
import type { ContentType } from '../catalog/repository.ts'
import * as inquiries from '../inquiries/admin.ts'
import { countInquiriesSince, type InquiryRow } from '../inquiries/repository.ts'
import type { DeliveryRow } from '../notifications/notifier.ts'
import * as quotes from '../quotes/admin.ts'
import { countQuotesSince, type QuoteRow } from '../quotes/repository.ts'
import { audit, recentAudit } from '../system/audit.ts'
import { runMaintenance } from '../system/maintenance.ts'
import { contentForm, extraForm, formErrors, packageForm, serviceForm } from './forms.ts'
import { ADMIN_CSS, FLASH } from './layout.ts'
import * as pages from './pages.ts'

/**
 * The administration: HTML pages at `/admin/*` for a person, and the same operations as JSON at `/api/admin/*`.
 * Both are thin: they read the request, call the business functions in modules/*\/admin.ts (which check the
 * permission and the input), and render or serialise the result. Every route except the sign-in pages and the
 * stylesheet requires a session; every state-changing request needs the session's CSRF token and a same-origin
 * request (app.ts does both before a handler runs).
 */

const flashOf = (ctx: RequestCtx): string | null => {
  const key = ctx.query.get('done')
  return key && key in FLASH ? key : null
}
const done = (path: string, key: string): Reply => redirect(`${path}?done=${key}`)
const session = (ctx: RequestCtx) => ctx.session!

/** Turns an expected failure into a page instead of the JSON envelope. */
function page(fn: (ctx: RequestCtx) => Promise<Reply> | Reply): RouteDef['handler'] {
  return async (ctx) => {
    try {
      return await fn(ctx)
    } catch (error) {
      if (error instanceof HttpError && [403, 404].includes(error.status)) return htmlReply(pages.errorPage(ctx.session, error.status, error.status === 403 ? 'Your role does not allow that.' : error.message), error.status)
      throw error
    }
  }
}

const html = (body: string, status = 200): Reply => htmlReply(body, status)

// ---- row mappers for the JSON side (no hashes, no internal ids that mean nothing outside) ---------------------------------

const inquiryOut = (row: InquiryRow) => {
  const { ip_hash: _a, content_hash: _b, ...rest } = row
  return rest
}
const quoteOut = (row: QuoteRow) => {
  const { ip_hash: _a, content_hash: _b, ...rest } = row
  return rest
}

function dashboard(app: AppContext, who: ReturnType<typeof session>): pages.DashboardData {
  const now = app.clock.now()
  const since7 = iso(addMs(now, -7 * DAY))
  const since30 = iso(addMs(now, -30 * DAY))
  const inq = inquiries.overview(app, who)
  const qts = quotes.overview(app, who)
  const recentInquiries = inquiries.listForAdmin(app, who, new URLSearchParams()).rows.slice(0, 5)
  const recentQuotes = quotes.listForAdmin(app, who, new URLSearchParams()).rows.slice(0, 5)
  const email = app.notifier.summary()
  return {
    inquiries: { ...inq, last7: countInquiriesSince(app.db, since7), last30: countInquiriesSince(app.db, since30), recent: recentInquiries },
    quotes: { ...qts, last7: countQuotesSince(app.db, since7), last30: countQuotesSince(app.db, since30), recent: recentQuotes },
    email: { enabled: email.enabled, provider: email.provider, pending: email.pending, failed: email.failed, accepted: email.accepted },
  }
}

function systemData(app: AppContext, who: ReturnType<typeof session>): pages.SystemData {
  requirePermission(who, 'system:read')
  const email = app.notifier.summary()
  return {
    config: redactedConfig(app.config),
    migrations: migrationStatus(app.db),
    stats: app.stats,
    email,
    failedDeliveries: app.db.all<DeliveryRow>("SELECT * FROM email_deliveries WHERE status = 'failed' ORDER BY updated_at DESC LIMIT 10"),
    audit: recentAudit(app, 15),
    hasDeployHook: app.config.deployHookUrl !== null,
  }
}

/** The submitted form as the page's value map (a repeated field keeps all its values). */
function valuesOf(form: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const key of new Set(form.keys())) {
    if (key === '_csrf') continue
    const all = form.getAll(key)
    out[key] = all.length > 1 || ['packages', 'needs', 'extras', 'appliesTo', 'featured', 'quoteRequired'].includes(key) ? all : all[0]
  }
  return out
}

/** Runs a form handler; on a rejected edit it shows the form again with the problems and the typed values. */
async function formAction<T>(ctx: RequestCtx, parse: (form: URLSearchParams) => Record<string, unknown>, run: (body: Record<string, unknown>) => T, success: string, rerender: (values: Record<string, string | string[]>, errors: Record<string, string>, flash: string | null) => string): Promise<Reply> {
  const form = await ctx.form()
  try {
    run(parse(form))
    return done('/admin/catalog', success)
  } catch (error) {
    if (error instanceof HttpError && error.status === 422) return html(rerender(valuesOf(form), formErrors((error.details?.fields ?? {}) as Record<string, string>), null), 422)
    if (error instanceof HttpError && error.status === 409) return html(rerender(valuesOf(form), {}, 'conflict'), 409)
    throw error
  }
}

export function adminRoutes(app: AppContext): RouteDef[] {
  const get = (pattern: string, handler: RouteDef['handler']): RouteDef => ({ method: 'GET', pattern, area: 'admin', auth: true, handler: page(handler) })
  const post = (pattern: string, handler: RouteDef['handler']): RouteDef => ({ method: 'POST', pattern, area: 'admin', auth: true, handler: page(handler) })
  const api = (method: RouteDef['method'], pattern: string, handler: RouteDef['handler']): RouteDef => ({ method, pattern, area: 'admin', auth: true, handler })

  const routes: RouteDef[] = [
    // ---- the way in (no session yet) ----
    { method: 'GET', pattern: '/admin/assets/admin.css', area: 'admin', handler: () => textReply(ADMIN_CSS, 'text/css; charset=utf-8', 200, { 'Cache-Control': 'public, max-age=3600' }) },
    {
      method: 'GET',
      pattern: '/admin/login',
      area: 'admin',
      handler: (ctx) => (resolveSession(ctx.app, ctx.cookies[sessionCookieName(ctx.app)]) ? redirect('/admin/dashboard') : html(pages.loginPage(loginCsrfToken(ctx.app), false))),
    },
    {
      method: 'POST',
      pattern: '/admin/login',
      area: 'admin',
      limit: 'login',
      handler: async (ctx) => {
        const form = await ctx.form()
        if (!verifyLoginCsrf(ctx.app, form.get('_csrf'))) return html(pages.loginPage(loginCsrfToken(ctx.app), true), 403)
        try {
          const result = await authenticate(ctx.app, form.get('email') ?? '', form.get('password') ?? '', ctx.ipHash, String(ctx.req.headers['user-agent'] ?? ''))
          return redirect('/admin/dashboard', { 'Set-Cookie': sessionCookie(ctx.app, result.token, result.maxAgeSeconds) })
        } catch (error) {
          if (error instanceof HttpError && error.status === 401) return html(pages.loginPage(loginCsrfToken(ctx.app), true), 401)
          throw error
        }
      },
    },
    {
      method: 'POST',
      pattern: '/api/admin/login',
      area: 'admin',
      limit: 'login',
      handler: async (ctx) => {
        const body = await ctx.json()
        const result = await authenticate(ctx.app, typeof body.email === 'string' ? body.email : '', typeof body.password === 'string' ? body.password : '', ctx.ipHash, String(ctx.req.headers['user-agent'] ?? ''))
        return json({ csrfToken: result.csrfToken, user: { email: result.user.email, role: result.user.role } }, { headers: { 'Set-Cookie': sessionCookie(ctx.app, result.token, result.maxAgeSeconds) } })
      },
    },

    // ---- session ----
    post('/admin/logout', (ctx) => {
      destroySession(ctx.app, session(ctx).tokenHash)
      return redirect('/admin/login', { 'Set-Cookie': clearedCookie(ctx.app) })
    }),
    api('POST', '/api/admin/logout', (ctx) => {
      destroySession(ctx.app, session(ctx).tokenHash)
      return empty(204, { 'Set-Cookie': clearedCookie(ctx.app) })
    }),
    api('GET', '/api/admin/session', (ctx) => json({ user: { email: session(ctx).email, role: session(ctx).role }, csrfToken: session(ctx).csrfToken })),

    // ---- pages ----
    get('/admin', () => redirect('/admin/dashboard')),
    get('/admin/dashboard', (ctx) => html(pages.dashboardPage(session(ctx), dashboard(ctx.app, session(ctx)), flashOf(ctx)))),
    get('/admin/account', (ctx) => html(pages.accountPage(session(ctx), null, flashOf(ctx)))),
    post('/admin/account/password', async (ctx) => {
      const form = await ctx.form()
      const who = session(ctx)
      const user = getUser(ctx.app.db, who.userId)
      if (!user || !(await verifyPassword(form.get('current') ?? '', user.password_hash))) return html(pages.accountPage(who, 'The current password is not correct.', null), 422)
      try {
        await setPassword(ctx.app.db, ctx.app.clock, who.userId, form.get('next') ?? '')
      } catch (error) {
        return html(pages.accountPage(who, error instanceof Error ? error.message : 'That password is not accepted.', null), 422)
      }
      destroyUserSessions(ctx.app, who.userId, who.tokenHash)
      audit(ctx.app, who, 'account.password', 'admin_user', who.userId)
      return done('/admin/account', 'password')
    }),

    // ---- messages ----
    get('/admin/inquiries', (ctx) => {
      const data = inquiries.listForAdmin(ctx.app, ctx.session, ctx.query)
      return html(pages.inquiriesPage(session(ctx), { rows: data.rows, total: data.total, page: data.filters.page, pageSize: data.filters.pageSize, query: ctx.query }, flashOf(ctx)))
    }),
    get('/admin/inquiries/:id', (ctx) => html(pages.inquiryPage(session(ctx), inquiries.detailForAdmin(ctx.app, ctx.session, ctx.params.id), ctx.app.notifier.enabled, flashOf(ctx)))),
    post('/admin/inquiries/:id/status', async (ctx) => {
      const form = await ctx.form()
      try {
        const result = inquiries.changeStatus(ctx.app, ctx.session, ctx.params.id, { status: form.get('status'), notify: form.has('notify'), note: form.get('note') ?? '' })
        return done(`/admin/inquiries/${ctx.params.id}`, result.notified === 'queued' ? 'status_queued' : result.notified === 'off' ? 'status_off' : 'status')
      } catch (error) {
        if (error instanceof HttpError && error.status === 422) return done(`/admin/inquiries/${ctx.params.id}`, 'invalid')
        throw error
      }
    }),
    post('/admin/inquiries/:id/notes', async (ctx) => {
      try {
        inquiries.addNote(ctx.app, ctx.session, ctx.params.id, (await ctx.form()).get('body'))
        return done(`/admin/inquiries/${ctx.params.id}`, 'noted')
      } catch (error) {
        if (error instanceof HttpError && error.status === 422) return done(`/admin/inquiries/${ctx.params.id}`, 'invalid')
        throw error
      }
    }),
    post('/admin/inquiries/:id/archive', async (ctx) => {
      const archived = (await ctx.form()).get('archived') === 'true'
      inquiries.archive(ctx.app, ctx.session, ctx.params.id, archived)
      return done(`/admin/inquiries/${ctx.params.id}`, archived ? 'archived' : 'unarchived')
    }),
    post('/admin/inquiries/:id/delete', async (ctx) => {
      if ((await ctx.form()).get('confirm') !== 'yes') return done(`/admin/inquiries/${ctx.params.id}`, 'invalid')
      inquiries.remove(ctx.app, ctx.session, ctx.params.id)
      return done('/admin/inquiries', 'deleted')
    }),

    // ---- quote requests ----
    get('/admin/quote-requests', (ctx) => {
      const data = quotes.listForAdmin(ctx.app, ctx.session, ctx.query)
      return html(pages.quotesPage(session(ctx), { rows: data.rows, total: data.total, page: data.filters.page, pageSize: data.filters.pageSize, query: ctx.query }, flashOf(ctx)))
    }),
    get('/admin/quote-requests/export.csv', (ctx) => textReply(quotes.exportCsv(ctx.app, ctx.session, ctx.query), 'text/csv; charset=utf-8', 200, { 'Content-Disposition': 'attachment; filename="quote-requests.csv"' })),
    get('/admin/quote-requests/:id', (ctx) => html(pages.quotePage(session(ctx), quotes.detailForAdmin(ctx.app, ctx.session, ctx.params.id), ctx.app.notifier.enabled, flashOf(ctx)))),
    get('/admin/quote-requests/:id/export.json', (ctx) => {
      const data = quotes.exportOne(ctx.app, ctx.session, ctx.params.id)
      return textReply(JSON.stringify(data, null, 2), 'application/json; charset=utf-8', 200, { 'Content-Disposition': `attachment; filename="${String(data.reference)}.json"` })
    }),
    post('/admin/quote-requests/:id/status', async (ctx) => {
      const form = await ctx.form()
      try {
        const result = quotes.changeStatus(ctx.app, ctx.session, ctx.params.id, { status: form.get('status'), notify: form.has('notify'), note: form.get('note') ?? '' })
        return done(`/admin/quote-requests/${ctx.params.id}`, result.notified === 'queued' ? 'status_queued' : result.notified === 'off' ? 'status_off' : 'status')
      } catch (error) {
        if (error instanceof HttpError && error.status === 422) return done(`/admin/quote-requests/${ctx.params.id}`, 'invalid')
        throw error
      }
    }),
    post('/admin/quote-requests/:id/notes', async (ctx) => {
      try {
        quotes.addNote(ctx.app, ctx.session, ctx.params.id, (await ctx.form()).get('body'))
        return done(`/admin/quote-requests/${ctx.params.id}`, 'noted')
      } catch (error) {
        if (error instanceof HttpError && error.status === 422) return done(`/admin/quote-requests/${ctx.params.id}`, 'invalid')
        throw error
      }
    }),
    post('/admin/quote-requests/:id/archive', async (ctx) => {
      const archived = (await ctx.form()).get('archived') === 'true'
      quotes.archive(ctx.app, ctx.session, ctx.params.id, archived)
      return done(`/admin/quote-requests/${ctx.params.id}`, archived ? 'archived' : 'unarchived')
    }),
    post('/admin/quote-requests/:id/delete', async (ctx) => {
      if ((await ctx.form()).get('confirm') !== 'yes') return done(`/admin/quote-requests/${ctx.params.id}`, 'invalid')
      quotes.remove(ctx.app, ctx.session, ctx.params.id)
      return done('/admin/quote-requests', 'deleted')
    }),

    // ---- catalogue (HTML) ----
    get('/admin/catalog', (ctx) => html(pages.catalogPage(session(ctx), catalog.adminCatalog(ctx.app, ctx.session), flashOf(ctx)))),

    get('/admin/services/new', (ctx) => html(pages.servicePage(session(ctx), null, catalog.adminCatalog(ctx.app, ctx.session), pages.serviceValues(null), {}, null))),
    post('/admin/services', (ctx) => formAction(ctx, serviceForm, (body) => catalog.createService(ctx.app, ctx.session, body), 'created', (v, e, f) => pages.servicePage(session(ctx), null, catalog.adminCatalog(ctx.app, ctx.session), v, e, f))),
    get('/admin/services/:slug', (ctx) => {
      const service = catalog.findService(ctx.app, ctx.params.slug)
      return html(pages.servicePage(session(ctx), service, catalog.adminCatalog(ctx.app, ctx.session), pages.serviceValues(service), {}, flashOf(ctx)))
    }),
    post('/admin/services/:slug', (ctx) => {
      const service = catalog.findService(ctx.app, ctx.params.slug)
      return formAction(ctx, serviceForm, (body) => catalog.updateService(ctx.app, ctx.session, ctx.params.slug, body), 'saved', (v, e, f) => pages.servicePage(session(ctx), service, catalog.adminCatalog(ctx.app, ctx.session), v, e, f))
    }),
    post('/admin/services/:slug/delete', (ctx) => deleting(() => catalog.deleteService(ctx.app, ctx.session, ctx.params.slug))),

    get('/admin/packages/new', (ctx) => html(pages.packagePage(session(ctx), null, catalog.adminCatalog(ctx.app, ctx.session), pages.packageValues(null), {}, null))),
    post('/admin/packages', (ctx) => formAction(ctx, packageForm, (body) => catalog.createPackage(ctx.app, ctx.session, body), 'created', (v, e, f) => pages.packagePage(session(ctx), null, catalog.adminCatalog(ctx.app, ctx.session), v, e, f))),
    get('/admin/packages/:code', (ctx) => {
      const pack = catalog.findPackage(ctx.app, ctx.params.code)
      return html(pages.packagePage(session(ctx), pack, catalog.adminCatalog(ctx.app, ctx.session), pages.packageValues(pack), {}, flashOf(ctx)))
    }),
    post('/admin/packages/:code', (ctx) => {
      const pack = catalog.findPackage(ctx.app, ctx.params.code)
      return formAction(ctx, packageForm, (body) => catalog.updatePackage(ctx.app, ctx.session, ctx.params.code, body), 'saved', (v, e, f) => pages.packagePage(session(ctx), pack, catalog.adminCatalog(ctx.app, ctx.session), v, e, f))
    }),
    post('/admin/packages/:code/delete', (ctx) => deleting(() => catalog.deletePackage(ctx.app, ctx.session, ctx.params.code))),

    get('/admin/extras/new', (ctx) => html(pages.extraPage(session(ctx), null, pages.extraValues(null), {}, null))),
    post('/admin/extras', (ctx) => formAction(ctx, extraForm, (body) => catalog.createExtra(ctx.app, ctx.session, body), 'created', (v, e, f) => pages.extraPage(session(ctx), null, v, e, f))),
    get('/admin/extras/:code', (ctx) => {
      const extra = catalog.findExtra(ctx.app, ctx.params.code)
      return html(pages.extraPage(session(ctx), extra, pages.extraValues(extra), {}, flashOf(ctx)))
    }),
    post('/admin/extras/:code', (ctx) => {
      const extra = catalog.findExtra(ctx.app, ctx.params.code)
      return formAction(ctx, extraForm, (body) => catalog.updateExtra(ctx.app, ctx.session, ctx.params.code, body), 'saved', (v, e, f) => pages.extraPage(session(ctx), extra, v, e, f))
    }),
    post('/admin/extras/:code/delete', (ctx) => deleting(() => catalog.deleteExtra(ctx.app, ctx.session, ctx.params.code))),

    get('/admin/content/:type/new', (ctx) => html(pages.contentPage(session(ctx), null, contentType(ctx.params.type), pages.contentValues(null, contentType(ctx.params.type)), {}, null))),
    post('/admin/content/:type', (ctx) => formAction(ctx, contentForm, (body) => catalog.createContent(ctx.app, ctx.session, { ...body, type: contentType(ctx.params.type) }), 'created', (v, e, f) => pages.contentPage(session(ctx), null, contentType(ctx.params.type), v, e, f))),
    get('/admin/content/:type/:slug', (ctx) => {
      const item = catalog.findContent(ctx.app, contentType(ctx.params.type), ctx.params.slug)
      return html(pages.contentPage(session(ctx), item, item.type, pages.contentValues(item, item.type), {}, flashOf(ctx)))
    }),
    post('/admin/content/:type/:slug', (ctx) => {
      const type = contentType(ctx.params.type)
      const item = catalog.findContent(ctx.app, type, ctx.params.slug)
      return formAction(ctx, contentForm, (body) => catalog.updateContent(ctx.app, ctx.session, type, ctx.params.slug, body), 'saved', (v, e, f) => pages.contentPage(session(ctx), item, type, v, e, f))
    }),
    post('/admin/content/:type/:slug/delete', (ctx) => deleting(() => catalog.deleteContent(ctx.app, ctx.session, contentType(ctx.params.type), ctx.params.slug))),

    // ---- system ----
    get('/admin/system', (ctx) => html(pages.systemPage(session(ctx), systemData(ctx.app, session(ctx)), flashOf(ctx)))),
    post('/admin/system/maintenance', (ctx) => {
      const who = requirePermission(ctx.session, 'system:write')
      const result = runMaintenance(ctx.app)
      audit(ctx.app, who, 'system.maintenance', 'system', null, { ...result })
      return done('/admin/system', 'maintenance')
    }),
    post('/admin/system/publish', async (ctx) => {
      const who = requirePermission(ctx.session, 'system:write')
      const hook = ctx.app.config.deployHookUrl
      if (!hook) return done('/admin/system', 'publish_failed')
      let ok = false
      try {
        const response = await fetch(hook, { method: 'POST', signal: AbortSignal.timeout(10_000) })
        ok = response.ok
      } catch {
        ok = false
      }
      audit(ctx.app, who, ok ? 'site.publish' : 'site.publish_failed', 'system', null)
      return done('/admin/system', ok ? 'published' : 'publish_failed')
    }),

    // ---- JSON: messages ----
    api('GET', '/api/admin/inquiries', (ctx) => {
      const data = inquiries.listForAdmin(ctx.app, ctx.session, ctx.query)
      return json(data.rows.map(inquiryOut), { meta: { page: data.filters.page, pageSize: data.filters.pageSize, total: data.total } })
    }),
    api('GET', '/api/admin/inquiries/:id', (ctx) => {
      const data = inquiries.detailForAdmin(ctx.app, ctx.session, ctx.params.id)
      return json({ ...inquiryOut(data.inquiry), notes: data.notes })
    }),
    api('PATCH', '/api/admin/inquiries/:id', async (ctx) => {
      const body = await ctx.json()
      const known = ['status', 'notify', 'note', 'archived', 'addNote']
      if (!Object.keys(body).every((key) => known.includes(key)) || Object.keys(body).length === 0) throw validationFailed({ body: 'invalid' })
      let notified = 'not_requested'
      if ('status' in body) notified = inquiries.changeStatus(ctx.app, ctx.session, ctx.params.id, { status: body.status, notify: body.notify === true, note: body.note }).notified
      if (typeof body.archived === 'boolean') inquiries.archive(ctx.app, ctx.session, ctx.params.id, body.archived)
      if ('addNote' in body) inquiries.addNote(ctx.app, ctx.session, ctx.params.id, body.addNote)
      const data = inquiries.detailForAdmin(ctx.app, ctx.session, ctx.params.id)
      return json({ ...inquiryOut(data.inquiry), notes: data.notes }, { meta: { notification: notified } })
    }),
    api('DELETE', '/api/admin/inquiries/:id', (ctx) => {
      inquiries.remove(ctx.app, ctx.session, ctx.params.id)
      return empty(204)
    }),

    // ---- JSON: quote requests ----
    api('GET', '/api/admin/quote-requests', (ctx) => {
      const data = quotes.listForAdmin(ctx.app, ctx.session, ctx.query)
      return json(data.rows.map(quoteOut), { meta: { page: data.filters.page, pageSize: data.filters.pageSize, total: data.total } })
    }),
    api('GET', '/api/admin/quote-requests/:id', (ctx) => {
      const data = quotes.detailForAdmin(ctx.app, ctx.session, ctx.params.id)
      return json({ ...quoteOut(data.quote), items: data.items, notes: data.notes, pricing: data.pricing })
    }),
    api('GET', '/api/admin/quote-requests/:id/export', (ctx) => json(quotes.exportOne(ctx.app, ctx.session, ctx.params.id))),
    api('PATCH', '/api/admin/quote-requests/:id', async (ctx) => {
      const body = await ctx.json()
      const known = ['status', 'notify', 'note', 'archived', 'addNote']
      if (!Object.keys(body).every((key) => known.includes(key)) || Object.keys(body).length === 0) throw validationFailed({ body: 'invalid' })
      let notified = 'not_requested'
      if ('status' in body) notified = quotes.changeStatus(ctx.app, ctx.session, ctx.params.id, { status: body.status, notify: body.notify === true, note: body.note }).notified
      if (typeof body.archived === 'boolean') quotes.archive(ctx.app, ctx.session, ctx.params.id, body.archived)
      if ('addNote' in body) quotes.addNote(ctx.app, ctx.session, ctx.params.id, body.addNote)
      const data = quotes.detailForAdmin(ctx.app, ctx.session, ctx.params.id)
      return json({ ...quoteOut(data.quote), items: data.items, notes: data.notes, pricing: data.pricing }, { meta: { notification: notified } })
    }),
    api('DELETE', '/api/admin/quote-requests/:id', (ctx) => {
      quotes.remove(ctx.app, ctx.session, ctx.params.id)
      return empty(204)
    }),

    // ---- JSON: catalogue and content ----
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
    api('GET', '/api/admin/system', (ctx) => {
      const data = systemData(ctx.app, session(ctx))
      return json({ config: data.config, migrations: data.migrations, stats: data.stats, email: data.email })
    }),
  ]
  void app
  void isRecord
  return routes
}

function contentType(value: string): ContentType {
  if (value === 'faq' || value === 'text' || value === 'project') return value
  throw notFound('The content type')
}

/** A deletion from a form: a row that is in use is a message, not an error page. */
function deleting(work: () => void): Reply {
  try {
    work()
    return done('/admin/catalog', 'deleted')
  } catch (error) {
    if (error instanceof HttpError && error.status === 409) return done('/admin/catalog', 'conflict')
    throw error
  }
}
