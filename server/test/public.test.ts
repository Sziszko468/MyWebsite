import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contact, quote, startServer, type TestServer } from './helpers.ts'

let server: TestServer
beforeEach(async () => {
  server = await startServer()
})
afterEach(async () => {
  await server.close()
})

const rows = (table: string) => server.db.all(`SELECT * FROM ${table}`)

describe('POST /api/contact', () => {
  it('stores a valid message and answers with a reference, never with what was sent', async () => {
    const response = await server.api('/api/contact', { body: contact() })
    expect(response.status).toBe(201)
    expect(response.json.data).toEqual({ reference: expect.stringMatching(/^C-[A-Z0-9]{8}$/), status: 'received', createdAt: server.clock.now().toISOString() })
    const [row] = rows('inquiries') as Record<string, unknown>[]
    expect(row).toMatchObject({ name: 'Anna Kovács', email: 'anna@example.com', subject: 'A new website', kind: 'project', language: 'en', status: 'new', archived_at: null, consent_at: server.clock.now().toISOString() })
    expect(row.reference).toBe(response.json.data.reference)
    expect(response.text).not.toContain('anna@example.com')
    expect(response.text).not.toContain('bakery')
  })

  it('stores the network address only as a keyed hash', async () => {
    await server.api('/api/contact', { body: contact() })
    const row = rows('inquiries')[0] as { ip_hash: string }
    expect(row.ip_hash).toMatch(/^[0-9a-f]{32}$/)
    expect(JSON.stringify(rows('inquiries'))).not.toContain('127.0.0.1')
  })

  it.each([
    ['name', { name: '' }, 'required'],
    ['name', { name: 'A' }, 'tooShort'],
    ['name', { name: 'x'.repeat(101) }, 'tooLong'],
    ['email', { email: '' }, 'required'],
    ['email', { email: 'not-an-address' }, 'invalidEmail'],
    ['email', { email: 'a@b' }, 'invalidEmail'],
    ['email', { email: 'a..b@example.com' }, 'invalidEmail'],
    ['email', { email: `${'a'.repeat(250)}@example.com` }, 'tooLong'],
    ['kind', { kind: 'spam' }, 'invalid'],
    ['kind', { kind: undefined }, 'required'],
    ['language', { language: 'de' }, 'invalid'],
    ['subject', { subject: 'ab' }, 'tooShort'],
    ['subject', { subject: 'x'.repeat(151) }, 'tooLong'],
    ['message', { message: 'too short' }, 'tooShort'],
    ['message', { message: 'x'.repeat(3001) }, 'tooLong'],
    ['message', { message: 42 }, 'invalid'],
    ['consent', { consent: false }, 'consentRequired'],
    ['consent', { consent: 'true' }, 'consentRequired'],
    ['form', { form: 'quote' }, 'invalid'],
  ])('refuses a bad %s with a field error and stores nothing', async (field, override, code) => {
    const response = await server.api('/api/contact', { body: contact(override) })
    expect(response.status).toBe(422)
    expect(response.json.error.code).toBe('validation_failed')
    expect(response.json.error.details.fields[field]).toBe(code)
    expect(rows('inquiries')).toHaveLength(0)
    expect(server.mailer.sent).toHaveLength(0)
  })

  it('reports every problem at once', async () => {
    const response = await server.api('/api/contact', { body: contact({ name: '', email: 'x', subject: '', message: '', kind: 'nope' }) })
    expect(Object.keys(response.json.error.details.fields).sort()).toEqual(['email', 'kind', 'message', 'name', 'subject'])
  })

  it('accepts what the form accepts at the limits', async () => {
    const response = await server.api('/api/contact', { body: contact({ name: 'Al', subject: 'abc', message: '1234567890' }) })
    expect(response.status).toBe(201)
    const long = await server.api('/api/contact', { body: contact({ name: 'N'.repeat(100), subject: 'S'.repeat(150), message: 'M'.repeat(3000), email: 'long@example.com' }) })
    expect(long.status).toBe(201)
  })

  it('cleans what it stores: control characters, invisible direction marks and runs of blank lines', async () => {
    const message = `Hello\u0000 there,\r\n\r\n\r\n\r\nthis is a \u202Etxt.exe message\u200B with marks.`
    await server.api('/api/contact', { body: contact({ name: '  Anna\u0007   Kovács  ', subject: 'Line\nbreak subject', message }) })
    const row = rows('inquiries')[0] as { name: string; subject: string; message: string }
    expect(row.name).toBe('Anna Kovács')
    expect(row.subject).toBe('Line break subject')
    expect(row.message).toBe('Hello there,\n\nthis is a txt.exe message with marks.')
  })

  it('stores markup as the text it is (it is escaped where it is shown)', async () => {
    await server.api('/api/contact', { body: contact({ message: '<script>alert(1)</script> and <img src=x onerror=alert(2)> in a long message' }) })
    expect((rows('inquiries')[0] as { message: string }).message).toContain('<script>alert(1)</script>')
  })

  it('does not store a message from a script: a filled hidden field, or a message full of links', async () => {
    const trap = await server.api('/api/contact', { body: contact({ website: 'http://spam.example' }) })
    expect(trap.status).toBe(422)
    expect(trap.json.error.code).toBe('spam_suspected')
    const links = await server.api('/api/contact', { body: contact({ message: 'see http://a.example http://b.example http://c.example http://d.example for details please' }) })
    expect(links.json.error.code).toBe('spam_suspected')
    expect(rows('inquiries')).toHaveLength(0)
  })

  it('takes a repeated message for the same one: a double click stores and notifies once', async () => {
    const first = await server.api('/api/contact', { body: contact() })
    const second = await server.api('/api/contact', { body: contact() })
    expect(first.status).toBe(201)
    expect(second.status).toBe(200)
    expect(second.json.data.reference).toBe(first.json.data.reference)
    expect(rows('inquiries')).toHaveLength(1)
    await server.app.context.notifier.processDue()
    expect(server.mailer.sent).toHaveLength(1)
    // A different message from the same person is a new one; so is the same text after the window.
    expect((await server.api('/api/contact', { body: contact({ subject: 'Another subject' }) })).status).toBe(201)
    server.clock.advance(11 * 60_000)
    expect((await server.api('/api/contact', { body: contact() })).status).toBe(201)
    expect(rows('inquiries')).toHaveLength(3)
  })

  it('needs a JSON object declared as JSON, and nothing larger than the limit', async () => {
    expect((await server.api('/api/contact', { raw: 'name=a', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })).status).toBe(415)
    expect((await server.api('/api/contact', { raw: '{"broken"', })).json.error.code).toBe('invalid_json')
    expect((await server.api('/api/contact', { raw: '[1,2]' })).json.error.code).toBe('invalid_json')
    expect((await server.api('/api/contact', { raw: '' })).status).toBe(400)
    const big = await server.api('/api/contact', { body: contact({ message: 'x'.repeat(70_000) }) })
    expect(big.status).toBe(413)
    expect(big.json.error.code).toBe('payload_too_large')
    expect(rows('inquiries')).toHaveLength(0)
  })

  it('does not insist on consent when the owner decided it is not required', async () => {
    await server.close()
    server = await startServer({ env: { REQUIRE_CONSENT: 'false' } })
    const response = await server.api('/api/contact', { body: contact({ consent: false }) })
    expect(response.status).toBe(201)
    expect((rows('inquiries')[0] as { consent_at: string | null }).consent_at).toBeNull()
  })

  it('queues the owner notification after the message is stored, and sends it in the language the owner chose', async () => {
    await server.api('/api/contact', { body: contact({ language: 'nl' }) })
    await server.app.context.notifier.processDue()
    expect(server.mailer.sent).toHaveLength(1)
    const mail = server.mailer.sent[0]
    expect(mail.to).toBe('owner@site.test')
    expect(mail.replyTo).toBe('anna@example.com')
    expect(mail.subject).toMatch(/^New message \(C-[A-Z0-9]{8}\): A new website$/)
    expect(mail.text).toContain('Anna Kovács')
    expect(server.db.get("SELECT status, attempts FROM email_deliveries")).toEqual({ status: 'accepted', attempts: 1 })
  })
})

describe('POST /api/quote-requests', () => {
  it('stores the request, its items and add-ons, and answers with a reference and the pricing it can state', async () => {
    const response = await server.api('/api/quote-requests', { body: quote({ items: [{ need: 'website', plan: 'launch', extras: ['pages', 'motion'] }, { need: 'integrations', plan: 'custom', extras: ['api'] }], phone: '+36 30 123 4567', requirements: 'Dark theme.', reference: 'https://example.com' }) })
    expect(response.status).toBe(201)
    expect(response.json.data.reference).toMatch(/^Q-[A-Z0-9]{8}$/)
    // No price is published, so there is nothing to add up: every part is quoted.
    expect(response.json.data.pricing).toEqual({ fixed: [], quotedParts: 5 })
    const request = rows('quote_requests')[0] as Record<string, unknown>
    expect(request).toMatchObject({ name: 'Anna Kovács', phone: '+36 30 123 4567', objective: 'present', timing: 'months', requirements: 'Dark theme.', reference_notes: 'https://example.com', status: 'new' })
    const items = server.db.all<{ need: string; plan: string; service_id: number | null; package_id: number | null }>('SELECT need, plan, service_id, package_id FROM quote_request_items ORDER BY position')
    expect(items.map((item) => [item.need, item.plan, item.service_id !== null, item.package_id !== null])).toEqual([['website', 'launch', true, true], ['integrations', 'custom', true, false]])
    const extras = server.db.all<{ code: string }>('SELECT e.code FROM quote_request_item_extras x JOIN extras e ON e.id = x.extra_id ORDER BY e.code').map((row) => row.code)
    expect(extras).toEqual(['api', 'motion', 'pages'])
    expect(response.text).not.toContain('Anna')
  })

  it('maps "improve" to the website service and "not sure yet" to none', async () => {
    const response = await server.api('/api/quote-requests', { body: quote({ items: [{ need: 'improve', plan: 'grow', extras: [] }, { need: 'unsure', plan: 'custom', extras: [] }] }) })
    expect(response.status).toBe(201)
    const items = server.db.all<{ need: string; slug: string | null }>('SELECT i.need, s.slug FROM quote_request_items i LEFT JOIN services s ON s.id = i.service_id ORDER BY i.position')
    expect(items).toEqual([{ need: 'improve', slug: 'website' }, { need: 'unsure', slug: null }])
  })

  it.each([
    ['no items', { items: [] }, 'items', 'required'],
    ['items that are not a list', { items: 'website' }, 'items', 'required'],
    ['more than eight items', { items: Array.from({ length: 9 }, () => ({ need: 'website', plan: 'launch', extras: [] })) }, 'items', 'tooMany'],
    ['an unknown need', { items: [{ need: 'blog', plan: 'launch', extras: [] }] }, 'items.0.need', 'invalid'],
    ['a need twice', { items: [{ need: 'website', plan: 'launch', extras: [] }, { need: 'website', plan: 'grow', extras: [] }] }, 'items.1.need', 'duplicate'],
    ['no plan', { items: [{ need: 'website', extras: [] }] }, 'items.0.plan', 'required'],
    ['an unknown plan', { items: [{ need: 'website', plan: 'platinum', extras: [] }] }, 'items.0.plan', 'unknown'],
    ['an unknown add-on', { items: [{ need: 'website', plan: 'launch', extras: ['cms'] }] }, 'items.0.extras', 'unknown'],
    ['an add-on that does not apply to the need', { items: [{ need: 'website', plan: 'launch', extras: ['responsive'] }] }, 'items.0.extras', 'unknown'],
    ['a short description', { description: 'too short' }, 'description', 'tooShort'],
    ['a long description', { description: 'x'.repeat(2001) }, 'description', 'tooLong'],
    ['a bad objective', { objective: 'fame' }, 'objective', 'invalid'],
    ['a bad timing', { timing: 'yesterday' }, 'timing', 'invalid'],
    ['a bad e-mail address', { email: 'nope' }, 'email', 'invalidEmail'],
    ['a bad phone number', { phone: 'call me' }, 'phone', 'invalidPhone'],
    ['no consent', { consent: false }, 'consent', 'consentRequired'],
    ['another version', { version: 1 }, 'version', 'invalid'],
  ])('refuses %s and stores nothing', async (_name, override, field, code) => {
    const response = await server.api('/api/quote-requests', { body: quote(override) })
    expect(response.status).toBe(422)
    expect(response.json.error.details.fields[field]).toBe(code)
    expect(rows('quote_requests')).toHaveLength(0)
    expect(rows('quote_request_items')).toHaveLength(0)
  })

  it('never reads a price from the request: whatever it claims, the stored price is the catalogue\'s', async () => {
    const response = await server.api('/api/quote-requests', { body: quote({ price: 1, total: 1, items: [{ need: 'website', plan: 'launch', extras: ['pages'], price: 1, amount: 1 }] }) })
    expect(response.status).toBe(201)
    const item = server.db.get<{ price_snapshot: string }>('SELECT price_snapshot FROM quote_request_items')!
    expect(JSON.parse(item.price_snapshot)).toEqual({ plan: { code: 'launch', price: { kind: 'quote' }, vat: 'unspecified' }, extras: [{ code: 'pages', price: { kind: 'quote' }, vat: 'unspecified' }] })
    expect(JSON.stringify(rows('quote_requests'))).not.toContain('"price"')
  })

  it('copies the approved prices onto the item and adds up the published ones itself', async () => {
    server.db.run("UPDATE packages SET price_kind = 'from', price_amount = 1200, price_currency = 'EUR', vat_mode = 'excluded' WHERE code = 'launch'")
    server.db.run("UPDATE extras SET price_kind = 'from', price_amount = 150, price_currency = 'EUR', vat_mode = 'excluded' WHERE code = 'pages'")
    const response = await server.api('/api/quote-requests', { body: quote({ items: [{ need: 'website', plan: 'launch', extras: ['pages', 'motion'] }, { need: 'webapp', plan: 'custom', extras: [] }], description: 'A website and a small web application for the bakery.' }) })
    expect(response.json.data.pricing).toEqual({ fixed: [{ currency: 'EUR', amount: 1350, vat: 'excluded' }], quotedParts: 2 })
    const item = server.db.get<{ price_snapshot: string }>('SELECT price_snapshot FROM quote_request_items ORDER BY position')!
    expect(JSON.parse(item.price_snapshot).plan.price).toEqual({ kind: 'from', amount: 1200, currency: 'EUR' })
  })

  it('refuses what is disabled in the catalogue, and says so as a field error', async () => {
    server.db.run("UPDATE packages SET status = 'disabled' WHERE code = 'launch'")
    const package_ = await server.api('/api/quote-requests', { body: quote() })
    expect(package_.json.error.details.fields['items.0.plan']).toBe('unknown')
    server.db.run("UPDATE packages SET status = 'active' WHERE code = 'launch'")
    server.db.run("UPDATE extras SET status = 'disabled' WHERE code = 'pages'")
    expect((await server.api('/api/quote-requests', { body: quote() })).json.error.details.fields['items.0.extras']).toBe('unknown')
    server.db.run("UPDATE extras SET status = 'active' WHERE code = 'pages'")
    server.db.run("UPDATE services SET status = 'disabled' WHERE slug = 'website'")
    expect((await server.api('/api/quote-requests', { body: quote() })).json.error.details.fields['items.0.need']).toBe('unknown')
    expect(rows('quote_requests')).toHaveLength(0)
  })

  it('answers 503 while the catalogue has not been loaded, not a validation error the visitor could not fix', async () => {
    await server.close()
    server = await startServer({ seed: false })
    const response = await server.api('/api/quote-requests', { body: quote() })
    expect(response.status).toBe(503)
    expect(response.json.error.code).toBe('catalog_unavailable')
  })

  it('takes the same request twice for one: one record, one notification, the same reference', async () => {
    const first = await server.api('/api/quote-requests', { body: quote() })
    const second = await server.api('/api/quote-requests', { body: quote() })
    expect(second.status).toBe(200)
    expect(second.json.data.reference).toBe(first.json.data.reference)
    expect(rows('quote_requests')).toHaveLength(1)
    await server.app.context.notifier.processDue()
    expect(server.mailer.sent).toHaveLength(1)
    // The order of the lines and of the add-ons does not make it a different request.
    const reordered = await server.api('/api/quote-requests', { body: quote({ items: [{ need: 'website', plan: 'launch', extras: ['pages'] }] }) })
    expect(reordered.status).toBe(200)
  })

  it('tells the owner about it: every service, package, add-on and answer in the e-mail, in the owner\'s language', async () => {
    await server.api('/api/quote-requests', { body: quote({ items: [{ need: 'website', plan: 'launch', extras: ['pages'] }], requirements: 'Dark theme please.', phone: '+31 6 1234 5678' }) })
    await server.app.context.notifier.processDue()
    const mail = server.mailer.sent[0]
    expect(mail.subject).toMatch(/^New quote request \(Q-[A-Z0-9]{8}\): Anna Kovács$/)
    for (const part of ['Website — Package: Launch + pages', 'Dark theme please.', '+31 6 1234 5678', 'No part has a published price']) expect(mail.text).toContain(part)
    expect(mail.replyTo).toBe('anna@example.com')
  })
})

describe('the cart', () => {
  it('has no server-side copy: choices travel in the request, so an unknown cart is just an invalid request', async () => {
    const routes = ['/api/cart', '/api/carts', '/api/shop/cart', '/api/orders', '/api/checkout']
    for (const path of routes) expect((await server.api(path)).status).toBe(404)
  })
})
