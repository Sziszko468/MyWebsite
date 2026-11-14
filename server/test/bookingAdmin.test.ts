import { afterEach, describe, expect, it } from 'vitest'
import { eraseByEmail, runMaintenance } from '../src/modules/system/maintenance.ts'
import { makeKit, SLOT_10, SLOT_9, WEDNESDAY, WEEK_HOURS, type Kit } from './bookingKit.ts'

let kit: Kit
afterEach(async () => {
  await kit?.close()
})

const get = (path: string, headers = kit.admin) => kit.api(path, { headers })

describe('who may do what', () => {
  it('lets nobody without a session see or change anything', async () => {
    kit = await makeKit()
    await kit.book()
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings')!.id
    for (const [method, path] of [
      ['GET', '/api/admin/bookings'],
      ['GET', `/api/admin/bookings/${id}`],
      ['GET', `/api/admin/bookings/${id}/days?from=${WEDNESDAY}&to=${WEDNESDAY}`],
      ['POST', `/api/admin/bookings/${id}/actions`],
      ['GET', '/api/admin/booking-config'],
      ['PUT', '/api/admin/booking-settings'],
      ['PUT', '/api/admin/booking-hours'],
      ['POST', '/api/admin/consultation-types'],
      ['PUT', '/api/admin/consultation-types/discovery'],
    ] as const) {
      const response = await kit.api(path, { method, body: method === 'GET' ? undefined : {} })
      expect(response.status, `${method} ${path}`).toBe(401)
      expect(response.text).not.toMatch(/Anna|BK-2026/)
    }
  })

  it('needs the session\'s CSRF token for everything that changes something', async () => {
    kit = await makeKit()
    await kit.book()
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings')!.id
    const noToken = { Cookie: kit.admin.Cookie }
    expect((await kit.api(`/api/admin/bookings/${id}/actions`, { headers: noToken, body: { action: 'cancel' } })).status).toBe(403)
    expect((await kit.api('/api/admin/booking-settings', { method: 'PUT', headers: noToken, body: { enabled: false } })).status).toBe(403)
    expect(kit.server.db.get<{ status: string }>('SELECT status FROM bookings')!.status).toBe('confirmed')
  })

  it('lets an editor work with bookings but not change the owner\'s hours, types or settings', async () => {
    kit = await makeKit()
    await kit.book()
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings')!.id
    expect((await get('/api/admin/bookings', kit.editor)).status).toBe(200)
    expect((await get('/api/admin/booking-config', kit.editor)).status).toBe(200)
    expect((await kit.api(`/api/admin/bookings/${id}/actions`, { headers: kit.editor, body: { action: 'note', text: 'Seen.' } })).status).toBe(200)
    for (const [method, path] of [['PUT', '/api/admin/booking-settings'], ['PUT', '/api/admin/booking-hours'], ['POST', '/api/admin/consultation-types'], ['PUT', '/api/admin/consultation-types/discovery']] as const) {
      expect((await kit.api(path, { method, headers: kit.editor, body: { enabled: false } })).status, path).toBe(403)
    }
    expect(kit.server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM availability_rules")!.n).toBe(WEEK_HOURS.length)
  })

  it('audits what an administrator did, with the reference and no personal text', async () => {
    kit = await makeKit()
    await kit.book({ name: 'Anna Kovács', email: 'anna@example.com' })
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings')!.id
    await kit.api(`/api/admin/bookings/${id}/actions`, { headers: kit.admin, body: { action: 'note', text: 'Call her on Thursday.' } })
    const rows = kit.server.db.all<{ action: string; detail: string | null }>("SELECT action, detail FROM audit_log WHERE action LIKE 'booking.%' ORDER BY id")
    expect(rows.map((row) => row.action)).toContain('booking.note')
    expect(JSON.stringify(rows)).not.toMatch(/Anna|anna@example|Thursday/)
  })
})

describe('the booking list and one booking', () => {
  async function fill() {
    kit = await makeKit({ settings: { confirmation: 'manual' } })
    await kit.book({ name: 'Anna Kovács', email: 'anna@example.com', start: SLOT_9, company: 'Kovács Bt.' })
    await kit.book({ name: 'Béla Nagy', email: 'bela@example.com', start: SLOT_10, language: 'hu' })
    await kit.book({ name: 'Cecil Dijk', email: 'cecil@example.com', start: '2026-11-05T08:00:00.000Z', language: 'nl' })
    const first = kit.server.db.get<{ id: string }>("SELECT id FROM bookings WHERE email = 'anna@example.com'")!.id
    await kit.api(`/api/admin/bookings/${first}/actions`, { headers: kit.admin, body: { action: 'confirm' } })
    return first
  }
  const names = async (query: string) => (await get(`/api/admin/bookings${query}`)).json.data.map((row: { name: string }) => row.name)

  it('searches, filters, sorts and pages', async () => {
    await fill()
    expect(await names('?sort=start')).toEqual(['Anna Kovács', 'Béla Nagy', 'Cecil Dijk'])
    expect(await names('?sort=-start')).toEqual(['Cecil Dijk', 'Béla Nagy', 'Anna Kovács'])
    expect(await names('?sort=name')).toEqual(['Anna Kovács', 'Béla Nagy', 'Cecil Dijk'])
    expect(await names('?status=pending&sort=start')).toEqual(['Béla Nagy', 'Cecil Dijk'])
    expect(await names('?status=pending,confirmed&sort=start')).toHaveLength(3)
    expect(await names('?q=kov')).toEqual(['Anna Kovács'])
    expect(await names('?q=cecil@example')).toEqual(['Cecil Dijk'])
    expect(await names('?q=BK-2026-000002')).toEqual(['Béla Nagy'])
    expect(await names('?q=%25')).toEqual([]) // a percent sign is a character, not a wildcard
    expect(await names('?type=discovery&sort=start')).toHaveLength(3)
    expect(await names('?type=project')).toEqual([])
    // Local dates in the scheduling zone.
    expect(await names('?from=2026-11-05&to=2026-11-05')).toEqual(['Cecil Dijk'])
    expect(await names('?from=2026-11-04&to=2026-11-04&sort=start')).toEqual(['Anna Kovács', 'Béla Nagy'])
    const paged = await get('/api/admin/bookings?sort=start&pageSize=2&page=2')
    expect(paged.json.data.map((row: { name: string }) => row.name)).toEqual(['Cecil Dijk'])
    expect(paged.json.meta).toEqual({ page: 2, pageSize: 2, total: 3 })
    for (const bad of ['?status=nonsense', '?sort=password', '?page=0', '?pageSize=1000', '?from=yesterday']) expect((await get(`/api/admin/bookings${bad}`)).status, bad).toBe(422)
  })

  it('shows one booking in full: contact details, history, notes, e-mail state and the quote it belongs to', async () => {
    const id = await fill()
    const quote = await kit.api('/api/quote-requests', { body: { form: 'quote', version: 2, language: 'en', items: [{ need: 'website', plan: 'launch', extras: [] }], description: 'A small website for a bakery, with opening hours.', objective: 'present', reference: null, timing: 'months', requirements: null, name: 'Anna Kovács', email: 'anna@example.com', phone: null, consent: true } })
    expect(quote.status).toBe(201)
    const other = await kit.book({ name: 'Anna Kovács', email: 'anna@example.com', start: '2026-11-05T09:00:00.000Z', relatedReference: quote.json.data.reference })
    expect(other.status).toBe(201)
    const withQuote = kit.server.db.get<{ id: string }>("SELECT id FROM bookings WHERE related_reference IS NOT NULL")!.id
    await kit.api(`/api/admin/bookings/${id}/actions`, { headers: kit.admin, body: { action: 'note', text: 'Wants a quote for the bakery site.' } })
    await kit.settle()
    const detail = (await get(`/api/admin/bookings/${id}`)).json.data
    expect(detail.booking).toMatchObject({ name: 'Anna Kovács', email: 'anna@example.com', company: 'Kovács Bt.', status: 'confirmed', time_zone: 'Europe/Budapest' })
    expect(detail.booking).not.toHaveProperty('ip_hash')
    expect(detail.booking).not.toHaveProperty('request_hash')
    expect(detail.booking).not.toHaveProperty('idempotency_key')
    expect(detail.notes).toMatchObject([{ body: 'Wants a quote for the bakery site.', author: 'owner@site.test' }])
    expect(detail.events.map((event: { type: string }) => event.type)).toEqual(['created', 'confirmed', 'note_added'])
    expect(detail.deliveries.map((delivery: { kind: string; status: string }) => `${delivery.kind}:${delivery.status}`)).toEqual(['booking_received:accepted', 'booking_new_admin:accepted', 'booking_confirmed:accepted'])
    expect(detail.next).toEqual(['reschedule_requested', 'rescheduled', 'cancelled', 'completed', 'no_show'])
    // The reference of the quote request is matched only because the e-mail address is the same one.
    const linked = (await get(`/api/admin/bookings/${withQuote}`)).json.data
    expect(linked.quote).toMatchObject({ reference: quote.json.data.reference })
    const stranger = await kit.book({ name: 'Mallory', email: 'mallory@example.com', start: '2026-11-06T08:00:00.000Z', relatedReference: quote.json.data.reference })
    expect(stranger.status).toBe(201)
    expect(stranger.text).not.toContain(quote.json.data.reference)
    const strangerRow = kit.server.db.get<{ quote_request_id: string | null; related_reference: string }>("SELECT quote_request_id, related_reference FROM bookings WHERE email = 'mallory@example.com'")!
    expect(strangerRow.quote_request_id).toBeNull()
    expect((await get('/api/admin/bookings/nonexistent')).status).toBe(404)
  })

  it('keeps private notes out of every customer page and e-mail', async () => {
    const id = await fill()
    await kit.api(`/api/admin/bookings/${id}/actions`, { headers: kit.admin, body: { action: 'note', text: 'PRIVATE-NOTE-TEXT-7731' } })
    await kit.api(`/api/admin/bookings/${id}/actions`, { headers: kit.admin, body: { action: 'cancel', message: 'A message for the customer.' } })
    await kit.settle()
    const everything = JSON.stringify(kit.server.mailer.sent)
    expect(everything).not.toContain('PRIVATE-NOTE-TEXT-7731')
    expect(everything).toContain('A message for the customer.')
    const link = kit.linkIn(kit.mailTo('anna@example.com').at(-1)!.text)
    expect((await kit.api(`/api/consultations/manage/${kit.tokenOf(link)}`)).text).not.toContain('PRIVATE-NOTE-TEXT-7731')
  })

  it('escapes what a visitor typed in every e-mail', async () => {
    kit = await makeKit()
    await kit.book({ name: '<script>alert(1)</script> Anna', company: '<img src=x onerror=alert(1)>', description: '"><svg onload=alert(1)>', email: 'anna@example.com' })
    await kit.settle()
    for (const message of kit.server.mailer.sent) {
      expect(message.html).not.toMatch(/<script|<img src=x|<svg onload/)
      expect(message.subject).not.toMatch(/[\r\n]/)
    }
    expect(kit.server.mailer.sent.find((message) => message.to === 'owner@site.test')!.html).toContain('&lt;script&gt;')
  })
})

describe('the hours, the exceptions and the settings', () => {
  it('keeps what is already there when a list has one mistake', async () => {
    kit = await makeKit()
    const refused = await kit.api('/api/admin/booking-hours', { method: 'PUT', headers: kit.admin, body: { hours: [{ weekday: 1, start: '09:00', end: '10:00' }, { weekday: 9, start: '09:00', end: '10:00' }, { weekday: 2, start: '11:00', end: '10:00' }, { weekday: 3, start: '9:00', end: '10:00', type: 'nothing' }] } })
    expect(refused.status).toBe(422)
    expect(refused.json.error.details.fields).toMatchObject({ 'hours.1.weekday': 'invalid', 'hours.2.end': 'invalid', 'hours.3.start': 'invalid', 'hours.3.type': 'invalid' })
    expect(kit.server.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM availability_rules')!.n).toBe(WEEK_HOURS.length)
  })

  it('refuses a one-off time that does not exist or exists twice in the scheduling zone', async () => {
    kit = await makeKit()
    const save = (exceptions: unknown[]) => kit.api('/api/admin/booking-hours', { method: 'PUT', headers: kit.admin, body: { hours: WEEK_HOURS, exceptions } })
    // 2027-03-28 is the Sunday the clocks go forward in Budapest (02:00 to 03:00); 2026-10-25 the Sunday they go back (03:00 to 02:00).
    const gap = await save([{ kind: 'open', startDate: '2027-03-28', start: '02:30', end: '04:00' }])
    expect(gap.status).toBe(422)
    expect(gap.json.error.details.fields).toMatchObject({ 'exceptions.0.start': 'nonexistentTime' })
    const twice = await save([{ kind: 'open', startDate: '2026-10-25', start: '02:30', end: '04:00' }])
    expect(twice.json.error.details.fields).toMatchObject({ 'exceptions.0.start': 'ambiguousTime' })
    // The same times on an ordinary day are fine.
    expect((await save([{ kind: 'open', startDate: '2027-03-27', start: '02:30', end: '04:00' }])).status).toBe(200)
  })

  it('checks the shape of an exception, and a closure may cover a whole period', async () => {
    kit = await makeKit()
    const save = (exceptions: unknown[]) => kit.api('/api/admin/booking-hours', { method: 'PUT', headers: kit.admin, body: { hours: WEEK_HOURS, exceptions } })
    const bad = await save([{ kind: 'open', startDate: '2026-12-01' }, { kind: 'closed', startDate: '2026-12-24', endDate: '2026-12-20' }, { kind: 'closed', startDate: '2026-12-01', endDate: '2026-12-03', start: '10:00', end: '11:00' }, { kind: 'maybe', startDate: '2026-12-01' }, { kind: 'closed', startDate: '2026-02-30' }])
    expect(bad.status).toBe(422)
    expect(Object.keys(bad.json.error.details.fields).sort()).toEqual(['exceptions.0.start', 'exceptions.1.endDate', 'exceptions.2.endDate', 'exceptions.3.kind', 'exceptions.4.endDate', 'exceptions.4.startDate'])
    const ok = await save([{ kind: 'closed', startDate: '2026-12-24', endDate: '2027-01-03', label: 'Winter holiday' }])
    expect(ok.status).toBe(200)
    expect(ok.json.data.exceptions).toEqual([{ id: expect.any(String), kind: 'closed', startDate: '2026-12-24', endDate: '2027-01-03', start: null, end: null, label: 'Winter holiday' }])
    // Those days are closed for the public, and the label is private.
    const days = await kit.api('/api/consultations/types/discovery/days?from=2026-12-28&to=2026-12-28')
    expect(days.json.data.days[0].status).toBe('closed')
    expect(days.text).not.toContain('Winter holiday')
  })

  it('applies a one-off opening and a closure to what the public is offered', async () => {
    kit = await makeKit()
    await kit.put('/api/admin/booking-hours', {
      hours: WEEK_HOURS,
      exceptions: [
        { kind: 'closed', startDate: '2026-11-05', endDate: '2026-11-05' },
        { kind: 'open', startDate: '2026-11-07', start: '10:00', end: '12:00' },
        { kind: 'closed', startDate: '2026-11-04', start: '09:00', end: '11:00' },
      ],
    })
    expect(await kit.slots('2026-11-04', '2026-11-04')).toEqual(['2026-11-04T10:00:00.000Z', '2026-11-04T12:00:00.000Z', '2026-11-04T13:00:00.000Z', '2026-11-04T14:00:00.000Z', '2026-11-04T15:00:00.000Z'])
    expect(await kit.slots('2026-11-05', '2026-11-05')).toEqual([])
    expect(await kit.slots('2026-11-07', '2026-11-07')).toEqual(['2026-11-07T09:00:00.000Z', '2026-11-07T10:00:00.000Z'])
    expect((await kit.book({ start: '2026-11-07T09:00:00.000Z' })).status).toBe(201)
    expect((await kit.book({ start: '2026-11-05T08:00:00.000Z' })).status).toBe(409)
  })

  it('gives one consultation type hours of its own', async () => {
    kit = await makeKit()
    await kit.put('/api/admin/consultation-types/technical', { durationMinutes: 60, enabled: true })
    await kit.put('/api/admin/booking-hours', { hours: [...WEEK_HOURS, { weekday: 5, start: '14:00', end: '16:00', type: 'technical' }] })
    expect(await kit.slots('2026-11-04', '2026-11-04', 'technical')).toEqual([])
    expect(await kit.slots('2026-11-06', '2026-11-06', 'technical')).toEqual(['2026-11-06T13:00:00.000Z', '2026-11-06T14:00:00.000Z'])
    expect(await kit.slots('2026-11-06', '2026-11-06', 'discovery')).toHaveLength(7)
    const config = (await get('/api/admin/booking-config')).json.data
    expect(config.hours.filter((hour: { type: string | null }) => hour.type === 'technical')).toHaveLength(1)
  })

  it('handles the day the clocks go forward: every real hour, never the one that does not exist', async () => {
    kit = await makeKit({ hours: [{ weekday: 7, start: '00:00', end: '06:00' }] })
    // Sunday 28 March 2027 in Budapest: 02:00 jumps to 03:00 (the clocks go forward at 01:00 UTC).
    const slots = await kit.slots('2027-03-28', '2027-03-28')
    expect(slots).toEqual(['2027-03-27T23:00:00.000Z', '2027-03-28T00:00:00.000Z', '2027-03-28T01:00:00.000Z', '2027-03-28T02:00:00.000Z', '2027-03-28T03:00:00.000Z'])
    const text = slots.map((slot) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Budapest', timeStyle: 'short' }).format(new Date(slot)))
    expect(text).toEqual(['00:00', '01:00', '03:00', '04:00', '05:00'])
    // A booking at 03:00 local is the instant after the jump, and the e-mail says so in the zone's own words.
    const made = await kit.book({ start: '2027-03-28T01:00:00.000Z', email: 'anna@example.com' })
    expect(made.status).toBe(201)
    await kit.settle()
    expect(kit.mailTo('anna@example.com')[0].text).toMatch(/03:00–04:00/)
    // 03:00 is the first hour of summer time: the message names the zone as it is at that moment.
    expect(kit.mailTo('anna@example.com')[0].text).toContain('Europe/Budapest (CEST)')
  })

  it('handles the day the clocks go back: the repeated hour is offered twice and flagged', async () => {
    kit = await makeKit({ hours: [{ weekday: 7, start: '00:00', end: '05:00' }] })
    const days = (await kit.api('/api/consultations/types/discovery/days?from=2026-11-01&to=2026-11-01')).json.data.days
    expect(days).toHaveLength(1)
    // 1 November is the day after the change in Budapest: an ordinary day. The change itself (25 October) is in the past on this clock; use a later year.
    expect(days[0].status).toBe('closed')
    const next = (await kit.api('/api/consultations/types/discovery/days?from=2027-10-31&to=2027-10-31')).json.data.days[0]
    // Sunday 31 October 2027: the clocks go back at 01:00 UTC, so six elapsed hours between 00:00 and 05:00 local.
    expect(next.slots).toHaveLength(6)
    expect(next.slots.filter((slot: { ambiguous: boolean }) => slot.ambiguous)).toHaveLength(2)
  })

  it('refuses a booking for a time that is not a real slot even when it looks like one in the wrong zone', async () => {
    kit = await makeKit()
    // 09:00 written as UTC is 10:00 in Budapest in November: that happens to be a slot too, so use a UTC time that is not one.
    expect((await kit.book({ start: '2026-11-04T07:00:00.000Z' })).status).toBe(409)
    // The same instant written with an offset is accepted as what it is.
    const offset = await kit.book({ start: '2026-11-04T09:00:00+01:00', email: 'zone@example.com' })
    expect(offset.status).toBe(201)
    expect(offset.json.data.startAt).toBe(SLOT_9)
  })
})

describe('the e-mail switches', () => {
  it('sends the customer nothing when confirmations of bookings are switched off, and the owner nothing when notifications are', async () => {
    kit = await makeKit()
    const current = (await get('/api/admin/notifications')).json.data.preferences
    expect(current).toMatchObject({ newBooking: true, confirmBooking: true })
    const save = (changes: Record<string, unknown>) => kit.api('/api/admin/notifications/preferences', { method: 'PUT', headers: kit.admin, body: { ...current, ...changes } })
    expect((await save({ confirmBooking: false })).status).toBe(200)
    const first = await kit.book({ email: 'anna@example.com' })
    expect(first.json.data.confirmationEmail).toBe(false)
    await kit.settle()
    expect(kit.mailTo('anna@example.com')).toEqual([])
    expect(kit.mailTo('owner@site.test')).toHaveLength(1)
    await save({ confirmBooking: true, newBooking: false })
    await kit.book({ email: 'bela@example.com', start: SLOT_10 })
    await kit.settle()
    expect(kit.mailTo('bela@example.com')).toHaveLength(1)
    expect(kit.mailTo('owner@site.test')).toHaveLength(1)
  })

  it('writes no e-mail at all when no provider is configured, and still books', async () => {
    kit = await makeKit({ env: { EMAIL_PROVIDER: 'none', EMAIL_FROM: '' } })
    const response = await kit.book()
    expect(response.status).toBe(201)
    expect(response.json.data.confirmationEmail).toBe(false)
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM email_deliveries')).toEqual({ n: 0 })
  })

  it('does not write to one address without end', async () => {
    kit = await makeKit({ settings: { confirmation: 'manual' } })
    const id = async () => kit.server.db.get<{ id: string }>('SELECT id FROM bookings ORDER BY created_at DESC LIMIT 1')!.id
    await kit.book({ email: 'victim@example.com', start: SLOT_9 })
    const booking = await id()
    for (let n = 0; n < 8; n += 1) {
      await kit.api(`/api/admin/bookings/${booking}/actions`, { headers: kit.admin, body: { action: n % 2 === 0 ? 'note' : 'revoke_links', text: 'x' } })
    }
    const sent = kit.server.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM email_deliveries WHERE recipient = 'victim@example.com'")!.n
    expect(sent).toBeLessThanOrEqual(12)
  })
})

describe('what the site forgets', () => {
  it('erases everything held about one address: bookings, notes, links, e-mails; the history keeps no person', async () => {
    kit = await makeKit()
    await kit.book({ email: 'anna@example.com', name: 'Anna Kovács' })
    await kit.book({ email: 'bela@example.com', name: 'Béla', start: SLOT_10 })
    const id = kit.server.db.get<{ id: string }>("SELECT id FROM bookings WHERE email = 'anna@example.com'")!.id
    await kit.api(`/api/admin/bookings/${id}/actions`, { headers: kit.admin, body: { action: 'note', text: 'A note.' } })
    await kit.settle()
    const result = eraseByEmail(kit.server.app.context, 'ANNA@example.com')
    expect(result.bookings).toBe(1)
    expect(kit.server.db.get("SELECT COUNT(*) AS n FROM bookings WHERE email = 'anna@example.com'")).toEqual({ n: 0 })
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM bookings')).toEqual({ n: 1 })
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM booking_notes')).toEqual({ n: 0 })
    expect(kit.server.db.get('SELECT COUNT(*) AS n FROM booking_tokens WHERE booking_id = ?', [id])).toEqual({ n: 0 })
    expect(kit.server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE recipient = 'anna@example.com'")).toEqual({ n: 0 })
    expect(kit.server.db.get("SELECT COUNT(*) AS n FROM email_deliveries WHERE recipient = 'bela@example.com'")).toEqual({ n: 1 })
    expect(JSON.stringify(kit.server.db.all('SELECT * FROM booking_events'))).not.toMatch(/anna|Kov|example\.com/i)
    // The time is free again.
    expect(await kit.slots(WEDNESDAY, WEDNESDAY)).toContain(SLOT_9)
  })

  it('deletes finished bookings by age only when a retention period is set, and never one that is still alive', async () => {
    kit = await makeKit({ env: { RETENTION_DAYS: '30' }, settings: { horizonDays: 365 } })
    await kit.book({ email: 'old@example.com', start: SLOT_9 })
    await kit.book({ email: 'cancelled@example.com', start: SLOT_10 })
    const cancelled = kit.server.db.get<{ id: string }>("SELECT id FROM bookings WHERE email = 'cancelled@example.com'")!.id
    await kit.api(`/api/admin/bookings/${cancelled}/actions`, { headers: kit.admin, body: { action: 'cancel' } })
    expect(runMaintenance(kit.server.app.context).bookings).toBe(0)
    kit.server.clock.advance(40 * 86_400_000)
    const result = runMaintenance(kit.server.app.context)
    expect(result.bookings).toBe(1)
    expect(kit.server.db.all<{ email: string }>('SELECT email FROM bookings').map((row) => row.email)).toEqual(['old@example.com'])
  })
})
