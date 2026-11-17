import type { Config } from '../../config.ts'
import type { Database } from '../../db/database.ts'
import { iso, type Clock } from '../../lib/time.ts'

/**
 * `backup_runs`: what the server remembers about its own backups, so that "is there a recent backup?" is a question with an answer
 * (the administration shows it, the start-up catch-up decides by it). Facts about a backup only: counts, sizes, hashes, a category
 * for a failure. Never a credential, never an answer's text, never a path.
 */

export type BackupTrigger = 'scheduled' | 'startup' | 'manual'

/** A backup older than this is "stale": the daily run (24 h) plus a day's worth of slack for it to run late and be retried. */
export const STALE_AFTER_HOURS = 30
/** A start-up with no successful backup in this long makes one (once, a minute after start). */
export const CATCH_UP_AFTER_HOURS = 24

const HOUR = 3_600_000

export interface BackupRunRow {
  id: number
  run_trigger: BackupTrigger
  status: 'running' | 'success' | 'failed'
  started_at: string
  finished_at: string | null
  folder: string | null
  file_count: number
  total_bytes: number
  database_sha256: string | null
  manifest_sha256: string | null
  encrypted: number
  error_category: string | null
  http_status: number | null
}

export interface RunSummary {
  folder: string
  fileCount: number
  totalBytes: number
  databaseSha256: string
  manifestSha256: string
  encrypted: boolean
}

export function beginRun(db: Database, clock: Clock, trigger: BackupTrigger): number {
  return db.run("INSERT INTO backup_runs (run_trigger, status, started_at) VALUES (?, 'running', ?)", [trigger, iso(clock.now())]).lastInsertRowid
}

export function completeRun(db: Database, clock: Clock, id: number, summary: RunSummary): void {
  db.run("UPDATE backup_runs SET status = 'success', finished_at = ?, folder = ?, file_count = ?, total_bytes = ?, database_sha256 = ?, manifest_sha256 = ?, encrypted = ?, error_category = NULL, http_status = NULL WHERE id = ?", [
    iso(clock.now()),
    summary.folder,
    summary.fileCount,
    summary.totalBytes,
    summary.databaseSha256,
    summary.manifestSha256,
    summary.encrypted ? 1 : 0,
    id,
  ])
}

export function failRun(db: Database, clock: Clock, id: number, category: string, httpStatus: number | null): void {
  db.run("UPDATE backup_runs SET status = 'failed', finished_at = ?, error_category = ?, http_status = ? WHERE id = ?", [iso(clock.now()), category, httpStatus, id])
}

/** A run still marked running when the process starts did not finish: the process stopped in the middle of it. */
export function recoverInterrupted(db: Database, clock: Clock): number {
  return db.run("UPDATE backup_runs SET status = 'failed', finished_at = ?, error_category = 'interrupted' WHERE status = 'running'", [iso(clock.now())]).changes
}

export function lastSuccess(db: Database): BackupRunRow | undefined {
  return db.get<BackupRunRow>("SELECT * FROM backup_runs WHERE status = 'success' ORDER BY finished_at DESC, id DESC LIMIT 1")
}

export function lastAttempt(db: Database): BackupRunRow | undefined {
  return db.get<BackupRunRow>('SELECT * FROM backup_runs ORDER BY started_at DESC, id DESC LIMIT 1')
}

/** Keeps the table small: the newest `keep` rows. */
export function pruneRuns(db: Database, keep = 200): number {
  return db.run('DELETE FROM backup_runs WHERE id NOT IN (SELECT id FROM backup_runs ORDER BY id DESC LIMIT ?)', [keep]).changes
}

export type BackupState = 'disabled' | 'never' | 'ok' | 'stale' | 'running'

export interface BackupStatus {
  enabled: boolean
  /** Backups are encrypted before they leave the server. */
  encrypted: boolean
  state: BackupState
  staleAfterHours: number
  lastSuccess: { finishedAt: string; ageHours: number; folder: string | null; fileCount: number; totalBytes: number; databaseSha256: string | null; manifestSha256: string | null; encrypted: boolean; trigger: BackupTrigger } | null
  lastAttempt: { status: 'running' | 'success' | 'failed'; startedAt: string; finishedAt: string | null; errorCategory: string | null; httpStatus: number | null; trigger: BackupTrigger } | null
}

/** What the administration shows: the latest success and its age, the latest attempt, and one word for where it stands. */
export function backupStatus(db: Database, config: Config, clock: Clock, running: boolean): BackupStatus {
  const success = lastSuccess(db)
  const attempt = lastAttempt(db)
  const now = clock.now().getTime()
  const age = success?.finished_at ? Math.max(0, (now - Date.parse(success.finished_at)) / HOUR) : null
  const state: BackupState = !config.backup.enabled ? 'disabled' : running ? 'running' : success === undefined ? 'never' : age !== null && age > STALE_AFTER_HOURS ? 'stale' : 'ok'
  return {
    enabled: config.backup.enabled,
    encrypted: config.backup.encryptionKey !== null,
    state,
    staleAfterHours: STALE_AFTER_HOURS,
    lastSuccess:
      success && success.finished_at
        ? { finishedAt: success.finished_at, ageHours: Math.round((age ?? 0) * 10) / 10, folder: success.folder, fileCount: success.file_count, totalBytes: success.total_bytes, databaseSha256: success.database_sha256, manifestSha256: success.manifest_sha256, encrypted: success.encrypted === 1, trigger: success.run_trigger }
        : null,
    lastAttempt: attempt ? { status: attempt.status, startedAt: attempt.started_at, finishedAt: attempt.finished_at, errorCategory: attempt.error_category, httpStatus: attempt.http_status, trigger: attempt.run_trigger } : null,
  }
}

export interface CatchUpDecision {
  run: boolean
  reason: 'recent_success' | 'recent_attempt' | 'scheduled_soon' | 'needed'
}

/**
 * Whether a start-up should make a backup now. Not when there is a successful one in the last 24 hours; not when an attempt failed (or is
 * running) within the last hour, so that a server that keeps restarting does not hammer the destination and the owner's inbox; not when
 * the daily run is due within ten minutes anyway.
 */
export function shouldCatchUp(options: { lastSuccessAt: string | null; lastAttempt: { status: string; startedAt: string } | null; now: Date; hourUtc: number }): CatchUpDecision {
  const now = options.now.getTime()
  if (options.lastSuccessAt && now - Date.parse(options.lastSuccessAt) < CATCH_UP_AFTER_HOURS * HOUR) return { run: false, reason: 'recent_success' }
  const attempt = options.lastAttempt
  if (attempt && (attempt.status === 'running' || attempt.status === 'failed') && now - Date.parse(attempt.startedAt) < HOUR) return { run: false, reason: 'recent_attempt' }
  const next = new Date(options.now)
  next.setUTCHours(options.hourUtc, 0, 0, 0)
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1)
  if (next.getTime() - now < 10 * 60_000) return { run: false, reason: 'scheduled_soon' }
  return { run: true, reason: 'needed' }
}
