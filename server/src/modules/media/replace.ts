import type { AppContext, SessionInfo } from '../../context.ts'
import { conflict, notFound } from '../../http/errors.ts'
import { requirePermission } from '../auth/permissions.ts'
import { repointMedia } from '../projects/service.ts'
import { audit } from '../system/audit.ts'
import { mediaOut, saveUpload, type MediaOut, type MediaRow } from './service.ts'

/**
 * Replacing a picture (PROMPT 22). The new file goes through the same checks as any upload (its own bytes decide what it is), becomes a
 * picture of its own, and everything that used the old one is pointed at it in one transaction. The old picture, its file and its address are
 * left alone: a file's name is the hash of its content and the address is cached for a year, so one address can never be made to show a
 * different picture; the old one is deleted by hand when nothing uses it. The description kept in the library carries over when the new picture
 * has none. A picture replaced by the very same bytes is refused (there is nothing to replace).
 */
export function replaceMedia(app: AppContext, session: SessionInfo | null, id: number, buffer: Buffer, originalName: string | null): { media: MediaOut; projects: number } {
  const who = requirePermission(session, 'content:write')
  const old = app.db.get<MediaRow>('SELECT * FROM media WHERE id = ?', [id])
  if (!old) throw notFound('The image')
  const next = saveUpload(app, session, buffer, originalName)
  if (next.id === old.id) throw conflict('This is the same picture: there is nothing to replace.')
  const projects = app.db.transaction(() => {
    if (next.alt_json === '{}' && old.alt_json !== '{}') app.db.run('UPDATE media SET alt_json = ? WHERE id = ?', [old.alt_json, next.id])
    return repointMedia(app, old.id, next.id)
  })
  audit(app, who, 'media.replace', 'media', old.id, { with: next.id, projects })
  return { media: mediaOut(app.db.get<MediaRow>('SELECT * FROM media WHERE id = ?', [next.id])!), projects }
}
