import { describe, expect, it } from 'vitest'
import { LANGUAGES } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import { PAGES, findPage } from '../routes/pages'
import { siteStack } from './about'
import { experiments } from './lab'
import { experimentText } from './labText'
import { offerings } from './offerings'
import { packages } from './packages'
import { projects } from './projects'

const HTTPS = /^https:\/\/[^\s/]+\.[^\s/]+/

describe('projects', () => {
  it('have unique ids and names', () => {
    expect(new Set(projects.map((p) => p.id)).size).toBe(projects.length)
    expect(new Set(projects.map((p) => p.name)).size).toBe(projects.length)
    for (const project of projects) expect(project.name.trim(), project.id).not.toBe('')
  })

  it.each(LANGUAGES)('have a category and a description in %s', (lang) => {
    for (const project of projects) {
      const copy = dictionaries[lang].home.work.items[project.id]
      expect(copy.category.trim(), `${lang}:${project.id}`).not.toBe('')
      expect(copy.description.trim(), `${lang}:${project.id}`).not.toBe('')
    }
  })

  it('list each technology once, with no blanks', () => {
    for (const project of projects) {
      expect(new Set(project.tags).size, project.id).toBe(project.tags.length)
      for (const tag of project.tags) expect(tag.trim(), project.id).not.toBe('')
    }
  })

  it('never claim more than the configuration can back up', () => {
    for (const project of projects) {
      // "Live" needs an address to be live at; a concept has no demo to link to.
      if (project.status === 'live') expect(project.demoUrl, `${project.id} is live`).not.toBeNull()
      if (project.status === 'concept') expect(project.demoUrl, `${project.id} is a concept`).toBeNull()
    }
  })

  it('link only to addresses that exist: https demos and real routes', () => {
    for (const project of projects) {
      if (project.demoUrl !== null) expect(project.demoUrl, project.id).toMatch(HTTPS)
      if (project.detailPath !== null)
        expect(findPage(project.detailPath), `${project.id} → ${project.detailPath}`).toBeDefined()
    }
  })

  it('take a real screenshot only from a root-relative path with a size', () => {
    for (const project of projects) {
      if (project.image === null) continue
      expect(project.image.src, project.id).toMatch(/^\/[^/]/)
      expect(project.image.width, project.id).toBeGreaterThan(0)
      expect(project.image.height, project.id).toBeGreaterThan(0)
    }
  })

  it('mix their compositions, so the section is not a grid of equals', () => {
    expect(new Set(projects.map((p) => p.layout)).size).toBeGreaterThanOrEqual(3)
  })
})

describe('"What I build"', () => {
  it('has unique areas with a title and a text in every language', () => {
    expect(new Set(offerings.map((o) => o.id)).size).toBe(offerings.length)
    for (const lang of LANGUAGES) {
      for (const offering of offerings) {
        const copy = dictionaries[lang].home.build.items[offering.id]
        expect(copy.title.trim(), `${lang}:${offering.id}`).not.toBe('')
        expect(copy.text.trim(), `${lang}:${offering.id}`).not.toBe('')
      }
    }
  })
})

describe('the Lab', () => {
  it('has ten experiments in order: the six experiments, then the four immersive experiences', () => {
    expect(experiments.map((e) => e.id)).toEqual([
      'particle-universe',
      'liquid-matter',
      'type-in-motion',
      'infinite-space',
      'chromatic-distortion',
      'generative-objects',
      'model-studio',
      'racing',
      'track-architect',
      'performance-lab',
    ])
    expect(experiments.map((e) => e.number)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'])
  })

  it('gives a page only to an experiment that is ready', () => {
    for (const experiment of experiments) {
      const hasPage = PAGES.some((page) => page.id === `lab-${experiment.id}`)
      expect(hasPage, experiment.name).toBe(experiment.status === 'ready')
    }
  })

  it('names the technology of every experiment', () => {
    for (const experiment of experiments) expect(experiment.tech.length, experiment.name).toBeGreaterThan(0)
  })

  it.each(LANGUAGES)('describes every experiment in %s', (lang) => {
    for (const experiment of experiments) {
      const copy = experimentText[experiment.id]
      expect(experiment.tagline[lang].trim(), experiment.id).not.toBe('')
      expect(copy.description[lang].trim(), experiment.id).not.toBe('')
      expect(copy.interactions.length, experiment.id).toBeGreaterThan(0)
      for (const item of copy.interactions) expect(item[lang].trim(), experiment.id).not.toBe('')
    }
  })
})

describe('packages', () => {
  it('are Launch, Grow, Build and Care, with exactly one featured', () => {
    expect(packages.map((p) => p.name)).toEqual(['Launch', 'Grow', 'Build', 'Care'])
    expect(packages.filter((p) => p.featured)).toHaveLength(1)
  })

  it('never invent a price: each asks for a quote until a real figure is set', () => {
    for (const pkg of packages) {
      if (pkg.price.kind === 'from') {
        expect(pkg.price.amount, pkg.name).toBeGreaterThan(0)
      } else {
        expect(['quote', 'tbd'], pkg.name).toContain(pkg.price.kind)
      }
    }
  })

  it('say who they are for and what they include, with something to read in every language', () => {
    for (const pkg of packages) {
      expect(pkg.includes.length, pkg.id).toBeGreaterThan(0)
      for (const lang of LANGUAGES) {
        expect(pkg.tagline[lang].trim(), `${lang}:${pkg.id}`).not.toBe('')
        expect(pkg.audience[lang].trim(), `${lang}:${pkg.id}`).not.toBe('')
        for (const item of pkg.includes) expect(item[lang].trim(), `${lang}:${pkg.id}`).not.toBe('')
      }
    }
  })

  it('promise no deadline or guarantee in any language', () => {
    const promise = /\d+\s*(days?|weeks?|nap|hét|dagen|weken)|guarantee|garanci|garantie/i
    for (const lang of LANGUAGES) {
      const text = [
        dictionaries[lang].home.packages.intro,
        ...packages.flatMap((p) => [
          p.tagline[lang],
          p.audience[lang],
          ...p.fits.map((f) => f[lang]),
          ...p.includes.map((i) => i[lang]),
        ]),
      ]
      for (const line of text) expect(line, `${lang}: ${line}`).not.toMatch(promise)
    }
  })
})

describe('the home page’s About section', () => {
  it('has three words in every language, the same number each', () => {
    for (const lang of LANGUAGES) expect(dictionaries[lang].home.about.principles).toHaveLength(3)
  })

  it('shows the tools of this site only once each', () => {
    expect(new Set(siteStack).size).toBe(siteStack.length)
  })

  it('leaves the story, the way of working and the skills to the About page, and says where to find it', () => {
    for (const lang of LANGUAGES) expect(dictionaries[lang].home.about.more.trim(), lang).not.toBe('')
    expect(findPage('/about')?.id).toBe('about')
  })
})
