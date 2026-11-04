import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Database } from './database.ts'
import { sha256Hex } from '../lib/crypto.ts'
import { iso, type Clock } from '../lib/time.ts'

/**
 * Schema changes as numbered SQL files (`0001_init.sql`, `0002_...`), applied in order, each in its own
 * transaction and recorded with a checksum. A migration that fails leaves the database exactly as it was
 * before that file; one that was changed after it was applied, or a database newer than the code, stops
 * the server from starting: a schema must never be guessed at.
 */

export const MIGRATIONS_DIRECTORY = join(import.meta.dirname, 'migrations')

/** `-- migration: foreign-keys-off` on a line of its own, for a migration that rebuilds a table. */
const FOREIGN_KEYS_OFF = /^--\s*migration:\s*foreign-keys-off\s*$/m

export class MigrationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MigrationError'
  }
}

export interface MigrationFile {
  version: number
  name: string
  sql: string
  checksum: string
}

export function readMigrations(directory = MIGRATIONS_DIRECTORY): MigrationFile[] {
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.sql'))
    .sort()
  const seen = new Set<number>()
  return files.map((file) => {
    const match = /^(\d{4})_([a-z0-9_]+)\.sql$/.exec(file)
    if (!match) throw new MigrationError(`Migration file "${file}" must be named like 0001_name.sql.`)
    const version = Number(match[1])
    if (seen.has(version)) throw new MigrationError(`Two migrations have the version ${version}.`)
    seen.add(version)
    const sql = readFileSync(join(directory, file), 'utf8')
    return { version, name: match[2], sql, checksum: sha256Hex(sql.replace(/\r\n/g, '\n')) }
  })
}

const ENSURE_TABLE = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`

export interface MigrationStatus {
  current: number
  latest: number
  pending: number
}

export function migrationStatus(db: Database, directory = MIGRATIONS_DIRECTORY): MigrationStatus {
  const files = readMigrations(directory)
  const table = db.get<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
  const applied = table ? db.all<{ version: number }>('SELECT version FROM schema_migrations ORDER BY version') : []
  const current = applied.length > 0 ? applied[applied.length - 1].version : 0
  const latest = files.length > 0 ? files[files.length - 1].version : 0
  return { current, latest, pending: files.filter((file) => !applied.some((row) => row.version === file.version)).length }
}

/** Applies what is pending and returns the versions it applied. */
export function migrate(db: Database, clock: Clock, directory = MIGRATIONS_DIRECTORY): number[] {
  const files = readMigrations(directory)
  db.exec(ENSURE_TABLE)
  const applied = new Map(db.all<{ version: number; checksum: string }>('SELECT version, checksum FROM schema_migrations').map((row) => [row.version, row.checksum]))

  const known = new Set(files.map((file) => file.version))
  for (const version of applied.keys()) {
    if (!known.has(version)) throw new MigrationError(`The database has migration ${version}, which this version of the server does not know. Refusing to start on a newer schema.`)
  }
  for (const file of files) {
    const checksum = applied.get(file.version)
    if (checksum !== undefined && checksum !== file.checksum) {
      throw new MigrationError(`Migration ${file.version} (${file.name}) was changed after it was applied. Add a new migration instead of editing an old one.`)
    }
  }

  const done: number[] = []
  for (const file of files) {
    if (applied.has(file.version)) continue
    // SQLite cannot change a CHECK constraint in place: the table is rebuilt (create new, copy, drop old, rename), and
    // dropping a table that others refer to would cascade into them while foreign keys are enforced. A migration that
    // rebuilds a table says so on a comment line, and the runner follows SQLite's documented procedure: foreign keys
    // off around the transaction (the pragma does nothing inside one), a foreign-key check before it commits.
    const rebuilds = FOREIGN_KEYS_OFF.test(file.sql)
    if (rebuilds) db.exec('PRAGMA foreign_keys = OFF')
    try {
      db.transaction(() => {
        db.exec(file.sql)
        if (rebuilds) {
          const broken = db.all('PRAGMA foreign_key_check')
          if (broken.length > 0) throw new Error(`${broken.length} row(s) would break a foreign key`)
        }
        db.run('INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)', [file.version, file.name, file.checksum, iso(clock.now())])
      })
    } catch (error) {
      throw new MigrationError(`Migration ${file.version} (${file.name}) failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      if (rebuilds) db.exec('PRAGMA foreign_keys = ON')
    }
    done.push(file.version)
  }
  return done
}
