import { describe, expect, it } from 'vitest'
import { buildCatalogSeed } from './catalogExport'
import { catalogProblems, overlayAddons, overlayFaq, overlayPackages, overlayServiceAreas, overlayServiceDetails } from './catalogOverlay'
import { basePackages } from './packages'
import { baseAddons } from './services/addons'
import { baseServiceAreas } from './services/areas'
import { baseServiceDetails } from './services/detail'
import { baseFaq } from './services/faq'

/** The catalogue the way the backend serves it (`/api/shop/catalog`): the seed has the same shape for packages and add-ons; the FAQ is spelled question/answer. */
function served() {
  const seed = buildCatalogSeed() as unknown as { services: Record<string, any>[]; packages: Record<string, any>[]; extras: Record<string, any>[] }
  return {
    version: 'abc',
    services: structuredClone(seed.services),
    packages: structuredClone(seed.packages),
    extras: structuredClone(seed.extras),
    faq: baseFaq.map((item, position) => ({
      slug: item.id,
      position,
      translations: Object.fromEntries((['hu', 'en', 'nl'] as const).map((lang) => [lang, { question: item.question[lang], answer: item.answer[lang] }])),
    })) as Record<string, any>[],
  }
}
const launch = (catalog: ReturnType<typeof served>) => catalog.packages.find((pack) => pack.code === 'launch')!
const pick = (catalog: unknown) => overlayPackages(basePackages, catalog).find((pack) => pack.id === 'launch')!
const staticLaunch = basePackages.find((pack) => pack.id === 'launch')!

describe('the catalogue overlay', () => {
  it('changes nothing when the backend catalogue is the website own, or when there is none', () => {
    const catalog = served()
    expect(overlayPackages(basePackages, catalog)).toEqual(basePackages)
    expect(overlayAddons(baseAddons, catalog)).toEqual(baseAddons)
    expect(overlayFaq(baseFaq, catalog)).toEqual(baseFaq)
    for (const nothing of [null, undefined, 42, 'text', [], {}, { packages: 'no' }, { packages: {}, extras: null, faq: 7 }]) {
      expect(overlayPackages(basePackages, nothing)).toBe(basePackages)
      expect(overlayAddons(baseAddons, nothing)).toBe(baseAddons)
      expect(overlayFaq(baseFaq, nothing)).toBe(baseFaq)
    }
  })

  it('publishes a price that is complete, and only then', () => {
    const published = (price: unknown, vat: unknown) => {
      const catalog = served()
      Object.assign(launch(catalog), { price, vat })
      return pick(catalog)
    }
    expect(published({ kind: 'from', amount: 900, currency: 'EUR' }, 'excluded')).toMatchObject({ price: { kind: 'from', amount: 900, currency: 'EUR' }, vat: 'excluded' })
    expect(published({ kind: 'from', amount: 250000, currency: 'HUF' }, 'included')).toMatchObject({ price: { kind: 'from', amount: 250000, currency: 'HUF' }, vat: 'included' })
    expect(published({ kind: 'tbd' }, 'unspecified')).toMatchObject({ price: { kind: 'tbd' }, vat: 'unspecified' })
    // The same rule as the content tests and the database: a published price says how VAT is handled, in whole units, in a currency the site knows.
    const refused: [unknown, unknown][] = [
      [{ kind: 'from', amount: 900, currency: 'EUR' }, 'unspecified'],
      [{ kind: 'from', amount: 900, currency: 'EUR' }, 'maybe'],
      [{ kind: 'from', amount: 900, currency: 'EUR' }, undefined],
      [{ kind: 'from', amount: 0, currency: 'EUR' }, 'excluded'],
      [{ kind: 'from', amount: -5, currency: 'EUR' }, 'excluded'],
      [{ kind: 'from', amount: 10.5, currency: 'EUR' }, 'excluded'],
      [{ kind: 'from', amount: '900', currency: 'EUR' }, 'excluded'],
      [{ kind: 'from', amount: 1e12, currency: 'EUR' }, 'excluded'],
      [{ kind: 'from', amount: 900, currency: 'USD' }, 'excluded'],
      [{ kind: 'from', amount: 900 }, 'excluded'],
      [{ kind: 'fixed', amount: 900, currency: 'EUR' }, 'excluded'],
      ['free', 'excluded'],
      [null, 'excluded'],
    ]
    for (const [price, vat] of refused) {
      const result = published(price, vat)
      expect(result.price, JSON.stringify([price, vat])).toEqual(staticLaunch.price)
      expect(result.vat, JSON.stringify([price, vat])).toBe(staticLaunch.vat)
    }
  })

  it('takes the texts the owner edited, field by field and only when all three languages are there, and leaves the rest', () => {
    const catalog = served()
    for (const lang of ['hu', 'en', 'nl'] as const) launch(catalog).translations[lang].tagline = `New tagline ${lang}`
    launch(catalog).translations.nl.audience = '' // a missing translation: the field stays as written
    launch(catalog).translations.hu.scope = null
    launch(catalog).translations.en.support = 42
    const result = pick(catalog)
    expect(result.tagline).toEqual({ hu: 'New tagline hu', en: 'New tagline en', nl: 'New tagline nl' })
    expect(result.audience).toEqual(staticLaunch.audience)
    expect(result.scope).toEqual(staticLaunch.scope)
    expect(result.support).toEqual(staticLaunch.support)
    expect(result.customization).toEqual(staticLaunch.customization)
  })

  it('takes lists only when the three languages have the same number of items, and a note only when it is said to be empty or is all there', () => {
    const catalog = served()
    for (const lang of ['hu', 'en', 'nl'] as const) launch(catalog).translations[lang].includes = [`One ${lang}`, `Two ${lang}`]
    launch(catalog).translations.nl.fits = ['only one']
    for (const lang of ['hu', 'en', 'nl'] as const) launch(catalog).translations[lang].priceNote = `Note ${lang}`
    let result = pick(catalog)
    expect(result.includes).toEqual([
      { hu: 'One hu', en: 'One en', nl: 'One nl' },
      { hu: 'Two hu', en: 'Two en', nl: 'Two nl' },
    ])
    expect(result.fits).toEqual(staticLaunch.fits)
    expect(result.priceNote).toEqual({ hu: 'Note hu', en: 'Note en', nl: 'Note nl' })
    for (const lang of ['hu', 'en', 'nl'] as const) launch(catalog).translations[lang].priceNote = null
    result = pick(catalog)
    expect(result.priceNote).toBeNull()
    delete launch(catalog).translations.hu.priceNote
    expect(pick(catalog).priceNote).toEqual(staticLaunch.priceNote) // absent is not the same as empty
  })

  it('takes featured and quoteRequired as booleans, and nothing else about what a package is', () => {
    const catalog = served()
    Object.assign(launch(catalog), { featured: true, quoteRequired: false, needs: ['webapp'], extras: [], id: 'hijack', position: 99 })
    const result = pick(catalog)
    expect(result).toMatchObject({ featured: true, quoteRequired: false, id: 'launch', needs: staticLaunch.needs, extras: staticLaunch.extras })
    Object.assign(launch(catalog), { featured: 'yes', quoteRequired: 0 })
    expect(pick(catalog)).toMatchObject({ featured: staticLaunch.featured, quoteRequired: staticLaunch.quoteRequired })
  })

  it('ignores what the website has no place for, and never changes the static content itself', () => {
    const before = JSON.stringify([basePackages, baseAddons, baseFaq])
    const catalog = served()
    catalog.packages.push({ code: 'platinum', price: { kind: 'from', amount: 1, currency: 'EUR' }, vat: 'included', translations: {} })
    catalog.extras.push({ code: 'blockchain', price: { kind: 'tbd' }, vat: 'unspecified', translations: {} })
    catalog.packages = [null, 5, 'x', ...catalog.packages.filter((pack) => pack.code !== 'care')] as never
    expect(overlayPackages(basePackages, catalog).map((pack) => pack.id)).toEqual(basePackages.map((pack) => pack.id)) // a package is not removed by being absent
    expect(overlayPackages(basePackages, catalog)).toEqual(basePackages)
    expect(overlayAddons(baseAddons, catalog).map((addon) => addon.id)).toEqual(baseAddons.map((addon) => addon.id))
    expect(JSON.stringify([basePackages, baseAddons, baseFaq])).toBe(before)
    const changed = served()
    launch(changed).price = { kind: 'from', amount: 900, currency: 'EUR' }
    launch(changed).vat = 'included'
    overlayPackages(basePackages, changed)
    expect(JSON.stringify([basePackages, baseAddons, baseFaq])).toBe(before)
  })

  it('changes an add-on price and texts the same way', () => {
    const catalog = served()
    const pages = catalog.extras.find((extra) => extra.code === 'pages')!
    Object.assign(pages, { price: { kind: 'from', amount: 120, currency: 'EUR' }, vat: 'excluded' })
    for (const lang of ['hu', 'en', 'nl'] as const) pages.translations[lang].name = `Pages ${lang}`
    const result = overlayAddons(baseAddons, catalog).find((addon) => addon.id === 'pages')!
    expect(result).toMatchObject({ price: { kind: 'from', amount: 120, currency: 'EUR' }, vat: 'excluded', name: { hu: 'Pages hu', en: 'Pages en', nl: 'Pages nl' } })
    expect(result.appliesTo).toEqual(baseAddons.find((addon) => addon.id === 'pages')!.appliesTo)
  })

  it('replaces the FAQ with the backend list, in its order, skipping entries that are not complete or are repeated', () => {
    const catalog = served()
    const entry = (slug: unknown, q: unknown = 'Question?', a: unknown = 'Answer.') => ({ slug, position: 0, translations: { hu: { question: q, answer: a }, en: { question: q, answer: a }, nl: { question: q, answer: a } } })
    catalog.faq = [
      entry('new-one', 'Is it new?'),
      entry('start', 'How?'),
      entry('Bad Slug!'),
      entry('no-question', ''),
      entry('no-answer', 'Q?', null),
      entry('new-one', 'Duplicate'),
      { slug: 'half', position: 1, translations: { hu: { question: 'q', answer: 'a' } } },
      5 as never,
    ]
    const result = overlayFaq(baseFaq, catalog)
    expect(result.map((item) => item.id)).toEqual(['new-one', 'start'])
    expect(result[0].question).toEqual({ hu: 'Is it new?', en: 'Is it new?', nl: 'Is it new?' })
    catalog.faq = [entry('Bad Slug!')]
    expect(overlayFaq(baseFaq, catalog)).toBe(baseFaq) // nothing usable: the website keeps its own
    catalog.faq = []
    expect(overlayFaq(baseFaq, catalog)).toBe(baseFaq)
  })
})

describe('the services: what the owner edits in the administration reaches their block and their page', () => {
  const website = (catalog: ReturnType<typeof served>) => catalog.services.find((service) => service.slug === 'website')!
  const areaOf = (catalog: unknown) => overlayServiceAreas(baseServiceAreas, catalog).find((area) => area.id === 'website')!
  const detailOf = (catalog: unknown) => overlayServiceDetails(baseServiceDetails, catalog).find((detail) => detail.id === 'website')!
  const staticArea = baseServiceAreas.find((area) => area.id === 'website')!
  const staticDetail = baseServiceDetails.find((detail) => detail.id === 'website')!

  it('changes nothing when the backend catalogue is the website own, or when there is none', () => {
    expect(overlayServiceAreas(baseServiceAreas, served())).toEqual(baseServiceAreas)
    expect(overlayServiceDetails(baseServiceDetails, served())).toEqual(baseServiceDetails)
    for (const nothing of [null, undefined, 42, [], {}, { services: 'no' }]) {
      expect(overlayServiceAreas(baseServiceAreas, nothing)).toBe(baseServiceAreas)
      expect(overlayServiceDetails(baseServiceDetails, nothing)).toBe(baseServiceDetails)
    }
  })

  it('takes the name, summary and features of the block, and the tagline and overview of the page', () => {
    const catalog = served()
    for (const lang of ['hu', 'en', 'nl'] as const) {
      Object.assign(website(catalog).translations[lang], {
        title: `Edited title ${lang}`,
        summary: `Edited summary ${lang}`,
        tagline: `Edited tagline ${lang}`,
        overview: `Edited overview ${lang}`,
        features: [`First ${lang}`, `Second ${lang}`],
      })
    }
    expect(areaOf(catalog).name).toEqual({ hu: 'Edited title hu', en: 'Edited title en', nl: 'Edited title nl' })
    expect(areaOf(catalog).summary.en).toBe('Edited summary en')
    expect(areaOf(catalog).features).toEqual([
      { hu: 'First hu', en: 'First en', nl: 'First nl' },
      { hu: 'Second hu', en: 'Second en', nl: 'Second nl' },
    ])
    expect(detailOf(catalog).tagline.nl).toBe('Edited tagline nl')
    expect(detailOf(catalog).overview.hu).toBe('Edited overview hu')
    // What the website writes itself, and what is not text, stays.
    expect(areaOf(catalog).example).toEqual(staticArea.example)
    expect(detailOf(catalog).benefits).toEqual(staticDetail.benefits)
    expect(detailOf(catalog).packages).toEqual(staticDetail.packages)
    // The other services are untouched.
    expect(overlayServiceAreas(baseServiceAreas, catalog).find((area) => area.id === 'webapp')).toEqual(baseServiceAreas.find((area) => area.id === 'webapp'))
  })

  it('takes a text only when all three languages have it, and an emptied feature list leaves the source list', () => {
    const catalog = served()
    website(catalog).translations.nl.title = ''
    website(catalog).translations.en.summary = '   '
    for (const lang of ['hu', 'en', 'nl'] as const) website(catalog).translations[lang].features = []
    expect(areaOf(catalog).name).toEqual(staticArea.name)
    expect(areaOf(catalog).summary).toEqual(staticArea.summary)
    expect(areaOf(catalog).features).toEqual(staticArea.features)
  })

  it('never lets the static content be changed, and ignores a service the website has no page for', () => {
    const catalog = served()
    const before = structuredClone(baseServiceAreas)
    catalog.services.push({ slug: 'consulting', translations: { hu: { title: 'x' }, en: { title: 'x' }, nl: { title: 'x' } } })
    website(catalog).translations.en.title = 'Changed'
    const result = overlayServiceAreas(baseServiceAreas, catalog)
    expect(result.map((area) => area.id)).toEqual(baseServiceAreas.map((area) => area.id))
    expect(baseServiceAreas).toEqual(before)
    expect(staticArea.name.en).not.toBe('Changed')
  })
})

describe('the report of what will not reach the website', () => {
  const known = {
    packages: basePackages.map((pack) => pack.id),
    extras: baseAddons.map((addon) => addon.id),
    services: baseServiceAreas.map((area) => area.id),
  }

  it('is empty for a catalogue that is the website own', () => {
    expect(catalogProblems(served(), known)).toEqual([])
  })

  it('names every edit that will be left out, and why', () => {
    const catalog = served()
    Object.assign(launch(catalog), { price: { kind: 'from', amount: 900, currency: 'EUR' }, vat: 'unspecified' })
    launch(catalog).translations.nl.tagline = ''
    launch(catalog).translations.en.includes = []
    catalog.packages = catalog.packages.filter((pack) => pack.code !== 'care')
    catalog.packages.push({ code: 'platinum', price: { kind: 'quote' }, vat: 'unspecified', translations: {} })
    catalog.faq = []
    const problems = catalogProblems(catalog, known).join('\n')
    expect(problems).toContain('The package "launch" has a price or VAT mode the website cannot use')
    expect(problems).toContain('The package "launch" has no "tagline" in all three languages')
    expect(problems).toContain('The package "launch" has a "includes" list that is missing or does not line up')
    // The services are held to the same rules.
    const withBadService = served()
    withBadService.services.find((service) => service.slug === 'ui')!.translations.en.overview = ''
    withBadService.services.find((service) => service.slug === 'ui')!.translations.nl.features = ['one']
    withBadService.services = withBadService.services.filter((service) => service.slug !== 'integrations')
    withBadService.services.push({ slug: 'consulting', translations: {} })
    const serviceProblems = catalogProblems(withBadService, known).join('\n')
    expect(serviceProblems).toContain('The service "ui" has no "overview" in all three languages')
    expect(serviceProblems).toContain('The service "ui" has a "features" list that is missing or does not line up')
    expect(serviceProblems).toContain('The service "integrations" is not in the backend')
    expect(serviceProblems).toContain('The service "consulting" is in the backend but not in the website')
    expect(problems).toContain('The package "care" is not in the backend')
    expect(problems).toContain('The package "platinum" is in the backend but not in the website')
    expect(problems).toContain('The catalogue has no FAQ entries')
    expect(catalogProblems(null, known)).toEqual(['The catalogue is not a JSON object.'])
    expect(catalogProblems({}, known)).toEqual(expect.arrayContaining(['The catalogue has no "packages" list.', 'The catalogue has no "extras" list.']))
  })
})
