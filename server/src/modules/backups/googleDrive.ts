import { createHash } from 'node:crypto'
import type { Config } from '../../config.ts'
import type { Database } from '../../db/database.ts'
import type { Logger } from '../../lib/logger.ts'
import { systemClock, type Clock } from '../../lib/time.ts'
import type { Mailer } from '../notifications/mailer.ts'
import { createBackupSet, ENCRYPTED_SUFFIX, type BackupFile } from './artifacts.ts'
import { BackupCryptoError } from './crypto.ts'
import { BackupError } from './errors.ts'
import { beginRun, completeRun, failRun, lastAttempt, lastSuccess, pruneRuns, recoverInterrupted, shouldCatchUp, type BackupTrigger } from './records.ts'

type DriveFile = { id: string; name: string; size?: string; md5Checksum?: string }
type DrivePage = { files?: DriveFile[]; nextPageToken?: string }
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export interface BackupOptions {
  config: Config
  db: Database
  log: Logger
  mailer: Mailer | null
  fetchImpl?: typeof fetch
  /** The server's clock (the records and the dated folder use it); tests move it by hand. */
  clock?: Clock
}

const q = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

/** The one backup that may run at a time, whoever started it (the daily timer, the start-up catch-up, a test). */
let active: Promise<void> | null = null
export const backupRunning = (): boolean => active !== null

function toBackupError(error: unknown): BackupError {
  if (error instanceof BackupError) return error
  if (error instanceof BackupCryptoError) return new BackupError('encryption')
  return new BackupError('internal')
}

export interface BackupResult {
  folder: string
  /** Database and pictures (the manifest is not counted). */
  files: number
  /** What was stored, after encryption if there is a key. */
  bytes: number
  databaseSha256: string
  manifestSha256: string
  encrypted: boolean
}

/**
 * The automatic Google Drive backup. One run: a consistent snapshot of the database and the pictures (artifacts.ts), each stored in the
 * day's folder, then a manifest. A file is uploaded FIRST and checked against what Drive reports (size and MD5), and only then are the
 * earlier copies of the same file (a second run on the same day) deleted, so a failed upload never costs the backup that was there. A
 * run is recorded (records.ts) with its counts and hashes, and its failure as a category. Dated folders older than the retention are
 * removed only after a successful run.
 */
export class GoogleDriveBackup {
  private readonly fetcher: typeof fetch
  private tokenValue = ''
  private tokenUntil = 0
  private readonly options: BackupOptions
  private readonly clock: Clock

  constructor(options: BackupOptions) {
    this.options = options
    this.fetcher = options.fetchImpl ?? fetch
    this.clock = options.clock ?? systemClock
  }

  private async call(url: string, init: RequestInit, auth = false): Promise<Response> {
    let response: Response
    try {
      response = await this.fetcher(url, init)
    } catch {
      // What the network layer said is dropped: it can quote an address.
      throw new BackupError('drive_network')
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new BackupError(auth ? 'drive_auth' : 'drive_http', response.status)
    }
    return response
  }

  private async token(): Promise<string> {
    if (this.tokenValue && this.clock.now().getTime() < this.tokenUntil - 60_000) return this.tokenValue
    const c = this.options.config.backup
    const response = await this.call(
      TOKEN_URL,
      { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: 'refresh_token' }) },
      true,
    )
    const data = (await response.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null
    if (!data || typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') throw new BackupError('drive_auth', response.status)
    this.tokenValue = data.access_token
    this.tokenUntil = this.clock.now().getTime() + data.expires_in * 1000
    return this.tokenValue
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.call(`${API}/${path}`, { ...init, headers: { authorization: `Bearer ${await this.token()}`, ...(init.headers ?? {}) } })
    if (response.status === 204) return {} as T
    return (await response.json()) as T
  }

  private async list(query: string): Promise<DriveFile[]> {
    const result: DriveFile[] = []
    let pageToken = ''
    do {
      const params = new URLSearchParams({ q: query, fields: 'nextPageToken,files(id,name)', pageSize: '1000' })
      if (pageToken) params.set('pageToken', pageToken)
      const page = await this.api<DrivePage>(`files?${params}`)
      result.push(...(page.files ?? []))
      pageToken = page.nextPageToken ?? ''
    } while (pageToken)
    return result
  }

  private async folder(name: string, parent?: string): Promise<string> {
    const query = [`name='${q(name)}'`, "mimeType='application/vnd.google-apps.folder'", 'trashed=false', ...(parent ? [`'${q(parent)}' in parents`] : [])].join(' and ')
    const existing = await this.list(query)
    if (existing[0]) return existing[0].id
    const made = await this.api<DriveFile>('files', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }),
    })
    return made.id
  }

  private async upload(parent: string, name: string, mimeType: string, data: Uint8Array): Promise<DriveFile> {
    const boundary = `portfolio-${createHash('sha256').update(name).digest('hex').slice(0, 16)}`
    const metadata = JSON.stringify({ name, parents: [parent] })
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      Buffer.from(data),
      Buffer.from(`\r\n--${boundary}--`),
    ])
    const response = await this.call(`${UPLOAD}?uploadType=multipart&fields=id,name,size,md5Checksum`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await this.token()}`, 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    })
    return (await response.json()) as DriveFile
  }

  /**
   * Stores one file: upload, check what Drive says it holds (size, and MD5 when it says one) against what was sent, and only then delete
   * the earlier copies of the same file (with or without the `.enc` suffix: a day that was backed up before encryption was switched on
   * must not keep a clear copy beside the encrypted one). A copy that is not what was sent is deleted and the run fails; the earlier
   * copies stay.
   */
  private async store(parent: string, file: BackupFile): Promise<void> {
    const earlier: string[] = []
    for (const name of [file.name, `${file.name}${ENCRYPTED_SUFFIX}`]) earlier.push(...(await this.list(`'${q(parent)}' in parents and name='${q(name)}' and trashed=false`)).map((item) => item.id))
    const mimeType = file.storedName.endsWith(ENCRYPTED_SUFFIX) ? 'application/octet-stream' : file.kind === 'manifest' ? 'application/json' : file.kind === 'database' ? 'application/vnd.sqlite3' : 'application/octet-stream'
    const uploaded = await this.upload(parent, file.storedName, mimeType, file.stored)
    const md5 = createHash('md5').update(file.stored).digest('hex')
    if ((uploaded.size !== undefined && Number(uploaded.size) !== file.stored.byteLength) || (uploaded.md5Checksum !== undefined && uploaded.md5Checksum.toLowerCase() !== md5)) {
      await this.api(`files/${uploaded.id}`, { method: 'DELETE' }).catch(() => undefined)
      throw new BackupError('integrity')
    }
    for (const id of earlier) await this.api(`files/${id}`, { method: 'DELETE' })
  }

  async run(trigger: BackupTrigger = 'scheduled'): Promise<BackupResult> {
    if (active) throw new BackupError('busy')
    const task = this.execute(trigger)
    const settled: Promise<void> = task
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        if (active === settled) active = null
      })
    active = settled
    return task
  }

  private async execute(trigger: BackupTrigger): Promise<BackupResult> {
    const { config, db, log } = this.options
    const runId = beginRun(db, this.clock, trigger)
    try {
      const date = this.clock.now().toISOString().slice(0, 10)
      const root = config.backup.folderId || (await this.folder('Portfolio Backups'))
      const day = await this.folder(date, root)
      const set = createBackupSet({ db, mediaDir: config.mediaDir, key: config.backup.encryptionKey, clock: this.clock })
      for await (const file of set.files()) await this.store(day, file)
      const summary = set.summary()
      completeRun(db, this.clock, runId, { folder: date, fileCount: summary.fileCount, totalBytes: summary.totalBytes, databaseSha256: summary.databaseSha256, manifestSha256: summary.manifestSha256, encrypted: summary.encrypted })
      pruneRuns(db)
      log.info('Google Drive backup completed', { date, files: summary.fileCount, bytes: summary.totalBytes, encrypted: summary.encrypted })
      // The backup is done and recorded: tidying old folders is separate, and its failure does not make today's backup a failed one.
      await this.retention(root, date).catch((error) => log.warn('old Google Drive backups could not be removed', { category: toBackupError(error).category }))
      return { folder: date, files: summary.fileCount, bytes: summary.totalBytes, databaseSha256: summary.databaseSha256, manifestSha256: summary.manifestSha256, encrypted: summary.encrypted }
    } catch (error) {
      const failure = toBackupError(error)
      failRun(db, this.clock, runId, failure.category, failure.httpStatus)
      throw failure
    }
  }

  private async retention(root: string, today: string): Promise<void> {
    const { config, log } = this.options
    const cutoff = new Date(this.clock.now().getTime() - config.backup.retentionDays * 86_400_000).toISOString().slice(0, 10)
    for (const old of await this.list(`'${q(root)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(old.name) && old.name < cutoff && old.name !== today) {
        // Delete the dated folder's contents explicitly; deleting a Drive folder alone can orphan its children.
        const children = await this.list(`'${q(old.id)}' in parents and trashed=false`)
        for (const child of children) await this.api(`files/${child.id}`, { method: 'DELETE' })
        await this.api(`files/${old.id}`, { method: 'DELETE' })
        log.info('old Google Drive backup removed', { date: old.name, files: children.length })
      }
    }
  }
}

async function sendFailureNotice(options: BackupOptions, error: BackupError): Promise<void> {
  const { config, mailer } = options
  if (!mailer || !config.email.from || !config.email.notifyTo) return
  const reason = `${error.message} (${error.category})`
  const safe = reason.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const date = (options.clock ?? systemClock).now()
  await mailer.send({
    from: config.email.from,
    to: config.email.notifyTo,
    replyTo: config.email.replyTo,
    subject: 'Portfolio backup failed',
    text: `The automatic Google Drive backup failed at ${date.toISOString()}.\n\nReason: ${reason}`,
    html: `<p>The automatic Google Drive backup failed at ${date.toISOString()}.</p><p>Reason: ${safe}</p>`,
    messageId: `backup-${date.getTime()}@portfolio.local`,
    date,
  })
}

/** One backup, the way the timer and the start-up catch-up make it: a failure is logged and e-mailed (a category, never an answer's text) and never thrown. */
export async function runBackup(options: BackupOptions, trigger: BackupTrigger): Promise<'ran' | 'failed' | 'busy'> {
  try {
    await new GoogleDriveBackup(options).run(trigger)
    return 'ran'
  } catch (error) {
    const failure = toBackupError(error)
    if (failure.category === 'busy') {
      options.log.info('a backup was not started: another is running')
      return 'busy'
    }
    options.log.error('Google Drive backup failed', { error: failure, category: failure.category })
    try {
      await sendFailureNotice(options, failure)
    } catch (mailError) {
      options.log.error('Google Drive backup failure notification could not be sent', { error: mailError })
    }
    return 'failed'
  }
}

export interface SchedulerExtra {
  /** After a start with no successful backup in the last 24 hours, make one (once, `catchUpDelayMs` after the start). */
  catchUp?: boolean
  catchUpDelayMs?: number
}

export type CatchUpOutcome = 'ran' | 'failed' | 'busy' | 'skipped'

export interface BackupScheduler {
  stop(): void
  /** What the catch-up came to; null when it was not asked for. */
  catchUp: Promise<CatchUpOutcome> | null
}

export function startBackupScheduler(options: BackupOptions, hourUtc: number, extra: SchedulerExtra = {}): BackupScheduler {
  const clock = options.clock ?? systemClock
  let timer: ReturnType<typeof setTimeout> | null = null
  let catchUpTimer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  // A row left running by a process that stopped in the middle of a backup is a failed attempt, not a running one.
  recoverInterrupted(options.db, clock)

  const schedule = () => {
    if (stopped) return
    const now = clock.now()
    const next = new Date(now)
    next.setUTCHours(hourUtc, 0, 0, 0)
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
    timer = setTimeout(async () => {
      try {
        await runBackup(options, 'scheduled')
      } finally {
        schedule()
      }
    }, next.getTime() - now.getTime())
    timer.unref()
  }
  schedule()

  let finishCatchUp: (outcome: CatchUpOutcome) => void = () => undefined
  const catchUp = extra.catchUp
    ? new Promise<CatchUpOutcome>((resolve) => {
        finishCatchUp = resolve
        catchUpTimer = setTimeout(async () => {
          const attempt = lastAttempt(options.db)
          const decision = shouldCatchUp({ lastSuccessAt: lastSuccess(options.db)?.finished_at ?? null, lastAttempt: attempt ? { status: attempt.status, startedAt: attempt.started_at } : null, now: clock.now(), hourUtc })
          if (!decision.run) {
            options.log.info('no catch-up backup needed', { reason: decision.reason })
            return resolve('skipped')
          }
          options.log.info('no recent backup: making one now')
          resolve(await runBackup(options, 'startup'))
        }, extra.catchUpDelayMs ?? 60_000)
        catchUpTimer.unref()
      })
    : null

  return {
    stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      if (catchUpTimer) clearTimeout(catchUpTimer)
      finishCatchUp('skipped')
    },
    catchUp,
  }
}
