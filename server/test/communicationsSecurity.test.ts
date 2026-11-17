import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Database } from '../src/db/database.ts'
import { MIGRATIONS_DIRECTORY, migrate } from '../src/db/migrate.ts'
import { ConstraintError } from '../src/http/errors.ts'
import { CONVERSATION_STATUSES, CONTEXT_TYPES, EVENT_KEYS, MESSAGE_TYPES } from '../src/modules/communications/model.ts'
import { makeCommunicationKit, newToken, type CommunicationKit } from './communicationKit.ts'
import { TestClock } from './helpers.ts'

/**
 * PROMPT 28: the doors and the walls. A stranger, another customer, an administrator's cookie on the customer's side and the reverse; what a body may and may not say; hostile text;
 * limits; and what the database itself refuses when somebody writes to it some other way.
 */

let k: CommunicationKit | undefined
const folders: string[] = []
afterEach(async () => {
  await k?.close()
  k = undefined
  while (folders.length) rmSync(folders.pop()!, { recursive: true, force: true })
})

describe('the doors', () => {
  it('every address answers a stranger 401; the administrator’s cookie is nothing on the customer’s side, and the customer’s is nothing on the administration’s', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const customerSide: Array<[string, string, unknown?]> = [
      ['GET', '/api/portal/messages'],
      ['GET', '/api/portal/messages/summary'],
      ['GET', '/api/portal/messages/contexts'],
      ['GET', '/api/portal/messages/search?q=logo'],
      ['POST', '/api/portal/messages', { subject: 'Hi', body: 'Hi' }],
      ['GET', `/api/portal/messages/${reference}`],
      ['POST', `/api/portal/messages/${reference}/messages`, { body: 'Hi' }],
      ['POST', `/api/portal/messages/${reference}/read`, { upTo: 1 }],
      ['POST', `/api/portal/messages/${reference}/request-resolution`, {}],
      ['GET', '/api/portal/message-preferences'],
      ['PUT', '/api/portal/message-preferences', { replies: false }],
    ]
    const adminSide: Array<[string, string, unknown?]> = [
      ['GET', '/api/admin/communications'],
      ['GET', '/api/admin/communications/overview'],
      ['GET', '/api/admin/communications/search?q=logo'],
      ['GET', '/api/admin/communications/contexts?customerId=abcdefgh'],
      ['POST', '/api/admin/communications', { customerId: 'abcdefgh', subject: 'Hi', body: 'Hi' }],
      ['GET', `/api/admin/communications/${reference}`],
      ['GET', `/api/admin/communications/${reference}/search?q=logo`],
      ['POST', `/api/admin/communications/${reference}/messages`, { kind: 'note', body: 'Hi' }],
      ['PATCH', `/api/admin/communications/${reference}/messages/abcdefgh`, { body: 'Hi' }],
      ['DELETE', `/api/admin/communications/${reference}/messages/abcdefgh`],
      ['POST', `/api/admin/communications/${reference}/status`, { status: 'resolved', revision: 1 }],
      ['POST', `/api/admin/communications/${reference}/read`, { upTo: 1 }],
      ['GET', '/api/admin/communication-settings'],
      ['PUT', '/api/admin/communication-settings', { customerCanStart: true }],
    ]
    const api = k.w.kit.api
    for (const [method, path, body] of customerSide) {
      expect((await api(path, { method, body })).status, `${method} ${path} as a stranger`).toBe(401)
      expect((await api(path, { method, body, headers: k.w.kit.admin })).status, `${method} ${path} with the administrator's cookie`).toBe(401)
    }
    for (const [method, path, body] of adminSide) {
      expect((await api(path, { method, body })).status, `${method} ${path} as a stranger`).toBe(401)
      expect((await api(path, { method, body, headers: k.anna.headers })).status, `${method} ${path} with a customer's cookie`).toBe(401)
    }
  }, 30_000)

  it('a change without the session’s own token, or from another site, is refused, and nothing is written', async () => {
    k = await makeCommunicationKit()
    await k.open()
    const reference = await k.startedByOwner()
    const { cookie } = k.anna
    const before = k.w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM conversation_messages')!.n
    const api = k.w.kit.api
    expect((await api(k.mine(`/${reference}/messages`), { method: 'POST', body: { body: 'No token.', clientToken: newToken() }, headers: { cookie } })).status).toBe(403)
    expect((await api(k.mine(`/${reference}/messages`), { method: 'POST', body: { body: 'Wrong token.', clientToken: newToken() }, headers: { cookie, 'x-csrf-token': 'wrong' } })).status).toBe(403)
    expect((await api(k.mine(`/${reference}/messages`), { method: 'POST', body: { body: 'Another site.', clientToken: newToken() }, headers: { ...k.anna.headers, origin: 'https://evil.test' } })).status).toBe(403)
    expect((await api(k.admin(`/${reference}/messages`), { method: 'POST', body: { kind: 'note', body: 'No token.' }, headers: { cookie: k.w.kit.adminSession.cookie } })).status).toBe(403)
    expect((await api(k.admin(`/${reference}/messages`), { method: 'POST', body: { kind: 'note', body: 'Another site.' }, headers: { ...k.w.kit.admin, origin: 'https://evil.test' } })).status).toBe(403)
    expect(k.w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM conversation_messages')!.n).toBe(before)
  })

  it('an editor works on conversations; reading is for anyone who may read customers; the settings are the administrator’s', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    expect((await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'From the editor.' }, 'editor')).status).toBe(201)
    expect((await k.call('GET', k.admin('/overview'), undefined, 'editor')).status).toBe(200)
    expect((await k.call('PUT', '/api/admin/communication-settings', { customerCanStart: true }, 'editor')).status).toBe(403)
  })
})

describe('whose it is', () => {
  it('another customer gets the same answer for a conversation that is not theirs as for one that does not exist, on every address', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner({ subject: 'ANNA-ONLY-SUBJECT', body: 'ANNA-ONLY-WORDS' })
    const { customer: bela } = await k.other()
    await k.open()
    const foreign = async (path: string, method = 'GET', body?: unknown) => (method === 'GET' ? bela.get(path) : bela.post(path, body))
    for (const [method, suffix, body] of [['GET', ''], ['POST', '/messages', { body: 'Intruding.', clientToken: newToken() }], ['POST', '/read', { upTo: 3 }], ['POST', '/request-resolution', {}]] as const) {
      const mine = await foreign(k.mine(`/${reference}${suffix}`), method, body)
      const unknown = await foreign(k.mine(`/MSG-NOPE0000${suffix}`), method, body)
      expect(mine.status, `${method} ${suffix}`).toBe(404)
      expect(unknown.status).toBe(404)
      expect(mine.json.error.code).toBe(unknown.json.error.code)
      expect(mine.json.error.message).toBe(unknown.json.error.message)
      expect(Object.keys(mine.json.error).sort()).toEqual(Object.keys(unknown.json.error).sort())
    }
    // Nothing of Anna's is in Bela's inbox, search or summary, whatever Bela asks for.
    for (const path of ['', '?filter=all', `?customerId=${k.anna.id}`, '/search?q=ANNA-ONLY', '/summary', '?filter=unread']) {
      const reply = await bela.get(k.mine(path))
      expect(reply.status, path).toBe(200)
      expect(reply.text, path).not.toMatch(/ANNA-ONLY|The next step/)
    }
    expect(k.w.kit.server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM conversation_messages WHERE sender_id = ?", [bela.id])!.n).toBe(0)
    expect(k.w.kit.server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM conversation_reads WHERE reader_id = ?", [bela.id])!.n).toBe(0)
  })

  it('who writes, which customer, which status and what is visible are never believed from a request', async () => {
    k = await makeCommunicationKit()
    await k.open()
    const { customer: bela } = await k.other()
    const reference = await k.startedByCustomer()
    const smuggled = [{ senderId: bela.id }, { sender: 'admin' }, { senderType: 'admin' }, { customerId: bela.id }, { status: 'resolved' }, { visibility: 'internal' }, { kind: 'announcement' }, { important: true }, { messageType: 'announcement' }]
    for (const extra of smuggled) {
      expect((await k.anna.post(k.mine(`/${reference}/messages`), { body: 'Hello', clientToken: newToken(), ...extra })).status, JSON.stringify(extra)).toBe(422)
      expect((await k.anna.post(k.mine(), { subject: 'Hi', body: 'Hello', clientToken: newToken(), ...extra })).status, JSON.stringify(extra)).toBe(422)
    }
    const owner = [{ senderId: bela.id }, { customerId: bela.id }, { status: 'resolved' }, { visibility: 'customer' }, { projectId: k.w.project.id }]
    for (const extra of owner) expect((await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'Hello', ...extra })).status, JSON.stringify(extra)).toBe(422)
    // The sender is the session.
    await k.anna.post(k.mine(`/${reference}/messages`), { body: 'Really me.', clientToken: newToken() })
    expect(k.w.kit.server.db.get<{ sender_type: string; sender_id: string }>("SELECT sender_type, sender_id FROM conversation_messages WHERE body = 'Really me.'")).toEqual({ sender_type: 'customer', sender_id: k.anna.id })
  })

  it('the owner’s private notes, and the words of a removed message, are in no answer a customer can ask for', async () => {
    k = await makeCommunicationKit()
    await k.open()
    const reference = await k.startedByCustomer({ subject: 'Colours', body: 'We like crimson.' })
    const noted = await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'PRIVATE-NOTE-WORD: they will haggle.' })
    expect(noted.status).toBe(201)
    const sent = await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'REMOVED-WORD, sent by mistake.' })
    await k.call('DELETE', k.admin(`/${reference}/messages/${sent.json.data.messages.find((entry: any) => entry.body === 'REMOVED-WORD, sent by mistake.').id}`))
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'A visible answer.' })
    const answers = [
      await k.anna.get(k.mine()),
      await k.anna.get(k.mine('?filter=all')),
      await k.anna.get(k.mine(`/${reference}`)),
      await k.anna.get(k.mine('/search?q=PRIVATE-NOTE')),
      await k.anna.get(k.mine('/search?q=REMOVED-WORD')),
      await k.anna.get(k.mine('/search?q=haggle')),
      await k.anna.get(k.mine('/summary')),
      await k.anna.get(k.mine('/contexts')),
      await k.anna.get('/api/portal/message-preferences'),
      await k.anna.get('/api/portal/overview'),
      await k.anna.post(k.mine(`/${reference}/read`), { upTo: 1_000_000 }),
      await k.anna.post(k.mine(`/${reference}/messages`), { body: '', clientToken: newToken() }),
      await k.anna.get(k.mine('/MSG-NOPE0000')),
    ]
    for (const reply of answers) expect(reply.text).not.toMatch(/PRIVATE-NOTE|REMOVED-WORD|haggle|visibility.*internal|"internal"/)
    expect(JSON.stringify((await k.anna.get(k.mine(`/${reference}`))).json.data.messages.map((entry: any) => entry.removed))).toContain('true')
    // No administrator's address or id is shown to a customer.
    expect((await k.anna.get(k.mine(`/${reference}`))).text).not.toContain('owner@site.test')
    expect((await k.anna.get(k.mine(`/${reference}`))).text).not.toContain(k.w.kit.adminSession.email)
  })

  it('every answer is private: not cacheable, not shared with another site, not guessable as another type', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    for (const reply of [await k.anna.get(k.mine()), await k.anna.get(k.mine(`/${reference}`)), await k.call('GET', k.admin()), await k.call('GET', k.admin(`/${reference}`))]) {
      expect(reply.status).toBe(200)
    }
    const raw = await k.w.kit.server.fetch(k.mine(`/${reference}`), { headers: { cookie: k.anna.cookie, origin: 'https://evil.test' } })
    expect(raw.headers.get('cache-control')).toMatch(/no-store/)
    expect(raw.headers.get('access-control-allow-origin')).toBeNull()
    expect(raw.headers.get('x-content-type-options')).toBe('nosniff')
    expect(raw.headers.get('content-type')).toMatch(/application\/json/)
    const admin = await k.w.kit.server.fetch(k.admin(`/${reference}`), { headers: { cookie: k.w.kit.adminSession.cookie } })
    expect(admin.headers.get('cache-control')).toMatch(/no-store/)
  })
})

describe('hostile text and limits', () => {
  it('markup, scripts and quotes are stored and returned as the text they are; nothing in a conversation is ever run', async () => {
    k = await makeCommunicationKit()
    await k.open()
    const payloads = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "'; DROP TABLE conversations; --", '{{7*7}}', '${process.exit(1)}', '<b>bold</b> & <i>italic</i>', 'javascript:alert(1)']
    for (const [index, payload] of payloads.entries()) {
      const started = await k.anna.post(k.mine(), { subject: `Subject ${index} ${payload}`.slice(0, 200), body: payload, clientToken: newToken() })
      expect(started.status, payload).toBe(201)
      expect(started.json.data.messages.at(-1).body).toBe(payload)
      const note = await k.call('POST', k.admin(`/${started.json.data.reference}/messages`), { kind: 'note', body: payload })
      expect(note.status).toBe(201)
    }
    expect(k.w.kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM conversations')!.n).toBeGreaterThanOrEqual(payloads.length)
    // Nothing in an e-mail is the typed text, so nothing in an e-mail can be markup of theirs.
    await k.w.kit.settle()
    expect(JSON.stringify(k.w.kit.server.mailer.sent)).not.toContain('<script>')
  }, 30_000)

  it('a message is words and no longer than a few thousand characters; a thread holds a few thousand messages at most', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const send = (body: string) => k!.anna.post(k!.mine(`/${reference}/messages`), { body, clientToken: newToken() })
    expect((await send('x'.repeat(4000))).status).toBe(201)
    expect((await send('x'.repeat(4001))).status).toBe(422)
    expect((await send('   \n  ')).status).toBe(422)
    expect((await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'n'.repeat(4001) })).status).toBe(422)
    // A body that is too large for the server to read at all is refused before anything is parsed.
    const huge = await k.w.kit.api(k.mine(`/${reference}/messages`), { method: 'POST', body: { body: 'z'.repeat(300_000) }, headers: k.anna.headers })
    expect([413, 422]).toContain(huge.status)
    const { db } = k.w.kit.server
    const conversation = db.get<{ id: string }>("SELECT id FROM conversations WHERE reference = ?", [reference])!
    for (let index = 0; index < 2000; index += 1) db.run("INSERT INTO conversation_messages (id, conversation_id, sender_type, sender_id, message_type, visibility, body, created_at) VALUES (?, ?, 'customer', ?, 'text', 'customer', 'filler', '2026-11-01T10:00:00.000Z')", [`filler-${index}-xxxx`, conversation.id, k.anna.id])
    const full = await send('One too many.')
    expect(full.status).toBe(409)
    expect(full.json.error.details.reason).toBe('conversation_full')
  }, 30_000)

  it('sending and searching have their own limits, and reading is not stopped by them', async () => {
    k = await makeCommunicationKit({ env: { RATE_LIMITS: 'true' } })
    await k.open()
    const statuses: number[] = []
    for (let index = 0; index < 45; index += 1) statuses.push((await k.anna.post(k.mine(), { subject: `Q${index}`, body: 'Hi', clientToken: newToken() })).status)
    expect(statuses).toContain(429)
    expect(statuses.slice(0, 5)).not.toContain(429)
    expect((await k.anna.get(k.mine())).status).toBe(200)
    const searches: number[] = []
    for (let index = 0; index < 25; index += 1) searches.push((await k.anna.get(k.mine('/search?q=hello'))).status)
    expect(searches).toContain(429)
    expect(searches.slice(0, 5)).not.toContain(429)
    expect((await k.anna.get(k.mine('/summary'))).status).toBe(200)
  }, 30_000)

  it('two administrators changing the status from the same screen: one wins, the other is told it is stale', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const { revision } = await k.adminView(reference)
    const [a, b] = await Promise.all([
      k.call('POST', k.admin(`/${reference}/status`), { status: 'resolved', revision }, 'admin'),
      k.call('POST', k.admin(`/${reference}/status`), { status: 'archived', revision }, 'editor'),
    ])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(k.w.kit.server.db.all("SELECT 1 FROM conversation_messages WHERE event_key IN ('conversation.resolved', 'conversation.archived')")).toHaveLength(1)
  })
})

describe('the database’s own refusals', () => {
  it('a message is never changed, a removed one stays removed, and a private note is the one thing that can be edited', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByCustomer()
    const noted = await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'First.' })
    const reply = await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'An answer.' })
    const { db } = k.w.kit.server
    const ids = {
      customer: db.get<{ id: string }>("SELECT id FROM conversation_messages WHERE sender_type = 'customer'")!.id,
      note: noted.json.data.messages.find((entry: any) => entry.visibility === 'internal').id as string,
      reply: reply.json.data.messages.find((entry: any) => entry.body === 'An answer.').id as string,
    }
    const attempt = (sql: string, params: unknown[]) => () => db.run(sql, params as never)
    expect(attempt("UPDATE conversation_messages SET body = 'x' WHERE id = ?", [ids.customer])).toThrow(ConstraintError)
    expect(attempt("UPDATE conversation_messages SET body = 'x' WHERE id = ?", [ids.reply])).toThrow(ConstraintError)
    expect(attempt("UPDATE conversation_messages SET visibility = 'customer' WHERE id = ?", [ids.note])).toThrow(ConstraintError)
    expect(attempt("UPDATE conversation_messages SET sender_type = 'customer' WHERE id = ?", [ids.reply])).toThrow(ConstraintError)
    expect(attempt("UPDATE conversation_messages SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = ?", [ids.reply])).toThrow(ConstraintError)
    expect(attempt("UPDATE conversation_messages SET important = 1 WHERE id = ?", [ids.reply])).toThrow(ConstraintError)
    expect(attempt("UPDATE conversation_messages SET body = 'edited note', edited_at = '2026-11-01T10:00:00.000Z' WHERE id = ?", [ids.note])).not.toThrow()
    await k.call('DELETE', k.admin(`/${reference}/messages/${ids.note}`))
    expect(attempt("UPDATE conversation_messages SET deleted_at = NULL WHERE id = ?", [ids.note])).toThrow(ConstraintError)
    expect(attempt("UPDATE conversation_messages SET body = 'back again' WHERE id = ?", [ids.note])).toThrow(ConstraintError)
  })

  it('what a message can be is fixed: who may write which kind, in which kind of conversation, and what a system event is', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    await k.call('POST', k.w.at(`/status`), { status: 'design' })
    const { db } = k.w.kit.server
    const thread = db.get<{ id: string }>('SELECT id FROM conversations WHERE reference = ?', [reference])!.id
    const feedId = db.get<{ id: string }>("SELECT id FROM conversations WHERE kind = 'activity'")!.id
    const at = '2026-11-01T10:00:00.000Z'
    const insert = (columns: Record<string, unknown>) => () => {
      const row = { id: `row-${Math.random().toString(36).slice(2, 12)}`, conversation_id: thread, sender_type: 'customer', sender_id: k!.anna.id, message_type: 'text', visibility: 'customer', body: 'Words', created_at: at, ...columns }
      db.run(`INSERT INTO conversation_messages (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`, Object.values(row) as never)
    }
    expect(insert({})).not.toThrow()
    expect(insert({ visibility: 'internal' })).toThrow(ConstraintError)
    expect(insert({ message_type: 'announcement' })).toThrow(ConstraintError)
    expect(insert({ important: 1 })).toThrow(ConstraintError)
    expect(insert({ sender_type: 'system', sender_id: null })).toThrow(ConstraintError)
    expect(insert({ sender_type: 'admin', sender_id: 'x', visibility: 'internal', message_type: 'announcement' })).toThrow(ConstraintError)
    expect(insert({ sender_type: 'admin', sender_id: 'x', visibility: 'internal', important: 1 })).toThrow(ConstraintError)
    expect(insert({ body: null })).toThrow(ConstraintError)
    expect(insert({ body: '   ' })).toThrow(ConstraintError)
    expect(insert({ body: 'x'.repeat(5001) })).toThrow(ConstraintError)
    expect(insert({ event_key: 'project.created' })).toThrow(ConstraintError)
    const event = { sender_type: 'system', sender_id: null, message_type: 'system_event', body: null, event_key: 'project.created', event_params: '{}', source_type: 'project_event', source_id: '1', idempotency_key: 'project_event:9999' }
    expect(insert({ ...event, conversation_id: feedId })).not.toThrow()
    expect(insert({ ...event, conversation_id: feedId })).toThrow(ConstraintError)
    expect(insert({ ...event, conversation_id: feedId, idempotency_key: 'project_event:9998', body: 'words' })).toThrow(ConstraintError)
    expect(insert({ ...event, conversation_id: feedId, idempotency_key: null })).toThrow(ConstraintError)
    expect(insert({ ...event, conversation_id: feedId, idempotency_key: 'x:1', event_key: 'Not A Key' })).toThrow(ConstraintError)
    expect(insert({ ...event, conversation_id: feedId, idempotency_key: 'x:2', event_params: 'not json' })).toThrow(ConstraintError)
    expect(insert({ ...event, conversation_id: feedId, idempotency_key: 'x:3', source_type: 'conversation' })).toThrow(ConstraintError)
    // An activity feed takes only events of other records; a thread takes only its own.
    expect(insert({ conversation_id: feedId })).toThrow(ConstraintError)
    expect(insert({ ...event, idempotency_key: 'x:4' })).toThrow(ConstraintError)
    // A token stores a message once per sender and conversation.
    expect(insert({ client_token: 'token-0001-abcd' })).not.toThrow()
    expect(insert({ client_token: 'token-0001-abcd' })).toThrow(ConstraintError)
  })

  it('whose a conversation is, and what it is about, never changes; a feed is one per customer and project; a project is its customer’s', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const { project } = await k.other()
    const { db } = k.w.kit.server
    const at = '2026-11-01T10:00:00.000Z'
    const feed = db.get<{ id: string; customer_id: string; project_id: string }>("SELECT id, customer_id, project_id FROM conversations WHERE kind = 'activity'")!
    const attempt = (sql: string, params: unknown[]) => () => db.run(sql, params as never)
    expect(attempt('UPDATE conversations SET customer_id = ? WHERE reference = ?', [feed.customer_id.replace(/./, 'x'), reference])).toThrow()
    expect(attempt('UPDATE conversations SET project_id = ? WHERE reference = ?', [project.id, reference])).toThrow(ConstraintError)
    expect(attempt("UPDATE conversations SET subject = 'Changed' WHERE reference = ?", [reference])).toThrow(ConstraintError)
    expect(attempt("UPDATE conversations SET reference = 'MSG-CHANGED1' WHERE reference = ?", [reference])).toThrow(ConstraintError)
    expect(attempt("UPDATE conversations SET kind = 'activity' WHERE reference = ?", [reference])).toThrow(ConstraintError)
    expect(attempt("UPDATE conversations SET status = 'resolved' WHERE reference = ?", [reference])).toThrow(ConstraintError)
    const make = (columns: Record<string, unknown>) => () => {
      const row = { id: `conv-${Math.random().toString(36).slice(2, 12)}`, reference: `MSG-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, kind: 'thread', customer_id: k!.anna.id, subject: 'Subject', status: 'open', started_by: 'admin', last_activity_at: at, created_at: at, updated_at: at, ...columns }
      db.run(`INSERT INTO conversations (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(() => '?').join(', ')})`, Object.values(row) as never)
    }
    expect(make({})).not.toThrow()
    expect(make({ subject: null })).toThrow(ConstraintError)
    expect(make({ subject: '   ' })).toThrow(ConstraintError)
    expect(make({ status: 'sleeping' })).toThrow(ConstraintError)
    expect(make({ started_by: 'system' })).toThrow(ConstraintError)
    expect(make({ context_type: 'project' })).toThrow(ConstraintError)
    expect(make({ context_type: 'planet', context_id: 'x' })).toThrow(ConstraintError)
    expect(make({ project_id: project.id })).toThrow(ConstraintError)
    expect(make({ status: 'resolved' })).toThrow(ConstraintError)
    expect(make({ kind: 'activity', subject: null, started_by: 'system', project_id: feed.project_id })).toThrow(ConstraintError)
    expect(make({ kind: 'activity', subject: 'No', started_by: 'system', project_id: null })).toThrow(ConstraintError)
    expect(make({ kind: 'activity', subject: null, started_by: 'system', project_id: null, status: 'waiting_owner' })).toThrow(ConstraintError)
    expect(make({ kind: 'activity', subject: null, started_by: 'system', project_id: null })).not.toThrow()
    expect(make({ kind: 'activity', subject: null, started_by: 'system', project_id: null })).toThrow(ConstraintError)
    // A read marker only moves forward.
    const thread = db.get<{ id: string }>('SELECT id FROM conversations WHERE reference = ?', [reference])!.id
    db.run("INSERT INTO conversation_reads (conversation_id, reader_type, reader_id, last_read_seq, last_read_at) VALUES (?, 'customer', ?, 5, ?)", [thread, k.anna.id, at])
    expect(attempt('UPDATE conversation_reads SET last_read_seq = 4 WHERE conversation_id = ?', [thread])).toThrow(ConstraintError)
    expect(attempt('UPDATE conversation_reads SET last_read_seq = 6 WHERE conversation_id = ?', [thread])).not.toThrow()
  })

  it('the lists in the code are the lists in the migration', () => {
    const sql = readMigration()
    const list = (pattern: RegExp): string[] => [...pattern.exec(sql)![1].matchAll(/'([a-z_.]+)'/g)].map((entry) => entry[1])
    expect(list(/status TEXT NOT NULL DEFAULT 'waiting_owner' CHECK \(status IN \(([^)]*)\)\)/)).toEqual([...CONVERSATION_STATUSES])
    expect(list(/context_type TEXT CHECK \(context_type IS NULL OR context_type IN \(([^)]*)\)\)/)).toEqual([...CONTEXT_TYPES])
    expect(list(/message_type TEXT NOT NULL CHECK \(message_type IN \(([^)]*)\)\)/)).toEqual([...MESSAGE_TYPES])
    // Every system event the code can write is a key the database accepts (its shape), and every one has words in the screens (the portal's text tests check that).
    for (const key of EVENT_KEYS) expect(key).toMatch(/^[a-z]+\.[a-z_]+$/)
  })

  it('the upgrade from the feedback schema (migration 0014) keeps every row, creates nothing for anybody, and the outbox keeps its ids', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-mig-'))
    folders.push(directory)
    for (const name of readdirSync(MIGRATIONS_DIRECTORY).filter((file) => file < '0015')) copyFileSync(join(MIGRATIONS_DIRECTORY, name), join(directory, name))
    const clock = new TestClock()
    const db = new Database(':memory:')
    migrate(db, clock, directory)
    const now = '2026-10-01T10:00:00.000Z'
    db.run("INSERT INTO customers (id, email, language, status, origin, email_verified_at, created_at, updated_at) VALUES ('c1', 'old@example.test', 'en', 'active', 'invitation', ?, ?, ?)", [now, now, now])
    db.run("INSERT INTO client_projects (id, reference, customer_id, name, category, status, created_at, updated_at) VALUES ('p1', 'PRJ-OLD00001', 'c1', 'Old project', 'website', 'design', ?, ?)", [now, now])
    db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, created_at, updated_at) VALUES ('d1', 'client_project_status', 'client_project_event', '2', 'old@example.test', 'en', 'delivered', 1, ?, ?)", [now, now])
    db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, created_at, updated_at) VALUES ('d2', 'deliverable_feedback_admin', 'deliverable_event', '7', 'owner@example.test', 'en', 'pending', 0, ?, ?)", [now, now])
    expect(migrate(db, clock).filter((version) => version === 15)).toEqual([15])
    expect(db.all("SELECT id, kind, related_type, status FROM email_deliveries ORDER BY id")).toEqual([
      { id: 'd1', kind: 'client_project_status', related_type: 'client_project_event', status: 'delivered' },
      { id: 'd2', kind: 'deliverable_feedback_admin', related_type: 'deliverable_event', status: 'pending' },
    ])
    for (const table of ['conversations', 'conversation_messages', 'conversation_reads', 'customer_message_preferences']) expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n, table).toBe(0)
    db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, created_at, updated_at) VALUES ('d3', 'client_message_reply', 'conversation_message', 'm1', 'old@example.test', 'en', 'pending', 0, ?, ?)", [now, now])
    expect(() => db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, created_at, updated_at) VALUES ('d4', 'client_message_reply', 'conversation_message', 'm1', 'old@example.test', 'en', 'pending', 0, ?, ?)", [now, now])).toThrow(ConstraintError)
    expect(db.all('PRAGMA foreign_key_check')).toEqual([])
  })
})

function readMigration(): string {
  const directory = MIGRATIONS_DIRECTORY
  const file = readdirSync(directory).find((name) => name.startsWith('0015'))!
  return readFileSync(join(directory, file), 'utf8')
}
import { readFileSync } from 'node:fs'
