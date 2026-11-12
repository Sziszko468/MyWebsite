import { createHash } from 'node:crypto'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { tmpdir } from 'node:os'
import type { Config } from '../../config.ts'
import type { Database } from '../../db/database.ts'
import type { Logger } from '../../lib/logger.ts'
import type { Mailer } from '../notifications/mailer.ts'

type DriveFile = { id: string; name: string }
type DrivePage = { files?: DriveFile[]; nextPageToken?: string }
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files'

export interface BackupOptions {
  config: Config
  db: Database
  log: Logger
  mailer: Mailer | null
  fetchImpl?: typeof fetch
}

const q = (value: string) => value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Google Drive HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`)
  if (response.status === 204) return {} as T
  return response.json() as Promise<T>
}

export class GoogleDriveBackup {
  private readonly fetcher: typeof fetch
  private tokenValue = ''
  private tokenUntil = 0
  private readonly options: BackupOptions

  constructor(options: BackupOptions) {
    this.options = options
    this.fetcher = options.fetchImpl ?? fetch
  }

  private async token(): Promise<string> {
    if (this.tokenValue && Date.now() < this.tokenUntil - 60_000) return this.tokenValue
    const c = this.options.config.backup
    const r = await this.fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: c.clientId, client_secret: c.clientSecret, refresh_token: c.refreshToken, grant_type: 'refresh_token' }),
    })
    const data = await responseJson<{ access_token: string; expires_in: number }>(r)
    this.tokenValue = data.access_token
    this.tokenUntil = Date.now() + data.expires_in * 1000
    return this.tokenValue
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    return responseJson<T>(await this.fetcher(`${API}/${path}`, {
      ...init, headers: { authorization: `Bearer ${await this.token()}`, ...(init.headers ?? {}) },
    }))
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
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', ...(parent ? { parents: [parent] } : {}) }),
    })
    return made.id
  }

  private async upload(parent: string, name: string, mimeType: string, data: Uint8Array): Promise<void> {
    const old = await this.list(`'${q(parent)}' in parents and name='${q(name)}' and trashed=false`)
    for (const file of old) await this.api(`files/${file.id}`, { method: 'DELETE' })
    const boundary = `portfolio-${createHash('sha256').update(name).digest('hex').slice(0, 16)}`
    const metadata = JSON.stringify({ name, parents: [parent] })
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      Buffer.from(data), Buffer.from(`\r\n--${boundary}--`),
    ])
    const r = await this.fetcher(`${UPLOAD}?uploadType=multipart&fields=id,name`, {
      method: 'POST',
      headers: { authorization: `Bearer ${await this.token()}`, 'content-type': `multipart/related; boundary=${boundary}` },
      body,
    })
    await responseJson<DriveFile>(r)
  }

  private async mediaFiles(root: string): Promise<string[]> {
    const files: string[] = []
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) await walk(path)
        else if (entry.isFile()) files.push(path)
      }
    }
    try { await walk(root) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    return files.sort()
  }

  async run(): Promise<{ folder: string; files: number; bytes: number }> {
    const { config, db, log } = this.options
    const date = new Date().toISOString().slice(0, 10)
    const root = config.backup.folderId || await this.folder('Portfolio Backups')
    const day = await this.folder(date, root)
    const snapshot = join(tmpdir(), `portfolio-${process.pid}-${Date.now()}.sqlite`)
    let files = 0, bytes = 0
    try {
      db.run('VACUUM INTO ?', [snapshot])
      const database = await readFile(snapshot)
      await this.upload(day, 'database.sqlite', 'application/vnd.sqlite3', database)
      files++; bytes += database.byteLength
      for (const file of await this.mediaFiles(config.mediaDir)) {
        const data = await readFile(file)
        const name = `media/${relative(config.mediaDir, file).split(sep).join('/')}`
        await this.upload(day, name, 'application/octet-stream', data)
        files++; bytes += data.byteLength
      }
      const cutoff = new Date(Date.now() - config.backup.retentionDays * 86_400_000).toISOString().slice(0, 10)
      for (const old of await this.list(`'${q(root)}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(old.name) && old.name < cutoff) {
          // Delete the dated folder's contents explicitly; deleting a Drive folder alone can orphan its children.
          const children = await this.list(`'${q(old.id)}' in parents and trashed=false`)
          for (const child of children) await this.api(`files/${child.id}`, { method: 'DELETE' })
          await this.api(`files/${old.id}`, { method: 'DELETE' })
          log.info('old Google Drive backup removed', { date: old.name, files: children.length })
        }
      }
      log.info('Google Drive backup completed', { date, files, bytes })
      return { folder: date, files, bytes }
    } finally { await rm(snapshot, { force: true }).catch(() => undefined) }
  }
}

async function sendFailureNotice(options: BackupOptions, error: unknown): Promise<void> {
  const { config, mailer } = options
  if (!mailer || !config.email.from || !config.email.notifyTo) return
  const reason = error instanceof Error ? error.message.slice(0, 400) : String(error).slice(0, 400)
  const safe = reason.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
  const date = new Date()
  await mailer.send({
    from: config.email.from, to: config.email.notifyTo, replyTo: config.email.replyTo,
    subject: 'Portfolio backup failed',
    text: `The automatic Google Drive backup failed at ${date.toISOString()}.\n\nReason: ${reason}`,
    html: `<p>The automatic Google Drive backup failed at ${date.toISOString()}.</p><p>Reason: ${safe}</p>`,
    messageId: `backup-${Date.now()}@portfolio.local`, date,
  })
}

export function startBackupScheduler(options: BackupOptions, hourUtc: number): { stop(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  let stopped = false
  const schedule = () => {
    if (stopped) return
    const now = new Date(), next = new Date(now)
    next.setUTCHours(hourUtc, 0, 0, 0)
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
    timer = setTimeout(async () => {
      try { await new GoogleDriveBackup(options).run() }
      catch (error) {
        options.log.error('Google Drive backup failed', { error })
        try { await sendFailureNotice(options, error) }
        catch (mailError) { options.log.error('Google Drive backup failure notification could not be sent', { error: mailError }) }
      } finally { schedule() }
    }, next.getTime() - now.getTime())
    timer.unref()
  }
  schedule()
  return { stop() { stopped = true; if (timer) clearTimeout(timer) } }
}
