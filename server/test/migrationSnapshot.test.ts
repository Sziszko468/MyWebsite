import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Database } from '../src/db/database.ts'
import { MIGRATIONS_DIRECTORY, MigrationError, migrate, migrationStatus, readMigrations } from '../src/db/migrate.ts'
import { SafeMigrationError, SnapshotError, listSnapshots, migrateWithSnapshot, pruneSnapshots } from '../src/db/snapshot.ts'
import { TestClock } from './helpers.ts'

/**
 * Migration safety (PROMPT 25): before pending migrations are applied to an existing database, a verified copy of it is written and kept
 * for a number of days; a migration that fails leaves the database exactly as it was before THAT migration and the error says where the
 * copy is. Everything here runs on temporary files and on synthetic migrations in temporary folders (and, for the real upgrade, on COPIES
 * of the real migration files): no production database, no customer data, and no real migration directory is ever the target of a failure.
 */

const folders: string[] = []
const open: Database[] = []
const temp = (prefix = 'cc-mig-'): string => {
  const folder = mkdtempSync(join(tmpdir(), prefix))
  folders.push(folder)
  return folder
}
afterEach(() => {
  for (const db of open.splice(0)) db.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

const clock = () => new TestClock(Date.parse('2026-11-16T10:00:00.000Z'))

/** A folder of migrations written from a list of `[file, sql]`. */
function migrations(files: [string, string][], into = temp('cc-migrations-')): string {
  for (const [name, sql] of files) writeFileSync(join(into, name), sql)
  return into
}

const FIRST: [string, string] = ['0001_init.sql', "CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL); INSERT INTO notes (body) VALUES ('one'), ('two'), ('three');"]
const SECOND: [string, string] = ['0002_more.sql', 'ALTER TABLE notes ADD COLUMN done INTEGER NOT NULL DEFAULT 0;']
const THIRD: [string, string] = ['0003_index.sql', 'CREATE INDEX idx_notes_body ON notes (body);']
/** Creates a table, fills it, and then breaks (a duplicate key): the whole file must be undone. */
const BAD: [string, string] = ['0004_bad.sql', "CREATE TABLE half_done (id INTEGER); INSERT INTO half_done VALUES (1); INSERT INTO notes (id, body) VALUES (1, 'a duplicate id');"]

function database(directory: string, name = 'app.sqlite'): { db: Database; path: string } {
  const path = join(directory, name)
  const db = new Database(path)
  open.push(db)
  return { db, path }
}

/** Everything that defines and fills a database, for "exactly as it was". */
function fingerprint(path: string): unknown {
  const raw = new DatabaseSync(path, { readOnly: true })
  try {
    const objects = raw.prepare("SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name").all() as { type: string; name: string; sql: string | null }[]
    const rows = Object.fromEntries(objects.filter((entry) => entry.type === 'table').map((entry) => [entry.name, raw.prepare(`SELECT * FROM "${entry.name}"`).all()]))
    return { objects, rows }
  } finally {
    raw.close()
  }
}

describe('a snapshot before pending migrations', () => {
  it('takes none for a database that has no history (a fresh one has nothing to lose) or nothing pending', () => {
    const home = temp()
    const { db, path } = database(home)
    const dir = migrations([FIRST, SECOND])
    const snapshots = join(home, 'snapshots')
    const first = migrateWithSnapshot(db, clock(), { databasePath: path, snapshots: { days: 14, directory: snapshots }, migrationsDirectory: dir })
    expect(first).toMatchObject({ applied: [1, 2], snapshot: null, pruned: [] })
    const again = migrateWithSnapshot(db, clock(), { databasePath: path, snapshots: { days: 14, directory: snapshots }, migrationsDirectory: dir })
    expect(again).toMatchObject({ applied: [], snapshot: null })
    expect(listSnapshots(snapshots)).toEqual([])
  })

  it('writes a consistent, checked copy of the existing database first, then migrates', () => {
    const home = temp()
    const { db, path } = database(home)
    const snapshots = join(home, 'snapshots')
    const options = { databasePath: path, snapshots: { days: 14, directory: snapshots } }
    migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST, SECOND]) })
    const before = fingerprint(path)

    const result = migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST, SECOND, THIRD]) })
    expect(result.applied).toEqual([3])
    expect(result.snapshot).toMatchObject({ from: 2, to: 3 })
    expect(result.snapshot?.file).toMatch(/^pre-v2-to-v3-20261116T100000Z\.sqlite$/)
    // The copy is the database as it was BEFORE the migration: version 2, the rows, no index; and SQLite calls it whole.
    const copy = join(snapshots, result.snapshot!.file)
    expect(fingerprint(copy)).toEqual(before)
    const raw = new DatabaseSync(copy, { readOnly: true })
    expect((raw.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check).toBe('ok')
    expect((raw.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n).toBe(2)
    raw.close()
    // And the live database moved on.
    expect(migrationStatus(db, migrations([FIRST, SECOND, THIRD]))).toMatchObject({ current: 3, pending: 0 })
  })

  it('does not overwrite an earlier snapshot made in the same second', () => {
    const home = temp()
    const { db, path } = database(home)
    const snapshots = join(home, 'snapshots')
    const options = { databasePath: path, snapshots: { days: 14, directory: snapshots } }
    migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST]) })
    const one = migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST, SECOND]) })
    const two = migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST, SECOND, THIRD]) })
    expect([one.snapshot?.file, two.snapshot?.file]).toEqual(['pre-v1-to-v2-20261116T100000Z.sqlite', 'pre-v2-to-v3-20261116T100000Z.sqlite'])
    const same = migrateWithSnapshot(database(temp()).db, clock(), { databasePath: '/x', snapshots: { days: 0, directory: snapshots }, migrationsDirectory: migrations([FIRST]) })
    expect(same.snapshot).toBeNull()
  })

  it('is switched off by 0 days, and has nothing to do for an in-memory database', () => {
    const home = temp()
    const { db, path } = database(home)
    migrateWithSnapshot(db, clock(), { databasePath: path, snapshots: { days: 14, directory: join(home, 'snapshots') }, migrationsDirectory: migrations([FIRST]) })
    const off = migrateWithSnapshot(db, clock(), { databasePath: path, snapshots: { days: 0, directory: join(home, 'snapshots') }, migrationsDirectory: migrations([FIRST, SECOND]) })
    expect(off).toMatchObject({ applied: [2], snapshot: null })
    expect(listSnapshots(join(home, 'snapshots'))).toEqual([])
    const memory = new Database(':memory:')
    open.push(memory)
    migrateWithSnapshot(memory, clock(), { databasePath: ':memory:', snapshots: { days: 14, directory: join(home, 'snapshots-memory') }, migrationsDirectory: migrations([FIRST]) })
    const next = migrateWithSnapshot(memory, clock(), { databasePath: ':memory:', snapshots: { days: 14, directory: join(home, 'snapshots-memory') }, migrationsDirectory: migrations([FIRST, SECOND]) })
    expect(next.snapshot).toBeNull()
    expect(readdirSync(home)).not.toContain('snapshots-memory')
  })
})

describe('a migration that fails', () => {
  it('leaves the database exactly as it was, and the snapshot of it available, and says where it is', () => {
    const home = temp()
    const { db, path } = database(home)
    const snapshots = join(home, 'snapshots')
    const options = { databasePath: path, snapshots: { days: 14, directory: snapshots } }
    migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST, SECOND, THIRD]) })
    const before = fingerprint(path)

    const failing = migrations([FIRST, SECOND, THIRD, BAD])
    let thrown: unknown
    try {
      migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: failing })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(SafeMigrationError)
    const error = thrown as SafeMigrationError
    expect(error.name).toBe('MigrationError')
    expect(error.message).toMatch(/^Migration 4 \(bad\) failed and was rolled back: /)
    expect(error.message).toContain(`A snapshot of the database from before this attempt was kept: ${error.snapshot!.file}`)

    // Untouched: the same tables, the same rows, the same history. The half-made table of the failed file does not exist.
    expect(fingerprint(path)).toEqual(before)
    expect(db.get("SELECT name FROM sqlite_master WHERE name = 'half_done'")).toBeUndefined()
    expect(migrationStatus(db, failing)).toMatchObject({ current: 3, pending: 1 })
    // The snapshot is there, whole, and is the same state.
    expect(listSnapshots(snapshots).map((entry) => entry.file)).toEqual([error.snapshot!.file])
    expect(fingerprint(join(snapshots, error.snapshot!.file))).toEqual(before)
  })

  it('with several pending: the ones before it stay applied, the failing one leaves no trace, and the snapshot holds the state before all of them', () => {
    const home = temp()
    const { db, path } = database(home)
    const snapshots = join(home, 'snapshots')
    const options = { databasePath: path, snapshots: { days: 14, directory: snapshots } }
    migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST]) })
    const atOne = fingerprint(path)

    expect(() => migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST, SECOND, THIRD, BAD]) })).toThrow(SafeMigrationError)
    expect(migrationStatus(db, migrations([FIRST, SECOND, THIRD, BAD]))).toMatchObject({ current: 3 })
    expect(db.get("SELECT name FROM sqlite_master WHERE name = 'half_done'")).toBeUndefined()
    const [snapshot] = listSnapshots(snapshots)
    expect(snapshot).toMatchObject({ from: 1, to: 4 })
    expect(fingerprint(join(snapshots, snapshot.file))).toEqual(atOne)

    // Going back is a file copy by a person, with the server stopped: the copy is a database that starts at the old version and can migrate again.
    const restored = join(temp(), 'restored.sqlite')
    copyFileSync(join(snapshots, snapshot.file), restored)
    const back = new Database(restored)
    open.push(back)
    expect(migrationStatus(back, migrations([FIRST, SECOND, THIRD]))).toMatchObject({ current: 1, pending: 2 })
    expect(migrate(back, clock(), migrations([FIRST, SECOND, THIRD]))).toEqual([2, 3])
  })

  it('is still a plain MigrationError for a migration that fails without a snapshot (nothing to protect, or switched off)', () => {
    const home = temp()
    const { db, path } = database(home)
    expect(() => migrateWithSnapshot(db, clock(), { databasePath: path, snapshots: { days: 14, directory: join(home, 's') }, migrationsDirectory: migrations([FIRST, BAD.map((part, i) => (i === 0 ? '0002_bad.sql' : part)) as [string, string]]) })).toThrow(MigrationError)
    expect(db.get("SELECT name FROM sqlite_master WHERE name = 'half_done'")).toBeUndefined()
  })

  it('keeps the old snapshots when a migration fails, and does not prune after a failure', () => {
    const home = temp()
    const { db, path } = database(home)
    const snapshots = join(home, 'snapshots')
    const options = { databasePath: path, snapshots: { days: 1, directory: snapshots } }
    migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST]) })
    migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST, SECOND]) })
    const [old] = listSnapshots(snapshots)
    const longAgo = new Date('2026-10-01T00:00:00Z')
    utimesSync(join(snapshots, old.file), longAgo, longAgo)
    expect(() => migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST, SECOND, ['0003_bad.sql', BAD[1]]]) })).toThrow(SafeMigrationError)
    expect(listSnapshots(snapshots)).toHaveLength(2)
  })

  it('stops BEFORE migrating when the snapshot cannot be written, and changes nothing', () => {
    const home = temp()
    const { db, path } = database(home)
    const blocked = join(home, 'a-file-where-the-folder-should-be')
    writeFileSync(blocked, 'x')
    const options = { databasePath: path, snapshots: { days: 14, directory: blocked } }
    migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST]) })
    const before = fingerprint(path)
    let thrown: unknown
    try {
      migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST, SECOND]) })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(SnapshotError)
    expect((thrown as SnapshotError).reason).toBe('write')
    expect((thrown as SnapshotError).message).toMatch(/nothing was migrated.*MIGRATION_SNAPSHOT_DAYS=0/)
    expect(fingerprint(path)).toEqual(before)
  })
})

describe('keeping the snapshots', () => {
  const make = (directory: string, name: string, ageDays: number) => {
    mkdirSync(directory, { recursive: true })
    const path = join(directory, name)
    writeFileSync(path, 'x')
    const when = new Date(Date.parse('2026-11-16T10:00:00.000Z') - ageDays * 86_400_000)
    utimesSync(path, when, when)
  }

  it('removes snapshots older than the retention, always keeps the newest, and touches no other file', () => {
    const directory = join(temp(), 'snapshots')
    make(directory, 'pre-v1-to-v2-20261001T000000Z.sqlite', 46)
    make(directory, 'pre-v2-to-v3-20261101T000000Z.sqlite', 15)
    make(directory, 'pre-v3-to-v4-20261110T000000Z.sqlite', 6)
    make(directory, 'notes.txt', 400)
    make(directory, 'pre-evil.sqlite', 400)
    make(directory, 'pre-v1-to-v2-20261001T000000Z.sqlite.bak', 400)
    expect(pruneSnapshots(directory, 14, clock()).sort()).toEqual(['pre-v1-to-v2-20261001T000000Z.sqlite', 'pre-v2-to-v3-20261101T000000Z.sqlite'])
    expect(readdirSync(directory).sort()).toEqual(['notes.txt', 'pre-evil.sqlite', 'pre-v1-to-v2-20261001T000000Z.sqlite.bak', 'pre-v3-to-v4-20261110T000000Z.sqlite'])
  })

  it('keeps the newest snapshot however old it is, and removes nothing when retention is 0 (off) or there are none', () => {
    const directory = join(temp(), 'snapshots')
    make(directory, 'pre-v1-to-v2-20250101T000000Z.sqlite', 300)
    make(directory, 'pre-v2-to-v3-20250201T000000Z.sqlite', 290)
    expect(pruneSnapshots(directory, 14, clock())).toEqual(['pre-v1-to-v2-20250101T000000Z.sqlite'])
    expect(listSnapshots(directory).map((entry) => entry.file)).toEqual(['pre-v2-to-v3-20250201T000000Z.sqlite'])
    expect(pruneSnapshots(directory, 0, clock())).toEqual([])
    expect(pruneSnapshots(join(temp(), 'nowhere'), 14, clock())).toEqual([])
  })

  it('prunes after a successful migration, with the retention from the configuration', () => {
    const home = temp()
    const { db, path } = database(home)
    const snapshots = join(home, 'snapshots')
    make(snapshots, 'pre-v1-to-v2-20260101T000000Z.sqlite', 100)
    make(snapshots, 'pre-v2-to-v3-20260201T000000Z.sqlite', 90)
    const options = { databasePath: path, snapshots: { days: 30, directory: snapshots } }
    // Pruning happens after every successful start, snapshot or not: the first run removes the oldest and keeps the newest of the old ones…
    const first = migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST]) })
    expect(first.pruned).toEqual(['pre-v1-to-v2-20260101T000000Z.sqlite'])
    // …and once a new snapshot exists, that one is the newest and the last old one goes.
    const result = migrateWithSnapshot(db, clock(), { ...options, migrationsDirectory: migrations([FIRST, SECOND]) })
    expect(result.pruned).toEqual(['pre-v2-to-v3-20260201T000000Z.sqlite'])
    expect(listSnapshots(snapshots).map((entry) => entry.file)).toEqual([result.snapshot!.file])
  })
})

describe('upgrading a database made by an older version of this application', () => {
  it('copies the real migration files up to version 9, fills the database, then upgrades it to the latest with a snapshot of version 9', () => {
    const home = temp()
    const older = temp('cc-older-')
    for (const migration of readMigrations(MIGRATIONS_DIRECTORY)) if (migration.version <= 9) copyFileSync(join(MIGRATIONS_DIRECTORY, `${String(migration.version).padStart(4, '0')}_${migration.name}.sql`), join(older, `${String(migration.version).padStart(4, '0')}_${migration.name}.sql`))
    const { db, path } = database(home)
    expect(migrate(db, clock(), older)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    db.run("INSERT INTO settings (key, value, updated_at) VALUES ('upgrade.drill', 'kept', '2026-11-16T00:00:00.000Z')")
    const before = fingerprint(path)

    const snapshots = join(home, 'migration-snapshots')
    const result = migrateWithSnapshot(db, clock(), { databasePath: path, snapshots: { days: 14, directory: snapshots } })
    const latest = readMigrations(MIGRATIONS_DIRECTORY).at(-1)!.version
    expect(result.applied).toEqual(readMigrations(MIGRATIONS_DIRECTORY).filter((migration) => migration.version > 9).map((migration) => migration.version))
    expect(result.snapshot).toMatchObject({ from: 9, to: latest })
    expect(fingerprint(join(snapshots, result.snapshot!.file))).toEqual(before)
    expect(migrationStatus(db)).toMatchObject({ current: latest, pending: 0 })
    expect(db.get("SELECT value FROM settings WHERE key = 'upgrade.drill'")).toEqual({ value: 'kept' })
    expect(readFileSync(join(snapshots, result.snapshot!.file)).subarray(0, 15).toString('latin1')).toBe('SQLite format 3')
  })
})
