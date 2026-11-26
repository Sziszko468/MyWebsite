import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { archiveText } from '../content/archive/text'
import { archiveMeta, commandCenterMeta } from '../content/archive/meta'
import { demoEntry } from '../content/demos/entry'
import { experiments, playableExperiments, statusLabels } from '../content/lab'
import { playgroundEntry } from '../content/playground/entry'
import { playgroundMeta } from '../content/playground/meta'
import { localize } from '../content/trilingual'
import { parseProjectDemo } from '../demos/ids'
import { LANGUAGES, type Language } from '../i18n/config'
import { I18nContext } from '../i18n/context'
import { dictionaries } from '../i18n/dictionaries'
import { scopeOfPage } from '../motion/config'
import { staticCards, staticCategories, staticRecord } from '../projects/static'
import { isAvailable, viewOf, type CardView } from '../projects/types'
import { buildDocumentMeta } from '../routes/documentMeta'
import { NAV_PAGES, PAGES, SYSTEM_PAGES, findPage, resolvePage } from '../routes/pages'
import { flattenKinetic } from '../test/markup'
import { ThemeContext } from '../theme/context'
import { ArchivePage } from '../pages/ArchivePage'
import { CommandCenterPage } from '../pages/CommandCenterPage'
import {
  ARCHIVE_KINDS,
  ARCHIVE_STATUSES,
  SORTS,
  TEXT_MAX,
  anchorFromHash,
  buildEntries,
  defaultQuery,
  effectiveQuery,
  entryAnchor,
  facetsOf,
  filterEntries,
  isActive,
  normalize,
  readQuery,
  sortEntries,
  writeQuery,
  type ArchiveEntry,
  type ArchiveLabels,
  type ArchiveSources,
} from './model'

/**
 * The Command Center and the Digital Archive (PROMPT 37). The archive is built here from the website's own content (the same records the pages read when no backend answers),
 * so these tests state facts about what is really public: the data's integrity, that nothing private or unpublished can reach it, how search, filters, sorting and direct links
 * behave, what the pages say in each language, and how they are registered. The visitor's journey in a real browser is tools/e2e/archive-journey.cjs.
 */

// No backend in a test: the pages read the website's own content, as they do when none is configured.
vi.mock('../config/api', async (original) => ({ ...(await original<typeof import('../config/api')>()), API_BASE: null }))

const SRC = join(__dirname, '..')
const PUBLIC = join(SRC, '..', 'public')

const cardsIn = (lang: Language): CardView[] => {
  const names = new Map(staticCategories.map((category) => [category.key, category.label[lang]]))
  return staticCards.filter((card) => isAvailable(card, lang)).map((card) => viewOf(card, lang, names.get(card.category)))
}
const demosOf = (cards: readonly CardView[]) =>
  cards.flatMap((card) => {
    const demo = parseProjectDemo(staticRecord(card.slug)?.detail.demo, card.slug)
    return demo && card.detailPath !== null ? [{ slug: card.slug, type: demo.type }] : []
  })

function sourcesIn(lang: Language, patch: Partial<ArchiveSources> = {}): ArchiveSources {
  const words = localize(archiveText, lang)
  const demos = localize(demoEntry, lang)
  const cards = cardsIn(lang)
  return {
    lang,
    projects: cards,
    demos: demosOf(cards),
    experiments,
    categoryName: (key) => staticCategories.find((category) => category.key === key)?.label[lang] ?? '',
    words: {
      creativeCoding: words.categories.creativeCoding,
      designTools: words.categories.designTools,
      unnamedCategory: words.categories.unnamed,
      unnamedCategoryNumbered: words.categories.unnamedNumbered,
      demoName: (type) => demos.kinds[type].name,
      demoSummary: (type) => demos.kinds[type].summary,
      toolTitle: playgroundEntry.title[lang],
      toolDescription: playgroundMeta.description[lang],
      demoTitle: words.demoTitle,
    },
    ...patch,
  }
}
const labelsIn = (lang: Language): ArchiveLabels => {
  const words = localize(archiveText, lang)
  const t = dictionaries[lang]
  return { kind: words.kinds.one, status: { live: t.status.live, demo: t.status.demo, 'in-progress': t.status.inProgress, concept: t.status.concept, ready: statusLabels.ready[lang] } }
}
const entriesIn = (lang: Language) => buildEntries(sourcesIn(lang))

describe('the archive’s data', () => {
  it('is 14 entries built from what the site has: four projects, three demos, the six experiences and the design tool', () => {
    for (const lang of LANGUAGES) {
      const entries = entriesIn(lang)
      expect(entries.map((entry) => entry.kind)).toEqual([...Array(4).fill('project'), ...Array(3).fill('demo'), ...Array(6).fill('lab'), 'tool'])
      expect(entries.filter((entry) => entry.kind === 'lab').map((entry) => entry.title)).toEqual(playableExperiments.map((experiment) => experiment.name))
    }
    expect(experiments).toHaveLength(6)
  })

  it('has a unique, stable, valid anchor for every entry, in the same order in every language', () => {
    const ids = LANGUAGES.map((lang) => entriesIn(lang).map((entry) => entry.id))
    expect(ids[1]).toEqual(ids[0])
    expect(ids[2]).toEqual(ids[0])
    expect(new Set(ids[0]).size).toBe(ids[0].length)
    for (const id of ids[0]) expect(anchorFromHash(`#${id}`), id).toBe(id)
    expect(entryAnchor('project', 'spendly')).toBe('entry-project-spendly')
  })

  it('fills every field from a real record, in the page’s language: no empty title, text, category or label', () => {
    for (const lang of LANGUAGES) {
      for (const entry of entriesIn(lang)) {
        expect(entry.title.trim().length, `${lang} ${entry.id}`).toBeGreaterThan(0)
        expect(entry.description.trim().length, `${lang} ${entry.id}`).toBeGreaterThan(5)
        expect(entry.categoryLabel.trim().length, `${lang} ${entry.id}`).toBeGreaterThan(2)
        expect(entry.categoryLabel, entry.id).not.toBe(entry.category)
        expect(ARCHIVE_STATUSES, entry.id).toContain(entry.status)
        expect(entry.title, entry.id).not.toMatch(/undefined|\{[a-z]+\}/)
      }
    }
  })

  it('links only to pages that exist, and says so for a project that has none', () => {
    for (const lang of LANGUAGES) {
      for (const entry of entriesIn(lang)) {
        for (const href of [entry.href, entry.related?.href ?? null]) {
          if (href === null) continue
          expect(resolvePage(href), `${entry.id} → ${href}`).toBeDefined()
        }
      }
    }
    const hollandia = entriesIn('en').find((entry) => entry.id === 'entry-project-hollandia')!
    expect(hollandia.href).toBeNull()
    expect(hollandia.related).toBeNull()
  })

  it('uses only pictures that exist: the project’s screenshot when there is one, otherwise the site’s own sketch, art or colours', () => {
    for (const entry of entriesIn('en')) {
      if (entry.visual.type === 'image') expect(existsSync(join(PUBLIC, entry.visual.src.replace(/^\//, ''))), entry.visual.src).toBe(true)
      else expect(['mockup', 'lab', 'tool']).toContain(entry.visual.type)
    }
  })

  it('makes up nothing: no date, metric, client, award or result anywhere in an entry', () => {
    for (const entry of entriesIn('en')) {
      expect(Object.keys(entry).sort()).toEqual(['category', 'categoryLabel', 'description', 'href', 'id', 'kind', 'order', 'related', 'status', 'tags', 'title', 'visual'].sort())
    }
    expect(JSON.stringify(entriesIn('en'))).not.toMatch(/"(date|createdAt|publishedAt|views|rating|client|award|result|score)"/i)
  })

  it('categories come from real content: the CMS’s project categories and the two for the Lab and the tool, only where an entry has one', () => {
    const facets = facetsOf(entriesIn('en'))
    expect(facets.categories.map((facet) => facet.key).sort()).toEqual(['apps', 'concepts', 'creative-coding', 'design-tools', 'platforms'])
    for (const facet of facets.categories) expect(facet.count).toBeGreaterThan(0)
    expect(facets.statuses.map((facet) => facet.key).sort()).toEqual(['concept', 'demo', 'ready'])
    expect(facets.kinds.map((facet) => [facet.key, facet.count])).toEqual([['project', 4], ['demo', 3], ['lab', 6], ['tool', 1]])
  })

  it('drops a draft and an invalid record even if one is passed in, and never lists the same entry twice', () => {
    const cards = cardsIn('en')
    const bad: CardView[] = [
      { ...cards[0], slug: 'secret-draft', draft: true },
      { ...cards[0], slug: '../admin' },
      { ...cards[0], slug: 'no-name', name: '   ' },
      { ...cards[0], slug: 'weird', status: 'private' as never },
      cards[0],
    ]
    const entries = buildEntries(sourcesIn('en', { projects: [...cards, ...bad], demos: [...demosOf(cards), { slug: 'secret-draft', type: 'finance-workbench' }] }))
    expect(entries).toHaveLength(14)
    expect(entries.map((entry) => entry.id).join(' ')).not.toMatch(/secret|admin|no-name|weird/)
  })

  it('lists a demo only when the project’s public detail has one, and only for a project with a page', () => {
    const cards = cardsIn('en')
    expect(buildEntries(sourcesIn('en', { demos: [] })).filter((entry) => entry.kind === 'demo')).toHaveLength(0)
    expect(buildEntries(sourcesIn('en', { demos: [] })).filter((entry) => entry.related !== null)).toHaveLength(0)
    const noPage = buildEntries(sourcesIn('en', { demos: [{ slug: 'hollandia', type: 'finance-workbench' }] }))
    expect(noPage.filter((entry) => entry.kind === 'demo')).toHaveLength(0)
    expect(demosOf(cards).map((demo) => demo.slug)).toEqual(['spendly', 'bookinghub', 'logistics-platform'])
  })

  it('shows a project only in the languages it exists in', () => {
    const cards = cardsIn('en').map((card) => card)
    const english = staticCards.map((card) => (card.slug === 'spendly' ? { ...card, languages: ['en'] as Language[] } : card))
    expect(english.filter((card) => isAvailable(card, 'hu')).map((card) => card.slug)).not.toContain('spendly')
    expect(cards.length).toBe(4)
  })
})

describe('what stays private', () => {
  const sources = (directory: string): Array<{ file: string; text: string }> =>
    readdirSync(directory).flatMap((name) => {
      const path = join(directory, name)
      if (statSync(path).isDirectory()) return sources(path)
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [{ file: relative(SRC, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }] : []
    })
  const own = [...sources(__dirname), ...['pages/ArchivePage.tsx', 'pages/CommandCenterPage.tsx'].map((file) => ({ file, text: readFileSync(join(SRC, file), 'utf8') }))]

  it('reads nothing from the administration, the portal, the quotations, the booking, the assistant, the analytics or the contact form', () => {
    for (const { file, text } of own) {
      expect(text, file).not.toMatch(/from '\.\.?\/(\.\.\/)?(admin|portal|quotes|booking|contact|ai|analytics|security)\b/)
      expect(text, file).not.toMatch(/\/api\/admin|\/api\/portal|credentials:\s*(true|'include')|document\.cookie|localStorage|sessionStorage/)
    }
  })

  /** The code without its comments: a comment may name the thing that is never done. */
  const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '')

  it('asks for the public project list only: never the administrator’s preview, whatever the address says', () => {
    for (const { file, text } of own) expect(code(text), file).not.toMatch(/usePreviewFlag|useCards\(|useProjectList\(true|preview=1|project-preview|ensureList\(true/)
    const hook = readFileSync(join(__dirname, 'useArchive.ts'), 'utf8')
    expect(hook).toContain('useProjectList(false)')
    // A list an administrator loaded earlier in the visit is not used.
    expect(hook).toContain('list.preview ? null : list')
  })

  it('creates no data of its own: no request, no storage, no second database', () => {
    for (const { file, text } of own) {
      expect(text, file).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|indexedDB/)
      expect(text, file).not.toMatch(/\beval\s*\(|innerHTML|dangerouslySetInnerHTML/)
    }
  })

  it('never writes the site’s theme', () => {
    for (const { file, text } of own) expect(text, file).not.toMatch(/setTheme|toggleTheme|followSystem|applyTheme|documentElement|data-theme/)
  })
})

describe('search, filters and sorting', () => {
  const entries = entriesIn('en')
  const labels = labelsIn('en')
  const find = (text: string, patch = {}) => filterEntries(entries, { ...defaultQuery(), text, ...patch }, labels)

  it('ignores accents and case, in every language', () => {
    expect(normalize('  Időpont  FOGLALÁS ')).toBe('idopont foglalas')
    const hungarian = entriesIn('hu')
    const hu = (text: string) => filterEntries(hungarian, { ...defaultQuery(), text }, labelsIn('hu')).map((entry) => entry.id)
    expect(hu('idopont')).toEqual(hu('IDŐPONT'))
    expect(hu('idopont').length).toBeGreaterThan(0)
    expect(hu('dizajn').length).toBeGreaterThan(0)
  })

  it('finds a name, a technology, a category, a kind and a status', () => {
    expect(find('spendly').map((entry) => entry.id)).toEqual(['entry-project-spendly', 'entry-demo-spendly'])
    expect(find('django').map((entry) => entry.id)).toEqual(['entry-project-spendly', 'entry-demo-spendly'])
    expect(find('creative coding')).toHaveLength(6)
    expect(find('demo').length).toBeGreaterThanOrEqual(6)
    expect(find('concept').map((entry) => entry.id)).toContain('entry-project-hollandia')
  })

  it('wants every word', () => {
    expect(find('spendly booking')).toHaveLength(0)
    expect(find('react postgresql').every((entry) => entry.tags.includes('React'))).toBe(true)
    expect(find('react postgresql').length).toBeGreaterThan(0)
  })

  it('returns nothing for words that are nowhere, and everything for an empty or blank search', () => {
    expect(find('zzzzqqq')).toEqual([])
    expect(find('')).toHaveLength(14)
    expect(find('     ')).toHaveLength(14)
  })

  it('filters by kind, category and status, together', () => {
    expect(find('', { kind: 'demo' })).toHaveLength(3)
    expect(find('', { category: 'creative-coding' })).toHaveLength(6)
    expect(find('', { status: 'concept' }).map((entry) => entry.id)).toEqual(['entry-project-hollandia'])
    expect(find('', { kind: 'project', category: 'apps' }).map((entry) => entry.id)).toEqual(['entry-project-spendly', 'entry-project-bookinghub'])
    expect(find('', { kind: 'lab', status: 'concept' })).toEqual([])
    expect(find('particle', { kind: 'lab' })).toHaveLength(1)
    expect(find('particle', { kind: 'demo' })).toEqual([])
  })

  it('sorts in the curated order, by name both ways with the language’s own collation, and by kind', () => {
    expect(sortEntries(entries, 'curated', 'en').map((entry) => entry.order)).toEqual(entries.map((_, index) => index))
    const names = sortEntries(entries, 'name', 'en').map((entry) => entry.title)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en-GB', { sensitivity: 'base', numeric: true })))
    expect(sortEntries(entries, 'name-desc', 'en').map((entry) => entry.title)).toEqual([...names].reverse())
    const kinds = sortEntries(entries, 'kind', 'en').map((entry) => ARCHIVE_KINDS.indexOf(entry.kind))
    expect(kinds).toEqual([...kinds].sort((a, b) => a - b))
    // Hungarian puts Á after A and before B: the accent is part of the language's own order.
    const hu: ArchiveEntry[] = ['Béke', 'Ábel', 'Arany'].map((title, order) => ({ ...entries[0], id: `entry-project-x${order}`, title, order }))
    expect(sortEntries(hu, 'name', 'hu').map((entry) => entry.title)).toEqual(['Ábel', 'Arany', 'Béke'])
  })

  it('never changes the list it was given', () => {
    const copy = [...entries]
    sortEntries(entries, 'name', 'en')
    filterEntries(entries, { ...defaultQuery(), text: 'a' }, labels)
    expect(entries).toEqual(copy)
  })

  it('reads a query from an address and writes it back, ignoring anything unknown or malformed', () => {
    const query = { text: 'react', kind: 'project' as const, category: 'apps', status: 'demo' as const, sort: 'name' as const }
    expect(readQuery(writeQuery(query))).toEqual(query)
    expect(writeQuery(defaultQuery()).toString()).toBe('')
    expect(isActive(defaultQuery())).toBe(false)
    for (const patch of [{ text: 'x' }, { kind: 'lab' as const }, { category: 'apps' }, { status: 'ready' as const }, { sort: 'kind' as const }]) expect(isActive({ ...defaultQuery(), ...patch })).toBe(true)
    const hostile = readQuery(new URLSearchParams('q=%00%07abc&kind=admin&category=<script>&status=secret&sort=drop%20table&preview=1'))
    expect(hostile).toEqual({ ...defaultQuery(), text: '  abc' })
    expect(readQuery(new URLSearchParams({ q: 'x'.repeat(500) })).text).toHaveLength(TEXT_MAX)
    for (const sort of SORTS) expect(readQuery(new URLSearchParams({ sort })).sort).toBe(sort)
  })

  it('drops a filter value that nothing has, once the data is there, and keeps it while the data is still arriving', () => {
    const facets = facetsOf(entries)
    const asked = { ...defaultQuery(), category: 'gone-category', status: 'live' as const, kind: 'project' as const }
    expect(effectiveQuery(asked, facets, true)).toEqual({ ...defaultQuery(), kind: 'project' })
    expect(effectiveQuery(asked, facets, false)).toEqual(asked)
  })

  it('accepts only a well-formed direct link', () => {
    expect(anchorFromHash('#entry-lab-particle-universe')).toBe('entry-lab-particle-universe')
    for (const bad of ['', '#', '#work', '#entry-admin-x', '#entry-project-', '#entry-project-../x', '#entry-project-X', '#entry-project-a b']) expect(anchorFromHash(bad), bad).toBeNull()
  })
})

function wrap(lang: Language, child: ReturnType<typeof createElement>, path = '/en/archive') {
  return flattenKinetic(
    renderToStaticMarkup(
      createElement(
        ThemeContext.Provider,
        { value: { theme: 'dark', setTheme: () => undefined, toggleTheme: () => undefined, followSystem: () => undefined } },
        createElement(MemoryRouter, { initialEntries: [path] }, createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, child)),
      ),
    ),
  )
}
const headingLevels = (html: string) => [...html.matchAll(/<h([1-6])[\s>]/g)].map((match) => Number(match[1]))
const noSkips = (levels: number[]) => levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1)

describe('the archive page', () => {
  it.each(LANGUAGES)('%s: one h1, a labelled search, the filters, all 14 entries with headings in order, a status region', (lang) => {
    const t = localize(archiveText, lang)
    const html = wrap(lang, createElement(ArchivePage), `/${lang}/archive`)
    const levels = headingLevels(html)
    expect(levels.filter((level) => level === 1)).toHaveLength(1)
    expect(noSkips(levels), levels.join(',')).toBe(true)
    expect(levels.filter((level) => level === 3)).toHaveLength(14)
    expect(html).toContain('role="search"')
    expect(html).toContain(t.archive.search)
    expect(html).toContain(t.archive.category)
    expect(html).toContain(t.archive.status)
    expect(html).toContain(t.archive.sort)
    expect(html).toMatch(/role="status"[^>]*aria-live="polite"/)
    expect(html).toContain(t.archive.results.replace('{shown}', '14').replace('{total}', '14'))
    expect(html.match(/<article/g)).toHaveLength(14)
    expect(html).toContain(`href="/${lang}/work/spendly"`)
    expect(html).toContain(`href="/${lang}/lab/particle-universe"`)
    expect(html).toContain('href="#entry-lab-particle-universe"')
    expect(html).not.toMatch(/undefined|\{[a-z]+\}|archive\.[a-z]+\.[a-z]/)
  })

  it('shows the filtered result of the address, and the empty state with a way out', () => {
    const t = localize(archiveText, 'en')
    const filtered = wrap('en', createElement(ArchivePage), '/en/archive?kind=lab&q=particle')
    expect(filtered.match(/<article/g)).toHaveLength(1)
    expect(filtered).toContain(t.archive.results.replace('{shown}', '1').replace('{total}', '14'))
    const empty = wrap('en', createElement(ArchivePage), '/en/archive?q=zzzzqqq')
    expect(empty.match(/<article/g)).toBeNull()
    expect(empty).toContain(t.archive.emptyTitle)
    expect(empty).toContain(t.archive.clear)
    expect(headingLevels(empty).filter((level) => level === 1)).toHaveLength(1)
  })

  it('ignores an administrator’s preview flag in the address: the same public entries', () => {
    const html = wrap('en', createElement(ArchivePage), '/en/archive?preview=1')
    expect(html.match(/<article/g)).toHaveLength(14)
    expect(html).not.toMatch(/draft/i)
  })
})

describe('the Command Center', () => {
  it.each(LANGUAGES)('%s: one h1, the map with real counts, and a way to every place', (lang) => {
    const t = localize(archiveText, lang)
    const html = wrap(lang, createElement(CommandCenterPage), `/${lang}/command-center`)
    const levels = headingLevels(html)
    expect(levels.filter((level) => level === 1)).toHaveLength(1)
    expect(noSkips(levels), levels.join(',')).toBe(true)
    for (const to of ['/archive', '/work', '/lab', '/lab/design-system', '/services', '/about', '/contact', '/work/spendly', '/work/spendly/demo']) expect(html, to).toContain(`href="/${lang}${to}"`)
    for (const experiment of playableExperiments) expect(html).toContain(`href="/${lang}/lab/${experiment.id}"`)
    expect(html).toContain(t.command.map.archive.count.replace('{count}', '14'))
    expect(html).toContain(t.command.map.lab.count.replace('{count}', '6'))
    expect(html).toContain(t.command.map.services.count.replace('{count}', '4'))
    expect(html).toContain(t.command.line.replace('{entries}', '14').replace('{languages}', '3'))
    expect(html).not.toMatch(/undefined|\{[a-z]+\}/)
  })

  it('links nowhere outside the site and shows nothing of the private parts', () => {
    const html = wrap('en', createElement(CommandCenterPage), '/en/command-center')
    expect(html).not.toMatch(/href="https?:|href="\/en\/(client-portal|quote|request|consultation\/booking)|\/admin|nfsu2/i)
  })
})

describe('registration, navigation and search engines', () => {
  it('has two indexable pages in every language, outside the six-page header navigation', () => {
    expect(SYSTEM_PAGES.map((page) => page.path)).toEqual(['/command-center', '/archive'])
    for (const page of SYSTEM_PAGES) {
      expect(page.indexable).toBe(true)
      expect(page.languages).toEqual(LANGUAGES)
      expect(findPage(page.path)).toBe(page)
      expect(PAGES).toContain(page)
    }
    expect(NAV_PAGES).toHaveLength(6)
    expect(NAV_PAGES.map((page) => page.path)).not.toContain('/archive')
    expect(scopeOfPage('command-center')).toBe('lab')
    expect(scopeOfPage('archive')).toBe('portfolio')
  })

  it('gives each page a title and description of its own in every language', () => {
    const seen = new Set<string>()
    for (const page of SYSTEM_PAGES) {
      for (const lang of LANGUAGES) {
        const meta = buildDocumentMeta(page, lang, dictionaries[lang], 'Brand')
        expect(meta.title).toContain('Brand')
        expect(meta.description.length).toBeGreaterThan(80)
        seen.add(meta.title)
        seen.add(meta.description)
      }
    }
    expect(seen.size).toBe(12)
    expect(commandCenterMeta.title.en).toBe('Command Center')
    expect(archiveMeta.title.en).toBe('Digital Archive')
  })

  it('keeps the system bar to the four places, and the footer links to both pages on every page', () => {
    const bar = readFileSync(join(__dirname, 'SystemBar.tsx'), 'utf8')
    for (const to of ['/command-center', '/archive', '/work', '/lab']) expect(bar).toContain(`'${to}'`)
    const footer = readFileSync(join(SRC, 'components/SiteFooter/SiteFooter.tsx'), 'utf8')
    expect(footer).toContain('to="/command-center"')
    expect(footer).toContain('to="/archive"')
    for (const lang of LANGUAGES) {
      expect(dictionaries[lang].footer.commandCenter.length).toBeGreaterThan(3)
      expect(dictionaries[lang].footer.archive.length).toBeGreaterThan(3)
    }
  })

  it('keeps the pages out of the main bundle: lazy routes, and the main code reads only the head’s small file', () => {
    const app = readFileSync(join(SRC, 'App.tsx'), 'utf8')
    expect(app).toMatch(/lazyRoute\(\(\) => import\('\.\/pages\/ArchivePage'\)/)
    expect(app).toMatch(/lazyRoute\(\(\) => import\('\.\/pages\/CommandCenterPage'\)/)
    expect(app).not.toMatch(/from '\.\/(archive|pages\/(ArchivePage|CommandCenterPage))/)
    for (const file of ['routes/documentMeta.ts', 'seo/jsonLd.ts', 'routes/pages.ts', 'components/SiteFooter/SiteFooter.tsx']) {
      expect(readFileSync(join(SRC, file), 'utf8'), file).not.toMatch(/from '\.\.\/(\.\.\/)?archive\/|content\/archive\/text/)
    }
  })

  it('moves quietly: every animation is behind the reduced-motion query, nothing loops, only the compositor moves', () => {
    for (const name of readdirSync(__dirname).filter((file) => file.endsWith('.scss'))) {
      const css = readFileSync(join(__dirname, name), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(css, name).not.toMatch(/\binfinite\b|animation-iteration-count/)
      for (const match of css.matchAll(/animation\s*:/g)) {
        expect(css.slice(0, match.index), name).toMatch(/prefers-reduced-motion:\s*no-preference[^}]*\{[^}]*$/)
      }
    }
  })

  it('uses native controls only: no click handler on a div or span, no tabindex above zero', () => {
    for (const file of ['pages/ArchivePage.tsx', 'pages/CommandCenterPage.tsx', 'archive/EntryRow.tsx', 'archive/KindRail.tsx', 'archive/SystemBar.tsx']) {
      const text = readFileSync(join(SRC, file), 'utf8')
      expect(text, file).not.toMatch(/<(div|span|li|article)[^>]*onClick=|role="button"|tabIndex=\{?[1-9]/)
    }
  })
})

describe('the words', () => {
  const triples = (value: unknown, path: string, found: Array<[string, Record<string, string>]> = []) => {
    if (typeof value !== 'object' || value === null) return found
    const record = value as Record<string, unknown>
    if (typeof record.hu === 'string' && typeof record.en === 'string' && typeof record.nl === 'string') {
      found.push([path, record as Record<string, string>])
      return found
    }
    for (const [key, child] of Object.entries(record)) triples(child, `${path}.${key}`, found)
    return found
  }
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

  it('every text is in every language, none empty, and the languages ask for the same values', () => {
    const found = triples({ archiveText, archiveMeta, commandCenterMeta }, 'root')
    expect(found.length).toBeGreaterThan(60)
    for (const [path, text] of found) {
      for (const lang of LANGUAGES) expect(text[lang].trim().length, `${path} ${lang}`).toBeGreaterThan(0)
      expect(placeholders(text.hu), path).toEqual(placeholders(text.en))
      expect(placeholders(text.nl), path).toEqual(placeholders(text.en))
    }
  })
})
