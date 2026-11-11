import { describe, expect, it } from 'vitest'
import { LANGUAGES, type Language } from '../../i18n/config'
import { findPage } from '../../routes/pages'
import { getPackage, isPackageId, packages } from '../packages'
import { projects } from '../projects'
import { shopText } from '../shop'
import { shopMeta } from '../shop/meta'
import { localize, type Trilingual } from '../trilingual'
import { ADDON_IDS, addons, addonsFor, getAddon, isExtraId } from './addons'
import { serviceAreas } from './areas'
import { serviceDetails } from './detail'
import { faq } from './faq'
import { NEED_IDS, PLAN_IDS, SERVICE_IDS, isNeedId, isPlanId, isServiceId, serviceOfNeed } from './ids'
import { afterInquirySteps, collaboration, processNote, processSteps } from './process'

/** Every sentence of the services content and of the shop's texts, with where it came from. */
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
    add(`package ${pkg.id} scope`, pkg.scope)
    add(`package ${pkg.id} customization`, pkg.customization)
    add(`package ${pkg.id} support`, pkg.support)
    pkg.fits.forEach((item, i) => add(`package ${pkg.id} fits ${i}`, item))
    pkg.includes.forEach((item, i) => add(`package ${pkg.id} includes ${i}`, item))
    pkg.deliverables.forEach((item, i) => add(`package ${pkg.id} deliverable ${i}`, item))
    if (pkg.priceNote) add(`package ${pkg.id} price note`, pkg.priceNote)
  }
  for (const addon of addons) {
    add(`add-on ${addon.id} name`, addon.name)
    add(`add-on ${addon.id} summary`, addon.summary)
  }
  for (const detail of serviceDetails) {
    add(`service ${detail.id} tagline`, detail.tagline)
    detail.glance.forEach((item, i) => add(`service ${detail.id} glance ${i}`, item))
    add(`service ${detail.id} overview`, detail.overview)
    detail.benefits.forEach((benefit, i) => {
      add(`service ${detail.id} benefit ${i} title`, benefit.title)
      add(`service ${detail.id} benefit ${i} text`, benefit.text)
    })
    detail.useCases.forEach((item, i) => add(`service ${detail.id} use case ${i}`, item))
    detail.deliverables.forEach((item, i) => add(`service ${detail.id} deliverable ${i}`, item))
    add(`service ${detail.id} audience`, detail.audience)
    add(`service ${detail.id} how`, detail.howNote)
    detail.projects.forEach((item, i) => add(`service ${detail.id} project ${i}`, item.note))
    detail.faq.own.forEach((item) => {
      add(`service ${detail.id} faq ${item.id} question`, item.question)
      add(`service ${detail.id} faq ${item.id} answer`, item.answer)
    })
  }
  processSteps.forEach((step, i) => {
    add(`process ${i} title`, step.title)
    add(`process ${i} text`, step.text)
  })
  add('process note', processNote)
  for (const [group, steps] of [['after', afterInquirySteps], ['collaboration', collaboration]] as const) {
    steps.forEach((step, i) => {
      add(`${group} ${i} title`, step.title)
      add(`${group} ${i} text`, step.text)
    })
  }
  for (const item of faq) {
    add(`faq ${item.id} question`, item.question)
    add(`faq ${item.id} answer`, item.answer)
  }
  out.push(...flatten(localize(shopText, lang), 'shop'))
  for (const [key, meta] of Object.entries(shopMeta)) {
    add(`meta ${key} title`, meta.title)
    add(`meta ${key} description`, meta.description)
  }
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
  it('are the four on the brief, in order, each one a service the shop knows', () => {
    expect(serviceAreas.map((area) => area.id)).toEqual(['website', 'webapp', 'ui', 'integrations'])
    expect(serviceAreas.map((area) => area.id)).toEqual([...SERVICE_IDS])
    for (const area of serviceAreas) expect(isServiceId(area.id)).toBe(true)
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
      expect(project?.status, `${area.id} → ${project?.name}`).not.toBe('concept')
    }
  })

  it('say outright that an integration is settled with the owner first', () => {
    const integrations = serviceAreas.find((area) => area.id === 'integrations')!
    expect(integrations.summary.hu).toMatch(/tisztázzuk|közösen megnézzük/)
    expect(integrations.summary.en).toMatch(/settle|check together/)
    expect(integrations.summary.nl).toMatch(/stemmen we samen af|bekijken we samen/)
  })
})

describe('the ids the shop is built on', () => {
  it('know the six needs, the five plans and which service a need leads to', () => {
    expect(NEED_IDS).toEqual(['website', 'webapp', 'improve', 'ui', 'integrations', 'unsure'])
    expect(PLAN_IDS).toEqual(['launch', 'grow', 'build', 'care', 'custom'])
    expect(serviceOfNeed('improve')).toBe('website')
    expect(serviceOfNeed('unsure')).toBeNull()
    expect(serviceOfNeed('ui')).toBe('ui')
    expect(isNeedId('webapp')).toBe(true)
    expect(isNeedId('mobile')).toBe(false)
    expect(isPlanId('custom')).toBe(true)
    expect(isPlanId('enterprise')).toBe(false)
  })

  it('has a plan for every package and no package for “custom”', () => {
    for (const pkg of packages) expect(PLAN_IDS).toContain(pkg.id)
    expect(isPackageId('custom')).toBe(false)
  })
})

describe('the add-ons', () => {
  it('are the offered ones: the brief’s list without the CMS integration, which nothing on the portfolio shows', () => {
    expect([...ADDON_IDS]).toEqual(['pages', 'responsive', 'motion', 'api', 'performance', 'languages', 'custom', 'care'])
    expect(ADDON_IDS.join(' ')).not.toMatch(/cms/i)
  })

  it('apply to needs that exist, to at least one each, and are found by id', () => {
    for (const addon of addons) {
      expect(addon.appliesTo.length, addon.id).toBeGreaterThan(0)
      for (const need of addon.appliesTo) expect(isNeedId(need), `${addon.id} → ${need}`).toBe(true)
      expect(getAddon(addon.id)).toBe(addon)
      expect(isExtraId(addon.id)).toBe(true)
      for (const lang of LANGUAGES) {
        expect(addon.name[lang].trim(), `${lang}:${addon.id}`).not.toBe('')
        expect(addon.summary[lang].trim(), `${lang}:${addon.id}`).not.toBe('')
      }
    }
    expect(isExtraId('cms')).toBe(false)
    expect(() => getAddon('cms' as never)).toThrow()
  })

  it('offer every real need at least one add-on, and “not sure yet” only the open-ended one', () => {
    for (const need of NEED_IDS.filter((id) => id !== 'unsure')) expect(addonsFor(need).length, need).toBeGreaterThan(0)
    expect(addonsFor('unsure').map((addon) => addon.id)).toEqual(['custom'])
  })

  it('are priced in the quote until the owner publishes a price, and a published price states its VAT', () => {
    for (const addon of addons) {
      expect(['quote', 'tbd', 'from']).toContain(addon.price.kind)
      if (addon.price.kind === 'from') expect(addon.vat, addon.id).not.toBe('unspecified')
    }
  })

  it('are listed by each package only if they apply to a need the package suits', () => {
    for (const pkg of packages) {
      expect(new Set(pkg.extras).size, pkg.id).toBe(pkg.extras.length)
      for (const extra of pkg.extras) {
        const addon = getAddon(extra)
        expect(
          pkg.needs.some((need) => addon.appliesTo.includes(need)),
          `${pkg.id} offers ${extra}, which fits none of its needs`,
        ).toBe(true)
      }
    }
  })
})

describe('the service pages’ content', () => {
  it('cover each service once, with the sections of the brief filled in every language', () => {
    expect(serviceDetails.map((detail) => detail.id)).toEqual([...SERVICE_IDS])
    for (const detail of serviceDetails) {
      expect(detail.useCases.length, detail.id).toBeGreaterThanOrEqual(3)
      expect(detail.deliverables.length, detail.id).toBeGreaterThanOrEqual(4)
      expect(detail.benefits, detail.id).toHaveLength(3)
      expect(detail.packages.length, detail.id).toBeGreaterThan(0)
      for (const id of detail.packages) expect(isPackageId(id), `${detail.id} → ${id}`).toBe(true)
      for (const id of detail.faq.shared) expect(faq.map((item) => item.id), `${detail.id} → ${id}`).toContain(id)
      expect(detail.faq.shared.length + detail.faq.own.length, detail.id).toBeGreaterThanOrEqual(4)
    }
  })

  it('relate a service to a project only where the portfolio shows that work, with a page to go to and a status that is not “concept”', () => {
    for (const detail of serviceDetails) {
      for (const item of detail.projects) {
        const project = projects.find((candidate) => candidate.id === item.project)
        expect(project, `${detail.id} → ${item.project}`).toBeDefined()
        expect(project?.detailPath, `${detail.id} → ${item.project}`).not.toBeNull()
        expect(findPage(project!.detailPath!), `${detail.id} → ${project?.detailPath}`).toBeDefined()
        expect(project?.status, `${detail.id} → ${item.project}`).not.toBe('concept')
      }
    }
  })

  it('say plainly where no project shows the work, instead of inventing one', () => {
    expect(serviceDetails.filter((detail) => detail.projects.length === 0).map((detail) => detail.id)).toEqual([])
    expect(shopText.detail.work.none.en).toMatch(/No portfolio project shows this work yet/)
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

  it('give every package the facts the shop shows: three deliverables, a scope, a support line, extras and the needs it suits', () => {
    for (const pkg of packages) {
      expect(pkg.deliverables, pkg.id).toHaveLength(3)
      expect(pkg.needs.length, pkg.id).toBeGreaterThan(0)
      expect(pkg.extras.length, pkg.id).toBeGreaterThan(0)
      for (const lang of LANGUAGES) {
        expect(pkg.scope[lang].trim(), `${lang}:${pkg.id}`).not.toBe('')
        expect(pkg.customization[lang].trim(), `${lang}:${pkg.id}`).not.toBe('')
        expect(pkg.support[lang].trim(), `${lang}:${pkg.id}`).not.toBe('')
      }
    }
  })
})

describe('what the shop says', () => {
  const FIGURE = /[€$£]\s*\d|\d\s*(€|eur\b|euro|ft\b|huf\b|forint|usd|\$|£|%)/i
  const TIMED = /\d+\s*([-–]\s*\d+\s*)?(days?|weeks?|months?|nap\b|hét\b|hónap|dagen|dag\b|weken|maand)/i
  const ABSOLUTE =
    /guarantee|garanci|garantie|unlimited|korlátlan|onbeperkt|most popular|legnépszerűbb|populairst|best[- ]seller|\bsale\b|discount|kedvezmény|korting|\bakció|legjobb|\bbeste\b|100\s?%|certified|tanúsít|gecertificeerd|testimonial|getuigenis|\bvélemény|\breviews\b|klantbeoordeling/i

  it.each(LANGUAGES)('quotes no price, discount or percentage in %s', (lang) => {
    for (const [where, text] of allText(lang)) expect(text, `${lang}: ${where}`).not.toMatch(FIGURE)
  })

  it.each(LANGUAGES)('promises no length of time in %s', (lang) => {
    for (const [where, text] of allText(lang)) expect(text, `${lang}: ${where}`).not.toMatch(TIMED)
  })

  it.each(LANGUAGES)('makes no guarantee, no “unlimited”, no superlative, no testimonial and no popularity claim in %s', (lang) => {
    for (const [where, text] of allText(lang)) expect(text, `${lang}: ${where}`).not.toMatch(ABSOLUTE)
  })

  it('says in every language that the packages are not final offers and that the scope comes after the quote request', () => {
    const intro = (lang: Language) => localize(shopText.landing.packages.intro, lang)
    expect(intro('hu')).toMatch(/nem végleges/i)
    expect(intro('hu')).toMatch(/ajánlatkérés után/)
    expect(intro('en')).toMatch(/not final/)
    expect(intro('en')).toMatch(/after a quote request/)
    expect(intro('nl')).toMatch(/geen definitieve/i)
    expect(intro('nl')).toMatch(/na een offerteaanvraag/)
  })

  it('uses the words of the brief for the headline, the supporting copy and the two buttons', () => {
    const hero = shopText.landing.hero
    expect(`${hero.titleLine1.en} ${hero.titleLine2.en}`.toUpperCase()).toBe('BUILD SOMETHING THAT MATTERS.')
    expect(`${hero.titleLine1.hu} ${hero.titleLine2.hu}`.toUpperCase()).toBe('ALKOSSUNK VALAMI MARADANDÓT.')
    expect(hero.lead.en).toBe('Digital experiences, websites and applications designed around your next big idea.')
    expect(hero.lead.hu).toBe('Weboldalak, digitális élmények és alkalmazások, amelyek a következő nagy ötleted köré épülnek.')
    expect(hero.ctaPrimary.en.toUpperCase()).toBe('EXPLORE SERVICES')
    expect(hero.ctaSecondary.en.toUpperCase()).toBe('LET’S TALK')
  })

  it('names the empty price “Custom Quote” and its equivalents', () => {
    const quote = shopText.common.price.customQuote
    expect(quote.en).toBe('Custom Quote')
    expect(quote.hu).toBe('Egyedi ajánlat')
    expect(quote.nl).toBe('Offerte op maat')
  })
})

describe('the process and the questions', () => {
  it('have five steps and the six shared questions, each with an answer in every language', () => {
    expect(faq.map((item) => item.id)).toEqual(['start', 'cost', 'time', 'custom', 'existing', 'handover'])
    expect(new Set(faq.map((item) => item.id)).size).toBe(faq.length)
    expect(processSteps).toHaveLength(5)
    for (const lang of LANGUAGES) {
      for (const step of [...processSteps, ...afterInquirySteps, ...collaboration]) {
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

  it('say what happens after an inquiry without a reply time, and that asking commits to nothing', () => {
    expect(afterInquirySteps).toHaveLength(4)
    const last = afterInquirySteps[afterInquirySteps.length - 1]
    expect(last.text.en).toMatch(/commits you to nothing/)
    expect(last.text.hu).toMatch(/nem kötelez semmire/)
    expect(last.text.nl).toMatch(/verplicht je tot niets/)
  })
})

describe('the texts', () => {
  it('have no empty sentence in any language', () => {
    for (const lang of LANGUAGES) {
      for (const [where, text] of allText(lang)) expect(text.trim(), `${lang}: ${where}`).not.toBe('')
    }
  })

  it('keep the same {placeholders} in every language, string by string', () => {
    const reference = new Map(flatten(localize(shopText, 'hu'), 'shop').map(([path, text]) => [path, tokens(text)]))
    for (const lang of ['en', 'nl'] as const) {
      const other = flatten(localize(shopText, lang), 'shop')
      expect(other.length, lang).toBe(reference.size)
      for (const [path, text] of other) expect(tokens(text), `${lang}: ${path}`).toEqual(reference.get(path))
    }
  })

  it('differ between the languages, apart from proper nouns and plain numbers', () => {
    const same: string[] = []
    const visit = (value: unknown, path: string) => {
      if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>
        if (typeof record.hu === 'string' && typeof record.en === 'string' && typeof record.nl === 'string') {
          const hasWords = (text: string) => /[a-záéíóöőúüű]{3,}/i.test(text.replace(/\{\w+\}/g, ''))
          if (record.hu === record.en && record.en === record.nl && hasWords(record.en)) same.push(path)
          return
        }
        for (const [key, item] of Object.entries(record)) visit(item, `${path}.${key}`)
      }
    }
    visit(shopText, 'shop')
    // A name that is the same in every language (Launch, Grow, Build, Care, and the flagship offer's FULL EXPERIENCE) is a proper noun;
    // nothing else may be.
    const NAMES = ['shop.common.nav.fullExperience']
    expect(same.filter((path) => !path.startsWith('shop.common.planNames') && !NAMES.includes(path))).toEqual([])
  })

  it('titles the shop’s pages differently in each language', () => {
    for (const meta of Object.values(shopMeta)) expect(new Set(LANGUAGES.map((lang) => meta.title[lang])).size).toBe(3)
  })
})
