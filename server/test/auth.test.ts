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
    expect(response.json.data.user).toEqual({ email: 'admin@site.test', role: 'admin' })
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

  it('works through the HTML form: a token for the form, a refusal without it, a generic failure, a redirect on success', async () => {
    await createUser(server.db, server.clock, { email: 'admin@site.test', password: GOOD_PASSWORD, role: 'admin' })
    const page = await (await server.fetch('/admin/login')).text()
    const csrf = /name="_csrf" value="([0-9a-f]+)"/.exec(page)![1]
    const form = (fields: Record<string, string>) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })
    expect((await server.fetch('/admin/login', form({ email: 'admin@site.test', password: GOOD_PASSWORD }))).status).toBe(403)
    const wrong = await server.fetch('/admin/login', form({ _csrf: csrf, email: 'admin@site.test', password: 'wrong password!' }))
    expect(wrong.status).toBe(401)
    expect(await wrong.text()).toContain('not correct, or the account is temporarily locked')
    const ok = await server.fetch('/admin/login', form({ _csrf: csrf, email: 'admin@site.test', password: GOOD_PASSWORD }))
    expect(ok.status).toBe(303)
    expect(ok.headers.get('location')).toBe('/admin/dashboard')
    expect(ok.headers.get('set-cookie')).toContain('HttpOnly')
    // The form's token is good for this hour and the next, not for a day.
    server.clock.advance(3 * 3_600_000)
    expect((await server.fetch('/admin/login', form({ _csrf: csrf, email: 'admin@site.test', password: GOOD_PASSWORD }))).status).toBe(403)
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
    const change = await server.fetch('/admin/account/password', { method: 'POST', headers: { Cookie: cookieTwo, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: csrfTwo, current: GOOD_PASSWORD, next: 'another-long-passphrase-2' }).toString() })
    expect(change.status).toBe(303)
    expect((await server.api('/api/admin/session', { headers: authed(one.cookie) })).status).toBe(401)
    expect((await server.api('/api/admin/session', { headers: authed(cookieTwo) })).status).toBe(200)
    expect((await login('a@site.test', GOOD_PASSWORD)).status).toBe(401)
    expect((await login('a@site.test', 'another-long-passphrase-2')).status).toBe(200)
    // A wrong current password changes nothing.
    const wrong = await server.fetch('/admin/account/password', { method: 'POST', headers: { Cookie: cookieTwo, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: csrfTwo, current: 'not the password!', next: 'third-long-passphrase-3' }).toString() })
    expect(wrong.status).toBe(422)
  })
})

describe('who may reach the administration', () => {
  const adminPaths = [
    '/admin/dashboard', '/admin/inquiries', '/admin/inquiries/x', '/admin/quote-requests', '/admin/quote-requests/export.csv', '/admin/quote-requests/x', '/admin/quote-requests/x/export.json',
    '/admin/catalog', '/admin/services/new', '/admin/services/website', '/admin/packages/launch', '/admin/extras/pages', '/admin/content/faq/start', '/admin/system', '/admin/account',
  ]
  const apiPaths = [
    '/api/admin/session', '/api/admin/inquiries', '/api/admin/inquiries/x', '/api/admin/quote-requests', '/api/admin/quote-requests/x', '/api/admin/quote-requests/x/export', '/api/admin/services', '/api/admin/services/website',
    '/api/admin/packages', '/api/admin/packages/launch', '/api/admin/extras', '/api/admin/extras/pages', '/api/admin/content', '/api/admin/content/faq/start', '/api/admin/system',
  ]

  it('shows no admin page to a visitor without a session: it sends them to the sign-in', async () => {
    for (const path of adminPaths) {
      const response = await server.fetch(path)
      expect(response.status, path).toBe(303)
      expect(response.headers.get('location'), path).toBe('/admin/login')
    }
  })

  it('gives a visitor without a session a 401 envelope from every admin API route, and changes nothing', async () => {
    await server.api('/api/contact', { body: contact() })
    for (const path of apiPaths) {
      const response = await server.api(path)
      expect(response.status, path).toBe(401)
      expect(response.json.error.code).toBe('unauthorized')
    }
    const id = (server.db.get<{ id: string }>('SELECT id FROM inquiries')!).id
    for (const [method, path, body] of [
      ['PATCH', `/api/admin/inquiries/${id}`, { status: 'closed' }],
      ['DELETE', `/api/admin/inquiries/${id}`, undefined],
      ['POST', '/api/admin/services', { slug: 'x1' }],
      ['PUT', '/api/admin/packages/launch', { status: 'disabled' }],
      ['DELETE', '/api/admin/extras/pages', undefined],
    ] as const) {
      const response = await server.api(path, { method, body })
      expect(response.status, `${method} ${path}`).toBe(401)
    }
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('new')
    expect(server.db.get<{ status: string }>("SELECT status FROM packages WHERE code = 'launch'")?.status).toBe('active')
  })

  it('has no public sign-up, and the public API has no administrative route', async () => {
    for (const path of ['/admin/register', '/admin/signup', '/api/admin/register', '/api/register', '/api/users', '/api/admin/users']) expect([404, 303, 401]).toContain((await server.fetch(path)).status)
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
    const page = await server.fetch('/admin/system', { headers: { Cookie: editor.cookie } })
    expect(page.status).toBe(403)
    expect(await page.text()).toContain('Your role does not allow that')
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 1 })
    // ...and the menu does not offer what the role cannot do.
    expect(await (await server.fetch('/admin/dashboard', { headers: { Cookie: editor.cookie } })).text()).not.toContain('>System<')
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
    const patch = (headers: Record<string, string>) => server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: { status: 'closed' }, headers })
    const attempts: Record<string, string>[] = [{ Cookie: one.cookie }, { Cookie: one.cookie, 'X-CSRF-Token': 'wrong' }, { Cookie: one.cookie, 'X-CSRF-Token': two.csrf }]
    for (const headers of attempts) {
      const response = await patch(headers)
      expect(response.status).toBe(403)
      expect(response.json.error.code).toBe('csrf_failed')
    }
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('new')
    expect((await patch({ Cookie: one.cookie, 'X-CSRF-Token': one.csrf })).status).toBe(200)
  })

  it('need the form field on an HTML form, and refuse a form with none', async () => {
    const { cookie, csrf } = await server.signIn()
    await server.api('/api/contact', { body: contact() })
    const id = server.db.get<{ id: string }>('SELECT id FROM inquiries')!.id
    const post = (fields: Record<string, string>) => server.fetch(`/admin/inquiries/${id}/status`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })
    expect((await post({ status: 'closed' })).status).toBe(403)
    expect((await post({ _csrf: 'forged', status: 'closed' })).status).toBe(403)
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('new')
    expect((await post({ _csrf: csrf, status: 'closed' })).status).toBe(303)
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('closed')
  })

  it('must come from the admin\'s own pages: another origin, or a cross-site fetch, is refused even with the cookie and token', async () => {
    const { cookie, csrf } = await server.signIn()
    await server.api('/api/contact', { body: contact() })
    const id = server.db.get<{ id: string }>('SELECT id FROM inquiries')!.id
    const base = { Cookie: cookie, 'X-CSRF-Token': csrf }
    const foreign: Record<string, string>[] = [{ Origin: 'https://evil.test' }, { Origin: 'https://site.test' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }]
    for (const extra of foreign) {
      const response = await server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: { status: 'closed' }, headers: { ...base, ...extra } })
      expect(response.status, JSON.stringify(extra)).toBe(403)
      expect(response.json.error.code).toBe('origin_not_allowed')
    }
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('new')
    const same = await server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', body: { status: 'closed' }, headers: { ...base, Origin: server.url, 'Sec-Fetch-Site': 'same-origin' } })
    expect(same.status).toBe(200)
  })

  it('are accepted from a real browser, which sends "Origin: null" with a form post from a page served with Referrer-Policy: no-referrer', async () => {
    await createUser(server.db, server.clock, { email: 'admin@site.test', password: GOOD_PASSWORD, role: 'admin' })
    const page = await (await server.fetch('/admin/login')).text()
    const csrf = /name="_csrf" value="([0-9a-f]+)"/.exec(page)![1]
    const browser = { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'null', 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Mode': 'navigate' }
    const body = new URLSearchParams({ _csrf: csrf, email: 'admin@site.test', password: GOOD_PASSWORD }).toString()
    const signedIn = await server.fetch('/admin/login', { method: 'POST', headers: browser, body })
    expect(signedIn.status).toBe(303)
    const cookie = signedIn.headers.get('set-cookie')!.split(';')[0]
    const session = await server.api('/api/admin/session', { headers: { Cookie: cookie } })
    await server.api('/api/contact', { body: contact() })
    const id = server.db.get<{ id: string }>('SELECT id FROM inquiries')!.id
    const change = await server.fetch(`/admin/inquiries/${id}/status`, { method: 'POST', headers: { ...browser, Cookie: cookie }, body: new URLSearchParams({ _csrf: session.json.data.csrfToken, status: 'closed' }).toString() })
    expect(change.status).toBe(303)
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('closed')
    // "null" with a browser that says the request came from elsewhere is still refused, and so is a missing token.
    const foreign = await server.fetch(`/admin/inquiries/${id}/status`, { method: 'POST', headers: { ...browser, Cookie: cookie, 'Sec-Fetch-Site': 'cross-site' }, body: new URLSearchParams({ _csrf: session.json.data.csrfToken, status: 'new' }).toString() })
    expect(foreign.status).toBe(403)
    const untokened = await server.fetch(`/admin/inquiries/${id}/status`, { method: 'POST', headers: { ...browser, Cookie: cookie }, body: new URLSearchParams({ status: 'new' }).toString() })
    expect(untokened.status).toBe(403)
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('closed')
  })

  it('are never answered with CORS headers: the administration is not for other sites', async () => {
    const { cookie } = await server.signIn()
    const response = await server.api('/api/admin/session', { headers: { Cookie: cookie, Origin: 'https://site.test' } })
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    const preflight = await server.fetch('/api/admin/inquiries', { method: 'OPTIONS', headers: { Origin: 'https://site.test', 'Access-Control-Request-Method': 'PATCH' } })
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
  })
})
