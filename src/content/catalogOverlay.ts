import type { Addon } from './services/addons'
import type { ServiceArea } from './services/areas'
import type { ServiceDetail } from './services/detail'
import type { FaqItem } from './services/faq'
import type { ServicePackage } from './packages'
import type { ServicePrice, VatMode } from './pricing'
import type { Trilingual } from './trilingual'
import { LANGUAGES } from '../i18n/config'
import type { Comparison } from './shop/comparison'
import { readComparison, readFullExperience } from './shop/documents'
import type { FullExperience } from './shop/fullExperience'

/**
 * What the owner edits in the administration reaches the website here, at build time. `npm run catalog:pull`
 * writes the backend's catalogue to `catalog.generated.json` (git-ignored); this module lays it over the static
 * content in this folder. With no such file nothing changes: the static content is the whole truth, which is how
 * a checkout with no backend builds.
 *
 * What the overlay may change, and what it may not:
 *   - packages and add-ons the website already knows (matched by code): the price and its VAT mode, the
 *     texts in all three languages, `featured` and `quoteRequired`. A published price is taken only if it is
 *     complete (an amount in whole units, EUR or HUF, a VAT mode that says something): the same rule the
 *     content tests and the database enforce. A half-valid entry is ignored as a whole, never half-applied.
 *   - the four services the website already knows (matched by slug): the name, summary and feature list of
 *     their block on the services page (`title`, `summary`, `features`) and the tagline and overview of their
 *     own page (`tagline`, `overview`). The rest of a service page (benefits, typical projects, the process note,
 *     its questions) is the website's own writing and stays in the source.
 *   - the FAQ: the list is replaced (entries added, edited, reordered, removed), because nothing in the site's
 *     code depends on a particular entry.
 *   - availability and order: an add-on the catalogue no longer lists (disabled in the administration) is marked
 *     `available: false` and the pages stop offering it; a package it no longer lists is marked the same and shown as
 *     not available at the moment; when every entry has a display position the list follows it.
 *   - the tier comparison and the FULL EXPERIENCE offer: the published documents replace the website's own, as a whole
 *     (shop/documents.ts decides whether a document can be drawn; if not, the website's own stays).
 *   - never: which packages, add-ons and services exist, which need a package suits, which add-ons a package
 *     takes. The pages, the cart and the quote form are built around those; changing them is a change to the
 *     source, and `npm run catalog:seed-export` carries it to the backend.
 * Anything missing or malformed in the file is skipped silently here (the pull script is where it is reported):
 * a bad file must not be able to break the site's build.
 */

const files = import.meta.glob<unknown>('./catalog.generated.json', { eager: true, import: 'default' })

/** The pulled catalogue, or `null` when there is none. */
export const generatedCatalog: unknown = Object.values(files)[0] ?? null

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const entriesOf = (catalog: unknown, key: string): Record<string, unknown>[] | null => {
  if (!isRecord(catalog) || !Array.isArray(catalog[key])) return null
  return (catalog[key] as unknown[]).filter(isRecord)
}

const TEXT_MAX = 3000
const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' && value.length <= TEXT_MAX ? value : null)

/** `translations.<lang>.<field>` as one text per language; `null` unless all three exist. */
function trilingual(translations: unknown, field: string): Trilingual | null {
  if (!isRecord(translations)) return null
  const out: Partial<Trilingual> = {}
  for (const lang of LANGUAGES) {
    const entry = translations[lang]
    const value = isRecord(entry) ? text(entry[field]) : null
    if (value === null) return null
    out[lang] = value
  }
  return out as Trilingual
}

/** `translations.<lang>.<field>` as a list of texts, one Trilingual per item; `null` unless the three lists exist and line up. */
function trilingualList(translations: unknown, field: string): Trilingual[] | null {
  if (!isRecord(translations)) return null
  const lists: string[][] = []
  for (const lang of LANGUAGES) {
    const entry = translations[lang]
    const list = isRecord(entry) ? entry[field] : null
    if (!Array.isArray(list)) return null
    const texts = list.map(text)
    if (texts.some((item) => item === null)) return null
    lists.push(texts as string[])
  }
  if (lists.some((list) => list.length !== lists[0].length)) return null
  return lists[0].map((_, index) => ({ hu: lists[0][index], en: lists[1][index], nl: lists[2][index] }) as Trilingual)
}

/** A price and its VAT mode, only as a consistent pair; `null` means "leave both as they are". */
function priceOf(entry: Record<string, unknown>): { price: ServicePrice; vat: VatMode } | null {
  const raw = entry.price
  if (!isRecord(raw)) return null
  const vat = entry.vat
  if (vat !== 'unspecified' && vat !== 'excluded' && vat !== 'included' && vat !== 'exempt') return null
  if (raw.kind === 'quote' || raw.kind === 'tbd') return { price: { kind: raw.kind }, vat }
  if (raw.kind !== 'from') return null
  const { amount, currency } = raw
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1 || amount > 100_000_000) return null
  if (currency !== 'EUR' && currency !== 'HUF') return null
  if (vat === 'unspecified') return null
  return { price: { kind: 'from', amount, currency }, vat }
}

const defined = <T extends object>(value: T): Partial<T> => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>

/** The list in the administration's display order, when every entry the website knows has one (a half-set order leaves the source's). */
function byPosition<T extends { id: string }>(items: readonly T[], entries: Record<string, unknown>[]): readonly T[] {
  const positions = items.map((item) => entries.find((entry) => entry.code === item.id)?.position)
  if (!positions.every((position) => typeof position === 'number' && Number.isInteger(position))) return items
  return items.map((item, index) => ({ item, index, at: positions[index] as number })).sort((a, b) => a.at - b.at || a.index - b.index).map((entry) => entry.item)
}

export function overlayPackages(base: readonly ServicePackage[], catalog: unknown = generatedCatalog): readonly ServicePackage[] {
  const entries = entriesOf(catalog, 'packages')
  if (!entries) return base
  const merged = base.map((pack) => {
    const entry = entries.find((candidate) => candidate.code === pack.id)
    if (!entry) return { ...pack, available: false }
    const money = priceOf(entry)
    const note = isRecord(entry.translations) ? trilingual(entry.translations, 'priceNote') : null
    const noteIsEmpty = isRecord(entry.translations) && LANGUAGES.every((lang) => {
      const t = (entry.translations as Record<string, unknown>)[lang]
      return isRecord(t) && (t.priceNote === null || t.priceNote === '') // said to be empty, not just absent
    })
    const changes = defined({
      ...(money ?? {}),
      featured: typeof entry.featured === 'boolean' ? entry.featured : undefined,
      quoteRequired: typeof entry.quoteRequired === 'boolean' ? entry.quoteRequired : undefined,
      priceNote: note ?? (noteIsEmpty ? null : undefined),
      tagline: trilingual(entry.translations, 'tagline') ?? undefined,
      audience: trilingual(entry.translations, 'audience') ?? undefined,
      scope: trilingual(entry.translations, 'scope') ?? undefined,
      customization: trilingual(entry.translations, 'customization') ?? undefined,
      support: trilingual(entry.translations, 'support') ?? undefined,
      includes: trilingualList(entry.translations, 'includes') ?? undefined,
      fits: trilingualList(entry.translations, 'fits') ?? undefined,
      deliverables: trilingualList(entry.translations, 'deliverables') ?? undefined,
    })
    return { ...pack, ...changes }
  })
  return byPosition(merged, entries)
}

/** A service's block on the services page: its name, summary and features. */
export function overlayServiceAreas(base: readonly ServiceArea[], catalog: unknown = generatedCatalog): readonly ServiceArea[] {
  const entries = entriesOf(catalog, 'services')
  if (!entries) return base
  return base.map((area) => {
    const entry = entries.find((candidate) => candidate.slug === area.id)
    if (!entry) return area
    const features = trilingualList(entry.translations, 'features')
    return {
      ...area,
      ...defined({
        name: trilingual(entry.translations, 'title') ?? undefined,
        summary: trilingual(entry.translations, 'summary') ?? undefined,
        // An emptied list leaves the source's: a service block with no feature at all is not something the page is built for.
        features: features && features.length > 0 ? features : undefined,
      }),
    }
  })
}

/** What a service's own page says first: its one-line promise and its overview. */
export function overlayServiceDetails(base: readonly ServiceDetail[], catalog: unknown = generatedCatalog): readonly ServiceDetail[] {
  const entries = entriesOf(catalog, 'services')
  if (!entries) return base
  return base.map((detail) => {
    const entry = entries.find((candidate) => candidate.slug === detail.id)
    if (!entry) return detail
    return { ...detail, ...defined({ tagline: trilingual(entry.translations, 'tagline') ?? undefined, overview: trilingual(entry.translations, 'overview') ?? undefined }) }
  })
}

export function overlayAddons(base: readonly Addon[], catalog: unknown = generatedCatalog): readonly Addon[] {
  const entries = entriesOf(catalog, 'extras')
  if (!entries) return base
  const merged = base.map((addon) => {
    const entry = entries.find((candidate) => candidate.code === addon.id)
    // The catalogue lists only what is on offer: an add-on it does not list has been switched off.
    if (!entry) return { ...addon, available: false }
    return { ...addon, ...defined({ ...(priceOf(entry) ?? {}), name: trilingual(entry.translations, 'name') ?? undefined, summary: trilingual(entry.translations, 'summary') ?? undefined }) }
  })
  return byPosition(merged, entries)
}

/** The tier comparison as the backend published it; the website's own when there is none or it cannot be drawn. */
export function overlayComparison(base: Comparison, catalog: unknown = generatedCatalog): Comparison {
  return (isRecord(catalog) ? readComparison(catalog.comparison) : null) ?? base
}

/** The FULL EXPERIENCE offer as the backend published it; the website's own when there is none or it cannot be drawn. */
export function overlayFullExperience(base: FullExperience, catalog: unknown = generatedCatalog): FullExperience {
  return (isRecord(catalog) ? readFullExperience(catalog.fullExperience) : null) ?? base
}

/** The FAQ as the backend has it, in its order; the static list when the backend's is missing, empty or malformed. */
export function overlayFaq(base: readonly FaqItem[], catalog: unknown = generatedCatalog): readonly FaqItem[] {
  const entries = entriesOf(catalog, 'faq')
  if (!entries) return base
  const items: FaqItem[] = []
  for (const entry of entries) {
    const id = typeof entry.slug === 'string' && /^[a-z0-9][a-z0-9-]{1,39}$/.test(entry.slug) ? entry.slug : null
    const question = isRecord(entry.translations) ? questionAnswer(entry.translations, 'question') : null
    const answer = isRecord(entry.translations) ? questionAnswer(entry.translations, 'answer') : null
    if (id && question && answer && !items.some((item) => item.id === id)) items.push({ id, question, answer })
  }
  return items.length > 0 ? items : base
}

const questionAnswer = (translations: Record<string, unknown>, field: 'question' | 'answer'): Trilingual | null => trilingual(translations, field)

/**
 * What the overlay would leave out of a pulled catalogue, as sentences for whoever runs `catalog:pull`. An
 * empty list means every edit in the administration will reach the website.
 */
export function catalogProblems(catalog: unknown, known: { packages: readonly string[]; extras: readonly string[]; services?: readonly string[] }): string[] {
  if (!isRecord(catalog)) return ['The catalogue is not a JSON object.']
  const problems: string[] = []
  const kinds = [
    { key: 'packages', label: 'package', ids: known.packages, texts: ['tagline', 'audience', 'scope', 'customization', 'support'], lists: ['includes', 'fits', 'deliverables'] },
    { key: 'extras', label: 'add-on', ids: known.extras, texts: ['name', 'summary'], lists: [] as string[] },
  ]
  for (const kind of kinds) {
    const entries = entriesOf(catalog, kind.key)
    if (!entries) {
      problems.push(`The catalogue has no "${kind.key}" list.`)
      continue
    }
    for (const entry of entries) {
      const code = typeof entry.code === 'string' ? entry.code : '(no code)'
      if (!kind.ids.includes(code)) {
        problems.push(`The ${kind.label} "${code}" is in the backend but not in the website's source: the API serves it, the website does not show it.`)
        continue
      }
      if (priceOf(entry) === null) problems.push(`The ${kind.label} "${code}" has a price or VAT mode the website cannot use (a published price needs a whole amount, EUR or HUF, and a VAT mode that says something): its price stays as in the source.`)
      for (const field of kind.texts) if (trilingual(entry.translations, field) === null) problems.push(`The ${kind.label} "${code}" has no "${field}" in all three languages: it stays as in the source.`)
      for (const field of kind.lists) if (trilingualList(entry.translations, field) === null) problems.push(`The ${kind.label} "${code}" has a "${field}" list that is missing or does not line up across the languages: it stays as in the source.`)
    }
    for (const id of kind.ids) {
      if (!entries.some((entry) => entry.code === id)) problems.push(`The ${kind.label} "${id}" is not in the backend's active catalogue (disabled or deleted there): the website marks it as not available${kind.key === 'extras' ? ' and stops offering it' : ''}.`)
    }
  }
  if (known.services) {
    const entries = entriesOf(catalog, 'services')
    if (!entries) problems.push('The catalogue has no "services" list.')
    else {
      for (const entry of entries) {
        const slug = typeof entry.slug === 'string' ? entry.slug : '(no slug)'
        if (!known.services.includes(slug)) {
          problems.push(`The service "${slug}" is in the backend but not in the website's source: the API serves it, the website has no page for it.`)
          continue
        }
        for (const field of ['title', 'summary', 'tagline', 'overview']) {
          if (trilingual(entry.translations, field) === null) problems.push(`The service "${slug}" has no "${field}" in all three languages: it stays as in the source.`)
        }
        if (trilingualList(entry.translations, 'features') === null) {
          problems.push(`The service "${slug}" has a "features" list that is missing or does not line up across the languages: it stays as in the source.`)
        }
      }
      for (const slug of known.services) {
        if (!entries.some((entry) => entry.slug === slug)) {
          problems.push(`The service "${slug}" is not in the backend's active catalogue (disabled or deleted there): the website keeps showing it until it is removed from its source.`)
        }
      }
    }
  }
  const faq = entriesOf(catalog, 'faq')
  if (!faq || faq.length === 0) problems.push('The catalogue has no FAQ entries: the website keeps its own list.')
  if (readComparison(catalog.comparison) === null) problems.push('The catalogue has no published tier comparison, or one the website cannot draw: the website keeps its own.')
  if (readFullExperience(catalog.fullExperience) === null) problems.push('The catalogue has no published FULL EXPERIENCE offer, or one the website cannot draw: the website keeps its own.')
  return problems
}
