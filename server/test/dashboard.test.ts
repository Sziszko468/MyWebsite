import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Database } from '../src/db/database.ts'
import { MIGRATIONS_DIRECTORY, migrate, migrationStatus } from '../src/db/migrate.ts'
import { contact, quote, startServer, TestClock, type TestServer } from './helpers.ts'

let server: TestServer
let admin: { cookie: string; csrf: string; email: string }
const cleanup: string[] = []
beforeEach(async () => {
  server = await startServer()
  admin = await server.signIn('admin', 'admin@site.test')
})
afterEach(async () => {
  await server.close()
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

const headers = (who = admin) => ({ Cookie: who.cookie, 'X-CSRF-Token': who.csrf })
const get = (path: string, who = admin) => server.api(path, { headers: { Cookie: who.cookie } })
const send = (method: string, path: string, body?: unknown, who = admin) => server.api(path, { method, body, headers: headers(who) })

async function messages(count: number, overrides: (i: number) => Record<string, unknown> = () => ({})): Promise<string[]> {
  for (let i = 0; i < count; i += 1) {
    expect((await server.api('/api/contact', { body: contact({ subject: `Subject ${i}`, message: `Message body ${i}, long enough to be accepted.`, ...overrides(i) }) })).status).toBe(201)
    server.clock.advance(1000)
  }
  return server.db.all<{ id: string }>('SELECT id FROM inquiries ORDER BY created_at, id').map((row) => row.id)
}
async function quotes(count: number, overrides: (i: number) => Record<string, unknown> = () => ({})): Promise<string[]> {
  for (let i = 0; i < count; i += 1) {
    expect((await server.api('/api/quote-requests', { body: quote({ description: `Request ${i}: a small website with a contact form.`, ...overrides(i) }) })).status).toBe(201)
    server.clock.advance(1000)
  }
  return server.db.all<{ id: string }>('SELECT id FROM quote_requests ORDER BY created_at, id').map((row) => row.id)
}

// ---- the schema change ------------------------------------------------------------------------------------------------------

describe('migration 0002', () => {
  it('maps the old inquiry statuses, keeps every note and link, and adds what the administration needs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-mig-'))
    cleanup.push(directory)
    mkdirSync(directory, { recursive: true })
    copyFileSync(join(MIGRATIONS_DIRECTORY, '0001_init.sql'), join(directory, '0001_init.sql'))
    const clock = new TestClock()
    const db = new Database(':memory:')
    try {
      migrate(db, clock, directory)
      const now = clock.now().toISOString()
      db.run("INSERT INTO admin_users (id, email, password_hash, role, created_at, updated_at) VALUES ('u1', 'a@site.test', 'x', 'admin', ?, ?)", [now, now])
      db.run("INSERT INTO admin_sessions (token_hash, user_id, csrf_token, created_at, last_seen_at, expires_at) VALUES ('h1', 'u1', 'c', ?, ?, ?)", [now, now, '2099-01-01T00:00:00.000Z'])
      for (const [id, status] of [['i1', 'new'], ['i2', 'in_progress'], ['i3', 'answered'], ['i4', 'closed']] as const) {
        db.run("INSERT INTO inquiries (id, reference, language, kind, name, email, subject, message, status, content_hash, created_at, updated_at) VALUES (?, ?, 'en', 'project', 'N', 'n@x.test', 's', 'm', ?, ?, ?, ?)", [id, `C-${id}`, status, id, now, now])
        db.run("INSERT INTO inquiry_notes (inquiry_id, author_id, body, created_at) VALUES (?, 'u1', 'a note', ?)", [id, now])
      }
      db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, created_at, updated_at) VALUES ('d1', 'inquiry_status', 'inquiry', 'i3', 'n@x.test', 'en', 'accepted', ?, ?)", [now, now])
      expect(migrationStatus(db, directory)).toMatchObject({ current: 1, pending: 0 })

      expect(migrate(db, clock)).toEqual([2, 3, 4, 5, 6])

      expect(db.all('SELECT id, status FROM inquiries ORDER BY id')).toEqual([
        { id: 'i1', status: 'new' }, { id: 'i2', status: 'in_progress' }, { id: 'i3', status: 'waiting_client' }, { id: 'i4', status: 'completed' },
      ])
      expect(db.get('SELECT COUNT(*) AS n FROM inquiry_notes')).toEqual({ n: 4 }) // dropping the old table did not cascade into them
      expect(db.all('PRAGMA foreign_key_check')).toEqual([])
      expect(db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 }) // and enforcement is back on
      expect(() => db.run("UPDATE inquiries SET status = 'answered' WHERE id = 'i1'")).toThrow() // the new vocabulary is enforced by the database
      expect(db.get("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_inquiries_%'")).toEqual({ n: 5 })
      expect(db.get<{ public_id: string }>("SELECT public_id FROM admin_sessions WHERE token_hash = 'h1'")?.public_id).toMatch(/^[0-9a-f]{16}$/)
      expect(db.all("SELECT name FROM pragma_table_info('admin_users') WHERE name IN ('ui_language', 'ui_theme') ORDER BY name")).toHaveLength(2)
      expect(db.all("SELECT name FROM pragma_table_info('quote_requests') WHERE name = 'inquiry_id'")).toHaveLength(1)
      db.run("UPDATE inquiries SET status = 'completed' WHERE id = 'i1'")
      // Deleting an inquiry deletes its notes (the cascade still works on the rebuilt table).
      db.run("DELETE FROM inquiries WHERE id = 'i1'")
      expect(db.get("SELECT COUNT(*) AS n FROM inquiry_notes WHERE inquiry_id = 'i1'")).toEqual({ n: 0 })
    } finally {
      db.close()
    }
  })
})

// ---- the overview -----------------------------------------------------------------------------------------------------------

describe('the dashboard', () => {
  it('shows zeros and no activity on an empty database, never made-up numbers', async () => {
    const data = (await get('/api/admin/dashboard')).json.data
    expect(data.inquiries).toMatchObject({ total: 0, new: 0, inProgress: 0, waitingClient: 0, completed: 0, archived: 0, last7Days: 0, last30Days: 0 })
    expect(data.quotes).toMatchObject({ total: 0, pending: 0, completed: 0 })
    expect(data.completedRequests).toBe(0)
    expect(data.recentInquiries).toEqual([])
    expect(data.recentQuotes).toEqual([])
    expect(data.recentlyEdited).toEqual([]) // a freshly seeded catalogue is not "recently updated"
    expect(data.activity.map((item: { action: string }) => item.action)).toEqual(['admin.login']) // the only thing that has happened
    expect(data.email).toMatchObject({ enabled: true, pending: 0, failed: 0 })
  })

  it('counts what the database holds, by status, and nothing else', async () => {
    const ids = await messages(5)
    const quoteIds = await quotes(4)
    await send('PATCH', `/api/admin/inquiries/${ids[0]}`, { status: 'in_progress' })
    await send('PATCH', `/api/admin/inquiries/${ids[1]}`, { status: 'waiting_client' })
    await send('PATCH', `/api/admin/inquiries/${ids[2]}`, { status: 'completed' })
    await send('PATCH', `/api/admin/inquiries/${ids[3]}`, { archived: true })
    await send('PATCH', `/api/admin/quote-requests/${quoteIds[0]}`, { status: 'in_review' })
    await send('PATCH', `/api/admin/quote-requests/${quoteIds[1]}`, { status: 'quoted' })
    await send('PATCH', `/api/admin/quote-requests/${quoteIds[2]}`, { status: 'accepted' })
    const data = (await get('/api/admin/dashboard')).json.data
    expect(data.inquiries).toMatchObject({ total: 5, new: 1, inProgress: 1, waitingClient: 1, completed: 1, archived: 1, last7Days: 5, last30Days: 5 })
    expect(data.quotes).toMatchObject({ total: 4, new: 1, inReview: 1, quoted: 1, accepted: 1, pending: 2, completed: 1, last7Days: 4 })
    expect(data.completedRequests).toBe(2)
    expect(data.recentInquiries).toHaveLength(4) // the archived one is not "recent work"
    expect(data.recentInquiries[0].subject).toBe('Subject 4') // newest first
    expect(JSON.stringify(data)).not.toMatch(/ip_hash|content_hash/)
    server.clock.advance(8 * 86_400_000)
    admin = await server.signIn('admin', 'later@site.test') // the first sign-in has idled out meanwhile
    expect((await get('/api/admin/dashboard')).json.data.inquiries).toMatchObject({ total: 5, last7Days: 0, last30Days: 5 })
  })

  it('lists the catalogue records that have been edited, and the administrators\' latest actions, with no customer text', async () => {
    const [id] = await messages(1, () => ({ message: 'A private sentence that must stay out of the activity list.' }))
    server.clock.advance(60_000)
    await send('PUT', '/api/admin/extras/care', { status: 'disabled', appliesTo: ['website'], translations: { hu: { name: 'Care' }, en: { name: 'Care' }, nl: { name: 'Care' } } })
    await send('PATCH', `/api/admin/inquiries/${id}`, { status: 'in_progress', addNote: 'A private note.' })
    const data = (await get('/api/admin/dashboard')).json.data
    expect(data.recentlyEdited).toEqual([{ kind: 'extra', key: 'care', title: 'Care', status: 'disabled', updatedAt: server.clock.now().toISOString() }])
    expect(data.activity.map((item: { action: string }) => item.action)).toEqual(['inquiry.note', 'inquiry.status', 'extra.update', 'admin.login'])
    expect(data.activity[1]).toMatchObject({ actor: 'admin@site.test', entityType: 'inquiry', label: expect.stringMatching(/^C-/), detail: { from: 'new', to: 'in_progress' } })
    expect(JSON.stringify(data.activity)).not.toMatch(/private/)
  })

  it('is open to an editor too, and to nobody without a session', async () => {
    const editor = await server.signIn('editor')
    expect((await get('/api/admin/dashboard', editor)).status).toBe(200)
    expect((await server.api('/api/admin/dashboard')).status).toBe(401)
  })
})

// ---- lists --------------------------------------------------------------------------------------------------------------------

describe('searching, filtering by date, sorting and paging the lists', () => {
  it('filters by the day received, inclusive, and ignores a date that is not one', async () => {
    await messages(1, () => ({ subject: 'Received on the third' }))
    server.clock.advance(2 * 86_400_000)
    admin = await server.signIn('admin', 'later@site.test')
    await messages(1, () => ({ subject: 'Received on the fifth', message: 'A different text for the fifth, long enough.' }))
    const total = async (query: string) => (await get(`/api/admin/inquiries?${query}`)).json.meta.total
    expect(await total('from=2026-11-03&to=2026-11-03')).toBe(1)
    expect(await total('from=2026-11-05')).toBe(1)
    expect(await total('to=2026-11-04')).toBe(1)
    expect(await total('from=2026-11-03&to=2026-11-05')).toBe(2)
    expect(await total('from=2026-11-06')).toBe(0)
    expect(await total('from=not-a-date&to=2026-13-45')).toBe(2)
    expect(await total("from=2026-11-05'; DROP TABLE inquiries; --")).toBe(2)
  })

  it('sorts by the chosen column in the chosen direction, from a fixed list, and falls back to newest first', async () => {
    await messages(3, (i) => ({ name: ['Charlie Kovács', 'Alice Nagy', 'Bob Szabó'][i] }))
    const names = async (query: string) => (await get(`/api/admin/inquiries?${query}`)).json.data.map((row: { name: string }) => row.name.split(' ')[0])
    expect(await names('')).toEqual(['Bob', 'Alice', 'Charlie'])
    expect(await names('sort=name&dir=asc')).toEqual(['Alice', 'Bob', 'Charlie'])
    expect(await names('sort=name&dir=desc')).toEqual(['Charlie', 'Bob', 'Alice'])
    expect(await names('sort=created&dir=asc')).toEqual(['Charlie', 'Alice', 'Bob'])
    expect(await names('sort=name;DROP TABLE inquiries&dir=sideways')).toEqual(['Bob', 'Alice', 'Charlie'])
    expect(await names("sort=(SELECT 1)")).toEqual(['Bob', 'Alice', 'Charlie'])
    const quoteIds = await quotes(2, (i) => ({ name: ['Zed', 'Amy'][i] }))
    await send('PATCH', `/api/admin/quote-requests/${quoteIds[0]}`, { status: 'quoted' })
    const order = (await get('/api/admin/quote-requests?sort=status&dir=asc')).json.data.map((row: { status: string }) => row.status)
    expect(order).toEqual(['new', 'quoted'])
  })

  it('pages by a size the caller chooses, within limits', async () => {
    await messages(7)
    const page = async (query: string) => (await get(`/api/admin/inquiries?${query}`)).json
    expect((await page('pageSize=3')).data).toHaveLength(3)
    expect((await page('pageSize=3&page=3')).data).toHaveLength(1)
    expect((await page('pageSize=3')).meta).toEqual({ page: 1, pageSize: 3, total: 7 })
    expect((await page('pageSize=0')).meta.pageSize).toBe(25)
    expect((await page('pageSize=abc')).meta.pageSize).toBe(25)
    expect((await page('pageSize=100000')).meta.pageSize).toBe(100)
  })

  it('filters inquiries by type', async () => {
    await messages(4, (i) => ({ kind: ['job', 'project', 'job', 'other'][i] }))
    expect((await get('/api/admin/inquiries?kind=job')).json.meta.total).toBe(2)
    expect((await get('/api/admin/inquiries?kind=other&status=new')).json.meta.total).toBe(1)
    expect((await get('/api/admin/inquiries?kind=nonsense')).json.meta.total).toBe(4)
  })
})

// ---- history and links ------------------------------------------------------------------------------------------------------

describe('the history of a record, and linking a quote request to an inquiry', () => {
  it('begins with the message arriving and then lists each administrative action, who did it, and what changed', async () => {
    const [id] = await messages(1)
    server.clock.advance(60_000)
    await send('PATCH', `/api/admin/inquiries/${id}`, { status: 'in_progress' })
    await send('PATCH', `/api/admin/inquiries/${id}`, { status: 'in_progress' }) // no change: nothing to record
    await send('PATCH', `/api/admin/inquiries/${id}`, { addNote: 'Called back, no answer.' })
    await send('PATCH', `/api/admin/inquiries/${id}`, { status: 'waiting_client', notify: true, note: 'Waiting for your reply.' })
    await send('PATCH', `/api/admin/inquiries/${id}`, { archived: true })
    await send('PATCH', `/api/admin/inquiries/${id}`, { archived: false })
    const { activity } = (await get(`/api/admin/inquiries/${id}`)).json.data
    expect(activity.map((event: { action: string }) => event.action)).toEqual(['received', 'inquiry.status', 'inquiry.note', 'inquiry.status', 'inquiry.archive', 'inquiry.unarchive'])
    expect(activity[0]).toMatchObject({ actor: null, detail: null })
    expect(activity[1]).toMatchObject({ actor: 'admin@site.test', detail: { from: 'new', to: 'in_progress', emailed: false } })
    expect(activity[3].detail).toEqual({ from: 'in_progress', to: 'waiting_client', emailed: true })
    expect(JSON.stringify(activity)).not.toMatch(/Called back|Waiting for your reply/) // what an administrator typed is not copied into the log
  })

  it('links a quote request to an inquiry, shows the link from both sides, lists the likely inquiries, and unlinks', async () => {
    const [first, second] = await messages(2, (i) => ({ email: i === 0 ? 'anna@example.com' : 'someone.else@example.com' }))
    const [quoteId] = await quotes(1) // anna@example.com
    const before = (await get(`/api/admin/quote-requests/${quoteId}`)).json.data
    expect(before.inquiry).toBeNull()
    expect(before.candidates.map((row: { id: string }) => row.id)).toEqual([first]) // only the same address
    const linked = await send('PATCH', `/api/admin/quote-requests/${quoteId}`, { inquiryId: first })
    expect(linked.status).toBe(200)
    expect(linked.json.data.inquiry).toMatchObject({ id: first, reference: expect.stringMatching(/^C-/), subject: 'Subject 0' })
    expect((await get(`/api/admin/inquiries/${first}`)).json.data.quotes).toEqual([expect.objectContaining({ id: quoteId, status: 'new' })])
    expect((await get(`/api/admin/inquiries/${second}`)).json.data.quotes).toEqual([])
    expect((await get(`/api/admin/quote-requests/${quoteId}`)).json.data.activity.map((event: { action: string }) => event.action)).toEqual(['received', 'quote.link'])
    // An inquiry that does not exist, or a value that is not an id, is refused and changes nothing.
    expect((await send('PATCH', `/api/admin/quote-requests/${quoteId}`, { inquiryId: 'no-such-inquiry' })).status).toBe(422)
    expect((await send('PATCH', `/api/admin/quote-requests/${quoteId}`, { inquiryId: 42 })).status).toBe(422)
    expect(server.db.get<{ inquiry_id: string }>('SELECT inquiry_id FROM quote_requests')?.inquiry_id).toBe(first)
    // The original submission is unchanged by any of this.
    expect(server.db.get<{ name: string; description: string }>('SELECT name, description FROM quote_requests')).toEqual({ name: 'Anna Kovács', description: 'Request 0: a small website with a contact form.' })
    expect((await send('PATCH', `/api/admin/quote-requests/${quoteId}`, { inquiryId: null })).json.data.inquiry).toBeNull()
    // Deleting the inquiry leaves the quote request, unlinked.
    await send('PATCH', `/api/admin/quote-requests/${quoteId}`, { inquiryId: first })
    expect((await send('DELETE', `/api/admin/inquiries/${first}`)).status).toBe(204)
    expect((await get(`/api/admin/quote-requests/${quoteId}`)).json.data).toMatchObject({ inquiry: null, inquiry_id: null })
  })

  it('does not let an editor-less or unsigned request link anything', async () => {
    const [id] = await messages(1)
    const [quoteId] = await quotes(1)
    expect((await server.api(`/api/admin/quote-requests/${quoteId}`, { method: 'PATCH', body: { inquiryId: id } })).status).toBe(401)
  })
})

// ---- translations -------------------------------------------------------------------------------------------------------------

describe('translations', () => {
  const overview = async (query = '') => (await get(`/api/admin/translations${query}`)).json.data
  const item = (data: any, group: string, key: string) => data.groups.find((g: { id: string }) => g.id === group).items.find((i: { key: string }) => i.key === key)

  it('lists every translatable record in its three languages, grouped, with what the website will use and what it will not', async () => {
    const data = await overview()
    expect(data.languages).toEqual(['hu', 'en', 'nl'])
    expect(data.groups.map((g: { id: string }) => g.id)).toEqual(['services', 'packages', 'extras', 'faq'])
    expect(Object.fromEntries(data.groups.map((g: { id: string; reachesWebsite: boolean }) => [g.id, g.reachesWebsite]))).toEqual({ services: false, packages: true, extras: true, faq: true })
    const website = item(data, 'services', 'website')
    expect(website.fields.map((f: { name: string }) => f.name)).toEqual(['title', 'summary', 'tagline', 'overview', 'features'])
    expect(website.fields[0].values.nl).toBe('Website-ontwikkeling')
    expect(item(data, 'faq', 'start').fields.map((f: { name: string }) => f.name)).toEqual(['question', 'answer'])
    expect(data.summary).toEqual({ hu: { fields: 0, records: 0 }, en: { fields: 0, records: 0 }, nl: { fields: 0, records: 0 } }) // the seeded catalogue is complete
  })

  it('flags a text that exists in one language and not in another, and only that', async () => {
    server.db.run("UPDATE package_translations SET tagline = '' WHERE language = 'nl' AND package_id = (SELECT id FROM packages WHERE code = 'grow')")
    server.db.run("UPDATE package_translations SET includes_json = '[]' WHERE language IN ('hu', 'en', 'nl') AND package_id = (SELECT id FROM packages WHERE code = 'grow')") // empty in all three: not flagged
    server.db.run("UPDATE service_translations SET features_json = '[]' WHERE language = 'en' AND service_id = (SELECT id FROM services WHERE slug = 'ui')")
    const data = await overview()
    const grow = item(data, 'packages', 'grow')
    expect(grow.fields.find((f: { name: string }) => f.name === 'tagline').missing).toEqual(['nl'])
    expect(grow.fields.find((f: { name: string }) => f.name === 'includes').missing).toEqual([])
    expect(grow.missing).toEqual({ hu: 0, en: 0, nl: 1 })
    expect(item(data, 'services', 'ui').fields.find((f: { name: string }) => f.name === 'features').missing).toEqual(['en'])
    expect(data.summary.nl).toEqual({ fields: 1, records: 1 })
    expect(data.summary.en).toEqual({ fields: 1, records: 1 })
    expect(data.summary.hu).toEqual({ fields: 0, records: 0 })
    // Filters: one language, only what is missing, one group.
    expect((await overview('?missing=1')).groups.flatMap((g: { items: unknown[] }) => g.items)).toHaveLength(2)
    expect((await overview('?missing=1&lang=nl')).groups.flatMap((g: { items: { key: string }[] }) => g.items.map((i) => i.key))).toEqual(['grow'])
    expect((await overview('?missing=1&lang=hu')).groups.flatMap((g: { items: unknown[] }) => g.items)).toEqual([])
    expect((await overview('?group=faq')).groups.map((g: { id: string }) => g.id)).toEqual(['faq'])
    expect((await overview('?group=nonsense')).groups).toHaveLength(4)
  })

  it('saves some fields of one record in one language, checks them first, and leaves the other languages alone', async () => {
    server.db.run("UPDATE package_translations SET tagline = '', audience = '' WHERE language = 'nl' AND package_id = (SELECT id FROM packages WHERE code = 'grow')")
    const saved = await send('PUT', '/api/admin/translations/packages/grow/nl', { fields: { tagline: '  Een heldere start.  ', audience: 'Voor kleine teams', includes: ['Een pagina', '', 'Twee pagina’s'] } })
    expect(saved.status).toBe(200)
    const grow = saved.json.data
    expect(grow.fields.find((f: { name: string }) => f.name === 'tagline').values.nl).toBe('Een heldere start.')
    expect(grow.fields.find((f: { name: string }) => f.name === 'includes').values.nl).toEqual(['Een pagina', 'Twee pagina’s'])
    expect(grow.missing.nl).toBe(0)
    expect(grow.fields.find((f: { name: string }) => f.name === 'tagline').values.en).toBe(server.db.get<{ tagline: string }>("SELECT tagline FROM package_translations WHERE language = 'en' AND package_id = (SELECT id FROM packages WHERE code = 'grow')")!.tagline)
    expect(server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'translation.update'")?.n).toBe(1)
    expect(JSON.parse(server.db.get<{ detail: string }>("SELECT detail FROM audit_log WHERE action = 'translation.update'")!.detail)).toEqual({ language: 'nl', fields: ['tagline', 'audience', 'includes'] })
    // The public API now shows it, in Dutch only.
    expect((await server.api('/api/packages/grow?lang=nl')).json.data.tagline).toBe('Een heldere start.')
  })

  it('refuses what the full editors would refuse, and a save that is only partly good changes nothing', async () => {
    const before = server.db.get<{ name: string }>("SELECT name FROM package_translations WHERE language = 'nl' AND package_id = (SELECT id FROM packages WHERE code = 'launch')")!.name
    const bad = await send('PUT', '/api/admin/translations/packages/launch/nl', { fields: { name: '', tagline: 't'.repeat(301), nonsense: 'x', includes: 'not a list' } })
    expect(bad.status).toBe(422)
    expect(bad.json.error.details.fields).toEqual({ 'fields.name': 'required', 'fields.tagline': 'tooLong', 'fields.nonsense': 'unknown', 'fields.includes': 'invalid' })
    const partial = await send('PUT', '/api/admin/translations/packages/launch/nl', { fields: { tagline: 'A good one', name: '' } })
    expect(partial.status).toBe(422)
    expect(server.db.get<{ tagline: string }>("SELECT tagline FROM package_translations WHERE language = 'nl' AND package_id = (SELECT id FROM packages WHERE code = 'launch')")!.tagline).not.toBe('A good one')
    expect(server.db.get<{ name: string }>("SELECT name FROM package_translations WHERE language = 'nl' AND package_id = (SELECT id FROM packages WHERE code = 'launch')")!.name).toBe(before)
    for (const [path, body, status] of [
      ['/api/admin/translations/packages/launch/de', { fields: { name: 'X' } }, 404],
      ['/api/admin/translations/packages/nope/nl', { fields: { name: 'X' } }, 404],
      ['/api/admin/translations/widgets/launch/nl', { fields: { name: 'X' } }, 404],
      ['/api/admin/translations/packages/launch/nl', {}, 422],
      ['/api/admin/translations/packages/launch/nl', { fields: {} }, 422],
      ['/api/admin/translations/packages/launch/nl', { fields: 'x' }, 422],
    ] as const) expect((await send('PUT', path, body)).status, path).toBe(status)
    expect(server.db.get('SELECT COUNT(*) AS n FROM audit_log WHERE action = \'translation.update\'')).toEqual({ n: 0 })
  })

  it('edits a FAQ question and answer, a service and an add-on the same way, and the website sees the FAQ in the language it was saved in', async () => {
    expect((await send('PUT', '/api/admin/translations/faq/start/nl', { fields: { question: 'Hoe begint het?', answer: 'Met een aanvraag.' } })).status).toBe(200)
    const faq = (await server.api('/api/content/faq?lang=nl')).json.data.find((entry: { slug: string }) => entry.slug === 'start')
    expect(faq).toMatchObject({ question: 'Hoe begint het?', answer: 'Met een aanvraag.' })
    expect((await send('PUT', '/api/admin/translations/services/ui/hu', { fields: { features: ['Egy', 'Kettő'] } })).json.data.fields.find((f: { name: string }) => f.name === 'features').values.hu).toEqual(['Egy', 'Kettő'])
    expect((await send('PUT', '/api/admin/translations/extras/pages/en', { fields: { summary: 'More pages.' } })).status).toBe(200)
    expect((await send('PUT', '/api/admin/translations/packages/launch/en', { fields: { priceNote: '' } })).status).toBe(200)
    expect(server.db.get('SELECT price_note FROM package_translations WHERE language = \'en\' AND package_id = (SELECT id FROM packages WHERE code = \'launch\')')).toEqual({ price_note: null })
  })

  it('may be done by an editor, and by no one without a session; an unauthenticated request changes nothing', async () => {
    const editor = await server.signIn('editor')
    expect((await send('PUT', '/api/admin/translations/extras/pages/en', { fields: { name: 'Extra pages' } }, editor)).status).toBe(200)
    expect((await server.api('/api/admin/translations/extras/pages/en', { method: 'PUT', body: { fields: { name: 'Hacked' } } })).status).toBe(401)
    expect(server.db.get('SELECT name FROM extra_translations WHERE language = \'en\' AND extra_id = (SELECT id FROM extras WHERE code = \'pages\')')).toEqual({ name: 'Extra pages' })
  })
})

// ---- display order -------------------------------------------------------------------------------------------------------------

describe('display order', () => {
  it('sets the order of packages, services, add-ons and FAQ entries, which the public API then follows', async () => {
    const packages = (await server.api('/api/packages')).json.data.map((p: { code: string }) => p.code)
    expect(packages).toEqual(['launch', 'grow', 'build', 'care'])
    expect((await send('PUT', '/api/admin/order/packages', { keys: ['care', 'build', 'grow', 'launch'] })).status).toBe(204)
    expect((await server.api('/api/packages')).json.data.map((p: { code: string }) => p.code)).toEqual(['care', 'build', 'grow', 'launch'])
    const services = (await server.api('/api/services')).json.data.map((s: { slug: string }) => s.slug)
    expect((await send('PUT', '/api/admin/order/services', { keys: [...services].reverse() })).status).toBe(204)
    expect((await server.api('/api/services')).json.data.map((s: { slug: string }) => s.slug)).toEqual([...services].reverse())
    const faq = (await server.api('/api/content/faq')).json.data.map((f: { slug: string }) => f.slug)
    expect((await send('PUT', '/api/admin/order/faq', { keys: [...faq].reverse() })).status).toBe(204)
    expect((await server.api('/api/content/faq')).json.data.map((f: { slug: string }) => f.slug)).toEqual([...faq].reverse())
    const extras = (await server.api('/api/shop/extras')).json.data.map((e: { code: string }) => e.code)
    expect((await send('PUT', '/api/admin/order/extras', { keys: [...extras].reverse() })).status).toBe(204)
    expect((await server.api('/api/shop/extras')).json.data.map((e: { code: string }) => e.code)).toEqual([...extras].reverse())
    expect(server.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'catalog.reorder'")).toEqual({ n: 4 })
  })

  it('accepts only a complete list of the existing keys, each once, and changes nothing otherwise', async () => {
    for (const keys of [['launch', 'grow'], ['launch', 'grow', 'build', 'care', 'extra'], ['launch', 'launch', 'build', 'care'], ['launch', 'grow', 'build', 'nope'], 'launch', [1, 2, 3, 4], null]) {
      expect((await send('PUT', '/api/admin/order/packages', { keys })).status, JSON.stringify(keys)).toBe(422)
    }
    expect((await send('PUT', '/api/admin/order/widgets', { keys: [] })).status).toBe(404)
    expect((await server.api('/api/packages')).json.data.map((p: { code: string }) => p.code)).toEqual(['launch', 'grow', 'build', 'care'])
    expect((await server.api('/api/admin/order/packages', { method: 'PUT', body: { keys: ['care', 'build', 'grow', 'launch'] } })).status).toBe(401)
  })

  it('includes disabled records, so a disabled package keeps its place in the order', async () => {
    await send('PUT', '/api/admin/packages/build', {
      status: 'disabled', needs: ['webapp'], extras: [], translations: { hu: { name: 'Build' }, en: { name: 'Build' }, nl: { name: 'Build' } },
    })
    expect((await send('PUT', '/api/admin/order/packages', { keys: ['build', 'launch', 'grow', 'care'] })).status).toBe(204)
    expect(server.db.all('SELECT code FROM packages ORDER BY position').map((row) => (row as { code: string }).code)).toEqual(['build', 'launch', 'grow', 'care'])
  })
})

// ---- notifications ------------------------------------------------------------------------------------------------------------

describe('notifications', () => {
  const overview = async (who = admin) => (await get('/api/admin/notifications', who)).json.data

  it('states the integration as it is: configured, or not available', async () => {
    const on = await overview()
    expect(on.integration).toMatchObject({ enabled: true, provider: 'file', senderConfigured: true, ownerAddressConfigured: true, ownerLanguage: 'en' })
    expect(on.types).toEqual([
      { id: 'new_inquiry', automatic: true, enabled: true, active: true },
      { id: 'new_quote', automatic: true, enabled: true, active: true },
      // Confirmations to the person who wrote exist, and are off until an administrator turns them on.
      { id: 'confirm_inquiry', automatic: true, enabled: false, active: false },
      { id: 'confirm_quote', automatic: true, enabled: false, active: false },
      { id: 'status_update', automatic: false, enabled: true, active: true },
    ])
    await server.close()
    server = await startServer({ env: { EMAIL_PROVIDER: 'none' }, mailer: null })
    admin = await server.signIn('admin', 'admin@site.test')
    const off = await overview()
    expect(off.integration).toMatchObject({ enabled: false, provider: 'none' })
    expect(off.types.map((type: { active: boolean }) => type.active)).toEqual([false, false, false, false, false])
    expect(off.deliveries).toEqual([])
  })

  it('reports no owner notification as active when no recipient is set, even if the provider works', async () => {
    await server.close()
    server = await startServer({ env: { NOTIFY_TO: '' } })
    admin = await server.signIn('admin', 'admin@site.test')
    const data = await overview()
    expect(data.integration).toMatchObject({ enabled: true, ownerAddressConfigured: false })
    expect(data.types.map((type: { active: boolean }) => type.active)).toEqual([false, false, false, false, true])
  })

  it('lists the delivery log with each message\'s real state and the reference of its record', async () => {
    server.mailer.failNext(Object.assign(new Error('refused'), { transient: false }) as never)
    await server.api('/api/contact', { body: contact() })
    await new Promise((resolve) => setImmediate(resolve))
    await server.app.context.notifier.processDue()
    await quotes(1)
    await new Promise((resolve) => setImmediate(resolve))
    await server.app.context.notifier.processDue()
    const data = await overview()
    expect(data.deliveries.map((d: { kind: string; status: string }) => [d.kind, d.status]).sort()).toEqual([['inquiry_received', 'pending'], ['quote_received', 'accepted']].sort())
    expect(data.deliveries.find((d: { kind: string }) => d.kind === 'quote_received').reference).toMatch(/^Q-/)
    expect(data.counts.sent).toBe(1)
  })

  it('switches the owner notification for messages or quote requests off and on, and records who did it', async () => {
    const off = await send('PUT', '/api/admin/notifications/preferences', { newInquiry: false, newQuote: true })
    expect(off.json.data).toEqual({ newInquiry: false, newQuote: true, confirmInquiry: false, confirmQuote: false, responseNote: { hu: '', en: '', nl: '' } })
    server.db.run('DELETE FROM email_deliveries')
    await server.api('/api/contact', { body: contact() })
    await quotes(1)
    await new Promise((resolve) => setImmediate(resolve))
    await server.app.context.notifier.processDue()
    expect(server.db.all('SELECT kind FROM email_deliveries')).toEqual([{ kind: 'quote_received' }])
    const data = await overview()
    expect(data.types[0]).toMatchObject({ id: 'new_inquiry', enabled: false, active: false })
    expect(data.preferences).toEqual({ newInquiry: false, newQuote: true, confirmInquiry: false, confirmQuote: false, responseNote: { hu: '', en: '', nl: '' } })
    expect((await send('PUT', '/api/admin/notifications/preferences', { newInquiry: true, newQuote: true })).status).toBe(200)
    expect(server.db.all("SELECT action FROM audit_log WHERE action = 'settings.notifications'")).toHaveLength(2)
    for (const body of [{}, { newInquiry: 'yes', newQuote: true }, { newInquiry: true }]) expect((await send('PUT', '/api/admin/notifications/preferences', body)).status).toBe(422)
  })

  it('sends a failed message again on request, and refuses to resend one that did not fail', async () => {
    const { MailError } = await import('../src/modules/notifications/smtp.ts')
    server.mailer.failNext(new MailError('550 no such mailbox', { transient: false, code: 550 }))
    await server.api('/api/contact', { body: contact() })
    await new Promise((resolve) => setImmediate(resolve))
    await server.app.context.notifier.processDue()
    const failed = (await overview()).deliveries[0]
    expect(failed).toMatchObject({ status: 'failed', attempts: 1, lastError: '550 no such mailbox' })
    expect((await send('POST', `/api/admin/notifications/deliveries/${failed.id}/retry`, {})).status).toBe(200)
    await new Promise((resolve) => setImmediate(resolve))
    await server.app.context.notifier.processDue()
    expect((await overview()).deliveries[0]).toMatchObject({ status: 'accepted', attempts: 1, lastError: null })
    expect(server.mailer.sent).toHaveLength(1)
    const again = await send('POST', `/api/admin/notifications/deliveries/${failed.id}/retry`, {})
    expect(again.status).toBe(409)
    expect((await send('POST', '/api/admin/notifications/deliveries/nope/retry', {})).status).toBe(404)
    expect(server.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'notification.retry'")).toEqual({ n: 1 })
  })

  it('refuses a retry when e-mail is not configured, and the preferences to an editor', async () => {
    const editor = await server.signIn('editor')
    expect((await send('PUT', '/api/admin/notifications/preferences', { newInquiry: false, newQuote: false }, editor)).status).toBe(403)
    expect((await get('/api/admin/notifications', editor)).status).toBe(200)
    await server.close()
    server = await startServer({ env: { EMAIL_PROVIDER: 'none' }, mailer: null })
    admin = await server.signIn('admin', 'admin@site.test')
    server.db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, created_at, updated_at) VALUES ('d1', 'inquiry_received', 'inquiry', 'x', 'o@site.test', 'en', 'failed', ?, ?)", [server.clock.now().toISOString(), server.clock.now().toISOString()])
    expect((await send('POST', '/api/admin/notifications/deliveries/d1/retry', {})).status).toBe(409)
  })
})

// ---- settings and sessions -----------------------------------------------------------------------------------------------------

describe('settings', () => {
  it('returns the profile and the vocabularies the application needs, and no secret', async () => {
    const session = (await get('/api/admin/session')).json.data
    expect(session.user).toMatchObject({ email: 'admin@site.test', role: 'admin', preferences: { language: null, theme: null } })
    expect(session.user.permissions).toContain('system:write')
    expect(session.meta).toMatchObject({
      statuses: { inquiry: ['new', 'in_progress', 'waiting_client', 'completed'], quote: ['new', 'in_review', 'quoted', 'accepted', 'declined', 'closed'] },
      kinds: ['job', 'collaboration', 'project', 'other'],
      languages: ['hu', 'en', 'nl'],
      interfaceLanguages: ['hu', 'en'],
      idleMinutes: 30,
    })
    const settings = (await get('/api/admin/settings')).json.data
    expect(settings.profile).toMatchObject({ email: 'admin@site.test', role: 'admin', lastLoginAt: expect.any(String) })
    expect(JSON.stringify([session, settings])).not.toMatch(/password|secret|hash|token_hash/i)
  })

  it('keeps the language and theme the administrator chooses, validates them, and offers them at the next sign-in', async () => {
    expect((await send('PUT', '/api/admin/settings/preferences', { language: 'hu', theme: 'light' })).json.data).toEqual({ language: 'hu', theme: 'light' })
    expect((await send('PUT', '/api/admin/settings/preferences', { theme: null })).json.data).toEqual({ language: 'hu', theme: null }) // a field not sent is left alone; null clears
    expect((await get('/api/admin/session')).json.data.user.preferences).toEqual({ language: 'hu', theme: null })
    const login = await server.api('/api/admin/login', { body: { email: 'admin@site.test', password: 'a-long-test-passphrase-1' } })
    expect(login.json.data.user.preferences).toEqual({ language: 'hu', theme: null })
    for (const body of [{ language: 'nl' }, { language: 'de' }, { theme: 'blue' }, { theme: 5 }, {}, { other: 1 }]) expect((await send('PUT', '/api/admin/settings/preferences', body)).status, JSON.stringify(body)).toBe(422)
    expect(server.db.all("SELECT action FROM audit_log WHERE action = 'settings.preferences'")).toHaveLength(2)
  })

  it('lists the administrator\'s own sign-ins by a short label, marks this one, and ends the others on request', async () => {
    const other = await server.api('/api/admin/login', { body: { email: 'admin@site.test', password: 'a-long-test-passphrase-1' }, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' } })
    const otherCookie = other.headers.get('set-cookie')!.split(';')[0]
    const list = (await get('/api/admin/sessions')).json.data
    expect(list).toHaveLength(2)
    expect(list.filter((entry: { current: boolean }) => entry.current)).toHaveLength(1)
    expect(list.find((entry: { current: boolean }) => !entry.current)).toMatchObject({ browser: 'Chrome · Windows', id: expect.stringMatching(/^[\w-]{8,}$/) })
    expect(JSON.stringify(list)).not.toMatch(/Mozilla|token|hash/)
    const otherId = list.find((entry: { current: boolean }) => !entry.current).id
    expect((await send('DELETE', `/api/admin/sessions/${otherId}`)).status).toBe(204)
    expect((await server.api('/api/admin/session', { headers: { Cookie: otherCookie } })).status).toBe(401)
    expect((await get('/api/admin/session')).status).toBe(200)
    expect((await send('DELETE', `/api/admin/sessions/${otherId}`)).status).toBe(404)
    // Everything else at once.
    await server.api('/api/admin/login', { body: { email: 'admin@site.test', password: 'a-long-test-passphrase-1' } })
    await server.api('/api/admin/login', { body: { email: 'admin@site.test', password: 'a-long-test-passphrase-1' } })
    expect((await send('POST', '/api/admin/sessions/revoke-others', {})).json.data.closed).toBe(2)
    expect((await get('/api/admin/sessions')).json.data).toHaveLength(1)
  })

  it('never lets one administrator see or end another\'s sign-ins', async () => {
    const editor = await server.signIn('editor', 'editor@site.test')
    const mine = (await get('/api/admin/sessions')).json.data[0].id
    const theirs = (await get('/api/admin/sessions', editor)).json.data
    expect(theirs).toHaveLength(1)
    expect(theirs[0].id).not.toBe(mine)
    expect((await send('DELETE', `/api/admin/sessions/${mine}`, undefined, editor)).status).toBe(404)
    expect((await get('/api/admin/session')).status).toBe(200)
  })

  it('ending the sign-in that is in use signs the browser out', async () => {
    const mine = (await get('/api/admin/sessions')).json.data[0].id
    const response = await send('DELETE', `/api/admin/sessions/${mine}`)
    expect(response.status).toBe(204)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await get('/api/admin/session')).status).toBe(401)
  })
})

describe('the system controls (administrators only)', () => {
  it('runs maintenance on request and reports what it removed', async () => {
    const result = await send('POST', '/api/admin/system/maintenance', {})
    expect(result.status).toBe(200)
    expect(result.json.data).toMatchObject({ expiredSessions: 0, retentionDays: null })
    expect(server.db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'system.maintenance'")).toEqual({ n: 1 })
  })

  it('says plainly that publishing is not set up when there is no hook, and does not pretend', async () => {
    const result = await send('POST', '/api/admin/system/publish', {})
    expect(result.status).toBe(409)
    expect(result.json.error.message).toMatch(/DEPLOY_HOOK_URL/)
  })

  it('reaches a configured hook, reports a refusal as a failure, and records both', async () => {
    const { createServer } = await import('node:http')
    let calls = 0
    let answer = 200
    const hook = createServer((_req, res) => {
      calls += 1
      res.writeHead(answer).end()
    })
    await new Promise<void>((resolve) => hook.listen(0, '127.0.0.1', () => resolve()))
    const port = (hook.address() as { port: number }).port
    try {
      await server.close()
      server = await startServer({ env: { DEPLOY_HOOK_URL: `http://127.0.0.1:${port}/build` } })
      admin = await server.signIn('admin', 'admin@site.test')
      expect((await send('POST', '/api/admin/system/publish', {})).json.data).toEqual({ published: true })
      answer = 500
      const failed = await send('POST', '/api/admin/system/publish', {})
      expect(failed.status).toBe(502)
      expect(failed.json.error.code).toBe('bad_gateway')
      expect(calls).toBe(2)
      expect(server.db.all("SELECT action FROM audit_log WHERE action LIKE 'site.publish%' ORDER BY id")).toEqual([{ action: 'site.publish' }, { action: 'site.publish_failed' }])
    } finally {
      hook.close()
    }
  })
})
