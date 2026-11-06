import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { Config } from './config.ts'
import type { AppContext, Handler, RequestCtx, Stats } from './context.ts'
import type { Database } from './db/database.ts'
import { DatabaseUnavailableError, ConstraintError, HttpError, csrfFailed, notFound, unauthorized } from './http/errors.ts'
import { Limiters } from './http/rateLimit.ts'
import { clientIp, parseCookies, readBody, readForm, readJson } from './http/request.ts'
import { empty, errorReply, type Reply } from './http/reply.ts'
import { Router, type RouteDef } from './http/router.ts'
import { corsHeaders, PREFLIGHT_HEADERS, securityHeaders } from './http/security.ts'
import { hmacHex } from './lib/crypto.ts'
import { redactText, registerSecret, type Logger } from './lib/logger.ts'
import type { Clock } from './lib/time.ts'
import { adminRoutes } from './modules/admin/routes.ts'
import { originIsThisHost, resolveSession, sameOrigin, sessionCookieName, verifySessionCsrf } from './modules/auth/sessions.ts'
import { catalogRoutes } from './modules/catalog/routes.ts'
import { contactRoutes } from './modules/contact/routes.ts'
import { EmailChecks, type DnsResolver } from './modules/notifications/checks.ts'
import { Notifier } from './modules/notifications/notifier.ts'
import { emailRoutes } from './modules/notifications/routes.ts'
import type { Mailer } from './modules/notifications/mailer.ts'
import type { FetchLike } from './modules/notifications/resend.ts'
import { projectRoutes } from './modules/projects/routes.ts'
import { quoteRoutes } from './modules/quotes/routes.ts'
import { healthRoutes } from './modules/system/health.ts'
import { serveAdminApp, serveStatic } from './modules/system/static.ts'

/** Whether a project with this address is published (drafts are not acknowledged). */
function projectIsPublished(app: AppContext, slug: string): boolean {
  return app.db.get("SELECT 1 AS x FROM projects WHERE slug = ? AND status = 'published'", [slug]) !== undefined
}

/**
 * The composition root: it builds the context (database, clock, limiters, notifier), registers every module's
 * routes and turns a Node request into a `Reply`. This is the only place that knows the order of a request's life:
 * address and id, global limit, CORS, route match, route limit, session and CSRF for the admin, handler, error
 * to envelope, headers, log. `createApp` is what the tests build with an in-memory database; `main.ts` builds
 * the real one.
 */

export interface AppDeps {
  config: Config
  db: Database
  clock: Clock
  log: Logger
  mailer: Mailer | null
  /** For the e-mail checks: the way they reach a provider's and Cloudflare's APIs and the public DNS (tests pass fakes; the defaults are the real ones). */
  fetch?: FetchLike
  dns?: DnsResolver
}

export interface App {
  context: AppContext
  server: Server
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>
  /** Starts background work (the outbox timer). */
  start(): void
  close(): Promise<void>
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/

export function createApp(deps: AppDeps): App {
  const { config, db, clock, log } = deps
  // Whatever a provider's error text or a library's exception quotes of these is masked in every log line and every stored reason.
  for (const secret of [config.email.apiKey, config.email.webhookSecret, config.email.smtp?.password, config.email.cloudflare?.apiToken]) registerSecret(secret)
  const stats: Stats = { startedAt: Date.now(), requests: 0, clientErrors: 0, serverErrors: 0, rateLimited: 0 }
  const limiters = new Limiters(clock, config.rateLimitsEnabled)
  const notifier = new Notifier({ db, config, clock, log, mailer: deps.mailer })
  const emailChecks = new EmailChecks({ config, db, clock, log, fetch: deps.fetch, dns: deps.dns })
  const context: AppContext = { config, db, clock, log, limiters, notifier, emailChecks, stats }

  const router = new Router()
  router.add(...healthRoutes(context), ...contactRoutes(context), ...quoteRoutes(context), ...catalogRoutes(context), ...projectRoutes(context), ...emailRoutes(context), ...adminRoutes(context))

  const sweeper = setInterval(() => limiters.sweep(), 60_000)
  sweeper.unref()

  function toReply(error: unknown, requestId: string, requestLog: Logger): Reply {
    if (error instanceof HttpError) return errorReply(error, requestId)
    if (error instanceof DatabaseUnavailableError) {
      requestLog.error('database unavailable', { error })
      return errorReply(new HttpError(503, 'service_unavailable', 'The service is temporarily unavailable.', { headers: { 'Retry-After': '30' } }), requestId)
    }
    requestLog.error('unhandled error', { error: error instanceof Error ? { name: error.name, message: redactText(error.message) } : 'unknown', constraint: error instanceof ConstraintError ? error.kind : undefined })
    return errorReply(new HttpError(500, 'internal_error', 'Something went wrong on our side.'), requestId)
  }

  async function dispatch(ctx: RequestCtx, def: RouteDef): Promise<Reply> {
    const { app } = ctx
    if (def.limit) app.limiters.check(def.limit, ctx.ip)

    if (def.area === 'api') {
      const unsafe = !SAFE.has(ctx.method)
      // A browser on another site cannot read an answer without CORS, but it could still send a request: refuse it.
      // A page of this very server (the website served from the same process) is not another site.
      if (unsafe && ctx.origin && !app.config.corsOrigins.includes(ctx.origin) && !originIsThisHost(ctx, ctx.origin) && !def.auth) throw new HttpError(403, 'origin_not_allowed', 'This origin is not allowed to use the API.')
    }
    if (def.area === 'admin' && !SAFE.has(ctx.method) && !sameOrigin(ctx)) throw new HttpError(403, 'origin_not_allowed', 'Requests must come from the admin pages.')

    if (def.auth) {
      app.limiters.check('admin', ctx.ip)
      ctx.session = resolveSession(app, ctx.cookies[sessionCookieName(app)])
      if (!ctx.session) throw unauthorized()
      if (!SAFE.has(ctx.method)) {
        const header = ctx.req.headers['x-csrf-token']
        const token = typeof header === 'string' ? header : String((await ctx.form().catch(() => new URLSearchParams())).get('_csrf') ?? '')
        if (!verifySessionCsrf(ctx.session, token || null)) throw csrfFailed()
      }
    }
    const handler: Handler = def.handler
    return handler(ctx)
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const started = performance.now()
    stats.requests += 1
    const inbound = req.headers['x-request-id']
    const requestId = typeof inbound === 'string' && REQUEST_ID.test(inbound) ? inbound : randomUUID()
    const ip = clientIp(req, config.trustProxy)
    const requestLog = log.child({ requestId })
    let area: RouteDef['area'] = 'api'
    let label = 'unmatched'
    let reply: Reply
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : null
    const method = (req.method ?? 'GET').toUpperCase()

    try {
      if ((req.url ?? '').length > 2048) throw new HttpError(414, 'not_found', 'The address is too long.')
      const url = new URL(req.url ?? '/', 'http://localhost')
      area = url.pathname === '/admin' || url.pathname.startsWith('/admin/') || url.pathname.startsWith('/api/admin/') ? 'admin' : url.pathname.startsWith('/api/') ? 'api' : 'static'
      limiters.check('global', ip)

      let formCache: Promise<URLSearchParams> | null = null
      const ctx: RequestCtx = {
        app: context,
        req,
        method,
        path: url.pathname,
        query: url.searchParams,
        params: {},
        ip,
        ipHash: hmacHex(config.appSecret, ip),
        requestId,
        log: requestLog,
        cookies: parseCookies(req.headers.cookie),
        origin,
        session: null,
        json: () => readJson(req, config.bodyLimitBytes),
        form: () => (formCache ??= readForm(req, config.bodyLimitBytes)),
        raw: () => readBody(req, config.bodyLimitBytes),
        body: (limit) => readBody(req, limit),
      }

      if (method === 'OPTIONS') {
        const cors = area === 'api' ? corsHeaders(origin, config) : null
        reply = cors ? empty(204, { ...cors, ...PREFLIGHT_HEADERS }) : empty(204)
        label = 'preflight'
      } else {
        const match = router.match(method === 'HEAD' ? 'GET' : method, url.pathname)
        if (match.kind === 'found') {
          label = match.def.pattern
          area = match.def.area
          ctx.params = match.params
          reply = await dispatch(ctx, match.def)
          if (area === 'api') {
            const cors = corsHeaders(origin, config)
            if (cors) reply = { ...reply, headers: { ...reply.headers, ...cors } }
          }
        } else if (match.kind === 'method') {
          throw new HttpError(405, 'method_not_allowed', 'This method is not allowed here.', { headers: { Allow: match.allowed.join(', ') } })
        } else if (area === 'static' && config.staticDir && (method === 'GET' || method === 'HEAD')) {
          let served = serveStatic(config.staticDir, url.pathname)
          // A project published after the site was built has no prerendered page of its own: answer with the Work page's shell
          // (200, not a 404) so the browser starts the application, which draws the project from the API.
          const projectPage = /^\/(hu|en|nl)\/work\/([a-z0-9][a-z0-9-]{1,59})\/?$/.exec(url.pathname)
          if (projectPage && (!served || served.status === 404) && projectIsPublished(context, projectPage[2])) {
            const shell = serveStatic(config.staticDir, `/${projectPage[1]}/work/`)
            if (shell && shell.status === 200) served = shell
          }
          if (!served) throw notFound('The address')
          label = 'static'
          reply = served
        } else if (area === 'static' && config.staticDir) {
          throw new HttpError(405, 'method_not_allowed', 'This method is not allowed here.', { headers: { Allow: 'GET, HEAD' } })
        } else if (area === 'admin' && !url.pathname.startsWith('/api/') && (method === 'GET' || method === 'HEAD')) {
          // `/admin` and everything below it is the administration application; it routes its own addresses in the browser.
          label = 'admin-app'
          reply = serveAdminApp(config.staticDir)
        } else {
          throw notFound('The address')
        }
      }
    } catch (error) {
      reply = toReply(error, requestId, requestLog)
      if (reply.status === 429) stats.rateLimited += 1
    }

    if (reply.status >= 500) stats.serverErrors += 1
    else if (reply.status >= 400) stats.clientErrors += 1
    const body = method === 'HEAD' || reply.status === 204 || reply.status === 304 ? '' : reply.body
    const headers: Record<string, string | number> = {
      ...securityHeaders(area, config),
      ...reply.headers,
      'Content-Length': Buffer.byteLength(body),
      'X-Request-Id': requestId,
    }
    if (!res.headersSent) {
      res.writeHead(reply.status, headers)
      res.end(body)
    }
    requestLog.info('request', { method, route: label, status: reply.status, ms: Math.round(performance.now() - started) })
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error) => {
      log.error('request handler failed', { error })
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end('{"error":{"code":"internal_error","message":"Something went wrong on our side."}}')
    })
  })
  server.requestTimeout = 30_000
  server.headersTimeout = 15_000
  server.keepAliveTimeout = 5_000

  return {
    context,
    server,
    handle,
    start: () => notifier.start(),
    async close() {
      clearInterval(sweeper)
      await notifier.stop()
      // Stop accepting, drop connections nobody is using, let the requests in progress finish; after a grace period cut what is left.
      await new Promise<void>((resolve) => {
        if (!server.listening) return resolve()
        const cut = setTimeout(() => server.closeAllConnections?.(), 5000)
        cut.unref()
        server.close(() => {
          clearTimeout(cut)
          resolve()
        })
        server.closeIdleConnections?.()
      })
    },
  }
}
