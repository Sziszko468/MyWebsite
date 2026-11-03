import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contact, quote, startServer, type TestServer } from './helpers.ts'

let server: TestServer
let admin: { cookie: string; csrf: string; email: string }
beforeEach(async () => {
  server = await startServer()
  admin = await server.signIn('admin', 'admin@site.test')
})
afterEach(async () => {
  await server.close()
})

const headers = (who = admin) => ({ Cookie: who.cookie, 'X-CSRF-Token': who.csrf })
const get = (path: string) => server.api(path, { headers: { Cookie: admin.cookie } })
const send = (method: string, path: string, body?: unknown, who = admin) => server.api(path, { method, body, headers: headers(who) })
const form = (path: string, fields: Record<string, string | string[]>, csrf = admin.csrf) => {
  const params = new URLSearchParams({ _csrf: csrf })
  for (const [key, value] of Object.entries(fields)) for (const v of Array.isArray(value) ? value : [value]) params.append(key, v)
  return server.fetch(path, { method: 'POST', headers: { Cookie: admin.cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() })
}
const page = async (path: string) => {
  const response = await server.fetch(path, { headers: { Cookie: admin.cookie } })
  return { status: response.status, headers: response.headers, html: await response.text() }
}

/** Sends `count` different messages, a minute apart, and returns their ids, oldest first. */
async function messages(count: number, overrides: (i: number) => Record<string, unknown> = () => ({})): Promise<string[]> {
  for (let i = 0; i < count; i += 1) {
    const response = await server.api('/api/contact', { body: contact({ subject: `Subject number ${i}`, message: `Message body number ${i}, long enough to be accepted.`, ...overrides(i) }) })
    expect(response.status, `message ${i}`).toBe(201)
    server.clock.advance(1000) // a second apart: a different order of arrival, and the session (30 minutes idle) stays valid
  }
  return server.db.all<{ id: string }>('SELECT id FROM inquiries ORDER BY created_at, id').map((row) => row.id)
}
async function quotes(count: number, overrides: (i: number) => Record<string, unknown> = () => ({})): Promise<string[]> {
  for (let i = 0; i < count; i += 1) {
    const response = await server.api('/api/quote-requests', { body: quote({ description: `Request number ${i}: a small website with a contact form.`, ...overrides(i) }) })
    expect(response.status, `quote ${i}`).toBe(201)
    server.clock.advance(1000)
  }
  return server.db.all<{ id: string }>('SELECT id FROM quote_requests ORDER BY created_at, id').map((row) => row.id)
}

const translated = (fields: Record<string, unknown>) => ({ hu: fields, en: fields, nl: fields })
const serviceBody = (overrides: Record<string, unknown> = {}) => ({
  slug: 'consulting',
  category: 'web',
  position: 50,
  translations: translated({ title: 'Consulting', summary: 'Advice before you build.', tagline: 'Think first', overview: 'A short engagement.', features: ['A review', 'A plan'] }),
  packages: ['launch'],
  ...overrides,
})
const packageBody = (overrides: Record<string, unknown> = {}) => ({
  code: 'pilot',
  position: 50,
  needs: ['website'],
  extras: ['pages'],
  translations: translated({ name: 'Pilot', tagline: 'A first step', audience: 'Small teams', scope: 'One page', customization: 'Some', support: 'A month', priceNote: '', includes: ['One page'], fits: ['A test'], deliverables: ['The page'] }),
  ...overrides,
})
const extraBody = (overrides: Record<string, unknown> = {}) => ({
  code: 'training',
  position: 50,
  appliesTo: ['website'],
  translations: translated({ name: 'Training', summary: 'An hour of handover.' }),
  ...overrides,
})

describe('messages', () => {
  it('lists the newest first, with a page count, and never shows the fingerprints kept for spam checks', async () => {
    await messages(3)
    const list = await get('/api/admin/inquiries')
    expect(list.status).toBe(200)
    expect(list.json.meta).toEqual({ page: 1, pageSize: 25, total: 3 })
    expect(list.json.data.map((row: { subject: string }) => row.subject)).toEqual(['Subject number 2', 'Subject number 1', 'Subject number 0'])
    expect(list.json.data[0]).toMatchObject({ reference: expect.stringMatching(/^C-[A-Z0-9]{8}$/), status: 'new', email: 'anna@example.com', archived_at: null })
    expect(list.text).not.toMatch(/ip_hash|content_hash/)
  })

  it('pages through a long list', async () => {
    await messages(30)
    const first = await get('/api/admin/inquiries')
    const second = await get('/api/admin/inquiries?page=2')
    expect(first.json.data).toHaveLength(25)
    expect(second.json.data).toHaveLength(5)
    expect(second.json.meta).toEqual({ page: 2, pageSize: 25, total: 30 })
    expect(new Set([...first.json.data, ...second.json.data].map((row: { id: string }) => row.id)).size).toBe(30)
    expect((await get('/api/admin/inquiries?page=-4')).json.meta.page).toBe(1)
    expect((await get('/api/admin/inquiries?page=zzz')).json.meta.page).toBe(1)
    expect((await get('/api/admin/inquiries?page=99')).json.data).toEqual([])
  })

  it('filters by status, kind and archive, and searches names, e-mails, subjects, text and references', async () => {
    const ids = await messages(4, (i) => ({ kind: i % 2 ? 'job' : 'project', name: i === 2 ? 'Zoltán Teszt' : 'Anna Kovács', email: i === 2 ? 'zoltan@other.example' : 'anna@example.com' }))
    await send('PATCH', `/api/admin/inquiries/${ids[0]}`, { status: 'answered' })
    await send('PATCH', `/api/admin/inquiries/${ids[1]}`, { archived: true })
    const count = async (query: string) => (await get(`/api/admin/inquiries?${query}`)).json.meta.total
    expect(await count('status=answered')).toBe(1)
    expect(await count('status=new')).toBe(2)
    expect(await count('kind=job')).toBe(1) // the other job message is archived
    expect(await count('archived=only')).toBe(1)
    expect(await count('archived=all')).toBe(4)
    expect(await count('')).toBe(3)
    expect(await count('q=zolt%C3%A1n')).toBe(1)
    expect(await count('q=other.example')).toBe(1)
    expect(await count('q=number%203')).toBe(1)
    const reference = server.db.get<{ reference: string }>('SELECT reference FROM inquiries WHERE id = ?', [ids[0]])!.reference
    expect(await count(`q=${reference}`)).toBe(1)
    expect(await count('status=nonsense')).toBe(3) // an unknown filter is ignored, not an error
    // A search for a wildcard finds only the wildcard.
    expect(await count('q=%25')).toBe(0)
    expect(await count('q=_')).toBe(0)
  })

  it('shows one message with its notes, and says when there is no such message', async () => {
    const [id] = await messages(1)
    await send('PATCH', `/api/admin/inquiries/${id}`, { addNote: 'Called back, no answer.' })
    const detail = await get(`/api/admin/inquiries/${id}`)
    expect(detail.status).toBe(200)
    expect(detail.json.data).toMatchObject({ id, message: expect.stringContaining('number 0'), notes: [{ body: 'Called back, no answer.', author_email: 'admin@site.test' }] })
    const missing = await get('/api/admin/inquiries/does-not-exist')
    expect(missing.status).toBe(404)
    expect(missing.json.error.code).toBe('not_found')
  })

  it('changes the status through the whole vocabulary and refuses anything else', async () => {
    const [id] = await messages(1)
    for (const status of ['in_progress', 'answered', 'closed', 'new']) {
      const response = await send('PATCH', `/api/admin/inquiries/${id}`, { status })
      expect(response.status, status).toBe(200)
      expect(response.json.data.status).toBe(status)
      expect(response.json.meta.notification).toBe('not_requested')
    }
    for (const body of [{ status: 'done' }, { status: 4 }, { status: null }, {}, { status: 'closed', surprise: 1 }, { surprise: 1 }]) {
      const response = await send('PATCH', `/api/admin/inquiries/${id}`, body)
      expect(response.status, JSON.stringify(body)).toBe(422)
    }
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('new')
    expect((await send('PATCH', '/api/admin/inquiries/nope', { status: 'closed' })).status).toBe(404)
    expect((await server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', raw: '', headers: headers() })).status).toBe(400)
    expect((await server.api(`/api/admin/inquiries/${id}`, { method: 'PATCH', raw: '{not json', headers: headers() })).status).toBe(400)
    expect((await send('PATCH', `/api/admin/inquiries/${id}`, undefined)).status).toBe(415) // no JSON content type at all
  })

  it('keeps notes, with limits, and records who wrote them', async () => {
    const [id] = await messages(1)
    expect((await send('PATCH', `/api/admin/inquiries/${id}`, { addNote: '   ' })).json.error.details.fields.note).toBe('required')
    expect((await send('PATCH', `/api/admin/inquiries/${id}`, { addNote: 'x'.repeat(2001) })).json.error.details.fields.note).toBe('tooLong')
    expect((await send('PATCH', `/api/admin/inquiries/${id}`, { addNote: 42 })).status).toBe(422)
    expect((await send('PATCH', `/api/admin/inquiries/${id}`, { addNote: 'x'.repeat(2000) })).status).toBe(200)
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiry_notes')).toEqual({ n: 1 })
  })

  it('archives and restores without losing anything', async () => {
    const [id] = await messages(1)
    const archived = await send('PATCH', `/api/admin/inquiries/${id}`, { archived: true })
    expect(archived.json.data.archived_at).toBe(server.clock.now().toISOString())
    expect((await get('/api/admin/inquiries')).json.data).toEqual([])
    expect((await get('/api/admin/inquiries?archived=only')).json.data).toHaveLength(1)
    expect((await send('PATCH', `/api/admin/inquiries/${id}`, { archived: false })).json.data.archived_at).toBeNull()
    expect((await get('/api/admin/inquiries')).json.data).toHaveLength(1)
    expect((await send('PATCH', '/api/admin/inquiries/nope', { archived: true })).status).toBe(404)
  })

  it('deletes one message for good, with its notes and its queued e-mails, and nothing else', async () => {
    const [first, second] = await messages(2)
    await send('PATCH', `/api/admin/inquiries/${first}`, { addNote: 'to be removed with it' })
    const before = server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM email_deliveries WHERE related_id = ?", [first])!.n
    expect(before).toBeGreaterThan(0)
    expect((await send('DELETE', `/api/admin/inquiries/${first}`)).status).toBe(204)
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 1 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiry_notes')).toEqual({ n: 0 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM email_deliveries WHERE related_id = ?', [first])).toEqual({ n: 0 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM email_deliveries WHERE related_id = ?', [second])!.n).toBeGreaterThan(0)
    expect((await send('DELETE', `/api/admin/inquiries/${first}`)).status).toBe(404)
  })

  it('e-mails the customer about a status change only when asked, and only if e-mail is on', async () => {
    const [id] = await messages(1)
    server.db.run("DELETE FROM email_deliveries")
    const quiet = await send('PATCH', `/api/admin/inquiries/${id}`, { status: 'answered' })
    expect(quiet.json.meta.notification).toBe('not_requested')
    expect(server.db.get('SELECT COUNT(*) AS n FROM email_deliveries')).toEqual({ n: 0 })
    const loud = await send('PATCH', `/api/admin/inquiries/${id}`, { status: 'closed', notify: true, note: 'Thank you for waiting.' })
    expect(loud.json.meta.notification).toBe('queued')
    expect(server.db.all('SELECT kind, recipient, related_type, note FROM email_deliveries')).toEqual([
      { kind: 'inquiry_status', recipient: 'anna@example.com', related_type: 'inquiry', note: 'Thank you for waiting.' },
    ])
    await server.close()
    server = await startServer({ env: { EMAIL_PROVIDER: 'none' }, mailer: null })
    admin = await server.signIn('admin', 'admin@site.test')
    const [other] = await messages(1)
    const off = await send('PATCH', `/api/admin/inquiries/${other}`, { status: 'closed', notify: true })
    expect(off.status).toBe(200)
    expect(off.json.meta.notification).toBe('off')
    expect(server.db.get('SELECT COUNT(*) AS n FROM email_deliveries')).toEqual({ n: 0 })
  })

  it('writes every change into the audit log, with who did it, and no message text', async () => {
    const [id] = await messages(1, () => ({ message: 'A private sentence that must not be copied into the audit log.' }))
    await send('PATCH', `/api/admin/inquiries/${id}`, { status: 'closed' })
    await send('PATCH', `/api/admin/inquiries/${id}`, { addNote: 'A private note.' })
    await send('DELETE', `/api/admin/inquiries/${id}`)
    const rows = server.db.all<{ action: string; entity_id: string; email: string; detail: string | null }>('SELECT a.action, a.entity_id, u.email, a.detail FROM audit_log a JOIN admin_users u ON u.id = a.actor_id ORDER BY a.id')
    expect(rows.map((row) => row.action)).toEqual(expect.arrayContaining(['admin.login', 'inquiry.status', 'inquiry.note', 'inquiry.delete']))
    expect(rows.every((row) => row.email === 'admin@site.test')).toBe(true)
    expect(JSON.stringify(rows)).not.toMatch(/private/i)
  })
})

describe('quote requests', () => {
  it('lists them with filters and search, and shows one with its items, prices at the time and notes', async () => {
    const ids = await quotes(3, (i) => ({ name: i === 1 ? 'Béla Minta' : 'Anna Kovács', email: i === 1 ? 'bela@company.example' : 'anna@example.com' }))
    const list = await get('/api/admin/quote-requests')
    expect(list.json.meta).toEqual({ page: 1, pageSize: 25, total: 3 })
    expect(list.json.data[0].reference).toMatch(/^Q-[A-Z0-9]{8}$/)
    expect(list.text).not.toMatch(/ip_hash|content_hash/)
    expect((await get('/api/admin/quote-requests?q=company.example')).json.meta.total).toBe(1)
    expect((await get('/api/admin/quote-requests?q=Request%20number%202')).json.meta.total).toBe(1)
    expect((await get('/api/admin/quote-requests?status=quoted')).json.meta.total).toBe(0)
    await send('PATCH', `/api/admin/quote-requests/${ids[0]}`, { status: 'quoted', addNote: 'Sent the proposal.' })
    expect((await get('/api/admin/quote-requests?status=quoted')).json.meta.total).toBe(1)
    const detail = (await get(`/api/admin/quote-requests/${ids[0]}`)).json.data
    expect(detail).toMatchObject({ id: ids[0], status: 'quoted', items: [{ need: 'website', plan: 'launch', extras: ['pages'] }], pricing: { fixed: [], quotedParts: 2 }, notes: [{ body: 'Sent the proposal.' }] })
  })

  it('moves a request through its whole vocabulary and refuses anything else', async () => {
    const [id] = await quotes(1)
    for (const status of ['in_review', 'quoted', 'accepted', 'declined', 'closed', 'new']) expect((await send('PATCH', `/api/admin/quote-requests/${id}`, { status })).json.data.status, status).toBe(status)
    for (const body of [{ status: 'answered' }, { status: '' }, {}, { status: 'closed', price: 1 }]) expect((await send('PATCH', `/api/admin/quote-requests/${id}`, body)).status, JSON.stringify(body)).toBe(422)
    expect((await send('PATCH', '/api/admin/quote-requests/nope', { status: 'closed' })).status).toBe(404)
  })

  it('archives, restores and deletes, taking the items, add-ons, notes and e-mails along', async () => {
    const [id, other] = await quotes(2)
    await send('PATCH', `/api/admin/quote-requests/${id}`, { archived: true, addNote: 'gone soon' })
    expect((await get('/api/admin/quote-requests')).json.meta.total).toBe(1)
    expect((await get('/api/admin/quote-requests?archived=only')).json.meta.total).toBe(1)
    expect((await send('PATCH', `/api/admin/quote-requests/${id}`, { archived: false })).status).toBe(200)
    expect((await send('DELETE', `/api/admin/quote-requests/${id}`)).status).toBe(204)
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 1 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_request_items')).toEqual({ n: 1 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_request_item_extras')).toEqual({ n: 1 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_request_notes')).toEqual({ n: 0 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM email_deliveries WHERE related_id = ?', [id])).toEqual({ n: 0 })
    expect((await get(`/api/admin/quote-requests/${other}`)).status).toBe(200)
    expect((await send('DELETE', `/api/admin/quote-requests/${id}`)).status).toBe(404)
  })

  it('e-mails the customer about a decision only when asked', async () => {
    const [id] = await quotes(1)
    server.db.run('DELETE FROM email_deliveries')
    expect((await send('PATCH', `/api/admin/quote-requests/${id}`, { status: 'quoted', notify: true, note: 'The proposal is attached.' })).json.meta.notification).toBe('queued')
    expect(server.db.all('SELECT kind, recipient, related_type, note FROM email_deliveries')).toEqual([{ kind: 'quote_status', recipient: 'anna@example.com', related_type: 'quote_request', note: 'The proposal is attached.' }])
  })

  it('exports one request as a complete JSON document that holds no internal fingerprints', async () => {
    const [id] = await quotes(1)
    await send('PATCH', `/api/admin/quote-requests/${id}`, { addNote: 'Looks good.' })
    const api = await get(`/api/admin/quote-requests/${id}/export`)
    expect(api.status).toBe(200)
    expect(api.json.data).toMatchObject({ reference: expect.stringMatching(/^Q-/), name: 'Anna Kovács', email: 'anna@example.com', items: [{ need: 'website', plan: 'launch' }], pricing: { quotedParts: 2 }, notes: [{ author: 'admin@site.test', body: 'Looks good.' }] })
    expect(api.text).not.toMatch(/ip_hash|content_hash|"id":/)
    const file = await server.fetch(`/admin/quote-requests/${id}/export.json`, { headers: { Cookie: admin.cookie } })
    expect(file.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(file.headers.get('content-disposition')).toMatch(/^attachment; filename="Q-[A-Z0-9]{8}\.json"$/)
    expect(JSON.parse(await file.text()).reference).toBe(api.json.data.reference)
  })

  it('exports the filtered list as CSV, quotes awkward cells and defuses spreadsheet formulas', async () => {
    await quotes(3, (i) => ({
      name: i === 0 ? '=HYPERLINK("http://evil.example","click")' : i === 1 ? '+36 Nagy, Péter' : 'Anna Kovács',
      description: i === 2 ? 'Line one,\nline "two", with a comma.' : `Request number ${i}: a small website with a contact form.`,
    }))
    const response = await server.fetch('/admin/quote-requests/export.csv', { headers: { Cookie: admin.cookie } })
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="quote-requests.csv"')
    const csv = await response.text()
    expect(csv.startsWith('reference,received,status,name,email,phone,language,services,objective,timing,description,requirements,references\r\n')).toBe(true)
    expect(csv).toContain('"\'=HYPERLINK(""http://evil.example"",""click"")"')
    expect(csv).toContain('"\'+36 Nagy, Péter"')
    expect(csv).toContain('"Line one,\nline ""two"", with a comma."')
    expect(csv).toContain('website:launch+pages')
    expect(csv).not.toMatch(/ip_hash|content_hash/)
    // A cell is never left starting with a formula character.
    for (const row of csv.split('\r\n').slice(1)) expect(row).not.toMatch(/(^|,)[=+@]/)
    const filtered = await (await server.fetch('/admin/quote-requests/export.csv?q=evil.example', { headers: { Cookie: admin.cookie } })).text()
    expect(filtered.trim().split('\r\n')).toHaveLength(2)
  })

  it('keeps the price a request was made at, however the catalogue changes afterwards', async () => {
    const [id] = await quotes(1)
    expect((await send('PUT', '/api/admin/packages/launch', packageBody({ code: 'launch', price: { kind: 'from', amount: 900, currency: 'EUR' }, vat: 'excluded' }))).status).toBe(200)
    expect((await get(`/api/admin/quote-requests/${id}`)).json.data.pricing).toEqual({ fixed: [], quotedParts: 2 })
    const next = await server.api('/api/quote-requests', { body: quote({ description: 'Another request, after the price was published.' }) })
    expect(next.json.data.pricing).toEqual({ fixed: [{ currency: 'EUR', amount: 900, vat: 'excluded' }], quotedParts: 1 })
  })
})

describe('the catalogue', () => {
  it('lists every record, including the disabled ones the public API hides', async () => {
    await send('PUT', '/api/admin/extras/care', extraBody({ code: 'care', status: 'disabled' }))
    const extras = (await get('/api/admin/extras')).json.data
    expect(extras.find((extra: { code: string }) => extra.code === 'care')).toMatchObject({ status: 'disabled' })
    expect((await server.api('/api/shop/extras')).json.data.map((extra: { code: string }) => extra.code)).not.toContain('care')
    expect((await get('/api/admin/services')).json.data).toHaveLength(4)
    expect((await get('/api/admin/packages')).json.data).toHaveLength(4)
    expect((await get('/api/admin/content?type=faq')).json.data).toHaveLength(6)
    expect((await get('/api/admin/services/website')).json.data.translations.nl.title).toBe('Website-ontwikkeling')
    expect((await get('/api/admin/services/blog')).status).toBe(404)
  })

  it('creates a service that then shows on the public API in all three languages, in its place', async () => {
    const created = await send('POST', '/api/admin/services', serviceBody())
    expect(created.status).toBe(201)
    expect(created.json.data).toMatchObject({ slug: 'consulting', status: 'active', packages: ['launch'] })
    const hu = await server.api('/api/services?lang=hu')
    expect(hu.json.data.map((service: { slug: string }) => service.slug)).toEqual(['website', 'webapp', 'ui', 'integrations', 'consulting'])
    expect((await server.api('/api/services/consulting?lang=nl')).json.data).toMatchObject({ title: 'Consulting', features: ['A review', 'A plan'] })
    await send('PUT', '/api/admin/services/consulting', serviceBody({ position: 0, status: 'disabled' }))
    expect((await server.api('/api/services/consulting')).status).toBe(404)
    await send('PUT', '/api/admin/services/consulting', serviceBody({ position: 0, translations: translated({ title: 'Advice', summary: '', tagline: '', overview: '', features: [] }) }))
    const listed = (await server.api('/api/services?lang=en')).json.data.find((service: { slug: string }) => service.slug === 'consulting')
    expect(listed).toMatchObject({ title: 'Advice', features: [] })
  })

  it('rejects a service in full, naming every field that is wrong, and changes nothing', async () => {
    const bad = await send('POST', '/api/admin/services', { slug: 'No Good!', category: '', status: 'maybe', position: 'x', translations: { hu: { title: '' }, en: { title: 't'.repeat(121) } }, packages: ['nope-nope'] })
    expect(bad.status).toBe(422)
    expect(bad.json.error.details.fields).toMatchObject({ slug: 'invalid', category: 'required', status: 'invalid', position: 'invalid', 'translations.hu.title': 'required', 'translations.en.title': 'tooLong', 'translations.nl': 'required' })
    const unknown = await send('POST', '/api/admin/services', serviceBody({ packages: ['no-such-package'] }))
    expect(unknown.status).toBe(422)
    expect(unknown.json.error.details.fields.packages).toBe('unknown')
    expect(server.db.get("SELECT COUNT(*) AS n FROM services WHERE slug = 'consulting'")).toEqual({ n: 0 }) // the transaction was rolled back
    expect((await send('POST', '/api/admin/services', serviceBody({ slug: 'website' }))).status).toBe(409)
    expect((await send('POST', '/api/admin/services', 'not an object')).status).toBe(400)
    expect((await send('PUT', '/api/admin/services/blog', serviceBody())).status).toBe(404)
  })

  it('never lets the body rename a service or take over another one', async () => {
    const response = await send('PUT', '/api/admin/services/website', serviceBody({ slug: 'webapp' }))
    expect(response.status).toBe(200)
    expect(response.json.data.slug).toBe('website')
    expect(server.db.all("SELECT slug FROM services ORDER BY id").map((row) => (row as { slug: string }).slug)).toEqual(['website', 'webapp', 'ui', 'integrations'])
  })

  it('creates packages and add-ons with their associations, and a new package can be requested at once', async () => {
    expect((await send('POST', '/api/admin/extras', extraBody())).status).toBe(201)
    const created = await send('POST', '/api/admin/packages', packageBody({ extras: ['pages', 'training'], needs: ['website', 'improve'] }))
    expect(created.status).toBe(201)
    expect(created.json.data).toMatchObject({ code: 'pilot', needs: ['improve', 'website'], extras: expect.arrayContaining(['pages', 'training']) })
    expect((await server.api('/api/packages/pilot?lang=en')).json.data).toMatchObject({ name: 'Pilot', price: { kind: 'quote' }, quoteRequired: true })
    const request = await server.api('/api/quote-requests', { body: quote({ items: [{ need: 'website', plan: 'pilot', extras: ['training'] }] }) })
    expect(request.status).toBe(201)
    expect(request.json.data.pricing.quotedParts).toBe(2)
  })

  it('keeps a published price complete: an amount, a currency and a VAT mode, or nothing', async () => {
    const attempt = (price: unknown, vat?: unknown) => send('PUT', '/api/admin/packages/launch', packageBody({ code: 'launch', price, vat }))
    const field = async (price: unknown, vat?: unknown) => (await attempt(price, vat)).json.error?.details?.fields
    expect(await field({ kind: 'from', amount: 900, currency: 'EUR' })).toEqual({ vat: 'required' })
    expect(await field({ kind: 'from', amount: 900, currency: 'EUR' }, 'unspecified')).toEqual({ vat: 'required' })
    expect(await field({ kind: 'from', currency: 'EUR' }, 'included')).toEqual({ 'price.amount': 'required' })
    expect(await field({ kind: 'from', amount: 0, currency: 'EUR' }, 'included')).toEqual({ 'price.amount': 'invalid' })
    expect(await field({ kind: 'from', amount: -5, currency: 'EUR' }, 'included')).toEqual({ 'price.amount': 'invalid' })
    expect(await field({ kind: 'from', amount: 10.5, currency: 'EUR' }, 'included')).toEqual({ 'price.amount': 'invalid' })
    expect(await field({ kind: 'from', amount: 900 }, 'included')).toEqual({ 'price.currency': 'required' })
    expect(await field({ kind: 'from', amount: 900, currency: 'XYZ' }, 'included')).toEqual({ 'price.currency': 'invalid' })
    expect(await field({ kind: 'fixed', amount: 900, currency: 'EUR' }, 'included')).toEqual({ price: 'invalid' })
    expect(await field('free', 'included')).toEqual({ price: 'invalid' })
    expect(await field({ kind: 'quote' }, 'tax-free')).toEqual({ vat: 'invalid' })
    expect(server.db.get<{ price_kind: string }>("SELECT price_kind FROM packages WHERE code = 'launch'")?.price_kind).toBe('quote')
    const ok = await attempt({ kind: 'from', amount: 900, currency: 'EUR' }, 'excluded')
    expect(ok.status).toBe(200)
    expect((await server.api('/api/packages/launch')).json.data).toMatchObject({ price: { kind: 'from', amount: 900, currency: 'EUR' }, vat: 'excluded', quoteRequired: true })
    expect((await attempt({ kind: 'tbd' })).status).toBe(200)
    expect((await server.api('/api/packages/launch')).json.data.price).toEqual({ kind: 'tbd' })
  })

  it('records a price change in the audit log, with the value it became', async () => {
    await send('PUT', '/api/admin/packages/launch', packageBody({ code: 'launch', price: { kind: 'from', amount: 1200, currency: 'HUF' }, vat: 'included' }))
    const row = server.db.get<{ detail: string; actor: string }>("SELECT a.detail, u.email AS actor FROM audit_log a JOIN admin_users u ON u.id = a.actor_id WHERE a.action = 'package.update'")!
    expect(row.actor).toBe('admin@site.test')
    expect(JSON.parse(row.detail)).toMatchObject({ price: '1200 HUF' })
  })

  it('refuses a request for a package or add-on that has been disabled, and a request that names a record the catalogue does not have', async () => {
    expect((await send('PUT', '/api/admin/packages/launch', packageBody({ code: 'launch', status: 'disabled' }))).status).toBe(200)
    expect((await server.api('/api/quote-requests', { body: quote() })).status).toBe(422)
    expect((await send('PUT', '/api/admin/packages/launch', packageBody({ code: 'launch', status: 'active' }))).status).toBe(200)
    expect((await server.api('/api/quote-requests', { body: quote() })).status).toBe(201)
    await send('PUT', '/api/admin/extras/pages', extraBody({ code: 'pages', status: 'disabled' }))
    expect((await server.api('/api/quote-requests', { body: quote({ description: 'Same wish, but a disabled add-on is included.' }) })).status).toBe(422)
  })

  it('deletes what nothing refers to, and tells the administrator to disable what is in use', async () => {
    await send('POST', '/api/admin/services', serviceBody())
    await send('POST', '/api/admin/packages', packageBody())
    await send('POST', '/api/admin/extras', extraBody())
    await quotes(1, () => ({ items: [{ need: 'website', plan: 'launch', extras: ['pages'] }] }))
    const inUse = await send('DELETE', '/api/admin/packages/launch')
    expect(inUse.status).toBe(409)
    expect(inUse.json.error.message).toMatch(/Disable it/)
    expect((await send('DELETE', '/api/admin/extras/pages')).status).toBe(409)
    expect(server.db.get("SELECT COUNT(*) AS n FROM packages WHERE code = 'launch'")).toEqual({ n: 1 })
    expect((await send('DELETE', '/api/admin/packages/pilot')).status).toBe(204)
    expect((await send('DELETE', '/api/admin/extras/training')).status).toBe(204)
    expect((await send('DELETE', '/api/admin/services/consulting')).status).toBe(204)
    expect(server.db.get("SELECT COUNT(*) AS n FROM service_translations WHERE service_id NOT IN (SELECT id FROM services)")).toEqual({ n: 0 })
    expect((await send('DELETE', '/api/admin/services/consulting')).status).toBe(404)
  })

  it('manages the content blocks, which then show on the public API in their language', async () => {
    const created = await send('POST', '/api/admin/content', { type: 'faq', slug: 'refunds', position: 99, translations: { hu: { title: 'Visszatérítés?', description: 'Igen.' }, en: { title: 'Refunds?', description: 'Yes.' }, nl: { title: 'Restitutie?', description: 'Ja.' } } })
    expect(created.status).toBe(201)
    const faq = (lang: string) => server.api(`/api/content/faq?lang=${lang}`)
    expect((await faq('nl')).json.data.at(-1)).toMatchObject({ slug: 'refunds', question: 'Restitutie?', answer: 'Ja.' })
    expect((await send('PUT', '/api/admin/content/faq/refunds', { status: 'disabled', translations: { hu: { title: 'a', description: '' }, en: { title: 'b', description: '' }, nl: { title: 'c', description: '' } } })).status).toBe(200)
    expect((await faq('en')).json.data.map((item: { slug: string }) => item.slug)).not.toContain('refunds')
    expect((await get('/api/admin/content/faq/refunds')).json.data.status).toBe('disabled')
    expect((await send('DELETE', '/api/admin/content/faq/refunds')).status).toBe(204)
    expect((await get('/api/admin/content/faq/refunds')).status).toBe(404)
    expect((await get('/api/admin/content/poem/x')).status).toBe(404)
    const invalid = await send('POST', '/api/admin/content', { type: 'poem', slug: 'x1', translations: translated({ title: 't', description: '' }) })
    expect(invalid.json.error.details.fields.type).toBe('invalid')
    expect((await send('POST', '/api/admin/content', { slug: 'x1', translations: translated({ title: 't', description: '' }) })).json.error.details.fields.type).toBe('required')
  })

  it('changes the catalogue version the website builds from, whatever is edited', async () => {
    const before = (await server.api('/api/shop/catalog')).json.data.version
    await send('POST', '/api/admin/extras', extraBody())
    const after = (await server.api('/api/shop/catalog')).json.data.version
    expect(after).not.toBe(before)
    await send('DELETE', '/api/admin/extras/training')
    expect((await server.api('/api/shop/catalog')).json.data.version).toBe(before)
  })
})

describe('the administration pages', () => {
  it('renders every page for a signed-in administrator, with the safe headers and no script', async () => {
    const [inquiry] = await messages(1)
    const [request] = await quotes(1)
    const paths = [
      '/admin', '/admin/dashboard', '/admin/inquiries', `/admin/inquiries/${inquiry}`, '/admin/quote-requests', `/admin/quote-requests/${request}`, '/admin/catalog', '/admin/services/new', '/admin/services/website',
      '/admin/packages/new', '/admin/packages/launch', '/admin/extras/new', '/admin/extras/pages', '/admin/content/faq/new', '/admin/content/faq/start', '/admin/system', '/admin/account',
    ]
    for (const path of paths) {
      const response = await server.fetch(path, { headers: { Cookie: admin.cookie } })
      if (path === '/admin') {
        expect(response.status).toBe(303)
        continue
      }
      const html = await response.text()
      expect(response.status, path).toBe(200)
      expect(response.headers.get('content-type'), path).toBe('text/html; charset=utf-8')
      expect(response.headers.get('content-security-policy'), path).toBe("default-src 'none'; style-src 'self'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'")
      expect(response.headers.get('cache-control'), path).toBe('no-store')
      expect(response.headers.get('x-frame-options'), path).toBe('DENY')
      expect(response.headers.get('x-content-type-options'), path).toBe('nosniff')
      expect(html, path).toMatch(/^<!doctype html>/i)
      expect(html, path).not.toMatch(/<script|javascript:|\son[a-z]+=|style="/i)
      expect(html, path).toContain('/admin/assets/admin.css')
      expect(html, path).toContain('admin@site.test')
    }
    const css = await server.fetch('/admin/assets/admin.css')
    expect(css.status).toBe(200)
    expect(css.headers.get('content-type')).toBe('text/css; charset=utf-8')
  })

  it('shows on the dashboard only what the database holds', async () => {
    const empty = (await page('/admin/dashboard')).html
    expect(empty).not.toMatch(/Subject number|C-[A-Z0-9]{8}|Q-[A-Z0-9]{8}/)
    expect(empty).toContain('of 0 in total')
    await messages(2)
    await quotes(1)
    const [id] = server.db.all<{ id: string }>('SELECT id FROM inquiries ORDER BY id').map((row) => row.id)
    await send('PATCH', `/api/admin/inquiries/${id}`, { status: 'answered' })
    const html = (await page('/admin/dashboard')).html
    expect(html).toContain('Subject number 0')
    expect(html).toContain('Subject number 1')
    expect(html).toContain('of 2 in total')
    expect(html).toContain('of 1 in total')
    expect(html).toMatch(/Q-[A-Z0-9]{8}/)
    expect(html).not.toMatch(/Revenue|Visitors|Conversion|Page views/i) // nothing is measured that the server does not record
  })

  it('escapes whatever a stranger typed, on the list, the detail and the CSV-free pages', async () => {
    const xss = { name: '<script>alert(1)</script>', subject: '"><img src=x onerror=alert(2)>', message: "<svg/onload=alert(3)> & 'quotes' and \"more\" in a sentence." }
    await server.api('/api/contact', { body: contact(xss) })
    await server.api('/api/quote-requests', { body: quote({ name: xss.name, description: xss.message.padEnd(30, '.'), requirements: '<b>bold</b>' }) })
    const [inquiry] = server.db.all<{ id: string }>('SELECT id FROM inquiries').map((row) => row.id)
    const [request] = server.db.all<{ id: string }>('SELECT id FROM quote_requests').map((row) => row.id)
    await send('PATCH', `/api/admin/inquiries/${inquiry}`, { addNote: '<iframe src=//evil.example></iframe>' })
    for (const path of ['/admin/dashboard', '/admin/inquiries', `/admin/inquiries/${inquiry}`, '/admin/quote-requests', `/admin/quote-requests/${request}`]) {
      const { html } = await page(path)
      expect(html, path).not.toMatch(/<script>alert|<img src=x|<svg\/onload|<iframe|<b>bold/i)
    }
    const detail = (await page(`/admin/inquiries/${inquiry}`)).html
    expect(detail).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(detail).toContain('&lt;iframe src=//evil.example&gt;&lt;/iframe&gt;')
    expect(detail).toContain('&quot;&gt;&lt;img src=x onerror=alert(2)&gt;')
  })

  it('changes a message through its forms: status with a note, a note, archive, delete (only when confirmed)', async () => {
    const [id] = await messages(1)
    const base = `/admin/inquiries/${id}`
    const status = await form(`${base}/status`, { status: 'in_progress', note: '' })
    expect(status.status).toBe(303)
    expect(status.headers.get('location')).toBe(`${base}?done=status`)
    expect(server.db.get<{ status: string }>('SELECT status FROM inquiries')?.status).toBe('in_progress')
    expect((await form(`${base}/status`, { status: 'closed', notify: 'on' })).headers.get('location')).toBe(`${base}?done=status_queued`)
    expect((await form(`${base}/status`, { status: 'bogus' })).headers.get('location')).toBe(`${base}?done=invalid`)
    expect((await form(`${base}/notes`, { body: 'A note from the form.' })).headers.get('location')).toBe(`${base}?done=noted`)
    expect((await form(`${base}/notes`, { body: '' })).headers.get('location')).toBe(`${base}?done=invalid`)
    expect((await page(base)).html).toContain('A note from the form.')
    expect((await form(`${base}/archive`, { archived: 'true' })).headers.get('location')).toBe(`${base}?done=archived`)
    expect(server.db.get<{ archived_at: string | null }>('SELECT archived_at FROM inquiries')?.archived_at).not.toBeNull()
    expect((await form(`${base}/archive`, { archived: 'false' })).headers.get('location')).toBe(`${base}?done=unarchived`)
    expect((await form(`${base}/delete`, {})).headers.get('location')).toBe(`${base}?done=invalid`)
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 1 })
    expect((await form(`${base}/delete`, { confirm: 'yes' })).headers.get('location')).toBe('/admin/inquiries?done=deleted')
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 0 })
    expect((await page(base)).status).toBe(404)
  })

  it('shows a page, not JSON, when a page is missing, and a flash message only from a known list', async () => {
    const missing = await page('/admin/inquiries/nothing-here')
    expect(missing.status).toBe(404)
    expect(missing.html).toMatch(/^<!doctype html>/i)
    const flash = (await page('/admin/dashboard?done=<script>alert(1)</script>')).html
    expect(flash).not.toContain('alert(1)')
    expect((await page('/admin/content/poem/new')).status).toBe(404)
  })

  it('edits the catalogue through its forms and shows the problems next to the typed values', async () => {
    const fields = (extra: Record<string, string | string[]> = {}) => {
      const values: Record<string, string | string[]> = { slug: 'consulting', category: 'web', status: 'active', position: '60', packages: ['launch'] }
      for (const lang of ['hu', 'en', 'nl']) Object.assign(values, { [`title_${lang}`]: `Consulting ${lang}`, [`summary_${lang}`]: 'Summary', [`tagline_${lang}`]: '', [`overview_${lang}`]: '', [`features_${lang}`]: 'One\nTwo\n\n  Three  ' })
      return { ...values, ...extra }
    }
    const created = await form('/admin/services', fields())
    expect(created.status).toBe(303)
    expect(created.headers.get('location')).toBe('/admin/catalog?done=created')
    expect((await server.api('/api/services/consulting?lang=nl')).json.data).toMatchObject({ title: 'Consulting nl', features: ['One', 'Two', 'Three'] })

    const rejected = await form('/admin/services/consulting', fields({ title_en: '', category: 'Not Valid' }))
    expect(rejected.status).toBe(422)
    const html = await rejected.text()
    expect(html).toContain('value="Consulting hu"') // what was typed is still there
    expect(html).toMatch(/title_en/)
    expect((await server.api('/api/services/consulting?lang=en')).json.data.title).toBe('Consulting en')

    expect((await form('/admin/services', fields())).status).toBe(409)
    expect((await form('/admin/services/consulting', fields({ title_hu: 'Új cím', status: 'disabled' }))).headers.get('location')).toBe('/admin/catalog?done=saved')
    expect((await get('/api/admin/services/consulting')).json.data).toMatchObject({ status: 'disabled' })
    expect((await form('/admin/services/consulting/delete', {})).headers.get('location')).toBe('/admin/catalog?done=deleted')
    expect((await form('/admin/packages/launch/delete', {})).headers.get('location')).toBe('/admin/catalog?done=deleted')
    // (launch has no request yet, so it really was deletable; a package a request refers to answers "conflict")
    await quotes(1, () => ({ items: [{ need: 'website', plan: 'grow', extras: [] }] }))
    expect((await form('/admin/packages/grow/delete', {})).headers.get('location')).toBe('/admin/catalog?done=conflict')
  })

  it('edits a package price through the form, and refuses a half-published one', async () => {
    const base: Record<string, string | string[]> = { status: 'active', position: '1', quoteRequired: 'on', needs: ['website'], extras: ['pages'] }
    for (const lang of ['hu', 'en', 'nl']) Object.assign(base, { [`name_${lang}`]: `Launch ${lang}` })
    const bad = await form('/admin/packages/launch', { ...base, price_kind: 'from', price_amount: '900', price_currency: 'EUR', vat: 'unspecified' })
    expect(bad.status).toBe(422)
    expect(await bad.text()).toMatch(/vat/)
    expect((await server.api('/api/packages/launch')).json.data.price).toEqual({ kind: 'quote' })
    const ok = await form('/admin/packages/launch', { ...base, price_kind: 'from', price_amount: '900', price_currency: 'EUR', vat: 'excluded' })
    expect(ok.status).toBe(303)
    expect((await server.api('/api/packages/launch')).json.data).toMatchObject({ price: { kind: 'from', amount: 900, currency: 'EUR' }, vat: 'excluded' })
  })

  it('shows the system page to an administrator with a redacted configuration, and runs maintenance on request', async () => {
    const { html } = await page('/admin/system')
    expect(html).toContain('Schema version</dt><dd>1 of 1</dd>')
    expect(html).toContain('&quot;appSecret&quot;: &quot;set&quot;') // says that it is set, not what it is
    expect(html).not.toContain(server.config.appSecret)
    expect(html).toContain('admin.login') // the sign-in is in the audit trail
    const run = await form('/admin/system/maintenance', {})
    expect(run.status).toBe(303)
    expect(run.headers.get('location')).toBe('/admin/system?done=maintenance')
    expect(server.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'system.maintenance'")).toEqual({ n: 1 })
    expect((await get('/api/admin/system')).json.data).toMatchObject({ migrations: expect.anything(), email: expect.anything(), config: expect.anything() })
    expect((await get('/api/admin/system')).text).not.toContain(server.config.appSecret)
    const publish = await form('/admin/system/publish', {})
    expect(publish.headers.get('location')).toBe('/admin/system?done=publish_failed') // no deploy hook is configured
  })
})
