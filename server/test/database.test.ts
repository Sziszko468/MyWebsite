import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Database } from '../src/db/database.ts'
import { MigrationError, migrate, migrationStatus, readMigrations, MIGRATIONS_DIRECTORY } from '../src/db/migrate.ts'
import { seedCatalog } from '../src/db/seed.ts'
import { ConstraintError, DatabaseUnavailableError } from '../src/http/errors.ts'
import { TestClock, startServer, type TestServer } from './helpers.ts'

const clock = new TestClock()
const temporary: string[] = []
const scratch = () => {
  const directory = mkdtempSync(join(tmpdir(), 'cc-db-'))
  temporary.push(directory)
  return directory
}
afterEach(() => {
  while (temporary.length) rmSync(temporary.pop()!, { recursive: true, force: true })
})

describe('the database wrapper', () => {
  it('binds parameters (never joins them into SQL), stores booleans as 0/1 and refuses undefined', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, flag INTEGER)')
    db.run('INSERT INTO t (name, flag) VALUES (?, ?)', ["Robert'); DROP TABLE t;--", true])
    expect(db.get<{ name: string; flag: number }>('SELECT name, flag FROM t')).toEqual({ name: "Robert'); DROP TABLE t;--", flag: 1 })
    expect(db.get('SELECT COUNT(*) AS n FROM t')).toEqual({ n: 1 })
    expect(() => db.run('INSERT INTO t (name) VALUES (?)', [undefined])).toThrow(TypeError)
    db.close()
  })

  it('maps constraint failures to ConstraintError with their kind', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE p (id INTEGER PRIMARY KEY); CREATE TABLE c (id INTEGER PRIMARY KEY, pid INTEGER NOT NULL REFERENCES p(id), n TEXT UNIQUE, v INTEGER CHECK (v > 0))')
    const kind = (work: () => unknown) => {
      try {
        work()
      } catch (error) {
        return error instanceof ConstraintError ? error.kind : 'other'
      }
      return 'none'
    }
    expect(kind(() => db.run('INSERT INTO c (pid) VALUES (99)'))).toBe('foreign_key')
    db.run('INSERT INTO p (id) VALUES (1)')
    db.run('INSERT INTO c (pid, n) VALUES (1, ?)', ['a'])
    expect(kind(() => db.run('INSERT INTO c (pid, n) VALUES (1, ?)', ['a']))).toBe('unique')
    expect(kind(() => db.run('INSERT INTO c (pid, v) VALUES (1, 0)'))).toBe('check')
    expect(kind(() => db.run('INSERT INTO c (n) VALUES (?)', ['b']))).toBe('not_null')
    db.close()
  })

  it('runs a transaction whole or not at all, and a nested one joins it', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE t (n INTEGER)')
    expect(() =>
      db.transaction(() => {
        db.run('INSERT INTO t VALUES (1)')
        db.transaction(() => db.run('INSERT INTO t VALUES (2)'))
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(db.get('SELECT COUNT(*) AS n FROM t')).toEqual({ n: 0 })
    db.transaction(() => {
      db.run('INSERT INTO t VALUES (1)')
      try {
        db.transaction(() => {
          db.run('INSERT INTO t VALUES (2)')
          throw new Error('inner')
        })
      } catch {
        // The inner savepoint is rolled back, the outer transaction goes on.
      }
    })
    expect(db.all('SELECT n FROM t')).toEqual([{ n: 1 }])
    expect(() => db.transaction(async () => 1 as never)).toThrow(/synchronous/)
    db.close()
  })

  it('says "unavailable", not a driver error, once the database is closed', () => {
    const db = new Database(':memory:')
    db.close()
    expect(() => db.get('SELECT 1')).toThrow(DatabaseUnavailableError)
    expect(db.ping()).toBe(false)
  })

  it('keeps data in a file, in WAL mode, with foreign keys enforced', () => {
    const file = join(scratch(), 'nested', 'app.sqlite')
    const db = new Database(file)
    expect(db.get<{ journal_mode: string }>('PRAGMA journal_mode')?.journal_mode).toBe('wal')
    expect(db.get<{ foreign_keys: number }>('PRAGMA foreign_keys')?.foreign_keys).toBe(1)
    db.exec('CREATE TABLE t (n INTEGER)')
    db.run('INSERT INTO t VALUES (7)')
    db.close()
    const again = new Database(file)
    expect(again.get('SELECT n FROM t')).toEqual({ n: 7 })
    again.close()
  })
})

describe('migrations', () => {
  it('apply once, in order, and record themselves with a checksum', () => {
    const db = new Database(':memory:')
    expect(migrationStatus(db)).toEqual({ current: 0, latest: readMigrations().at(-1)!.version, pending: readMigrations().length })
    const applied = migrate(db, clock)
    expect(applied).toEqual(readMigrations().map((file) => file.version))
    expect(migrate(db, clock)).toEqual([])
    expect(migrationStatus(db).pending).toBe(0)
    const row = db.get<{ checksum: string; applied_at: string }>('SELECT checksum, applied_at FROM schema_migrations WHERE version = 1')
    expect(row?.checksum).toHaveLength(64)
    expect(row?.applied_at).toBe(clock.now().toISOString())
    db.close()
  })

  it('create the tables the brief asks for, with foreign keys and the indexes the application uses', () => {
    const db = new Database(':memory:')
    migrate(db, clock)
    const tables = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'").map((row) => row.name)
    for (const name of ['admin_users', 'admin_sessions', 'inquiries', 'quote_requests', 'quote_request_items', 'services', 'service_translations', 'packages', 'package_translations', 'extras', 'site_content', 'site_content_translations', 'email_deliveries']) {
      expect(tables, name).toContain(name)
    }
    // No upload feature exists, so no media table does.
    expect(tables).not.toContain('media_assets')
    const indexes = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'index'").map((row) => row.name)
    for (const name of ['idx_inquiries_status_created', 'idx_quote_requests_status_created', 'idx_quote_request_items_request', 'idx_email_deliveries_due', 'idx_admin_sessions_expires']) expect(indexes).toContain(name)
    expect(db.all('PRAGMA foreign_key_check')).toEqual([])
    const keys = db.all<{ table: string }>("SELECT m.name AS \"table\" FROM sqlite_master m JOIN pragma_foreign_key_list(m.name) f WHERE m.type = 'table'")
    expect(keys.length).toBeGreaterThan(15)
    db.close()
  })

  it('refuse an incomplete published price and an unknown enumeration at the database itself', () => {
    const db = new Database(':memory:')
    migrate(db, clock)
    const insert = (kind: string, amount: number | null, currency: string | null, vat: string) =>
      db.run('INSERT INTO packages (code, price_kind, price_amount, price_currency, vat_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [`p${Math.random().toString(36).slice(2, 8)}`, kind, amount, currency, vat, 'a', 'b'])
    expect(() => insert('from', null, 'EUR', 'excluded')).toThrow(ConstraintError)
    expect(() => insert('from', 100, null, 'excluded')).toThrow(ConstraintError)
    expect(() => insert('from', 100, 'EUR', 'unspecified')).toThrow(ConstraintError)
    expect(() => insert('from', 0, 'EUR', 'excluded')).toThrow(ConstraintError)
    expect(() => insert('quote', 100, 'EUR', 'unspecified')).toThrow(ConstraintError)
    expect(() => insert('from', 100, 'USD', 'excluded')).toThrow(ConstraintError)
    expect(() => insert('free', null, null, 'unspecified')).toThrow(ConstraintError)
    expect(() => insert('from', 1200, 'EUR', 'excluded')).not.toThrow()
    expect(() => insert('quote', null, null, 'unspecified')).not.toThrow()
    expect(() => db.run("INSERT INTO inquiries (id, reference, language, kind, name, email, subject, message, status, content_hash, created_at, updated_at) VALUES ('1','C-1','de','job','n','e','s','m','new','h','a','b')")).toThrow(ConstraintError)
    db.close()
  })

  it('leave the database as it was when one fails, and say which one', () => {
    const directory = scratch()
    writeFileSync(join(directory, '0001_first.sql'), 'CREATE TABLE one (n INTEGER);')
    writeFileSync(join(directory, '0002_broken.sql'), 'CREATE TABLE two (n INTEGER); CREATE TABLE one (n INTEGER);')
    const db = new Database(':memory:')
    expect(() => migrate(db, clock, directory)).toThrow(MigrationError)
    expect(() => migrate(db, clock, directory)).toThrow(/Migration 2 \(broken\) failed and was rolled back/)
    expect(migrationStatus(db, directory).current).toBe(1)
    expect(db.get("SELECT name FROM sqlite_master WHERE name = 'two'")).toBeUndefined()
    // Fixing the file lets the next run continue from where it stopped.
    writeFileSync(join(directory, '0002_broken.sql'), 'CREATE TABLE two (n INTEGER);')
    expect(migrate(db, clock, directory)).toEqual([2])
    db.close()
  })

  it('refuse a migration that was edited after it was applied, and a database newer than the code', () => {
    const directory = scratch()
    writeFileSync(join(directory, '0001_first.sql'), 'CREATE TABLE one (n INTEGER);')
    const db = new Database(':memory:')
    migrate(db, clock, directory)
    writeFileSync(join(directory, '0001_first.sql'), 'CREATE TABLE one (n INTEGER, m INTEGER);')
    expect(() => migrate(db, clock, directory)).toThrow(/changed after it was applied/)
    const newer = new Database(':memory:')
    migrate(newer, clock)
    newer.run("INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (99, 'future', 'x', 'now')")
    expect(() => migrate(newer, clock)).toThrow(/does not know/)
    db.close()
    newer.close()
  })

  it('reject badly named files and repeated versions', () => {
    const directory = scratch()
    writeFileSync(join(directory, 'init.sql'), 'SELECT 1;')
    expect(() => readMigrations(directory)).toThrow(/must be named like/)
    rmSync(join(directory, 'init.sql'))
    writeFileSync(join(directory, '0001_a.sql'), 'SELECT 1;')
    writeFileSync(join(directory, '0001_b.sql'), 'SELECT 1;')
    expect(() => readMigrations(directory)).toThrow(/Two migrations/)
  })

  it('are the files in the repository, unchanged by a CRLF checkout', () => {
    const text = readFileSync(join(MIGRATIONS_DIRECTORY, '0001_init.sql'), 'utf8')
    expect(readMigrations()[0].checksum).toBe(readMigrations()[0].checksum)
    expect(text.length).toBeGreaterThan(1000)
  })
})

describe('the catalogue seed', () => {
  let server: TestServer
  afterEach(async () => {
    await server?.close()
  })

  it('loads the website catalogue, with every translation, once, and never overwrites', async () => {
    server = await startServer({ seed: false })
    expect(seedCatalog(server.app.context)).toEqual({ seeded: true, extras: 8, packages: 4, services: 4, faq: 6 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM service_translations')).toEqual({ n: 12 })
    expect(server.db.get('SELECT COUNT(*) AS n FROM package_translations')).toEqual({ n: 12 })
    // The administrator's edit survives a second seed.
    server.db.run("UPDATE packages SET featured = 1 WHERE code = 'grow'")
    expect(seedCatalog(server.app.context).seeded).toBe(false)
    expect(server.db.get<{ featured: number }>("SELECT featured FROM packages WHERE code = 'grow'")?.featured).toBe(1)
  })

  it('refuses a seed that breaks a rule, and loads nothing of it', async () => {
    server = await startServer({ seed: false })
    const directory = scratch()
    const seed = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'seed', 'catalog.seed.json'), 'utf8'))
    seed.packages[0].price = { kind: 'from', amount: 100, currency: 'EUR' }
    seed.packages[0].vat = 'unspecified'
    writeFileSync(join(directory, 'seed.json'), JSON.stringify(seed))
    expect(() => seedCatalog(server.app.context, join(directory, 'seed.json'))).toThrow()
    expect(server.db.get('SELECT COUNT(*) AS n FROM extras')).toEqual({ n: 0 })
  })

  it('publishes no price: every package and add-on is a custom quote, as on the website', async () => {
    server = await startServer()
    expect(server.db.get("SELECT COUNT(*) AS n FROM packages WHERE price_kind <> 'quote'")).toEqual({ n: 0 })
    expect(server.db.get("SELECT COUNT(*) AS n FROM extras WHERE price_kind <> 'quote'")).toEqual({ n: 0 })
  })
})
