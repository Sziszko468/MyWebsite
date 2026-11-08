import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpError } from '../src/http/errors.ts'
import { Limiters } from '../src/http/rateLimit.ts'
import { contact, GOOD_PASSWORD, quote, startServer, type TestServer } from './helpers.ts'

let server: TestServer
const cleanup: string[] = []
beforeEach(async () => {
  server = await startServer()
})
afterEach(async () => {
  await server.close()
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

const scratch = (): string => {
  const directory = mkdtempSync(join(tmpdir(), 'cc-sec-'))
  cleanup.push(directory)
  return directory
}
const counts = () => ({
  inquiries: server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM inquiries')!.n,
  quotes: server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM quote_requests')!.n,
  services: server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM services')!.n,
  packages: server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM packages')!.n,
  users: server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM admin_users')!.n,
})

const INJECTIONS = [
  "'; DROP TABLE inquiries; --",
  "' OR '1'='1",
  '" OR ""="',
  "1; DELETE FROM admin_users WHERE 1=1; --",
  "Robert'); DROP TABLE quote_requests;--",
  "' UNION SELECT password_hash FROM admin_users --",
  "%' OR 1=1 --",
  '\\\'; SELECT sqlite_version(); --',
]

describe('SQL injection', () => {
  it('stores what a visitor types as text, exactly, and the tables are untouched', async () => {
    for (const [i, payload] of INJECTIONS.entries()) {
      const message = `${payload} — padded so that the message is long enough (${i}).`
      const response = await server.api('/api/contact', { body: contact({ name: `Anna ${payload}`.slice(0, 100), subject: `Subject ${payload}`.slice(0, 150), message }) })
      expect(response.status, payload).toBe(201)
      const stored = server.db.get<{ message: string }>('SELECT message FROM inquiries WHERE reference = ?', [response.json.data.reference])
      expect(stored?.message).toBe(message)
    }
    for (const [i, payload] of INJECTIONS.entries()) {
      const response = await server.api('/api/quote-requests', { body: quote({ description: `${payload} ${i} a description that is long enough.`, requirements: payload, reference: payload }) })
      expect(response.status, payload).toBe(201)
    }
    expect(counts()).toMatchObject({ inquiries: INJECTIONS.length, quotes: INJECTIONS.length, services: 4, packages: 4 })
    expect(server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM sqlite_master WHERE type = \'table\' AND name IN (\'inquiries\', \'quote_requests\', \'admin_users\')')!.n).toBe(3)
  })

  it('is not possible through the code a visitor can put in a choice: the package, the add-on, the language, the need', async () => {
    for (const payload of INJECTIONS) {
      expect((await server.api('/api/quote-requests', { body: quote({ items: [{ need: 'website', plan: payload, extras: [] }] }) })).status, payload).toBe(422)
      expect((await server.api('/api/quote-requests', { body: quote({ items: [{ need: 'website', plan: 'launch', extras: [payload] }] }) })).status, payload).toBe(422)
      expect((await server.api('/api/quote-requests', { body: quote({ items: [{ need: payload, plan: null, extras: [] }] }) })).status, payload).toBe(422)
      expect((await server.api('/api/contact', { body: contact({ kind: payload }) })).status, payload).toBe(422)
      expect((await server.api('/api/contact', { body: contact({ language: payload }) })).status, payload).toBe(422)
    }
    expect(counts()).toMatchObject({ inquiries: 0, quotes: 0, users: 0 })
  })

  it('is not possible through an address, a query string or a filter, public or administrative', async () => {
    await server.api('/api/contact', { body: contact() })
    await server.api('/api/quote-requests', { body: quote() })
    const admin = await server.signIn()
    const cookie = { Cookie: admin.cookie }
    for (const payload of INJECTIONS) {
      const encoded = encodeURIComponent(payload)
      for (const path of [`/api/services/${encoded}`, `/api/packages/${encoded}`, `/api/services?lang=${encoded}`, `/api/content/faq?lang=${encoded}`]) {
        const response = await server.api(path)
        expect([404, 422], `${path} -> ${response.status}`).toContain(response.status)
      }
      for (const path of [`/api/admin/inquiries/${encoded}`, `/api/admin/quote-requests/${encoded}`, `/api/admin/services/${encoded}`, `/api/admin/packages/${encoded}`, `/api/admin/extras/${encoded}`, `/api/admin/content/faq/${encoded}`]) {
        expect((await server.api(path, { headers: cookie })).status, path).toBe(404)
      }
      // A search or a filter with a payload finds what the payload literally says: nothing here, and never everything.
      for (const path of [`/api/admin/inquiries?q=${encoded}`, `/api/admin/quote-requests?q=${encoded}`, `/api/admin/inquiries?status=${encoded}&kind=${encoded}`, `/api/admin/inquiries?page=${encoded}`]) {
        const response = await server.api(path, { headers: cookie })
        expect(response.status, path).toBe(200)
        if (path.includes('?q=')) expect(response.json.meta.total, path).toBe(0)
      }
      const csv = await server.fetch(`/admin/quote-requests/export.csv?q=${encoded}`, { headers: cookie })
      expect((await csv.text()).trim().split('\r\n')).toHaveLength(1)
      expect((await send(admin, 'PATCH', `/api/admin/inquiries/${server.db.get<{ id: string }>('SELECT id FROM inquiries')!.id}`, { status: payload })).status).toBe(422)
    }
    expect(counts()).toMatchObject({ inquiries: 1, quotes: 1, services: 4, packages: 4, users: 1 })
  })

  it('is not possible through the sign-in form', async () => {
    await server.signIn('admin', 'admin@site.test')
    for (const payload of INJECTIONS) {
      expect((await server.api('/api/admin/login', { body: { email: payload, password: payload } })).status).toBe(401)
      expect((await server.api('/api/admin/login', { body: { email: `admin@site.test${payload}`, password: GOOD_PASSWORD } })).status).toBe(401)
    }
    expect(counts().users).toBe(1)
    // Every sign-in is a real scrypt hash (about 0.1 s of CPU), and the suite runs its files in parallel: the default 5 s was not enough once.
  }, 30_000)
})

async function send(who: { cookie: string; csrf: string }, method: string, path: string, body?: unknown) {
  return server.api(path, { method, body, headers: { Cookie: who.cookie, 'X-CSRF-Token': who.csrf } })
}

describe('what comes back to a browser', () => {
  it('is JSON that no browser will read as anything else, with the headers that say so', async () => {
    for (const path of ['/api/services', '/api/health', '/api/ready', '/api/nothing-here']) {
      const response = await server.api(path)
      expect(response.headers.get('content-type'), path).toBe('application/json; charset=utf-8')
      expect(response.headers.get('x-content-type-options'), path).toBe('nosniff')
      expect(response.headers.get('content-security-policy'), path).toBe("default-src 'none'; frame-ancestors 'none'")
      expect(response.headers.get('x-frame-options'), path).toBe('DENY')
      expect(response.headers.get('referrer-policy'), path).toBe('no-referrer')
      expect(response.headers.get('permissions-policy'), path).toContain('camera=()')
      expect(response.headers.get('cross-origin-opener-policy'), path).toBe('same-origin')
      expect(response.headers.get('x-powered-by'), path).toBeNull()
      expect(response.headers.get('server'), path).toBeNull()
      expect(response.headers.get('x-request-id'), path).toMatch(/^[0-9a-f-]{36}$/)
    }
    const catalog = await server.api('/api/services')
    expect(catalog.headers.get('cache-control')).toBe('public, max-age=60') // only the public catalogue is cacheable
    expect((await server.api('/api/ready')).headers.get('cache-control')).toBe('no-store')
    expect((await server.api('/api/contact', { body: contact() })).headers.get('cache-control')).toBe('no-store')
  })

  it('carries a visitor\'s words back only as JSON strings, never as markup, and sets no cookie on a public route', async () => {
    const response = await server.api('/api/contact', { body: contact({ name: '<script>alert(1)</script>' }) })
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    for (const path of ['/api/services', '/api/shop/catalog', '/api/health']) expect((await server.api(path)).headers.get('set-cookie'), path).toBeNull()
    expect(response.headers.get('set-cookie')).toBeNull()
    const admin = await server.signIn()
    const detail = await server.api(`/api/admin/inquiries/${server.db.get<{ id: string }>('SELECT id FROM inquiries')!.id}`, { headers: { Cookie: admin.cookie } })
    expect(detail.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(detail.json.data.name).toBe('<script>alert(1)</script>')
  })

  it('sets Strict-Transport-Security only in production, and the admin policy forbids script and framing', async () => {
    const admin = await server.signIn()
    expect((await server.fetch('/admin')).headers.get('strict-transport-security')).toBeNull()
    await server.close()
    const directory = scratch()
    server = await startServer({
      databasePath: join(directory, 'app.sqlite'),
      env: { APP_ENV: 'production', APP_SECRET: 'k'.repeat(40), CORS_ORIGINS: 'https://site.test', EMAIL_PROVIDER: 'none', API_PUBLIC_URL: 'https://api.site.test' },
      mailer: null,
    })
    const shell = await server.fetch('/admin')
    expect(shell.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
    // The administration application may run its own script and nothing else: no inline script, no eval, nothing from elsewhere.
    const policy = shell.headers.get('content-security-policy')!
    expect(policy).toContain("script-src 'self'")
    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).not.toMatch(/unsafe-inline|unsafe-eval|\*|https?:/)
    expect(shell.headers.get('x-robots-tag')).toBe('noindex, nofollow')
    expect(shell.headers.get('cache-control')).toBe('no-store')
    // The data the application shows comes from the API, which has its own, stricter policy.
    expect((await server.api('/api/services')).headers.get('content-security-policy')).toBe("default-src 'none'; frame-ancestors 'none'")
    expect(admin.cookie).toMatch(/^cc_admin=/)
    const session = await server.signIn()
    expect(session.cookie).toMatch(/^__Host-cc_admin=/)
  })
})

describe('other websites', () => {
  const allowed = 'https://site.test'
  const post = (origin: string | null, path = '/api/contact', body: unknown = contact()) => server.api(path, { body, headers: origin === null ? {} : { Origin: origin } })

  it('may read the public API only from the origins in CORS_ORIGINS, exactly, with no wildcard and no credentials', async () => {
    const yes = await server.api('/api/services', { headers: { Origin: allowed } })
    expect(yes.headers.get('access-control-allow-origin')).toBe(allowed)
    expect(yes.headers.get('vary')).toContain('Origin')
    expect(yes.headers.get('access-control-allow-credentials')).toBeNull()
    for (const origin of ['https://evil.test', 'https://site.test.evil.test', 'http://site.test', 'https://SITE.test', 'https://sub.site.test', 'null', '*']) {
      const no = await server.api('/api/services', { headers: { Origin: origin } })
      expect(no.status, origin).toBe(200) // reading is not forbidden; the browser is simply not given the answer
      expect(no.headers.get('access-control-allow-origin'), origin).toBeNull()
    }
  })

  it('answers a preflight for an allowed origin with the methods and headers the API uses, and for any other with nothing', async () => {
    const ok = await server.fetch('/api/contact', { method: 'OPTIONS', headers: { Origin: allowed, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } })
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-origin')).toBe(allowed)
    expect(ok.headers.get('access-control-allow-methods')).toBe('GET, POST, PUT, DELETE, OPTIONS')
    expect(ok.headers.get('access-control-allow-headers')).toBe('Content-Type, If-None-Match, X-AI-Session')
    expect(ok.headers.get('access-control-allow-headers')).not.toMatch(/authorization|cookie|csrf/i)
    expect(ok.headers.get('access-control-allow-credentials')).toBeNull()
    for (const origin of ['https://evil.test', 'null']) {
      const no = await server.fetch('/api/contact', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST' } })
      expect(no.status).toBe(204)
      expect(no.headers.get('access-control-allow-origin')).toBeNull()
      expect(no.headers.get('access-control-allow-methods')).toBeNull()
    }
  })

  it('cannot even send a message: a form post from another origin is refused before anything is stored', async () => {
    for (const origin of ['https://evil.test', 'null', 'http://site.test']) {
      const response = await post(origin)
      expect(response.status, origin).toBe(403)
      expect(response.json.error.code).toBe('origin_not_allowed')
      expect((await post(origin, '/api/quote-requests', quote())).status, origin).toBe(403)
    }
    expect(counts()).toMatchObject({ inquiries: 0, quotes: 0 })
    expect((await post(allowed)).status).toBe(201)
    expect((await post(allowed)).status).toBe(200) // the same message again is recognised, not stored twice
    expect((await post(null, '/api/contact', contact({ subject: 'No Origin header at all' }))).status).toBe(201) // a server, a script, a test tool
    expect(counts().inquiries).toBe(2)
  })

  it('is not another site when it is the server\'s own: the website served by this process may post its forms with no CORS list at all', async () => {
    await server.close()
    server = await startServer({ env: { CORS_ORIGINS: '' } })
    const own = await post(server.url) // what a browser sends from a page this server served
    expect(own.status).toBe(201)
    expect((await post(server.url, '/api/quote-requests', quote())).status).toBe(201)
    expect((await post('https://evil.test')).status).toBe(403)
    expect((await post(`http://127.0.0.1:${Number(new URL(server.url).port) + 1}`)).status).toBe(403) // another port is another origin
    expect(counts()).toMatchObject({ inquiries: 1, quotes: 1 })
  })

  it('learns nothing about the administration: no CORS answer for it, whoever asks', async () => {
    for (const path of ['/api/admin/session', '/api/admin/login']) {
      const response = await server.api(path, { headers: { Origin: allowed } })
      expect(response.headers.get('access-control-allow-origin'), path).toBeNull()
    }
    const preflight = await server.fetch('/api/admin/login', { method: 'OPTIONS', headers: { Origin: allowed, 'Access-Control-Request-Method': 'POST' } })
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('abuse of the public forms', () => {
  it('stops a sixth message in fifteen minutes from one address, says when to come back, and lets them in after that', async () => {
    await server.close()
    server = await startServer({ env: { RATE_LIMITS: 'true' } })
    for (let i = 0; i < 5; i += 1) expect((await server.api('/api/contact', { body: contact({ subject: `Message ${i}` }) })).status, `message ${i}`).toBe(201)
    const blocked = await server.api('/api/contact', { body: contact({ subject: 'Message 6' }) })
    expect(blocked.status).toBe(429)
    expect(blocked.json.error.code).toBe('rate_limited')
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(Number(blocked.headers.get('retry-after'))).toBeLessThanOrEqual(900)
    expect(counts().inquiries).toBe(5)
    // The quote form has a limit of its own, and the catalogue is not affected by either.
    expect((await server.api('/api/quote-requests', { body: quote() })).status).toBe(201)
    expect((await server.api('/api/services')).status).toBe(200)
    server.clock.advance(15 * 60_000 + 1000)
    expect((await server.api('/api/contact', { body: contact({ subject: 'Message 7' }) })).status).toBe(201)
    expect(server.app.context.stats.rateLimited).toBe(1)
  })

  it('counts addresses separately behind a proxy, and ignores a forged forwarding header when no proxy is trusted', async () => {
    await server.close()
    server = await startServer({ env: { RATE_LIMITS: 'true', TRUST_PROXY: '1' } })
    const as = (ip: string, i: number) => server.api('/api/contact', { body: contact({ subject: `From ${ip} ${i}` }), headers: { 'X-Forwarded-For': ip } })
    for (let i = 0; i < 5; i += 1) await as('198.51.100.7', i)
    expect((await as('198.51.100.7', 9)).status).toBe(429)
    expect((await as('203.0.113.9', 0)).status).toBe(201)
    // Only the entry the trusted proxy added counts: a client cannot pick its own address by sending a longer list.
    expect((await server.api('/api/contact', { body: contact({ subject: 'spoof' }), headers: { 'X-Forwarded-For': '192.0.2.1, 198.51.100.7' } })).status).toBe(429)

    await server.close()
    server = await startServer({ env: { RATE_LIMITS: 'true', TRUST_PROXY: '0' } })
    for (let i = 0; i < 5; i += 1) expect((await as(`192.0.2.${i + 1}`, i)).status).toBe(201)
    expect((await as('192.0.2.200', 9)).status).toBe(429) // five different "addresses" were all the same client
  })

  it('keeps a ceiling of 600 requests a minute per address over everything, which recovers when the minute is over', () => {
    const limiters = new Limiters(server.clock, true)
    for (let i = 0; i < 600; i += 1) limiters.check('global', '203.0.113.5')
    expect(() => limiters.check('global', '203.0.113.5')).toThrow(HttpError)
    expect(() => limiters.check('global', '203.0.113.6')).not.toThrow() // somebody else is not affected
    try {
      limiters.check('global', '203.0.113.5')
    } catch (error) {
      expect(error).toMatchObject({ status: 429, code: 'rate_limited' })
      expect(Number((error as HttpError).headers['Retry-After'])).toBeGreaterThan(0)
    }
    server.clock.advance(61_000)
    expect(() => limiters.check('global', '203.0.113.5')).not.toThrow()
    limiters.sweep()
    // Only the windows still running are remembered, so the table does not grow with every address ever seen.
    server.clock.advance(16 * 60_000)
    limiters.sweep()
    expect(Object.values((limiters as unknown as { limiters: Record<string, { size: number }> }).limiters).map((limiter) => limiter.size)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(() => new Limiters(server.clock, false).check('contact', 'x')).not.toThrow()
  })

  it('refuses a body that is too big without reading all of it, and one that is not what was declared', async () => {
    const big = JSON.stringify(contact({ message: 'x'.repeat(70_000) }))
    const response = await server.api('/api/contact', { raw: big })
    expect(response.status).toBe(413)
    expect(response.json.error.code).toBe('payload_too_large')
    const declared = await server.api('/api/contact', { raw: '{}', headers: { 'Content-Length': '99999999' } }).catch(() => ({ status: 0 }))
    expect([0, 400, 413]).toContain(declared.status)
    expect((await server.api('/api/services')).status).toBe(200) // the server is still there
    expect(counts().inquiries).toBe(0)
  })

  it('answers a body that is not an object, not JSON, or not declared as JSON with a clean error', async () => {
    const cases: [string, string, number][] = [
      ['[]', 'application/json', 400],
      ['"text"', 'application/json', 400],
      ['null', 'application/json', 400],
      ['42', 'application/json', 400],
      ['{"form":', 'application/json', 400],
      ['', 'application/json', 400],
      ['form=contact', 'application/x-www-form-urlencoded', 415],
      ['--b\r\nContent-Disposition: form-data; name="file"; filename="a.php"\r\n\r\n<?php ?>\r\n--b--', 'multipart/form-data; boundary=b', 415],
      [JSON.stringify(contact()), 'text/plain', 415],
    ]
    for (const [raw, type, status] of cases) {
      const response = await server.api('/api/contact', { raw, headers: { 'Content-Type': type } })
      expect(response.status, `${type} ${raw.slice(0, 20)}`).toBe(status)
      expect(response.json.error.requestId).toBeTruthy()
    }
    const nested = await server.api('/api/contact', { raw: '['.repeat(60_000) })
    expect(nested.status).toBe(400)
    expect(counts().inquiries).toBe(0)
    expect((await server.api('/api/contact', { body: contact() })).status).toBe(201) // and the server carried on
  })

  it('ignores a field that tries to change the shape of an object, and refuses a field it does not know', async () => {
    const polluted = JSON.parse(`{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "form": "contact", "language": "en", "kind": "project", "name": "Anna Kovács", "email": "anna@example.com", "subject": "A new website", "message": "I would like a small website for my bakery.", "consent": true}`)
    const response = await server.api('/api/contact', { body: polluted })
    expect([201, 422]).toContain(response.status)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    const extra = await server.api('/api/contact', { body: contact({ status: 'answered', id: 'chosen-by-the-visitor', created_at: '2001-01-01T00:00:00Z', ip_hash: 'x', archived_at: '2001-01-01T00:00:00Z' }) })
    if (extra.status === 201) {
      const row = server.db.get<{ id: string; status: string; archived_at: string | null; created_at: string }>('SELECT id, status, archived_at, created_at FROM inquiries')!
      expect(row.status).toBe('new')
      expect(row.id).not.toBe('chosen-by-the-visitor')
      expect(row.archived_at).toBeNull()
      expect(row.created_at).toBe(server.clock.now().toISOString())
    } else {
      expect(extra.status).toBe(422)
      expect(extra.json.error.details.fields).toBeTruthy()
    }
  })

  it('ignores a request header that asks for another method, and refuses an oversize address or header block', async () => {
    const override = await server.api('/api/services', { headers: { 'X-HTTP-Method-Override': 'DELETE', 'X-Method-Override': 'DELETE' } })
    expect(override.status).toBe(200)
    expect((await server.fetch(`/api/services/${'a'.repeat(3000)}`)).status).toBe(414)
    const huge = await server.fetch('/api/services', { headers: { 'X-Padding': 'x'.repeat(20_000) } }).catch(() => null)
    expect(huge === null || huge.status === 431).toBe(true)
    expect((await server.api('/api/services')).status).toBe(200)
  })

  it('accepts no file upload anywhere: no route reads multipart data', async () => {
    const admin = await server.signIn()
    for (const [path, headers] of [
      ['/api/contact', {}],
      ['/api/quote-requests', {}],
      ['/api/admin/services', { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }],
    ] as const) {
      const response = await server.fetch(path, { method: 'POST', headers: { ...headers, 'Content-Type': 'multipart/form-data; boundary=b' }, body: '--b--' })
      expect(response.status, path).toBe(415)
    }
    expect(readdirSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src')).includes('uploads')).toBe(false)
  })
})

describe('errors', () => {
  it('are one envelope with a code, a message a person can read and a request id, and nothing about the server', async () => {
    const cases: [string, string | undefined, number, string][] = [
      ['/api/nothing-here', undefined, 404, 'not_found'],
      ['/api/services/missing', undefined, 404, 'not_found'],
      ['/api/contact', undefined, 405, 'method_not_allowed'],
      ['/api/admin/inquiries', undefined, 401, 'unauthorized'],
      ['/api/services?lang=xx', undefined, 422, 'validation_failed'],
    ]
    for (const [path, , status, code] of cases) {
      const response = await server.api(path)
      expect(response.status, path).toBe(status)
      expect(response.json.error, path).toMatchObject({ code, message: expect.any(String), requestId: response.headers.get('x-request-id') })
      expect(response.text, path).not.toMatch(/\bat .+\(.+:\d+:\d+\)|node:|node_modules|server[\\/]src|\.ts:\d+|Error:|sqlite/i)
    }
    expect((await server.api('/api/contact')).headers.get('allow')).toContain('POST')
  })

  it('never show a visitor what went wrong inside: a failure is a generic 500, logged without the visitor\'s data', async () => {
    const original = server.db.all.bind(server.db)
    server.db.all = () => {
      throw new Error('boom: /srv/app/data/app.sqlite near "SELECT" for private.person@example.com')
    }
    const response = await server.api('/api/services', { headers: { 'X-Request-Id': 'trace-me-12345' } })
    expect(response.status).toBe(500)
    expect(response.json.error).toEqual({ code: 'internal_error', message: 'Something went wrong on our side.', requestId: 'trace-me-12345' })
    expect(response.text).not.toMatch(/boom|srv|sqlite|private\.person/)
    const logged = server.logs.join('\n')
    expect(logged).toContain('unhandled error')
    expect(logged).toContain('trace-me-12345')
    expect(logged).not.toContain('private.person@example.com') // an address in an error message is masked before it is written
    server.db.all = original
    expect((await server.api('/api/services')).status).toBe(200)
    expect(server.app.context.stats.serverErrors).toBe(1)
  })

  it('use the request id the caller sent only if it is plain, so a log line cannot be forged with it', async () => {
    expect((await server.api('/api/health', { headers: { 'X-Request-Id': 'abc-12345678' } })).headers.get('x-request-id')).toBe('abc-12345678')
    for (const id of ['short', 'has space in it', 'x'.repeat(100), '<script>alert(1)', 'a=b&c=d request', '{"level":"error"}']) {
      const used = (await server.api('/api/health', { headers: { 'X-Request-Id': id } })).headers.get('x-request-id')
      expect(used, id).not.toBe(id)
      expect(used, id).toMatch(/^[0-9a-f-]{36}$/)
    }
  })
})

describe('what is kept out of the logs and the answers', () => {
  it('holds no password, token, secret, address or message text', async () => {
    const response = await server.api('/api/contact', { body: contact({ name: 'Private Person', email: 'private.person@example.com', message: 'A confidential sentence about my business plans.' }) })
    await server.api('/api/quote-requests', { body: quote({ email: 'private.person@example.com', description: 'Another confidential sentence about plans.' }) })
    const admin = await server.signIn('admin', 'admin@site.test')
    await server.api('/api/admin/login', { body: { email: 'admin@site.test', password: 'a wrong password 12345' } })
    await server.api('/api/admin/inquiries', { headers: { Cookie: admin.cookie } })
    await server.api(`/api/admin/inquiries/${server.db.get<{ id: string }>('SELECT id FROM inquiries')!.id}`, { method: 'PATCH', body: { status: 'closed', notify: true, note: 'A note for the customer.' }, headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf } })
    await new Promise((resolve) => setImmediate(resolve))
    await server.app.context.notifier.processDue()
    const logged = server.logs.join('\n')
    expect(logged.length).toBeGreaterThan(200) // there is something to look at
    for (const secret of [GOOD_PASSWORD, 'a wrong password 12345', admin.cookie.split('=')[1], admin.csrf, server.config.appSecret, 'private.person@example.com', 'Private Person', 'confidential sentence', 'A note for the customer.', response.json.data.reference]) {
      expect(logged, secret).not.toContain(secret)
    }
    expect(logged).not.toMatch(/"(password|token|secret|cookie|authorization)"/i)
  })

  it('answers a visitor with a reference and a status, and nothing that was stored about them', async () => {
    const response = await server.api('/api/contact', { body: contact() })
    expect(Object.keys(response.json.data).sort()).toEqual(['createdAt', 'reference', 'status'])
    expect(response.text).not.toMatch(/anna|example\.com|bakery|ip_hash|content_hash|"id"/i)
    const quoted = await server.api('/api/quote-requests', { body: quote() })
    expect(Object.keys(quoted.json.data).sort()).toEqual(['createdAt', 'pricing', 'reference', 'status'])
    for (const path of ['/api/health', '/api/ready']) {
      const probe = await server.api(path)
      expect(probe.text, path).not.toMatch(/secret|password|\.sqlite|:memory:|smtp|owner@site\.test|C:\\|\/home\//i)
    }
  })

  it('keeps only a keyed hash of an address, and a token only as its hash', async () => {
    await server.api('/api/contact', { body: contact() })
    const admin = await server.signIn()
    const stored = JSON.stringify([...server.db.all('SELECT * FROM inquiries'), ...server.db.all('SELECT * FROM admin_sessions'), ...server.db.all('SELECT * FROM audit_log')])
    expect(stored).not.toContain('127.0.0.1')
    expect(stored).not.toContain(admin.cookie.split('=')[1])
    const hash = server.db.get<{ ip_hash: string }>('SELECT ip_hash FROM inquiries')!.ip_hash
    expect(hash).toMatch(/^[0-9a-f]{32}$/) // 128 bits of an HMAC: enough to count a client, useless for finding one
  })
})

describe('serving the website from the same process', () => {
  const site = () => {
    const root = scratch()
    const dist = join(root, 'dist')
    mkdirSync(join(dist, 'hu'), { recursive: true })
    mkdirSync(join(dist, 'assets'))
    mkdirSync(join(dist, '.git'))
    mkdirSync(join(dist, '.well-known'))
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>Home</title>')
    writeFileSync(join(dist, 'hu', 'index.html'), '<!doctype html><title>Magyar</title>')
    writeFileSync(join(dist, '404.html'), '<!doctype html><title>Not found</title>')
    writeFileSync(join(dist, 'admin.html'), '<!doctype html><title>Administration</title><div id="root"></div>')
    writeFileSync(join(dist, 'assets', 'app.js'), 'console.log(1)')
    writeFileSync(join(dist, 'assets', 'dump.sqlite'), 'SQLite format 3 and secrets')
    writeFileSync(join(dist, '.env'), 'APP_SECRET=do-not-serve')
    writeFileSync(join(dist, '.git', 'config'), '[core]')
    writeFileSync(join(dist, '.well-known', 'security.txt'), 'Contact: mailto:owner@site.test')
    writeFileSync(join(dist, '_headers'), "/*\n  Content-Security-Policy: default-src 'self'\n  X-Frame-Options: DENY\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n")
    writeFileSync(join(root, 'outside-secret.txt'), 'TOP SECRET OUTSIDE THE SITE')
    return { root, dist }
  }
  const serve = async (dist: string) => {
    await server.close()
    server = await startServer({ env: { STATIC_DIR: dist } })
  }

  it('serves pages, assets and its own 404 page, with the headers the build asked for', async () => {
    const { dist } = site()
    await serve(dist)
    const home = await server.fetch('/')
    expect(home.status).toBe(200)
    expect(await home.text()).toContain('<title>Home</title>')
    expect(home.headers.get('content-security-policy')).toBe("default-src 'self'") // the site's policy, not the API's
    expect((await server.fetch('/hu/')).status).toBe(200)
    expect((await server.fetch('/hu')).status).toBe(301)
    const asset = await server.fetch('/assets/app.js')
    expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    const missing = await server.fetch('/no/such/page')
    expect(missing.status).toBe(404)
    expect(await missing.text()).toContain('Not found')
    expect((await server.fetch('/', { method: 'HEAD' })).status).toBe(200)
    expect((await server.fetch('/', { method: 'POST' })).status).toBe(405)
  })

  it('does not let an address leave the folder, however it is written', async () => {
    const { dist } = site()
    await serve(dist)
    const attempts = ['/../outside-secret.txt', '/%2e%2e/outside-secret.txt', '/..%2foutside-secret.txt', '/%2e%2e%2foutside-secret.txt', '/..\\outside-secret.txt', '/assets/../../outside-secret.txt', '/%252e%252e/outside-secret.txt', '/....//outside-secret.txt', '/assets/..%5c..%5coutside-secret.txt', '/index.html%00.png', '/%00', '/..%00/outside-secret.txt']
    for (const path of attempts) {
      const response = await server.fetch(path)
      expect(await response.text(), path).not.toContain('TOP SECRET')
      expect([200, 301, 400, 404], path).toContain(response.status)
    }
    expect((await server.fetch('/%')).status).not.toBe(500)
  })

  it('serves no hidden file, no file of a kind a website does not have, and not its own headers file', async () => {
    const { dist } = site()
    await serve(dist)
    for (const path of ['/.env', '/.git/config', '/assets/dump.sqlite', '/_headers', '/hu/.env']) {
      const response = await server.fetch(path)
      const text = await response.text()
      expect(text, path).not.toMatch(/do-not-serve|\[core\]|SQLite format|default-src 'self'\n/)
      expect(response.status, path).toBe(404)
    }
    expect(await (await server.fetch('/.well-known/security.txt')).text()).toContain('Contact:') // the one hidden folder that belongs on a website
  })

  it('never lets the website fall-through answer an API or admin address', async () => {
    const { dist } = site()
    await serve(dist)
    const api = await server.api('/api/no-such-thing')
    expect(api.status).toBe(404)
    expect(api.json.error.code).toBe('not_found')
    // `/admin` and everything under it is the administration application, never the website's pages or its 404.
    for (const path of ['/admin', '/admin/', '/admin/inquiries', '/admin/inquiries/some-id', '/admin/translations?lang=nl']) {
      const admin = await server.fetch(path)
      expect(admin.status, path).toBe(200)
      expect(await admin.text(), path).toContain('<title>Administration</title>')
      expect(admin.headers.get('content-security-policy'), path).toContain("script-src 'self'")
      expect(admin.headers.get('cache-control'), path).toBe('no-store')
      expect(admin.headers.get('x-robots-tag'), path).toBe('noindex, nofollow')
    }
    // The shell is not also a page of the website (which would carry the website's policy and could be indexed).
    expect((await server.fetch('/admin.html')).status).toBe(404)
    expect((await server.fetch('/admin', { method: 'POST' })).status).toBe(404)
    expect((await server.api('/api/services')).status).toBe(200)
    expect((await server.api('/api/admin/session')).status).toBe(401)
  })

  it('says so, plainly, when the administration has not been built into the folder it serves', async () => {
    const { dist } = site()
    rmSync(join(dist, 'admin.html'))
    await serve(dist)
    const notice = await server.fetch('/admin/anything')
    expect(notice.status).toBe(404)
    expect(await notice.text()).toContain('The administration is not installed')
    await server.close()
    server = await startServer() // no STATIC_DIR at all
    const none = await server.fetch('/admin')
    expect(none.status).toBe(404)
    expect(await none.text()).toContain('STATIC_DIR')
  })
})

describe('what the backend is built from', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')
  const files = (directory: string): string[] =>
    readdirSync(directory).flatMap((name) => {
      const path = join(directory, name)
      return statSync(path).isDirectory() ? files(path) : name.endsWith('.ts') ? [path] : []
    })

  // The one deliberate exception (PROMPT 16): the AI assistant is built on the Vercel AI SDK and the Anthropic provider, which
  // need zod for the tools' schemas. They are imported ONLY by modules/ai (and lazily, so a server that never answers never loads
  // them); nothing else in the backend may import any package.
  const ASSISTANT_PACKAGES = new Set(['ai', 'ai/test', '@ai-sdk/anthropic', 'zod'])

  it('imports nothing but Node\'s own modules and its own files: no package to be compromised, no package to update (the assistant\'s three are the one exception, and only inside modules/ai)', () => {
    const offenders: string[] = []
    for (const file of files(root)) {
      const source = readFileSync(file, 'utf8')
      const inAssistant = relative(root, file).replace(/\\/g, '/').startsWith('modules/ai/')
      for (const match of source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"\n;]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const target = match[1] ?? match[2] ?? match[3]
        if (!target.startsWith('node:') && !target.startsWith('./') && !target.startsWith('../') && !(inAssistant && ASSISTANT_PACKAGES.has(target))) offenders.push(`${relative(root, file)} -> ${target}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('has no code that runs a string as code or a shell, and builds no SQL from a value', () => {
    const offenders: string[] = []
    for (const file of files(root)) {
      const source = readFileSync(file, 'utf8')
      const where = relative(root, file)
      if (/\beval\s*\(|new Function\s*\(|child_process|\bexecSync\b|\bspawnSync\b/.test(source)) offenders.push(`${where}: runs code or a shell`)
      // `db.run(`...${value}...`)`: a template literal with an interpolation passed straight to the database.
      for (const match of source.matchAll(/\.(?:run|get|all|exec)\(\s*`([^`]*)`/g)) {
        if (/\$\{/.test(match[1]) && !/\$\{(sql|where|clauses|order|placeholders|columns)\b/.test(match[1])) offenders.push(`${where}: SQL with an interpolation: ${match[1].slice(0, 60)}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
