import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ADMIN_ROUTE_POLICY, comparePolicy, concretePath, isAdminSurface, routeKey, type Access, type RouteInfo } from './adminRoutePolicy.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * PROMPT 25: every route of the administration is covered by the access policy (adminRoutePolicy.ts), and the running server does what
 * the policy says. The routes are found by asking the router, not by a list kept here, so a new route that nobody classified fails
 * this file instead of shipping unguarded.
 */

type Session = { cookie: string; csrf: string }
let server: TestServer
let admin: Session
let editor: Session
let routes: RouteInfo[]

const as = (who: Session) => ({ Cookie: who.cookie, 'X-CSRF-Token': who.csrf })
const writes = (method: string) => method !== 'GET'
/** Calls that end the session or change the password are made last, so one call cannot take the next one's session away. */
const lastOnes = (pattern: string) => pattern === '/api/admin/logout' || pattern === '/api/admin/sessions/revoke-others' || pattern === '/api/admin/account/password'

beforeAll(async () => {
  // The assistant's provider is a closed port and every other outgoing call is answered 404: nothing here reaches a real service.
  server = await startServer({ env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:1/v1' }, fetch: async () => new Response('{}', { status: 404 }), dns: { mx: async () => [], txt: async () => [] } })
  admin = await server.signIn('admin', 'admin@site.test')
  editor = await server.signIn('editor', 'editor@site.test')
  routes = server.app.routes().map((def) => ({ method: def.method, pattern: def.pattern, area: def.area, auth: def.auth, limit: def.limit }))
}, 60_000)

afterAll(async () => {
  await server.close()
})

const surface = (): RouteInfo[] => routes.filter(isAdminSurface)
const withPolicy = (access: Access): RouteInfo[] => surface().filter((route) => ADMIN_ROUTE_POLICY[routeKey(route)] === access)
/** Every protected route in an order that is safe to run one after another. */
const protectedRoutes = (): RouteInfo[] => [...withPolicy('authenticated'), ...withPolicy('admin')].sort((a, b) => Number(lastOnes(a.pattern)) - Number(lastOnes(b.pattern)))

describe('the policy covers every route of the administration', () => {
  it('finds the administration routes by asking the router', () => {
    // Not a count to maintain: a floor that proves discovery works (an empty list would make every test below pass for nothing).
    expect(surface().length).toBeGreaterThan(100)
    expect(surface().some((route) => route.pattern === '/api/admin/login')).toBe(true)
    expect(surface().some((route) => route.pattern === '/api/admin/system')).toBe(true)
  })

  it('has a line for every route and no line for a route that is gone', () => {
    const report = comparePolicy(routes)
    expect(report.missing, `Routes with no line in server/test/adminRoutePolicy.ts: classify each one as public, authenticated or admin.`).toEqual([])
    expect(report.stale, `Lines in server/test/adminRoutePolicy.ts that no route matches any more: remove them.`).toEqual([])
  })

  it('puts every route that is not public behind a session in the router itself', () => {
    const report = comparePolicy(routes)
    expect(report.withoutSession, 'These routes are not public in the policy but the router does not ask for a session (auth: true).').toEqual([])
    expect(report.publicButAuthenticated).toEqual([])
  })

  it('has one public route, the sign-in, and it is rate limited', () => {
    expect(withPolicy('public').map(routeKey)).toEqual(['POST /api/admin/login'])
    expect(comparePolicy(routes).publicWithoutLimit).toEqual([])
  })

  it('notices a route that is added without a policy line, one that is removed, and one that forgets its session', () => {
    const added: RouteInfo = { method: 'POST', pattern: '/api/admin/brand-new', area: 'admin', auth: true }
    const forgot: RouteInfo = { method: 'GET', pattern: '/api/admin/forgot', area: 'admin' }
    const open: RouteInfo = { method: 'POST', pattern: '/api/admin/open', area: 'admin', auth: true }
    const synthetic: Record<string, Access> = { 'GET /api/admin/forgot': 'authenticated', 'POST /api/admin/open': 'public', 'GET /api/admin/gone': 'admin' }
    const report = comparePolicy([added, forgot, open], synthetic)
    expect(report.missing).toEqual(['POST /api/admin/brand-new'])
    expect(report.stale).toEqual(['GET /api/admin/gone'])
    expect(report.withoutSession).toEqual(['GET /api/admin/forgot'])
    expect(report.publicWithoutLimit).toEqual(['POST /api/admin/open'])
    expect(report.publicButAuthenticated).toEqual(['POST /api/admin/open'])
  })

  it('does not count a route outside the administration', () => {
    expect(isAdminSurface({ method: 'GET', pattern: '/api/health', area: 'api' })).toBe(false)
    expect(isAdminSurface({ method: 'GET', pattern: '/api/anything', area: 'api', auth: true })).toBe(true)
  })
})

describe('what the server does with each policy line', () => {
  it('answers 401 to every protected route without a session', async () => {
    const bad: string[] = []
    for (const route of protectedRoutes()) {
      const response = await server.api(concretePath(route.pattern), { method: route.method, body: writes(route.method) && route.method !== 'DELETE' ? {} : undefined })
      if (response.status !== 401) bad.push(`${routeKey(route)} -> ${response.status}`)
    }
    expect(bad).toEqual([])
  })

  it('answers 401 to a cookie that was never issued', async () => {
    // The cookie keeps the server's own name (a wrong name would be a 401 for the wrong reason), with a value nobody issued.
    const cookieName = admin.cookie.split('=')[0]
    expect(cookieName.length).toBeGreaterThan(0)
    const bad: string[] = []
    for (const route of protectedRoutes()) {
      const response = await server.api(concretePath(route.pattern), { method: route.method, body: writes(route.method) && route.method !== 'DELETE' ? {} : undefined, headers: { Cookie: `${cookieName}=not-a-real-session-token`, 'X-CSRF-Token': admin.csrf } })
      if (response.status !== 401) bad.push(`${routeKey(route)} -> ${response.status}`)
    }
    expect(bad).toEqual([])
    // Proof that the name is right: the real cookie on a read-only route is accepted.
    expect((await server.api('/api/admin/session', { headers: as(admin) })).status).toBe(200)
  })

  it('refuses a state-changing call that has a session but no CSRF token, or a wrong one', async () => {
    const bad: string[] = []
    for (const route of protectedRoutes().filter((r) => writes(r.method))) {
      const path = concretePath(route.pattern)
      const body = route.method === 'DELETE' ? undefined : {}
      const none = await server.api(path, { method: route.method, body, headers: { Cookie: admin.cookie } })
      const wrong = await server.api(path, { method: route.method, body, headers: { Cookie: admin.cookie, 'X-CSRF-Token': `${admin.csrf}x` } })
      if (none.status !== 403 || none.json?.error?.code !== 'csrf_failed') bad.push(`${routeKey(route)} without a token -> ${none.status}`)
      if (wrong.status !== 403 || wrong.json?.error?.code !== 'csrf_failed') bad.push(`${routeKey(route)} with a wrong token -> ${wrong.status}`)
    }
    expect(bad).toEqual([])
  })

  it('refuses a state-changing call that comes from another site, even with a session and a token', async () => {
    const bad: string[] = []
    for (const route of protectedRoutes().filter((r) => writes(r.method))) {
      const response = await server.api(concretePath(route.pattern), { method: route.method, body: route.method === 'DELETE' ? undefined : {}, headers: { ...as(admin), Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' } })
      if (response.status !== 403 || response.json?.error?.code !== 'origin_not_allowed') bad.push(`${routeKey(route)} -> ${response.status}`)
    }
    expect(bad).toEqual([])
  })

  it('answers an editor 403 on every admin-only route, before it looks at anything else', async () => {
    const bad: string[] = []
    for (const route of withPolicy('admin')) {
      const response = await server.api(concretePath(route.pattern), { method: route.method, body: writes(route.method) && route.method !== 'DELETE' ? {} : undefined, headers: as(editor) })
      if (response.status !== 403 || response.json?.error?.code !== 'forbidden') bad.push(`${routeKey(route)} -> ${response.status}`)
    }
    expect(bad).toEqual([])
    expect(withPolicy('admin').length).toBeGreaterThan(10)
  })

  it('lets an editor through on every route the policy says any signed-in user may use', async () => {
    const bad: string[] = []
    for (const route of withPolicy('authenticated').filter((r) => !lastOnes(r.pattern))) {
      const response = await server.api(concretePath(route.pattern), { method: route.method, body: writes(route.method) && route.method !== 'DELETE' ? {} : undefined, headers: as(editor) })
      // The answer may be a 404 or a 422 (the call is empty on purpose); what it must not be is a refusal of the role, or a crash.
      if (response.status === 401 || response.status === 403 || response.status >= 500) bad.push(`${routeKey(route)} -> ${response.status}`)
    }
    expect(bad).toEqual([])
  })

  it('never answers an administrator with a server error', async () => {
    const bad: string[] = []
    for (const route of protectedRoutes().filter((r) => !lastOnes(r.pattern))) {
      const response = await server.api(concretePath(route.pattern), { method: route.method, body: writes(route.method) && route.method !== 'DELETE' ? {} : undefined, headers: as(admin) })
      if (response.status >= 500 || response.status === 401) bad.push(`${routeKey(route)} -> ${response.status}`)
    }
    expect(bad).toEqual([])
  })

  it('does not put a secret or a stack trace in an answer to a refused call', async () => {
    const refused = [await server.api('/api/admin/system'), await server.api('/api/admin/system', { headers: as(editor) }), await server.api('/api/admin/ai', { headers: as(editor) })]
    for (const response of refused) {
      expect(response.status === 401 || response.status === 403).toBe(true)
      expect(response.text).not.toMatch(/stack|node_modules|\.ts:\d+|sk-ant|password/i)
    }
  })

  it('ends a session on sign-out, and the old cookie is refused afterwards', async () => {
    const own = await server.signIn('editor', 'outgoing@site.test')
    expect((await server.api('/api/admin/session', { headers: as(own) })).status).toBe(200)
    expect((await server.api('/api/admin/logout', { method: 'POST', body: {}, headers: { Cookie: own.cookie } })).status).toBe(403)
    expect((await server.api('/api/admin/logout', { method: 'POST', body: {}, headers: as(own) })).status).toBe(204)
    expect((await server.api('/api/admin/session', { headers: as(own) })).status).toBe(401)
  })

  it('has a sign-in that answers a wrong password with a client error, never a crash or a session', async () => {
    const response = await server.api('/api/admin/login', { body: { email: 'nobody@site.test', password: 'a-wrong-passphrase-1' } })
    expect(response.status).toBe(401)
    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
