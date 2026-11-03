import { describe, expect, it } from 'vitest'
import { EXPERIMENT_COMPONENTS } from '../components/lab/registry'
import { LANGUAGES } from '../i18n/config'
import { buildDocumentMeta } from '../routes/documentMeta'
import { resolveLanguageSwitch } from '../routes/languageSwitch'
import { findPage, LAB_PAGES, labIdOfPage, PAGES } from '../routes/pages'
import { dictionaries } from '../i18n/dictionaries'
import {
  experimentPath,
  experiments,
  findExperiment,
  isPlayable,
  neighbourExperiment,
  playableExperiments,
  statusLabels,
} from './lab'
import { experimentSummary } from './labMeta'
import { experimentText, labText } from './labText'

/** Every Trilingual inside a structure, with where it is. */
function trilinguals(value: unknown, path: string, found: Array<[string, Record<string, string>]> = []) {
  if (typeof value !== 'object' || value === null) return found
  const record = value as Record<string, unknown>
  if (typeof record.hu === 'string' && typeof record.en === 'string' && typeof record.nl === 'string') {
    found.push([path, record as Record<string, string>])
    return found
  }
  for (const [key, child] of Object.entries(record)) trilinguals(child, `${path}.${key}`, found)
  return found
}

describe('the Lab: its experiments and its routes', () => {
  it('gives every ready experiment a page, a component and a unique path, and nothing else', () => {
    const ready = experiments.filter(isPlayable)
    expect(ready.length).toBeGreaterThan(0)
    for (const experiment of experiments) {
      const page = findPage(experimentPath(experiment.id))
      if (isPlayable(experiment)) {
        expect(page?.id, experiment.name).toBe(`lab-${experiment.id}`)
        expect(EXPERIMENT_COMPONENTS[experiment.id], experiment.name).toBeDefined()
      } else {
        expect(page, `${experiment.name} is ${experiment.status}: it must not have a page`).toBeUndefined()
      }
    }
    expect(LAB_PAGES.map((page) => page.id)).toEqual(ready.map((experiment) => `lab-${experiment.id}`))
    expect(new Set(PAGES.map((page) => page.path)).size).toBe(PAGES.length)
  })

  it('has no component for an experiment that is not in the list', () => {
    for (const id of Object.keys(EXPERIMENT_COMPONENTS)) expect(findExperiment(id), id).toBeDefined()
  })

  it('serves every experiment in every language', () => {
    for (const page of LAB_PAGES) expect([...page.languages].sort()).toEqual([...LANGUAGES].sort())
    for (const experiment of playableExperiments) {
      for (const lang of LANGUAGES) {
        const target = resolveLanguageSwitch(`/hu${experimentPath(experiment.id)}`, lang)
        expect(target).toEqual({ path: `/${lang}${experimentPath(experiment.id)}`, samePage: true })
      }
    }
  })

  it('knows which page is an experiment and which is not', () => {
    expect(labIdOfPage('lab-particle-universe')).toBe('particle-universe')
    expect(labIdOfPage('lab')).toBeNull()
    expect(labIdOfPage('home')).toBeNull()
    expect(labIdOfPage('project-spendly')).toBeNull()
  })

  it('walks from experiment to experiment and wraps round at both ends', () => {
    const ids = playableExperiments.map((experiment) => experiment.id)
    const first = ids[0]
    const last = ids[ids.length - 1]
    expect(neighbourExperiment(first, 1)?.id).toBe(ids[1])
    expect(neighbourExperiment(last, 1)?.id).toBe(first)
    expect(neighbourExperiment(first, -1)?.id).toBe(last)
    // Going forward all the way round comes back to the start.
    let at = first
    for (let i = 0; i < ids.length; i++) at = neighbourExperiment(at, 1)!.id
    expect(at).toBe(first)
  })
})

describe('the Lab: its words', () => {
  it.each(LANGUAGES)('has every text in %s, never empty', (lang) => {
    const all = [
      ...trilinguals(labText, 'labText'),
      ...trilinguals(experimentText, 'experimentText'),
      ...trilinguals(experiments, 'experiments'),
      ...trilinguals(statusLabels, 'statusLabels'),
    ]
    expect(all.length).toBeGreaterThan(60)
    for (const [path, text] of all) expect(text[lang].trim(), `${path}.${lang}`).not.toBe('')
  })

  it('keeps the signature line and the experiments’ names in English, and has no placeholder left in a text', () => {
    expect(labText.signature).toBe('MOVE. DISTORT. EXPLORE.')
    for (const [path, text] of [...trilinguals(labText, 'labText'), ...trilinguals(experimentText, 'experimentText')]) {
      for (const lang of LANGUAGES) expect(text[lang], `${path}.${lang}`).not.toMatch(/TODO|lorem|undefined|\bnull\b/i)
    }
  })

  it('titles the Lab and each experiment page in every language', () => {
    const lab = findPage('/lab')
    expect(lab).toBeDefined()
    for (const lang of LANGUAGES) {
      const t = dictionaries[lang]
      const labMeta = buildDocumentMeta(lab, lang, t, 'Brand')
      expect(labMeta.title).toContain(labText.meta.title[lang])
      expect(labMeta.description).toBe(labText.meta.description[lang])
      for (const page of LAB_PAGES) {
        const id = labIdOfPage(page.id)!
        const meta = buildDocumentMeta(page, lang, t, 'Brand')
        expect(meta.title).toContain(findExperiment(id)!.name)
        expect(meta.description).toBe(experimentSummary[id][lang])
      }
    }
  })
})
