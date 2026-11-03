import { LANGUAGES, type Language } from '../../config.ts'
import { validationFailed } from '../../http/errors.ts'
import { sha256Hex } from '../../lib/crypto.ts'
import type { Catalog, ContentRecord, ExtraRecord, PackageRecord, Price, ServiceRecord, Translations } from './repository.ts'

/**
 * The catalogue as the public API shows it. Only active rows get here (repository.ts is asked for them), no
 * customer data exists in these models, and a price is always the shape the website already understands:
 * `{ kind: 'quote' }`, `{ kind: 'tbd' }` or `{ kind: 'from', amount, currency }` in whole currency units.
 * `lang` is one language (a missing translation falls back to Hungarian, the site's default) or `all`, which
 * gives every translation that exists, for a client that builds a page in all three languages (the website's build).
 */

export type LangParam = Language | 'all'

export function parseLang(value: string | null): LangParam {
  if (value === null || value === '') return 'hu'
  if (value === 'all' || (LANGUAGES as readonly string[]).includes(value)) return value as LangParam
  throw validationFailed({ lang: 'invalid' })
}

function pick<T>(translations: Translations<T>, lang: Language): T | undefined {
  return translations[lang] ?? translations.hu ?? Object.values(translations)[0]
}

function priceOut(price: Price): Record<string, unknown> {
  return price.kind === 'from' ? { kind: 'from', amount: price.amount, currency: price.currency } : { kind: price.kind }
}

function localized<T extends object>(translations: Translations<T>, lang: LangParam): Record<string, unknown> {
  if (lang === 'all') return { translations }
  return { ...(pick(translations, lang) ?? {}) }
}

export function serviceOut(service: ServiceRecord, lang: LangParam): Record<string, unknown> {
  return { slug: service.slug, category: service.category, position: service.position, packages: service.packages, ...localized(service.translations, lang) }
}

export function packageOut(pack: PackageRecord, lang: LangParam): Record<string, unknown> {
  return {
    code: pack.code,
    featured: pack.featured,
    position: pack.position,
    price: priceOut(pack.price),
    vat: pack.vat,
    quoteRequired: pack.quoteRequired,
    needs: pack.needs,
    extras: pack.extras,
    ...localized(pack.translations, lang),
  }
}

export function extraOut(extra: ExtraRecord, lang: LangParam): Record<string, unknown> {
  return { code: extra.code, position: extra.position, price: priceOut(extra.price), vat: extra.vat, appliesTo: extra.appliesTo, ...localized(extra.translations, lang) }
}

export function faqOut(item: ContentRecord, lang: LangParam): Record<string, unknown> {
  if (lang === 'all') {
    const translations: Record<string, unknown> = {}
    for (const [code, text] of Object.entries(item.translations)) translations[code] = { question: text.title, answer: text.description }
    return { slug: item.slug, position: item.position, translations }
  }
  const text = pick(item.translations, lang)
  return { slug: item.slug, position: item.position, question: text?.title ?? '', answer: text?.description ?? '' }
}

/** The service categories: what the services are grouped by, with the services in each. */
export function categoriesOut(catalog: Catalog): Record<string, unknown>[] {
  const byCategory = new Map<string, string[]>()
  for (const service of catalog.services) byCategory.set(service.category, [...(byCategory.get(service.category) ?? []), service.slug])
  return [...byCategory.entries()].map(([slug, services]) => ({ slug, services }))
}

/** Everything in all languages, with a version that changes exactly when something a visitor can see does. */
export function catalogOut(catalog: Catalog): { version: string; body: Record<string, unknown> } {
  const body = {
    services: catalog.services.map((item) => serviceOut(item, 'all')),
    packages: catalog.packages.map((item) => packageOut(item, 'all')),
    extras: catalog.extras.map((item) => extraOut(item, 'all')),
    faq: catalog.content.filter((item) => item.type === 'faq').map((item) => faqOut(item, 'all')),
    categories: categoriesOut(catalog),
  }
  const version = sha256Hex(JSON.stringify(body)).slice(0, 16)
  return { version, body: { version, ...body } }
}
