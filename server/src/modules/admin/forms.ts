import { LANGUAGES, type Language } from '../../config.ts'
import { lines } from './layout.ts'

/**
 * The admin's forms, turned into the same plain objects the JSON API accepts (modules/catalog/admin.ts checks
 * them: the form adds no rules of its own). Field names are `<field>_<language>` for the translated texts, one
 * line per item for the lists, and checkboxes for the associations.
 */

const text = (form: URLSearchParams, name: string): string => form.get(name) ?? ''
const checked = (form: URLSearchParams, name: string): boolean => form.has(name)

function translations(form: URLSearchParams, fields: Record<string, 'line' | 'block' | 'list'>): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const language of LANGUAGES) {
    const entry: Record<string, unknown> = {}
    for (const [field, kind] of Object.entries(fields)) {
      const value = text(form, `${field}_${language}`)
      entry[field] = kind === 'list' ? lines(value) : value
    }
    out[language] = entry
  }
  return out
}

function priceFields(form: URLSearchParams): Record<string, unknown> {
  const kind = text(form, 'price_kind') || 'quote'
  return {
    price: kind === 'from' ? { kind, amount: text(form, 'price_amount'), currency: text(form, 'price_currency') } : { kind },
    vat: text(form, 'vat') || 'unspecified',
  }
}

export function serviceForm(form: URLSearchParams): Record<string, unknown> {
  return {
    slug: text(form, 'slug'),
    category: text(form, 'category'),
    status: text(form, 'status') || 'active',
    position: text(form, 'position'),
    packages: form.getAll('packages'),
    translations: translations(form, { title: 'line', summary: 'block', tagline: 'line', overview: 'block', features: 'list' }),
  }
}

export function packageForm(form: URLSearchParams): Record<string, unknown> {
  return {
    code: text(form, 'code'),
    status: text(form, 'status') || 'active',
    featured: checked(form, 'featured'),
    position: text(form, 'position'),
    quoteRequired: checked(form, 'quoteRequired'),
    ...priceFields(form),
    needs: form.getAll('needs'),
    extras: form.getAll('extras'),
    translations: translations(form, { name: 'line', tagline: 'line', audience: 'block', scope: 'block', customization: 'block', support: 'block', priceNote: 'line', includes: 'list', fits: 'list', deliverables: 'list' }),
  }
}

export function extraForm(form: URLSearchParams): Record<string, unknown> {
  return {
    code: text(form, 'code'),
    status: text(form, 'status') || 'active',
    position: text(form, 'position'),
    ...priceFields(form),
    appliesTo: form.getAll('appliesTo'),
    translations: translations(form, { name: 'line', summary: 'block' }),
  }
}

export function contentForm(form: URLSearchParams): Record<string, unknown> {
  return {
    type: text(form, 'type'),
    slug: text(form, 'slug'),
    status: text(form, 'status') || 'active',
    position: text(form, 'position'),
    translations: translations(form, { title: 'line', description: 'block' }),
  }
}

/** Flattens an object's `translations.<lang>.<field>` errors (from the API) into the form's `<field>_<lang>` names. */
export function formErrors(errors: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, code] of Object.entries(errors)) {
    const match = /^translations\.(hu|en|nl)\.(\w+)$/.exec(key)
    if (match) out[`${match[2]}_${match[1]}`] = code
    else if (key === 'price.amount' || key === 'price.currency') out[key === 'price.amount' ? 'price_amount' : 'price_currency'] = code
    else if (key === 'price') out.price_kind = code
    else out[key] = code
  }
  return out
}

export type { Language }
