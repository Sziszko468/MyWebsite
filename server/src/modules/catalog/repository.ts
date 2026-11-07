import type { Database } from '../../db/database.ts'
import { LANGUAGES, type Language } from '../../config.ts'
import { publishedDocuments } from '../shop/documents.ts'

/**
 * The catalogue as records: services, packages, add-ons and content blocks with their translations and
 * associations, read in a handful of queries (the whole catalogue is a few dozen rows) and assembled here.
 * The public API (read.ts), the admin (admin.ts) and the quote validation (modules/quotes) all start from
 * these records, so a price or a status is only ever interpreted in one place.
 */

export const NEEDS = ['website', 'webapp', 'improve', 'ui', 'integrations', 'unsure'] as const
export type Need = (typeof NEEDS)[number]
export const CURRENCIES = ['EUR', 'HUF'] as const
export type Currency = (typeof CURRENCIES)[number]
export const VAT_MODES = ['unspecified', 'excluded', 'included', 'exempt'] as const
export type VatMode = (typeof VAT_MODES)[number]
export type Status = 'active' | 'disabled'

/** `quote`: it depends on the project; `tbd`: not decided; `from`: a published starting price in whole currency units. */
export type Price = { kind: 'quote' } | { kind: 'tbd' } | { kind: 'from'; amount: number; currency: Currency }

export interface ServiceText {
  title: string
  summary: string
  tagline: string
  overview: string
  features: string[]
}
export interface PackageText {
  name: string
  tagline: string
  audience: string
  scope: string
  customization: string
  support: string
  priceNote: string | null
  includes: string[]
  fits: string[]
  deliverables: string[]
}
export interface ExtraText {
  name: string
  summary: string
}
export interface ContentText {
  title: string
  description: string
  data: Record<string, unknown>
}

export type Translations<T> = Partial<Record<Language, T>>

export interface ServiceRecord {
  id: number
  slug: string
  category: string
  status: Status
  position: number
  translations: Translations<ServiceText>
  /** The packages the service's page offers first, in order (codes). */
  packages: string[]
}
export interface PackageRecord {
  id: number
  code: string
  status: Status
  featured: boolean
  position: number
  price: Price
  vat: VatMode
  quoteRequired: boolean
  translations: Translations<PackageText>
  needs: Need[]
  extras: string[]
}
export interface ExtraRecord {
  id: number
  code: string
  status: Status
  position: number
  price: Price
  vat: VatMode
  translations: Translations<ExtraText>
  appliesTo: Need[]
}
export type ContentType = 'faq' | 'text' | 'project'
export interface ContentRecord {
  id: number
  type: ContentType
  slug: string
  status: Status
  position: number
  translations: Translations<ContentText>
}

export interface Catalog {
  services: ServiceRecord[]
  packages: PackageRecord[]
  extras: ExtraRecord[]
  content: ContentRecord[]
  /** The published comparison matrix and FULL EXPERIENCE offer (modules/shop/documents.ts); `null` for one that is not published. */
  documents: ReturnType<typeof publishedDocuments>
}

const list = (json: string): string[] => {
  try {
    const value: unknown = JSON.parse(json)
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}
const object = (json: string): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(json)
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function priceOf(kind: string, amount: number | null, currency: string | null): Price {
  return kind === 'from' && amount !== null && currency !== null ? { kind: 'from', amount, currency: currency as Currency } : { kind: kind === 'tbd' ? 'tbd' : 'quote' }
}

const isLanguage = (value: string): value is Language => (LANGUAGES as readonly string[]).includes(value)

export function loadCatalog(db: Database, options: { includeDisabled: boolean } = { includeDisabled: false }): Catalog {
  const active = (alias: string) => (options.includeDisabled ? '' : `WHERE ${alias}.status = 'active'`)

  const services = db.all<{ id: number; slug: string; category: string; status: Status; position: number }>(
    `SELECT id, slug, category, status, position FROM services s ${active('s')} ORDER BY position, id`,
  ).map((row): ServiceRecord => ({ ...row, translations: {}, packages: [] }))
  const serviceById = new Map(services.map((service) => [service.id, service]))
  for (const row of db.all<{ service_id: number; language: string; title: string; summary: string; tagline: string; overview: string; features_json: string }>('SELECT * FROM service_translations')) {
    const service = serviceById.get(row.service_id)
    if (service && isLanguage(row.language)) service.translations[row.language] = { title: row.title, summary: row.summary, tagline: row.tagline, overview: row.overview, features: list(row.features_json) }
  }

  const packages = db.all<{ id: number; code: string; status: Status; featured: number; position: number; price_kind: string; price_amount: number | null; price_currency: string | null; vat_mode: VatMode; quote_required: number }>(
    `SELECT id, code, status, featured, position, price_kind, price_amount, price_currency, vat_mode, quote_required FROM packages p ${active('p')} ORDER BY position, id`,
  ).map(
    (row): PackageRecord => ({
      id: row.id,
      code: row.code,
      status: row.status,
      featured: row.featured === 1,
      position: row.position,
      price: priceOf(row.price_kind, row.price_amount, row.price_currency),
      vat: row.vat_mode,
      quoteRequired: row.quote_required === 1,
      translations: {},
      needs: [],
      extras: [],
    }),
  )
  const packageById = new Map(packages.map((pack) => [pack.id, pack]))
  for (const row of db.all<{ package_id: number; language: string; name: string; tagline: string; audience: string; scope: string; customization: string; support: string; price_note: string | null; includes_json: string; fits_json: string; deliverables_json: string }>('SELECT * FROM package_translations')) {
    const pack = packageById.get(row.package_id)
    if (pack && isLanguage(row.language)) {
      pack.translations[row.language] = {
        name: row.name,
        tagline: row.tagline,
        audience: row.audience,
        scope: row.scope,
        customization: row.customization,
        support: row.support,
        priceNote: row.price_note,
        includes: list(row.includes_json),
        fits: list(row.fits_json),
        deliverables: list(row.deliverables_json),
      }
    }
  }
  for (const row of db.all<{ package_id: number; need: Need }>('SELECT package_id, need FROM package_needs ORDER BY need')) packageById.get(row.package_id)?.needs.push(row.need)

  const extras = db.all<{ id: number; code: string; status: Status; position: number; price_kind: string; price_amount: number | null; price_currency: string | null; vat_mode: VatMode }>(
    `SELECT id, code, status, position, price_kind, price_amount, price_currency, vat_mode FROM extras e ${active('e')} ORDER BY position, id`,
  ).map((row): ExtraRecord => ({ id: row.id, code: row.code, status: row.status, position: row.position, price: priceOf(row.price_kind, row.price_amount, row.price_currency), vat: row.vat_mode, translations: {}, appliesTo: [] }))
  const extraById = new Map(extras.map((extra) => [extra.id, extra]))
  for (const row of db.all<{ extra_id: number; language: string; name: string; summary: string }>('SELECT * FROM extra_translations')) {
    const extra = extraById.get(row.extra_id)
    if (extra && isLanguage(row.language)) extra.translations[row.language] = { name: row.name, summary: row.summary }
  }
  for (const row of db.all<{ extra_id: number; need: Need }>('SELECT extra_id, need FROM extra_needs ORDER BY need')) extraById.get(row.extra_id)?.appliesTo.push(row.need)

  const extraCodeById = new Map(extras.map((extra) => [extra.id, extra.code]))
  // Associations name codes; one that points at a hidden (disabled) row simply is not listed in the public view.
  const allExtraCodes = new Map(db.all<{ id: number; code: string }>('SELECT id, code FROM extras').map((row) => [row.id, row.code]))
  for (const row of db.all<{ package_id: number; extra_id: number }>('SELECT package_id, extra_id FROM package_extras ORDER BY extra_id')) {
    const code = extraCodeById.get(row.extra_id) ?? (options.includeDisabled ? allExtraCodes.get(row.extra_id) : undefined)
    if (code) packageById.get(row.package_id)?.extras.push(code)
  }
  const packageCodeById = new Map(packages.map((pack) => [pack.id, pack.code]))
  for (const row of db.all<{ service_id: number; package_id: number }>('SELECT service_id, package_id FROM service_packages ORDER BY position, package_id')) {
    const code = packageCodeById.get(row.package_id)
    if (code) serviceById.get(row.service_id)?.packages.push(code)
  }

  const content = db.all<{ id: number; type: ContentType; slug: string; status: Status; position: number }>(
    `SELECT id, type, slug, status, position FROM site_content c ${active('c')} ORDER BY type, position, id`,
  ).map((row): ContentRecord => ({ ...row, translations: {} }))
  const contentById = new Map(content.map((item) => [item.id, item]))
  for (const row of db.all<{ content_id: number; language: string; title: string; description: string; data_json: string }>('SELECT * FROM site_content_translations')) {
    const item = contentById.get(row.content_id)
    if (item && isLanguage(row.language)) item.translations[row.language] = { title: row.title, description: row.description, data: object(row.data_json) }
  }

  return { services, packages, extras, content, documents: publishedDocuments(db) }
}

export const findServiceBySlug = (db: Database, slug: string): { id: number; status: Status } | undefined => db.get<{ id: number; status: Status }>('SELECT id, status FROM services WHERE slug = ?', [slug])
export const findPackageByCode = (db: Database, code: string): { id: number; status: Status } | undefined => db.get<{ id: number; status: Status }>('SELECT id, status FROM packages WHERE code = ?', [code])
export const findExtraByCode = (db: Database, code: string): { id: number; status: Status } | undefined => db.get<{ id: number; status: Status }>('SELECT id, status FROM extras WHERE code = ?', [code])
