import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ConstraintError } from '../src/http/errors.ts'
import { createGmailApiClient } from '../src/modules/gmail/api.ts'
import { MIME_LIMITS } from '../src/modules/gmail/mime.ts'
import { insertMessage, readSyncState, type MessageRow } from '../src/modules/gmail/repository.ts'
import { GmailSync, SyncBusyError } from '../src/modules/gmail/sync.ts'
import { eraseByEmail } from '../src/modules/system/maintenance.ts'
import { ACCESS_TOKEN, ACCOUNT, CLIENT_ID, CLIENT_SECRET, FakeGoogle, GMAIL_ENV, REFRESH_TOKEN, SECRETS, b64, gmailMessage, textPart } from './gmailKit.ts'
import { contact, quote, startServer, type TestServer } from './helpers.ts'

/**
 * Gmail, step 3: the synchronisation into `gmail_messages`, how a message is tied to a request, and what happens when things go wrong.
 * Google is a stand-in (gmailKit.ts) handed to the server as its `fetch`; no real account is involved and every value is made up.
 */

const cleanup: string[] = []
let server: TestServer | null = null
afterEach(async () => {
  await server?.close()
  server = null
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true })
})

async function setup(options: { env?: Record<string, string>; databasePath?: string; google?: FakeGoogle } = {}) {
  const google = options.google ?? new FakeGoogle()
  const s = await startServer({ env: { ...GMAIL_ENV, ...options.env }, fetch: google.fetch, databasePath: options.databasePath, seed: options.databasePath ? false : undefined })
  server = s
  let n = 0
  const unique = () => (n += 1)
  return {
    s,
    google,
    sync: s.app.context.gmailSync,
    db: s.db,
    rows: () => s.db.all<MessageRow>('SELECT * FROM gmail_messages ORDER BY received_at, gmail_message_id'),
    byGmailId: (id: string) => s.db.get<MessageRow>('SELECT * FROM gmail_messages WHERE gmail_message_id = ?', [id])!,
    /** A contact message from `email`: an inquiry the sender rule can find. */
    async inquiry(email: string): Promise<string> {
      const i = unique()
      const response = await s.api('/api/contact', { body: contact({ email, subject: `Subject number ${i}`, message: `This is message number ${i}, long enough to be accepted by the form.` }) })
      expect(response.status).toBe(201)
      s.clock.advance(1000)
      return s.db.get<{ id: string }>('SELECT id FROM inquiries WHERE email = ? ORDER BY created_at DESC, rowid DESC', [email])!.id
    },
    async quoteRequest(email: string): Promise<string> {
      const i = unique()
      const response = await s.api('/api/quote-requests', { body: quote({ email, description: `A small website number ${i} for a bakery, with opening hours and a contact form.` }) })
      expect(response.status).toBe(201)
      s.clock.advance(1000)
      return s.db.get<{ id: string }>('SELECT id FROM quote_requests WHERE email = ? ORDER BY created_at DESC, rowid DESC', [email])!.id
    },
  }
}

describe('importing', () => {
  it('stores what the inbox holds, with the sender, the text, the time, the thread and where it stands', async () => {
    const t = await setup()
    t.google.add(gmailMessage({ id: 'a1', threadId: 't1', from: 'Stranger <stranger@example.org>', subject: 'Hello', text: 'First message.', internalDate: Date.parse('2026-11-03T08:00:00Z') }), gmailMessage({ id: 'a2' }), gmailMessage({ id: 'a3' }))
    const result = await t.sync.run()
    expect(result).toEqual({ imported: 3, skippedDuplicates: 0, associated: 0, unassigned: 3, failed: 0, remaining: 0, lastSyncAt: t.s.clock.now().toISOString(), error: null })
    expect(t.rows()).toHaveLength(3)
    expect(t.byGmailId('a1')).toMatchObject({ gmail_thread_id: 't1', direction: 'inbound', sender_address: 'stranger@example.org', sender_name: 'Stranger', subject: 'Hello', body_text: 'First message.', received_at: '2026-11-03T08:00:00.000Z', body_truncated: 0, inquiry_id: null, quote_request_id: null, association_source: null, association_locked: 0 })
    expect(readSyncState(t.db)).toEqual({ lastAttemptAt: t.s.clock.now().toISOString(), lastSuccessAt: t.s.clock.now().toISOString(), lastError: null, lastImported: 3, lastFailed: 0 })
    expect(t.sync.status()).toEqual({ configured: true, lastSyncAt: t.s.clock.now().toISOString(), lastError: null, importedCount: 3, pendingAssociationCount: 3, currentlySyncing: false })
  })

  it('imports a message only once: a second run lists it, recognises it by its Gmail id, and does not fetch it again', async () => {
    const t = await setup()
    t.google.add(gmailMessage({ id: 'a1' }), gmailMessage({ id: 'a2' }))
    await t.sync.run()
    const fetched = t.google.count('get')
    const again = await t.sync.run()
    expect(again).toMatchObject({ imported: 0, skippedDuplicates: 2, failed: 0, error: null })
    expect(t.google.count('get'), 'known messages are not fetched again').toBe(fetched)
    expect(t.rows()).toHaveLength(2)
    t.google.add(gmailMessage({ id: 'a3' }))
    expect(await t.sync.run()).toMatchObject({ imported: 1, skippedDuplicates: 2 })
    expect(t.rows()).toHaveLength(3)
  })

  it('recognises a message that another run stored while this one was fetching it, and keeps one row', async () => {
    const t = await setup()
    t.google.add(gmailMessage({ id: 'race1' }))
    t.google.override = (request) => {
      if (request.kind !== 'get') return undefined
      // The same message arrives by another way (a second process, a repeated run) between the list and the insert.
      insertMessage(t.db, { id: 'other-internal-id', parsed: { gmailMessageId: 'race1', gmailThreadId: 'race1', rfcMessageId: null, labels: [], from: null, recipients: [], subject: '', bodyText: '', bodyTruncated: false, receivedAt: '2026-11-03T08:00:00.000Z', sentAt: null, inReplyTo: null, references: [], attachments: [] }, direction: 'inbound', target: null, source: null, importedAt: '2026-11-03T08:00:00.000Z' })
      return undefined
    }
    const result = await t.sync.run()
    expect(result).toMatchObject({ imported: 0, skippedDuplicates: 1, failed: 0 })
    expect(t.rows()).toHaveLength(1)
  })

  it('looks only at the inbox, and only at the window it was asked for', async () => {
    const t = await setup()
    const now = t.s.clock.now().getTime()
    t.google.add(
      gmailMessage({ id: 'in1' }),
      gmailMessage({ id: 'sent1', labels: ['SENT'] }),
      gmailMessage({ id: 'old1', internalDate: now - 40 * 86_400_000 }),
    )
    expect(await t.sync.run()).toMatchObject({ imported: 1 })
    expect(t.rows().map((row) => row.gmail_message_id)).toEqual(['in1'])
    const list = t.google.requests.find((request) => request.kind === 'list')!
    expect(list.query.getAll('labelIds')).toEqual(['INBOX'])
    expect(list.query.get('q')).toBe(`after:${Math.floor((now - 14 * 86_400_000) / 1000)}`)
    expect(await t.sync.run({ windowDays: 60 })).toMatchObject({ imported: 1, skippedDuplicates: 1 })
    expect(t.rows().map((row) => row.gmail_message_id).sort()).toEqual(['in1', 'old1'])
  })

  it('follows every page of the list', async () => {
    const t = await setup()
    t.google.pageSize = 2
    t.google.add(...['p1', 'p2', 'p3', 'p4', 'p5'].map((id) => gmailMessage({ id })))
    expect(await t.sync.run()).toMatchObject({ imported: 5 })
    expect(t.google.count('list')).toBe(3)
    expect(t.google.requests.filter((request) => request.kind === 'list').map((request) => request.query.get('pageToken'))).toEqual([null, 'p2', 'p4'])
  })

  it('takes the newest messages first when there are more than one run takes, and the next run continues with the rest', async () => {
    const t = await setup()
    const base = Date.parse('2026-11-03T08:00:00Z')
    t.google.add(...['n1', 'n2', 'n3', 'n4', 'n5'].map((id, index) => gmailMessage({ id, internalDate: base + index * 60_000 })))
    const first = await t.sync.run({ maxImport: 2 })
    expect(first).toMatchObject({ imported: 2, remaining: 3, error: null })
    expect(t.rows().map((row) => row.gmail_message_id).sort()).toEqual(['n4', 'n5'])
    expect(await t.sync.run({ maxImport: 2 })).toMatchObject({ imported: 2, remaining: 1, skippedDuplicates: 2 })
    expect(await t.sync.run({ maxImport: 2 })).toMatchObject({ imported: 1, remaining: 0, skippedDuplicates: 4 })
    expect(t.rows()).toHaveLength(5)
  })

  it('keeps the limits of one run inside what is allowed', async () => {
    const t = await setup()
    t.google.add(gmailMessage({ id: 'l1' }))
    await t.sync.run({ windowDays: 100_000, maxImport: 100_000 })
    await t.sync.run({ windowDays: -5, maxImport: 0 })
    const windows = t.google.requests.filter((request) => request.kind === 'list').map((request) => Number(/after:(\d+)/.exec(request.query.get('q') ?? '')?.[1]))
    const now = Math.floor(t.s.clock.now().getTime() / 1000)
    expect(windows).toEqual([now - 90 * 86_400, now - 86_400])
  })

  it('marks mail the mailbox itself sent as outbound, and keeps it to its conversation', async () => {
    const t = await setup()
    const id = await t.inquiry('customer@example.org')
    t.google.add(gmailMessage({ id: 'o1', from: `Site <${ACCOUNT}>`, to: 'customer@example.org', labels: ['INBOX', 'SENT'] }), gmailMessage({ id: 'o2', from: ACCOUNT.toUpperCase(), to: 'customer@example.org' }))
    await t.sync.run()
    expect(t.byGmailId('o1')).toMatchObject({ direction: 'outbound', inquiry_id: null })
    expect(t.byGmailId('o2').direction).toBe('outbound')
    expect(id).toBeTruthy()
  })

  it('stores a message without a readable sender, and a recipient list, as they are', async () => {
    const t = await setup()
    t.google.add(gmailMessage({ id: 'r1', from: 'undisclosed recipients', to: 'a@example.org, "B, C" <b@example.org>', cc: 'c@example.org' }))
    await t.sync.run()
    const row = t.byGmailId('r1')
    expect(row.sender_address).toBe('')
    expect(JSON.parse(row.recipients_json)).toEqual([
      { name: '', address: 'a@example.org', type: 'to' },
      { name: 'B, C', address: 'b@example.org', type: 'to' },
      { name: '', address: 'c@example.org', type: 'cc' },
    ])
  })
})

describe('tying a message to a request', () => {
  it('ties it to the inquiry whose address is the sender’s, when there is exactly one', async () => {
    const t = await setup()
    const inquiryId = await t.inquiry('anna@example.com')
    t.google.add(gmailMessage({ id: 's1', from: 'Anna <ANNA@example.com>' }))
    expect(await t.sync.run()).toMatchObject({ imported: 1, associated: 1, unassigned: 0 })
    expect(t.byGmailId('s1')).toMatchObject({ inquiry_id: inquiryId, quote_request_id: null, association_source: 'sender', association_locked: 0 })
  })

  it('ties it to the quote request whose address is the sender’s, when there is exactly one', async () => {
    const t = await setup()
    const requestId = await t.quoteRequest('bela@example.com')
    t.google.add(gmailMessage({ id: 's2', from: 'bela@example.com' }))
    await t.sync.run()
    expect(t.byGmailId('s2')).toMatchObject({ inquiry_id: null, quote_request_id: requestId, association_source: 'sender' })
  })

  it.each([
    ['two inquiries from the same address', async (t: Awaited<ReturnType<typeof setup>>) => void (await t.inquiry('twice@example.com'), await t.inquiry('twice@example.com'))],
    ['an inquiry and a quote request from the same address', async (t: Awaited<ReturnType<typeof setup>>) => void (await t.inquiry('twice@example.com'), await t.quoteRequest('twice@example.com'))],
    ['two quote requests from the same address', async (t: Awaited<ReturnType<typeof setup>>) => void (await t.quoteRequest('twice@example.com'), await t.quoteRequest('twice@example.com'))],
  ])('leaves it unassigned when the address belongs to more than one request: %s', async (_name, prepare) => {
    const t = await setup()
    await prepare(t)
    t.google.add(gmailMessage({ id: 'amb', from: 'twice@example.com' }))
    expect(await t.sync.run()).toMatchObject({ imported: 1, associated: 0, unassigned: 1 })
    expect(t.byGmailId('amb')).toMatchObject({ inquiry_id: null, quote_request_id: null, association_source: null })
    expect(t.sync.status().pendingAssociationCount).toBe(1)
  })

  it('leaves it unassigned when nobody has that address, and creates nothing', async () => {
    const t = await setup()
    await t.inquiry('known@example.com')
    const before = [t.db.get('SELECT COUNT(*) AS n FROM inquiries'), t.db.get('SELECT COUNT(*) AS n FROM quote_requests')]
    t.google.add(gmailMessage({ id: 'u1', from: 'stranger@example.org' }))
    await t.sync.run()
    expect(t.byGmailId('u1')).toMatchObject({ inquiry_id: null, quote_request_id: null })
    expect([t.db.get('SELECT COUNT(*) AS n FROM inquiries'), t.db.get('SELECT COUNT(*) AS n FROM quote_requests')]).toEqual(before)
  })

  it('follows the conversation: a message in a thread that already belongs to a request belongs to it, whoever sends it', async () => {
    const t = await setup()
    const inquiryId = await t.inquiry('anna@example.com')
    t.google.add(gmailMessage({ id: 'th1', threadId: 'thread-A', from: 'anna@example.com', internalDate: Date.parse('2026-11-03T08:00:00Z') }))
    await t.sync.run()
    t.google.add(gmailMessage({ id: 'th2', threadId: 'thread-A', from: 'Anna’s colleague <colleague@example.net>', internalDate: Date.parse('2026-11-03T09:00:00Z') }))
    expect(await t.sync.run()).toMatchObject({ imported: 1, associated: 1 })
    expect(t.byGmailId('th2')).toMatchObject({ inquiry_id: inquiryId, association_source: 'thread' })
  })

  it('processes the oldest first, so a reply from an unknown address finds the message it answers in the same run', async () => {
    const t = await setup()
    const inquiryId = await t.inquiry('anna@example.com')
    t.google.add(
      gmailMessage({ id: 'new-reply', threadId: 'thread-B', from: 'colleague@example.net', internalDate: Date.parse('2026-11-03T09:30:00Z') }),
      gmailMessage({ id: 'old-first', threadId: 'thread-B', from: 'anna@example.com', internalDate: Date.parse('2026-11-03T09:00:00Z') }),
    )
    expect(await t.sync.run()).toMatchObject({ imported: 2, associated: 2 })
    expect(t.byGmailId('old-first')).toMatchObject({ inquiry_id: inquiryId, association_source: 'sender' })
    expect(t.byGmailId('new-reply')).toMatchObject({ inquiry_id: inquiryId, association_source: 'thread' })
  })

  it('prefers the conversation to the address: a reply in a request’s thread stays there although its sender has another request', async () => {
    const t = await setup()
    const first = await t.inquiry('anna@example.com')
    const second = await t.inquiry('colleague@example.net')
    t.google.add(gmailMessage({ id: 'c1', threadId: 'thread-C', from: 'anna@example.com', internalDate: Date.parse('2026-11-03T08:00:00Z') }))
    await t.sync.run()
    t.google.add(gmailMessage({ id: 'c2', threadId: 'thread-C', from: 'colleague@example.net', internalDate: Date.parse('2026-11-03T09:00:00Z') }))
    await t.sync.run()
    expect(t.byGmailId('c2')).toMatchObject({ inquiry_id: first, association_source: 'thread' })
    expect(second).not.toBe(first)
  })

  it('leaves it unassigned when the conversation points at two requests, and does not fall back on the address', async () => {
    const t = await setup()
    const first = await t.inquiry('anna@example.com')
    const second = await t.inquiry('bela@example.com')
    const lonely = await t.inquiry('only@example.com')
    t.google.add(gmailMessage({ id: 'k1', threadId: 'thread-D', from: 'x1@example.org' }), gmailMessage({ id: 'k2', threadId: 'thread-D', from: 'x2@example.org' }))
    await t.sync.run()
    t.db.run('UPDATE gmail_messages SET inquiry_id = ? WHERE gmail_message_id = ?', [first, 'k1'])
    t.db.run('UPDATE gmail_messages SET inquiry_id = ? WHERE gmail_message_id = ?', [second, 'k2'])
    t.google.add(gmailMessage({ id: 'k3', threadId: 'thread-D', from: 'only@example.com' }))
    await t.sync.run()
    expect(t.byGmailId('k3')).toMatchObject({ inquiry_id: null, quote_request_id: null })
    expect(lonely).toBeTruthy()
  })

  it('follows a reply header to a stored message that belongs to a request, in another thread and from an unknown address', async () => {
    const t = await setup()
    const inquiryId = await t.inquiry('anna@example.com')
    t.google.add(gmailMessage({ id: 'h1', threadId: 'thread-E1', from: 'anna@example.com', messageId: '<original@mail.example.com>', internalDate: Date.parse('2026-11-03T08:00:00Z') }))
    await t.sync.run()
    t.google.add(
      gmailMessage({ id: 'h2', threadId: 'thread-E2', from: 'forwarder@example.net', inReplyTo: '<original@mail.example.com>', internalDate: Date.parse('2026-11-03T09:00:00Z') }),
      gmailMessage({ id: 'h3', threadId: 'thread-E3', from: 'other@example.net', references: '<x@y.z> <original@mail.example.com>', internalDate: Date.parse('2026-11-03T09:05:00Z') }),
    )
    await t.sync.run()
    expect(t.byGmailId('h2')).toMatchObject({ inquiry_id: inquiryId, association_source: 'reference' })
    expect(t.byGmailId('h3')).toMatchObject({ inquiry_id: inquiryId, association_source: 'reference' })
  })

  it('follows a reply to a message this system sent: its Message-ID is the delivery’s id', async () => {
    const t = await setup()
    const inquiryId = await t.inquiry('anna@example.com')
    const requestId = await t.quoteRequest('bela@example.com')
    // The status e-mails the site sends to the customers: their Message-ID is `<delivery id@domain>`.
    const toAnna = t.s.app.context.notifier.enqueue({ kind: 'inquiry_status', relatedType: 'inquiry', relatedId: inquiryId, recipient: 'anna@example.com', language: 'en' })
    const toBela = t.s.app.context.notifier.enqueue({ kind: 'quote_status', relatedType: 'quote_request', relatedId: requestId, recipient: 'bela@example.com', language: 'en' })
    t.google.add(
      gmailMessage({ id: 'd1', from: 'anna.private@example.net', inReplyTo: `<${toAnna}@site.test>` }),
      gmailMessage({ id: 'd2', from: 'someone@example.net', references: `<${toBela}@site.test>` }),
      gmailMessage({ id: 'd3', from: 'nobody@example.net', inReplyTo: '<00000000-0000-4000-8000-000000000000@site.test>' }),
    )
    await t.sync.run()
    expect(t.byGmailId('d1')).toMatchObject({ inquiry_id: inquiryId, association_source: 'reference' })
    expect(t.byGmailId('d2')).toMatchObject({ quote_request_id: requestId, association_source: 'reference' })
    expect(t.byGmailId('d3')).toMatchObject({ inquiry_id: null, quote_request_id: null })
  })

  it('never ties a message to a request that has since been deleted', async () => {
    const t = await setup()
    const inquiryId = await t.inquiry('anna@example.com')
    const delivery = t.s.app.context.notifier.enqueue({ kind: 'inquiry_status', relatedType: 'inquiry', relatedId: inquiryId, recipient: 'anna@example.com', language: 'en' })
    t.db.run('DELETE FROM inquiries WHERE id = ?', [inquiryId])
    t.google.add(gmailMessage({ id: 'x1', from: 'anna@example.com', inReplyTo: `<${delivery}@site.test>` }))
    expect(await t.sync.run()).toMatchObject({ imported: 1, unassigned: 1 })
  })
})

describe('what happens to a message when its request goes away', () => {
  it('keeps the message, unassigned again, and touches nothing else', async () => {
    const t = await setup()
    const doomed = await t.inquiry('anna@example.com')
    const other = await t.inquiry('bela@example.com')
    t.google.add(gmailMessage({ id: 'f1', from: 'anna@example.com' }), gmailMessage({ id: 'f2', from: 'bela@example.com' }), gmailMessage({ id: 'f3', from: 'stranger@example.org' }))
    await t.sync.run()
    const others = JSON.stringify([t.byGmailId('f2'), t.byGmailId('f3')])
    expect(t.db.run('DELETE FROM inquiries WHERE id = ?', [doomed]).changes).toBe(1)
    expect(t.byGmailId('f1')).toMatchObject({ inquiry_id: null, quote_request_id: null })
    expect(t.rows()).toHaveLength(3)
    expect(JSON.stringify([t.byGmailId('f2'), t.byGmailId('f3')]), 'unrelated messages are as they were').toBe(others)
    expect(t.byGmailId('f2').inquiry_id).toBe(other)
    expect(t.sync.status().pendingAssociationCount, 'the orphaned message waits for a request again').toBe(2)
  })

  it('does the same for a quote request, including the retention task that deletes finished ones', async () => {
    const t = await setup()
    const requestId = await t.quoteRequest('bela@example.com')
    t.google.add(gmailMessage({ id: 'q1', from: 'bela@example.com' }))
    await t.sync.run()
    t.db.run('DELETE FROM quote_requests WHERE id = ?', [requestId])
    expect(t.byGmailId('q1')).toMatchObject({ inquiry_id: null, quote_request_id: null })
  })

  it('has the database itself refuse an association to a request that does not exist, or to two at once', async () => {
    const t = await setup()
    const inquiryId = await t.inquiry('anna@example.com')
    const requestId = await t.quoteRequest('bela@example.com')
    t.google.add(gmailMessage({ id: 'v1', from: 'stranger@example.org' }))
    await t.sync.run()
    const id = t.byGmailId('v1').id
    expect(() => t.db.run('UPDATE gmail_messages SET inquiry_id = ? WHERE id = ?', ['no-such-inquiry', id])).toThrow(ConstraintError)
    expect(() => t.db.run('UPDATE gmail_messages SET inquiry_id = ?, quote_request_id = ? WHERE id = ?', [inquiryId, requestId, id])).toThrow(ConstraintError)
    expect(() => t.db.run("UPDATE gmail_messages SET direction = 'sideways' WHERE id = ?", [id])).toThrow(ConstraintError)
    expect(t.byGmailId('v1')).toMatchObject({ inquiry_id: null, quote_request_id: null })
  })

  it('is erased with the person: their messages, what was written to them, and what is tied to their requests; nobody else’s', async () => {
    const t = await setup()
    const inquiryId = await t.inquiry('forget@example.com')
    t.google.add(
      gmailMessage({ id: 'e1', from: 'forget@example.com' }),
      gmailMessage({ id: 'e2', from: `Site <${ACCOUNT}>`, to: 'Forget Me <FORGET@example.com>', labels: ['INBOX', 'SENT'] }),
      gmailMessage({ id: 'e3', from: 'colleague@example.net', threadId: 'thread-F' }),
      gmailMessage({ id: 'e4', from: 'keep@example.org', to: 'another@example.com' }),
      gmailMessage({ id: 'e5', from: 'keep2@example.org', to: 'xforget@example.com, forget@example.com.au' }),
    )
    await t.sync.run()
    t.db.run('UPDATE gmail_messages SET inquiry_id = ? WHERE gmail_message_id = ?', [inquiryId, 'e3'])
    const result = eraseByEmail(t.s.app.context, ' Forget@Example.com ')
    expect(result.gmailMessages).toBe(3)
    expect(t.rows().map((row) => row.gmail_message_id).sort()).toEqual(['e4', 'e5'])
  })

  it('is erased for a person who has no request at all: what they wrote, and what was written to them, and nothing else', async () => {
    const t = await setup()
    t.google.add(
      gmailMessage({ id: 'n1', from: 'Newsletter Person <person@example.net>' }),
      gmailMessage({ id: 'n2', from: `Site <${ACCOUNT}>`, to: 'person@example.net', labels: ['INBOX', 'SENT'] }),
      gmailMessage({ id: 'n3', from: 'other@example.net', to: 'person@example.net.hu, xperson@example.net' }),
    )
    await t.sync.run()
    expect(eraseByEmail(t.s.app.context, 'person@example.net')).toMatchObject({ inquiries: 0, quoteRequests: 0, gmailMessages: 2 })
    expect(t.rows().map((row) => row.gmail_message_id)).toEqual(['n3'])
  })
})

describe('when something goes wrong', () => {
  it('imports what it can read, counts what it cannot, and keeps going: a message that is malformed, too big or gone', async () => {
    const t = await setup()
    const base = Date.parse('2026-11-03T08:00:00Z')
    t.google.add(
      gmailMessage({ id: 'ok1', internalDate: base }),
      { id: 'bad1', threadId: 'bad1', internalDate: String(base + 1000), labelIds: ['INBOX'], payload: 'not a payload' },
      gmailMessage({ id: 'big1', internalDate: base + 2000, payload: { mimeType: 'text/plain', headers: [], body: { size: 1, data: b64('x'.repeat(MIME_LIMITS.partBytes + 10)) } } }),
      gmailMessage({ id: 'gone1', internalDate: base + 3000 }),
      gmailMessage({ id: 'ok2', internalDate: base + 4000 }),
    )
    t.google.override = (request) => (request.url.includes('/messages/gone1') ? new Response('{}', { status: 404 }) : undefined)
    const result = await t.sync.run()
    expect(result).toMatchObject({ imported: 2, failed: 3, error: 'partial_failure', remaining: 0, lastSyncAt: t.s.clock.now().toISOString() })
    expect(t.rows().map((row) => row.gmail_message_id).sort()).toEqual(['ok1', 'ok2'])
    expect(readSyncState(t.db)).toMatchObject({ lastError: 'partial_failure', lastFailed: 3, lastImported: 2 })
    // What failed is not remembered as done: the next run tries it again, and does not fetch what is stored.
    t.google.override = undefined
    const getsBefore = t.google.count('get')
    expect(await t.sync.run()).toMatchObject({ imported: 1, failed: 2, skippedDuplicates: 2 })
    expect(t.google.count('get') - getsBefore).toBe(3)
  })

  it('stops when every message would fail the same way, keeps what it had imported, and says why', async () => {
    const t = await setup()
    const base = Date.parse('2026-11-03T08:00:00Z')
    t.google.add(...['w1', 'w2', 'w3', 'w4', 'w5'].map((id, index) => gmailMessage({ id, internalDate: base + index * 1000 })))
    t.google.override = (request) => (request.url.includes('/messages/w3') ? new Response('{"error":{"message":"slow down"}}', { status: 429 }) : undefined)
    const result = await t.sync.run()
    expect(result).toMatchObject({ imported: 2, failed: 0, remaining: 3, error: 'rate_limited', lastSyncAt: null })
    expect(t.rows().map((row) => row.gmail_message_id)).toEqual(['w1', 'w2'])
    expect(readSyncState(t.db)).toMatchObject({ lastSuccessAt: null, lastError: 'rate_limited', lastImported: 2 })
    t.google.override = undefined
    const next = await t.sync.run()
    expect(next).toMatchObject({ imported: 3, skippedDuplicates: 2, error: null })
    expect(readSyncState(t.db)).toMatchObject({ lastSuccessAt: t.s.clock.now().toISOString(), lastError: null })
  })

  it.each([
    ['Google being down while listing', (google: FakeGoogle) => (google.override = (request) => (request.kind === 'list' ? new Response('{}', { status: 503 }) : undefined)), 'provider_unavailable'],
    ['no network', (google: FakeGoogle) => (google.override = (request) => (request.kind === 'list' ? new Error('connect ECONNREFUSED') : undefined)), 'network'],
    ['a refresh token that was revoked', (google: FakeGoogle) => (google.override = (request) => (request.kind === 'token' ? new Response('{"error":"invalid_grant"}', { status: 400 }) : undefined)), 'invalid_grant'],
    ['a token that Gmail refuses twice', (google: FakeGoogle) => (google.override = (request) => (request.kind === 'list' ? new Response('{}', { status: 401 }) : undefined)), 'api_unauthorized'],
    ['the Gmail API being switched off', (google: FakeGoogle) => (google.override = (request) => (request.kind === 'list' ? new Response('{"error":{"errors":[{"reason":"accessNotConfigured"}]}}', { status: 403 }) : undefined)), 'api_forbidden'],
    ['a token without the Gmail permissions', (google: FakeGoogle) => (google.tokenScopes = 'https://www.googleapis.com/auth/drive.file'), 'insufficient_scope'],
  ] as [string, (google: FakeGoogle) => unknown, string][])('ends the run with a category and imports nothing when it meets %s', async (_name, break_, category) => {
    const t = await setup()
    t.google.add(gmailMessage({ id: 'z1' }))
    break_(t.google)
    const result = await t.sync.run()
    expect(result).toMatchObject({ imported: 0, error: category, lastSyncAt: null })
    expect(t.sync.status()).toMatchObject({ lastError: category, lastSyncAt: null, importedCount: 0, currentlySyncing: false })
    expect(t.rows()).toHaveLength(0)
  })

  it('does nothing at all, and asks nobody, without a complete Gmail configuration', async () => {
    const t = await setup({ env: { GMAIL_REFRESH_TOKEN: '' } })
    const result = await t.sync.run()
    expect(result).toMatchObject({ imported: 0, error: 'not_configured' })
    expect(t.google.requests).toHaveLength(0)
    expect(t.sync.status().configured).toBe(false)
  })

  it('stops at its time limit, reports what is left, and keeps what it did', async () => {
    const t = await setup()
    t.google.add(...['t1', 't2', 't3', 't4'].map((id, index) => gmailMessage({ id, internalDate: Date.parse('2026-11-03T08:00:00Z') + index * 1000 })))
    t.google.override = (request) => {
      if (request.kind === 'get') t.s.clock.advance(3000)
      return undefined
    }
    const slow = new GmailSync({ config: t.s.config.gmail, db: t.db, clock: t.s.clock, log: t.s.app.context.log, api: createGmailApiClient(t.s.app.context.gmail, { fetch: t.google.fetch }), deadlineMs: 5000 })
    const result = await slow.run()
    expect(result).toMatchObject({ imported: 2, remaining: 2, error: 'timeout', lastSyncAt: null })
    expect(t.rows()).toHaveLength(2)
  })
})

describe('one run at a time', () => {
  it('refuses a second run while the first is under way, and takes the next one when it is over', async () => {
    const t = await setup()
    t.google.add(gmailMessage({ id: 'c1' }))
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    t.google.override = async (request) => {
      if (request.kind === 'get') await gate
      return undefined
    }
    const first = t.sync.run()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(t.sync.currentlySyncing).toBe(true)
    expect(t.sync.status().currentlySyncing).toBe(true)
    await expect(t.sync.run()).rejects.toBeInstanceOf(SyncBusyError)
    release()
    expect(await first).toMatchObject({ imported: 1 })
    expect(t.sync.currentlySyncing).toBe(false)
    expect(await t.sync.run()).toMatchObject({ imported: 0, skippedDuplicates: 1 })
    expect(t.google.count('get')).toBe(1)
  })

  it('is free again after a run that failed', async () => {
    const t = await setup()
    t.google.override = (request) => (request.kind === 'list' ? new Error('down') : undefined)
    expect((await t.sync.run()).error).toBe('network')
    expect(t.sync.currentlySyncing).toBe(false)
    t.google.override = undefined
    expect((await t.sync.run()).error).toBeNull()
  })
})

describe('remembering', () => {
  it('has the messages and the state in a service that is made again over the same database', async () => {
    const t = await setup()
    t.google.add(gmailMessage({ id: 'm1' }), gmailMessage({ id: 'm2' }))
    await t.sync.run()
    const again = new GmailSync({ config: t.s.config.gmail, db: t.db, clock: t.s.clock, log: t.s.app.context.log, api: createGmailApiClient(t.s.app.context.gmail, { fetch: t.google.fetch }) })
    expect(again.status()).toEqual({ configured: true, lastSyncAt: t.s.clock.now().toISOString(), lastError: null, importedCount: 2, pendingAssociationCount: 2, currentlySyncing: false })
    expect(await again.run()).toMatchObject({ imported: 0, skippedDuplicates: 2 })
  })

  it('has them after the server is stopped and started again over the same database file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-gmail-db-'))
    cleanup.push(directory)
    const databasePath = join(directory, 'gmail.sqlite')
    const first = await setup({ databasePath })
    first.google.add(gmailMessage({ id: 'p1', text: 'Kept across a restart.' }), gmailMessage({ id: 'p2' }))
    await first.sync.run()
    const syncedAt = first.s.clock.now().toISOString()
    await server?.close()
    server = null

    const second = await setup({ databasePath, google: first.google })
    expect(second.sync.status()).toMatchObject({ lastSyncAt: syncedAt, importedCount: 2, currentlySyncing: false })
    expect(second.byGmailId('p1').body_text).toBe('Kept across a restart.')
    second.google.add(gmailMessage({ id: 'p3' }))
    expect(await second.sync.run()).toMatchObject({ imported: 1, skippedDuplicates: 2 })
    expect(second.rows()).toHaveLength(3)
  })

  it('stores no credential or token anywhere in the database, and no message text in a log', async () => {
    const t = await setup()
    t.google.add(gmailMessage({ id: 'pv1', from: 'Private Person <private.person@example.org>', subject: 'Confidential subject line', text: 'SECRET-BODY-TEXT that must never reach a log.' }), { id: 'pv2', threadId: 'pv2', internalDate: '1', payload: {} })
    await t.sync.run()
    const tables = t.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name)
    const dump = JSON.stringify(tables.map((name) => t.db.all(`SELECT * FROM "${name}"`)))
    for (const secret of [...SECRETS, CLIENT_ID]) expect(dump, secret).not.toContain(secret)
    const logs = t.s.logs.join('\n')
    expect(logs).toContain('Gmail synchronization')
    for (const private_ of ['SECRET-BODY-TEXT', 'Confidential subject line', 'private.person@example.org', 'Private Person', ...SECRETS]) expect(logs, private_).not.toContain(private_)
  })
})

describe('the Gmail credentials and the existing mail settings', () => {
  it('leave the SMTP, e-mail and Google Drive configuration as they were, with the synchronisation present', async () => {
    const t = await setup({ env: { GOOGLE_DRIVE_CLIENT_ID: 'drive-id', GOOGLE_DRIVE_CLIENT_SECRET: 'drive-secret-value', GOOGLE_DRIVE_REFRESH_TOKEN: 'drive-refresh-value' } })
    t.google.add(gmailMessage({ id: 'k1' }))
    await t.sync.run()
    // Only Google's token address and the Gmail API were called, and only with the Gmail credentials.
    expect(new Set(t.google.requests.map((request) => new URL(request.url).hostname))).toEqual(new Set(['oauth2.googleapis.com', 'gmail.googleapis.com']))
    expect(t.google.requests.every((request) => !JSON.stringify(request).includes('drive-'))).toBe(true)
    expect(t.s.config.backup).toMatchObject({ enabled: true, clientId: 'drive-id', clientSecret: 'drive-secret-value', refreshToken: 'drive-refresh-value' })
    expect(t.s.config.email.provider).toBe('file')
    expect(t.s.mailer.sent.filter((mail) => String(mail.to).includes('example.org')), 'importing mail sends none').toHaveLength(0)
  })
})

// A stand-in value is used so the compiler keeps these imports honest.
void [CLIENT_SECRET, REFRESH_TOKEN, ACCESS_TOKEN, textPart]
