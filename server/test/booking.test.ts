import { afterEach, describe, expect, it } from 'vitest'
import { ConstraintError } from '../src/http/errors.ts'
import { BOOKING_STATUSES, canMove, FINAL_STATUSES, TRANSITIONS } from '../src/modules/bookings/model.ts'
import { makeKit, SLOT_10, SLOT_11, SLOT_13, SLOT_14, SLOT_9, WEDNESDAY, type Kit } from './bookingKit.ts'

let kit: Kit
afterEach(async () => {
  await kit?.close()
})

describe('booking is closed until the owner opens it', () => {
  it('starts with four suggested types, all switched off, with no length and no hours', async () => {
    kit = await makeKit({ open: false })
    const config = (await kit.api('/api/admin/booking-config', { headers: kit.admin })).json.data
    expect(config.types.map((type: { code: string }) => type.code)).toEqual(['discovery', 'project', 'technical', 'follow-up'])
    expect(config.types.every((type: { enabled: boolean; durationMinutes: number | null; complete: boolean }) => !type.enabled && type.durationMinutes === null && !type.complete)).toBe(true)
    expect(config.hours).toEqual([])
    expect(config.exceptions).toEqual([])
    expect(config.settings).toMatchObject({ enabled: false, timeZone: null, configuredAt: null })
    expect(config.closedReasons).toEqual(['switched_off', 'not_configured', 'no_time_zone', 'no_type'])
  })

  it('offers nothing to the public and refuses a booking, whatever is sent', async () => {
    kit = await makeKit({ open: false })
    const config = await kit.api('/api/consultations/config?lang=en')
    expect(config.json.data).toMatchObject({ open: false, timeZone: null, types: [] })
    expect((await kit.api(`/api/consultations/types/discovery/days?from=${WEDNESDAY}&to=${WEDNESDAY}`)).status).toBe(404)
    const booked = await kit.book()
    expect(booked.status).toBe(409)
    expect(booked.json.error.details.reason).toBe('closed')
    expect(await kit.server.db.get('SELECT COUNT(*) AS n FROM bookings')).toEqual({ n: 0 })
  })

  it('cannot switch a type on without a length or without its words in all three languages', async () => {
    kit = await makeKit({ open: false })
    const noLength = await kit.api('/api/admin/consultation-types/discovery', { method: 'PUT', headers: kit.admin, body: { enabled: true } })
    expect(noLength.status).toBe(422)
    expect(noLength.json.error.details.fields).toMatchObject({ durationMinutes: 'required' })
    const noWords = await kit.api('/api/admin/consultation-types/discovery', { method: 'PUT', headers: kit.admin, body: { durationMinutes: 30, enabled: true, translations: { nl: { name: '', description: '' } } } })
    expect(noWords.status).toBe(422)
    expect(noWords.json.error.details.fields).toMatchObject({ 'translations.nl.name': 'required', 'translations.nl.description': 'required' })
  })

  it('cannot be switched on without a time zone', async () => {
    kit = await makeKit({ open: false })
    const refused = await kit.api('/api/admin/booking-settings', { method: 'PUT', headers: kit.admin, body: { enabled: true } })
    expect(refused.status).toBe(422)
    expect(refused.json.error.details.fields).toMatchObject({ timeZone: 'required' })
    const bad = await kit.api('/api/admin/booking-settings', { method: 'PUT', headers: kit.admin, body: { timeZone: 'Mars/Olympus' } })
    expect(bad.json.error.details.fields).toMatchObject({ timeZone: 'invalid' })
  })

  it('stays closed when a type is on but there are no hours, and opens when everything is in place', async () => {
    kit = await makeKit({ open: false })
    await kit.put('/api/admin/consultation-types/discovery', { durationMinutes: 45, enabled: true })
    await kit.settings({ enabled: true, timeZone: 'Europe/Budapest' })
    expect((await kit.api('/api/consultations/config?lang=en')).json.data.open).toBe(false)
    const config = (await kit.api('/api/admin/booking-config', { headers: kit.admin })).json.data
    expect(config.closedReasons).toEqual(['no_hours'])
    await kit.put('/api/admin/booking-hours', { hours: [{ weekday: 3, start: '10:00', end: '12:00' }] })
    const open = (await kit.api('/api/consultations/config?lang=en')).json.data
    expect(open.open).toBe(true)
    expect(open.types).toEqual([{ code: 'discovery', name: 'Discovery call', description: expect.any(String), durationMinutes: 45 }])
  })

  it('offers a type in a language only when it has its words in that language', async () => {
    kit = await makeKit()
    // Switching it off in one language is not a feature; but a type that lost its Dutch words is simply not in the Dutch list.
    kit.server.db.run("UPDATE consultation_type_translations SET name = '' WHERE language = 'nl'")
    expect((await kit.api('/api/consultations/config?lang=nl')).json.data.types).toEqual([])
    expect((await kit.api('/api/consultations/config?lang=hu')).json.data.types).toHaveLength(1)
    // And a booking in that language is refused, not filled in from another one.
    expect((await kit.book({ language: 'nl' })).status).toBe(404)
  })
})

describe('making a booking', () => {
  it('stores the booking in UTC with the scheduling zone, and answers with what the page needs', async () => {
    kit = await makeKit()
    const response = await kit.book({ company: 'Kovács Bt.', website: 'kovacs.example', description: 'A website for my bakery.', email: 'Anna@Example.com' })
    expect(response.status).toBe(201)
    expect(response.json.data).toMatchObject({
      reference: 'BK-2026-000001',
      status: 'confirmed',
      type: { code: 'discovery', name: 'Discovery call' },
      startAt: SLOT_9,
      endAt: SLOT_10,
      timeZone: 'Europe/Budapest',
      durationMinutes: 60,
      language: 'en',
      confirmationEmail: true,
      duplicate: false,
    })
    // The answer is about the booking, not the person.
    expect(response.text).not.toMatch(/Anna|Kov|example\.com/)
    const row = kit.server.db.get<Record<string, string>>('SELECT * FROM bookings')!
    expect(row).toMatchObject({ start_at: SLOT_9, end_at: SLOT_10, time_zone: 'Europe/Budapest', status: 'confirmed', email: 'anna@example.com', website: 'https://kovacs.example/' })
    expect(row.confirmed_at).toBeTruthy()
  })

  it('writes one history line, and confirms by e-mail in the visitor\'s language with the zone named', async () => {
    kit = await makeKit()
    await kit.book({ email: 'anna@example.com', language: 'nl', name: 'Anna' })
    await kit.settle()
    const events = kit.server.db.all<{ event_type: string; actor_type: string; to_status: string }>('SELECT event_type, actor_type, to_status FROM booking_events')
    expect(events).toEqual([{ event_type: 'created', actor_type: 'customer', to_status: 'confirmed' }])
    const [mail] = kit.mailTo('anna@example.com')
    expect(mail.subject).toBe('Je adviesgesprek is bevestigd — BK-2026-000001')
    expect(mail.text).toContain('Europe/Budapest')
    expect(mail.text).toMatch(/woensdag 4 november 2026/)
    expect(mail.text).toContain('09:00–10:00')
    expect(mail.text).toContain('Kennismakingsgesprek')
    // The owner is told too, in the owner's language, and can answer the visitor straight from the mail program.
    const [owner] = kit.mailTo('owner@site.test')
    expect(owner.subject).toBe('New consultation booking (BK-2026-000001): Anna')
    expect(kit.server.mailer.sent.find((message) => message.to === 'owner@site.test')?.replyTo).toBe('anna@example.com')
  })

  it('waits for the owner when the owner asked to confirm each booking', async () => {
    kit = await makeKit({ settings: { confirmation: 'manual' } })
    const response = await kit.book({ email: 'anna@example.com' })
    expect(response.json.data.status).toBe('pending')
    await kit.settle()
    expect(kit.mailTo('anna@example.com')[0].subject).toBe('We received your booking request — BK-2026-000001')
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings')!.id
    // A pending booking already holds its time.
    expect(await kit.slots(WEDNESDAY, WEDNESDAY)).not.toContain(SLOT_9)
    const confirmed = await kit.api(`/api/admin/bookings/${id}/actions`, { headers: kit.admin, body: { action: 'confirm' } })
    expect(confirmed.json.data.booking.status).toBe('confirmed')
    await kit.settle()
    expect(kit.mailTo('anna@example.com').map((mail) => mail.subject)).toEqual(['We received your booking request — BK-2026-000001', 'Your consultation is confirmed — BK-2026-000001'])
  })

  it('refuses what is wrong, naming the fields, and stores nothing', async () => {
    kit = await makeKit()
    const empty = await kit.api('/api/consultations/bookings', { body: {} })
    expect(empty.status).toBe(422)
    expect(empty.json.error.details.fields).toMatchObject({ language: 'required', type: 'required', start: 'required', name: 'required', email: 'required', consent: 'consentRequired' })
    const bad = await kit.book({ email: 'not-an-address', name: 'A', description: 'x'.repeat(1501), website: 'javascript:alert(1)', consent: false })
    expect(bad.json.error.details.fields).toMatchObject({ email: 'invalidEmail', name: 'tooShort', description: 'tooLong', website: 'invalidUrl', consent: 'consentRequired' })
    // A time without a zone has no meaning.
    expect((await kit.book({ start: '2026-11-04T09:00:00' })).json.error.details.fields).toMatchObject({ start: 'invalid' })
    expect((await kit.book({ start: 'tomorrow' })).json.error.details.fields).toMatchObject({ start: 'invalid' })
    expect((await kit.book({ type: 'Not A Code!' })).json.error.details.fields).toMatchObject({ type: 'invalid' })
    expect((await kit.book({ type: 'project' })).status).toBe(404) // a type that is switched off is answered like one that does not exist
    expect((await kit.book({ type: 'nonexistent' })).status).toBe(404)
    expect(await kit.server.db.get('SELECT COUNT(*) AS n FROM bookings')).toEqual({ n: 0 })
  })

  it('refuses a time the rules do not offer: off the grid, outside the hours, in the past, too soon, beyond the horizon', async () => {
    kit = await makeKit({ settings: { horizonDays: 14 } })
    const refusals = [
      '2026-11-04T08:30:00.000Z', // not a start time of the grid
      '2026-11-04T05:00:00.000Z', // 06:00 local, outside the hours
      '2026-11-04T11:00:00.000Z', // 12:00 local: a one hour slot would not end by 12:00
      '2026-11-07T08:00:00.000Z', // a Saturday
      '2026-11-03T08:00:00.000Z', // already past
      '2026-11-03T14:00:00.000Z', // today, but inside the 12 hour minimum notice
      '2026-12-30T08:00:00.000Z', // beyond the horizon
    ]
    for (const start of refusals) {
      const response = await kit.book({ start })
      expect(response.status, start).toBe(409)
      expect(response.json.error.details.reason, start).toBe('slot_unavailable')
    }
    expect(await kit.server.db.get('SELECT COUNT(*) AS n FROM bookings')).toEqual({ n: 0 })
  })

  it('answers the same submission twice with the same booking, and refuses a different one under the same key', async () => {
    kit = await makeKit({ settings: { confirmation: 'manual' } })
    const key = 'submission-key-0001'
    const first = await kit.book({ email: 'anna@example.com', idempotencyKey: key })
    const again = await kit.book({ email: 'anna@example.com', idempotencyKey: key })
    expect(first.status).toBe(201)
    expect(again.status).toBe(200)
    expect(again.json.data).toMatchObject({ reference: first.json.data.reference, duplicate: true })
    expect(await kit.server.db.get('SELECT COUNT(*) AS n FROM bookings')).toEqual({ n: 1 })
    await kit.settle()
    // One booking, one confirmation and one notification: a repeat never writes to the person twice.
    expect(kit.server.mailer.sent).toHaveLength(2)
    const other = await kit.book({ email: 'anna@example.com', idempotencyKey: key, start: SLOT_10 })
    expect(other.status).toBe(409)
    expect(other.json.error.details.reason).toBe('key_reused')
    // The key may also arrive as the standard header.
    const header = await kit.api('/api/consultations/bookings', { headers: { 'Idempotency-Key': 'header-key-0001' }, body: { language: 'en', type: 'discovery', start: SLOT_11, name: 'Béla Nagy', email: 'bela@example.com', consent: true } })
    const repeat = await kit.api('/api/consultations/bookings', { headers: { 'Idempotency-Key': 'header-key-0001' }, body: { language: 'en', type: 'discovery', start: SLOT_11, name: 'Béla Nagy', email: 'bela@example.com', consent: true } })
    expect([header.status, repeat.status]).toEqual([201, 200])
  })

  it('stops one address from taking every slot, and refuses a script that fills the hidden field', async () => {
    kit = await makeKit()
    for (const start of [SLOT_9, SLOT_10, SLOT_11]) expect((await kit.book({ email: 'greedy@example.com', start })).status).toBe(201)
    const fourth = await kit.book({ email: 'GREEDY@example.com', start: SLOT_13 })
    expect(fourth.status).toBe(422)
    expect(fourth.json.error.details.fields).toMatchObject({ email: 'tooMany' })
    expect((await kit.book({ nickname: 'bot' })).json.error.code).toBe('spam_suspected')
    expect((await kit.book({ description: 'http://a.example http://b.example http://c.example http://d.example' })).json.error.code).toBe('spam_suspected')
  })

  it('keeps a booking made in Hungarian entirely in Hungarian', async () => {
    kit = await makeKit()
    await kit.book({ language: 'hu', email: 'anna@example.com', name: 'Anna' })
    await kit.settle()
    const [mail] = kit.mailTo('anna@example.com')
    expect(mail.subject).toBe('Megerősítettük a konzultációdat — BK-2026-000001')
    expect(mail.text).toContain('Ismerkedő beszélgetés')
    expect(mail.text).toMatch(/2026\. november 4\., szerda/)
    // Hungarian writes the hour without a leading zero.
    expect(mail.text).toContain('9:00–10:00')
    expect(mail.html).toContain('lang="hu"')
  })
})

describe('what the public can see', () => {
  it('lists only free start and end times: no name, no address, no reference, nothing about what took the rest', async () => {
    kit = await makeKit()
    const booked = await kit.book({ name: 'Secret Person', email: 'secret.person@example.com', description: 'Private project details' })
    const days = await kit.api(`/api/consultations/types/discovery/days?from=${WEDNESDAY}&to=2026-11-06`)
    expect(days.status).toBe(200)
    expect(days.text).not.toMatch(/Secret|secret|Private|BK-2026|example\.com/)
    expect(days.text).not.toContain(booked.json.data.reference)
    const wednesday = days.json.data.days[0]
    expect(wednesday).toMatchObject({ date: WEDNESDAY, status: 'available' })
    expect(wednesday.slots.map((slot: { start: string }) => slot.start)).not.toContain(SLOT_9)
    expect(Object.keys(wednesday.slots[0]).sort()).toEqual(['ambiguous', 'end', 'start'])
  })

  it('reports a day with every slot taken as fully booked, and a day without hours as closed', async () => {
    kit = await makeKit({ hours: [{ weekday: 3, start: '09:00', end: '11:00' }] })
    expect((await kit.book({ start: SLOT_9 })).status).toBe(201)
    expect((await kit.book({ start: SLOT_10 })).status).toBe(201)
    const days = (await kit.api(`/api/consultations/types/discovery/days?from=${WEDNESDAY}&to=2026-11-05`)).json.data.days
    expect(days.map((day: { status: string }) => day.status)).toEqual(['full', 'closed'])
  })

  it('refuses a range that is too long or backwards', async () => {
    kit = await makeKit()
    expect((await kit.api(`/api/consultations/types/discovery/days?from=${WEDNESDAY}&to=2027-03-01`)).status).toBe(422)
    expect((await kit.api(`/api/consultations/types/discovery/days?from=2026-11-10&to=${WEDNESDAY}`)).status).toBe(422)
    expect((await kit.api('/api/consultations/types/discovery/days?from=2026-02-30&to=2026-03-01')).status).toBe(422)
  })

  it('answers errors without internals', async () => {
    kit = await makeKit()
    for (const response of [await kit.book({ start: '2026-11-04T08:30:00.000Z' }), await kit.api('/api/consultations/manage/nonsense'), await kit.api('/api/consultations/types/nope/days?from=2026-11-04&to=2026-11-05')]) {
      expect(response.text).not.toMatch(/sqlite|\.ts:|node:|stack|SELECT|trigger/i)
      expect(response.json.error).toMatchObject({ code: expect.any(String), message: expect.any(String), requestId: expect.any(String) })
    }
  })
})

describe('two appointments never overlap', () => {
  it('lets exactly one of ten simultaneous requests for one slot succeed', async () => {
    kit = await makeKit()
    const attempts = await Promise.all(Array.from({ length: 10 }, (_, index) => kit.book({ email: `racer${index}@example.com`, start: SLOT_11 })))
    const statuses = attempts.map((attempt) => attempt.status).sort()
    expect(statuses).toEqual([201, 409, 409, 409, 409, 409, 409, 409, 409, 409])
    expect(attempts.filter((attempt) => attempt.status === 409).every((attempt) => attempt.json.error.details.reason === 'slot_unavailable')).toBe(true)
    expect(await kit.server.db.get('SELECT COUNT(*) AS n FROM bookings')).toEqual({ n: 1 })
  })

  it('lets exactly one of simultaneous requests for overlapping slots succeed (a 90 minute type, a 30 minute step)', async () => {
    kit = await makeKit({ duration: 90, settings: { slotStepMinutes: 30 } })
    const starts = ['2026-11-04T08:00:00.000Z', '2026-11-04T08:30:00.000Z', '2026-11-04T09:00:00.000Z']
    const attempts = await Promise.all(starts.map((start, index) => kit.book({ email: `racer${index}@example.com`, start })))
    expect(attempts.filter((attempt) => attempt.status === 201)).toHaveLength(1)
    const rows = kit.server.db.all<{ start_at: string; end_at: string }>("SELECT start_at, end_at FROM bookings WHERE status = 'confirmed' ORDER BY start_at")
    for (let index = 1; index < rows.length; index += 1) expect(rows[index].start_at >= rows[index - 1].end_at).toBe(true)
  })

  it('keeps the buffer free before and after a booking', async () => {
    kit = await makeKit({ settings: { bufferMinutes: 60 } })
    expect((await kit.book({ start: SLOT_11 })).status).toBe(201)
    const free = await kit.slots(WEDNESDAY, WEDNESDAY)
    // 11:00 local is booked until 12:00 local... the neighbours at 10:00 and 13:00 are inside the hour of buffer; 09:00 and 14:00 are not.
    expect(free).toContain(SLOT_9)
    expect(free).not.toContain(SLOT_10)
    expect(free).not.toContain('2026-11-04T11:00:00.000Z')
    expect(free).toContain(SLOT_14)
    expect((await kit.book({ start: SLOT_10 })).status).toBe(409)
  })

  it('is guarded by the database itself: a row that overlaps a live booking cannot be written, whoever writes it', async () => {
    kit = await makeKit()
    await kit.book({ start: SLOT_9 })
    const base = kit.server.db.get<Record<string, string>>('SELECT * FROM bookings')!
    const insert = (id: string, status: string, start: string, end: string) =>
      kit.server.db.run(
        'INSERT INTO bookings (id, reference, consultation_type_id, language, name, email, start_at, end_at, time_zone, status, created_at, updated_at, cancelled_at, cancelled_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, `BK-X-${id}`, base.consultation_type_id, 'en', 'X', 'x@example.com', start, end, 'UTC', status, base.created_at, base.created_at, status === 'cancelled' ? base.created_at : null, status === 'cancelled' ? 'owner' : null],
      )
    expect(() => insert('a', 'confirmed', '2026-11-04T08:30:00.000Z', '2026-11-04T09:30:00.000Z')).toThrow(ConstraintError)
    expect(() => insert('b', 'pending', SLOT_9, SLOT_10)).toThrow(/booking_overlap/)
    // Touching is not overlapping, and a booking that is over does not hold its time.
    expect(() => insert('c', 'confirmed', SLOT_10, SLOT_11)).not.toThrow()
    expect(() => insert('d', 'cancelled', SLOT_9, SLOT_10)).not.toThrow()
    // Moving a live booking onto another is refused too.
    expect(() => kit.server.db.run("UPDATE bookings SET start_at = ?, end_at = ? WHERE id = 'c'", [SLOT_9, SLOT_10])).toThrow(/booking_overlap/)
    // And a cancelled one cannot be brought back on top of a live one.
    expect(() => kit.server.db.run("UPDATE bookings SET status = 'confirmed', cancelled_at = NULL, cancelled_by = NULL WHERE id = 'd'")).toThrow(/booking_overlap/)
  })

  it('frees the time when a booking is cancelled', async () => {
    kit = await makeKit()
    await kit.book({ start: SLOT_9 })
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings')!.id
    expect(await kit.slots(WEDNESDAY, WEDNESDAY)).not.toContain(SLOT_9)
    await kit.api(`/api/admin/bookings/${id}/actions`, { headers: kit.admin, body: { action: 'cancel' } })
    expect(await kit.slots(WEDNESDAY, WEDNESDAY)).toContain(SLOT_9)
    expect((await kit.book({ start: SLOT_9 })).status).toBe(201)
  })
})

describe('abuse of the booking form', () => {
  it('lets one address make six bookings in fifteen minutes and then asks it to wait', async () => {
    kit = await makeKit({ env: { RATE_LIMITS: 'true' } })
    const statuses: number[] = []
    for (let n = 0; n < 8; n += 1) statuses.push((await kit.book({ email: `spam${n}@example.com`, start: n % 2 === 0 ? SLOT_9 : SLOT_10 })).status)
    // The first six reach the booking rules (some succeed, some find the time taken); the seventh and eighth are told to wait.
    expect(statuses.slice(0, 6).every((code) => code !== 429)).toBe(true)
    expect(statuses.slice(6)).toEqual([429, 429])
    const refused = await kit.book({ email: 'late@example.com' })
    expect(refused.headers.get('retry-after')).toMatch(/^\d+$/)
    expect(refused.json.error.code).toBe('rate_limited')
  })

  it('opens nothing for a reference, an address or an id: only the secret in a link does', async () => {
    kit = await makeKit()
    const made = await kit.book({ email: 'anna@example.com' })
    const reference = made.json.data.reference as string
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings')!.id
    for (const path of [`/api/consultations/manage/${reference}`, `/api/consultations/manage/${id}`, `/api/consultations/manage/anna@example.com`, `/api/consultations/bookings/${reference}`, `/api/consultations/bookings/${id}`, `/api/consultations/bookings`]) {
      const response = await kit.api(path)
      expect([404, 405]).toContain(response.status)
      expect(response.text).not.toMatch(/Anna|anna@example|BK-2026-000001/)
    }
  })
})

describe('the state machine', () => {
  it('has exactly the documented arrows, and the final states lead nowhere', () => {
    expect(TRANSITIONS.pending).toEqual(['confirmed', 'cancelled'])
    for (const status of FINAL_STATUSES) expect(TRANSITIONS[status]).toEqual([])
    expect(BOOKING_STATUSES).toEqual(['pending', 'confirmed', 'reschedule_requested', 'rescheduled', 'cancelled', 'completed', 'no_show'])
    const allowed = BOOKING_STATUSES.flatMap((from) => BOOKING_STATUSES.filter((to) => canMove(from, to)).map((to) => `${from}>${to}`))
    expect(allowed).toHaveLength(Object.values(TRANSITIONS).reduce((sum, list) => sum + list.length, 0))
    // Nothing can go back to pending, and nothing leaves a final state.
    expect(BOOKING_STATUSES.some((from) => canMove(from, 'pending'))).toBe(false)
    expect(BOOKING_STATUSES.some((to) => canMove('cancelled', to) || canMove('completed', to) || canMove('no_show', to))).toBe(false)
  })

  it('refuses the arrows that do not exist, through the administration', async () => {
    kit = await makeKit({ settings: { confirmation: 'manual' } })
    await kit.book({ start: SLOT_9 })
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings')!.id
    let headers = kit.admin
    const act = (action: string, extra: Record<string, unknown> = {}) => kit.api(`/api/admin/bookings/${id}/actions`, { headers, body: { action, ...extra } })
    // A booking that is waiting cannot be completed, marked no-show or confirmed twice.
    expect((await act('complete')).status).toBe(409)
    expect((await act('no_show')).status).toBe(409)
    expect((await act('confirm')).status).toBe(200)
    expect((await act('confirm')).status).toBe(409)
    // It cannot be closed before it has started.
    const early = await act('complete')
    expect(early.status).toBe(409)
    expect(early.json.error.details.reason).toBe('not_started')
    // After it started, it can.
    kit.server.clock.advance(2 * 86_400_000)
    // The administrator's session idled out in the meantime.
    const again = await kit.server.signIn('admin')
    headers = { Cookie: again.cookie, 'X-CSRF-Token': again.csrf }
    const done = await act('complete')
    expect(done.status, done.text).toBe(200)
    expect(done.json.data.booking.status).toBe('completed')
    // And a final state is final.
    for (const action of ['confirm', 'cancel', 'complete', 'no_show']) expect((await act(action)).status, action).toBe(409)
    expect((await act('explode')).status).toBe(422)
  })

  it('writes every move into a history nobody can edit', async () => {
    kit = await makeKit()
    await kit.book({ start: SLOT_9 })
    const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings')!.id
    await kit.api(`/api/admin/bookings/${id}/actions`, { headers: kit.admin, body: { action: 'cancel', message: 'Sorry about this.' } })
    const detail = (await kit.api(`/api/admin/bookings/${id}`, { headers: kit.admin })).json.data
    expect(detail.events.map((event: { type: string; actorType: string }) => `${event.type}:${event.actorType}`)).toEqual(['created:customer', 'cancelled:admin'])
    expect(detail.events[1]).toMatchObject({ actor: 'owner@site.test', from: 'confirmed', to: 'cancelled' })
    expect(() => kit.server.db.run("UPDATE booking_events SET event_type = 'created'")).toThrow(/append-only/)
    expect(() => kit.server.db.run('DELETE FROM booking_events')).toThrow(/append-only/)
    // The history holds no name and no address.
    expect(JSON.stringify(kit.server.db.all('SELECT * FROM booking_events'))).not.toMatch(/Anna|Kov|example\.com|Sorry/)
  })
})
