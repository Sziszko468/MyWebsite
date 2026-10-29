import { describe, expect, it } from 'vitest'
import { projectMeta } from '../content/projectDetails/meta'
import { projects } from '../content/projects'
import { LANGUAGES } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import { buildDocumentMeta, ogLocale } from './documentMeta'
import { NAV_PAGES, PAGES, PROJECT_PAGES, findPage, projectIdOfPage } from './pages'

const BRAND = 'Test Brand'

describe('the project pages in the registry', () => {
  it('have one page for each project that has a details path, at that path, in every language', () => {
    const withPath = projects.filter((p) => p.detailPath !== null)
    expect(PROJECT_PAGES.map((p) => p.path)).toEqual(withPath.map((p) => p.detailPath))
    for (const page of PROJECT_PAGES) expect([...page.languages]).toEqual([...LANGUAGES])
  })

  it('are found by path, and know their project', () => {
    expect(findPage('/work/spendly')?.id).toBe('project-spendly')
    expect(projectIdOfPage('project-bookinghub')).toBe('bookinghub')
    expect(projectIdOfPage('work')).toBeNull()
    expect(findPage('/work/hollandia')).toBeUndefined()
  })

  it('stay out of the navigation and keep it at six', () => {
    expect(NAV_PAGES).toHaveLength(6)
    expect(PAGES.length).toBeGreaterThanOrEqual(NAV_PAGES.length + PROJECT_PAGES.length)
    for (const page of PROJECT_PAGES) expect(NAV_PAGES.map((p) => p.id)).not.toContain(page.id)
  })
})

describe('buildDocumentMeta', () => {
  it.each(LANGUAGES)('gives each project page its own title and description in %s', (lang) => {
    const t = dictionaries[lang]
    const titles = new Set<string>()
    for (const page of PROJECT_PAGES) {
      const meta = buildDocumentMeta(page, lang, t, BRAND)
      const own = projectMeta[projects.find((p) => `project-${p.id}` === page.id)!.id]!
      expect(meta.title).toBe(`${own.title[lang]} — ${BRAND}`)
      expect(meta.description).toBe(own.description[lang])
      expect(meta.ogType).toBe('article')
      titles.add(meta.title)
    }
    expect(titles.size).toBe(PROJECT_PAGES.length)
  })

  it('differs between languages for the same project page', () => {
    const page = PROJECT_PAGES[0]
    const titles = LANGUAGES.map((lang) => buildDocumentMeta(page, lang, dictionaries[lang], BRAND).title)
    expect(new Set(titles).size).toBe(3)
  })

  it('titles the navigation pages by their label and the home page by the site', () => {
    const t = dictionaries.en
    expect(buildDocumentMeta(findPage('/work'), 'en', t, BRAND)).toMatchObject({ title: `${t.nav.work} — ${BRAND}`, ogType: 'website' })
    expect(buildDocumentMeta(findPage('/'), 'en', t, BRAND).title).toBe(`${BRAND} — ${t.meta.title}`)
  })

  it.each(LANGUAGES)('gives the services page its own title and description in %s', (lang) => {
    const t = dictionaries[lang]
    const meta = buildDocumentMeta(findPage('/services'), lang, t, BRAND)
    expect(meta.title).toBe(`${t.servicesPage.meta.title} — ${BRAND}`)
    expect(meta.description).toBe(t.servicesPage.meta.description)
    expect(meta.title).not.toBe(`${t.nav.services} — ${BRAND}`)
    expect(meta.ogType).toBe('website')
  })

  it('says so for a path that does not exist', () => {
    const t = dictionaries.nl
    expect(buildDocumentMeta(undefined, 'nl', t, BRAND)).toMatchObject({ title: `${t.notFound.title} — ${BRAND}`, description: t.notFound.description })
  })

  it('maps each language to an Open Graph locale', () => {
    expect(LANGUAGES.map(ogLocale)).toEqual(['hu_HU', 'en_US', 'nl_NL'])
  })
})
