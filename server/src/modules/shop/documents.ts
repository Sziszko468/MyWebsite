import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppContext, SessionInfo } from '../../context.ts'
import { LANGUAGES, type Language } from '../../config.ts'
import type { Database } from '../../db/database.ts'
import { conflict, notFound, validationFailed, type FieldCode, type FieldErrors } from '../../http/errors.ts'
import { cleanBlock, cleanLine, isRecord, length } from '../../lib/text.ts'
import { iso } from '../../lib/time.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'

/**
 * The two documents behind the Shop's tier comparison and its FULL EXPERIENCE offer (migration 0005).
 *
 *   comparison       which features each package has (included, an optional add-on, a custom service, or not), the tier label
 *                    of each package ("Essential foundation"…) and which package it builds on, in display order.
 *   full_experience  the flagship offer: its copy, the development stages, the optional components, the configurator's
 *                    questions with their options (the budget ranges are the options of the budget question), the FAQ.
 *
 * Each is one JSON document with the text of every language in each leaf. The server rebuilds it from the parts it validated
 * (anything else in the body is dropped), so a stored document is always one the website can draw. `draft_json` is what the
 * administrator is writing; `published_json` is what visitors get, set only by an explicit publish.
 */

export const DOCUMENT_CODES = ['comparison', 'full_experience'] as const
export type DocumentCode = (typeof DOCUMENT_CODES)[number]

export type Tri = Record<Language, string>

export const FEATURE_LEVELS = ['included', 'addon', 'custom', 'none'] as const
export type FeatureLevel = (typeof FEATURE_LEVELS)[number]

export interface TierEntry {
  package: string
  label: Tri
  /** The package this one is a step up from, or null (Launch starts the ladder; Care stands beside it). */
  buildsOn: string | null
}
export interface ComparisonFeature {
  id: string
  name: Tri
  description: Tri
  levels: Record<string, FeatureLevel>
}
export interface ComparisonDoc {
  version: 1
  tiers: TierEntry[]
  features: ComparisonFeature[]
}

export const QUESTION_KINDS = ['single', 'multi'] as const
export type QuestionKind = (typeof QUESTION_KINDS)[number]
export interface QuestionOption {
  id: string
  label: Tri
  hint: Tri
  /** "Not sure yet": the way out of a question the visitor cannot answer. The budget question must have one. */
  unsure: boolean
}
export interface Question {
  id: string
  kind: QuestionKind
  required: boolean
  title: Tri
  help: Tri
  options: QuestionOption[]
}
export interface TitledText {
  id: string
  title: Tri
  text: Tri
}
export interface FullExperienceDoc {
  version: 1
  hero: { eyebrow: Tri; headline: Tri; supporting: Tri; primaryCta: Tri; secondaryCta: Tri }
  teaser: { title: Tri; text: Tri }
  /** What stands where a price would: never a number. */
  priceLabel: Tri
  stages: TitledText[]
  components: TitledText[]
  faq: { id: string; question: Tri; answer: Tri }[]
  configurator: { intro: Tri; questions: Question[] }
}

/** The questions the configurator cannot do without; the administrator may edit them but not remove them. */
export const CORE_QUESTIONS = ['type', 'stage', 'components', 'complexity', 'budget', 'timeline'] as const
export const MULTI_CORE = 'components'

export const LIMITS = {
  tiers: 12,
  features: 40,
  stages: 24,
  components: 16,
  faq: 12,
  questions: 12,
  optionsPerQuestion: 16,
} as const

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const PACKAGE_CODE = /^[a-z0-9][a-z0-9-]{1,39}$/

/** Collects what is wrong with a document, by path (`hero.headline.nl`, `features.3.name.hu`), and says so at once. */
export class DocChecker {
  readonly errors: FieldErrors = {}
  fail(path: string, code: FieldCode): void {
    if (!(path in this.errors)) this.errors[path] = code
  }
  done(): void {
    if (Object.keys(this.errors).length > 0) throw validationFailed(this.errors)
  }
  text(path: string, value: unknown, max: number, options: { required?: boolean; multiline?: boolean } = {}): string {
    if (value === undefined || value === null) {
      if (options.required) this.fail(path, 'required')
      return ''
    }
    if (typeof value !== 'string') {
      this.fail(path, 'invalid')
      return ''
    }
    const cleaned = options.multiline ? cleanBlock(value) : cleanLine(value)
    if (!cleaned && options.required) this.fail(path, 'required')
    if (length(cleaned) > max) this.fail(path, 'tooLong')
    return cleaned
  }
  /** One text per language. When required, all three must say something. */
  tri(path: string, value: unknown, max: number, options: { required?: boolean; multiline?: boolean } = {}): Tri {
    const source = isRecord(value) ? value : {}
    if (value !== undefined && value !== null && !isRecord(value)) this.fail(path, 'invalid')
    const out = {} as Tri
    for (const lang of LANGUAGES) out[lang] = this.text(`${path}.${lang}`, source[lang], max, options)
    return out
  }
  id(path: string, value: unknown): string {
    if (typeof value !== 'string' || !ID.test(value)) {
      this.fail(path, value === undefined || value === '' ? 'required' : 'invalid')
      return ''
    }
    return value
  }
  array(path: string, value: unknown, max: number, min = 0): unknown[] {
    if (value === undefined || value === null) {
      if (min > 0) this.fail(path, 'required')
      return []
    }
    if (!Array.isArray(value)) {
      this.fail(path, 'invalid')
      return []
    }
    if (value.length > max) this.fail(path, 'tooMany')
    if (value.length < min) this.fail(path, 'required')
    return value.slice(0, max)
  }
}

const isLevel = (value: unknown): value is FeatureLevel => typeof value === 'string' && (FEATURE_LEVELS as readonly string[]).includes(value)

export function parseComparison(raw: unknown, packageCodes: readonly string[]): ComparisonDoc {
  const c = new DocChecker()
  const body = isRecord(raw) ? raw : {}
  if (!isRecord(raw)) c.fail('document', 'invalid')

  const tiers: TierEntry[] = []
  c.array('tiers', body.tiers, LIMITS.tiers, 1).forEach((item, index) => {
    const at = `tiers.${index}`
    const entry = isRecord(item) ? item : {}
    if (!isRecord(item)) c.fail(at, 'invalid')
    const code = typeof entry.package === 'string' && PACKAGE_CODE.test(entry.package) ? entry.package : ''
    if (!code) c.fail(`${at}.package`, 'invalid')
    else if (!packageCodes.includes(code)) c.fail(`${at}.package`, 'unknown')
    else if (tiers.some((tier) => tier.package === code)) c.fail(`${at}.package`, 'duplicate')
    const buildsOn = entry.buildsOn === null || entry.buildsOn === undefined || entry.buildsOn === '' ? null : typeof entry.buildsOn === 'string' ? entry.buildsOn : (c.fail(`${at}.buildsOn`, 'invalid'), null)
    tiers.push({ package: code, label: c.tri(`${at}.label`, entry.label, 60, { required: true }), buildsOn })
  })
  const codes = tiers.map((tier) => tier.package)
  tiers.forEach((tier, index) => {
    if (tier.buildsOn === null) return
    if (tier.buildsOn === tier.package || !codes.includes(tier.buildsOn)) return c.fail(`tiers.${index}.buildsOn`, 'invalid')
    // The ladder never loops back on itself.
    const seen = new Set([tier.package])
    for (let next: string | null = tier.buildsOn; next !== null; next = tiers.find((candidate) => candidate.package === next)?.buildsOn ?? null) {
      if (seen.has(next)) return c.fail(`tiers.${index}.buildsOn`, 'invalid')
      seen.add(next)
    }
  })

  const features: ComparisonFeature[] = []
  c.array('features', body.features, LIMITS.features).forEach((item, index) => {
    const at = `features.${index}`
    const entry = isRecord(item) ? item : {}
    if (!isRecord(item)) c.fail(at, 'invalid')
    const id = c.id(`${at}.id`, entry.id)
    if (id && features.some((feature) => feature.id === id)) c.fail(`${at}.id`, 'duplicate')
    const levels: Record<string, FeatureLevel> = {}
    const given = isRecord(entry.levels) ? entry.levels : {}
    if (entry.levels !== undefined && !isRecord(entry.levels)) c.fail(`${at}.levels`, 'invalid')
    for (const code of codes) {
      const level = given[code]
      if (level !== undefined && !isLevel(level)) c.fail(`${at}.levels.${code}`, 'invalid')
      levels[code] = isLevel(level) ? level : 'none'
    }
    for (const code of Object.keys(given)) if (!codes.includes(code)) c.fail(`${at}.levels.${code}`, 'unknown')
    features.push({ id, name: c.tri(`${at}.name`, entry.name, 80, { required: true }), description: c.tri(`${at}.description`, entry.description, 240), levels })
  })
  c.done()
  return { version: 1, tiers, features }
}

const parseTitled = (c: DocChecker, path: string, value: unknown, max: number, titleMax: number, textMax: number): TitledText[] => {
  const out: TitledText[] = []
  c.array(path, value, max).forEach((item, index) => {
    const at = `${path}.${index}`
    const entry = isRecord(item) ? item : {}
    if (!isRecord(item)) c.fail(at, 'invalid')
    const id = c.id(`${at}.id`, entry.id)
    if (id && out.some((other) => other.id === id)) c.fail(`${at}.id`, 'duplicate')
    out.push({ id, title: c.tri(`${at}.title`, entry.title, titleMax, { required: true }), text: c.tri(`${at}.text`, entry.text, textMax, { multiline: true }) })
  })
  return out
}

export function parseFullExperience(raw: unknown): FullExperienceDoc {
  const c = new DocChecker()
  const body = isRecord(raw) ? raw : {}
  if (!isRecord(raw)) c.fail('document', 'invalid')
  const heroIn = isRecord(body.hero) ? body.hero : {}
  const teaserIn = isRecord(body.teaser) ? body.teaser : {}
  const confIn = isRecord(body.configurator) ? body.configurator : {}

  const hero = {
    eyebrow: c.tri('hero.eyebrow', heroIn.eyebrow, 60, { required: true }),
    headline: c.tri('hero.headline', heroIn.headline, 120, { required: true }),
    supporting: c.tri('hero.supporting', heroIn.supporting, 400, { required: true, multiline: true }),
    primaryCta: c.tri('hero.primaryCta', heroIn.primaryCta, 60, { required: true }),
    secondaryCta: c.tri('hero.secondaryCta', heroIn.secondaryCta, 60, { required: true }),
  }
  const teaser = { title: c.tri('teaser.title', teaserIn.title, 120, { required: true }), text: c.tri('teaser.text', teaserIn.text, 400, { required: true, multiline: true }) }
  const priceLabel = c.tri('priceLabel', body.priceLabel, 60, { required: true })
  const stages = parseTitled(c, 'stages', body.stages, LIMITS.stages, 80, 300)
  const components = parseTitled(c, 'components', body.components, LIMITS.components, 80, 300)

  const faq: FullExperienceDoc['faq'] = []
  c.array('faq', body.faq, LIMITS.faq).forEach((item, index) => {
    const at = `faq.${index}`
    const entry = isRecord(item) ? item : {}
    if (!isRecord(item)) c.fail(at, 'invalid')
    const id = c.id(`${at}.id`, entry.id)
    if (id && faq.some((other) => other.id === id)) c.fail(`${at}.id`, 'duplicate')
    faq.push({ id, question: c.tri(`${at}.question`, entry.question, 200, { required: true }), answer: c.tri(`${at}.answer`, entry.answer, 800, { required: true, multiline: true }) })
  })

  const questions: Question[] = []
  c.array('configurator.questions', confIn.questions, LIMITS.questions, CORE_QUESTIONS.length).forEach((item, index) => {
    const at = `configurator.questions.${index}`
    const entry = isRecord(item) ? item : {}
    if (!isRecord(item)) c.fail(at, 'invalid')
    const id = c.id(`${at}.id`, entry.id)
    if (id && questions.some((other) => other.id === id)) c.fail(`${at}.id`, 'duplicate')
    const kind = typeof entry.kind === 'string' && (QUESTION_KINDS as readonly string[]).includes(entry.kind) ? (entry.kind as QuestionKind) : (c.fail(`${at}.kind`, entry.kind === undefined ? 'required' : 'invalid'), 'single')
    if (id === MULTI_CORE && kind !== 'multi') c.fail(`${at}.kind`, 'invalid')
    if ((CORE_QUESTIONS as readonly string[]).includes(id) && id !== MULTI_CORE && kind !== 'single') c.fail(`${at}.kind`, 'invalid')
    const options: QuestionOption[] = []
    c.array(`${at}.options`, entry.options, LIMITS.optionsPerQuestion, 2).forEach((option, position) => {
      const where = `${at}.options.${position}`
      const o = isRecord(option) ? option : {}
      if (!isRecord(option)) c.fail(where, 'invalid')
      const optionId = c.id(`${where}.id`, o.id)
      if (optionId && options.some((other) => other.id === optionId)) c.fail(`${where}.id`, 'duplicate')
      options.push({ id: optionId, label: c.tri(`${where}.label`, o.label, 100, { required: true }), hint: c.tri(`${where}.hint`, o.hint, 200), unsure: o.unsure === true })
    })
    questions.push({ id, kind, required: entry.required === true, title: c.tri(`${at}.title`, entry.title, 120, { required: true }), help: c.tri(`${at}.help`, entry.help, 240), options })
  })
  for (const core of CORE_QUESTIONS) if (!questions.some((question) => question.id === core)) c.fail('configurator.questions', 'required')
  // The way out of the budget question is never taken away: not everyone knows, and the brief asks for it to be there always.
  const budget = questions.findIndex((question) => question.id === 'budget')
  if (budget >= 0 && !questions[budget].options.some((option) => option.unsure)) c.fail(`configurator.questions.${budget}.options`, 'required')

  const intro = c.tri('configurator.intro', confIn.intro, 300, { multiline: true })
  c.done()
  return { version: 1, hero, teaser, priceLabel, stages, components, faq, configurator: { intro, questions } }
}

// ---- storage ---------------------------------------------------------------------------------------------------------

interface Row {
  code: DocumentCode
  draft_json: string
  published_json: string | null
  published_at: string | null
  created_at: string
  updated_at: string
}

export interface DocumentView<T> {
  code: DocumentCode
  draft: T
  published: T | null
  publishedAt: string | null
  updatedAt: string
  /** The draft differs from what is published (or nothing is published). */
  changed: boolean
}

const PARSERS: Record<DocumentCode, (raw: unknown, packageCodes: readonly string[]) => unknown> = {
  comparison: (raw, codes) => parseComparison(raw, codes),
  full_experience: (raw) => parseFullExperience(raw),
}

export const packageCodesOf = (db: Database): string[] => db.all<{ code: string }>('SELECT code FROM packages ORDER BY position, id').map((row) => row.code)

const readRow = (db: Database, code: DocumentCode): Row | undefined => db.get<Row>('SELECT * FROM shop_documents WHERE code = ?', [code])
const parseJson = (text: string | null): unknown => {
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export const isDocumentCode = (value: string): value is DocumentCode => (DOCUMENT_CODES as readonly string[]).includes(value)

function view<T>(row: Row): DocumentView<T> {
  return {
    code: row.code,
    draft: parseJson(row.draft_json) as T,
    published: parseJson(row.published_json) as T | null,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    changed: row.published_json === null || row.published_json !== row.draft_json,
  }
}

/** The published documents, as visitors get them; `null` for one that is not published. Never throws on a damaged row. */
export function publishedDocuments(db: Database): { comparison: ComparisonDoc | null; fullExperience: FullExperienceDoc | null } {
  const one = <T>(code: DocumentCode): T | null => {
    const row = readRow(db, code)
    return row ? (parseJson(row.published_json) as T | null) : null
  }
  return { comparison: one<ComparisonDoc>('comparison'), fullExperience: one<FullExperienceDoc>('full_experience') }
}

export function getDocument(app: AppContext, session: SessionInfo | null, code: DocumentCode): DocumentView<unknown> {
  requirePermission(session, 'requests:read')
  const row = readRow(app.db, code)
  if (!row) throw notFound('The document')
  return view(row)
}

/** Saves the draft. `expectedUpdatedAt` (from when the editor opened) guards against overwriting someone else's save. */
export function saveDraft(app: AppContext, session: SessionInfo | null, code: DocumentCode, body: Record<string, unknown>): DocumentView<unknown> {
  const actor = requirePermission(session, 'catalog:write')
  const row = readRow(app.db, code)
  if (!row) throw notFound('The document')
  if (typeof body.expectedUpdatedAt === 'string' && body.expectedUpdatedAt !== row.updated_at) throw conflict('The document was changed by someone else since you opened it. Reload it before saving.')
  const document = PARSERS[code](body.document, packageCodesOf(app.db))
  const now = iso(app.clock.now())
  app.db.run('UPDATE shop_documents SET draft_json = ?, updated_at = ? WHERE code = ?', [JSON.stringify(document), now, code])
  audit(app, actor, 'shop.save', 'shop_document', code)
  return view(readRow(app.db, code)!)
}

/** Makes the draft the public version. The draft is validated again, so only a document the website can draw ever goes live. */
export function publishDocument(app: AppContext, session: SessionInfo | null, code: DocumentCode): DocumentView<unknown> {
  const actor = requirePermission(session, 'catalog:write')
  const row = readRow(app.db, code)
  if (!row) throw notFound('The document')
  const document = PARSERS[code](parseJson(row.draft_json), packageCodesOf(app.db))
  const now = iso(app.clock.now())
  app.db.run('UPDATE shop_documents SET published_json = ?, published_at = ? WHERE code = ?', [JSON.stringify(document), now, code])
  audit(app, actor, 'shop.publish', 'shop_document', code)
  return view(readRow(app.db, code)!)
}

/** Takes the document off the public site: visitors get the website's own text again. The draft is kept. */
export function unpublishDocument(app: AppContext, session: SessionInfo | null, code: DocumentCode): DocumentView<unknown> {
  const actor = requirePermission(session, 'catalog:write')
  const row = readRow(app.db, code)
  if (!row) throw notFound('The document')
  app.db.run('UPDATE shop_documents SET published_json = NULL, published_at = NULL WHERE code = ?', [code])
  audit(app, actor, 'shop.unpublish', 'shop_document', code)
  return view(readRow(app.db, code)!)
}

// ---- seed ------------------------------------------------------------------------------------------------------------

export const SEED_SHOP_FILE = join(import.meta.dirname, '..', '..', '..', 'seed', 'shop.seed.json')

export interface ShopSeedResult {
  seeded: boolean
  documents: number
}

/**
 * Loads the website's own comparison and FULL EXPERIENCE text (server/seed/shop.seed.json, written from the static content by
 * `npm run catalog:seed-export`) into an empty `shop_documents` table, as a draft that is also published, so the public site and
 * the administration start with the same words. It never overwrites: once a document exists the database is the master copy.
 */
export function seedShopDocuments(app: AppContext, file = SEED_SHOP_FILE): ShopSeedResult {
  const existing = app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM shop_documents')?.n ?? 0
  if (existing > 0) return { seeded: false, documents: 0 }
  const data: unknown = JSON.parse(readFileSync(file, 'utf8'))
  if (!isRecord(data)) throw new Error('The shop seed file is not an object.')
  const codes = packageCodesOf(app.db)
  // The comparison is about the catalogue's packages: with none there is nothing to compare yet (the catalogue is seeded first).
  if (codes.length === 0) return { seeded: false, documents: 0 }
  const comparison = parseComparison(data.comparison, codes)
  const fullExperience = parseFullExperience(data.fullExperience)
  const now = iso(app.clock.now())
  app.db.transaction(() => {
    for (const [code, document] of [['comparison', comparison], ['full_experience', fullExperience]] as const) {
      const json = JSON.stringify(document)
      app.db.run('INSERT INTO shop_documents (code, draft_json, published_json, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [code, json, json, now, now, now])
    }
  })
  return { seeded: true, documents: 2 }
}
