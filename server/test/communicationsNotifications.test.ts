import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MIGRATIONS_DIRECTORY } from '../src/db/migrate.ts'
import { tellCustomerAbout, tellOwnerAbout } from '../src/modules/communications/notify.ts'
import { eraseByEmail } from '../src/modules/system/maintenance.ts'
import { COMMUNICATION_MAIL_KINDS } from '../src/modules/notifications/communicationTemplates.ts'
import { makeCommunicationKit, newToken, type CommunicationKit } from './communicationKit.ts'

/**
 * PROMPT 28: the e-mails of the communication system, through the existing outbox. They say THAT there is something new and where to read it, never what; they are queued once,
 * only when the other side was not already waiting, only when the owner's switch and the customer's own choice allow them, and never to an account that is switched off.
 */

let k: CommunicationKit | undefined
afterEach(async () => {
  await k?.close()
  k = undefined
})

const OWNER = 'owner@site.test'
const ANNA = 'anna@example.com'

const sent = () => k!.w.kit.server.mailer.sent as unknown as Array<{ to: string; subject: string; text: string; html: string; replyTo?: string | null }>
const to = (address: string, subject: RegExp) => sent().filter((message) => message.to === address && subject.test(message.subject))

describe('who is told, and when', () => {
  it('the customer is told once when the owner writes, not again while they have not answered, and again after they answered', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    expect(to(ANNA, /We have a message for you/)).toHaveLength(1)
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'And the photos?', clientToken: newToken() })
    await k.w.kit.settle()
    expect(to(ANNA, /We have a message for you/)).toHaveLength(1)
    await k.anna.post(k.mine(`/${reference}/messages`), { body: 'Photos coming.', clientToken: newToken() })
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'Great.', clientToken: newToken() })
    await k.w.kit.settle()
    expect(to(ANNA, /We have a message for you/)).toHaveLength(2)
  })

  it('the owner is told once when a customer writes, with the customer to reply to and a link into the administration, and not again until they have answered', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByCustomer()
    const first = to(OWNER, /A customer wrote/)
    expect(first).toHaveLength(1)
    expect(first[0].replyTo).toBe(ANNA)
    expect(first[0].text).toContain(`/admin/communications/${reference}`)
    expect(first[0].text).toContain(ANNA)
    await k.anna.post(k.mine(`/${reference}/messages`), { body: 'Hello again.', clientToken: newToken() })
    await k.anna.post(k.mine(`/${reference}/messages`), { body: 'And again.', clientToken: newToken() })
    await k.w.kit.settle()
    expect(to(OWNER, /A customer wrote/)).toHaveLength(1)
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'Hi!', clientToken: newToken() })
    await k.anna.post(k.mine(`/${reference}/messages`), { body: 'Thanks.', clientToken: newToken() })
    await k.w.kit.settle()
    expect(to(OWNER, /A customer wrote/)).toHaveLength(2)
    // Nothing meant for the owner goes to the customer.
    expect(sent().filter((message) => message.to === ANNA && /A customer /.test(message.subject))).toEqual([])
  })

  it('an announcement and an important message are always e-mailed, each as its own kind; a private note never', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'announcement', body: 'Closed on Friday.', confirm: true })
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'announcement', body: 'Also closed on Monday.', confirm: true })
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'Please decide today.', important: true })
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'A private thought.' })
    await k.w.kit.settle()
    expect(to(ANNA, /An announcement/)).toHaveLength(2)
    expect(to(ANNA, /An important message/)).toHaveLength(1)
    expect(k.outbox().map((row) => row.kind).sort()).toEqual(['client_message_announcement', 'client_message_announcement', 'client_message_important', 'client_message_reply'])
  })

  it('a resolution is e-mailed to the customer once; a request for resolution to the owner once', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    await k.anna.post(k.mine(`/${reference}/request-resolution`), {})
    await k.anna.post(k.mine(`/${reference}/request-resolution`), {})
    await k.w.kit.settle()
    expect(to(OWNER, /asked to resolve/)).toHaveLength(1)
    const view = await k.adminView(reference)
    await k.call('POST', k.admin(`/${reference}/status`), { status: 'resolved', revision: view.revision })
    await k.w.kit.settle()
    expect(to(ANNA, /We resolved a conversation/)).toHaveLength(1)
    // Archiving tells nobody.
    const now = await k.adminView(reference)
    await k.call('POST', k.admin(`/${reference}/status`), { status: 'archived', revision: now.revision })
    await k.w.kit.settle()
    expect(to(ANNA, /We resolved a conversation/)).toHaveLength(1)
    expect(sent().filter((message) => message.to === ANNA && /archiv/i.test(message.subject))).toEqual([])
  })
})

describe('the choices', () => {
  it('the owner’s switches come first, each on its own; the customer’s own choices are theirs, are validated, and apply to them alone', async () => {
    k = await makeCommunicationKit()
    expect((await k.anna.get('/api/portal/message-preferences')).json.data).toEqual({ replies: true, announcements: true, important: true, resolution: true, customersCanStart: false, attachments: false })
    expect((await k.put(k.anna, '/api/portal/message-preferences', { replies: false })).status).toBe(200)
    expect((await k.anna.get('/api/portal/message-preferences')).json.data).toMatchObject({ replies: false, announcements: true })
    for (const body of [{}, { replies: 'no' }, { replies: 1 }, { nonsense: true }, { replies: false, extra: true }]) expect((await k.put(k.anna, '/api/portal/message-preferences', body)).status, JSON.stringify(body)).toBe(422)

    const reference = await k.startedByOwner()
    // Replies are off for her: no e-mail. An announcement still goes.
    expect(to(ANNA, /We have a message for you/)).toHaveLength(0)
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'announcement', body: 'News.', confirm: true })
    await k.w.kit.settle()
    expect(to(ANNA, /An announcement/)).toHaveLength(1)
    // Somebody else's choices are not hers.
    const { customer: bela } = await k.other()
    expect((await bela.get('/api/portal/message-preferences')).json.data.replies).toBe(true)

    // The owner's switch is the wider one.
    expect((await k.put(k.anna, '/api/portal/message-preferences', { announcements: true })).status).toBe(200)
    expect((await k.call('PUT', '/api/admin/communication-settings', { announcements: false })).status).toBe(200)
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'announcement', body: 'More news.', confirm: true })
    await k.w.kit.settle()
    expect(to(ANNA, /An announcement/)).toHaveLength(1)
    // An editor sees the choices and cannot change them; strangers see nothing.
    expect((await k.call('GET', '/api/admin/communication-settings', undefined, 'editor')).status).toBe(200)
    expect((await k.call('PUT', '/api/admin/communication-settings', { announcements: true }, 'editor')).status).toBe(403)
    expect((await k.call('GET', '/api/admin/communication-settings', undefined, 'none')).status).toBe(401)
    for (const body of [{}, { announcements: 'yes' }, { nonsense: true }]) expect((await k.call('PUT', '/api/admin/communication-settings', body)).status, JSON.stringify(body)).toBe(422)
  })

  it('what the owner switched off for themselves is not e-mailed to them', async () => {
    k = await makeCommunicationKit()
    await k.call('PUT', '/api/admin/communication-settings', { messageToOwner: false, resolutionRequested: false })
    const reference = await k.startedByCustomer()
    await k.anna.post(k.mine(`/${reference}/request-resolution`), {})
    await k.w.kit.settle()
    expect(sent().filter((message) => message.to === OWNER && /customer/i.test(message.subject))).toEqual([])
    expect(k.outbox()).toEqual([])
  })

  it('a customer who was switched off is written nothing and cannot be written to', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const disabled = await k.call('POST', `/api/admin/clients/${k.anna.id}/actions`, { action: 'disable' })
    expect(disabled.status, disabled.text).toBe(200)
    const refused = await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'Are you there?' })
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('customer_disabled')
    expect((await k.call('POST', k.admin(), { customerId: k.anna.id, subject: 'Hello', body: 'Hello' })).status).toBe(409)
  })
})

describe('what is in them', () => {
  it('is in the customer’s language, in Hungarian, English and Dutch', async () => {
    for (const [language, subject] of [['hu', /Üzenetünk van számodra/], ['en', /We have a message for you/], ['nl', /We hebben een bericht voor je/]] as const) {
      k = await makeCommunicationKit({ language })
      await k.startedByOwner()
      expect(to(ANNA, subject), language).toHaveLength(1)
      await k.close()
      k = undefined
    }
  }, 30_000)

  it('carries no word of what was written: not the text, not the subject, not a private note, in the e-mail, in the outbox or in a log line', async () => {
    k = await makeCommunicationKit()
    const subject = 'SUBJECT-SECRET-VIOLET'
    const reference = await k.startedByOwner({ subject, body: 'BODY-SECRET-OLIVE words for the customer.' })
    await k.anna.post(k.mine(`/${reference}/messages`), { body: 'REPLY-SECRET-TEAL from the customer.', clientToken: newToken() })
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'note', body: 'NOTE-SECRET-AMBER private.' })
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'announcement', body: 'ANNOUNCE-SECRET-CORAL.', confirm: true })
    await k.call('POST', k.admin(`/${reference}/messages`), { kind: 'reply', body: 'IMPORTANT-SECRET-PLUM.', important: true })
    const view = await k.adminView(reference)
    await k.call('POST', k.admin(`/${reference}/status`), { status: 'resolved', revision: view.revision })
    await k.anna.post(k.mine(`/${reference}/request-resolution`), {})
    await k.w.kit.settle()
    expect(sent().length).toBeGreaterThan(3)
    const everything = JSON.stringify(sent()) + JSON.stringify(k.w.kit.server.db.all('SELECT * FROM email_deliveries')) + k.w.kit.server.logs.join('\n')
    for (const word of ['SUBJECT-SECRET', 'BODY-SECRET', 'REPLY-SECRET', 'NOTE-SECRET', 'ANNOUNCE-SECRET', 'IMPORTANT-SECRET']) expect(everything, word).not.toContain(word)
    // What they do say: the project and a way in.
    const reply = to(ANNA, /We have a message for you/)[0]
    expect(reply.text).toContain(`/en/client-portal/messages/${reference}`)
  })

  it('is queued once per line of the conversation however often it is asked for, and every kind is in the outbox’s CHECK and once-only index', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const message = k.w.kit.server.db.get<{ id: string }>("SELECT m.id FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.kind = 'thread' ORDER BY m.seq LIMIT 1")!
    const context = k.w.kit.server.app.context
    for (let index = 0; index < 4; index += 1) tellCustomerAbout(context, k.anna.id, 'client_message_reply', message.id)
    for (let index = 0; index < 4; index += 1) tellOwnerAbout(context, 'message_received_admin', message.id)
    expect(k.outbox().filter((row) => row.kind === 'client_message_reply')).toHaveLength(1)
    expect(k.outbox().filter((row) => row.kind === 'message_received_admin')).toHaveLength(1)
    await k.w.kit.settle()
    await k.w.kit.settle()
    expect(to(ANNA, /We have a message for you/)).toHaveLength(1)
    void reference

    const sql = readFileSync(join(MIGRATIONS_DIRECTORY, '0015_client_communications.sql'), 'utf8')
    const list = (pattern: RegExp): string[] => [...pattern.exec(sql)![1].matchAll(/'([a-z_]+)'/g)].map((entry) => entry[1])
    const kinds = list(/CREATE TABLE email_deliveries_rebuilt \([\s\S]*?kind TEXT NOT NULL CHECK \(kind IN \(([^)]*)\)\)/)
    const once = list(/CREATE UNIQUE INDEX idx_email_once_per_submission[\s\S]*?WHERE kind IN \(([^)]*)\)/)
    for (const kind of COMMUNICATION_MAIL_KINDS) {
      expect(kinds, kind).toContain(kind)
      expect(once, kind).toContain(kind)
    }
    expect(kinds.filter((kind) => /^client_(message|conversation)_|^(message_received|resolution_requested)_admin$/.test(kind)).sort()).toEqual([...COMMUNICATION_MAIL_KINDS].sort())
  })

  it('nothing is queued, and nothing fails, when e-mail is not configured (the conversation works all the same)', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    const message = k.w.kit.server.db.get<{ id: string }>("SELECT m.id FROM conversation_messages m JOIN conversations c ON c.id = m.conversation_id WHERE c.kind = 'thread' ORDER BY m.seq LIMIT 1")!
    const context = k.w.kit.server.app.context
    // A server with no provider has a notifier that is not enabled: asking it for a message queues nothing and does not throw.
    const off = { ...context, notifier: { enabled: false, enqueue: () => { throw new Error('must not be called') } } } as unknown as typeof context
    expect(tellCustomerAbout(off, k.anna.id, 'client_message_announcement', message.id)).toBe(false)
    expect(tellOwnerAbout(off, 'resolution_requested_admin', message.id)).toBe(false)
    expect((await k.anna.post(k.mine(`/${reference}/messages`), { body: 'Still works.', clientToken: newToken() })).status).toBe(201)
  })

  it('erasing a customer removes their conversations, their messages and the e-mails about them', async () => {
    k = await makeCommunicationKit()
    const reference = await k.startedByOwner()
    await k.anna.post(k.mine(`/${reference}/messages`), { body: 'Hello', clientToken: newToken() })
    await k.anna.post(k.mine(`/${reference}/read`), { upTo: 99 })
    await k.put(k.anna, '/api/portal/message-preferences', { replies: false })
    const { db } = k.w.kit.server
    expect(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM conversation_messages')!.n).toBeGreaterThan(0)
    expect(eraseByEmail(k.w.kit.server.app.context, ANNA).customers).toBe(1)
    for (const table of ['conversations', 'conversation_messages', 'conversation_reads', 'customer_message_preferences']) expect(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!.n, table).toBe(0)
    expect(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM email_deliveries WHERE related_type = 'conversation_message'")!.n).toBe(0)
  })
})
