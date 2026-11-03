import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync, type StatementSync } from 'node:sqlite'
import { ConstraintError, DatabaseUnavailableError } from '../http/errors.ts'

/**
 * The only file that knows which database engine is underneath. Everything else calls `run`, `get`, `all`
 * and `transaction` with SQL and parameters, so another engine (better-sqlite3, PostgreSQL) is a change to
 * this file and to the few engine-specific statements in the migrations.
 *
 * Values are bound as parameters, never joined into SQL text. `undefined` is refused (it would be a bug at the
 * call site), booleans are stored as 0 and 1, and a row comes back as a plain object.
 */

export type Param = string | number | bigint | null | boolean | Uint8Array | undefined
export type Params = readonly Param[]

export interface RunResult {
  changes: number
  lastInsertRowid: number
}

// SQLite result codes the application distinguishes (the extended codes are the primary one plus 256 * n).
const SQLITE_CONSTRAINT = 19
const SQLITE_BUSY = 5
const SQLITE_LOCKED = 6
const SQLITE_IOERR = 10
const SQLITE_CANTOPEN = 14
const SQLITE_READONLY = 8
const SQLITE_FULL = 13

function bind(params: Params): (string | number | bigint | null | Uint8Array)[] {
  return params.map((value) => {
    if (value === undefined) throw new TypeError('A query parameter is undefined.')
    if (typeof value === 'boolean') return value ? 1 : 0
    return value
  })
}

function translate(error: unknown): unknown {
  if (!(error instanceof Error)) return error
  const e = error as Error & { code?: string; errcode?: number; errstr?: string }
  if (e.code === 'ERR_INVALID_STATE' && /not open/i.test(e.message)) return new DatabaseUnavailableError()
  if (e.code === 'ERR_SQLITE_ERROR' && typeof e.errcode === 'number') {
    const primary = e.errcode & 0xff
    if (primary === SQLITE_CONSTRAINT) {
      const text = e.message.toLowerCase()
      const kind = text.startsWith('unique constraint') ? 'unique' : text.startsWith('foreign key constraint') ? 'foreign_key' : text.startsWith('not null constraint') ? 'not_null' : text.startsWith('check constraint') ? 'check' : 'other'
      return new ConstraintError(kind, e.message)
    }
    if ([SQLITE_BUSY, SQLITE_LOCKED, SQLITE_IOERR, SQLITE_CANTOPEN, SQLITE_READONLY, SQLITE_FULL].includes(primary)) {
      return new DatabaseUnavailableError(e.message)
    }
  }
  return error
}

export class Database {
  readonly path: string
  private readonly db: DatabaseSync
  private readonly statements = new Map<string, StatementSync>()
  private depth = 0
  private closed = false

  constructor(path: string) {
    this.path = path
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA foreign_keys = ON')
    this.db.exec('PRAGMA busy_timeout = 5000')
    if (path !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL')
      this.db.exec('PRAGMA synchronous = NORMAL')
    }
  }

  get isOpen(): boolean {
    return !this.closed && this.db.isOpen
  }

  private prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql)
    if (!statement) {
      statement = this.db.prepare(sql)
      this.statements.set(sql, statement)
    }
    return statement
  }

  private guard<T>(work: () => T): T {
    if (this.closed) throw new DatabaseUnavailableError()
    try {
      return work()
    } catch (error) {
      throw translate(error)
    }
  }

  exec(sql: string): void {
    this.guard(() => this.db.exec(sql))
  }

  run(sql: string, params: Params = []): RunResult {
    return this.guard(() => {
      const result = this.prepare(sql).run(...bind(params))
      return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) }
    })
  }

  get<T = Record<string, unknown>>(sql: string, params: Params = []): T | undefined {
    return this.guard(() => {
      const row = this.prepare(sql).get(...bind(params))
      return row === undefined ? undefined : ({ ...row } as T)
    })
  }

  all<T = Record<string, unknown>>(sql: string, params: Params = []): T[] {
    return this.guard(() => this.prepare(sql).all(...bind(params)).map((row) => ({ ...row }) as T))
  }

  /**
   * Runs `work` in a transaction: all of it happens or none of it. The function must be synchronous, which is
   * what keeps the server single-writer and race-free (nothing else runs between its statements). A nested call
   * joins the outer transaction through a savepoint.
   */
  transaction<T>(work: () => T): T {
    const nested = this.depth > 0
    const name = `sp_${this.depth}`
    this.guard(() => this.db.exec(nested ? `SAVEPOINT ${name}` : 'BEGIN IMMEDIATE'))
    this.depth += 1
    try {
      const result = work()
      if (result instanceof Promise) throw new TypeError('A transaction function must be synchronous.')
      this.depth -= 1
      this.guard(() => this.db.exec(nested ? `RELEASE ${name}` : 'COMMIT'))
      return result
    } catch (error) {
      this.depth -= 1
      try {
        this.db.exec(nested ? `ROLLBACK TO ${name}; RELEASE ${name}` : 'ROLLBACK')
      } catch {
        // The connection itself is gone; there is nothing left to undo.
      }
      throw error
    }
  }

  /** A cheap round trip, for the readiness check. */
  ping(): boolean {
    try {
      this.guard(() => this.db.prepare('SELECT 1').get())
      return true
    } catch {
      return false
    }
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.statements.clear()
    try {
      this.db.close()
    } catch {
      // Already closed.
    }
  }
}
