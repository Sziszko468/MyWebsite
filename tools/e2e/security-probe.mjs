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
import { deflateSync } from 'node:zlib'

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
  // The portfolio's content management (PROMPT 13.1)
  '/api/admin/projects', '/api/admin/projects/:id', '/api/admin/projects/:id/preview', '/api/admin/projects/:id/duplicate', '/api/admin/projects/:id/publish',
  '/api/admin/projects/:id/unpublish', '/api/admin/projects/:id/archive', '/api/admin/projects/:id/restore', '/api/admin/project-settings', '/api/admin/project-order',
  '/api/admin/project-preview', '/api/admin/media', '/api/admin/media/:id', '/api/admin/texts', '/api/admin/texts/:key',
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
for (const path of ['/api/services', '/api/packages', '/api/shop/catalog', '/api/shop/categories', '/api/shop/extras', '/api/content/faq', '/api/projects', '/api/projects/spendly', '/api/texts', '/api/health', '/api/ready']) {
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
  // ---- the portfolio's content management (PROMPT 13.1) ----
  console.log('\n6b. Content management: pictures, projects and wording, as a signed-in administrator')
  const signed = (method, path, { body, raw, type, headers = {} } = {}) =>
    call(path, { method, raw, body, headers: { Cookie: cookie, Origin: BASE, 'X-CSRF-Token': csrfFromSession ?? '', ...(type ? { 'Content-Type': type } : {}), ...headers } })
  const png = (width, height, extra = Buffer.alloc(0)) => {
    const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
    const crc = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = table[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
    const chunk = (kind, data) => { const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const body = Buffer.concat([Buffer.from(kind), data]); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body)); return Buffer.concat([length, body, sum]) }
    const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2
    const rows = []
    for (let y = 0; y < Math.min(height, 16); y += 1) rows.push(Buffer.concat([Buffer.from([0]), Buffer.alloc(Math.min(width, 16) * 3, y * 9 + 40)]))
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)), extra])
  }
  const tiny = png(16, 16)
  const upload = (name, buffer, type = 'image/png', extra = {}) => signed('POST', `/api/admin/media?name=${encodeURIComponent(name)}`, { raw: buffer, type, ...extra })

  const good = await upload('probe.png', tiny)
  check('a real picture is accepted (201) and described, with no path on the server', good.status === 201 && good.data?.data?.mime === 'image/png' && !/[A-Za-z]:\\|\/home\/|\/tmp\//.test(good.text), `status ${good.status}`)
  const src = good.data?.data?.src
  if (src) {
    const served = await call(src)
    check('the uploaded picture is served as an image, never sniffed, never as a page', served.status === 200 && /^image\/png/.test(served.headers.get('content-type') ?? '') && /nosniff/i.test(served.headers.get('x-content-type-options') ?? '') && /sandbox/.test(served.headers.get('content-security-policy') ?? ''), `${served.headers.get('content-type')} / ${served.headers.get('content-security-policy')}`)
    check('the file name is its content hash (not what the uploader called it), and it can be cached for good', /^\/media\/[0-9a-f]{16,}\.png$/.test(src) && /immutable/.test(served.headers.get('cache-control') ?? ''), src)
    const twice = await upload('another-name.png', tiny)
    check('the same bytes uploaded again are stored once', twice.status === 201 && twice.data?.data?.src === src, twice.data?.data?.src)
  }
  const refusals = [
    ['an HTML page claiming to be a PNG', upload('page.png', Buffer.from('<!doctype html><script>alert(1)</script>'), 'image/png'), [400, 415, 422]],
    ['an SVG (it can carry script)', upload('x.svg', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml'), [415]],
    ['a page sent as text/html', upload('x.html', Buffer.from('<h1>hi</h1>'), 'text/html'), [415]],
    ['a JPEG announced as a PNG', upload('lie.png', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]), 'image/png'), [400, 415, 422]],
    ['a picture of 20000 x 20000 pixels', upload('huge.png', png(20000, 20000)), [400, 413, 422]],
    ['an empty body', upload('empty.png', Buffer.alloc(0)), [400, 413, 415, 422]],
    ['more bytes than the limit', upload('big.png', Buffer.concat([tiny, Buffer.alloc(26 * 1024 * 1024)])), [413]],
  ]
  for (const [name, pending, allowed] of refusals) {
    const r = await pending
    check(`${name} is refused (${allowed.join('/')})`, allowed.includes(r.status) && !/stack|SQLITE|\.ts:\d+/i.test(r.text), `status ${r.status}`)
  }
  const polyglot = await upload('polyglot.png', png(16, 16, Buffer.from('<script>alert(1)</script>')))
  if (polyglot.status === 201) {
    const served = await call(polyglot.data.data.src)
    check('a picture with a script glued on is at worst an inert image (type, nosniff and sandbox hold)', /^image\/png/.test(served.headers.get('content-type') ?? '') && /nosniff/i.test(served.headers.get('x-content-type-options') ?? '') && /sandbox/.test(served.headers.get('content-security-policy') ?? ''))
  } else {
    check('a picture with a script glued on is refused or stored inert', [400, 415, 422].includes(polyglot.status), `status ${polyglot.status}`)
  }
  for (const bad of ['../app.sqlite', '..%2fapp.sqlite', '%2e%2e%2f%2e%2e%2fetc%2fpasswd', '....//....//x', 'a.png%00.html', 'A.PNG', '0000.png', '.png', encodeURIComponent('..\\app.sqlite')]) {
    const r = await call(`/media/${bad}`)
    check(`/media/${bad.slice(0, 28)} is a plain 404 (no file outside the picture folder is reachable)`, [400, 404].includes(r.status) && !/SQLite format|root:|stack/i.test(r.text), `status ${r.status}`)
  }
  const uploadNoToken = await call('/api/admin/media?name=x.png', { method: 'POST', raw: tiny, headers: { Cookie: cookie, Origin: BASE, 'Content-Type': 'image/png' } })
  check('an upload without the CSRF token is refused', uploadNoToken.status === 403, `status ${uploadNoToken.status}`)
  const foreignUpload = await call('/api/admin/media?name=x.png', { method: 'POST', raw: tiny, headers: { Cookie: cookie, Origin: 'https://evil.example', 'X-CSRF-Token': csrfFromSession ?? '', 'Content-Type': 'image/png' } })
  check('an upload from a foreign origin is refused even with the token', foreignUpload.status === 403, `status ${foreignUpload.status}`)

  const slug = `probe-${marker}`
  const hostileTitle = '<img src=x onerror=alert(1)> "quoted" \' and =cmd|calc'
  const content = (title) => ({ title: { hu: title, en: title, nl: title }, cardDescription: { hu: '', en: '', nl: '' }, summary: { hu: '', en: '', nl: '' } })
  const created = await signed('POST', '/api/admin/projects', { body: { slug, category: 'apps', content: content(hostileTitle) } })
  check('a draft with hostile text in its title is stored as text, exactly as sent', created.status === 201 && created.data?.data?.content?.title?.en === hostileTitle, `status ${created.status}`)
  const projectId = created.data?.data?.id
  check('the draft is invisible to the public API, the list and the sitemap', (await call(`/api/projects/${slug}`)).status === 404 && !(await call('/api/projects')).text.includes(slug) && !(await call('/sitemap.xml')).text.includes(slug))
  for (const bad of ['', 'Has Capitals', 'a/b', '../x', 'a b', 'admin', 'api', 'new', 'preview', 'x'.repeat(200)]) {
    const r = await signed('POST', '/api/admin/projects', { body: { slug: bad, category: 'apps', content: content('x') } })
    check(`the address "${bad.slice(0, 24)}" is refused with a field error`, r.status === 422 && !/stack|SQLITE/i.test(r.text), `status ${r.status}`)
    if (r.status === 201) await signed('DELETE', `/api/admin/projects/${r.data?.data?.id}`)
  }
  const links = await signed('PUT', `/api/admin/projects/${projectId}`, { body: { slug, category: 'apps', content: { ...content(hostileTitle), links: { demo: { url: 'javascript:alert(1)', verified: true } } }, expectedUpdatedAt: created.data?.data?.updatedAt } })
  check('a javascript: address is refused as an external link', links.status === 422, `status ${links.status}`)
  const unknownCategory = await signed('POST', '/api/admin/projects', { body: { slug: `${slug}-c`, category: 'nonsense', content: content('x') } })
  check('an unknown category is refused', unknownCategory.status === 422, `status ${unknownCategory.status}`)
  const notNumber = await signed('GET', "/api/admin/projects/1%20OR%201=1")
  check('a project id that is not a number is a clean 404', notNumber.status === 404 && !/SQLITE/i.test(notNumber.text), `status ${notNumber.status}`)
  const early = await signed('POST', `/api/admin/projects/${projectId}/publish`, { body: {} })
  check('publishing a project that lacks required content is refused (422) and it stays out of the public list', early.status === 422 && !(await call('/api/projects')).text.includes(slug), `status ${early.status}`)
  const previewOpen = await call(`/api/admin/projects/${projectId}/preview`)
  check('the preview of a draft needs a session (401 without one)', previewOpen.status === 401, `status ${previewOpen.status}`)
  const previewPage = await call(`/en/work/preview/${projectId}/`)
  check('the preview page is served as an application shell that carries no project data and is not indexable', !previewPage.text.includes(slug) && !previewPage.text.includes('onerror=alert') && /noindex/i.test(previewPage.text + (previewPage.headers.get('x-robots-tag') ?? '')), `status ${previewPage.status}`)

  const texts = await signed('GET', '/api/admin/texts')
  const keys = texts.data?.data?.keys ?? []
  const firstKey = keys[0]?.key
  check('the list of changeable wording is served to the administrator', texts.status === 200 && typeof firstKey === 'string', `status ${texts.status}, ${keys.length} keys`)
  const unknownText = await signed('PUT', `/api/admin/texts/${encodeURIComponent('dict.' + 'not.a.key.' + marker)}`, { body: { values: { hu: 'x', en: 'x', nl: 'x' } } })
  check('a wording key the website does not have cannot be created', [404, 422].includes(unknownText.status), `status ${unknownText.status}`)
  const tooLong = await signed('PUT', `/api/admin/texts/${encodeURIComponent(firstKey ?? 'x')}`, { body: { values: { hu: 'x'.repeat(5000), en: '', nl: '' } } })
  check('a wording of 5000 characters is refused', tooLong.status === 422, `status ${tooLong.status}`)
  const publicTexts = await call('/api/texts')
  check('the public wording carries nothing but wording', publicTexts.status === 200 && !FORBIDDEN.test(publicTexts.text), `status ${publicTexts.status}`)

  if (projectId) {
    const gone = await signed('DELETE', `/api/admin/projects/${projectId}`)
    check('the probe project is deleted again', gone.status === 204 || gone.status === 200, `status ${gone.status}`)
  }
  if (src) {
    const used = await signed('GET', '/api/admin/media')
    const mine = (used.data?.data ?? []).find((item) => item.src === src)
    if (mine) check('a picture nothing uses can be deleted, and then its address is gone', (await signed('DELETE', `/api/admin/media/${mine.id}`)).status === 204 && (await call(src)).status === 404)
  }
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
