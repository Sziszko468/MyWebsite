import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Database } from '../src/db/database.ts'
import { MIGRATIONS_DIRECTORY, migrate } from '../src/db/migrate.ts'
import { computeTotals, formatMoney, fixedTotals, parseMoney, toDecimal } from '../src/modules/quotes/money.ts'
import { formatReference } from '../src/modules/quotes/references.ts'
import { checkManualMove, mayMove, REQUEST_STATUSES } from '../src/modules/quotes/status.ts'
import { startServer, TestClock, type TestServer } from './helpers.ts'
import { makeKit } from './quotationKit.ts'

/**
 * PROMPT 17: the quotation and order management. These tests drive the real server (in memory) through its HTTP interface: the public
 * request, the administrator's work, the customer's secure pages, the e-mails, and what must be refused.
 */

let server: TestServer
let kit: ReturnType<typeof makeKit>

beforeEach(async () => {
  server = await startServer({ env: { PUBLIC_URL: 'https://site.test' } })
  kit = makeKit(server, await server.signIn('admin', 'admin@site.test'))
})
afterEach(async () => {
  await server.close()
})

// ------------------------------------------------------------------------------------------------------------------------------
describe('money', () => {
  it('reads what a person typed digit by digit, and refuses what is not an amount', () => {
    expect(parseMoney('1500', 'EUR')).toBe(150000)
    expect(parseMoney('1500.5', 'EUR')).toBe(150050)
    expect(parseMoney('1 500,50', 'EUR')).toBe(150050)
    expect(parseMoney('1,500.50', 'EUR')).toBe(150050)
    expect(parseMoney('1.500', 'EUR')).toBe(150000) // three digits after a separator are a thousands group
    expect(parseMoney('1.500.000', 'HUF')).toBe(1_500_000)
    expect(parseMoney('0.1', 'EUR')).toBe(10)
    expect(parseMoney('0.07', 'EUR')).toBe(7) // a float would give 7.000000000000001
    expect(parseMoney('19.99', 'EUR')).toBe(1999)
    expect(parseMoney('12.345', 'EUR')).toBe(1_234_500) // three digits after the separator: a thousands group, never a third decimal
    for (const bad of ['', '-5', '1e3', '12.3456', '1,2,3', 'abc', '1..5', '99999999999', '12.5x']) expect(parseMoney(bad, 'EUR'), bad).toBeNull()
    expect(parseMoney('100.5', 'HUF')).toBeNull() // a forint has no decimals
    expect(toDecimal(150050, 'EUR')).toBe('1500.50')
    expect(toDecimal(7, 'EUR')).toBe('0.07')
    expect(toDecimal(1500, 'HUF')).toBe('1500')
  })

  it('adds integers: a discount is subtracted, an optional line is not in the total, and a tax figure needs a verified rate', () => {
    const lines = [
      { kind: 'item' as const, quantity: 1, unitMinor: 150050 },
      { kind: 'item' as const, quantity: 2, unitMinor: 80000 },
      { kind: 'optional' as const, quantity: 1, unitMinor: 20000 },
      { kind: 'discount' as const, quantity: 1, unitMinor: 10000 },
    ]
    expect(computeTotals(lines, { mode: 'excluded', rateBp: null, verified: false })).toEqual({ subtotalMinor: 310050, discountMinor: 10000, netMinor: 300050, taxMinor: null, totalMinor: 300050, optionalMinor: 20000 })
    // A rate that was typed but not confirmed is not used.
    expect(computeTotals(lines, { mode: 'excluded', rateBp: 2100, verified: false }).taxMinor).toBeNull()
    // Confirmed: added on top, rounded half up (63010.5 -> 63011).
    expect(computeTotals(lines, { mode: 'excluded', rateBp: 2100, verified: true })).toMatchObject({ netMinor: 300050, taxMinor: 63011, totalMinor: 363061 })
    // Tax included: the share is reported, the total stays.
    expect(computeTotals(lines, { mode: 'included', rateBp: 2700, verified: true })).toMatchObject({ taxMinor: 63790, totalMinor: 300050 })
    // A tax-exempt offer has no tax figure whatever the rate.
    expect(computeTotals(lines, { mode: 'exempt', rateBp: 2700, verified: true }).taxMinor).toBeNull()
    expect(() => computeTotals([{ kind: 'item', quantity: 1, unitMinor: 100 }, { kind: 'discount', quantity: 1, unitMinor: 200 }], { mode: 'unspecified', rateBp: null, verified: false })).toThrow()
    expect(fixedTotals(12345, { mode: 'unspecified', rateBp: null, verified: false }).totalMinor).toBe(12345)
  })

  it('writes an amount in the reader\'s language', () => {
    expect(formatMoney(150050, 'EUR', 'en').replace(/\s/g, ' ')).toBe('€1,500.50')
    expect(formatMoney(150050, 'EUR', 'hu')).toMatch(/^1\s?500,50\s?(€|EUR)$/)
    expect(formatMoney(1500000, 'HUF', 'hu')).toMatch(/^1\s500\s000\sFt$/)
    expect(formatMoney(150050, 'EUR', 'nl')).toMatch(/€\s?1\.500,50/)
  })
})

describe('the status workflow', () => {
  it('has the ten stored statuses, each move checked, and acceptance never starts the project by itself', () => {
    expect(REQUEST_STATUSES).toHaveLength(10)
    expect(mayMove('accepted', 'in_progress')).toBe(true)
    expect(mayMove('new', 'completed')).toBe(false)
    expect(mayMove('quote_sent', 'in_progress')).toBe(false)
    expect(checkManualMove('under_review', 'quote_sent', '')).toEqual({ ok: false, reason: 'system_only' })
    expect(checkManualMove('quote_sent', 'accepted', '')).toEqual({ ok: false, reason: 'note_required' })
    expect(checkManualMove('quote_sent', 'accepted', 'Confirmed by phone')).toEqual({ ok: true })
    expect(checkManualMove('completed', 'new', '')).toEqual({ ok: false, reason: 'invalid_transition' })
  })
})

describe('references', () => {
  it('formats the configured pattern', () => {
    expect(formatReference('CC-{YYYY}-{NNNNNN}', 2026, 1)).toBe('CC-2026-000001')
    expect(formatReference('{YY}/{NNNN}', 2026, 42)).toBe('26/0042')
    expect(formatReference('REQ-{NNNNNNNN}', 2026, 1234567)).toBe('REQ-01234567')
  })

  it('numbers requests one after another, starts again in a new year, and never repeats', async () => {
    const references: string[] = []
    for (let i = 0; i < 8; i += 1) references.push((await kit.request({ description: `Request number ${i} for a small website with a form.` })).reference)
    expect(references.slice(0, 3)).toEqual(['CC-2026-000001', 'CC-2026-000002', 'CC-2026-000003'])
    expect(new Set(references).size).toBe(8)
    server.clock.advance(70 * 86_400_000) // into January 2027
    expect((await kit.request({ description: 'A request in the new year with enough words.' })).reference).toBe('CC-2027-000001')
  })

  it('accepts a different format from the environment and refuses a bad one at start-up', async () => {
    await server.close()
    server = await startServer({ env: { PUBLIC_URL: 'https://site.test', QUOTE_REFERENCE_FORMAT: 'WEB-{YY}-{NNNNN}' } })
    kit = makeKit(server, await server.signIn('admin', 'admin2@site.test'))
    expect((await kit.request()).reference).toBe('WEB-26-00001')
    await expect(startServer({ env: { QUOTE_REFERENCE_FORMAT: 'no placeholder' } })).rejects.toThrow(/QUOTE_REFERENCE_FORMAT/)
  })

  it('is no key to anything: no public address takes a reference, and an unknown one is not told apart from a known one', async () => {
    const made = await kit.request()
    for (const path of [`/api/quote-requests/${made.reference}`, `/api/customer/requests/${made.reference}`, `/api/customer/quotations/${made.reference}`, `/api/quotes/${made.reference}`, `/api/customer/requests/CC-2026-000999`]) {
      const response = await server.api(path)
      expect([404, 405], path).toContain(response.status)
      expect(response.text, path).not.toContain('Anna')
    }
  })
})

describe('migration 0007', () => {
  const cleanup: string[] = []
  afterEach(() => cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

  it('keeps what was stored, maps the old statuses and sources, derives the type, and leaves the database consistent', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-mig7-'))
    cleanup.push(directory)
    mkdirSync(directory, { recursive: true })
    for (const file of ['0001_init.sql', '0002_admin_dashboard.sql', '0003_email_system.sql', '0004_projects_media_texts.sql', '0005_shop_experience.sql', '0006_control_room_ai.sql']) copyFileSync(join(MIGRATIONS_DIRECTORY, file), join(directory, file))
    const clock = new TestClock()
    const db = new Database(':memory:')
    try {
      migrate(db, clock, directory)
      const now = clock.now().toISOString()
      db.run("INSERT INTO services (slug, category, created_at, updated_at) VALUES ('website', 'web', ?, ?)", [now, now])
      const insert = (id: string, status: string, kind: string, source: string) =>
        db.run('INSERT INTO quote_requests (id, reference, language, name, email, description, status, kind, source, content_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, `Q-${id}`, 'en', 'N', `${id}@x.test`, 'd', status, kind, source, id, now, now])
      insert('r1', 'in_review', 'catalogue', 'website')
      insert('r2', 'quoted', 'catalogue', 'website')
      insert('r3', 'closed', 'full_experience', 'website')
      insert('r4', 'accepted', 'full_experience', 'ai_assistant')
      insert('r5', 'new', 'catalogue', 'website')
      db.run("INSERT INTO quote_request_items (quote_request_id, position, need, plan) VALUES ('r5', 0, 'website', 'custom')")
      db.run("INSERT INTO quote_request_items (quote_request_id, position, need, plan) VALUES ('r1', 0, 'website', 'launch')")
      db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, created_at, updated_at) VALUES ('d1', 'quote_received', 'quote_request', 'r1', 'o@x.test', 'en', 'accepted', ?, ?)", [now, now])

      // 0007 is the migration under test; 0008 (the assistant) and 0009 (PROMPT 21's two e-mail kinds, see "migration 0009") follow it.
      expect(migrate(db, clock)).toEqual([7, 8, 9])
      expect(db.all('PRAGMA foreign_key_check')).toEqual([])
      expect(db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 })
      const rows = db.all<{ id: string; status: string; customer_status: string; source: string; request_type: string; priority: string }>('SELECT id, status, customer_status, source, request_type, priority FROM quote_requests ORDER BY id')
      expect(rows).toEqual([
        { id: 'r1', status: 'under_review', customer_status: 'under_review', source: 'shop', request_type: 'package_quote', priority: 'normal' },
        { id: 'r2', status: 'quote_sent', customer_status: 'quote_sent', source: 'shop', request_type: 'package_quote', priority: 'normal' },
        { id: 'r3', status: 'completed', customer_status: 'completed', source: 'shop', request_type: 'full_experience', priority: 'normal' },
        { id: 'r4', status: 'accepted', customer_status: 'accepted', source: 'control_room_ai', request_type: 'ai_project', priority: 'normal' },
        { id: 'r5', status: 'new', customer_status: 'new', source: 'shop', request_type: 'custom_service', priority: 'normal' },
      ])
      expect(db.get("SELECT COUNT(*) AS n FROM quote_request_items")).toEqual({ n: 2 }) // the rebuild did not cascade into the lines
      expect(db.get("SELECT reference FROM quote_requests WHERE id = 'r1'")).toEqual({ reference: 'Q-r1' }) // an old reference keeps its code
      expect(db.get("SELECT COUNT(*) AS n FROM email_deliveries")).toEqual({ n: 1 })
      // The new vocabularies are enforced by the database itself.
      expect(() => db.run("UPDATE quote_requests SET status = 'in_review' WHERE id = 'r1'")).toThrow()
      expect(() => db.run("UPDATE quote_requests SET source = 'website' WHERE id = 'r1'")).toThrow()
      expect(() => db.run("INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, created_at, updated_at) VALUES ('d9', 'quote_sent', 'quote', 'x', 'a@x.test', 'en', ?, ?)", [now, now])).not.toThrow()
      // The history cannot be rewritten, however it is attempted.
      db.run("INSERT INTO quote_events (quote_request_id, reference, event_type, actor_type, created_at) VALUES ('r1', 'Q-r1', 'request_created', 'system', ?)", [now])
      expect(() => db.run("UPDATE quote_events SET summary = 'changed'")).toThrow(/append-only/)
      expect(() => db.run('DELETE FROM quote_events')).toThrow(/append-only/)
      // Deleting a request still takes its lines along, and leaves the history alone.
      db.run("DELETE FROM quote_requests WHERE id = 'r1'")
      expect(db.get("SELECT COUNT(*) AS n FROM quote_request_items WHERE quote_request_id = 'r1'")).toEqual({ n: 0 })
      expect(db.get('SELECT COUNT(*) AS n FROM quote_events')).toEqual({ n: 1 })
    } finally {
      db.close()
    }
  })
})

describe('migration 0009', () => {
  const cleanup: string[] = []
  afterEach(() => cleanup.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true })))

  it('keeps every e-mail and its provider events, takes the two new kinds, and keeps the once-only rules', () => {
    const directory = mkdtempSync(join(tmpdir(), 'cc-mig9-'))
    cleanup.push(directory)
    for (const file of ['0001_init.sql', '0002_admin_dashboard.sql', '0003_email_system.sql', '0004_projects_media_texts.sql', '0005_shop_experience.sql', '0006_control_room_ai.sql', '0007_quotation_management.sql', '0008_ai_model_lock.sql']) copyFileSync(join(MIGRATIONS_DIRECTORY, file), join(directory, file))
    const clock = new TestClock()
    const db = new Database(':memory:')
    try {
      expect(migrate(db, clock, directory)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
      const now = clock.now().toISOString()
      const delivery = (id: string, kind: string, relatedType: string, relatedId: string, status = 'accepted') =>
        db.run('INSERT INTO email_deliveries (id, kind, related_type, related_id, recipient, language, status, attempts, last_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?)', [id, kind, relatedType, relatedId, 'a@x.test', 'en', status, status === 'failed' ? 'refused' : null, now, now])
      delivery('d1', 'quote_confirmation', 'quote_request', 'r1')
      delivery('d2', 'quote_sent', 'quote', 'q1', 'failed')
      db.run("INSERT INTO email_events (id, provider, event_type, delivery_id, provider_message_id, occurred_at, received_at, outcome) VALUES ('e1', 'resend', 'email.delivered', 'd1', 'm1', ?, ?, 'applied')", [now, now])

      expect(migrate(db, clock)).toEqual([9])
      expect(db.all('PRAGMA foreign_key_check')).toEqual([])
      expect(db.get('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 })
      // Nothing was lost on the way: the rows, what they say, and the provider's events that point at them.
      expect(db.all('SELECT id, kind, related_type, related_id, status, attempts, last_error FROM email_deliveries ORDER BY id')).toEqual([
        { id: 'd1', kind: 'quote_confirmation', related_type: 'quote_request', related_id: 'r1', status: 'accepted', attempts: 2, last_error: null },
        { id: 'd2', kind: 'quote_sent', related_type: 'quote', related_id: 'q1', status: 'failed', attempts: 2, last_error: 'refused' },
      ])
      expect(db.all('SELECT id, delivery_id FROM email_events')).toEqual([{ id: 'e1', delivery_id: 'd1' }])
      expect(db.all("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'email_deliveries' AND name LIKE 'idx_%' ORDER BY name").map((row) => (row as { name: string }).name)).toEqual([
        'idx_email_deliveries_created', 'idx_email_deliveries_due', 'idx_email_deliveries_provider', 'idx_email_deliveries_recipient', 'idx_email_deliveries_related', 'idx_email_once_per_submission',
      ])

      // The two new kinds, and a message that is about another message.
      expect(() => delivery('d3', 'revision_received', 'quote_revision', 'rv1')).not.toThrow()
      expect(() => delivery('d4', 'delivery_failed_admin', 'email_delivery', 'd2')).not.toThrow()
      // Once per revision request and once per failed message, as the database insists.
      expect(() => delivery('d5', 'revision_received', 'quote_revision', 'rv1')).toThrow(/UNIQUE/)
      expect(() => delivery('d6', 'delivery_failed_admin', 'email_delivery', 'd2')).toThrow(/UNIQUE/)
      // The earlier once-only rule still holds, and a quotation may still be sent again on purpose.
      expect(() => delivery('d7', 'quote_confirmation', 'quote_request', 'r1')).toThrow(/UNIQUE/)
      expect(() => delivery('d8', 'quote_sent', 'quote', 'q1')).not.toThrow()
      // And the vocabularies are still closed.
      expect(() => delivery('d9', 'quote_whatever', 'quote', 'q1')).toThrow()
      expect(() => delivery('d10', 'quote_sent', 'somewhere_else', 'q1')).toThrow()
    } finally {
      db.close()
    }
  })
})
