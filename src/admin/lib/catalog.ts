import { LANGUAGES, type Language } from '../../i18n/config'
import type { ContentRecord, ExtraRecord, PackageRecord, Price, ServiceRecord, VatMode } from '../api/types'

/**
 * What the editors know about the catalogue's texts and shapes: which fields each kind of record has, how they are
 * entered (a line, a paragraph, a list with one item per line), the limits the server applies (the server checks them
 * again; these are here so the form can count and warn), and how a record becomes the body of a save. The field lists
 * are the server's (server/src/modules/catalog/translations.ts); a server test holds the two against each other.
 */

export interface FieldSpec {
  name: string
  kind: 'line' | 'block' | 'list'
  max: number
  required?: boolean
}

export const SERVICE_FIELDS: readonly FieldSpec[] = [
  { name: 'title', kind: 'line', max: 120, required: true },
  { name: 'summary', kind: 'block', max: 600 },
  { name: 'tagline', kind: 'line', max: 200 },
  { name: 'overview', kind: 'block', max: 3000 },
  { name: 'features', kind: 'list', max: 200 },
]
export const PACKAGE_FIELDS: readonly FieldSpec[] = [
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
]
export const EXTRA_FIELDS: readonly FieldSpec[] = [
  { name: 'name', kind: 'line', max: 80, required: true },
  { name: 'summary', kind: 'block', max: 400 },
]
/** A FAQ entry is stored as a title and a description; to the administrator they are the question and the answer. */
export const FAQ_FIELDS: readonly FieldSpec[] = [
  { name: 'title', kind: 'line', max: 300, required: true },
  { name: 'description', kind: 'block', max: 3000 },
]
export const FAQ_LABELS: Record<string, string> = { title: 'question', description: 'answer' }

export const NEEDS = ['website', 'webapp', 'improve', 'ui', 'integrations', 'unsure'] as const
export const CURRENCIES = ['EUR', 'HUF'] as const
export const VAT_MODES: readonly VatMode[] = ['unspecified', 'excluded', 'included', 'exempt']

/** What the form holds for each language: every field as text (a list is one item per line). */
export type TextValues = Record<Language, Record<string, string>>

export const linesOf = (value: string): string[] => value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)

export function toForm(fields: readonly FieldSpec[], translations: Partial<Record<Language, object>>): TextValues {
  const out = {} as TextValues
  for (const language of LANGUAGES) {
    const source = (translations[language] ?? {}) as Record<string, unknown>
    out[language] = Object.fromEntries(
      fields.map((field) => {
        const value = source[field.name]
        return [field.name, Array.isArray(value) ? value.join('\n') : typeof value === 'string' ? value : '']
      }),
    )
  }
  return out
}

/** The translations as the server takes them: a list field becomes an array, a line stays a line. */
export function fromForm(fields: readonly FieldSpec[], values: TextValues): Record<Language, Record<string, string | string[]>> {
  const out = {} as Record<Language, Record<string, string | string[]>>
  for (const language of LANGUAGES) {
    out[language] = Object.fromEntries(fields.map((field) => [field.name, field.kind === 'list' ? linesOf(values[language][field.name] ?? '') : (values[language][field.name] ?? '')]))
  }
  return out
}

export const emptyValue = (field: FieldSpec, values: Record<string, string>): boolean => (field.kind === 'list' ? linesOf(values[field.name] ?? '').length === 0 : (values[field.name] ?? '').trim() === '')

/** Languages in which a field is empty although another language has it: the half-finished work a tab should point at. */
export function incompleteLanguages(fields: readonly FieldSpec[], values: TextValues): Language[] {
  return LANGUAGES.filter((language) => fields.some((field) => emptyValue(field, values[language]) && LANGUAGES.some((other) => other !== language && !emptyValue(field, values[other]))))
}

/** How many fields are missing per language (empty there while another language has them): 0 means the language is complete. */
export function missingByLanguage(fields: readonly FieldSpec[], values: TextValues): Record<Language, number> {
  return Object.fromEntries(
    LANGUAGES.map((language) => [language, fields.filter((field) => emptyValue(field, values[language]) && LANGUAGES.some((other) => other !== language && !emptyValue(field, values[other]))).length]),
  ) as Record<Language, number>
}

// ---- prices -----------------------------------------------------------------------------------------------------

export interface PriceForm {
  kind: Price['kind']
  amount: string
  currency: (typeof CURRENCIES)[number]
  vat: VatMode
}

export const priceToForm = (price: Price, vat: VatMode): PriceForm => ({ kind: price.kind, amount: price.kind === 'from' ? String(price.amount) : '', currency: price.kind === 'from' ? price.currency : 'EUR', vat })

/** The body fields for a price, or the problems with it; a published price needs a whole amount, a currency and a VAT mode that says something. */
export function priceBody(form: PriceForm): { body: { price: Price; vat: VatMode } } | { errors: Record<string, string> } {
  if (form.kind !== 'from') return { body: { price: { kind: form.kind } as Price, vat: 'unspecified' } }
  const errors: Record<string, string> = {}
  const amount = Number(form.amount.trim())
  if (form.amount.trim() === '') errors['price.amount'] = 'required'
  else if (!Number.isInteger(amount) || amount < 1) errors['price.amount'] = 'invalid'
  if (form.vat === 'unspecified') errors.vat = 'required'
  if (Object.keys(errors).length > 0) return { errors }
  return { body: { price: { kind: 'from', amount, currency: form.currency }, vat: form.vat } }
}

// ---- turning a record back into the body of a save (to change one thing and keep everything else) -----------------

export const serviceBody = (record: ServiceRecord, changes: Partial<{ status: string; position: number }> = {}) => ({
  category: record.category,
  status: changes.status ?? record.status,
  position: changes.position ?? record.position,
  packages: record.packages,
  translations: record.translations,
})

export const packageBody = (record: PackageRecord, changes: Partial<{ status: string; position: number }> = {}) => ({
  status: changes.status ?? record.status,
  featured: record.featured,
  position: changes.position ?? record.position,
  price: record.price,
  vat: record.vat,
  quoteRequired: record.quoteRequired,
  needs: record.needs,
  extras: record.extras,
  translations: record.translations,
})

export const extraBody = (record: ExtraRecord, changes: Partial<{ status: string; position: number }> = {}) => ({
  status: changes.status ?? record.status,
  position: changes.position ?? record.position,
  price: record.price,
  vat: record.vat,
  appliesTo: record.appliesTo,
  translations: record.translations,
})

export const faqBody = (record: ContentRecord, changes: Partial<{ status: string; position: number }> = {}) => ({
  status: changes.status ?? record.status,
  position: changes.position ?? record.position,
  translations: Object.fromEntries(LANGUAGES.map((language) => [language, { title: record.translations[language]?.title ?? '', description: record.translations[language]?.description ?? '' }])),
})

/** Moves one entry of an ordered list up or down by one place; the list unchanged when it is already at that end. */
export function moved<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction
  if (target < 0 || target >= items.length) return [...items]
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
