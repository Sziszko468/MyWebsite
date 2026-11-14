import { afterEach, describe, expect, it } from 'vitest'
import { quote } from './helpers.ts'
import { makeKit, SLOT_10, SLOT_13, SLOT_14, SLOT_9, WEDNESDAY, type Kit } from './bookingKit.ts'

let kit: Kit
afterEach(async () => {
  await kit?.close()
})

/** Books as a visitor, lets the mail go, and returns what a visitor has: the booking's id, its secure link and its token. */
async function visitor(email = 'anna@example.com', overrides: Record<string, unknown> = {}) {
  const made = await kit.book({ email, name: 'Anna', ...overrides })
  expect(made.status, JSON.stringify(made.json)).toBe(201)
  await kit.settle()
  const mails = kit.mailTo(email)
  const link = kit.linkIn(mails[mails.length - 1].text)
  const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings WHERE reference = ?', [made.json.data.reference])!.id
  return { id, link, token: kit.tokenOf(link), reference: made.json.data.reference as string }
}

const page = async (token: string) => kit.api(`/api/consultations/manage/${token}`)
const act = (token: string, body: Record<string, unknown>) => kit.api(`/api/consultations/manage/${token}/actions`, { body })
const admin = (id: string, body: Record<string, unknown>) => kit.api(`/api/admin/bookings/${id}/actions`, { headers: kit.admin, body })
const status = (id: string) => kit.server.db.get<{ status: string; start_at: string }>('SELECT status, start_at FROM bookings WHERE id = ?', [id])!
const alive = () => kit.server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM bookings WHERE status IN ('pending', 'confirmed', 'reschedule_requested', 'rescheduled')")!.n
const subjects = (address: string) => kit.mailTo(address).map((mail) => mail.subject)

describe('the secure link', () => {
  it('shows a customer their own booking and nothing private', async () => {
    kit = await makeKit()
    const anna = await visitor('anna@example.com', { company: 'Kovács Bt.', description: 'A website for my bakery.' })
    await visitor('bela@example.com', { start: SLOT_10, name: 'Béla' })
    await admin(anna.id, { action: 'note', text: 'PRIVATE-NOTE-ABOUT-ANNA' })
    const response = await page(anna.token)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.json.data).toMatchObject({ reference: anna.reference, status: 'confirmed', active: true, startAt: SLOT_9, timeZone: 'Europe/Budapest', durationMinutes: 60, name: 'Anna', company: 'Kovács Bt.', type: { code: 'discovery', name: 'Discovery call' } })
    expect(response.text).not.toMatch(/PRIVATE-NOTE|anna@example\.com|bela|Béla|BK-2026-000002|ip_hash|idempotency/i)
    expect(response.json.data.history.map((entry: { type: string }) => entry.type)).toEqual(['created'])
  })

  it('answers a made-up token and a malformed one alike, and makes a guesser wait', async () => {
    kit = await makeKit({ env: { RATE_LIMITS: 'true' } })
    const made = await page('A'.repeat(43))
    const malformed = await page('short')
    expect(made.status).toBe(404)
    expect(malformed.status).toBe(404)
    expect(made.json.error.message).toBe(malformed.json.error.message)
    const statuses: number[] = []
    for (let i = 0; i < 25; i += 1) statuses.push((await page('B'.repeat(43))).status)
    expect(statuses.slice(0, 15).every((code) => code === 404)).toBe(true)
    expect(statuses).toContain(429)
  })

  it('opens exactly one booking: a link to one does not open another, and a quotation\'s link opens none', async () => {
    kit = await makeKit()
    const anna = await visitor('anna@example.com')
    const bela = await visitor('bela@example.com', { start: SLOT_10, name: 'Béla' })
    expect((await page(anna.token)).json.data.reference).toBe(anna.reference)
    expect((await page(bela.token)).json.data.reference).toBe(bela.reference)
    const request = await kit.api('/api/quote-requests', { body: quote({ email: 'anna@example.com' }) })
    const statusToken = request.json.data.statusToken as string
    expect(statusToken).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect((await page(statusToken)).status).toBe(404)
    expect((await kit.api(`/api/customer/requests/${anna.token}`)).status).toBe(404)
    expect((await kit.api(`/api/customer/quotations/${anna.token}`)).status).toBe(404)
  })

  it('keeps only a hash, not the secret', async () => {
    kit = await makeKit()
    const anna = await visitor()
    const rows = kit.server.db.all<Record<string, string>>('SELECT * FROM booking_tokens')
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain(anna.token)
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(kit.server.db.all('SELECT * FROM email_deliveries'))).not.toContain(anna.token)
    // Nor in a log line: use the link, then read what the server wrote about it.
    await page(anna.token)
    await act(anna.token, { action: 'cancel' })
    const logged = kit.server.logs.join('\n')
    expect(logged).not.toContain(anna.token)
    expect(logged).not.toMatch(/anna@example\.com|Anna/)
  })

  it('stops working when revoked or expired, and says which', async () => {
    kit = await makeKit()
    const anna = await visitor()
    expect((await admin(anna.id, { action: 'revoke_links' })).status).toBe(200)
    const revoked = await page(anna.token)
    expect(revoked.status).toBe(410)
    expect(revoked.json.error.details.reason).toBe('revoked')
    expect((await act(anna.token, { action: 'cancel' })).status).toBe(410)
    // A message written after that carries a link that works again: revoking ends what was sent, not the booking.
    await admin(anna.id, { action: 'cancel', message: 'We must cancel.' })
    await kit.settle()
    const latest = kit.mailTo('anna@example.com').at(-1)!
    expect(latest.subject).toBe('Your consultation is cancelled — BK-2026-000001')
    expect((await page(kit.tokenOf(kit.linkIn(latest.text)))).status).toBe(200)

    const bela = await visitor('bela@example.com', { start: SLOT_10 })
    kit.server.clock.advance(200 * 86_400_000)
    const expired = await page(bela.token)
    expect(expired.status).toBe(410)
    expect(expired.json.error.details.reason).toBe('expired')
  })
})

describe('a customer asks to cancel', () => {
  it('asks, and the booking stays as it is until the owner answers', async () => {
    kit = await makeKit()
    const anna = await visitor()
    const asked = await act(anna.token, { action: 'cancel', message: 'My plans changed.' })
    expect(asked.status).toBe(200)
    expect(asked.json.data.outcome).toBe('requested')
    expect(status(anna.id).status).toBe('confirmed')
    expect(asked.json.data.booking.change).toMatchObject({ kind: 'cancel', initiator: 'customer', message: 'My plans changed.', canWithdraw: true, canAnswer: false })
    expect(asked.json.data.booking.policy.cancel).toEqual({ allowed: false, reason: 'change_open' })
    // Still holding its time.
    expect(await kit.slots(WEDNESDAY, WEDNESDAY)).not.toContain(SLOT_9)
    await kit.settle()
    expect(subjects('anna@example.com').at(-1)).toBe('We received your cancellation request — BK-2026-000001')
    expect(subjects('owner@site.test').at(-1)).toBe('Cancellation requested (BK-2026-000001): Anna')
    // A second request while one is open is refused.
    const twice = await act(anna.token, { action: 'cancel' })
    expect(twice.status).toBe(409)
    expect(twice.json.error.details.reason).toBe('change_open')
  })

  it('is granted by the owner: cancelled, the time is free again, and the customer is told', async () => {
    kit = await makeKit()
    const anna = await visitor()
    await act(anna.token, { action: 'cancel' })
    const granted = await admin(anna.id, { action: 'approve', message: 'No problem.' })
    expect(granted.json.data.booking).toMatchObject({ status: 'cancelled', cancelled_by: 'customer' })
    expect(granted.json.data.changes[0]).toMatchObject({ status: 'applied', decided_by: 'owner' })
    expect(await kit.slots(WEDNESDAY, WEDNESDAY)).toContain(SLOT_9)
    await kit.settle()
    expect(subjects('anna@example.com').at(-1)).toBe('Your consultation is cancelled — BK-2026-000001')
    expect((await page(anna.token)).json.data).toMatchObject({ status: 'cancelled', active: false, cancellation: { by: 'customer' } })
    // Nothing more can be asked of a cancelled booking.
    expect((await act(anna.token, { action: 'cancel' })).status).toBe(409)
  })

  it('is declined by the owner: the booking is untouched and the customer is told', async () => {
    kit = await makeKit()
    const anna = await visitor()
    await act(anna.token, { action: 'cancel' })
    const declined = await admin(anna.id, { action: 'reject', message: 'Please call me first.' })
    expect(declined.json.data.booking.status).toBe('confirmed')
    expect(declined.json.data.openChange).toBeNull()
    await kit.settle()
    const mail = kit.mailTo('anna@example.com').at(-1)!
    expect(mail.subject).toBe('Your request could not be accepted — BK-2026-000001')
    expect(mail.text).toContain('Please call me first.')
    // The customer may ask again.
    expect((await act(anna.token, { action: 'cancel' })).json.data.outcome).toBe('requested')
  })

  it('happens at once when the owner does not want to approve requests', async () => {
    kit = await makeKit({ settings: { approvalRequired: false } })
    const anna = await visitor()
    const done = await act(anna.token, { action: 'cancel' })
    expect(done.json.data.outcome).toBe('done')
    expect(status(anna.id).status).toBe('cancelled')
    await kit.settle()
    expect(subjects('anna@example.com').at(-1)).toBe('Your consultation is cancelled — BK-2026-000001')
    expect(subjects('owner@site.test').at(-1)).toBe('Booking cancelled (BK-2026-000001): Anna')
  })

  it('may be taken back by the customer', async () => {
    kit = await makeKit()
    const anna = await visitor()
    await act(anna.token, { action: 'cancel' })
    const back = await act(anna.token, { action: 'withdraw' })
    expect(back.json.data.outcome).toBe('withdrawn')
    expect(back.json.data.booking.change).toBeNull()
    expect(status(anna.id).status).toBe('confirmed')
  })

  it('is not offered when the owner does not allow it, or too close to the appointment', async () => {
    kit = await makeKit({ settings: { allowCancelRequests: false } })
    const anna = await visitor()
    const refused = await act(anna.token, { action: 'cancel' })
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('not_offered')
    expect((await page(anna.token)).json.data.policy.cancel).toEqual({ allowed: false, reason: 'not_offered' })
    await kit.settings({ allowCancelRequests: true, changeMinNoticeHours: 48 })
    const late = await act(anna.token, { action: 'cancel' })
    expect(late.json.error.details.reason).toBe('too_late')
    await kit.settings({ changeMinNoticeHours: 0 })
    expect((await act(anna.token, { action: 'cancel' })).status).toBe(200)
  })
})

describe('a customer asks to move the booking', () => {
  it('holds the new time for the request and keeps the old one, then moves only when the owner agrees', async () => {
    kit = await makeKit()
    const anna = await visitor()
    const days = await kit.api(`/api/consultations/manage/${anna.token}/days?from=${WEDNESDAY}&to=${WEDNESDAY}`)
    expect(days.status).toBe(200)
    // The booking's own time is not in its own way.
    expect(days.json.data.days[0].slots.map((slot: { start: string }) => slot.start)).toContain(SLOT_9)
    const asked = await act(anna.token, { action: 'reschedule', start: SLOT_13, message: 'Afternoons suit me better.' })
    expect(asked.json.data.outcome).toBe('requested')
    expect(status(anna.id)).toEqual({ status: 'reschedule_requested', start_at: SLOT_9 })
    expect(asked.json.data.booking.change).toMatchObject({ kind: 'reschedule', newStartAt: SLOT_13, canWithdraw: true })
    // Both times are taken for everybody else: the old one is still hers, the new one is held for the request.
    const free = await kit.slots(WEDNESDAY, WEDNESDAY)
    expect(free).not.toContain(SLOT_9)
    expect(free).not.toContain(SLOT_13)
    expect((await kit.book({ start: SLOT_13, email: 'bela@example.com' })).status).toBe(409)
    expect(alive()).toBe(1)

    const agreed = await admin(anna.id, { action: 'approve' })
    expect(agreed.json.data.booking).toMatchObject({ status: 'rescheduled', start_at: SLOT_13 })
    // One appointment, at the new time; the old one is free; nothing is left held.
    expect(alive()).toBe(1)
    const after = await kit.slots(WEDNESDAY, WEDNESDAY)
    expect(after).toContain(SLOT_9)
    expect(after).not.toContain(SLOT_13)
    expect(agreed.json.data.events.map((event: { type: string }) => event.type)).toEqual(['created', 'change_requested', 'rescheduled'])
    expect(agreed.json.data.events[2]).toMatchObject({ from: 'reschedule_requested', to: 'rescheduled', fromStart: SLOT_9, toStart: SLOT_13 })
    await kit.settle()
    const mail = kit.mailTo('anna@example.com').at(-1)!
    expect(mail.subject).toBe('Your consultation has a new time — BK-2026-000001')
    expect(mail.text).toContain('Previous time')
    expect(mail.text).toContain('13:00–14:00')
    expect(mail.text).toContain('09:00–10:00')
    expect(subjects('owner@site.test').slice(-2)).toEqual(['New consultation booking (BK-2026-000001): Anna', 'Reschedule requested (BK-2026-000001): Anna'])
  })

  it('goes back to what it was when the owner declines, and frees the held time', async () => {
    kit = await makeKit()
    const anna = await visitor()
    await act(anna.token, { action: 'reschedule', start: SLOT_13 })
    const declined = await admin(anna.id, { action: 'reject' })
    expect(declined.json.data.booking).toMatchObject({ status: 'confirmed', start_at: SLOT_9 })
    expect(await kit.slots(WEDNESDAY, WEDNESDAY)).toContain(SLOT_13)
    expect((await kit.book({ start: SLOT_13, email: 'bela@example.com' })).status).toBe(201)
  })

  it('goes back too when the customer takes the request back', async () => {
    kit = await makeKit()
    const anna = await visitor()
    await act(anna.token, { action: 'reschedule', start: SLOT_13 })
    expect((await act(anna.token, { action: 'withdraw' })).json.data.booking.status).toBe('confirmed')
    expect(await kit.slots(WEDNESDAY, WEDNESDAY)).toContain(SLOT_13)
  })

  it('refuses a time that is taken, the booking\'s own time, a time the rules do not offer and a booking that cannot move', async () => {
    kit = await makeKit()
    const anna = await visitor()
    await visitor('bela@example.com', { start: SLOT_10 })
    const taken = await act(anna.token, { action: 'reschedule', start: SLOT_10 })
    expect(taken.status).toBe(409)
    expect(taken.json.error.details.reason).toBe('slot_unavailable')
    expect((await act(anna.token, { action: 'reschedule', start: SLOT_9 })).status).toBe(422)
    expect((await act(anna.token, { action: 'reschedule', start: '2026-11-04T08:30:00.000Z' })).status).toBe(409)
    expect((await act(anna.token, { action: 'reschedule', start: '2026-11-04T13:00:00' })).status).toBe(422)
    expect((await act(anna.token, { action: 'reschedule' })).status).toBe(422)
    expect((await act(anna.token, { action: 'explode' })).status).toBe(422)
    expect(status(anna.id).status).toBe('confirmed')
  })

  it('holds a time for one request only: of two customers asking for the same time, one is told it is taken', async () => {
    kit = await makeKit()
    const anna = await visitor('anna@example.com')
    const bela = await visitor('bela@example.com', { start: SLOT_10 })
    const answers = await Promise.all([act(anna.token, { action: 'reschedule', start: SLOT_14 }), act(bela.token, { action: 'reschedule', start: SLOT_14 })])
    expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409])
    expect(kit.server.db.get("SELECT COUNT(*) AS n FROM booking_changes WHERE status = 'open'")).toEqual({ n: 1 })
  })

  it('happens at once when the owner does not want to approve requests, and never leaves two appointments', async () => {
    kit = await makeKit({ settings: { approvalRequired: false } })
    const anna = await visitor()
    const done = await act(anna.token, { action: 'reschedule', start: SLOT_13 })
    expect(done.json.data.outcome).toBe('done')
    expect(status(anna.id)).toEqual({ status: 'rescheduled', start_at: SLOT_13 })
    expect(alive()).toBe(1)
    await kit.settle()
    expect(subjects('anna@example.com').at(-1)).toBe('Your consultation has a new time — BK-2026-000001')
    expect(subjects('owner@site.test').at(-1)).toBe('Booking moved by the customer (BK-2026-000001): Anna')
    // It can be moved again.
    expect((await act(anna.token, { action: 'reschedule', start: SLOT_14 })).json.data.outcome).toBe('done')
    expect(alive()).toBe(1)
  })

  it('is not offered when the owner does not allow it', async () => {
    kit = await makeKit({ settings: { allowRescheduleRequests: false } })
    const anna = await visitor()
    expect((await act(anna.token, { action: 'reschedule', start: SLOT_13 })).json.error.details.reason).toBe('not_offered')
    expect((await kit.api(`/api/consultations/manage/${anna.token}/days?from=${WEDNESDAY}&to=${WEDNESDAY}`)).status).toBe(409)
  })
})

describe('the owner proposes a new time', () => {
  it('keeps the booking where it is until the customer accepts, then moves it', async () => {
    kit = await makeKit()
    const anna = await visitor()
    const proposed = await admin(anna.id, { action: 'propose', start: SLOT_14, message: 'Would 14:00 work for you?' })
    expect(proposed.status, proposed.text).toBe(200)
    expect(proposed.json.data.booking).toMatchObject({ status: 'reschedule_requested', start_at: SLOT_9 })
    expect(proposed.json.data.openChange).toMatchObject({ initiator: 'owner', kind: 'reschedule', new_start_at: SLOT_14 })
    // The proposal runs out by the proposed time at the latest.
    expect(Date.parse(proposed.json.data.openChange.expires_at)).toBeLessThanOrEqual(Date.parse(SLOT_14))
    expect(await kit.slots(WEDNESDAY, WEDNESDAY)).not.toContain(SLOT_14)
    await kit.settle()
    const mail = kit.mailTo('anna@example.com').at(-1)!
    expect(mail.subject).toBe('A new time is proposed for your consultation — BK-2026-000001')
    expect(mail.text).toContain('Would 14:00 work for you?')
    expect(mail.text).toContain('Answer the proposal')
    expect(mail.text).toContain('14:00–15:00')
    // The customer sees it and may answer it, but not withdraw it.
    const seen = (await page(anna.token)).json.data
    expect(seen.change).toMatchObject({ initiator: 'owner', canAnswer: true, canWithdraw: false })
    const accepted = await act(anna.token, { action: 'accept' })
    expect(accepted.json.data.outcome).toBe('accepted')
    expect(status(anna.id)).toEqual({ status: 'rescheduled', start_at: SLOT_14 })
    expect(alive()).toBe(1)
    await kit.settle()
    expect(subjects('anna@example.com').at(-1)).toBe('Your consultation has a new time — BK-2026-000001')
    expect(subjects('owner@site.test').at(-1)).toBe('The customer accepted the new time (BK-2026-000001): Anna')
  })

  it('goes back to the old time when the customer declines', async () => {
    kit = await makeKit()
    const anna = await visitor()
    await admin(anna.id, { action: 'propose', start: SLOT_14 })
    expect((await act(anna.token, { action: 'decline' })).json.data.outcome).toBe('declined')
    expect(status(anna.id)).toEqual({ status: 'confirmed', start_at: SLOT_9 })
    expect(await kit.slots(WEDNESDAY, WEDNESDAY)).toContain(SLOT_14)
    await kit.settle()
    expect(subjects('owner@site.test').at(-1)).toBe('The customer declined the new time (BK-2026-000001): Anna')
  })

  it('lapses when nobody answers, and the booking goes back to what it was', async () => {
    kit = await makeKit()
    const anna = await visitor()
    await admin(anna.id, { action: 'propose', start: SLOT_14 })
    kit.server.clock.advance(30 * 3_600_000)
    const seen = (await page(anna.token)).json.data
    expect(seen.change).toBeNull()
    expect(status(anna.id).status).toBe('confirmed')
    expect((await act(anna.token, { action: 'accept' })).status).toBe(409)
    const events = kit.server.db.all<{ event_type: string }>('SELECT event_type FROM booking_events ORDER BY id').map((row) => row.event_type)
    expect(events).toEqual(['created', 'change_requested', 'change_expired'])
  })

  it('moves the booking at once when the owner does not need the customer\'s confirmation', async () => {
    kit = await makeKit({ settings: { ownerChangeNeedsConfirmation: false } })
    const anna = await visitor()
    const moved = await admin(anna.id, { action: 'propose', start: SLOT_13, message: 'Sorry, I had to move this.' })
    expect(moved.json.data.booking).toMatchObject({ status: 'rescheduled', start_at: SLOT_13 })
    await kit.settle()
    const mail = kit.mailTo('anna@example.com').at(-1)!
    expect(mail.subject).toBe('Your consultation has a new time — BK-2026-000001')
    expect(mail.text).toContain('Sorry, I had to move this.')
  })

  it('offers only times the rules offer, and only one open change at a time', async () => {
    kit = await makeKit()
    const anna = await visitor()
    const off = await admin(anna.id, { action: 'propose', start: '2026-11-04T08:30:00.000Z' })
    expect(off.status).toBe(409)
    expect((await admin(anna.id, { action: 'propose', start: SLOT_9 })).status).toBe(422)
    expect((await admin(anna.id, { action: 'propose', start: SLOT_13 })).status).toBe(200)
    expect((await admin(anna.id, { action: 'propose', start: SLOT_14 })).status).toBe(409)
    // The administrator sees the same days the customer would, with the booking's own time out of its way.
    const days = await kit.api(`/api/admin/bookings/${anna.id}/days?from=${WEDNESDAY}&to=${WEDNESDAY}`, { headers: kit.admin })
    expect(days.status).toBe(200)
    expect(days.json.data.days[0].slots.map((slot: { start: string }) => slot.start)).toContain(SLOT_9)
  })

  it('cannot be written without a link to answer it: no site address, no proposal e-mail', async () => {
    kit = await makeKit({ env: { PUBLIC_URL: '' } })
    const anna = await kit.book({ email: 'anna@example.com', name: 'Anna' })
    expect(anna.status).toBe(201)
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings')!.id
    await admin(id, { action: 'propose', start: SLOT_14 })
    await kit.settle()
    const confirmation = kit.mailTo('anna@example.com')[0]
    expect(confirmation.text).not.toContain('/consultation/booking/')
    expect(kit.mailTo('anna@example.com')).toHaveLength(1)
    const failed = kit.server.db.get<{ status: string; error_code: string }>("SELECT status, error_code FROM email_deliveries WHERE kind = 'booking_proposal'")!
    expect(failed.status).toBe('failed')
    expect(kit.server.db.all<{ event_type: string }>("SELECT event_type FROM booking_events WHERE event_type = 'email_failed'")).toHaveLength(1)
  })
})
