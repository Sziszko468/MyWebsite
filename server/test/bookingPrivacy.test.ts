import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import { hmacHex } from '../src/lib/crypto.ts'
import { eraseByEmail, runMaintenance } from '../src/modules/system/maintenance.ts'
import { makeKit, SLOT_10, SLOT_9, type Kit } from './bookingKit.ts'

/**
 * PROMPT 24.1: the claims the privacy notice makes about a booking, proved against the running code. src/content/privacy.test.ts reads the notice and the
 * sources; these tests run the behaviour: what is kept when no retention period is set, what is deleted when one is, what an erasure really removes (every
 * table is read, not only the ones the code names), what the stored network-address fingerprint is, and what "accepted" means for an e-mail.
 */

let kit: Kit
afterEach(async () => {
  await kit?.close()
})

const DAY = 86_400_000
const rows = (sql: string, params: unknown[] = []) => kit.server.db.all<Record<string, unknown>>(sql, params as never[])
const count = (table: string) => (kit.server.db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)!).n

/** Every row of every table, as text: what is left of a person is what this finds. */
function everythingStored(): string {
  const tables = kit.server.db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  return tables.map(({ name }) => `${name}: ${JSON.stringify(kit.server.db.all(`SELECT * FROM "${name}"`))}`).join('\n')
}

async function book(email: string, overrides: Record<string, unknown> = {}) {
  const made = await kit.book({ email, name: 'Anna', ...overrides })
  expect(made.status, JSON.stringify(made.json)).toBe(201)
  await kit.settle()
  const link = kit.linkIn(kit.mailTo(email).at(-1)!.text)
  const id = kit.server.db.get<{ id: string }>('SELECT id FROM bookings WHERE reference = ?', [made.json.data.reference])!.id
  return { id, token: kit.tokenOf(link), reference: made.json.data.reference as string }
}

const adminAction = (id: string, body: Record<string, unknown>) => kit.api(`/api/admin/bookings/${id}/actions`, { headers: kit.admin, body })

describe('retention, as the notice describes it', () => {
  it('deletes nothing because of age when no retention period is set, but still forgets the records of long-expired links', async () => {
    kit = await makeKit({ settings: { horizonDays: 365 } })
    const first = await book('first@example.com', { start: SLOT_9 })
    const second = await book('second@example.com', { start: SLOT_10 })
    expect((await adminAction(first.id, { action: 'cancel' })).status).toBe(200)
    kit.server.db.run("UPDATE bookings SET status = 'completed', completed_at = ? WHERE id = ?", ['2026-11-05T10:00:00.000Z', second.id])
    await kit.settle()
    kit.server.clock.advance(400 * DAY)
    const result = runMaintenance(kit.server.app.context)
    expect(result.retentionDays).toBeNull()
    expect(result).toMatchObject({ bookings: 0, deliveries: 0, inquiries: 0, quoteRequests: 0 })
    expect(count('bookings')).toBe(2)
    expect(count('email_deliveries')).toBeGreaterThan(0)
    // The one thing that is forgotten without a retention period: the hash of a link that expired more than a month ago.
    expect(result.expiredLinks).toBeGreaterThan(0)
    expect(count('booking_tokens')).toBe(0)
  })

  it('with a period, deletes finished bookings (completed, cancelled, missed) and their e-mail log, and never a booking that is still alive', async () => {
    kit = await makeKit({ env: { RETENTION_DAYS: '30' }, settings: { horizonDays: 365 } })
    const cancelled = await book('cancelled@example.com', { start: SLOT_9 })
    const completed = await book('completed@example.com', { start: SLOT_10 })
    const missed = await book('missed@example.com', { start: '2026-11-04T12:00:00.000Z' })
    const alive = await book('alive@example.com', { start: '2026-11-04T13:00:00.000Z' })
    expect((await adminAction(cancelled.id, { action: 'cancel' })).status).toBe(200)
    kit.server.db.run("UPDATE bookings SET status = 'completed', completed_at = '2026-11-05T10:00:00.000Z' WHERE id = ?", [completed.id])
    kit.server.db.run("UPDATE bookings SET status = 'no_show' WHERE id = ?", [missed.id])
    await kit.settle()
    kit.server.clock.advance(31 * DAY)
    const result = runMaintenance(kit.server.app.context)
    expect(result.retentionDays).toBe(30)
    expect(result.bookings).toBe(3)
    expect(rows('SELECT email FROM bookings').map((row) => row.email)).toEqual(['alive@example.com'])
    // The e-mail log is cleaned by age in the same pass, whatever state its booking is in: a message that was handled (accepted, delivered, failed...) and is older
    // than the period is deleted, so the lines of the booking that is still alive go too (the booking stays; a message that is still waiting to be sent would stay).
    expect(count('email_deliveries')).toBe(0)
    // However long ago it was made, a booking that is still alive is not deleted because of its age (it has to be completed, cancelled or marked as missed first).
    kit.server.clock.advance(400 * DAY)
    runMaintenance(kit.server.app.context)
    expect(rows('SELECT id, email FROM bookings')).toEqual([{ id: alive.id, email: 'alive@example.com' }])
  })
})

describe('erasure, as the notice describes it', () => {
  it('leaves no trace of the person in any table: not the name, the address, what they wrote, the private note, the reason or the link', async () => {
    kit = await makeKit()
    const anna = await book('erase.me@example.com', { name: 'Zsófia Marker', company: 'Marker Műhely Kft.', website: 'https://marker-muhely.example.com', description: 'Marker description: a bakery in Győr.' })
    await book('keep.me@example.com', { name: 'Béla Keeper', start: SLOT_10 })
    const customerAsks = await kit.api(`/api/consultations/manage/${anna.token}/actions`, { body: { action: 'cancel', message: 'Marker reason: the plan changed.' } })
    expect(customerAsks.status).toBe(200)
    expect((await adminAction(anna.id, { action: 'note', text: 'Marker private note about Zsófia.' })).status).toBe(200)
    await kit.settle()
    expect(everythingStored()).toContain('Marker')

    const result = eraseByEmail(kit.server.app.context, 'ERASE.ME@example.com')
    expect(result.bookings).toBe(1)

    const left = everythingStored()
    for (const trace of ['erase.me', 'Zsófia', 'Marker', 'marker-muhely', 'Győr', anna.token]) expect(left, trace).not.toContain(trace)
    // The one thing that stays is the history of what happened: a reference, a status and a time, and nothing a person wrote.
    const history = rows('SELECT * FROM booking_events WHERE booking_id = ?', [anna.id])
    expect(history.length).toBeGreaterThan(0)
    expect(JSON.stringify(history)).toContain(anna.reference)
    // Somebody else's booking is untouched.
    expect(left).toContain('keep.me@example.com')
    expect(left).toContain('Béla Keeper')
  })
})

describe('the fingerprint of the network address', () => {
  it('is a keyed hash made with the server secret, is not the address, and is not shown to anyone', async () => {
    kit = await makeKit()
    const made = await book('anna@example.com')
    const stored = kit.server.db.get<{ ip_hash: string }>('SELECT ip_hash FROM bookings WHERE reference = ?', [made.reference])!.ip_hash
    const secret = kit.server.config.appSecret
    // 128 bits of an HMAC-SHA256 (server/src/lib/crypto.ts), as hexadecimal text.
    expect(stored).toMatch(/^[0-9a-f]{32}$/)
    // The test client connects from the loopback address; whichever way the server writes it, the stored value is the keyed hash of it.
    const candidates = ['127.0.0.1', '::1', '::ffff:127.0.0.1']
    expect(candidates.map((ip) => hmacHex(secret, ip))).toContain(stored)
    // Not the plain hash of the address (that could be looked up), and not made with some other secret.
    expect(candidates.map((ip) => createHash('sha256').update(ip).digest('hex').slice(0, 32))).not.toContain(stored)
    expect(candidates.map((ip) => hmacHex('another-secret', ip))).not.toContain(stored)
    expect(JSON.stringify(rows('SELECT * FROM bookings'))).not.toMatch(/127\.0\.0\.1|::1\b/)
    // Neither the administration's view of the booking, nor the customer's page, nor an e-mail carries it.
    const detail = await kit.api(`/api/admin/bookings/${made.id}`, { headers: kit.admin })
    expect(detail.text).not.toContain(stored)
    expect((await kit.api(`/api/consultations/manage/${made.token}`)).text).not.toContain(stored)
    expect(JSON.stringify(kit.server.mailer.sent)).not.toContain(stored)
    // And the address itself is in no line the server logged.
    expect(kit.server.logs.join('\n')).not.toMatch(/127\.0\.0\.1|::ffff/)
  })
})

describe('what "accepted" means for an e-mail', () => {
  it('marks a message accepted by the provider, and never delivered without the provider telling us so', async () => {
    kit = await makeKit()
    await book('anna@example.com')
    const states = rows('SELECT kind, status FROM email_deliveries ORDER BY kind')
    expect(states.map((row) => row.kind).sort()).toEqual(['booking_confirmed', 'booking_new_admin'])
    expect(states.every((row) => row.status === 'accepted')).toBe(true)
    expect(rows("SELECT id FROM email_deliveries WHERE status = 'delivered'")).toHaveLength(0)
  })

  it('keeps the owner\'s optional note on the message row and puts no other text of a message in the log', async () => {
    kit = await makeKit()
    const anna = await book('anna@example.com')
    expect((await adminAction(anna.id, { action: 'cancel', message: 'Owner note: we must cancel.' })).status).toBe(200)
    await kit.settle()
    const cancelled = rows("SELECT note, recipient FROM email_deliveries WHERE kind = 'booking_cancelled'")
    expect(cancelled).toEqual([{ note: 'Owner note: we must cancel.', recipient: 'anna@example.com' }])
    // Nothing else in the log holds a note, and no delivery row holds the subject, a body, a name or a description.
    expect(rows("SELECT id FROM email_deliveries WHERE note IS NOT NULL AND kind <> 'booking_cancelled'")).toHaveLength(0)
    const columns = rows('PRAGMA table_info(email_deliveries)').map((column) => column.name)
    expect(columns).not.toEqual(expect.arrayContaining(['subject']))
    expect(columns).not.toEqual(expect.arrayContaining(['body']))
    expect(columns).not.toEqual(expect.arrayContaining(['html']))
  })
})
