import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createUser } from '../src/modules/auth/users.ts'
import { hashPassword, verifyPassword } from '../src/lib/crypto.ts'
import { contact, GOOD_PASSWORD, startServer, type TestServer } from './helpers.ts'

let server: TestServer
beforeEach(async () => {
  server = await startServer()
})
afterEach(async () => {
  await server.close()
})

const login = (email: string, password: string, headers: Record<string, string> = {}) => server.api('/api/admin/login', { body: { email, password }, headers })
const authed = (cookie: string, csrf?: string) => ({ Cookie: cookie, ...(csrf ? { 'X-CSRF-Token': csrf } : {}) })

describe('passwords', () => {
  it('are stored as a salted scrypt hash, never in the clear, and verify only when right', async () => {
    const user = await createUser(server.db, server.clock, { email: 'a@site.test', password: GOOD_PASSWORD, role: 'admin' })
    expect(user.password_hash).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/)
    expect(JSON.stringify(server.db.all('SELECT * FROM admin_users'))).not.toContain(GOOD_PASSWORD)
    expect(await verifyPassword(GOOD_PASSWORD, user.password_hash)).toBe(true)
    expect(await verifyPassword(`${GOOD_PASSWORD}x`, user.password_hash)).toBe(false)
    expect(await verifyPassword('', user.password_hash)).toBe(false)
    expect(await verifyPassword(GOOD_PASSWORD, 'not a hash')).toBe(false)
    expect(await hashPassword(GOOD_PASSWORD)).not.toBe(await hashPassword(GOOD_PASSWORD))
  })

  it('must be long enough, not a well-known one, and not the address', async () => {
    const create = (password: string, email = 'someone.long@site.test') => createUser(server.db, server.clock, { email, password, role: 'editor' })
    await expect(create('short')).rejects.toThrow(/at least 12/)
    await expect(create('password1234')).rejects.toThrow(/too common/)
    await expect(create('aaaaaaaaaaaaaa')).rejects.toThrow(/too common/)
    await expect(create('my-someone.long-pass')).rejects.toThrow(/e-mail/)
    await expect(create('x'.repeat(201))).rejects.toThrow(/at most/)
    await expect(createUser(server.db, server.clock, { email: 'not an address', password: GOOD_PASSWORD, role: 'admin' })).rejects.toThrow()
    await expect(createUser(server.db, server.clock, { email: 'a@site.test', password: GOOD_PASSWORD, role: 'admin' })).resolves.toBeDefined()
    await expect(createUser(server.db, server.clock, { email: 'A@Site.test', password: GOOD_PASSWORD, role: 'admin' })).rejects.toThrow(/already exists/)
  })
})

describe('signing in', () => {
  it('issues a session: an HttpOnly, SameSite=Strict cookie, a CSRF token, and stores only a hash of the token', async () => {
    await createUser(server.db, server.clock, { email: 'admin@site.test', password: GOOD_PASSWORD, role: 'admin' })
    const response = await login('Admin@Site.test', GOOD_PASSWORD)
    expect(response.status).toBe(200)
    expect(response.json.data.user).toMatchObject({ email: 'admin@site.test', role: 'admin', permissions: expect.arrayContaining(['requests:read', 'system:write']), preferences: { language: null, theme: null } })
    const cookie = response.headers.get('set-cookie')!
    expect(cookie).toMatch(/^cc_admin=[\w-]{40,}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=43200$/)
    const token = cookie.split(';')[0].split('=')[1]
    const stored = server.db.get<{ token_hash: string; csrf_token: string }>('SELECT token_hash, csrf_token FROM admin_sessions')!
    expect(stored.token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(server.db.all('SELECT * FROM admin_sessions'))).not.toContain(token)
    expect(stored.csrf_token).toBe(response.json.data.csrfToken)
  })

  it('uses a __Host- cookie, marked Secure, when the server is reached over https', async () => {
    await server.close()
    server = await startServer({ env: { API_PUBLIC_URL: 'https://api.site.test' } })
    await createUser(server.db, server.clock, { email: 'admin@site.test', password: GOOD_PASSWORD, role: 'admin' })
    const cookie = (await login('admin@site.test', GOOD_PASSWORD)).headers.get('set-cookie')!
    expect(cookie).toMatch(/^__Host-cc_admin=/)
    expect(cookie).toContain('; Secure')
    expect(cookie).not.toContain('Domain')
  })

  it('says the same thing for a wrong password, an unknown address and a disabled account', async () => {
    await createUser(server.db, server.clock, { email: 'admin@site.test', password: GOOD_PASSWORD, role: 'admin' })
    await createUser(server.db, server.clock, { email: 'off@site.test', password: GOOD_PASSWORD, role: 'editor' })
    server.db.run("UPDATE admin_users SET status = 'disabled' WHERE email = 'off@site.test'")
    const results = await Promise.all([login('admin@site.test', 'wrong password!!'), login('nobody@site.test', GOOD_PASSWORD), login('off@site.test', GOOD_PASSWORD), login('admin@site.test', '')])
    for (const result of results) {
      expect(result.status).toBe(401)
      expect(result.json.error.code).toBe('unauthorized')
    }
    expect(new Set(results.map((result) => result.json.error.message)).size).toBe(1)
    expect(results.some((result) => result.headers.get('set-cookie'))).toBe(false)
  })

  it('refuses values that are not text, and an enormous password, without a crash', async () => {
    expect((await server.api('/api/admin/login', { body: { email: 1, password: [] } })).status).toBe(401)
    expect((await server.api('/api/admin/login', { body: {} })).status).toBe(401)
    expect((await login('a@site.test', 'x'.repeat(5000))).status).toBe(401)
  })

  it('locks the account for fifteen minutes after five wrong passwords, even for the right one, then lets it in', async () => {
    await createUser(server.db, server.clock, { email: 'admin@site.test', password: GOOD_PASSWORD, role: 'admin' })
    for (let i = 0; i < 5; i += 1) expect((await login('admin@site.test', `wrong-${i}-password`)).status).toBe(401)
    expect((await login('admin@site.test', GOOD_PASSWORD)).status).toBe(401)
    server.clock.advance(14 * 60_000)
    expect((await login('admin@site.test', GOOD_PASSWORD)).status).toBe(401)
    server.clock.advance(2 * 60_000)
    expect((await login('admin@site.test', GOOD_PASSWORD)).status).toBe(200)
  })

  it('forgets earlier failures after a success', async () => {
    await createUser(server.db, server.clock, { email: 'admin@site.test', password: GOOD_PASSWORD, role: 'admin' })
    for (let i = 0; i < 4; i += 1) await login('admin@site.test', 'wrong password!')
    expect((await login('admin@site.test', GOOD_PASSWORD)).status).toBe(200)
    for (let i = 0; i < 4; i += 1) await login('admin@site.test', 'wrong password!')
    expect((await login('admin@site.test', GOOD_PASSWORD)).status).toBe(200)
  })

  it('limits sign-in attempts from one address, on top of the account lock', async () => {
    await server.close()
    server = await startServer({ env: { RATE_LIMITS: 'true' } })
    const statuses: number[] = []
    for (let i = 0; i < 12; i += 1) statuses.push((await login(`nobody${i}@site.test`, 'wrong password!')).status)
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true)
    expect(statuses.slice(10)).toEqual([429, 429])
  })

  it('cannot be started from another site: a sign-in from a foreign page is refused before the password is looked at', async () => {
    await createUser(server.db, server.clock, { email: 'admin@site.test', password: GOOD_PASSWORD, role: 'admin' })
    const foreign: Record<string, string>[] = [{ Origin: 'https://evil.test' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }]
    for (const headers of foreign) {
      const response = await login('admin@site.test', GOOD_PASSWORD, headers)
      expect(response.status, JSON.stringify(headers)).toBe(403)
      expect(response.headers.get('set-cookie')).toBeNull()
    }
    expect(server.db.get('SELECT COUNT(*) AS n FROM admin_sessions')).toEqual({ n: 0 })
    expect((await login('admin@site.test', GOOD_PASSWORD, { Origin: server.url, 'Sec-Fetch-Site': 'same-origin' })).status).toBe(200)
  })
})

describe('staying signed in', () => {
  it('ends a session after half an hour without use, and moves the deadline with use', async () => {
    const { cookie } = await server.signIn()
    for (let i = 0; i < 4; i += 1) {
      server.clock.advance(20 * 60_000)
      expect((await server.api('/api/admin/session', { headers: authed(cookie) })).status, `after ${(i + 1) * 20} minutes`).toBe(200)
    }
    server.clock.advance(31 * 60_000)
    expect((await server.api('/api/admin/session', { headers: authed(cookie) })).status).toBe(401)
    expect(server.db.get('SELECT COUNT(*) AS n FROM admin_sessions')).toEqual({ n: 0 })
  })

  it('ends a session at its absolute deadline however busy it is', async () => {
    const { cookie } = await server.signIn()
    for (let minutes = 0; minutes < 11 * 60; minutes += 20) {
      server.clock.advance(20 * 60_000)
      expect((await server.api('/api/admin/session', { headers: authed(cookie) })).status).toBe(200)
    }
    server.clock.advance(61 * 60_000)
    expect((await server.api('/api/admin/session', { headers: authed(cookie) })).status).toBe(401)
  })

  it('is deleted on the server by signing out: the same cookie then opens nothing', async () => {
    const { cookie, csrf } = await server.signIn()
    const out = await server.api('/api/admin/logout', { method: 'POST', raw: '{}', headers: authed(cookie, csrf) })
    expect(out.status).toBe(204)
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await server.api('/api/admin/session', { headers: authed(cookie) })).status).toBe(401)
  })

  it('stops at once when the account is disabled, and a new sign-in is a new session (never one the client chose)', async () => {
    const first = await server.signIn('admin', 'a@site.test')
    const second = await login('a@site.test', GOOD_PASSWORD)
    expect(second.headers.get('set-cookie')!.split(';')[0]).not.toBe(first.cookie)
    server.db.run("UPDATE admin_users SET status = 'disabled' WHERE email = 'a@site.test'")
    expect((await server.api('/api/admin/session', { headers: authed(first.cookie) })).status).toBe(401)
  })

  it('ignores a cookie that is not a session: empty, short, garbage, someone else\'s hash, a name without the prefix', async () => {
    const { cookie } = await server.signIn()
    const token = cookie.split('=')[1]
    for (const bad of ['cc_admin=', 'cc_admin=abc', `cc_admin=${'x'.repeat(60)}`, `cc_admin=${token.slice(0, -2)}zz`, `cc_admin=${'a'.repeat(500)}`, `other=${token}`]) {
      expect((await server.api('/api/admin/session', { headers: { Cookie: bad } })).status, bad.slice(0, 20)).toBe(401)
    }
    const stored = server.db.get<{ token_hash: string }>('SELECT token_hash FROM admin_sessions')!.token_hash
    expect((await server.api('/api/admin/session', { headers: { Cookie: `cc_admin=${stored}` } })).status).toBe(401)
  })

  it('signs the other sessions out when the password is changed, and keeps the one that changed it', async () => {
    const one = await server.signIn('admin', 'a@site.test')
    const two = await login('a@site.test', GOOD_PASSWORD)
    const cookieTwo = two.headers.get('set-cookie')!.split(';')[0]
    const csrfTwo = two.json.data.csrfToken
    const change = (current: string, next: string) => server.api('/api/admin/account/password', { method: 'POST', body: { current, next }, headers: authed(cookieTwo, csrfTwo) })
    // A wrong current password changes nothing (a stolen session alone is not enough), and neither does a weak new one.
    const wrong = await change('not the password!', 'third-long-passphrase-3')
    expect(wrong.status).toBe(422)
    expect(wrong.json.error.details.fields.current).toBe('invalid')
    expect((await change(GOOD_PASSWORD, 'short')).json.error.details.fields.next).toBe('invalid')
    expect((await server.api('/api/admin/session', { headers: authed(one.cookie) })).status).toBe(200)
    const ok = await change(GOOD_PASSWORD, 'another-long-passphrase-2')
    expect(ok.status).toBe(200)
    expect(ok.json.data.otherSessionsClosed).toBe(1)
    expect((await server.api('/api/admin/session', { headers: authed(one.cookie) })).status).toBe(401)
    expect((await server.api('/api/admin/session', { headers: authed(cookieTwo) })).status).toBe(200)
    expect((await login('a@site.test', GOOD_PASSWORD)).status).toBe(401)
    expect((await login('a@site.test', 'another-long-passphrase-2')).status).toBe(200)
    expect(server.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'account.password'")).toEqual({ n: 1 })
    expect(JSON.stringify(server.db.all('SELECT detail FROM audit_log'))).not.toMatch(/another-long|third-long/)
  })

  it('limits password attempts as it limits sign-ins, since a stolen session would try to guess the current password', async () => {
    await server.close()
    server = await startServer({ env: { RATE_LIMITS: 'true' } })
    const { cookie, csrf } = await server.signIn()
    const statuses: number[] = []
    for (let i = 0; i < 12; i += 1) statuses.push((await server.api('/api/admin/account/password', { method: 'POST', body: { current: `guess-number-${i}-xx`, next: 'a-new-long-passphrase-9' }, headers: authed(cookie, csrf) })).status)
    expect(statuses.slice(0, 9).every((status) => status === 422)).toBe(true)
    expect(statuses.slice(10)).toEqual([429, 429])
  })
})

describe('who may reach the administration', () => {
  const apiPaths = [
    '/api/admin/session', '/api/admin/dashboard', '/api/admin/inquiries', '/api/admin/inquiries/x', '/api/admin/quote-requests', '/api/admin/quote-requests/x', '/api/admin/quote-requests/x/export', '/api/admin/quote-requests/x/export.json',
    '/api/admin/quote-requests/export.csv', '/api/admin/services', '/api/admin/services/website', '/api/admin/packages', '/api/admin/packages/launch', '/api/admin/extras', '/api/admin/extras/pages', '/api/admin/content',
    '/api/admin/content/faq/start', '/api/admin/translations', '/api/admin/notifications', '/api/admin/settings', '/api/admin/sessions', '/api/admin/system',
  ]

  it('gives a visitor without a session a 401 envelope from every admin API route, and changes nothing', async () => {
    await server.api('/api/contact', { body: contact() })
    for (const path of apiPaths) {
      const response = await server.api(path)
      expect(response.status, path).toBe(401)
      expect(response.json.error.code).toBe('unauthorized')
    }
    const id = (server.db.get<{ id: string }>('SELECT id FROM inquiries')!).id
    for (const [method, path, body] of [
      ['PATCH', `/api/admin/inquiries/${id}`, { status: 'completed' }],
      ['DELETE', `/api/admin/inquiries/${id}`, undefined],
      ['POST', '/api/admin/services', { slug: 'x1' }],
      ['PUT', '/api/admin/packages/launch', { status: 'disabled' }],
      ['DELETE', '/api/admin/extras/pages', undefined],
      ['PUT', '/api/admin/order/packages', { keys: ['care', 'build', 'grow', 'launch'] }],
      ['PUT', '/api/admin/translations/packages/launch/nl', { fields: { name: 'X' } }],
      ['PUT', '/api/admin/notifications/preferences', { newInquiry: false, newQuote: false }],
      ['PUT', '/api/admin/settings/preferences', { theme: 'light' }],
      ['POST', '/api/admin/account/password', { current: 'a', next: 'b' }],
      ['POST', '/api/admin/sessions/revoke-others', {}],
      ['POST', '/api/admin/system/maintenance', {}],
    ] as const) {
      const response = await server.api(path, { method, body })
      expect(response.status, `${method} ${path}`).toBe(401)
    }
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('new')
    expect(server.db.get<{ status: string }>("SELECT status FROM packages WHERE code = 'launch'")?.status).toBe('active')
  })

  it('has no public sign-up, and the public API has no administrative route', async () => {
    for (const path of ['/admin/register', '/admin/signup', '/api/admin/register', '/api/register', '/api/users', '/api/admin/users']) expect([404, 401]).toContain((await server.fetch(path)).status)
    expect((await server.api('/api/inquiries')).status).toBe(404)
    expect((await server.api('/api/quote-requests')).status).toBe(405)
  })

  it('lets an editor work with requests and the catalogue, but not delete or see the system page', async () => {
    const editor = await server.signIn('editor')
    await server.api('/api/contact', { body: contact() })
    const id = server.db.get<{ id: string }>('SELECT id FROM inquiries')!.id
    const send = (method: string, path: string, body?: unknown) => server.api(path, { method, body, headers: authed(editor.cookie, editor.csrf) })
    expect((await send('GET', '/api/admin/inquiries')).status).toBe(200)
    expect((await send('PATCH', `/api/admin/inquiries/${id}`, { status: 'in_progress' })).status).toBe(200)
    expect((await send('DELETE', `/api/admin/inquiries/${id}`)).status).toBe(403)
    expect((await send('DELETE', '/api/admin/extras/pages')).status).toBe(403)
    expect((await send('DELETE', '/api/admin/content/faq/start')).status).toBe(403)
    expect((await send('GET', '/api/admin/system')).status).toBe(403)
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 1 })
    // Everything an administrator alone may do is refused to an editor, on the server, whatever the application shows.
    expect((await send('POST', '/api/admin/system/maintenance', {})).status).toBe(403)
    expect((await send('POST', '/api/admin/system/publish', {})).status).toBe(403)
    expect((await send('PUT', '/api/admin/notifications/preferences', { newInquiry: false, newQuote: false })).status).toBe(403)
    expect((await send('GET', '/api/admin/dashboard')).status).toBe(200)
    expect((await send('GET', '/api/admin/translations')).status).toBe(200)
    expect((await send('GET', '/api/admin/notifications')).status).toBe(200)
    expect((await send('GET', '/api/admin/session')).json.data.user.permissions).not.toContain('system:read')
    const admin = await server.signIn('admin')
    expect((await server.api('/api/admin/system', { headers: authed(admin.cookie) })).status).toBe(200)
    expect((await server.api(`/api/admin/inquiries/${id}`, { method: 'DELETE', headers: authed(admin.cookie, admin.csrf) })).status).toBe(204)
  })
})

describe('requests that change something', () => {
  it('need the session\'s CSRF token: without it, with a wrong one, with another session\'s', async () => {
    const one = await server.signIn()
    const two = await server.signIn()
    await server.api('/api/contact', { body: contact() })
    const id = server.db.get<{ id: string }>('SELECT id FROM inquiries')!.id
    const patch = (headers: Record<string, string>) => server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: { status: 'completed' }, headers })
    const attempts: Record<string, string>[] = [{ Cookie: one.cookie }, { Cookie: one.cookie, 'X-CSRF-Token': 'wrong' }, { Cookie: one.cookie, 'X-CSRF-Token': two.csrf }]
    for (const headers of attempts) {
      const response = await patch(headers)
      expect(response.status).toBe(403)
      expect(response.json.error.code).toBe('csrf_failed')
    }
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('new')
    expect((await patch({ Cookie: one.cookie, 'X-CSRF-Token': one.csrf })).status).toBe(200)
  })

  it('must come from the admin\'s own pages: another origin, or a cross-site fetch, is refused even with the cookie and token', async () => {
    const { cookie, csrf } = await server.signIn()
    await server.api('/api/contact', { body: contact() })
    const id = server.db.get<{ id: string }>('SELECT id FROM inquiries')!.id
    const base = { Cookie: cookie, 'X-CSRF-Token': csrf }
    const foreign: Record<string, string>[] = [{ Origin: 'https://evil.test' }, { Origin: 'https://site.test' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }]
    for (const extra of foreign) {
      const response = await server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: { status: 'completed' }, headers: { ...base, ...extra } })
      expect(response.status, JSON.stringify(extra)).toBe(403)
      expect(response.json.error.code).toBe('origin_not_allowed')
    }
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('new')
    const same = await server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: { status: 'completed' }, headers: { ...base, Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })
    expect(same.status).toBe(200)
  })

  it('are accepted from a real browser, which sends "Origin: null" from a page served with Referrer-Policy: no-referrer', async () => {
    const { cookie, csrf } = await server.signIn()
    await server.api('/api/contact', { body: contact() })
    const id = server.db.get<{ id: string }>('SELECT id FROM inquiries')!.id
    const browser = { Cookie: cookie, 'X-CSRF-Token': csrf, Origin: 'null', 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'cors' }
    const change = await server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: { status: 'completed' }, headers: browser })
    expect(change.status).toBe(200)
    // "null" with a browser that says the request came from elsewhere is still refused, and so is a wrong token.
    expect((await server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: { status: 'new' }, headers: { ...browser, 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
    expect((await server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: { status: 'new' }, headers: { ...browser, 'X-CSRF-Token': 'forged' } })).status).toBe(403)
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('completed')
  })

  it('are never answered with CORS headers: the administration is not for other sites', async () => {
    const { cookie } = await server.signIn()
    const response = await server.api('/api/admin/session', { headers: { Cookie: cookie, Origin: 'https://site.test' } })
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    const preflight = await server.fetch('/api/admin/inquiries', { method: 'OPTIONS', headers: { Origin: 'https://site.test', 'Access-Control-Request-Method': 'PATCH' } })
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
  })
})
