import type { AppContext, SessionInfo } from '../../context.ts'
import { LANGUAGES, type Language } from '../../config.ts'
import { notFound, validationFailed } from '../../http/errors.ts'
import { iso } from '../../lib/time.ts'
import { isRecord } from '../../lib/text.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { Checker } from './admin.ts'
import { loadCatalog } from './repository.ts'

/**
 * Translation management. The catalogue's texts (services, packages, add-ons, FAQ) exist in Hungarian, English and
 * Dutch; this module shows them side by side, says which are missing, and saves one language of one record at a
 * time, with the same limits the full editors apply. Nothing is translated or published automatically: a text is
 * whatever an administrator typed and saved.
 *
 * "Missing" means: empty in this language while another language has it. A field empty in all three is not flagged
 * (it may be meant to be empty); a field filled in one language and empty in another is the half-finished work this
 * page exists to find.
 */

export const TRANSLATION_GROUPS = ['services', 'packages', 'extras', 'faq'] as const
export type TranslationGroup = (typeof TRANSLATION_GROUPS)[number]

interface Field {
  name: string
  kind: 'line' | 'block' | 'list'
  max: number
  required?: boolean
}

/** Exported so a test can hold the administration's editors (src/admin/lib/catalog.ts) to the same lists and limits. */
export const FIELDS: Record<TranslationGroup, readonly Field[]> = {
  services: [
    { name: 'title', kind: 'line', max: 120, required: true },
    { name: 'summary', kind: 'block', max: 600 },
    { name: 'tagline', kind: 'line', max: 200 },
    { name: 'overview', kind: 'block', max: 3000 },
    { name: 'features', kind: 'list', max: 200 },
  ],
  packages: [
    { name: 'name', kind: 'line', max: 60, required: true },
    { name: 'tagline', kind: 'line', max: 300 },
    { name: 'audience', kind: 'line', max: 400 },
    { name: 'scope', kind: 'line', max: 400 },
    { name: 'customization', kind: 'line', max: 400 },
    { name: 'support', kind: 'line', max: 400 },
    { name: 'priceNote', kind: 'line', max: 300 },
    { name: 'includes', kind: 'list', max: 300 },
    { name: 'fits', kind: 'list', max: 300 },
    { name: 'deliverables', kind: 'list', max: 300 },
  ],
  extras: [
    { name: 'name', kind: 'line', max: 80, required: true },
    { name: 'summary', kind: 'block', max: 400 },
  ],
  faq: [
    { name: 'question', kind: 'line', max: 300, required: true },
    { name: 'answer', kind: 'block', max: 3000 },
  ],
}

/** Whether what is saved here reaches the website at its next build (content/catalogOverlay.ts), or only the API. */
const REACHES_WEBSITE: Record<TranslationGroup, boolean> = { services: false, packages: true, extras: true, faq: true }

type Value = string | string[]

export interface TranslationField {
  name: string
  kind: Field['kind']
  max: number
  required: boolean
  values: Record<Language, Value>
  /** The languages in which this field is empty although another language has it. */
  missing: Language[]
}

export interface TranslationItem {
  key: string
  /** The Hungarian title, or the key when there is none. */
  label: string
  status: 'active' | 'disabled'
  fields: TranslationField[]
  /** How many of this record's fields are missing, per language. */
  missing: Record<Language, number>
}

const isEmpty = (value: Value): boolean => (Array.isArray(value) ? value.length === 0 : value.trim() === '')

function textsOf(group: TranslationGroup, texts: unknown): Record<string, Value> {
  const source = isRecord(texts) ? texts : {}
  const read = (name: string): Value => {
    const value = source[name]
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : typeof value === 'string' ? value : ''
  }
  if (group === 'faq') return { question: read('title'), answer: read('description') }
  return Object.fromEntries(FIELDS[group].map((field) => [field.name, read(field.name)]))
}

function build(group: TranslationGroup, key: string, status: 'active' | 'disabled', translations: Partial<Record<Language, unknown>>): TranslationItem {
  const perLanguage = Object.fromEntries(LANGUAGES.map((lang) => [lang, textsOf(group, translations[lang])])) as Record<Language, Record<string, Value>>
  const missingByLanguage = Object.fromEntries(LANGUAGES.map((lang) => [lang, 0])) as Record<Language, number>
  const fields = FIELDS[group].map((field): TranslationField => {
    const values = Object.fromEntries(LANGUAGES.map((lang) => [lang, perLanguage[lang][field.name]])) as Record<Language, Value>
    const missing = LANGUAGES.filter((lang) => isEmpty(values[lang]) && LANGUAGES.some((other) => other !== lang && !isEmpty(values[other])))
    for (const lang of missing) missingByLanguage[lang] += 1
    return { name: field.name, kind: field.kind, max: field.max, required: field.required === true, values, missing }
  })
  const first = perLanguage.hu[FIELDS[group][0].name]
  return { key, label: typeof first === 'string' && first.trim() ? first : key, status, fields, missing: missingByLanguage }
}

function items(app: AppContext): Record<TranslationGroup, TranslationItem[]> {
  const catalog = loadCatalog(app.db, { includeDisabled: true })
  return {
    services: catalog.services.map((record) => build('services', record.slug, record.status, record.translations)),
    packages: catalog.packages.map((record) => build('packages', record.code, record.status, record.translations)),
    extras: catalog.extras.map((record) => build('extras', record.code, record.status, record.translations)),
    faq: catalog.content.filter((record) => record.type === 'faq').map((record) => build('faq', record.slug, record.status, record.translations)),
  }
}

export interface TranslationOverview {
  languages: readonly Language[]
  /** Across the whole catalogue (whatever is filtered below): how much is left to translate, per language. */
  summary: Record<Language, { fields: number; records: number }>
  groups: { id: TranslationGroup; reachesWebsite: boolean; items: TranslationItem[] }[]
}

export function overview(app: AppContext, session: SessionInfo | null, query: URLSearchParams): TranslationOverview {
  requirePermission(session, 'requests:read')
  const all = items(app)
  const summary = Object.fromEntries(LANGUAGES.map((lang) => [lang, { fields: 0, records: 0 }])) as TranslationOverview['summary']
  for (const group of TRANSLATION_GROUPS) {
    for (const item of all[group]) {
      for (const lang of LANGUAGES) {
        summary[lang].fields += item.missing[lang]
        if (item.missing[lang] > 0) summary[lang].records += 1
      }
    }
  }
  const wantedGroup = query.get('group')
  const wantedLanguage = query.get('lang')
  const lang = (LANGUAGES as readonly string[]).includes(wantedLanguage ?? '') ? (wantedLanguage as Language) : null
  const onlyMissing = query.get('missing') === '1'
  const chosen = (TRANSLATION_GROUPS as readonly string[]).includes(wantedGroup ?? '') ? [wantedGroup as TranslationGroup] : [...TRANSLATION_GROUPS]
  return {
    languages: LANGUAGES,
    summary,
    groups: chosen.map((id) => ({
      id,
      reachesWebsite: REACHES_WEBSITE[id],
      items: all[id].filter((item) => !onlyMissing || LANGUAGES.some((other) => (lang === null || other === lang) && item.missing[other] > 0)),
    })),
  }
}

const OWNER_SQL: Record<TranslationGroup, string> = {
  services: 'SELECT id FROM services WHERE slug = ?',
  packages: 'SELECT id FROM packages WHERE code = ?',
  extras: 'SELECT id FROM extras WHERE code = ?',
  faq: "SELECT id FROM site_content WHERE slug = ? AND type = 'faq'",
}
const TOUCH_SQL: Record<TranslationGroup, string> = {
  services: 'UPDATE services SET updated_at = ? WHERE id = ?',
  packages: 'UPDATE packages SET updated_at = ? WHERE id = ?',
  extras: 'UPDATE extras SET updated_at = ? WHERE id = ?',
  faq: 'UPDATE site_content SET updated_at = ? WHERE id = ?',
}
/** One column per field of a translation row; the SQL is fixed here, only the values come from the request. */
const UPDATE_SQL: Record<TranslationGroup, Record<string, string>> = {
  services: {
    title: 'UPDATE service_translations SET title = ? WHERE service_id = ? AND language = ?',
    summary: 'UPDATE service_translations SET summary = ? WHERE service_id = ? AND language = ?',
    tagline: 'UPDATE service_translations SET tagline = ? WHERE service_id = ? AND language = ?',
    overview: 'UPDATE service_translations SET overview = ? WHERE service_id = ? AND language = ?',
    features: 'UPDATE service_translations SET features_json = ? WHERE service_id = ? AND language = ?',
  },
  packages: {
    name: 'UPDATE package_translations SET name = ? WHERE package_id = ? AND language = ?',
    tagline: 'UPDATE package_translations SET tagline = ? WHERE package_id = ? AND language = ?',
    audience: 'UPDATE package_translations SET audience = ? WHERE package_id = ? AND language = ?',
    scope: 'UPDATE package_translations SET scope = ? WHERE package_id = ? AND language = ?',
    customization: 'UPDATE package_translations SET customization = ? WHERE package_id = ? AND language = ?',
    support: 'UPDATE package_translations SET support = ? WHERE package_id = ? AND language = ?',
    priceNote: 'UPDATE package_translations SET price_note = ? WHERE package_id = ? AND language = ?',
    includes: 'UPDATE package_translations SET includes_json = ? WHERE package_id = ? AND language = ?',
    fits: 'UPDATE package_translations SET fits_json = ? WHERE package_id = ? AND language = ?',
    deliverables: 'UPDATE package_translations SET deliverables_json = ? WHERE package_id = ? AND language = ?',
  },
  extras: {
    name: 'UPDATE extra_translations SET name = ? WHERE extra_id = ? AND language = ?',
    summary: 'UPDATE extra_translations SET summary = ? WHERE extra_id = ? AND language = ?',
  },
  faq: {
    question: 'UPDATE site_content_translations SET title = ? WHERE content_id = ? AND language = ?',
    answer: 'UPDATE site_content_translations SET description = ? WHERE content_id = ? AND language = ?',
  },
}
const ENTITY: Record<TranslationGroup, string> = { services: 'service', packages: 'package', extras: 'extra', faq: 'faq' }

/**
 * Saves some of the fields of one record in one language. Every field named is checked (unknown names, lengths, a
 * required one left empty) before anything is written, and all of them are written in one transaction.
 */
export function save(app: AppContext, session: SessionInfo | null, group: TranslationGroup, key: string, language: string, body: Record<string, unknown>): TranslationItem {
  const actor = requirePermission(session, group === 'faq' ? 'content:write' : 'catalog:write')
  if (!(LANGUAGES as readonly string[]).includes(language)) throw notFound('The language')
  const lang = language as Language
  const incoming = body.fields
  if (!isRecord(incoming) || Object.keys(incoming).length === 0) throw validationFailed({ fields: 'required' })

  const check = new Checker()
  const specs = new Map(FIELDS[group].map((field) => [field.name, field]))
  const values: [string, string | string[]][] = []
  for (const [name, raw] of Object.entries(incoming)) {
    const spec = specs.get(name)
    if (!spec) {
      check.fail(`fields.${name}`, 'unknown')
      continue
    }
    const at = `fields.${name}`
    values.push([name, spec.kind === 'list' ? check.list(at, raw, spec.max) : check.text(at, raw, spec.max, { required: spec.required, multiline: spec.kind === 'block' })])
  }
  check.done()

  const owner = app.db.get<{ id: number }>(OWNER_SQL[group], [key])
  if (!owner) throw notFound('The record')
  app.db.transaction(() => {
    for (const [name, value] of values) {
      const stored = Array.isArray(value) ? JSON.stringify(value) : name === 'priceNote' && value === '' ? null : value
      const changed = app.db.run(UPDATE_SQL[group][name], [stored, owner.id, lang]).changes
      if (changed === 0) throw notFound('The translation')
    }
    app.db.run(TOUCH_SQL[group], [iso(app.clock.now()), owner.id])
  })
  audit(app, actor, 'translation.update', ENTITY[group], key, { language: lang, fields: values.map(([name]) => name) })
  const saved = items(app)[group].find((item) => item.key === key)
  if (!saved) throw notFound('The record')
  return saved
}

