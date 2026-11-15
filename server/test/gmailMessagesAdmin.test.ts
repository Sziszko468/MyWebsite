import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FakeGoogle, GMAIL_ENV, SECRETS, CLIENT_ID, ACCOUNT, filePart, gmailMessage, multipart, textPart } from './gmailKit.ts'
import { contact, quote, startServer, type TestServer } from './helpers.ts'

/**
 * Gmail, step 3: the administration's endpoints for the synchronisation and the stored messages: who may call them, what protects
 * them, what they accept, and what they never say. Google is a stand-in; every value is made up.
 */

let server: TestServer | null = null
afterEach(async () => {
  await server?.close()
  server = null
})

const BODY = 'SECRET-BODY-TEXT about the bakery website, which must stay in the message and out of every log.'

async function setup(options: { env?: Record<string, string> } = {}) {
  const google = new FakeGoogle()
  const s = await startServer({ env: { ...GMAIL_ENV, ...options.env }, fetch: google.fetch })
  server = s
  const admin = await s.signIn('admin', 'admin@site.test')
  const editor = await s.signIn('editor', 'editor@site.test')
  type Who = { cookie: string; csrf: string }
  const headers = (who: Who | null): Record<string, string> => (who ? { Cookie: who.cookie, 'X-CSRF-Token': who.csrf } : {})
  const call = (method: string, path: string, who: Who | null, body?: unknown) => s.api(path, { method, body: method === 'GET' || method === 'DELETE' ? undefined : (body ?? {}), headers: headers(who) })

  const inquiry = async (email: string) => {
    await s.api('/api/contact', { body: contact({ email, subject: 'A new website', message: 'I would like a small website for my bakery. Can we talk about it soon?' }) })
    s.clock.advance(1000)
    return s.db.get<{ id: string }>('SELECT id FROM inquiries WHERE email = ?', [email])!.id
  }
  const quoteRequest = async (email: string) => {
    await s.api('/api/quote-requests', { body: quote({ email }) })
    s.clock.advance(1000)
    return s.db.get<{ id: string }>('SELECT id FROM quote_requests WHERE email = ?', [email])!.id
  }
  const messageId = (gmailId: string) => s.db.get<{ id: string }>('SELECT id FROM gmail_messages WHERE gmail_message_id = ?', [gmailId])!.id

  // A mailbox with one conversation per request, and a message nobody owns.
  const inquiryId = await inquiry('anna@example.com')
  const requestId = await quoteRequest('bela@example.com')
  const base = Date.parse('2026-11-03T08:00:00Z')
  google.add(
    gmailMessage({
      id: 'g1',
      threadId: 'ta',
      from: 'Anna Kovács <anna@example.com>',
      subject: 'About the website',
      text: BODY,
      internalDate: base,
      payload: multipart('multipart/mixed', [textPart(BODY), filePart('brief.pdf', 'application/pdf', 52_000, { partId: '1' })]),
    }),
    gmailMessage({ id: 'g2', threadId: 'ta', from: 'Anna Kovács <anna@example.com>', subject: 'Re: About the website', text: 'A second message from Anna.', internalDate: base + 60_000 }),
    gmailMessage({ id: 'g3', threadId: 'tb', from: 'bela@example.com', subject: 'The quote', text: 'A message from Béla.', internalDate: base + 120_000 }),
    gmailMessage({ id: 'g4', threadId: 'tc', from: 'Stranger <stranger@example.org>', subject: 'Not a customer', text: 'Somebody who is nobody’s request.', internalDate: base + 180_000 }),
  )
  return { s, google, admin, editor, inquiryId, requestId, call, messageId, inquiry, quoteRequest, headers, sync: () => call('POST', '/api/admin/gmail/sync', admin, {}) }
}

const audits = (s: TestServer) => s.db.all<{ action: string; entity_type: string; entity_id: string | null; detail: string | null }>("SELECT action, entity_type, entity_id, detail FROM audit_log WHERE action LIKE 'gmail.%' ORDER BY id")

describe('synchronising by hand', () => {
  it('imports the mailbox, answers with the numbers, and the status then agrees', async () => {
    const t = await setup()
    const before = await t.call('GET', '/api/admin/gmail/sync-status', t.admin)
    expect(before.status).toBe(200)
    expect(before.json.data).toEqual({ configured: true, lastSyncAt: null, lastError: null, importedCount: 0, pendingAssociationCount: 0, currentlySyncing: false })
    const result = await t.sync()
    expect(result.status).toBe(200)
    expect(result.json.data).toEqual({ imported: 4, skippedDuplicates: 0, associated: 3, unassigned: 1, failed: 0, remaining: 0, lastSyncAt: t.s.clock.now().toISOString(), error: null })
    const after = await t.call('GET', '/api/admin/gmail/sync-status', t.admin)
    expect(after.json.data).toEqual({ configured: true, lastSyncAt: t.s.clock.now().toISOString(), lastError: null, importedCount: 4, pendingAssociationCount: 1, currentlySyncing: false })
    const again = await t.sync()
    expect(again.json.data).toMatchObject({ imported: 0, skippedDuplicates: 4 })
  })

  it('writes one line in the administrator log with numbers and no word of any message', async () => {
    const t = await setup()
    await t.sync()
    const [entry, ...others] = audits(t.s)
    expect(others).toEqual([])
    expect(entry).toMatchObject({ action: 'gmail.sync', entity_type: 'system', entity_id: null })
    expect(JSON.parse(entry.detail!)).toEqual({ imported: 4, duplicates: 0, failed: 0, category: null })
  })

  it('answers a run that ended early as a result, not an error, and logs it as such', async () => {
    const t = await setup()
    t.google.override = (request) => (request.kind === 'list' ? new Response('{}', { status: 429 }) : undefined)
    const result = await t.sync()
    expect(result.status).toBe(200)
    expect(result.json.data).toMatchObject({ imported: 0, error: 'rate_limited', lastSyncAt: null })
    expect(audits(t.s).map((row) => row.action)).toEqual(['gmail.sync_failed'])
    expect((await t.call('GET', '/api/admin/gmail/sync-status', t.admin)).json.data).toMatchObject({ lastError: 'rate_limited', lastSyncAt: null })
  })

  it.each([
    [{ windowDays: 0 }],
    [{ windowDays: 91 }],
    [{ windowDays: 'seven' }],
    [{ windowDays: 1.5 }],
    [{ maxImport: 0 }],
    [{ maxImport: 101 }],
    [{ maxImport: '10' }],
    [{ maxImport: -1 }],
  ])('refuses the options %j before asking Google anything', async (body) => {
    const t = await setup()
    const result = await t.call('POST', '/api/admin/gmail/sync', t.admin, body)
    expect(result.status).toBe(422)
    expect(result.json.error.code).toBe('validation_failed')
    expect(t.google.requests).toHaveLength(0)
  })

  it('takes valid options, and ignores what it does not know', async () => {
    const t = await setup()
    const result = await t.call('POST', '/api/admin/gmail/sync', t.admin, { windowDays: 30, maxImport: 2, query: 'from:anyone', labelIds: ['SPAM'] })
    expect(result.status).toBe(200)
    expect(result.json.data).toMatchObject({ imported: 2, remaining: 2 })
    const list = t.google.requests.find((request) => request.kind === 'list')!
    expect(list.query.getAll('labelIds')).toEqual(['INBOX'])
    expect(list.query.get('q')).toMatch(/^after:\d+$/)
  })

  it('says 409 when Gmail is not configured, and asks nobody', async () => {
    const t = await setup({ env: { GMAIL_CLIENT_SECRET: '' } })
    const result = await t.sync()
    expect([result.status, result.json.error.code]).toEqual([409, 'conflict'])
    expect(t.google.requests).toHaveLength(0)
  })

  it('says 409 to a second run while the first is under way, and the first goes on', async () => {
    const t = await setup()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    t.google.override = async (request) => {
      if (request.kind === 'get') await gate
      return undefined
    }
    const first = t.sync()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect((await t.call('GET', '/api/admin/gmail/sync-status', t.admin)).json.data.currentlySyncing).toBe(true)
    const second = await t.sync()
    expect([second.status, second.json.error.code, second.json.error.message]).toEqual([409, 'conflict', 'A synchronization is already running.'])
    release()
    expect((await first).json.data).toMatchObject({ imported: 4 })
    expect((await t.call('GET', '/api/admin/gmail/sync-status', t.admin)).json.data.currentlySyncing).toBe(false)
  })

  it('limits how often one administrator can start a run', async () => {
    const t = await setup({ env: { RATE_LIMITS: 'true' } })
    const statuses: number[] = []
    for (let i = 0; i < 8; i += 1) statuses.push((await t.sync()).status)
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429, 429])
  })
})

describe('who may do what', () => {
  it('lets only an administrator see the sync status, run a sync, and list what no request owns', async () => {
    const t = await setup()
    const routes: [string, string][] = [['GET', '/api/admin/gmail/sync-status'], ['POST', '/api/admin/gmail/sync'], ['GET', '/api/admin/gmail/unassigned']]
    for (const [method, path] of routes) {
      expect((await t.call(method, path, null)).status, `${method} ${path} signed out`).toBe(401)
      const editor = await t.call(method, path, t.editor)
      expect([editor.status, editor.json.error.code], `${method} ${path} editor`).toEqual([403, 'forbidden'])
    }
    expect(t.google.requests, 'neither of them could make the server call Google').toHaveLength(0)
    expect(t.s.db.get('SELECT COUNT(*) AS n FROM gmail_messages')).toEqual({ n: 0 })
    for (const [method, path] of routes) expect((await t.call(method, path, t.admin)).status, `${method} ${path} administrator`).toBe(200)
  })

  it('lets an editor read the conversation of a request, and one message that belongs to a request, but not mail that belongs to none', async () => {
    const t = await setup()
    await t.sync()
    const tied = t.messageId('g1')
    const loose = t.messageId('g4')
    expect((await t.call('GET', `/api/admin/inquiries/${t.inquiryId}/emails`, t.editor)).status).toBe(200)
    expect((await t.call('GET', `/api/admin/quote-requests/${t.requestId}/emails`, t.editor)).status).toBe(200)
    expect((await t.call('GET', `/api/admin/gmail/messages/${tied}`, t.editor)).status).toBe(200)
    const hidden = await t.call('GET', `/api/admin/gmail/messages/${loose}`, t.editor)
    expect([hidden.status, hidden.json.error.code], 'it does not even exist for an editor').toEqual([404, 'not_found'])
    expect(hidden.text).not.toContain('stranger@example.org')
    expect((await t.call('GET', `/api/admin/gmail/messages/${loose}`, t.admin)).status).toBe(200)
    for (const path of [`/api/admin/inquiries/${t.inquiryId}/emails`, `/api/admin/quote-requests/${t.requestId}/emails`, `/api/admin/gmail/messages/${tied}`]) expect((await t.call('GET', path, null)).status, path).toBe(401)
  })

  it('lets an editor place a message on a request, or take it off, only when it already belongs to one', async () => {
    const t = await setup()
    await t.sync()
    const tied = t.messageId('g1')
    const loose = t.messageId('g4')
    const target = { entityType: 'quote_request', entityId: t.requestId }
    const refused = await t.call('PUT', `/api/admin/gmail/messages/${loose}/association`, t.editor, target)
    expect(refused.status).toBe(404)
    expect((await t.call('DELETE', `/api/admin/gmail/messages/${loose}/association`, t.editor)).status).toBe(404)
    expect(t.s.db.get('SELECT inquiry_id, quote_request_id FROM gmail_messages WHERE id = ?', [loose])).toEqual({ inquiry_id: null, quote_request_id: null })
    expect((await t.call('PUT', `/api/admin/gmail/messages/${tied}/association`, t.editor, target)).status).toBe(200)
    expect((await t.call('DELETE', `/api/admin/gmail/messages/${tied}/association`, t.editor)).status).toBe(200)
    for (const method of ['PUT', 'DELETE']) expect((await t.call(method, `/api/admin/gmail/messages/${tied}/association`, null, target)).status, method).toBe(401)
  })

  it('protects every change against forged requests: the CSRF token, and the administration’s own origin', async () => {
    const t = await setup()
    await t.sync()
    const callsBefore = t.google.requests.length
    const loose = t.messageId('g4')
    const target = { entityType: 'inquiry', entityId: t.inquiryId }
    const state = () => JSON.stringify(t.s.db.all('SELECT id, inquiry_id, quote_request_id, association_locked FROM gmail_messages ORDER BY id'))
    const before = state()
    const requests: [string, string, unknown][] = [['POST', '/api/admin/gmail/sync', {}], ['PUT', `/api/admin/gmail/messages/${loose}/association`, target], ['DELETE', `/api/admin/gmail/messages/${loose}/association`, undefined]]
    for (const [method, path, body] of requests) {
      const send = (headers: Record<string, string>) => t.s.api(path, { method, body, headers })
      const noToken = await send({ Cookie: t.admin.cookie })
      expect([noToken.status, noToken.json.error.code], `${method} ${path} without a token`).toEqual([403, 'csrf_failed'])
      const wrong = await send({ Cookie: t.admin.cookie, 'X-CSRF-Token': `${t.admin.csrf}x` })
      expect([wrong.status, wrong.json.error.code], `${method} ${path} with a wrong token`).toEqual([403, 'csrf_failed'])
      const foreign = await send({ Cookie: t.admin.cookie, 'X-CSRF-Token': t.admin.csrf, Origin: 'https://evil.example' })
      expect([foreign.status, foreign.json.error.code], `${method} ${path} from another site`).toEqual([403, 'origin_not_allowed'])
    }
    expect(state(), 'nothing changed').toBe(before)
    expect(t.google.requests.length, 'and Google was not asked').toBe(callsBefore)
    expect(audits(t.s).map((row) => row.action)).toEqual(['gmail.sync'])
  })
})

describe('the messages of a request', () => {
  it('lists a conversation oldest first, with a summary of each message and not the text', async () => {
    const t = await setup()
    await t.sync()
    const list = await t.call('GET', `/api/admin/inquiries/${t.inquiryId}/emails`, t.admin)
    expect(list.status).toBe(200)
    expect(list.json.meta).toEqual({ total: 2, limit: 50, offset: 0 })
    expect(list.json.data.map((entry: { subject: string }) => entry.subject)).toEqual(['About the website', 'Re: About the website'])
    expect(list.json.data[0]).toEqual({
      id: t.messageId('g1'),
      threadId: 'ta',
      direction: 'inbound',
      from: { name: 'Anna Kovács', address: 'anna@example.com' },
      to: [{ name: 'Site', address: ACCOUNT, type: 'to' }],
      subject: 'About the website',
      snippet: BODY.slice(0, 200),
      receivedAt: '2026-11-03T08:00:00.000Z',
      attachmentCount: 1,
      association: { entityType: 'inquiry', entityId: t.inquiryId, source: 'sender' },
    })
    expect(JSON.stringify(list.json.data)).not.toContain('bodyText')
    const quotes = await t.call('GET', `/api/admin/quote-requests/${t.requestId}/emails`, t.admin)
    expect(quotes.json.data.map((entry: { subject: string }) => entry.subject)).toEqual(['The quote'])
  })

  it('pages, and refuses a page that is not a number', async () => {
    const t = await setup()
    await t.sync()
    const page = await t.call('GET', `/api/admin/inquiries/${t.inquiryId}/emails?limit=1&offset=1`, t.admin)
    expect(page.json.meta).toEqual({ total: 2, limit: 1, offset: 1 })
    expect(page.json.data.map((entry: { subject: string }) => entry.subject)).toEqual(['Re: About the website'])
    expect((await t.call('GET', `/api/admin/inquiries/${t.inquiryId}/emails?limit=500`, t.admin)).json.meta.limit).toBe(100)
    for (const query of ['limit=abc', 'offset=-1', 'limit=1;DROP', 'offset=1e9']) expect((await t.call('GET', `/api/admin/inquiries/${t.inquiryId}/emails?${query}`, t.admin)).status, query).toBe(422)
  })

  it('says 404 for a request that does not exist, and for an id that is not an id', async () => {
    const t = await setup()
    for (const id of ['no-such-inquiry', '00000000-0000-4000-8000-000000000000', "x'; DROP TABLE gmail_messages; --", 'a'.repeat(100)]) {
      expect((await t.call('GET', `/api/admin/inquiries/${encodeURIComponent(id)}/emails`, t.admin)).status, id).toBe(404)
      expect((await t.call('GET', `/api/admin/quote-requests/${encodeURIComponent(id)}/emails`, t.admin)).status, id).toBe(404)
    }
    // An inquiry's id is not a quote request's.
    expect((await t.call('GET', `/api/admin/quote-requests/${t.inquiryId}/emails`, t.admin)).status).toBe(404)
  })

  it('reads one message in full: the text and what is attached, as metadata, and nothing of the raw payload', async () => {
    const t = await setup()
    await t.sync()
    const read = await t.call('GET', `/api/admin/gmail/messages/${t.messageId('g1')}`, t.admin)
    expect(read.status).toBe(200)
    expect(read.json.data).toMatchObject({ bodyText: BODY, bodyTruncated: false, sentAt: '2026-11-02T10:00:00.000Z', manuallyCleared: false, attachments: [{ filename: 'brief.pdf', mimeType: 'application/pdf', size: 52_000, inline: false }] })
    expect(Object.keys(read.json.data).sort()).toEqual(['association', 'attachmentCount', 'attachments', 'bodyText', 'bodyTruncated', 'direction', 'from', 'id', 'manuallyCleared', 'receivedAt', 'sentAt', 'snippet', 'subject', 'threadId', 'to'])
    for (const hidden of ['ATTACHMENT-ID-OF-GOOGLE', 'attachmentId', 'payload', 'gmail_message_id', 'internalDate', 'labelIds', 'Message-ID', 'rfc_message_id', 'partId']) expect(read.text, hidden).not.toContain(hidden)
    expect((await t.call('GET', '/api/admin/gmail/messages/not-an-id', t.admin)).status).toBe(404)
    expect((await t.call('GET', '/api/admin/gmail/messages/00000000-0000-4000-8000-000000000000', t.admin)).status).toBe(404)
  })

  it('lists the messages that wait for a request, newest first', async () => {
    const t = await setup()
    await t.sync()
    const list = await t.call('GET', '/api/admin/gmail/unassigned', t.admin)
    expect(list.json.meta).toEqual({ total: 1, limit: 50, offset: 0 })
    expect(list.json.data.map((entry: { subject: string }) => entry.subject)).toEqual(['Not a customer'])
    expect(list.json.data[0].association).toBeNull()
  })
})

describe('placing a message on a request by hand', () => {
  it('places it, locks that decision, answers with the message, and logs who did what without a word of the message', async () => {
    const t = await setup()
    await t.sync()
    const loose = t.messageId('g4')
    const placed = await t.call('PUT', `/api/admin/gmail/messages/${loose}/association`, t.admin, { entityType: 'quote_request', entityId: t.requestId })
    expect(placed.status).toBe(200)
    expect(placed.json.data.association).toEqual({ entityType: 'quote_request', entityId: t.requestId, source: 'manual' })
    expect(t.s.db.get('SELECT inquiry_id, quote_request_id, association_source, association_locked FROM gmail_messages WHERE id = ?', [loose])).toEqual({ inquiry_id: null, quote_request_id: t.requestId, association_source: 'manual', association_locked: 1 })
    expect((await t.call('GET', '/api/admin/gmail/sync-status', t.admin)).json.data.pendingAssociationCount).toBe(0)
    expect((await t.call('GET', `/api/admin/quote-requests/${t.requestId}/emails`, t.admin)).json.meta.total).toBe(2)
    const entry = audits(t.s).find((row) => row.action === 'gmail.message.associate')!
    expect(entry).toMatchObject({ entity_type: 'gmail_message', entity_id: loose })
    expect(JSON.parse(entry.detail!)).toEqual({ entityType: 'quote_request', entityId: t.requestId })
  })

  it('moves a message from one request to another', async () => {
    const t = await setup()
    await t.sync()
    const tied = t.messageId('g1')
    const moved = await t.call('PUT', `/api/admin/gmail/messages/${tied}/association`, t.admin, { entityType: 'quote_request', entityId: t.requestId })
    expect(moved.json.data.association).toMatchObject({ entityType: 'quote_request', entityId: t.requestId, source: 'manual' })
    expect(t.s.db.get('SELECT inquiry_id FROM gmail_messages WHERE id = ?', [tied])).toEqual({ inquiry_id: null })
  })

  it('feeds the conversation: the next message of that thread follows the hand-made decision', async () => {
    const t = await setup()
    await t.sync()
    await t.call('PUT', `/api/admin/gmail/messages/${t.messageId('g4')}/association`, t.admin, { entityType: 'inquiry', entityId: t.inquiryId })
    t.google.add(gmailMessage({ id: 'g5', threadId: 'tc', from: 'someone.else@example.net', subject: 'Re: Not a customer', internalDate: Date.parse('2026-11-03T12:00:00Z') }))
    await t.sync()
    expect(t.s.db.get('SELECT inquiry_id, association_source FROM gmail_messages WHERE gmail_message_id = ?', ['g5'])).toEqual({ inquiry_id: t.inquiryId, association_source: 'thread' })
  })

  it.each([
    ['no body at all', {}, ['entityType']],
    ['an entity type that is not one', { entityType: 'user', entityId: 'x' }, ['entityType']],
    ['an entity type that is a table name', { entityType: 'admin_users', entityId: 'x' }, ['entityType']],
    ['an entity type that is not text', { entityType: 7, entityId: 'x' }, ['entityType']],
    ['no id', { entityType: 'inquiry' }, ['entityId']],
    ['an id that is not text', { entityType: 'inquiry', entityId: 12 }, ['entityId']],
    ['an id with SQL in it', { entityType: 'inquiry', entityId: "x' OR '1'='1" }, ['entityId']],
    ['an id that is too long', { entityType: 'inquiry', entityId: 'a'.repeat(65) }, ['entityId']],
    ['a request that does not exist', { entityType: 'inquiry', entityId: '00000000-0000-4000-8000-000000000000' }, ['entityId']],
  ])('refuses %s, and changes nothing', async (_name, body, fields) => {
    const t = await setup()
    await t.sync()
    const loose = t.messageId('g4')
    const before = JSON.stringify(t.s.db.all('SELECT * FROM gmail_messages ORDER BY id'))
    const answer = await t.call('PUT', `/api/admin/gmail/messages/${loose}/association`, t.admin, body)
    expect([answer.status, answer.json.error.code]).toEqual([422, 'validation_failed'])
    expect(Object.keys(answer.json.error.details.fields)).toEqual(fields)
    expect(JSON.stringify(t.s.db.all('SELECT * FROM gmail_messages ORDER BY id'))).toBe(before)
    expect(audits(t.s).map((row) => row.action)).toEqual(['gmail.sync'])
  })

  it('does not take an inquiry’s id for a quote request’s, or the other way round', async () => {
    const t = await setup()
    await t.sync()
    const loose = t.messageId('g4')
    expect((await t.call('PUT', `/api/admin/gmail/messages/${loose}/association`, t.admin, { entityType: 'quote_request', entityId: t.inquiryId })).status).toBe(422)
    expect((await t.call('PUT', `/api/admin/gmail/messages/${loose}/association`, t.admin, { entityType: 'inquiry', entityId: t.requestId })).status).toBe(422)
  })

  it('says 404 for a message that is not there, before looking at anything else', async () => {
    const t = await setup()
    await t.sync()
    expect((await t.call('PUT', '/api/admin/gmail/messages/not-an-id/association', t.admin, { entityType: 'inquiry', entityId: t.inquiryId })).status).toBe(404)
    expect((await t.call('DELETE', '/api/admin/gmail/messages/00000000-0000-4000-8000-000000000000/association', t.admin)).status).toBe(404)
  })

  it('takes a message off its request for good: it is not offered as waiting, and the log says so', async () => {
    const t = await setup()
    await t.sync()
    const tied = t.messageId('g1')
    const cleared = await t.call('DELETE', `/api/admin/gmail/messages/${tied}/association`, t.admin)
    expect(cleared.status).toBe(200)
    expect(cleared.json.data).toMatchObject({ association: null, manuallyCleared: true })
    expect(t.s.db.get('SELECT inquiry_id, quote_request_id, association_source, association_locked FROM gmail_messages WHERE id = ?', [tied])).toEqual({ inquiry_id: null, quote_request_id: null, association_source: null, association_locked: 1 })
    const status = (await t.call('GET', '/api/admin/gmail/sync-status', t.admin)).json.data
    expect(status.pendingAssociationCount, 'only the one nobody has looked at').toBe(1)
    expect((await t.call('GET', '/api/admin/gmail/unassigned', t.admin)).json.data.map((entry: { id: string }) => entry.id)).not.toContain(tied)
    expect((await t.call('GET', `/api/admin/inquiries/${t.inquiryId}/emails`, t.admin)).json.meta.total).toBe(1)
    const entry = audits(t.s).find((row) => row.action === 'gmail.message.unassociate')!
    expect(JSON.parse(entry.detail!)).toEqual({ entityType: 'inquiry', entityId: t.inquiryId })
    // Doing it again is harmless.
    expect((await t.call('DELETE', `/api/admin/gmail/messages/${tied}/association`, t.admin)).status).toBe(200)
  })
})

describe('what is never said', () => {
  it('puts no credential in an answer, and no message text, subject or address in a log or in the administrator log', async () => {
    const t = await setup()
    const answers = [await t.sync(), await t.call('GET', '/api/admin/gmail/sync-status', t.admin), await t.call('GET', '/api/admin/gmail/unassigned', t.admin), await t.call('GET', `/api/admin/inquiries/${t.inquiryId}/emails`, t.admin), await t.call('GET', `/api/admin/gmail/messages/${t.messageId('g1')}`, t.admin), await t.call('PUT', `/api/admin/gmail/messages/${t.messageId('g4')}/association`, t.admin, { entityType: 'inquiry', entityId: t.inquiryId })]
    for (const answer of answers) for (const secret of [...SECRETS, CLIENT_ID]) expect(answer.text, secret).not.toContain(secret)
    const logs = t.s.logs.join('\n')
    for (const word of [BODY, 'SECRET-BODY-TEXT', 'About the website', 'Not a customer', 'anna@example.com', 'stranger@example.org', 'Anna Kovács', ...SECRETS]) {
      expect(logs, `log: ${word}`).not.toContain(word)
      expect(JSON.stringify(t.s.db.all('SELECT * FROM audit_log')), `audit: ${word}`).not.toContain(word)
    }
  })

  it('exposes nothing through the public address space, and nothing to the public assistant', async () => {
    const t = await setup()
    await t.sync()
    for (const path of ['/api/gmail/messages', '/api/gmail/sync', '/api/emails', `/api/inquiries/${t.inquiryId}/emails`, `/api/gmail/messages/${t.messageId('g1')}`]) {
      const answer = await t.s.api(path)
      expect([404, 405], path).toContain(answer.status)
      expect(answer.text, path).not.toContain('SECRET-BODY-TEXT')
    }
    // The assistant's code never touches the mailbox, so its knowledge, tools and answers cannot hold a word of it.
    const directory = join(import.meta.dirname, '../src/modules/ai')
    for (const file of readdirSync(directory).filter((name) => name.endsWith('.ts'))) expect(readFileSync(join(directory, file), 'utf8').toLowerCase(), file).not.toMatch(/gmail|gmail_messages/)
  })

  it('leaves the existing configuration views alone: e-mail, the Drive backup, and no address in the system page', async () => {
    const t = await setup({ env: { GOOGLE_DRIVE_CLIENT_ID: 'drive-id', GOOGLE_DRIVE_CLIENT_SECRET: 'drive-secret-value', GOOGLE_DRIVE_REFRESH_TOKEN: 'drive-refresh-value' } })
    await t.sync()
    const system = await t.call('GET', '/api/admin/system', t.admin)
    expect(system.json.data.config).toMatchObject({ emailProvider: 'file', googleDriveBackup: { enabled: true, credentials: 'set' }, gmail: { enabled: true, credentials: 'set', accountEmailSet: true, problems: [] } })
    expect(system.text).not.toContain(ACCOUNT)
    expect(system.json.data.migrations).toMatchObject({ current: 30, latest: 30, pending: 0 })
  })
})
