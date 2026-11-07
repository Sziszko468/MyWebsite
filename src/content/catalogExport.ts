import { LANGUAGES, type Language } from '../i18n/config'
import { basePackages as packages } from './packages'
import { baseAddons as addons } from './services/addons'
import { baseServiceAreas as serviceAreas } from './services/areas'
import { baseServiceDetails as serviceDetails } from './services/detail'
import { baseFaq as faq } from './services/faq'
import { baseComparison } from './shop/comparison'
import { baseFullExperience } from './shop/fullExperience'
import type { Trilingual } from './trilingual'

/**
 * The website's catalogue as data for the backend's database (server/seed/catalog.seed.json): the services,
 * packages, add-ons and FAQ in this folder, with every translation, in the shape the server's admin code
 * accepts. The static content stays the source: `npm run catalog:seed-export` writes the JSON from it, a test
 * (server/test/contract.test.ts) fails when the file is out of date, and `npm run server:seed` loads it into an empty
 * database. After that the database is the master copy, and the administrator edits it there.
 */

type Texts = Record<Language, Record<string, unknown>>

/** The service categories the site groups its four services by. */
const CATEGORY: Record<string, string> = { website: 'web', webapp: 'web', ui: 'design', integrations: 'integration' }

function perLanguage(build: (lang: Language) => Record<string, unknown>): Texts {
  return Object.fromEntries(LANGUAGES.map((lang) => [lang, build(lang)])) as Texts
}

const list = (items: readonly Trilingual[], lang: Language): string[] => items.map((item) => item[lang])

export interface CatalogSeed {
  extras: unknown[]
  packages: unknown[]
  services: unknown[]
  faq: unknown[]
}

/** The tier comparison and the FULL EXPERIENCE offer as the backend's `shop_documents` take them (server/seed/shop.seed.json). */
export function buildShopSeed(): { comparison: unknown; fullExperience: unknown } {
  return {
    comparison: { version: 1, tiers: baseComparison.tiers, features: baseComparison.features },
    fullExperience: { version: 1, ...baseFullExperience },
  }
}

export function buildCatalogSeed(): CatalogSeed {
  return {
    extras: addons.map((addon, position) => ({
      code: addon.id,
      status: 'active',
      position,
      price: addon.price,
      vat: addon.vat,
      appliesTo: [...addon.appliesTo],
      translations: perLanguage((lang) => ({ name: addon.name[lang], summary: addon.summary[lang] })),
    })),
    packages: packages.map((pack, position) => ({
      code: pack.id,
      status: 'active',
      featured: pack.featured,
      position,
      price: pack.price,
      vat: pack.vat,
      quoteRequired: pack.quoteRequired,
      needs: [...pack.needs],
      extras: [...pack.extras],
      translations: perLanguage((lang) => ({
        name: pack.name,
        tagline: pack.tagline[lang],
        audience: pack.audience[lang],
        scope: pack.scope[lang],
        customization: pack.customization[lang],
        support: pack.support[lang],
        priceNote: pack.priceNote ? pack.priceNote[lang] : null,
        includes: list(pack.includes, lang),
        fits: list(pack.fits, lang),
        deliverables: list(pack.deliverables, lang),
      })),
    })),
    services: serviceAreas.map((area, position) => {
      const detail = serviceDetails.find((candidate) => candidate.id === area.id)
      return {
        slug: area.id,
        category: CATEGORY[area.id] ?? 'web',
        status: 'active',
        position,
        packages: detail ? [...detail.packages] : [],
        translations: perLanguage((lang) => ({
          title: area.name[lang],
          summary: area.summary[lang],
          tagline: detail ? detail.tagline[lang] : '',
          overview: detail ? detail.overview[lang] : '',
          features: list(area.features, lang),
        })),
      }
    }),
    faq: faq.map((item, position) => ({
      type: 'faq',
      slug: item.id,
      status: 'active',
      position,
      translations: perLanguage((lang) => ({ title: item.question[lang], description: item.answer[lang] })),
    })),
  }
}
