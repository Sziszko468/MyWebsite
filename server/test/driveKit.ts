import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Config } from '../src/config.ts'
import { createLogger } from '../src/lib/logger.ts'
import type { BackupOptions } from '../src/modules/backups/googleDrive.ts'
import type { TestServer } from './helpers.ts'
import { startServer } from './helpers.ts'

/**
 * A small in-memory stand-in for the parts of the Google Drive API the backup uses, and a way to set a server up for a backup. Nothing
 * here reaches Google, and every value is made up. Shared by the backup tests.
 */

export interface Item {
  id: string
  name: string
  folder: boolean
  parents: string[]
  data?: Buffer
}

export class FakeDrive {
  items = new Map<string, Item>()
  requests: { method: string; url: string; body: string }[] = []
  /** Reasons to answer with an error: a substring of the URL mapped to a status (non-GET requests only). */
  failing = new Map<string, number>()
  /** Fails the n-th upload (1-based) or an upload of a given stored name with this status. */
  failUpload: ((upload: number, name: string) => number | null) | null = null
  /** Answers every upload with a size that is not what was sent. */
  wrongSize = false
  wrongMd5 = false
  uploads = 0
  private counter = 0

  constructor(rootId: string) {
    this.items.set(rootId, { id: rootId, name: 'root', folder: true, parents: [] })
  }

  addFolder(name: string, parent: string): string {
    const id = `f${++this.counter}`
    this.items.set(id, { id, name, folder: true, parents: [parent] })
    return id
  }

  addFile(name: string, parent: string, data = 'old'): string {
    const id = `x${++this.counter}`
    this.items.set(id, { id, name, folder: false, parents: [parent], data: Buffer.from(data) })
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
    for (const [needle, status] of this.failing) if (url.href.includes(needle) && method !== 'GET') return reply(status, { error: 'forced failure with SECRET-DRIVE-ANSWER-TEXT' })

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
      this.uploads += 1
      const forced = this.failUpload?.(this.uploads, meta.name) ?? null
      if (forced !== null) return reply(forced, { error: 'forced upload failure' })
      const data = Buffer.from(part(second, third))
      const id = `x${++this.counter}`
      this.items.set(id, { id, name: meta.name, folder: false, parents: meta.parents, data })
      return reply(200, {
        id,
        name: meta.name,
        size: String(this.wrongSize ? data.length + 1 : data.length),
        md5Checksum: this.wrongMd5 ? '0'.repeat(32) : createHash('md5').update(data).digest('hex'),
      })
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

  /** What Drive holds for one dated folder, written to a new folder on disk the way a download would (names as stored, `media/…` in subfolders). */
  download(folderId: string, directory: string): void {
    for (const item of this.childrenOf(folderId)) {
      if (item.folder) continue
      const path = join(directory, ...item.name.split('/'))
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, item.data ?? Buffer.alloc(0))
    }
  }

  dayFolder(root: string, day: string): string | undefined {
    return this.childrenOf(root).find((item) => item.folder && item.name === day)?.id
  }
}

export const SECRETS = { clientId: 'client-id-abc', clientSecret: 'client-secret-xyz', refreshToken: 'refresh-token-xyz' }
/** A 32-byte key, as `openssl rand -base64 32` writes it, made up for the tests. */
export const TEST_KEY_TEXT = Buffer.from('0123456789abcdef0123456789ABCDEF'.split('').map((_, i) => (i * 7 + 3) % 251)).toString('base64')
export const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10)

export const scratchFolders: string[] = []
export const cleanScratch = () => {
  for (const folder of scratchFolders.splice(0)) rmSync(folder, { recursive: true, force: true })
}
export const scratch = (prefix = 'cc-ops-'): string => {
  const folder = mkdtempSync(join(tmpdir(), prefix))
  scratchFolders.push(folder)
  return folder
}

export interface BackupSetup {
  server: TestServer
  options: BackupOptions
  drive: FakeDrive
  mediaDir: string
  config: Config
}

/** A server with a little data and two pictures, and the options to back it up to a fresh stand-in drive. */
export async function setupBackup(options: { key?: Buffer | null } = {}): Promise<BackupSetup> {
  const server = await startServer({ seed: false })
  const mediaDir = scratch('cc-drive-media-')
  mkdirSync(join(mediaDir, 'nested'), { recursive: true })
  writeFileSync(join(mediaDir, 'a1b2.png'), Buffer.from([1, 2, 3, 4]))
  writeFileSync(join(mediaDir, 'nested', 'c3d4.webp'), Buffer.from([5, 6, 7]))
  // Something in the database, so the snapshot is not an empty file.
  server.db.run("INSERT INTO settings (key, value, updated_at) VALUES ('audit.probe', '1', '2026-11-13T00:00:00.000Z')")
  const config: Config = { ...server.config, mediaDir, backup: { enabled: true, ...SECRETS, folderId: 'ROOT', retentionDays: 30, hourUtc: 3, encryptionKey: options.key ?? null } }
  const drive = new FakeDrive('ROOT')
  const log = createLogger({ level: 'debug', write: (line) => void server.logs.push(line) })
  return { server, options: { config, db: server.db, log, mailer: server.mailer, fetchImpl: drive.fetch as typeof fetch }, drive, mediaDir, config }
}
