import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { AppContext, SessionInfo } from '../../context.ts'
import { HttpError, conflict, notFound, validationFailed } from '../../http/errors.ts'
import { createHash } from 'node:crypto'
import { iso } from '../../lib/time.ts'
import { cleanLine } from '../../lib/text.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { MIME_BY_EXTENSION, sniffImage, type ImageMime } from './image.ts'

/**
 * The images of the portfolio. An upload is checked (its first bytes say what it is, its size and its pixels are bounded),
 * stored as a file named by its own hash in the media directory and described by a `media` row; the database never holds
 * the bytes. Two uploads of the same picture are one file. A replaced image is a NEW file: nothing that points at the old
 * one is changed behind its back, and the old address keeps working until somebody deletes the old picture on purpose, which
 * is refused while any project still uses it.
 */

export interface MediaRow {
  id: number
  storage: 'upload' | 'public'
  path: string
  mime: ImageMime
  bytes: number
  width: number
  height: number
  sha256: string
  original_name: string | null
  created_by: string | null
  created_at: string
}

/** What the website and the administration use: where the picture is and how big. */
export interface MediaOut {
  id: number
  src: string
  width: number
  height: number
  mime: ImageMime
  bytes: number
  name: string | null
  storage: 'upload' | 'public'
  createdAt: string
}

export const MEDIA_FILE = /^[a-f0-9]{24}\.(png|jpg|webp|gif)$/

export const mediaUrl = (row: Pick<MediaRow, 'storage' | 'path'>): string => (row.storage === 'upload' ? `/media/${row.path}` : row.path)

export const mediaOut = (row: MediaRow): MediaOut => ({
  id: row.id,
  src: mediaUrl(row),
  width: row.width,
  height: row.height,
  mime: row.mime,
  bytes: row.bytes,
  name: row.original_name,
  storage: row.storage,
  createdAt: row.created_at,
})

export function mediaById(app: AppContext, ids: Iterable<number>): Map<number, MediaRow> {
  const wanted = [...new Set(ids)].filter((id) => Number.isInteger(id) && id > 0)
  const out = new Map<number, MediaRow>()
  if (wanted.length === 0) return out
  for (const row of app.db.all<MediaRow>(`SELECT * FROM media WHERE id IN (${wanted.map(() => '?').join(',')})`, wanted)) out.set(row.id, row)
  return out
}

/** Stores an uploaded image and returns its row. The same picture twice is the same row. */
export function saveUpload(app: AppContext, session: SessionInfo | null, buffer: Buffer, originalName: string | null): MediaRow {
  const who = requirePermission(session, 'content:write')
  if (buffer.length === 0) throw validationFailed({ file: 'required' })
  if (buffer.length > app.config.mediaMaxBytes) throw new HttpError(413, 'payload_too_large', `The image is larger than ${app.config.mediaMaxBytes} bytes.`)
  const info = sniffImage(buffer)
  if (!info) throw validationFailed({ file: 'invalid' }, 'The file is not a PNG, JPEG, WebP or GIF image of a reasonable size.')
  const hash = createHash('sha256').update(buffer).digest('hex')
  const name = `${hash.slice(0, 24)}.${info.extension}`
  const existing = app.db.get<MediaRow>("SELECT * FROM media WHERE storage = 'upload' AND path = ?", [name])
  if (existing) return existing

  mkdirSync(app.config.mediaDir, { recursive: true })
  const file = join(app.config.mediaDir, name)
  if (!existsSync(file)) writeFileSync(file, buffer, { flag: 'wx' })
  const label = originalName ? cleanLine(originalName).replace(/[\\/]/g, '-').slice(0, 120) || null : null
  const result = app.db.run(
    `INSERT INTO media (storage, path, mime, bytes, width, height, sha256, original_name, created_by, created_at)
     VALUES ('upload', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, info.mime, buffer.length, info.width, info.height, hash, label, who.userId, iso(app.clock.now())],
  )
  audit(app, who, 'media.upload', 'media', result.lastInsertRowid, { mime: info.mime, bytes: buffer.length })
  return app.db.get<MediaRow>('SELECT * FROM media WHERE id = ?', [result.lastInsertRowid])!
}

export function listMedia(app: AppContext, session: SessionInfo | null, usage: Map<number, number>): Array<MediaOut & { uses: number }> {
  requirePermission(session, 'content:write')
  return app.db.all<MediaRow>('SELECT * FROM media ORDER BY id DESC').map((row) => ({ ...mediaOut(row), uses: usage.get(row.id) ?? 0 }))
}

/** Deletes an uploaded picture nothing uses. A picture that ships with the website (storage `public`) is never deleted here. */
export function deleteMedia(app: AppContext, session: SessionInfo | null, id: number, usage: Map<number, number>): void {
  const who = requirePermission(session, 'content:delete')
  const row = app.db.get<MediaRow>('SELECT * FROM media WHERE id = ?', [id])
  if (!row) throw notFound('The image')
  if (row.storage !== 'upload') throw conflict('This image ships with the website and cannot be deleted here.')
  if ((usage.get(id) ?? 0) > 0) throw conflict('This image is still used by a project. Remove it from the project first.')
  app.db.run('DELETE FROM media WHERE id = ?', [id])
  // The file may be shared by nobody else (a hash names one picture), so it goes too.
  try {
    unlinkSync(join(app.config.mediaDir, row.path))
  } catch {
    // Already gone: the row was the record that mattered.
  }
  audit(app, who, 'media.delete', 'media', id)
}

/** The public address of an uploaded file: `GET /media/<hash>.<ext>`. Immutable, because the name is the content's hash. */
export function serveMedia(app: AppContext, file: string) {
  if (!MEDIA_FILE.test(file)) throw notFound('The image')
  const root = resolve(app.config.mediaDir)
  const path = resolve(root, file)
  if (!path.startsWith(root) || !existsSync(path)) throw notFound('The image')
  const extension = file.split('.').pop() ?? ''
  const mime = MIME_BY_EXTENSION[extension]
  if (!mime) throw notFound('The image')
  return {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      // A picture is shown, never run: nothing in it may load, and it may not be framed as a page.
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
    body: readFileSync(path),
  }
}
