import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../src/config.ts'
import { createLogger } from '../src/lib/logger.ts'
import { GoogleDriveBackup, startBackupScheduler, type BackupOptions } from '../src/modules/backups/googleDrive.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * The automatic Google Drive backup (server/src/modules/backups/googleDrive.ts), against a small in-memory stand-in for the parts
 * of the Drive API it uses. Nothing here reaches Google. Added by the PROMPT 19 audit: the module shipped without a test.
 *
 * What is proved: the uploaded database is a real, consistent SQLite file; the pictures go up under `media/`; the dated folder is
 * the day's; old dated folders are removed only AFTER a successful upload (a failed run never costs the older backups) and
 * only folders named like a date; credentials travel only in the token request's body; a failed run e-mails the owner a reason
 * that carries no secret and the scheduler keeps going.
 * What is NOT proved (and cannot be without the owner's Google account): that Google accepts these requests as written.
 */

interface Item {
  id: string
  name: string
  folder: boolean
  parents: string[]
  data?: Buffer
}

class FakeDrive {
  items = new Map<string, Item>()
  requests: { method: string; url: string; body: string }[] = []
  /** Reasons to answer with an error: a substring of the URL mapped to a status. */
  failing = new Map<string, number>()
  private counter = 0

  constructor(rootId: string) {
    this.items.set(rootId, { id: rootId, name: 'root', folder: true, parents: [] })
  }

  addFolder(name: string, parent: string): string {
    const id = `f${++this.counter}`
    this.items.set(id, { id, name, folder: true, parents: [parent] })
    return id
  }

  addFile(name: string, parent: string): string {
    const id = `x${++this.counter}`
    this.items.set(id, { id, name, folder: false, parents: [parent], data: Buffer.from('old') })
    return id
  }

  childrenOf(id: string): Item[] {
    return [...this.items.values()].filter((item) => item.parents.includes(id))
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init.method ?? 'GET').toUpperCase()
    const rawBody = init.body
    const bodyBuffer = rawBody === undefined || rawBody === null ? Buffer.alloc(0) : Buffer.from(rawBody instanceof URLSearchParams ? rawBody.toString() : (rawBody as Uint8Array | string))
    this.requests.push({ method, url: url.href, body: rawBody instanceof URLSearchParams || typeof rawBody === 'string' ? bodyBuffer.toString('utf8') : '(binary)' })
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    for (const [needle, status] of this.failing) if (url.href.includes(needle) && method !== 'GET') return reply(status, { error: 'forced failure' })

    if (url.hostname === 'oauth2.googleapis.com') return reply(200, { access_token: 'access-token', expires_in: 3600 })

    if (url.pathname === '/upload/drive/v3/files' && method === 'POST') {
      const contentType = String((init.headers as Record<string, string>)['content-type'])
      const boundary = /boundary=(.+)$/.exec(contentType)![1]
      const delimiter = Buffer.from(`--${boundary}`)
      const first = bodyBuffer.indexOf(delimiter)
      const second = bodyBuffer.indexOf(delimiter, first + delimiter.length)
      const third = bodyBuffer.indexOf(delimiter, second + delimiter.length)
      const part = (from: number, to: number) => bodyBuffer.subarray(bodyBuffer.indexOf('\r\n\r\n', from) + 4, to - 2)
      const meta = JSON.parse(part(first, second).toString('utf8')) as { name: string; parents: string[] }
      const id = `x${++this.counter}`
      this.items.set(id, { id, name: meta.name, folder: false, parents: meta.parents, data: Buffer.from(part(second, third)) })
      return reply(200, { id, name: meta.name })
    }

    if (url.pathname === '/drive/v3/files' && method === 'GET') {
      const q = url.searchParams.get('q') ?? ''
      const unescape = (value: string) => value.replace(/\\(.)/g, '$1')
      const name = /name='((?:[^'\\]|\\.)*)'/.exec(q)?.[1]
      const parent = /'((?:[^'\\]|\\.)*)' in parents/.exec(q)?.[1]
      const foldersOnly = q.includes("mimeType='application/vnd.google-apps.folder'")
      const files = [...this.items.values()].filter(
        (item) => (name === undefined || item.name === unescape(name)) && (parent === undefined || item.parents.includes(unescape(parent))) && (!foldersOnly || item.folder),
      )
      return reply(200, { files: files.map(({ id, name: fileName }) => ({ id, name: fileName })) })
    }

    if (url.pathname === '/drive/v3/files' && method === 'POST') {
      const body = JSON.parse(bodyBuffer.toString('utf8')) as { name: string; parents?: string[] }
      const id = `f${++this.counter}`
      this.items.set(id, { id, name: body.name, folder: true, parents: body.parents ?? [] })
      return reply(200, { id, name: body.name })
    }

    const deleting = /^\/drive\/v3\/files\/(.+)$/.exec(url.pathname)
    if (deleting && method === 'DELETE') {
      this.items.delete(deleting[1])
      return new Response(null, { status: 204 })
    }
    return reply(404, { error: `the stand-in does not know ${method} ${url.pathname}` })
  }
}

const SECRETS = { clientId: 'client-id-abc', clientSecret: 'client-secret-xyz', refreshToken: 'refresh-token-xyz' }
const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

let server: TestServer | null = null
const folders: string[] = []

afterEach(async () => {
  vi.useRealTimers()
  await server?.close()
  server = null
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

async function setup(): Promise<{ options: BackupOptions; drive: FakeDrive; mediaDir: string; config: Config }> {
  server = await startServer({ seed: false })
  const mediaDir = mkdtempSync(join(tmpdir(), 'cc-drive-media-'))
  folders.push(mediaDir)
  mkdirSync(join(mediaDir, 'nested'), { recursive: true })
  writeFileSync(join(mediaDir, 'a1b2.png'), Buffer.from([1, 2, 3, 4]))
  writeFileSync(join(mediaDir, 'nested', 'c3d4.webp'), Buffer.from([5, 6, 7]))
  // Something in the database, so the snapshot is not an empty file.
  server.db.run("INSERT INTO settings (key, value, updated_at) VALUES ('audit.probe', '1', '2026-11-13T00:00:00.000Z')")
  const config: Config = { ...server.config, mediaDir, backup: { enabled: true, ...SECRETS, folderId: 'ROOT', retentionDays: 30, hourUtc: 3 } }
  const drive = new FakeDrive('ROOT')
  const log = createLogger({ level: 'debug', write: () => undefined })
  return { options: { config, db: server.db, log, mailer: server.mailer, fetchImpl: drive.fetch as typeof fetch }, drive, mediaDir, config }
}

describe('the Google Drive backup', () => {
  it('uploads a consistent database and the pictures into the day\'s folder, and returns what it did', async () => {
    const { options, drive } = await setup()
    const result = await new GoogleDriveBackup(options).run()

    expect(result.folder).toBe(day(0))
    expect(result.files).toBe(3)
    const dayFolder = drive.childrenOf('ROOT').find((item) => item.folder && item.name === day(0))
    expect(dayFolder).toBeDefined()
    const names = drive.childrenOf(dayFolder!.id).map((item) => item.name).sort()
    expect(names).toEqual(['database.sqlite', 'media/a1b2.png', 'media/nested/c3d4.webp'])

    // The uploaded database is a real SQLite file, whole, with the migrations and the row we wrote.
    const upload = drive.childrenOf(dayFolder!.id).find((item) => item.name === 'database.sqlite')!
    expect(upload.data!.subarray(0, 15).toString('latin1')).toBe('SQLite format 3')
    const copy = join(mkdtempSync(join(tmpdir(), 'cc-drive-check-')), 'copy.sqlite')
    folders.push(join(copy, '..'))
    writeFileSync(copy, upload.data!)
    const restored = new DatabaseSync(copy, { readOnly: true })
    expect((restored.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check).toBe('ok')
    expect((restored.prepare('SELECT COUNT(*) AS n FROM schema_migrations').get() as { n: number }).n).toBeGreaterThanOrEqual(8)
    expect((restored.prepare("SELECT value FROM settings WHERE key = 'audit.probe'").get() as { value: string }).value).toBe('1')
    restored.close()

    // The pictures are byte for byte what is on disk.
    expect(drive.childrenOf(dayFolder!.id).find((item) => item.name === 'media/a1b2.png')!.data).toEqual(Buffer.from([1, 2, 3, 4]))
    // The temporary snapshot is gone.
    expect(readdirSync(tmpdir()).filter((file) => file.startsWith(`portfolio-${process.pid}-`))).toEqual([])
  })

  it('keeps a second run on the same day to one copy of each file (no duplicates)', async () => {
    const { options, drive } = await setup()
    await new GoogleDriveBackup(options).run()
    await new GoogleDriveBackup(options).run()
    const dayFolders = drive.childrenOf('ROOT').filter((item) => item.folder && item.name === day(0))
    expect(dayFolders).toHaveLength(1)
    expect(drive.childrenOf(dayFolders[0].id)).toHaveLength(3)
  })

  it('removes dated folders older than the retention, with their files, and nothing else', async () => {
    const { options, drive } = await setup()
    const old = drive.addFolder(day(-40), 'ROOT')
    const oldFile = drive.addFile('database.sqlite', old)
    const recent = drive.addFolder(day(-10), 'ROOT')
    const recentFile = drive.addFile('database.sqlite', recent)
    const notes = drive.addFolder('my-own-notes', 'ROOT')

    await new GoogleDriveBackup(options).run()

    expect(drive.items.has(old)).toBe(false)
    expect(drive.items.has(oldFile)).toBe(false)
    expect(drive.items.has(recent)).toBe(true)
    expect(drive.items.has(recentFile)).toBe(true)
    expect(drive.items.has(notes)).toBe(true)
  })

  it('never deletes an older backup when today\'s upload fails', async () => {
    const { options, drive } = await setup()
    const old = drive.addFolder(day(-40), 'ROOT')
    const oldFile = drive.addFile('database.sqlite', old)
    drive.failing.set('/upload/drive/v3/files', 500)

    await expect(new GoogleDriveBackup(options).run()).rejects.toThrow(/Google Drive HTTP 500/)

    expect(drive.items.has(old)).toBe(true)
    expect(drive.items.has(oldFile)).toBe(true)
    expect(readdirSync(tmpdir()).filter((file) => file.startsWith(`portfolio-${process.pid}-`))).toEqual([])
  })

  it('sends the credentials only in the token request\'s body, never in an address', async () => {
    const { options, drive } = await setup()
    await new GoogleDriveBackup(options).run()
    for (const request of drive.requests) {
      for (const secret of Object.values(SECRETS)) expect(request.url).not.toContain(secret)
    }
    const token = drive.requests.filter((request) => request.url.startsWith('https://oauth2.googleapis.com/token'))
    expect(token).toHaveLength(1)
    expect(token[0].method).toBe('POST')
    expect(token[0].body).toContain('grant_type=refresh_token')
    // Every call to the Drive API is made over https.
    expect(drive.requests.every((request) => request.url.startsWith('https://'))).toBe(true)
  })

  it('on the scheduled hour a failed run e-mails the owner a reason with no secret in it, and the schedule goes on', async () => {
    const { options, drive } = await setup()
    drive.failing.set('oauth2.googleapis.com', 400)
    // The token request is a POST, so the stand-in's forced failure applies to it.
    vi.useFakeTimers({ now: new Date('2026-11-13T02:59:30.000Z'), toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const scheduler = startBackupScheduler(options, 3)
    await vi.advanceTimersByTimeAsync(31_000)
    for (let i = 0; i < 20; i += 1) await Promise.resolve()

    expect(server!.mailer.sent).toHaveLength(1)
    const mail = server!.mailer.sent[0]
    expect(mail.subject).toBe('Portfolio backup failed')
    expect(mail.to).toBe(options.config.email.notifyTo)
    expect(mail.text).toContain('Google Drive HTTP 400')
    for (const secret of Object.values(SECRETS)) {
      expect(mail.text).not.toContain(secret)
      expect(mail.html).not.toContain(secret)
    }

    // The next attempt is scheduled for the following day at the same hour: nothing more happens within the next 23 hours.
    await vi.advanceTimersByTimeAsync(23 * 3_600_000)
    expect(server!.mailer.sent).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2 * 3_600_000)
    for (let i = 0; i < 20; i += 1) await Promise.resolve()
    expect(server!.mailer.sent).toHaveLength(2)
    scheduler.stop()
  })
})
