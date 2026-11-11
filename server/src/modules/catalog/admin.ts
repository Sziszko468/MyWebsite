import type { AppContext, SessionInfo } from '../../context.ts'
import { LANGUAGES, type Language } from '../../config.ts'
import { ConstraintError, conflict, notFound, validationFailed, type FieldCode, type FieldErrors } from '../../http/errors.ts'
import { iso } from '../../lib/time.ts'
import { cleanBlock, cleanLine, isRecord, length } from '../../lib/text.ts'
import { requirePermission } from '../auth/permissions.ts'
import { languageGaps, PUBLISH_FIELDS } from './completeness.ts'
import { audit } from '../system/audit.ts'
import {
  CURRENCIES,
  loadCatalog,
  NEEDS,
  VAT_MODES,
  type ContentRecord,
  type ContentType,
  type Currency,
  type ExtraRecord,
  type Need,
  type PackageRecord,
  type Price,
  type ServiceRecord,
  type Status,
  type VatMode,
} from './repository.ts'

/**
 * Managing the catalogue: services, packages, add-ons and content blocks, with their translations, prices and
 * associations. Input arrives as a plain object (the JSON API sends it; the admin's forms are turned into the same
 * object, modules/admin/forms.ts), is checked in full, and is written in one transaction, so a rejected edit
 * changes nothing. A published price must be complete (an amount, a currency, a VAT mode that says something): the
 * database enforces it too. Rows that requests refer to are never deleted, only disabled.
 */

const CODE = /^[a-z0-9][a-z0-9-]{1,39}$/
const statuses: readonly Status[] = ['active', 'disabled']

export class Checker {
  readonly errors: FieldErrors = {}
  fail(field: string, code: FieldCode): void {
    if (!(field in this.errors)) this.errors[field] = code
  }
  done(): void {
    if (Object.keys(this.errors).length > 0) throw validationFailed(this.errors)
  }

  code(field: string, value: unknown): string {
    if (typeof value !== 'string' || !CODE.test(value)) {
      this.fail(field, value === undefined || value === '' ? 'required' : 'invalid')
      return ''
    }
    return value
  }
  status(value: unknown): Status {
    if (value === undefined) return 'active'
    if (typeof value !== 'string' || !statuses.includes(value as Status)) {
      this.fail('status', 'invalid')
      return 'active'
    }
    return value as Status
  }
  integer(field: string, value: unknown, min: number, max: number, fallback = 0): number {
    if (value === undefined || value === null || value === '') return fallback
    const n = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : Number.NaN
    if (!Number.isInteger(n) || n < min || n > max) {
      this.fail(field, 'invalid')
      return fallback
    }
    return n
  }
  boolean(value: unknown, fallback: boolean): boolean {
    if (value === undefined) return fallback
    return value === true || value === 'true' || value === 'on' || value === '1' || value === 1
  }
  text(field: string, value: unknown, max: number, options: { required?: boolean; multiline?: boolean } = {}): string {
    if (value === undefined || value === null) {
      if (options.required) this.fail(field, 'required')
      return ''
    }
    if (typeof value !== 'string') {
      this.fail(field, 'invalid')
      return ''
    }
    const cleaned = options.multiline ? cleanBlock(value) : cleanLine(value)
    if (!cleaned && options.required) this.fail(field, 'required')
    if (length(cleaned) > max) this.fail(field, 'tooLong')
    return cleaned
  }
  list(field: string, value: unknown, itemMax: number, maxItems = 30): string[] {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value)) {
      this.fail(field, 'invalid')
      return []
    }
    if (value.length > maxItems) this.fail(field, 'tooMany')
    const out: string[] = []
    for (const item of value) {
      if (typeof item !== 'string') {
        this.fail(field, 'invalid')
        continue
      }
      const cleaned = cleanLine(item)
      if (!cleaned) continue
      if (length(cleaned) > itemMax) this.fail(field, 'tooLong')
      out.push(cleaned)
    }
    return out
  }
  needs(field: string, value: unknown): Need[] {
    if (value === undefined || value === null) return []
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !(NEEDS as readonly string[]).includes(item))) {
      this.fail(field, 'invalid')
      return []
    }
    return [...new Set(value as Need[])]
  }
  price(body: Record<string, unknown>): { price: Price; vat: VatMode } {
    const raw = body.price
    const vatRaw = body.vat
    const vat = typeof vatRaw === 'string' && (VAT_MODES as readonly string[]).includes(vatRaw) ? (vatRaw as VatMode) : vatRaw === undefined ? 'unspecified' : null
    if (vat === null) this.fail('vat', 'invalid')
    if (raw === undefined) return { price: { kind: 'quote' }, vat: vat ?? 'unspecified' }
    if (!isRecord(raw) || typeof raw.kind !== 'string' || !['quote', 'tbd', 'from'].includes(raw.kind)) {
      this.fail('price', 'invalid')
      return { price: { kind: 'quote' }, vat: vat ?? 'unspecified' }
    }
    if (raw.kind !== 'from') return { price: { kind: raw.kind as 'quote' | 'tbd' }, vat: vat ?? 'unspecified' }
    const amount = this.integer('price.amount', raw.amount, 1, 100_000_000, 0)
    if (amount < 1) this.fail('price.amount', 'required')
    const currency = typeof raw.currency === 'string' && (CURRENCIES as readonly string[]).includes(raw.currency) ? (raw.currency as Currency) : null
    if (!currency) this.fail('price.currency', raw.currency === undefined ? 'required' : 'invalid')
    // The website's own rule (src/content/packages.test): a published price says how VAT is handled.
    if (vat === 'unspecified' || vat === null) this.fail('vat', 'required')
    return { price: { kind: 'from', amount, currency: currency ?? 'EUR' }, vat: vat ?? 'unspecified' }
  }
}

function translationsOf(body: Record<string, unknown>, check: Checker): Record<Language, Record<string, unknown>> {
  const raw = body.translations
  const out = {} as Record<Language, Record<string, unknown>>
  if (!isRecord(raw)) {
    check.fail('translations', 'required')
    return out
  }
  for (const language of LANGUAGES) {
    const entry = raw[language]
    if (!isRecord(entry)) check.fail(`translations.${language}`, 'required')
    else out[language] = entry
  }
  return out
}

/**
 * An `active` record is on the website, so it must be complete in every language (modules/catalog/completeness.ts); a `disabled`
 * record is a draft and may be saved half-finished. Each gap is reported on the field that is empty, the way every other error is.
 */
function requireAllLanguages(c: Checker, status: Status, translations: Record<Language, object>, fields: readonly string[]): void {
  if (status !== 'active') return
  for (const gap of languageGaps(translations as Record<Language, Record<string, string | readonly string[] | null>>, fields)) c.fail(`translations.${gap.language}.${gap.field}`, 'required')
}

const now = (app: AppContext) => iso(app.clock.now())

function guard<T>(work: () => T, what: string): T {
  try {
    return work()
  } catch (error) {
    if (error instanceof ConstraintError) {
      if (error.kind === 'unique') throw conflict(`${what} already exists.`)
      if (error.kind === 'foreign_key') throw conflict(`${what} is in use. Disable it instead of deleting it.`)
      if (error.kind === 'check') throw validationFailed({ price: 'invalid' }, 'The values are not allowed together.')
    }
    throw error
  }
}

// ---- services --------------------------------------------------------------------------------------------------------

export interface ServiceInput {
  slug: string
  category: string
  status: Status
  position: number
  translations: Record<Language, { title: string; summary: string; tagline: string; overview: string; features: string[] }>
  packages: string[]
}

export function parseService(body: Record<string, unknown>, options: { slug?: string } = {}): ServiceInput {
  const c = new Checker()
  const slug = options.slug ?? c.code('slug', body.slug)
  const category = c.code('category', body.category)
  const status = c.status(body.status)
  const position = c.integer('position', body.position, 0, 9999)
  const translations = {} as ServiceInput['translations']
  const raw = translationsOf(body, c)
  for (const language of LANGUAGES) {
    const t = raw[language]
    if (!t) continue
    const at = (field: string) => `translations.${language}.${field}`
    translations[language] = {
      title: c.text(at('title'), t.title, 120, { required: true }),
      summary: c.text(at('summary'), t.summary, 600, { multiline: true }),
      tagline: c.text(at('tagline'), t.tagline, 200),
      overview: c.text(at('overview'), t.overview, 3000, { multiline: true }),
      features: c.list(at('features'), t.features, 200),
    }
  }
  const packages = c.list('packages', body.packages, 40, 20)
  requireAllLanguages(c, status, translations, PUBLISH_FIELDS.service)
  c.done()
  return { slug, category, status, position, translations, packages }
}

function writeService(app: AppContext, id: number, input: ServiceInput): void {
  const { db } = app
  for (const language of LANGUAGES) {
    const t = input.translations[language]
    db.run(
      `INSERT INTO service_translations (service_id, language, title, summary, tagline, overview, features_json) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (service_id, language) DO UPDATE SET title = excluded.title, summary = excluded.summary, tagline = excluded.tagline, overview = excluded.overview, features_json = excluded.features_json`,
      [id, language, t.title, t.summary, t.tagline, t.overview, JSON.stringify(t.features)],
    )
  }
  db.run('DELETE FROM service_packages WHERE service_id = ?', [id])
  input.packages.forEach((code, position) => {
    const pack = db.get<{ id: number }>('SELECT id FROM packages WHERE code = ?', [code])
    if (!pack) throw validationFailed({ packages: 'unknown' })
    db.run('INSERT OR IGNORE INTO service_packages (service_id, package_id, position) VALUES (?, ?, ?)', [id, pack.id, position])
  })
}

/** Inserts a checked service (also used by the seed, which has no signed-in user). */
export function insertService(app: AppContext, input: ServiceInput): void {
  app.db.transaction(() => {
    const result = app.db.run('INSERT INTO services (slug, category, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [input.slug, input.category, input.status, input.position, now(app), now(app)])
    writeService(app, result.lastInsertRowid, input)
  })
}

export function createService(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): ServiceRecord {
  const actor = requirePermission(session, 'catalog:write')
  const input = parseService(body)
  guard(() => insertService(app, input), 'A service with that slug')
  audit(app, actor, 'service.create', 'service', input.slug)
  return findService(app, input.slug)
}

export function updateService(app: AppContext, session: SessionInfo | null, slug: string, body: Record<string, unknown>): ServiceRecord {
  const actor = requirePermission(session, 'catalog:write')
  const existing = app.db.get<{ id: number }>('SELECT id FROM services WHERE slug = ?', [slug])
  if (!existing) throw notFound('The service')
  const input = parseService(body, { slug })
  guard(
    () =>
      app.db.transaction(() => {
        app.db.run('UPDATE services SET category = ?, status = ?, position = ?, updated_at = ? WHERE id = ?', [input.category, input.status, input.position, now(app), existing.id])
        writeService(app, existing.id, input)
      }),
    'The service',
  )
  audit(app, actor, 'service.update', 'service', slug, { status: input.status })
  return findService(app, slug)
}

export function deleteService(app: AppContext, session: SessionInfo | null, slug: string): void {
  const actor = requirePermission(session, 'catalog:delete')
  const changes = guard(() => app.db.run('DELETE FROM services WHERE slug = ?', [slug]).changes, 'The service')
  if (!changes) throw notFound('The service')
  audit(app, actor, 'service.delete', 'service', slug)
}

export function findService(app: AppContext, slug: string): ServiceRecord {
  const found = loadCatalog(app.db, { includeDisabled: true }).services.find((service) => service.slug === slug)
  if (!found) throw notFound('The service')
  return found
}

// ---- packages --------------------------------------------------------------------------------------------------------

export interface PackageInput {
  code: string
  status: Status
  featured: boolean
  position: number
  price: Price
  vat: VatMode
  quoteRequired: boolean
  translations: Record<Language, { name: string; tagline: string; audience: string; scope: string; customization: string; support: string; priceNote: string | null; includes: string[]; fits: string[]; deliverables: string[] }>
  needs: Need[]
  extras: string[]
}

export function parsePackage(body: Record<string, unknown>, options: { code?: string } = {}): PackageInput {
  const c = new Checker()
  const code = options.code ?? c.code('code', body.code)
  const status = c.status(body.status)
  const featured = c.boolean(body.featured, false)
  const position = c.integer('position', body.position, 0, 9999)
  const { price, vat } = c.price(body)
  const quoteRequired = c.boolean(body.quoteRequired, true)
  const translations = {} as PackageInput['translations']
  const raw = translationsOf(body, c)
  for (const language of LANGUAGES) {
    const t = raw[language]
    if (!t) continue
    const at = (field: string) => `translations.${language}.${field}`
    const note = c.text(at('priceNote'), t.priceNote, 300)
    translations[language] = {
      name: c.text(at('name'), t.name, 60, { required: true }),
      tagline: c.text(at('tagline'), t.tagline, 300),
      audience: c.text(at('audience'), t.audience, 400),
      scope: c.text(at('scope'), t.scope, 400),
      customization: c.text(at('customization'), t.customization, 400),
      support: c.text(at('support'), t.support, 400),
      priceNote: note || null,
      includes: c.list(at('includes'), t.includes, 300),
      fits: c.list(at('fits'), t.fits, 300),
      deliverables: c.list(at('deliverables'), t.deliverables, 300),
    }
  }
  const needs = c.needs('needs', body.needs)
  const extras = c.list('extras', body.extras, 40, 30)
  requireAllLanguages(c, status, translations, PUBLISH_FIELDS.package)
  c.done()
  return { code, status, featured, position, price, vat, quoteRequired, translations, needs, extras }
}

const priceColumns = (price: Price): [string, number | null, string | null] => (price.kind === 'from' ? ['from', price.amount, price.currency] : [price.kind, null, null])

function writePackage(app: AppContext, id: number, input: PackageInput): void {
  const { db } = app
  for (const language of LANGUAGES) {
    const t = input.translations[language]
    db.run(
      `INSERT INTO package_translations (package_id, language, name, tagline, audience, scope, customization, support, price_note, includes_json, fits_json, deliverables_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (package_id, language) DO UPDATE SET name = excluded.name, tagline = excluded.tagline, audience = excluded.audience, scope = excluded.scope, customization = excluded.customization,
         support = excluded.support, price_note = excluded.price_note, includes_json = excluded.includes_json, fits_json = excluded.fits_json, deliverables_json = excluded.deliverables_json`,
      [id, language, t.name, t.tagline, t.audience, t.scope, t.customization, t.support, t.priceNote, JSON.stringify(t.includes), JSON.stringify(t.fits), JSON.stringify(t.deliverables)],
    )
  }
  db.run('DELETE FROM package_needs WHERE package_id = ?', [id])
  for (const need of input.needs) db.run('INSERT INTO package_needs (package_id, need) VALUES (?, ?)', [id, need])
  db.run('DELETE FROM package_extras WHERE package_id = ?', [id])
  for (const code of input.extras) {
    const extra = db.get<{ id: number }>('SELECT id FROM extras WHERE code = ?', [code])
    if (!extra) throw validationFailed({ extras: 'unknown' })
    db.run('INSERT OR IGNORE INTO package_extras (package_id, extra_id) VALUES (?, ?)', [id, extra.id])
  }
}

export function insertPackage(app: AppContext, input: PackageInput): void {
  app.db.transaction(() => {
    const [kind, amount, currency] = priceColumns(input.price)
    const result = app.db.run(
      'INSERT INTO packages (code, status, featured, position, price_kind, price_amount, price_currency, vat_mode, quote_required, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [input.code, input.status, input.featured, input.position, kind, amount, currency, input.vat, input.quoteRequired, now(app), now(app)],
    )
    writePackage(app, result.lastInsertRowid, input)
  })
}

export function createPackage(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): PackageRecord {
  const actor = requirePermission(session, 'catalog:write')
  const input = parsePackage(body)
  guard(() => insertPackage(app, input), 'A package with that code')
  audit(app, actor, 'package.create', 'package', input.code)
  return findPackage(app, input.code)
}

export function updatePackage(app: AppContext, session: SessionInfo | null, code: string, body: Record<string, unknown>): PackageRecord {
  const actor = requirePermission(session, 'catalog:write')
  const existing = app.db.get<{ id: number }>('SELECT id FROM packages WHERE code = ?', [code])
  if (!existing) throw notFound('The package')
  const input = parsePackage(body, { code })
  guard(
    () =>
      app.db.transaction(() => {
        const [kind, amount, currency] = priceColumns(input.price)
        app.db.run('UPDATE packages SET status = ?, featured = ?, position = ?, price_kind = ?, price_amount = ?, price_currency = ?, vat_mode = ?, quote_required = ?, updated_at = ? WHERE id = ?', [
          input.status, input.featured, input.position, kind, amount, currency, input.vat, input.quoteRequired, now(app), existing.id,
        ])
        writePackage(app, existing.id, input)
      }),
    'The package',
  )
  // A price change is the one edit a customer could care about later: it is recorded, with what it became.
  audit(app, actor, 'package.update', 'package', code, { status: input.status, price: input.price.kind === 'from' ? `${input.price.amount} ${input.price.currency}` : input.price.kind })
  return findPackage(app, code)
}

export function deletePackage(app: AppContext, session: SessionInfo | null, code: string): void {
  const actor = requirePermission(session, 'catalog:delete')
  const changes = guard(() => app.db.run('DELETE FROM packages WHERE code = ?', [code]).changes, 'The package')
  if (!changes) throw notFound('The package')
  audit(app, actor, 'package.delete', 'package', code)
}

export function findPackage(app: AppContext, code: string): PackageRecord {
  const found = loadCatalog(app.db, { includeDisabled: true }).packages.find((pack) => pack.code === code)
  if (!found) throw notFound('The package')
  return found
}

// ---- extras ----------------------------------------------------------------------------------------------------------

export interface ExtraInput {
  code: string
  status: Status
  position: number
  price: Price
  vat: VatMode
  translations: Record<Language, { name: string; summary: string }>
  appliesTo: Need[]
}

export function parseExtra(body: Record<string, unknown>, options: { code?: string } = {}): ExtraInput {
  const c = new Checker()
  const code = options.code ?? c.code('code', body.code)
  const status = c.status(body.status)
  const position = c.integer('position', body.position, 0, 9999)
  const { price, vat } = c.price(body)
  const translations = {} as ExtraInput['translations']
  const raw = translationsOf(body, c)
  for (const language of LANGUAGES) {
    const t = raw[language]
    if (!t) continue
    translations[language] = { name: c.text(`translations.${language}.name`, t.name, 80, { required: true }), summary: c.text(`translations.${language}.summary`, t.summary, 400, { multiline: true }) }
  }
  const appliesTo = c.needs('appliesTo', body.appliesTo)
  requireAllLanguages(c, status, translations, PUBLISH_FIELDS.extra)
  c.done()
  return { code, status, position, price, vat, translations, appliesTo }
}

function writeExtra(app: AppContext, id: number, input: ExtraInput): void {
  const { db } = app
  for (const language of LANGUAGES) {
    const t = input.translations[language]
    db.run('INSERT INTO extra_translations (extra_id, language, name, summary) VALUES (?, ?, ?, ?) ON CONFLICT (extra_id, language) DO UPDATE SET name = excluded.name, summary = excluded.summary', [id, language, t.name, t.summary])
  }
  db.run('DELETE FROM extra_needs WHERE extra_id = ?', [id])
  for (const need of input.appliesTo) db.run('INSERT INTO extra_needs (extra_id, need) VALUES (?, ?)', [id, need])
}

export function insertExtra(app: AppContext, input: ExtraInput): void {
  app.db.transaction(() => {
    const [kind, amount, currency] = priceColumns(input.price)
    const result = app.db.run('INSERT INTO extras (code, status, position, price_kind, price_amount, price_currency, vat_mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      input.code, input.status, input.position, kind, amount, currency, input.vat, now(app), now(app),
    ])
    writeExtra(app, result.lastInsertRowid, input)
  })
}

export function createExtra(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): ExtraRecord {
  const actor = requirePermission(session, 'catalog:write')
  const input = parseExtra(body)
  guard(() => insertExtra(app, input), 'An add-on with that code')
  audit(app, actor, 'extra.create', 'extra', input.code)
  return findExtra(app, input.code)
}

export function updateExtra(app: AppContext, session: SessionInfo | null, code: string, body: Record<string, unknown>): ExtraRecord {
  const actor = requirePermission(session, 'catalog:write')
  const existing = app.db.get<{ id: number }>('SELECT id FROM extras WHERE code = ?', [code])
  if (!existing) throw notFound('The add-on')
  const input = parseExtra(body, { code })
  guard(
    () =>
      app.db.transaction(() => {
        const [kind, amount, currency] = priceColumns(input.price)
        app.db.run('UPDATE extras SET status = ?, position = ?, price_kind = ?, price_amount = ?, price_currency = ?, vat_mode = ?, updated_at = ? WHERE id = ?', [input.status, input.position, kind, amount, currency, input.vat, now(app), existing.id])
        writeExtra(app, existing.id, input)
      }),
    'The add-on',
  )
  audit(app, actor, 'extra.update', 'extra', code, { status: input.status, price: input.price.kind === 'from' ? `${input.price.amount} ${input.price.currency}` : input.price.kind })
  return findExtra(app, code)
}

export function deleteExtra(app: AppContext, session: SessionInfo | null, code: string): void {
  const actor = requirePermission(session, 'catalog:delete')
  const changes = guard(() => app.db.run('DELETE FROM extras WHERE code = ?', [code]).changes, 'The add-on')
  if (!changes) throw notFound('The add-on')
  audit(app, actor, 'extra.delete', 'extra', code)
}

export function findExtra(app: AppContext, code: string): ExtraRecord {
  const found = loadCatalog(app.db, { includeDisabled: true }).extras.find((extra) => extra.code === code)
  if (!found) throw notFound('The add-on')
  return found
}

// ---- content ---------------------------------------------------------------------------------------------------------

export interface ContentInput {
  type: ContentType
  slug: string
  status: Status
  position: number
  translations: Record<Language, { title: string; description: string }>
}

const CONTENT_TYPES: readonly ContentType[] = ['faq', 'text', 'project']

export function parseContent(body: Record<string, unknown>, options: { type?: ContentType; slug?: string } = {}): ContentInput {
  const c = new Checker()
  let type = options.type
  if (!type) {
    if (typeof body.type !== 'string' || !CONTENT_TYPES.includes(body.type as ContentType)) c.fail('type', body.type === undefined ? 'required' : 'invalid')
    else type = body.type as ContentType
  }
  const slug = options.slug ?? c.code('slug', body.slug)
  const status = c.status(body.status)
  const position = c.integer('position', body.position, 0, 9999)
  const translations = {} as ContentInput['translations']
  const raw = translationsOf(body, c)
  for (const language of LANGUAGES) {
    const t = raw[language]
    if (!t) continue
    const at = (field: string) => `translations.${language}.${field}`
    translations[language] = { title: c.text(at('title'), t.title, 300, { required: true }), description: c.text(at('description'), t.description, 3000, { multiline: true }) }
  }
  requireAllLanguages(c, status, translations, PUBLISH_FIELDS.content)
  c.done()
  return { type: type!, slug, status, position, translations }
}

function writeContent(app: AppContext, id: number, input: ContentInput): void {
  for (const language of LANGUAGES) {
    const t = input.translations[language]
    app.db.run(
      `INSERT INTO site_content_translations (content_id, language, title, description, data_json) VALUES (?, ?, ?, ?, '{}')
       ON CONFLICT (content_id, language) DO UPDATE SET title = excluded.title, description = excluded.description`,
      [id, language, t.title, t.description],
    )
  }
}

export function insertContent(app: AppContext, input: ContentInput): void {
  app.db.transaction(() => {
    const result = app.db.run('INSERT INTO site_content (type, slug, status, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [input.type, input.slug, input.status, input.position, now(app), now(app)])
    writeContent(app, result.lastInsertRowid, input)
  })
}

export function createContent(app: AppContext, session: SessionInfo | null, body: Record<string, unknown>): ContentRecord {
  const actor = requirePermission(session, 'content:write')
  const input = parseContent(body)
  guard(() => insertContent(app, input), 'A content block with that slug')
  audit(app, actor, 'content.create', input.type, input.slug)
  return findContent(app, input.type, input.slug)
}

export function updateContent(app: AppContext, session: SessionInfo | null, type: ContentType, slug: string, body: Record<string, unknown>): ContentRecord {
  const actor = requirePermission(session, 'content:write')
  const existing = app.db.get<{ id: number }>('SELECT id FROM site_content WHERE type = ? AND slug = ?', [type, slug])
  if (!existing) throw notFound('The content block')
  const input = parseContent(body, { type, slug })
  guard(
    () =>
      app.db.transaction(() => {
        app.db.run('UPDATE site_content SET status = ?, position = ?, updated_at = ? WHERE id = ?', [input.status, input.position, now(app), existing.id])
        writeContent(app, existing.id, input)
      }),
    'The content block',
  )
  audit(app, actor, 'content.update', type, slug)
  return findContent(app, type, slug)
}

export function deleteContent(app: AppContext, session: SessionInfo | null, type: ContentType, slug: string): void {
  const actor = requirePermission(session, 'content:delete')
  const changes = app.db.run('DELETE FROM site_content WHERE type = ? AND slug = ?', [type, slug]).changes
  if (!changes) throw notFound('The content block')
  audit(app, actor, 'content.delete', type, slug)
}

export function findContent(app: AppContext, type: ContentType, slug: string): ContentRecord {
  const found = loadCatalog(app.db, { includeDisabled: true }).content.find((item) => item.type === type && item.slug === slug)
  if (!found) throw notFound('The content block')
  return found
}

export function adminCatalog(app: AppContext, session: SessionInfo | null) {
  requirePermission(session, 'requests:read')
  return loadCatalog(app.db, { includeDisabled: true })
}

// ---- display order ---------------------------------------------------------------------------------------------------

export const ORDERABLE = ['services', 'packages', 'extras', 'faq'] as const
export type Orderable = (typeof ORDERABLE)[number]

const ORDER_SQL: Record<Orderable, { list: string; update: string }> = {
  services: { list: 'SELECT slug AS key FROM services', update: 'UPDATE services SET position = ?, updated_at = ? WHERE slug = ?' },
  packages: { list: 'SELECT code AS key FROM packages', update: 'UPDATE packages SET position = ?, updated_at = ? WHERE code = ?' },
  extras: { list: 'SELECT code AS key FROM extras', update: 'UPDATE extras SET position = ?, updated_at = ? WHERE code = ?' },
  faq: { list: "SELECT slug AS key FROM site_content WHERE type = 'faq'", update: "UPDATE site_content SET position = ?, updated_at = ? WHERE slug = ? AND type = 'faq'" },
}

/** Sets the display order of everything of one kind: `keys` must be exactly the existing slugs/codes, each once, in the new order. */
export function reorder(app: AppContext, session: SessionInfo | null, kind: Orderable, keys: unknown): void {
  const actor = requirePermission(session, kind === 'faq' ? 'content:write' : 'catalog:write')
  if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) throw validationFailed({ keys: 'invalid' })
  const sql = ORDER_SQL[kind]
  const existing = app.db.all<{ key: string }>(sql.list).map((row) => row.key)
  const wanted = keys as string[]
  if (new Set(wanted).size !== wanted.length || wanted.length !== existing.length || !wanted.every((key) => existing.includes(key))) throw validationFailed({ keys: 'invalid' })
  app.db.transaction(() => {
    wanted.forEach((key, position) => app.db.run(sql.update, [position, now(app), key]))
  })
  audit(app, actor, 'catalog.reorder', kind, null, { count: wanted.length })
}
