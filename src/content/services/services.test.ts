import { describe, expect, it } from 'vitest'
import { LANGUAGES, type Language } from '../../i18n/config'
import { dictionaries } from '../../i18n/dictionaries'
import { findPage } from '../../routes/pages'
import { PROJECT_TYPES, STEPS, TIMINGS } from '../../quote/types'
import { getPackage, isPackageId, packages } from '../packages'
import { projects } from '../projects'
import type { Trilingual } from '../trilingual'
import { serviceAreas } from './areas'
import { faq } from './faq'
import { processNote, processSteps } from './process'

/** Every sentence of the services content and of the services page's dictionary, with where it came from. */
function allText(lang: Language): Array<[where: string, text: string]> {
  const out: Array<[string, string]> = []
  const add = (where: string, value: Trilingual) => out.push([where, value[lang]])

  for (const area of serviceAreas) {
    add(`area ${area.id} name`, area.name)
    add(`area ${area.id} summary`, area.summary)
    area.features.forEach((feature, i) => add(`area ${area.id} feature ${i}`, feature))
    if (area.example) add(`area ${area.id} example`, area.example.note)
  }
  for (const pkg of packages) {
    add(`package ${pkg.id} tagline`, pkg.tagline)
    add(`package ${pkg.id} audience`, pkg.audience)
    pkg.fits.forEach((item, i) => add(`package ${pkg.id} fits ${i}`, item))
    pkg.includes.forEach((item, i) => add(`package ${pkg.id} includes ${i}`, item))
    if (pkg.priceNote) add(`package ${pkg.id} price note`, pkg.priceNote)
  }
  processSteps.forEach((step, i) => {
    add(`process ${i} title`, step.title)
    add(`process ${i} text`, step.text)
  })
  add('process note', processNote)
  for (const item of faq) {
    add(`faq ${item.id} question`, item.question)
    add(`faq ${item.id} answer`, item.answer)
  }
  out.push(...flatten(dictionaries[lang].servicesPage, 'servicesPage'))
  out.push(...flatten(dictionaries[lang].services, 'services'))
  return out
}

function flatten(value: unknown, path: string): Array<[string, string]> {
  if (typeof value === 'string') return [[path, value]]
  if (Array.isArray(value)) return value.flatMap((item, i) => flatten(item, `${path}[${i}]`))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([key, item]) => flatten(item, `${path}.${key}`))
  return []
}

const tokens = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('the service areas', () => {
  it('are the four on the brief, in order, each one a kind of project the form knows', () => {
    expect(serviceAreas.map((area) => area.id)).toEqual(['website', 'webapp', 'ui', 'integrations'])
    for (const area of serviceAreas) expect(PROJECT_TYPES).toContain(area.id)
  })

  it('have a name, a summary and a list of what they can include, in every language', () => {
    for (const area of serviceAreas) {
      expect(area.features.length, area.id).toBeGreaterThanOrEqual(3)
      expect(new Set(area.features.map((f) => f.hu)).size, area.id).toBe(area.features.length)
      for (const lang of LANGUAGES) {
        expect(area.name[lang].trim(), `${lang}:${area.id}`).not.toBe('')
        expect(area.summary[lang].trim(), `${lang}:${area.id}`).not.toBe('')
        for (const feature of area.features) expect(feature[lang].trim(), `${lang}:${area.id}`).not.toBe('')
      }
    }
  })

  it('point to a project only where the portfolio really shows that work, and only to a page that exists', () => {
    for (const area of serviceAreas) {
      if (!area.example) continue
      const project = projects.find((candidate) => candidate.id === area.example?.project)
      expect(project, `${area.id} → ${area.example.project}`).toBeDefined()
      expect(project?.detailPath, `${area.id} → ${project?.name}`).not.toBeNull()
      expect(findPage(project!.detailPath!), `${area.id} → ${project?.detailPath}`).toBeDefined()
      // A concept is an idea, not work to point at as proof.
      expect(project?.status, `${area.id} → ${project?.name}`).not.toBe('concept')
    }
  })

  it('say outright that an integration is settled with the owner first', () => {
    const integrations = serviceAreas.find((area) => area.id === 'integrations')!
    expect(integrations.summary.hu).toMatch(/tisztázzuk/)
    expect(integrations.summary.en).toMatch(/settle/)
    expect(integrations.summary.nl).toMatch(/stemmen we samen af/)
  })
})

describe('the packages’ pricing', () => {
  it('state a VAT treatment for every published price, and a currency that exists', () => {
    for (const pkg of packages) {
      if (pkg.price.kind !== 'from') continue
      expect(pkg.vat, `${pkg.name} publishes a price without saying how VAT is handled`).not.toBe('unspecified')
      expect(['EUR', 'HUF']).toContain(pkg.price.currency)
      expect(pkg.price.amount).toBeGreaterThan(0)
    }
  })

  it('ask for a custom quote until the owner sets a price, and keep the quote as the final word', () => {
    for (const pkg of packages) {
      expect(pkg.quoteRequired, pkg.name).toBe(true)
      expect(['quote', 'tbd', 'from']).toContain(pkg.price.kind)
    }
  })

  it('give a deadline only as a range the owner chose to publish, never as a figure of their own', () => {
    for (const pkg of packages) {
      if (pkg.timeline.kind === 'scope') continue
      expect(pkg.timeline.min, pkg.name).toBeGreaterThan(0)
      expect(pkg.timeline.max, pkg.name).toBeGreaterThanOrEqual(pkg.timeline.min)
    }
  })

  it('find each package by id, and recognise only those', () => {
    for (const pkg of packages) expect(getPackage(pkg.id)).toBe(pkg)
    expect(isPackageId('build')).toBe(true)
    expect(isPackageId('enterprise')).toBe(false)
    expect(isPackageId(null)).toBe(false)
    expect(() => getPackage('enterprise' as never)).toThrow()
  })

  it('weigh Build more than the others without calling it the most popular', () => {
    expect(packages.filter((pkg) => pkg.featured).map((pkg) => pkg.id)).toEqual(['build'])
  })
})

describe('what the page says', () => {
  const FIGURE = /[€$£]\s*\d|\d\s*(€|eur\b|euro|ft\b|huf\b|forint|usd|\$|£|%)/i
  const TIMED = /\d+\s*([-–]\s*\d+\s*)?(days?|weeks?|months?|nap\b|hét\b|hónap|dagen|dag\b|weken|maand)/i
  const ABSOLUTE =
    /guarantee|garanci|garantie|unlimited|korlátlan|onbeperkt|most popular|legnépszerűbb|populairst|best[- ]seller|\bsale\b|discount|kedvezmény|korting|akció|legjobb|\bbeste\b|100\s?%/i

  it.each(LANGUAGES)('quotes no price, discount or percentage in %s', (lang) => {
    for (const [where, text] of allText(lang)) expect(text, `${lang}: ${where}`).not.toMatch(FIGURE)
  })

  it.each(LANGUAGES)('promises no length of time in %s', (lang) => {
    for (const [where, text] of allText(lang)) expect(text, `${lang}: ${where}`).not.toMatch(TIMED)
  })

  it.each(LANGUAGES)('makes no guarantee, no “unlimited”, no superlative and no popularity claim in %s', (lang) => {
    for (const [where, text] of allText(lang)) expect(text, `${lang}: ${where}`).not.toMatch(ABSOLUTE)
  })

  it('says in every language that the packages are not final offers and that the scope comes after the quote request', () => {
    const intro = (lang: Language) => dictionaries[lang].servicesPage.packages.intro
    expect(intro('hu')).toMatch(/nem végleges/)
    expect(intro('hu')).toMatch(/ajánlatkérés után/)
    expect(intro('en')).toMatch(/not final/)
    expect(intro('en')).toMatch(/after a quote request/)
    expect(intro('nl')).toMatch(/geen definitieve/)
    expect(intro('nl')).toMatch(/na een offerteaanvraag/)
  })

  it('uses the Hungarian words of the brief for the hero, the closing call to action and the process', () => {
    const hu = dictionaries.hu.servicesPage
    expect(hu.hero.titleLine1.toLowerCase()).toBe('a te ötleted.')
    expect(hu.hero.titleLine2.toLowerCase()).toBe('a következő lépés.')
    expect(hu.hero.ctaPrimary).toBe('Válassz szolgáltatást')
    expect(hu.hero.ctaSecondary).toBe('Kérj egyedi ajánlatot')
    expect(hu.final.title).toBe('Van egy ötleted?')
    expect(hu.final.text).toBe('Nézzük meg, hogyan válhat belőle működő digitális termék.')
    expect(hu.final.cta).toBe('Kezdjük el')
    expect(processSteps).toHaveLength(5)
  })
})

describe('the process and the questions', () => {
  it('have five steps and the six questions of the brief, each with an answer in every language', () => {
    expect(faq.map((item) => item.id)).toEqual(['start', 'cost', 'time', 'custom', 'existing', 'handover'])
    expect(new Set(faq.map((item) => item.id)).size).toBe(faq.length)
    for (const lang of LANGUAGES) {
      for (const step of processSteps) {
        expect(step.title[lang].trim(), lang).not.toBe('')
        expect(step.text[lang].trim(), lang).not.toBe('')
      }
      for (const item of faq) {
        expect(item.question[lang].trim(), `${lang}:${item.id}`).not.toBe('')
        expect(item.answer[lang].trim(), `${lang}:${item.id}`).not.toBe('')
      }
    }
  })

  it('refuse to promise a deadline or a result before the details are known', () => {
    expect(processNote.hu).toMatch(/nem ígérek/)
    expect(processNote.en).toMatch(/do not promise/)
    expect(processNote.nl).toMatch(/beloof (ik )?geen/)
    const time = faq.find((item) => item.id === 'time')!
    expect(time.answer.hu).toMatch(/nem ígérek/)
    expect(time.answer.en).toMatch(/do not promise/)
    expect(time.answer.nl).toMatch(/beloof (ik )?geen/)
  })
})

describe('the dictionary', () => {
  it.each(LANGUAGES)('labels every kind of project, timing and step in %s', (lang) => {
    const q = dictionaries[lang].servicesPage.quote
    for (const type of PROJECT_TYPES) expect(q.fields.projectType.options[type].trim(), `${lang}:${type}`).not.toBe('')
    for (const timing of TIMINGS) expect(q.fields.timing.options[timing].trim(), `${lang}:${timing}`).not.toBe('')
    for (const step of STEPS) {
      expect(q.steps[step].trim(), `${lang}:${step}`).not.toBe('')
      expect(q.stepTitles[step].trim(), `${lang}:${step}`).not.toBe('')
    }
  })

  it('has no empty sentence in any language', () => {
    for (const lang of LANGUAGES) {
      for (const [where, text] of allText(lang)) expect(text.trim(), `${lang}: ${where}`).not.toBe('')
    }
  })

  it('keeps the same {placeholders} in every language, string by string', () => {
    const reference = new Map(flatten(dictionaries.hu.servicesPage, 'servicesPage').map(([path, text]) => [path, tokens(text)]))
    for (const lang of ['en', 'nl'] as const) {
      const other = flatten(dictionaries[lang].servicesPage, 'servicesPage')
      expect(other.length, lang).toBe(reference.size)
      for (const [path, text] of other) expect(tokens(text), `${lang}: ${path}`).toEqual(reference.get(path))
    }
  })

  it('gives the three languages the same number of points in the list of things to know', () => {
    const counts = LANGUAGES.map((lang) => dictionaries[lang].servicesPage.quote.aside.items.length)
    expect(new Set(counts).size).toBe(1)
  })

  it('titles the page differently in each language', () => {
    const titles = LANGUAGES.map((lang) => dictionaries[lang].servicesPage.meta.title)
    expect(new Set(titles).size).toBe(3)
  })
})
