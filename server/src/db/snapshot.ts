import { existsSync, mkdirSync, readdirSync, rmSync, statSync, statfsSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Clock } from '../lib/time.ts'
import type { Database } from './database.ts'
import { MIGRATIONS_DIRECTORY, MigrationError, migrate, migrationStatus } from './migrate.ts'

/**
 * A copy of the database taken just before pending migrations are applied to it, so that a migration that goes wrong has something to
 * go back to. `VACUUM INTO` makes a consistent copy of the live database (WAL included) while the server runs; the copy is opened and
 * checked before anything is migrated, and an unusable copy stops the migration instead of being trusted.
 *
 * The migration runner already applies each migration in a transaction of its own, so a migration that fails leaves the database exactly
 * as it was before THAT migration. The snapshot covers the rest: a migration that succeeds but turns out wrong, and a batch of several
 * where an earlier one already ran. Restoring is a file copy done by a person, with the server stopped (docs/operations/RESTORE_DRILL.md);
 * nothing here ever overwrites the live database.
 *
 * Snapshots are named `pre-v<from>-to-v<to>-<time>.sqlite`, kept `days` days (`MIGRATION_SNAPSHOT_DAYS`, 0 = switched off), and the newest
 * is always kept, whatever its age. Only files with that name are ever removed.
 */

const NAME = /^pre-v(\d+)-to-v(\d+)-(\d{8}T\d{6}Z)(?:-(\d+))?\.sqlite$/
const DAY_MS = 86_400_000

export type SnapshotFailure = 'disk_space' | 'write' | 'verify'

export class SnapshotError extends Error {
  readonly reason: SnapshotFailure
  constructor(reason: SnapshotFailure) {
    super(
      reason === 'disk_space'
        ? 'There is not enough free space to write a snapshot of the database before migrating. Free some space, or set MIGRATION_SNAPSHOT_DAYS=0 to migrate without a snapshot (not recommended).'
        : reason === 'verify'
          ? 'The snapshot of the database taken before migrating did not pass its own check, so nothing was migrated.'
          : 'A snapshot of the database could not be written before migrating, so nothing was migrated. Set MIGRATION_SNAPSHOT_DAYS=0 to migrate without one (not recommended).',
    )
    this.name = 'SnapshotError'
    this.reason = reason
  }
}

/** A migration failed after a snapshot had been taken: the same message, and where the snapshot is. */
export class SafeMigrationError extends Error {
  readonly snapshot: SnapshotInfo | null
  constructor(original: Error, snapshot: SnapshotInfo | null) {
    super(snapshot ? `${original.message} A snapshot of the database from before this attempt was kept: ${snapshot.file} (in MIGRATION_SNAPSHOT_DIR).` : original.message)
    this.name = original.name
    this.snapshot = snapshot
  }
}

export interface SnapshotInfo {
  file: string
  bytes: number
  modifiedAt: string
  from: number
  to: number
}

export function listSnapshots(directory: string): SnapshotInfo[] {
  const found: SnapshotInfo[] = []
  let files: string[]
  try {
    if (!existsSync(directory)) return []
    files = readdirSync(directory)
  } catch {
    // A folder that cannot be read (it is a file, or not allowed) has no snapshots to list, and listing must never stop a start-up.
    return []
  }
  for (const file of files) {
    const match = NAME.exec(file)
    if (!match) continue
    const stat = statSync(join(directory, file))
    found.push({ file, bytes: stat.size, modifiedAt: new Date(stat.mtimeMs).toISOString(), from: Number(match[1]), to: Number(match[2]) })
  }
  return found.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || b.file.localeCompare(a.file))
}

/** Removes snapshots older than `days`, except the newest one. Returns the names removed. */
export function pruneSnapshots(directory: string, days: number, clock: Clock): string[] {
  if (days <= 0) return []
  const cutoff = clock.now().getTime() - days * DAY_MS
  const [newest, ...older] = listSnapshots(directory)
  if (!newest) return []
  const removed: string[] = []
  for (const snapshot of older) {
    if (Date.parse(snapshot.modifiedAt) < cutoff) {
      rmSync(join(directory, snapshot.file), { force: true })
      removed.push(snapshot.file)
    }
  }
  return removed
}

const stamp = (clock: Clock): string => clock.now().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')

function takeSnapshot(db: Database, clock: Clock, directory: string, from: number, to: number, migrationCount: number): SnapshotInfo {
  try {
    mkdirSync(directory, { recursive: true })
    const pages = db.get<{ page_count: number }>('PRAGMA page_count')?.page_count ?? 0
    const pageSize = db.get<{ page_size: number }>('PRAGMA page_size')?.page_size ?? 4096
    const free = statfsSync(directory)
    // A copy is about the size of the database; leave half again, and a megabyte, so that the volume is not filled to the brim.
    if (free.bavail * free.bsize < pages * pageSize * 1.5 + 1_048_576) throw new SnapshotError('disk_space')
    const base = `pre-v${from}-to-v${to}-${stamp(clock)}`
    let file = `${base}.sqlite`
    for (let n = 2; existsSync(join(directory, file)); n += 1) file = `${base}-${n}.sqlite`
    const path = join(directory, file)
    try {
      db.run('VACUUM INTO ?', [path])
      const copy = new DatabaseSync(path, { readOnly: true })
      try {
        const integrity = (copy.prepare('PRAGMA integrity_check').get() as { integrity_check?: string } | undefined)?.integrity_check
        const recorded = (copy.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n
        if (integrity !== 'ok' || recorded !== migrationCount) throw new SnapshotError('verify')
      } finally {
        copy.close()
      }
    } catch (error) {
      rmSync(path, { force: true })
      throw error instanceof SnapshotError ? error : new SnapshotError('write')
    }
    const stat = statSync(path)
    return { file, bytes: stat.size, modifiedAt: new Date(stat.mtimeMs).toISOString(), from, to }
  } catch (error) {
    throw error instanceof SnapshotError ? error : new SnapshotError('write')
  }
}

export interface MigrateSafelyOptions {
  /** The database file; `:memory:` has nothing to protect. */
  databasePath: string
  snapshots: { days: number; directory: string }
  /** For tests: another folder of migrations. */
  migrationsDirectory?: string
}

export interface MigrateSafelyResult {
  applied: number[]
  /** The snapshot taken before this run, if there was a reason to take one. */
  snapshot: SnapshotInfo | null
  /** Old snapshots removed afterwards. */
  pruned: string[]
}

/**
 * Brings the schema up to date, with a snapshot first when there is something to protect: an existing database (one with a migration
 * history) that has migrations pending. A fresh database has nothing to lose, and a current one nothing to migrate. If a migration fails
 * the error says where the snapshot is, and the old snapshots are left alone.
 */
export function migrateWithSnapshot(db: Database, clock: Clock, options: MigrateSafelyOptions): MigrateSafelyResult {
  const directory = options.migrationsDirectory ?? MIGRATIONS_DIRECTORY
  const status = migrationStatus(db, directory)
  const history = db.get<{ n: number }>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")?.n === 1 ? (db.get<{ n: number }>('SELECT COUNT(*) AS n FROM schema_migrations')?.n ?? 0) : 0
  let snapshot: SnapshotInfo | null = null
  if (status.pending > 0 && history > 0 && options.databasePath !== ':memory:' && options.snapshots.days > 0) {
    snapshot = takeSnapshot(db, clock, options.snapshots.directory, status.current, status.latest, history)
  }
  let applied: number[]
  try {
    applied = migrate(db, clock, directory)
  } catch (error) {
    // With no snapshot there is nothing to point at: the runner's own error, unchanged.
    throw error instanceof MigrationError && snapshot ? new SafeMigrationError(error, snapshot) : error
  }
  const pruned = options.databasePath !== ':memory:' ? pruneSnapshots(options.snapshots.directory, options.snapshots.days, clock) : []
  return { applied, snapshot, pruned }
}
