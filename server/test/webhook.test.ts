import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mayMove, TOLERANCE_SECONDS, verifySignature } from '../src/modules/notifications/webhook.ts'
import { contact, startServer, type TestServer } from './helpers.ts'
import { API_KEY, eventFor, mockResend, signedEvent, WEBHOOK_SECRET, type MockResend } from './resendMock.ts'

/**
 * The provider's webhook: the only way a message becomes "delivered". A request is believed only if its signature
 * verifies; an event is applied once, in order of importance, whatever order or number of times it arrives; and an
 * unverified, replayed or malformed request changes nothing.
 */

let provider: MockResend
let server: TestServer

const settle = async () => {
  await new Promise((resolve) => setImmediate(resolve))
  await server.app.context.notifier.processDue()
}

beforeEach(async () => {
  provider = await mockResend()
  server = await startServer({
    env: { EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: API_KEY, EMAIL_API_URL: provider.url, EMAIL_FROM: 'Site <notifications@site.test>', EMAIL_REPLY_TO: 'hello@site.test', EMAIL_WEBHOOK_SECRET: WEBHOOK_SECRET, NOTIFY_TO: 'owner@site.test' },
    realMailer: true,
  })
})

afterEach(async () => {
  await server.close()
  await provider.close()
})

/** A sent message: the row, and the provider's id for it. */
async function sentMessage(): Promise<{ id: string; messageId: string }> {
  await server.api('/api/contact', { body: contact() })
  await settle()
  return server.db.get<{ id: string; messageId: string }>('SELECT id, provider_message_id AS messageId FROM email_deliveries')!
}

const post = (request: { headers: Record<string, string>; raw: string }) => server.api('/api/webhooks/email', { method: 'POST', headers: request.headers, raw: request.raw })
const event = (type: string, message: { id: string; messageId: string }, extra: Record<string, unknown> = {}, eventId?: string, byLabel = true) => signedEvent(eventFor(type, message.messageId, extra, byLabel ? message.id : undefined), { at: server.clock.now(), id: eventId })
const row = (id: string) => server.db.get<{ status: string; delivered_at: string | null; accepted_at: string | null; last_error: string | null; error_code: string | null; provider_event: string | null }>('SELECT * FROM email_deliveries WHERE id = ?', [id])!
const events = () => server.db.all<{ id: string; event_type: string; delivery_id: string | null; outcome: string }>('SELECT * FROM email_events ORDER BY rowid')

describe('the signature', () => {
  const secret = WEBHOOK_SECRET
  const now = Date.parse('2026-11-03T10:00:00Z')
  const good = (id = 'msg_1', at = now) => signedEvent({ type: 'email.delivered' }, { id, at: new Date(at) })
  const check = (request: { headers: Record<string, string>; raw: string }, at = now, key = secret) => verifySignature(key, request.headers, Buffer.from(request.raw), at)

  it('accepts what was signed with the secret, and only that', () => {
    expect(check(good())).toBe(true)
    expect(check(signedEvent({ type: 'email.delivered' }, { id: 'msg_1', at: new Date(now), tamper: true }))).toBe(false)
    expect(check(signedEvent({ type: 'email.delivered' }, { id: 'msg_1', at: new Date(now), secret: `whsec_${Buffer.from('another-secret-another-secret-ab').toString('base64')}` }))).toBe(false)
  })

  it('is over the exact bytes: a body changed by a single character, or re-serialised, does not verify', () => {
    const request = good()
    expect(verifySignature(secret, request.headers, Buffer.from(request.raw.replace('delivered', 'delivereD')), now)).toBe(false)
    expect(verifySignature(secret, request.headers, Buffer.from(JSON.stringify(JSON.parse(request.raw), null, 1)), now)).toBe(false)
  })

  it('refuses a request without all three headers, or with a malformed one', () => {
    const request = good()
    for (const name of ['svix-id', 'svix-timestamp', 'svix-signature']) {
      const headers = { ...request.headers }
      delete headers[name]
      expect(verifySignature(secret, headers, Buffer.from(request.raw), now)).toBe(false)
    }
    expect(verifySignature(secret, { ...request.headers, 'svix-timestamp': 'yesterday' }, Buffer.from(request.raw), now)).toBe(false)
    expect(verifySignature(secret, { ...request.headers, 'svix-signature': 'v2,abc' }, Buffer.from(request.raw), now)).toBe(false)
    expect(verifySignature(secret, { ...request.headers, 'svix-signature': '' }, Buffer.from(request.raw), now)).toBe(false)
    expect(verifySignature('whsec_', request.headers, Buffer.from(request.raw), now)).toBe(false)
    expect(verifySignature('plain-secret', request.headers, Buffer.from(request.raw), now)).toBe(false)
  })

  it('is old after five minutes, in either direction: a recorded request cannot be replayed later', () => {
    const request = good()
    expect(check(request, now + (TOLERANCE_SECONDS - 1) * 1000)).toBe(true)
    expect(check(request, now + (TOLERANCE_SECONDS + 5) * 1000)).toBe(false)
    expect(check(request, now - (TOLERANCE_SECONDS + 5) * 1000)).toBe(false)
  })

  it('accepts a header with several signatures when any one matches (while the secret is being replaced)', () => {
    const request = good()
    const header = `v1,${Buffer.from('not the signature').toString('base64')} ${request.headers['svix-signature']}`
    expect(verifySignature(secret, { ...request.headers, 'svix-signature': header }, Buffer.from(request.raw), now)).toBe(true)
  })
})

describe('the address', () => {
  it('does not exist without a signing secret, and is POST only', async () => {
    const message = await sentMessage()
    await server.close()
    server = await startServer({ env: { EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: API_KEY, EMAIL_API_URL: provider.url, EMAIL_FROM: 'Site <notifications@site.test>' }, realMailer: true })
    const request = signedEvent(eventFor('email.delivered', message.messageId), { at: server.clock.now() })
    expect((await post(request)).status).toBe(404)
    expect((await server.api('/api/webhooks/email')).status).toBe(405)
  })

  it('refuses an unsigned, wrongly signed, tampered or replayed request, and changes nothing', async () => {
    const message = await sentMessage()
    const body = eventFor('email.delivered', message.messageId, {}, message.id)
    const attempts = [
      { headers: { 'content-type': 'application/json' }, raw: JSON.stringify(body) },
      signedEvent(body, { at: server.clock.now(), tamper: true }),
      signedEvent(body, { at: server.clock.now(), secret: `whsec_${Buffer.from('another-secret-another-secret-ab').toString('base64')}` }),
      signedEvent(body, { at: new Date(server.clock.now().getTime() - 10 * 60_000) }),
    ]
    for (const attempt of attempts) {
      const response = await post(attempt)
      expect(response.status).toBe(401)
      expect(response.json.error.code).toBe('unauthorized')
    }
    expect(row(message.id).status).toBe('accepted')
    expect(events()).toEqual([])
    expect(server.logs.join('\n')).toContain('e-mail webhook refused')
  })

  it('refuses a verified request that is not an event, with a 400 and no state change', async () => {
    const message = await sentMessage()
    for (const raw of ['not json', '[]', '{"type":5}', '{"type":"email.delivered"}']) {
      const response = await post(signedEvent(raw, { at: server.clock.now() }))
      expect(response.status).toBe(400)
    }
    expect(row(message.id).status).toBe('accepted')
  })

  it('refuses a body over the limit before it is verified', async () => {
    const response = await server.api('/api/webhooks/email', { method: 'POST', headers: { 'content-type': 'application/json' }, raw: 'x'.repeat(70_000) })
    expect(response.status).toBe(413)
  })
})

describe('what a verified event does', () => {
  it('delivered: the message is delivered, with the time, and the event is recorded without any address or text', async () => {
    const message = await sentMessage()
    expect(row(message.id)).toMatchObject({ status: 'accepted', delivered_at: null })
    const response = await post(event('email.delivered', message))
    expect(response.status).toBe(200)
    expect(response.json.data).toEqual({ received: true, duplicate: false })
    expect(row(message.id)).toMatchObject({ status: 'delivered', delivered_at: '2026-11-03T10:00:05.000Z', provider_event: 'email.delivered' })
    expect(events()).toEqual([{ id: expect.stringMatching(/^msg_/), provider: 'resend', event_type: 'email.delivered', delivery_id: message.id, provider_message_id: message.messageId, occurred_at: '2026-11-03T10:00:05.000Z', received_at: expect.any(String), outcome: 'applied' }])
    const stored = JSON.stringify(server.db.all('SELECT * FROM email_events'))
    expect(stored).not.toMatch(/anna@example|owner@site|subject/i)
  })

  it('is matched by the message id too, when an event carries no label of ours', async () => {
    const message = await sentMessage()
    await post(event('email.delivered', message, {}, undefined, false))
    expect(row(message.id).status).toBe('delivered')
  })

  it('is never "delivered" without it: a sent message stays sent', async () => {
    const message = await sentMessage()
    expect(row(message.id).status).toBe('accepted')
    expect(server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE status = 'delivered'")).toEqual({ n: 0 })
  })

  it('bounced: the message is bounced, with a masked reason that names no address, and cannot be retried as if it had failed', async () => {
    const message = await sentMessage()
    await post(event('email.bounced', message, { bounce: { type: 'Permanent', subType: 'MessageRejected', message: 'The address anna@example.com does not exist (550 5.1.1 user unknown)' } }))
    const state = row(message.id)
    expect(state).toMatchObject({ status: 'bounced', error_code: 'bounced' })
    expect(state.last_error).toContain('does not exist')
    expect(state.last_error).toContain('[address]')
    expect(state.last_error).not.toContain('anna@example.com')
    const admin = await server.signIn()
    const retry = await server.api(`/api/admin/notifications/deliveries/${message.id}/retry`, { method: 'POST', headers: { Cookie: admin.cookie, 'X-CSRF-Token': admin.csrf }, body: {} })
    expect(retry.status).toBe(409)
    expect((await server.api('/api/admin/notifications?status=problem', { headers: { Cookie: admin.cookie } })).json.data.deliveries).toHaveLength(1)
  })

  it('complained: marked, even after delivery', async () => {
    const message = await sentMessage()
    await post(event('email.delivered', message))
    await post(event('email.complained', message))
    expect(row(message.id)).toMatchObject({ status: 'complained', error_code: 'complained' })
  })

  it('suppressed or failed by the provider: failed, with the reason', async () => {
    const message = await sentMessage()
    await post(event('email.suppressed', message))
    expect(row(message.id)).toMatchObject({ status: 'failed', error_code: 'suppressed' })
  })

  it('a delay changes nothing about the state, only what the administrator can see', async () => {
    const message = await sentMessage()
    await post(event('email.delivery_delayed', message))
    expect(row(message.id)).toMatchObject({ status: 'accepted', provider_event: 'email.delivery_delayed' })
    await post(event('email.delivered', message))
    expect(row(message.id).status).toBe('delivered')
  })

  it('opens and clicks are not state: they are noted as ignored', async () => {
    const message = await sentMessage()
    await post(event('email.opened', message))
    await post(event('email.clicked', message))
    expect(row(message.id).status).toBe('accepted')
    expect(events().map((e) => e.outcome)).toEqual(['ignored', 'ignored'])
  })

  it('an event for a message that is not ours is recorded as unmatched and answered 200 (so the provider stops sending it)', async () => {
    await sentMessage()
    const response = await post(signedEvent(eventFor('email.delivered', '00000000-0000-4000-8000-000000000000'), { at: server.clock.now() }))
    expect(response.status).toBe(200)
    expect(events()).toMatchObject([{ outcome: 'unmatched', delivery_id: null }])
  })

  it('an event whose label is ours but whose message id is another’s is not applied to ours', async () => {
    const message = await sentMessage()
    const response = await post(signedEvent(eventFor('email.delivered', '00000000-0000-4000-8000-000000000000', {}, message.id), { at: server.clock.now() }))
    expect(response.status).toBe(200)
    expect(row(message.id).status).toBe('accepted')
  })
})

describe('the same event twice, late events, and events out of order', () => {
  it('a repeated event (same id) is answered 200 and applied once', async () => {
    const message = await sentMessage()
    const first = await post(event('email.delivered', message, {}, 'msg_fixed_id_1'))
    const second = await post(event('email.delivered', message, {}, 'msg_fixed_id_1'))
    expect(first.json.data.duplicate).toBe(false)
    expect(second.status).toBe(200)
    expect(second.json.data.duplicate).toBe(true)
    expect(events()).toHaveLength(1)
    expect(row(message.id).status).toBe('delivered')
  })

  it('a duplicate of an event that was refused as stale by the clock is still refused: the id alone is not enough', async () => {
    const message = await sentMessage()
    const stale = signedEvent(eventFor('email.delivered', message.messageId, {}, message.id), { at: new Date(server.clock.now().getTime() - 3600_000), id: 'msg_stale' })
    expect((await post(stale)).status).toBe(401)
    expect(events()).toEqual([])
  })

  it('an older "sent" arriving after "delivered" cannot take the message back a step', async () => {
    const message = await sentMessage()
    await post(event('email.delivered', message))
    await post(event('email.sent', message))
    expect(row(message.id).status).toBe('delivered')
    expect(events().map((e) => [e.event_type, e.outcome])).toEqual([['email.delivered', 'applied'], ['email.sent', 'ignored']])
  })

  it('"delivered" after "bounced" does not undo the bounce', async () => {
    const message = await sentMessage()
    await post(event('email.bounced', message))
    await post(event('email.delivered', message))
    expect(row(message.id).status).toBe('bounced')
  })

  it('a bounce after a delivery is still a bounce (asynchronous bounces exist)', async () => {
    const message = await sentMessage()
    await post(event('email.delivered', message))
    await post(event('email.bounced', message))
    expect(row(message.id).status).toBe('bounced')
  })

  it('the provider received a message we had given up on: its delivery lifts it out of "failed"', async () => {
    const message = await sentMessage()
    server.db.run("UPDATE email_deliveries SET status = 'failed', last_error = 'The provider did not answer in time.', error_code = 'timeout' WHERE id = ?", [message.id])
    await post(event('email.delivered', message))
    expect(row(message.id)).toMatchObject({ status: 'delivered', last_error: null, error_code: null })
  })

  it('a cancelled message (its record was removed) stays cancelled', async () => {
    const message = await sentMessage()
    server.db.run("UPDATE email_deliveries SET status = 'cancelled' WHERE id = ?", [message.id])
    await post(event('email.delivered', message))
    expect(row(message.id).status).toBe('cancelled')
  })

  it('an event that arrives BEFORE the answer to our own request is not undone when that answer comes', async () => {
    // The provider sends "delivered" while we are still waiting for the reply to the send.
    provider.onSend = async (body, id) => {
      const label = (body.tags as { name: string; value: string }[]).find((tag) => tag.name === 'delivery')!.value
      const response = await post(signedEvent(eventFor('email.delivered', id, {}, label), { at: server.clock.now() }))
      expect(response.status).toBe(200)
    }
    await server.api('/api/contact', { body: contact() })
    await settle()
    const [stored] = server.db.all<{ status: string; provider_message_id: string | null; accepted_at: string | null; delivered_at: string | null }>('SELECT * FROM email_deliveries')
    expect(stored.status).toBe('delivered')
    expect(stored.provider_message_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(stored.accepted_at).not.toBeNull()
    expect(stored.delivered_at).not.toBeNull()
  })

  it('the decision table: good news may lift, bad news may follow, a cancelled message and a repeat never move', () => {
    expect(mayMove('pending', 'accepted')).toBe(true)
    expect(mayMove('sending', 'delivered')).toBe(true)
    expect(mayMove('accepted', 'delivered')).toBe(true)
    expect(mayMove('delivered', 'accepted')).toBe(false)
    expect(mayMove('delivered', 'delivered')).toBe(false)
    expect(mayMove('delivered', 'complained')).toBe(true)
    expect(mayMove('bounced', 'complained')).toBe(false)
    expect(mayMove('bounced', 'delivered')).toBe(false)
    expect(mayMove('failed', 'delivered')).toBe(true)
    expect(mayMove('accepted', 'failed')).toBe(true)
    expect(mayMove('failed', 'bounced')).toBe(false)
    expect(mayMove('cancelled', 'delivered')).toBe(false)
  })
})

describe('what the administration shows of it', () => {
  it('lists delivered and bounced messages with their real state, filters by it, and counts them', async () => {
    const first = await sentMessage()
    await server.api('/api/contact', { body: contact({ subject: 'Second subject', message: 'A second message, long enough to be a message.' }) })
    await settle()
    const second = server.db.get<{ id: string; messageId: string }>('SELECT id, provider_message_id AS messageId FROM email_deliveries WHERE id != ?', [first.id])!
    await post(event('email.delivered', first))
    await post(event('email.bounced', second))
    const admin = await server.signIn()
    const get = async (query: string) => (await server.api(`/api/admin/notifications${query}`, { headers: { Cookie: admin.cookie } })).json.data
    const all = await get('')
    expect(all.counts).toMatchObject({ delivered: 1, bounced: 1, sent: 0, failed: 0 })
    expect(all.deliveries.map((d: { status: string }) => d.status).sort()).toEqual(['bounced', 'delivered'])
    expect((await get('?status=delivered')).deliveries).toHaveLength(1)
    expect((await get('?status=problem')).deliveries[0]).toMatchObject({ status: 'bounced', errorCode: 'bounced' })
    expect((await get('?status=retrying')).deliveries).toEqual([])
    expect((await get('?status=nonsense')).deliveries).toHaveLength(2)
  })

  it('pages the log', async () => {
    const admin = await server.signIn()
    const stamp = server.clock.now().toISOString()
    for (let index = 0; index < 25; index += 1) server.db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, created_at, updated_at) VALUES (?, 'inquiry_status', 'inquiry', ?, 'a@example.com', 'en', 'accepted', ?, ?)", [`d${String(index).padStart(2, '0')}`, `r${index}`, stamp, stamp])
    const first = (await server.api('/api/admin/notifications', { headers: { Cookie: admin.cookie } })).json.data
    const second = (await server.api('/api/admin/notifications?page=2', { headers: { Cookie: admin.cookie } })).json.data
    expect(first.paging).toEqual({ page: 1, pageSize: 20, total: 25 })
    expect(first.deliveries).toHaveLength(20)
    expect(second.deliveries).toHaveLength(5)
  })

  it('a failed message waiting for its next attempt is shown as retrying, not as failed', async () => {
    provider.script.push({ status: 503, body: { name: 'service_unavailable', message: 'down', statusCode: 503 } })
    await server.api('/api/contact', { body: contact() })
    await settle()
    const admin = await server.signIn()
    const data = (await server.api('/api/admin/notifications?status=retrying', { headers: { Cookie: admin.cookie } })).json.data
    expect(data.deliveries[0]).toMatchObject({ status: 'pending', retrying: true, attempts: 1, errorCode: 'unavailable' })
    expect(data.deliveries[0].nextAttemptAt).not.toBeNull()
  })
})
