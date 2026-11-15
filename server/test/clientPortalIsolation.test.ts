import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { newId } from '../src/lib/crypto.ts'
import { addQuoteNote } from '../src/modules/quotes/repository.ts'
import { makeKit as makeBookingKit, SLOT_10, SLOT_11, type Kit as BookingKit } from './bookingKit.ts'
import { portalOnBookings, type Customer, type PortalKit } from './portalKit.ts'

/**
 * The line the whole portal rests on (PROMPT 25): a customer sees their own records and nothing else, whatever they send. Two customers each have a
 * quote request with an accepted quote, a booking, a project with milestones, updates and a private note, and a published document. Customer A then tries
 * everything a person with a browser's developer tools could: B's references, ids in the query and the body, forged headers, guessed neighbours. Every answer
 * for something that is B's must be exactly the answer for something that does not exist, and none of B's words may appear anywhere in A's answers.
 */

let bookings: BookingKit
let kit: PortalKit
let anna: Customer
let bela: Customer
const facts: { annaRequest: string; belaRequest: string; annaBooking: string; belaBooking: string; annaProject: string; belaProject: string; annaDocument: string; belaDocument: string; belaProjectId: string } = {} as never

const MARKERS = ['BELA-ONLY-REQUEST', 'BELA-ONLY-QUOTE', 'BELA-ONLY-BOOKING', 'BELA-ONLY-PROJECT', 'BELA-ONLY-MILESTONE', 'BELA-ONLY-UPDATE', 'BELA-ONLY-DOCUMENT', 'BELA-PRIVATE-NOTE']

beforeEach(async () => {
  bookings = await makeBookingKit()
  kit = await portalOnBookings(bookings, { selfLinking: true })
  anna = await kit.customer('anna@example.com')
  bela = await kit.customer('bela@example.com')
  const db = kit.server.db

  const annaRequest = await kit.accepted('anna@example.com', { request: { description: 'ANNA-ONLY-REQUEST: a small website for the bakery.' }, quote: { title: 'ANNA-ONLY-QUOTE' } })
  const belaRequest = await kit.accepted('bela@example.com', { request: { description: 'BELA-ONLY-REQUEST: a web shop for the garage.' }, quote: { title: 'BELA-ONLY-QUOTE' } })
  await kit.link(anna.id, 'quote_request', annaRequest.id)
  await kit.link(bela.id, 'quote_request', belaRequest.id)
  facts.annaRequest = annaRequest.reference
  facts.belaRequest = belaRequest.reference

  const annaBooking = await bookings.book({ email: 'anna@example.com', description: 'ANNA-ONLY-BOOKING' })
  const belaBooking = await bookings.book({ email: 'bela@example.com', start: SLOT_10, description: 'BELA-ONLY-BOOKING: please call the garage.' })
  expect(annaBooking.status, annaBooking.text).toBe(201)
  expect(belaBooking.status, belaBooking.text).toBe(201)
  facts.annaBooking = annaBooking.json.data.reference
  facts.belaBooking = belaBooking.json.data.reference
  for (const [who, reference] of [[anna, facts.annaBooking], [bela, facts.belaBooking]] as const) await kit.link(who.id, 'booking', db.get<{ id: string }>('SELECT id FROM bookings WHERE reference = ?', [reference])!.id)

  const annaProject = await kit.project(anna.id, { name: 'ANNA-ONLY-PROJECT', quoteRequestId: annaRequest.id })
  const belaProject = await kit.project(bela.id, { name: 'BELA-ONLY-PROJECT', quoteRequestId: belaRequest.id })
  facts.annaProject = annaProject.reference
  facts.belaProject = belaProject.reference
  facts.belaProjectId = belaProject.id
  await kit.post(`/api/admin/client-projects/${belaProject.id}/milestones`, { title: 'BELA-ONLY-MILESTONE', dueOn: '2026-12-01' })
  await kit.post(`/api/admin/client-projects/${belaProject.id}/updates`, { kind: 'update', note: 'BELA-ONLY-UPDATE about the garage shop.', notify: false })
  // The owner's private words: a note on the project, on the quote request and on the booking. None of them may ever reach a customer.
  await kit.post(`/api/admin/client-projects/${belaProject.id}/notes`, { body: 'BELA-PRIVATE-NOTE on the project' })
  const owner = db.get<{ id: string }>("SELECT id FROM admin_users WHERE email = 'owner@site.test'")!.id
  addQuoteNote(db, belaRequest.id, owner, 'BELA-PRIVATE-NOTE on the request', new Date().toISOString())
  const bookingId = db.get<{ id: string }>('SELECT id FROM bookings WHERE reference = ?', [facts.belaBooking])!.id
  await kit.api(`/api/admin/bookings/${bookingId}/actions`, { headers: bookings.admin, body: { action: 'note', text: 'BELA-PRIVATE-NOTE on the booking' } })

  // A published document of each (the table only allows publishing with a place for the bytes, so the rows carry an opaque key).
  for (const [project, key, title] of [[annaProject.id, 'key-a', 'ANNA-ONLY-DOCUMENT'], [belaProject.id, 'key-b', 'BELA-ONLY-DOCUMENT']] as const) {
    const id = newId()
    db.run("INSERT INTO client_documents (id, project_id, title, kind, file_name, mime_type, size_bytes, storage_key, published_at, created_at) VALUES (?, ?, ?, 'brief', 'brief.pdf', 'application/pdf', 10, ?, ?, ?)", [id, project, title, key, '2026-11-03T10:00:00.000Z', '2026-11-03T10:00:00.000Z'])
    if (project === annaProject.id) facts.annaDocument = id
    else facts.belaDocument = id
  }
})

afterEach(async () => {
  await kit?.close()
})

/** Every address that returns something about a record, for the customer to read. */
const readPaths = () => [
  '/api/portal/session',
  '/api/portal/overview',
  '/api/portal/projects',
  `/api/portal/projects/${facts.annaProject}`,
  '/api/portal/requests',
  `/api/portal/requests/${facts.annaRequest}`,
  '/api/portal/bookings',
  `/api/portal/bookings/${facts.annaBooking}`,
  '/api/portal/documents',
  '/api/portal/link-candidates',
  '/api/portal/sessions',
]

describe('what each customer sees', () => {
  it('lists only their own records', async () => {
    const projects = (await anna.get('/api/portal/projects')).json.data
    expect(projects.map((project: { reference: string }) => project.reference)).toEqual([facts.annaProject])
    expect((await anna.get('/api/portal/requests')).json.data.map((row: { reference: string }) => row.reference)).toEqual([facts.annaRequest])
    expect((await anna.get('/api/portal/bookings')).json.data.map((row: { reference: string }) => row.reference)).toEqual([facts.annaBooking])
    expect((await anna.get('/api/portal/documents')).json.data.map((row: { id: string }) => row.id)).toEqual([facts.annaDocument])
    const overview = (await anna.get('/api/portal/overview')).json.data
    expect(overview.counts).toMatchObject({ requests: 1, bookings: 1 })
    expect((await bela.get('/api/portal/projects')).json.data.map((project: { reference: string }) => project.reference)).toEqual([facts.belaProject])
  })

  it('and none of the other customer’s words appear in any answer, however it is asked', async () => {
    const seen: string[] = []
    for (const path of readPaths()) {
      const reply = await anna.get(path)
      expect(reply.status, path).toBe(200)
      seen.push(reply.text)
    }
    const text = seen.join('\n')
    for (const marker of MARKERS) expect(text, marker).not.toContain(marker)
    expect(text).not.toContain('bela@example.com')
    expect(text).toContain('ANNA-ONLY-PROJECT')
  })
})

describe('what a customer cannot reach', () => {
  it('another customer’s project, request, booking and document answer exactly as something that does not exist', async () => {
    const pairs: [string, string][] = [
      [`/api/portal/projects/${facts.belaProject}`, '/api/portal/projects/PRJ-ZZZZZZZZ'],
      [`/api/portal/requests/${facts.belaRequest}`, '/api/portal/requests/CC-2026-999999'],
      [`/api/portal/bookings/${facts.belaBooking}`, '/api/portal/bookings/BK-2026-999999'],
      [`/api/portal/documents/${facts.belaDocument}/download`, `/api/portal/documents/${newId()}/download`],
    ]
    for (const [theirs, missing] of pairs) {
      const real = await anna.get(theirs)
      const none = await anna.get(missing)
      expect(real.status, theirs).toBe(404)
      expect(none.status, missing).toBe(404)
      expect(real.json.error.code).toBe(none.json.error.code)
      expect(real.json.error.message).toBe(none.json.error.message)
      expect(real.text.replace(/"requestId":"[^"]+"/, '')).toBe(none.text.replace(/"requestId":"[^"]+"/, ''))
    }
  })

  it('cannot open another customer’s quote page or booking page through the portal', async () => {
    for (const [path, body] of [[`/api/portal/requests/${facts.belaRequest}/open`, {}], [`/api/portal/requests/${facts.belaRequest}/open`, { quote: 'Q-ANYTHING' }], [`/api/portal/bookings/${facts.belaBooking}/open`, {}]] as const) {
      expect((await anna.post(path, body)).status, path).toBe(404)
    }
    // …nor name B's quote under A's own request.
    expect((await anna.post(`/api/portal/requests/${facts.annaRequest}/open`, { quote: 'Q-NOT-MINE' })).status).toBe(404)
  })

  it('a customer id, a reference or an address sent in the request changes nothing: the identity is the session', async () => {
    const headers = { Cookie: anna.cookie }
    const forged = [
      { ...headers, 'X-Customer-Id': bela.id },
      { ...headers, 'X-User-Id': bela.id, 'X-Forwarded-User': 'bela@example.com' },
      { ...headers, Authorization: `Bearer ${bela.id}` },
    ]
    for (const extra of forged) {
      const reply = await kit.server.api('/api/portal/projects', { headers: extra })
      expect(reply.json.data.map((project: { reference: string }) => project.reference)).toEqual([facts.annaProject])
    }
    for (const query of [`?customerId=${bela.id}`, `?customer=${bela.id}`, `?email=bela@example.com`, `?reference=${facts.belaProject}`, `?id=${facts.belaProjectId}`]) {
      for (const path of ['/api/portal/projects', '/api/portal/overview', '/api/portal/requests', '/api/portal/bookings']) {
        const reply = await anna.get(`${path}${query}`)
        for (const marker of MARKERS) expect(reply.text, `${path}${query}`).not.toContain(marker)
      }
    }
    // A body that names an account is refused outright, never used.
    const profile = await anna.patch('/api/portal/profile', { name: 'Anna', customerId: bela.id })
    expect(profile.status).toBe(422)
    const after = kit.server.db.all<{ email: string; name: string | null }>('SELECT email, name FROM customers ORDER BY email')
    expect(after).toEqual([{ email: 'anna@example.com', name: null }, { email: 'bela@example.com', name: null }])
  })

  it('guessing neighbouring references finds only what is the customer’s own', async () => {
    const found: string[] = []
    for (let n = 1; n <= 12; n += 1) {
      const reference = `CC-2026-${String(n).padStart(6, '0')}`
      if ((await anna.get(`/api/portal/requests/${reference}`)).status === 200) found.push(reference)
    }
    expect(found).toEqual([facts.annaRequest])
    const bookingsFound: string[] = []
    for (let n = 1; n <= 12; n += 1) {
      const reference = `BK-2026-${String(n).padStart(6, '0')}`
      if ((await anna.get(`/api/portal/bookings/${reference}`)).status === 200) bookingsFound.push(reference)
    }
    expect(bookingsFound).toEqual([facts.annaBooking])
  })

  it('the one document a customer may reach is their own, and it stops at the missing store, not at a path', async () => {
    const own = await anna.get(`/api/portal/documents/${facts.annaDocument}/download`)
    // Authorized, but the site has no private store for files yet: said plainly, with nothing about where a file would be.
    expect(own.status).toBe(503)
    expect(own.text).not.toContain('key-a')
    const unpublished = newId()
    kit.server.db.run("INSERT INTO client_documents (id, project_id, title, kind, created_at) SELECT ?, id, 'Draft', 'brief', ? FROM client_projects WHERE reference = ?", [unpublished, '2026-11-03T10:00:00.000Z', facts.annaProject])
    expect((await anna.get(`/api/portal/documents/${unpublished}/download`)).status).toBe(404)
    expect((await anna.get('/api/portal/documents')).json.data.map((row: { id: string }) => row.id)).toEqual([facts.annaDocument])
  })

  it('a customer cannot change a project, a status or a record through the portal: no address does it', async () => {
    const attempts: [string, string, unknown][] = [
      ['PATCH', `/api/portal/projects/${facts.annaProject}`, { status: 'completed' }],
      ['POST', `/api/portal/projects/${facts.annaProject}/status`, { status: 'completed' }],
      ['PUT', `/api/portal/projects/${facts.annaProject}`, { status: 'completed' }],
      ['DELETE', `/api/portal/projects/${facts.annaProject}`, {}],
      ['POST', '/api/portal/projects', { name: 'Mine', category: 'website' }],
      ['POST', `/api/portal/documents`, { title: 'x' }],
      ['POST', `/api/admin/client-projects/${facts.belaProjectId}/status`, { status: 'completed' }],
    ]
    for (const [method, path, body] of attempts) {
      const reply = await kit.server.api(path, { method, body, headers: anna.headers })
      expect([401, 404, 405], `${method} ${path}`).toContain(reply.status)
    }
    expect(kit.server.db.all('SELECT status FROM client_projects ORDER BY reference').every((row) => (row as { status: string }).status === 'awaiting_start')).toBe(true)
  })
})

describe('the owner changing who owns what', () => {
  it('unlinking a record takes it away from the customer at once', async () => {
    const detail = await kit.api(`/api/admin/clients/${anna.id}`, { headers: { Cookie: kit.admin.Cookie } })
    const link = detail.json.data.links.find((entry: { reference: string }) => entry.reference === facts.annaRequest)
    expect((await anna.get(`/api/portal/requests/${facts.annaRequest}`)).status).toBe(200)
    const removed = await kit.api(`/api/admin/clients/${anna.id}/links/${link.id}`, { method: 'DELETE', headers: kit.admin })
    expect(removed.status).toBe(204)
    expect((await anna.get(`/api/portal/requests/${facts.annaRequest}`)).status).toBe(404)
    // The request itself is untouched, and the project that came from it still belongs to the customer.
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM quote_requests WHERE reference = ?', [facts.annaRequest])).toEqual({ n: 1 })
    expect((await anna.get(`/api/portal/projects/${facts.annaProject}`)).json.data.request).toBeNull()
  })

  it('a record already linked to one account cannot be linked to another', async () => {
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM quote_requests WHERE reference = ?', [facts.belaRequest])!.id
    const reply = await kit.api(`/api/admin/clients/${anna.id}/links`, { body: { type: 'quote_request', recordId: id }, headers: kit.admin })
    expect(reply.status).toBe(409)
    expect((await anna.get(`/api/portal/requests/${facts.belaRequest}`)).status).toBe(404)
  })
})

describe('the secure links a customer opens from the portal', () => {
  it('are the ordinary ones: a quote page and a booking page, for the customer’s own record only', async () => {
    const quote = await anna.post(`/api/portal/requests/${facts.annaRequest}/open`, {})
    expect(quote.status).toBe(200)
    expect(quote.json.data.path).toMatch(/^request\/[A-Za-z0-9_-]{43}$/)
    const status = await kit.server.api(`/api/customer/requests/${quote.json.data.path.split('/')[1]}`)
    expect(status.status).toBe(200)
    expect(status.json.data.reference).toBe(facts.annaRequest)

    const detail = (await anna.get(`/api/portal/requests/${facts.annaRequest}`)).json.data
    const reference = detail.quotes[0].reference as string
    const withQuote = await anna.post(`/api/portal/requests/${facts.annaRequest}/open`, { quote: reference })
    const page = await kit.server.api(`/api/customer/quotations/${withQuote.json.data.path.split('/')[1]}`)
    expect(page.status).toBe(200)
    expect(page.json.data.quote.title).toBe('ANNA-ONLY-QUOTE')

    const booking = await anna.post(`/api/portal/bookings/${facts.annaBooking}/open`, {})
    expect(booking.json.data.path).toMatch(/^consultation\/booking\/[A-Za-z0-9_-]{43}$/)
    const manage = await kit.server.api(`/api/consultations/manage/${booking.json.data.path.split('/')[2]}`)
    expect(manage.status).toBe(200)
    expect(manage.json.data.reference).toBe(facts.annaBooking)
  })

  it('last only a couple of hours, and the e-mailed links keep working exactly as before', async () => {
    const quote = await anna.post(`/api/portal/requests/${facts.annaRequest}/open`, {})
    const token = quote.json.data.path.split('/')[1] as string
    const sent = kit.server.mailer.sent.filter((mail) => mail.to === 'anna@example.com' && /\/quote\//.test(mail.text)).at(-1)!
    const emailed = /\/quote\/([A-Za-z0-9_-]{43})/.exec(sent.text)![1]
    kit.server.clock.advance(3 * 3_600_000)
    expect((await kit.server.api(`/api/customer/requests/${token}`)).status).toBe(410)
    // The quotation e-mail's own link was made for the number of days the owner configured: unaffected.
    expect((await kit.server.api(`/api/customer/quotations/${emailed}`)).status).toBe(200)
  })
})

describe('claiming records by a verified address', () => {
  it('finds only records that carry the customer’s own address and belong to nobody', async () => {
    const stray = await kit.request('anna@example.com')
    await kit.request('bela@example.com')
    const candidates = (await anna.get('/api/portal/link-candidates')).json.data
    expect(candidates.map((entry: { reference: string }) => entry.reference)).toEqual([stray.reference])
    expect(candidates[0]).toMatchObject({ type: 'quote_request', id: stray.id })
  })

  it('claims only what the server itself found: an id of someone else’s record links nothing', async () => {
    const stray = await kit.request('anna@example.com')
    const belasStray = await kit.request('bela@example.com')
    const bookingId = kit.server.db.get<{ id: string }>('SELECT id FROM bookings WHERE reference = ?', [facts.belaBooking])!.id
    const none = await anna.post('/api/portal/link-candidates/claim', { ids: [belasStray.id, bookingId, facts.belaProjectId, 'x'.repeat(40)] })
    expect(none.status).toBe(200)
    expect(none.json.data.linked).toBe(0)
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM customer_links WHERE customer_id = ?', [anna.id])).toEqual({ n: 2 })
    const some = await anna.post('/api/portal/link-candidates/claim', { ids: [stray.id, belasStray.id] })
    expect(some.json.data.linked).toBe(1)
    expect((await anna.get(`/api/portal/requests/${stray.reference}`)).status).toBe(200)
    expect((await anna.get(`/api/portal/requests/${belasStray.reference}`)).status).toBe(404)
    expect(kit.server.db.get("SELECT method FROM customer_links WHERE quote_request_id = ?", [stray.id])).toEqual({ method: 'verified_email' })
  })

  it('is refused for a booking and a request of someone else’s address even when they are unlinked', async () => {
    const extra = await bookings.book({ email: 'bela@example.com', start: SLOT_11 })
    expect(extra.status).toBe(201)
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings WHERE reference = ?', [extra.json.data.reference])!.id
    expect((await anna.post('/api/portal/link-candidates/claim', { ids: [id] })).json.data.linked).toBe(0)
    expect((await anna.get(`/api/portal/bookings/${extra.json.data.reference}`)).status).toBe(404)
  })
})
