import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { INQUIRY_KINDS } from '../src/modules/inquiries/repository.ts'
import { NEEDS } from '../src/modules/catalog/repository.ts'
import { CONTACT_LIMITS } from '../src/modules/contact/service.ts'
import { OBJECTIVES, TIMINGS } from '../src/modules/quotes/repository.ts'
import { QUOTE_LIMITS } from '../src/modules/quotes/service.ts'
import { isEmail as serverIsEmail, isPhone as serverIsPhone } from '../src/lib/validate.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * The website and the backend are two programs that must agree. These tests load the website's own modules (its
 * validation, the request it builds, its catalogue) and hold them against the running backend: whatever the
 * website's form lets a visitor send, the backend accepts, and the limits and vocabularies are the same ones.
 * (The website's files are loaded by path at run time: they belong to the other TypeScript project.)
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = (path: string): Promise<any> => import(/* @vite-ignore */ pathToFileURL(join(root, path)).href)

const contactValidation = await load('src/contact/validation.ts')
const contactTypes = await load('src/contact/types.ts')
const inquiry = await load('src/shop/inquiry.ts')
const cart = await load('src/shop/cart.ts')
const forms = await load('src/forms/validate.ts')
const submit = await load('src/forms/submit.ts')
const ids = await load('src/content/services/ids.ts')
const catalogExport = await load('src/content/catalogExport.ts')
const projectsExport = await load('src/content/projectsExport.ts')
const textsExport = await load('src/content/textsExport.ts')
const apiConfig = await load('src/config/api.ts')

let server: TestServer
beforeEach(async () => {
  server = await startServer()
})
afterEach(async () => {
  await server.close()
})

const seed = catalogExport.buildCatalogSeed() as {
  packages: { code: string; needs: string[]; extras: string[] }[]
  extras: { code: string; appliesTo: string[] }[]
}

describe('the limits and the words are the same on both sides', () => {
  it('the contact form\'s limits are the backend\'s', () => {
    expect(contactValidation.CONTACT_LIMITS).toEqual(CONTACT_LIMITS)
    expect(contactTypes.CONTACT_KINDS).toEqual([...INQUIRY_KINDS])
  })

  it('the quote configurator\'s limits and choices are the backend\'s', () => {
    const { LIMITS } = inquiry
    for (const field of ['description', 'reference', 'requirements', 'name', 'email', 'phone'] as const) expect(LIMITS[field], field).toEqual(QUOTE_LIMITS[field])
    expect(inquiry.OBJECTIVES).toEqual([...OBJECTIVES])
    expect(inquiry.TIMINGS).toEqual([...TIMINGS])
    expect(ids.NEED_IDS).toEqual([...NEEDS])
    expect(new Set(ids.PLAN_IDS)).toEqual(new Set([...seed.packages.map((pack) => pack.code), 'custom']))
  })

  it('an e-mail address or a phone number is good for the website exactly when it is good for the backend', () => {
    const emails = [
      'anna@example.com', 'anna.kovacs+shop@example.co.uk', 'a@b.cc', 'A@B.CC', 'ánna@példa.hu', 'anna@example', 'anna@@example.com', 'anna@.com', 'anna@example..com', '@example.com', 'anna@', 'anna example@x.com',
      'anna@exa mple.com', '', ' ', 'anna@example.com ', 'a..b@example.com', 'a@b.c', `${'x'.repeat(64)}@example.com`, `${'x'.repeat(250)}@e.co`, 'user@[127.0.0.1]', '"quoted"@example.com', 'a,b@example.com', 'a;b@example.com',
    ]
    const phones = ['+36 30 123 4567', '06 30 123 4567', '(020) 123 4567', '123', '12345', '123456', '12-34-56', 'abcdefgh', '+31 6 1234 5678 ext. 9', '1234567890123456789012345678901', '+', '', '0036301234567', '12 34 5x 678']
    for (const email of emails) expect(forms.isEmail(email), JSON.stringify(email)).toBe(serverIsEmail(email))
    for (const phone of phones) expect(forms.isPhone(phone), JSON.stringify(phone)).toBe(serverIsPhone(phone))
    expect(forms.EMAIL_MAX).toBe(254)
  })
})

// ---- the contact form -------------------------------------------------------------------------------------------------------

describe('what the contact form sends', () => {
  const draft = (overrides: Record<string, unknown> = {}) => ({ name: 'Anna Kovács', email: 'anna@example.com', kind: 'project', subject: 'A new website', message: 'I would like a small website for my bakery.', consent: true, ...overrides })
  let counter = 0
  const unique = (value: Record<string, unknown>): Record<string, any> => ({ ...value, subject: `${String(value.subject).slice(0, 140)} #${counter++}`.slice(0, 150) })

  async function bothSides(overrides: Record<string, unknown>, options: { distinct?: boolean } = {}) {
    const value = draft(overrides)
    const errors = contactValidation.validateContact(value, { requireConsent: true })
    const request = contactValidation.toContactRequest({ ...value, kind: value.kind ?? 'other' }, 'en')
    const response = await server.api('/api/contact', { body: options.distinct === false ? request : { ...request, subject: String(request.subject) } })
    return { website: Object.keys(errors).length === 0, backend: response.status === 201 || response.status === 200, status: response.status, errors }
  }

  it('is accepted by the backend: the request the form builds for a valid draft, in each language and for each topic', async () => {
    for (const language of ['hu', 'en', 'nl'] as const) {
      for (const kind of contactTypes.CONTACT_KINDS) {
        const value = unique(draft({ kind }))
        expect(contactValidation.validateContact(value, { requireConsent: true })).toEqual({})
        const response = await server.api('/api/contact', { body: contactValidation.toContactRequest(value, language) })
        expect(response.status, `${language} ${kind}`).toBe(201)
        expect(response.json.data.status).toBe('received')
      }
    }
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 12 })
  })

  it('is judged the same by the form and by the backend at every edge of every field', async () => {
    const edges: [string, Record<string, unknown>][] = [
      ['name 1', { name: 'A' }], ['name 2', { name: 'Al' }], ['name 100', { name: 'n'.repeat(100) }], ['name 101', { name: 'n'.repeat(101) }], ['name blank', { name: '   ' }], ['name padded', { name: `  ${'n'.repeat(100)}  ` }],
      ['email blank', { email: '' }], ['email bad', { email: 'anna@' }], ['email 254', { email: `${'e'.repeat(64)}@${'d'.repeat(63)}.${'d'.repeat(63)}.${'d'.repeat(55)}.com`.slice(0, 254) }], ['email 255', { email: `${'x'.repeat(250)}@example.com` }],
      ['subject 2', { subject: 'Hi' }], ['subject 3', { subject: 'Hey' }], ['subject 150', { subject: 's'.repeat(150) }], ['subject 151', { subject: 's'.repeat(151) }], ['subject blank', { subject: ' ' }],
      ['message 9', { message: 'm'.repeat(9) }], ['message 10', { message: 'm'.repeat(10) }], ['message 3000', { message: 'm'.repeat(3000) }], ['message 3001', { message: 'm'.repeat(3001) }], ['message blank', { message: '\n\n  ' }],
      ['message with lines', { message: `${'line of text\n'.repeat(20)}end` }],
      ['no consent', { consent: false }], ['no topic', { kind: null }],
    ]
    const disagreements: string[] = []
    for (const [label, overrides] of edges) {
      const value = unique(draft(overrides))
      const errors = contactValidation.validateContact({ ...value, subject: overrides.subject ?? value.subject }, { requireConsent: true })
      const website = Object.keys(errors).length === 0
      // A draft the form refuses is never sent; to see what the backend would say, send what it would have built.
      const request = { form: 'contact', language: 'en', kind: value.kind, name: String(value.name).trim(), email: String(value.email).trim(), subject: String(overrides.subject ?? value.subject).trim(), message: String(value.message).trim(), consent: value.consent }
      const response = await server.api('/api/contact', { body: request })
      const backend = response.status === 201 || response.status === 200
      if (website !== backend) disagreements.push(`${label}: form ${website ? 'accepts' : 'refuses'}, backend ${response.status}`)
    }
    expect(disagreements).toEqual([])
  })

  it('never passes the form and fails at the backend, whatever is typed', async () => {
    // A few thousand characters of every kind: emoji, combining marks, line separators, control characters, RTL marks.
    const strange = ['😀'.repeat(60), 'é'.repeat(40), 'line separator and a paragraph mark', 'tab\tand\u0007bell\u0000nul in the middle', '‮evil right-to-left override‬', 'Árvíztűrő tükörfúrógép — „idézőjelek”', '日本語のメッセージです。ありがとう。', 'مرحبا بالعالم هذه رسالة', "'; DROP TABLE inquiries; --", '<b>bold</b> & "quotes" in a sentence']
    for (const text of strange) {
      const result = await bothSides({ name: `${text}`.slice(0, 100) || 'Aa', subject: `${text} subject`.slice(0, 150), message: `${text} — and some more words so it is long enough`.slice(0, 3000) })
      if (result.website) expect(result.backend, `${JSON.stringify(text)} -> ${result.status}`).toBe(true)
    }
  })

  it('travels through the website\'s own transport: "sent" for a stored message, a refusal for anything else, never a false success', async () => {
    const transport = submit.endpointTransport(`${server.url}/api/contact`)
    const request = contactValidation.toContactRequest(unique(draft()), 'nl')
    // The website reads the server's answer: the reference to quote, and (for a quote request) the private status link and whether a confirmation is on its way.
    expect(await transport.submit(request)).toMatchObject({ status: 'sent', receipt: { reference: expect.stringMatching(/^(C-[A-Z0-9]{8}|CC-\d{4}-\d{6})$/) } })
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 1 })
    expect(await transport.submit({ ...request, email: 'not an address', subject: 'Another subject' })).toEqual({ status: 'failed', reason: 'rejected' })
    expect(await transport.submit({ ...request, consent: false, subject: 'No consent' })).toEqual({ status: 'failed', reason: 'rejected' })
    expect(server.db.get('SELECT COUNT(*) AS n FROM inquiries')).toEqual({ n: 1 })
    server.db.close()
    expect(await transport.submit({ ...request, subject: 'Database gone' })).toEqual({ status: 'failed', reason: 'rejected' }) // 503 is a failure, not a success
    expect(await submit.endpointTransport('http://127.0.0.1:9/api/contact').submit(request)).toEqual({ status: 'failed', reason: 'network' })
  })

  it('arrives from the website\'s own page: a request from an allowed origin is accepted, with the headers a browser sends', async () => {
    await server.close()
    server = await startServer({ env: { CORS_ORIGINS: 'https://owner-site.example' } })
    const request = contactValidation.toContactRequest(unique(draft()), 'hu')
    const response = await fetch(`${server.url}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://owner-site.example' },
      body: JSON.stringify(request),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    })
    expect(response.status).toBe(201)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://owner-site.example')
  })
})

// ---- the quote configurator --------------------------------------------------------------------------------------------------

describe('what the quote configurator sends', () => {
  const details = (overrides: Record<string, unknown> = {}) => ({
    ...inquiry.EMPTY_DETAILS,
    description: 'A small website for a bakery, with opening hours and a contact form.',
    objective: 'present',
    timing: 'months',
    name: 'Anna Kovács',
    email: 'anna@example.com',
    consent: true,
    ...overrides,
  })
  let counter = 0
  const build = (lines: { need: string; plan: string; extras: string[] }[], overrides: Record<string, unknown> = {}, language = 'en') => {
    let current = cart.EMPTY_CART
    for (const line of lines) current = cart.upsertLine(current, line)
    const value = details({ description: `A small website for a bakery, with opening hours and a contact form. Request ${counter++}.`, ...overrides })
    return { value, current, request: inquiry.toRequest(current, value, language) }
  }

  it('is accepted by the backend for every package the website sells, for every need it is sold for, with every add-on that fits', async () => {
    const failures: string[] = []
    let sent = 0
    for (const pack of seed.packages) {
      for (const need of pack.needs) {
        const extras = seed.extras.filter((extra) => extra.appliesTo.includes(need) && pack.extras.includes(extra.code)).map((extra) => extra.code)
        const { value, current, request } = build([{ need, plan: pack.code, extras }])
        expect(inquiry.firstInvalidStep(current, value, { requireConsent: true }), `${pack.code}/${need}`).toBeNull()
        const response = await server.api('/api/quote-requests', { body: request })
        sent += 1
        if (response.status !== 201) failures.push(`${pack.code}/${need} [${extras.join(',')}] -> ${response.status} ${JSON.stringify(response.json?.error?.details ?? response.json?.error)}`)
      }
    }
    expect(failures).toEqual([])
    expect(sent).toBeGreaterThanOrEqual(10)
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: sent })
  })

  it('is accepted for a custom project, for every need, in every language', async () => {
    for (const need of ids.NEED_IDS) {
      for (const language of ['hu', 'en', 'nl']) {
        const { request } = build([{ need, plan: 'custom', extras: [] }], {}, language)
        const response = await server.api('/api/quote-requests', { body: request })
        expect(response.status, `${need}/${language} ${JSON.stringify(response.json?.error?.details)}`).toBe(201)
      }
    }
  })

  it('is accepted for several services at once, and for every answer the form offers', async () => {
    const lines = [
      { need: 'website', plan: 'launch', extras: ['pages', 'api'] },
      { need: 'webapp', plan: 'build', extras: [] },
      { need: 'ui', plan: 'grow', extras: ['motion'] },
      { need: 'integrations', plan: 'custom', extras: [] },
    ]
    expect((await server.api('/api/quote-requests', { body: build(lines).request })).status).toBe(201)
    for (const objective of [null, ...inquiry.OBJECTIVES]) {
      for (const timing of [null, ...inquiry.TIMINGS]) {
        const { request } = build([{ need: 'website', plan: 'launch', extras: [] }], { objective, timing, reference: objective ? 'https://example.com/inspiration' : '', requirements: timing ? 'Must be accessible.' : '', phone: timing ? '+36 30 123 4567' : '' })
        const response = await server.api('/api/quote-requests', { body: request })
        expect(response.status, `${objective}/${timing} ${JSON.stringify(response.json?.error?.details)}`).toBe(201)
      }
    }
  })

  it('is judged the same by the form and by the backend at every edge of every field', async () => {
    const edges: [string, Record<string, unknown>][] = [
      ['description 19', { description: 'd'.repeat(19) }], ['description 20', { description: 'd'.repeat(20) }], ['description 2000', { description: 'd'.repeat(2000) }], ['description 2001', { description: 'd'.repeat(2001) }], ['description blank', { description: '  ' }],
      ['reference 500', { reference: 'r'.repeat(500) }], ['reference 501', { reference: 'r'.repeat(501) }],
      ['requirements 2000', { requirements: 'q'.repeat(2000) }], ['requirements 2001', { requirements: 'q'.repeat(2001) }],
      ['name 1', { name: 'A' }], ['name 2', { name: 'Al' }], ['name 100', { name: 'n'.repeat(100) }], ['name 101', { name: 'n'.repeat(101) }],
      ['email bad', { email: 'anna@' }], ['email blank', { email: '' }],
      ['phone ok', { phone: '+36 30 123 4567' }], ['phone short', { phone: '123' }], ['phone 30', { phone: `+${'1'.repeat(29)}` }], ['phone 31', { phone: `+${'1'.repeat(30)}` }], ['phone letters', { phone: 'call me maybe' }],
      ['no consent', { consent: false }],
    ]
    const disagreements: string[] = []
    for (const [label, overrides] of edges) {
      const value = details({ description: `A small website for a bakery, with opening hours. Edge ${counter++}.`, ...overrides })
      let current = cart.EMPTY_CART
      current = cart.upsertLine(current, { need: 'website', plan: 'launch', extras: [] })
      const website = inquiry.firstInvalidStep(current, value, { requireConsent: true }) === null
      // Send what the form would have built even when it would not have let the visitor press the button.
      const request = inquiry.toRequest(current, value, 'en')
      const response = await server.api('/api/quote-requests', { body: request })
      const backend = response.status === 201 || response.status === 200
      if (website !== backend) disagreements.push(`${label}: form ${website ? 'accepts' : 'refuses'}, backend ${response.status}`)
    }
    expect(disagreements).toEqual([])
  })

  it('does not let the website name a price: the backend takes the codes and reads the prices from its own catalogue', async () => {
    const { request } = build([{ need: 'website', plan: 'launch', extras: ['pages'] }])
    const keys = Object.keys(request).sort()
    expect(keys).toEqual(['budgetRange', 'company', 'companyWebsite', 'consent', 'description', 'email', 'form', 'items', 'language', 'marketing', 'name', 'objective', 'phone', 'reference', 'requirements', 'timing', 'version'])
    expect(JSON.stringify(request)).not.toMatch(/price|amount|currency|total|vat/i)
    // Even a request that does name prices (a modified page, a script) is priced from the catalogue alone: the figures are not read.
    const response = await server.api('/api/quote-requests', { body: { ...request, items: [{ ...request.items[0], price: 1, amount: 1, snapshot: { plan: { code: 'launch', price: { kind: 'from', amount: 1, currency: 'EUR' }, vat: 'included' } } }], total: 1, pricing: { fixed: [{ currency: 'EUR', amount: 1, vat: 'included' }] } } })
    expect(response.status).toBe(201)
    expect(response.json.data.pricing).toEqual({ fixed: [], quotedParts: 2 })
    const stored = server.db.get<{ snapshot_json: string }>('SELECT price_snapshot AS snapshot_json FROM quote_request_items')!
    expect(JSON.parse(stored.snapshot_json)).toMatchObject({ plan: { code: 'launch', price: { kind: 'quote' } } })
    expect(stored.snapshot_json).not.toContain('"amount":1')
  })

  it('travels through the website\'s own transport', async () => {
    const transport = submit.endpointTransport(`${server.url}/api/quote-requests`)
    const { request } = build([{ need: 'website', plan: 'launch', extras: ['pages'] }])
    // The website reads the server's answer: the reference to quote, and (for a quote request) the private status link and whether a confirmation is on its way.
    expect(await transport.submit(request)).toMatchObject({ status: 'sent', receipt: { reference: expect.stringMatching(/^(C-[A-Z0-9]{8}|CC-\d{4}-\d{6})$/) } })
    expect(await transport.submit({ ...request, items: [{ need: 'website', plan: 'platinum', extras: [] }] })).toEqual({ status: 'failed', reason: 'rejected' })
    expect(server.db.get('SELECT COUNT(*) AS n FROM quote_requests')).toEqual({ n: 1 })
  })
})

// ---- the catalogue ------------------------------------------------------------------------------------------------------------

describe("the portfolio and the website's own wording", () => {
  it("has seed files that are exactly what the website's content produces (the pictures' sizes and hashes are read from public/)", async () => {
    const { readFileSync } = await import('node:fs')
    const projects = JSON.parse(readFileSync(join(root, 'server', 'seed', 'projects.seed.json'), 'utf8'))
    const built = JSON.parse(JSON.stringify(projectsExport.buildProjectsSeed()))
    expect(projects.projects).toEqual(built.projects)
    expect(projects.categories).toEqual(built.categories)
    expect(projects.media.map(({ path, mime, width, height }: Record<string, unknown>) => ({ path, mime, width, height }))).toEqual(built.media)
    const manifest = JSON.parse(readFileSync(join(root, 'server', 'seed', 'texts.manifest.json'), 'utf8'))
    expect(manifest).toEqual(JSON.parse(JSON.stringify(textsExport.buildTextsManifest())))
  })

  it("has a shop seed (the tier comparison and the FULL EXPERIENCE offer) that is exactly what the website's content produces, and that the server accepts", async () => {
    const { readFileSync } = await import('node:fs')
    const onDisk = JSON.parse(readFileSync(join(root, 'server', 'seed', 'shop.seed.json'), 'utf8'))
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(catalogExport.buildShopSeed())))
    const { parseComparison, parseFullExperience } = await import('../src/modules/shop/documents.ts')
    // What the server stores is what the seed says: nothing is dropped or changed by its checks.
    expect(parseComparison(onDisk.comparison, seed.packages.map((pack) => pack.code))).toEqual(onDisk.comparison)
    expect(parseFullExperience(onDisk.fullExperience)).toEqual(onDisk.fullExperience)
  })

  it('lets the server accept every project document the website itself has (nothing in the seed is refused)', async () => {
    const { normalizeContent } = await import('../src/modules/projects/content.ts')
    for (const project of projectsExport.buildProjectsSeed().projects as Array<{ slug: string; content: Record<string, unknown> }>) {
      const content = JSON.parse(JSON.stringify(project.content))
      // Pictures are named by path in the seed and by id once loaded: give each a stand-in id.
      let next = 0
      const withIds = (image: Record<string, unknown>) => ({ ...image, mediaId: (next += 1) })
      if (content.thumbnail) content.thumbnail = withIds(content.thumbnail)
      content.gallery = content.gallery.map(withIds)
      const { errors } = normalizeContent(content)
      expect(errors, project.slug).toEqual({})
    }
  })
})

describe('the catalogue the backend serves', () => {
  it('is the website\'s own: the seed file is exactly what the website\'s content produces, and the backend starts from it', async () => {
    const { readFileSync } = await import('node:fs')
    const onDisk = JSON.parse(readFileSync(join(root, 'server', 'seed', 'catalog.seed.json'), 'utf8'))
    expect(onDisk).toEqual(JSON.parse(JSON.stringify(catalogExport.buildCatalogSeed())))
    const served = (await server.api('/api/packages?lang=all')).json.data
    expect(served.map((pack: { code: string }) => pack.code)).toEqual(seed.packages.map((pack) => pack.code))
    for (const pack of seed.packages) {
      const found = served.find((candidate: { code: string }) => candidate.code === pack.code)
      expect([...found.needs].sort(), pack.code).toEqual([...pack.needs].sort())
      expect([...found.extras].sort(), pack.code).toEqual([...pack.extras].sort())
    }
    const extras = (await server.api('/api/shop/extras?lang=all')).json.data
    expect(extras.map((extra: { code: string }) => extra.code).sort()).toEqual(seed.extras.map((extra) => extra.code).sort())
  })

  it('shows no price the website does not show: while every package is "on request", so is every price served', async () => {
    const packages = (await server.api('/api/packages')).json.data
    const extras = (await server.api('/api/shop/extras')).json.data
    for (const item of [...packages, ...extras]) expect(item.price, item.code).toEqual({ kind: 'quote' })
    expect(JSON.stringify(apiConfig.apiEndpoint('/api/contact', 'https://api.example.com'))).toBe('"https://api.example.com/api/contact"')
  })
})

describe('where the website looks for the backend', () => {
  it('has a single address to set, which can be the backend\'s origin or "/" when the backend serves the website too', () => {
    expect(apiConfig.apiBase('https://api.example.com/')).toBe('https://api.example.com')
    expect(apiConfig.apiBase('https://api.example.com/some/path/')).toBe('https://api.example.com/some/path')
    expect(apiConfig.apiBase('/')).toBe('')
    expect(apiConfig.apiBase('http://localhost:8787', true)).toBe('http://localhost:8787')
    expect(apiConfig.apiBase('http://localhost:8787', false)).toBeNull() // plain http only while developing
    expect(apiConfig.apiBase('http://api.example.com', true)).toBeNull() // and never to another host
    for (const value of [undefined, null, '', '   ', 42, 'not a url', 'ftp://example.com', 'https://user:pass@example.com', 'javascript:alert(1)']) expect(apiConfig.apiBase(value), String(value)).toBeNull()
    expect(apiConfig.apiEndpoint('/api/contact', null)).toBeNull()
    expect(apiConfig.apiEndpoint('/api/contact', '')).toBe('/api/contact')
    expect(submit.normalizeEndpoint('/api/contact')).toBe('/api/contact')
    for (const value of ['//evil.example/api/contact', '/../etc/passwd', '/api/../x', 'api/contact', '/api contact']) expect(submit.normalizeEndpoint(value), value).toBeNull()
  })
})
