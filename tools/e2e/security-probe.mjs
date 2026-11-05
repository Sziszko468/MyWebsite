#!/usr/bin/env node
/**
 * Security probe (PROMPT 15, phase 14): what an outsider and a signed-in administrator can and cannot do against a RUNNING
 * server, with plain HTTP and no browser. It complements the backend's own tests (server/test/security.test.ts,
 * auth.test.ts, admin-contract.test.ts), which run in-process; this one asks the real process over a real socket.
 *
 *   node tools/e2e/security-probe.mjs --base=http://127.0.0.1:8788 --email=<admin> --password=<password>
 *
 * Use a THROW-AWAY server and database: the probe creates a few inquiries (some with hostile text) and signs in once.
 * Restart the server before a run to clear its in-memory rate limits. Exit status 1 when any check fails.
 */
const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')).map(([k, ...v]) => [k, v.join('=') || '1']))
const BASE = (args.base || 'http://127.0.0.1:8788').replace(/\/$/, '')
const results = []
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` -- ${detail}` : ''}`)
}
const hostile = (value) => JSON.stringify(value)
const call = async (path, { method = 'GET', headers = {}, body, raw } = {}) => {
  const response = await fetch(BASE + path, { method, headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined), redirect: 'manual' })
  const text = await response.text()
  let data = null
  try { data = JSON.parse(text) } catch { /* not JSON */ }
  return { status: response.status, headers: response.headers, text, data }
}

console.log(`\nSecurity probe against ${BASE}`)

// ---------------------------------------------------------------------------------------------------------------
console.log('\n1. Nothing of the administration answers without a session')
// Every route of the administration's API (server/src/modules/admin/routes.ts), with placeholders filled in, tried with every
// method. Without a session each must answer 401 (or 404/405 for a method the route does not have): never 2xx, never a redirect, never 5xx.
const ADMIN_ROUTES = [
  '/api/admin/account/password', '/api/admin/content', '/api/admin/content/:type/:slug', '/api/admin/dashboard', '/api/admin/extras', '/api/admin/extras/:code',
  '/api/admin/inquiries', '/api/admin/inquiries/:id', '/api/admin/notifications', '/api/admin/notifications/checks', '/api/admin/notifications/deliveries/:id/retry',
  '/api/admin/notifications/preferences', '/api/admin/notifications/test', '/api/admin/order/:kind', '/api/admin/packages', '/api/admin/packages/:code',
  '/api/admin/quote-requests', '/api/admin/quote-requests/:id', '/api/admin/quote-requests/:id/export', '/api/admin/quote-requests/:id/export.json',
  '/api/admin/quote-requests/export.csv', '/api/admin/services', '/api/admin/services/:slug', '/api/admin/session', '/api/admin/sessions', '/api/admin/sessions/:id',
  '/api/admin/sessions/revoke-others', '/api/admin/settings', '/api/admin/settings/preferences', '/api/admin/system', '/api/admin/system/maintenance',
  '/api/admin/system/publish', '/api/admin/translations', '/api/admin/translations/:group/:key/:lang',
]
const FILL = { ':id': '00000000-0000-0000-0000-000000000000', ':code': 'launch', ':slug': 'website', ':type': 'faq', ':group': 'services', ':key': 'website', ':lang': 'en', ':kind': 'services' }
let exposed = []
let tried = 0
for (const route of ADMIN_ROUTES) {
  const path = route.replace(/:[a-z]+/g, (token) => FILL[token] ?? 'x')
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const r = await call(path, { method, body: method === 'GET' ? undefined : {} })
    tried += 1
    if (![401, 404, 405].includes(r.status)) exposed.push(`${method} ${route} -> ${r.status}`)
  }
}
check(`${ADMIN_ROUTES.length} admin routes x 5 methods (${tried} calls) without a session: only 401, 404 or 405`, exposed.length === 0, exposed.slice(0, 4).join('; '))
const unknown = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: 'nobody@example.test', password: 'wrong-password-1' }) })
const unknownBody = await unknown.text()
const wrong = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: args.email || 'admin@example.test', password: 'wrong-password-2' }) })
const wrongBody = await wrong.text()
const strip = (text) => text.replace(/"requestId":"[^"]+"/, '')
check('a wrong password and an unknown account get the same refusal (no account enumeration)', unknown.status === wrong.status && [400, 401].includes(unknown.status) && strip(unknownBody) === strip(wrongBody), `status ${unknown.status}/${wrong.status}`)
const app = await call('/admin')
check('/admin serves the application shell with its own policy, no caching, no indexing', app.status === 200 && /default-src 'none'/.test(app.headers.get('content-security-policy') ?? '') && /no-store/.test(app.headers.get('cache-control') ?? '') && /noindex/.test(app.headers.get('x-robots-tag') ?? ''))
check('/admin.html is not a page of the website', (await call('/admin.html')).status === 404)

// ---------------------------------------------------------------------------------------------------------------
console.log('\n2. Public endpoints never expose private or administrative data')
const FORBIDDEN = /("|\b)(password|passwd|secret|token|csrf|ip_hash|content_hash|session|smtp|api_?key|notify_?to|owner|private)("|\b)\s*:/i
for (const path of ['/api/services', '/api/packages', '/api/shop/catalog', '/api/shop/categories', '/api/shop/extras', '/api/content/faq', '/api/health', '/api/ready']) {
  const r = await call(path)
  check(`GET ${path} answers and carries no private field`, (r.status === 200 || r.status === 503) && !FORBIDDEN.test(r.text) && !/@/.test(r.text.replace(/[\w.-]+@example\.(test|com)/g, '')), `status ${r.status}, ${r.text.length} bytes`)
}
const health = await call('/api/health')
check('/api/health does not reveal configuration or versions beyond "ok"', health.status === 200 && Object.keys(health.data ?? {}).length <= 4, health.text.slice(0, 80))

// ---------------------------------------------------------------------------------------------------------------
console.log('\n3. Hostile text is stored as text')
const payloads = [
  { subject: '<script>window.__x=1</script>', message: '<img src=x onerror=alert(1)> and a long enough message to pass the length rule.' },
  { subject: "Robert'); DROP TABLE inquiries;--", message: "'; DELETE FROM inquiries; -- plus enough words to be a message of normal size." },
  { subject: '=HYPERLINK("http://evil.example","x")', message: '+cmd|\' /C calc\'!A0 and then enough ordinary words to pass.' },
]
const marker = Date.now().toString(36)
let stored = 0
for (const [index, payload] of payloads.entries()) {
  const r = await call('/api/contact', { method: 'POST', body: { form: 'contact', language: 'en', kind: 'other', name: `Probe ${marker} ${index}`, email: `probe+${marker}${index}@example.test`, consent: true, ...payload } })
  if (r.status === 201 || r.status === 200) stored += 1
  check(`hostile payload ${index + 1} is accepted as plain text (or refused cleanly)`, [200, 201, 422, 429].includes(r.status), `status ${r.status}`)
}

// ---------------------------------------------------------------------------------------------------------------
console.log('\n4. Errors are plain and carry no internals')
const BAD = [
  ['unknown route', await call('/api/nothing-here')],
  ['malformed JSON body', await call('/api/quote-requests', { method: 'POST', raw: '{"name": ', headers: { 'Content-Type': 'application/json' } })],
  ['wrong content type', await call('/api/quote-requests', { method: 'POST', raw: 'name=x', headers: { 'Content-Type': 'text/plain' } })],
  ['wrong method', await call('/api/quote-requests', { method: 'DELETE' })],
  ['body over the limit', await call('/api/quote-requests', { method: 'POST', raw: JSON.stringify({ message: 'x'.repeat(200_000) }), headers: { 'Content-Type': 'application/json' } })],
  ['empty object', await call('/api/quote-requests', { method: 'POST', body: {} })],
]
for (const [name, r] of BAD) {
  const leaks = /\bat .*\.(ts|js):\d+|node_modules|stack|SQLITE|SELECT |INSERT |C:\\|\/home\//i.test(r.text)
  check(`${name}: ${r.status}, JSON error, no stack, path or SQL`, r.status >= 400 && r.status < 500 && !leaks && (r.data === null ? false : true), r.text.slice(0, 90).replace(/\s+/g, ' '))
}
const probeIds = ['x', '1', "' OR 1=1 --", '../../etc/passwd', '%00', '0'.repeat(500)]
for (const id of probeIds) {
  const r = await call(`/api/services/${encodeURIComponent(id)}`)
  check(`GET /api/services/${id.slice(0, 20)} is a clean 404 or 400`, [400, 404].includes(r.status) && !/SQLITE|syntax/i.test(r.text), `status ${r.status}`)
}

// ---------------------------------------------------------------------------------------------------------------
console.log('\n5. Cross-origin behaviour')
for (const origin of ['https://evil.example', 'null']) {
  const preflight = await call('/api/contact', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' } })
  const allow = preflight.headers.get('access-control-allow-origin')
  check(`a preflight from ${origin} is not granted`, allow === null || (allow !== '*' && allow !== origin), `allow-origin ${allow}`)
  const admin = await call('/api/admin/session', { headers: { Origin: origin } })
  check(`the administration API sends no CORS headers to ${origin}`, admin.headers.get('access-control-allow-origin') === null)
}

// ---------------------------------------------------------------------------------------------------------------
if (args.email && args.password) {
  console.log('\n6. Signed in: session cookie, CSRF, same-origin, and what the stored text looks like')
  const login = await fetch(`${BASE}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body: JSON.stringify({ email: args.email, password: args.password }) })
  const cookies = login.headers.getSetCookie?.() ?? []
  check('sign-in succeeds', login.status === 200, `status ${login.status}`)
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ')
  const flags = cookies.join(' | ')
  check('the session cookie is HttpOnly and SameSite=Strict', /HttpOnly/i.test(flags) && /SameSite=Strict/i.test(flags), flags.replace(/=[^;|]+/g, '=…').slice(0, 120))
  const body = await login.json().catch(() => ({}))
  const csrf = body?.data?.csrfToken ?? body?.csrfToken
  const me = await call('/api/admin/session', { headers: { Cookie: cookie } })
  check('the session is accepted with the cookie', me.status === 200, `status ${me.status}`)
  const csrfFromSession = me.data?.data?.csrfToken ?? me.data?.csrfToken ?? csrf
  const noToken = await call('/api/admin/notifications/test', { method: 'POST', headers: { Cookie: cookie, Origin: BASE }, body: {} })
  check('a state-changing call without the CSRF token is refused', noToken.status === 403, `status ${noToken.status}`)
  const foreign = await call('/api/admin/notifications/test', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://evil.example', 'X-CSRF-Token': csrfFromSession ?? 'x' }, body: {} })
  check('a state-changing call from a foreign origin is refused even with a token', foreign.status === 403, `status ${foreign.status}`)
  const list = await call('/api/admin/inquiries?pageSize=100', { headers: { Cookie: cookie } })
  const mine = (list.data?.data ?? []).filter((row) => String(row.name ?? '').startsWith(`Probe ${marker}`))
  check('the hostile messages are stored exactly as sent (not executed, not altered)', stored === 0 || (mine.length === stored && mine.some((row) => /<script>/.test(row.subject)) && mine.some((row) => /DROP TABLE/.test(row.subject))), `${mine.length}/${stored} found`)
  const after = await call('/api/admin/inquiries?pageSize=1', { headers: { Cookie: cookie } })
  check('the database is intact after the injection attempts', after.status === 200 && (after.data?.meta?.total ?? 0) >= mine.length)
  const leaked = JSON.stringify(list.data ?? {})
  check('administrative list rows carry no network-address hash or content hash', !/ip_hash|content_hash/.test(leaked))
  const wrongRole = await call('/api/admin/system', { headers: { Cookie: cookie } })
  check('the system screen answers the administrator without secrets', wrongRole.status === 200 && !/re_[A-Za-z0-9]{10,}|whsec_|APP_SECRET\s*[:=]\s*\S{8,}/.test(wrongRole.text), `status ${wrongRole.status}`)
  const out = await call('/api/admin/logout', { method: 'POST', headers: { Cookie: cookie, Origin: BASE, 'X-CSRF-Token': csrfFromSession ?? '' }, body: {} })
  const again = await call('/api/admin/session', { headers: { Cookie: cookie } })
  check('after sign-out the old cookie no longer works', out.status < 300 && again.status === 401, `logout ${out.status}, then ${again.status}`)
}

// ---------------------------------------------------------------------------------------------------------------
console.log('\n7. Rate limiting')
let limited = 0
let last = 0
for (let i = 0; i < 12; i += 1) {
  const r = await call('/api/contact', { method: 'POST', body: { form: 'contact' } })
  last = r.status
  if (r.status === 429) limited += 1
}
const retry = await call('/api/contact', { method: 'POST', body: { form: 'contact' } })
check('a burst of contact requests from one address is limited (429)', limited > 0, `${limited} of 12 limited, last ${last}`)
check('a limited answer says when to come back and keeps the JSON error shape', retry.status !== 429 || (retry.headers.get('retry-after') !== null && retry.data !== null), `retry-after ${retry.headers.get('retry-after')}`)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `, ${failed.length} FAILED` : ''}`)
process.exit(failed.length ? 1 : 0)
