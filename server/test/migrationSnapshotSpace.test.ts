import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Database } from '../src/db/database.ts'
import { SnapshotError, listSnapshots, migrateWithSnapshot } from '../src/db/snapshot.ts'
import { TestClock } from './helpers.ts'

// A volume with next to no free space: the snapshot must refuse BEFORE anything is migrated.
vi.mock('node:fs', async (importOriginal) => ({ ...(await importOriginal<typeof import('node:fs')>()), statfsSync: () => ({ bavail: 1, bsize: 512 }) }))

const folders: string[] = []
const open: Database[] = []
afterEach(() => {
  for (const db of open.splice(0)) db.close()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('a snapshot on a volume that is nearly full', () => {
  it('refuses with "disk_space", says how to proceed, changes nothing and leaves no half-written file', () => {
    const home = mkdtempSync(join(tmpdir(), 'cc-space-'))
    folders.push(home)
    const migrations = mkdtempSync(join(tmpdir(), 'cc-space-migrations-'))
    folders.push(migrations)
    writeFileSync(join(migrations, '0001_init.sql'), 'CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT);')
    const path = join(home, 'app.sqlite')
    const db = new Database(path)
    open.push(db)
    const options = { databasePath: path, snapshots: { days: 14, directory: join(home, 'snapshots') } }
    migrateWithSnapshot(db, new TestClock(), { ...options, migrationsDirectory: migrations })
    writeFileSync(join(migrations, '0002_more.sql'), 'ALTER TABLE notes ADD COLUMN done INTEGER;')

    let thrown: unknown
    try {
      migrateWithSnapshot(db, new TestClock(), { ...options, migrationsDirectory: migrations })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeInstanceOf(SnapshotError)
    expect((thrown as SnapshotError).reason).toBe('disk_space')
    expect((thrown as SnapshotError).message).toMatch(/not enough free space.*MIGRATION_SNAPSHOT_DAYS=0/)
    expect(db.all("SELECT name FROM pragma_table_info('notes')").map((row) => (row as { name: string }).name)).toEqual(['id', 'body'])
    expect(db.get('SELECT COUNT(*) AS n FROM schema_migrations')).toEqual({ n: 1 })
    expect(listSnapshots(join(home, 'snapshots'))).toEqual([])
  })
})
