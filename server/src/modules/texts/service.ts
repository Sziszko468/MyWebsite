import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppContext, SessionInfo } from '../../context.ts'
import { LANGUAGES, type Language } from '../../config.ts'
import { notFound, validationFailed, type FieldErrors } from '../../http/errors.ts'
import { iso } from '../../lib/time.ts'
import { cleanBlock, isRecord, length } from '../../lib/text.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'

/**
 * The website's own wording an administrator may change without touching code: the home page's headline and buttons, the
 * shop's call-to-action labels, the configurator's questions and answers. It is a list of KEYS, written from the website's
 * dictionaries when the seed is made (`npm run catalog:seed-export` → server/seed/texts.manifest.json), each with the wording
 * the website ships in three languages. An override is one row per key and language; no row means the website's own words.
 * Only keys of the manifest can be overridden, so a typo or a probe cannot create a key the website would never read.
 */

export const MANIFEST_FILE = join(import.meta.dirname, '..', '..', '..', 'seed', 'texts.manifest.json')
export const TEXT_MAX = 600

export interface TextKey {
  key: string
  group: string
  /** What the text is, in English, for the administrator. */
  label: string
  /** `{name}`-style tokens the original contains: an override must keep them, or the page would show the braces. */
  placeholders?: string[]
  default: Record<Language, string>
}

let cache: { file: string; keys: TextKey[] } | null = null

export function manifest(file = MANIFEST_FILE): TextKey[] {
  if (cache && cache.file === file) return cache.keys
  let keys: TextKey[] = []
  try {
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'))
    if (isRecord(parsed) && Array.isArray(parsed.keys)) keys = parsed.keys.filter((item): item is TextKey => isRecord(item) && typeof item.key === 'string' && isRecord(item.default))
  } catch {
    keys = []
  }
  cache = { file, keys }
  return keys
}

interface Row {
  key: string
  language: Language
  value: string
}

/** What a visitor's browser asks for: only the overridden words. */
export function publicTexts(app: AppContext): Record<string, Partial<Record<Language, string>>> {
  const known = new Set(manifest().map((item) => item.key))
  const out: Record<string, Partial<Record<Language, string>>> = {}
  for (const row of app.db.all<Row>('SELECT key, language, value FROM text_overrides')) {
    if (!known.has(row.key)) continue
    ;(out[row.key] ??= {})[row.language] = row.value
  }
  return out
}

export function adminTexts(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'content:write')
  const overrides = publicTexts(app)
  return { keys: manifest().map((item) => ({ ...item, values: { hu: '', en: '', nl: '', ...overrides[item.key] } })) }
}

/** Sets or clears the override of one key. An empty text clears that language's override (the website's own words return). */
export function saveText(app: AppContext, session: SessionInfo | null, key: string, body: Record<string, unknown>) {
  const who = requirePermission(session, 'content:write')
  const item = manifest().find((candidate) => candidate.key === key)
  if (!item) throw notFound('The text')
  const values = isRecord(body.values) ? body.values : null
  if (!values) throw validationFailed({ values: 'required' })
  const errors: FieldErrors = {}
  const clean: Partial<Record<Language, string>> = {}
  for (const language of LANGUAGES) {
    const raw = values[language]
    if (raw === undefined) continue
    if (typeof raw !== 'string') {
      errors[`values.${language}`] = 'invalid'
      continue
    }
    const text = cleanBlock(raw)
    if (length(text) > TEXT_MAX) errors[`values.${language}`] = 'tooLong'
    else if (text !== '' && (item.placeholders ?? []).some((token) => !text.includes(token))) errors[`values.${language}`] = 'invalid'
    clean[language] = text
  }
  if (Object.keys(errors).length > 0) throw validationFailed(errors)
  const now = iso(app.clock.now())
  app.db.transaction(() => {
    for (const language of LANGUAGES) {
      const value = clean[language]
      if (value === undefined) continue
      if (value === '') app.db.run('DELETE FROM text_overrides WHERE key = ? AND language = ?', [key, language])
      else
        app.db.run(
          `INSERT INTO text_overrides (key, language, value, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (key, language) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
          [key, language, value, now, who.userId],
        )
    }
  })
  audit(app, who, 'text.update', 'text', key)
  return adminTexts(app, session).keys.find((candidate) => candidate.key === key)
}
