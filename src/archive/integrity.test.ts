import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { createElement, type FunctionComponent } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { archiveText } from '../content/archive/text'
import { localize } from '../content/trilingual'
import { LANGUAGES, type Language } from '../i18n/config'
import { I18nContext } from '../i18n/context'
import { dictionaries } from '../i18n/dictionaries'
import { ArchivePage } from '../pages/ArchivePage'
import { CommandCenterPage } from '../pages/CommandCenterPage'
import { parseCard, parseCategories } from '../projects/api'
import { staticRecord } from '../projects/static'
import { ensureDetail, ensureList, listSnapshot, primeProjects, resetProjectStore } from '../projects/store'
import type { ProjectCard } from '../projects/types'
import { flattenKinetic } from '../test/markup'
import { ThemeContext } from '../theme/context'
import { readQuery, writeQuery, defaultQuery } from './model'

/**
 * PROMPT 37.1, data integrity. Everything here goes in the way real data does: records shaped like the backend's answers pass through the website's own parser and store, and the
 * assertions read what the two pages draw. A backend is "configured" for these tests (the network is a stub), because the rules being checked are about what the CMS says.
 */

vi.mock('../config/api', async (original) => ({ ...(await original<typeof import('../config/api')>()), API_BASE: 'https://api.test' }))

type Raw = Record<string, unknown>

const all = (text: string) => ({ hu: text, en: text, nl: text })

/** One project as `/api/projects` sends it. */
function record(slug: string, patch: Raw = {}, card: Raw = {}): Raw {
  return {
    slug,
    featured: true,
    category: 'apps',
    card: { title: all(`Title ${slug}`), label: all(''), description: all(`A description of ${slug}.`), tags: ['React'], projectStatus: 'live', layout: 'compact', mockup: 'guide', detailPage: true, languages: ['hu', 'en', 'nl'], thumbnail: null, demoUrl: null, ...card },
    ...patch,
  }
}
const apps = { key: 'apps', label: { hu: 'Alkalmazások', en: 'Applications', nl: 'Toepassingen' } }

function prime(projects: unknown[], categories: unknown): void {
  primeProjects(projects.map(parseCard).filter((card): card is ProjectCard => card !== null), parseCategories(categories))
}

function render(page: FunctionComponent, lang: Language = 'en', suffix = ''): string {
  const path = `/${lang}/${page === ArchivePage ? 'archive' : 'command-center'}${suffix}`
  return flattenKinetic(
    renderToStaticMarkup(
      createElement(
        ThemeContext.Provider,
        { value: { theme: 'dark', setTheme: () => undefined, toggleTheme: () => undefined, followSystem: () => undefined } },
        createElement(MemoryRouter, { initialEntries: [path] }, createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, createElement(page))),
      ),
    ),
  )
}

/** What a visitor can read or hear: the text between the tags, and the values of the attributes that are spoken or shown. Addresses and form values are not read out. */
const readable = (html: string): string => [html.replace(/<[^>]*>/g, '\n'), ...[...html.matchAll(/\s(?:aria-label|alt|title|placeholder)="([^"]*)"/g)].map((match) => match[1])].join('\n')
/** The category select's choices: `[key, shown text]`. */
function categoryOptions(html: string, lang: Language = 'en'): Array<[string, string]> {
  const label = localize(archiveText, lang).archive.category
  const from = html.indexOf(`>${label}<`)
  const select = html.slice(html.indexOf('<select', from), html.indexOf('</select>', from))
  return [...select.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].filter((match) => match[1] !== '').map((match) => [match[1], match[2]])
}
const entryIds = (html: string): string[] => [...html.matchAll(/<article id="([^"]+)"/g)].map((match) => match[1])
/** One entry's markup. */
const entry = (html: string, id: string): string => html.slice(html.indexOf(`<article id="${id}"`), html.indexOf('</article>', html.indexOf(`<article id="${id}"`)))
const projectIds = (html: string) => entryIds(html).filter((id) => id.startsWith('entry-project-'))
const fixedEntries = ['entry-lab-particle-universe', 'entry-lab-liquid-matter', 'entry-lab-type-in-motion', 'entry-lab-infinite-space', 'entry-lab-chromatic-distortion', 'entry-lab-generative-objects', 'entry-tool-design-system']
const UNNAMED: Record<Language, string> = { hu: 'Névtelen kategória', en: 'Unnamed category', nl: 'Naamloze categorie' }

const loadingWords = (lang: Language) => localize(archiveText, lang).archive.loading

beforeEach(() => {
  resetProjectStore()
  // No test talks to a network: a request nobody prepared never answers.
  vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => undefined)))
})
afterEach(() => vi.unstubAllGlobals())

describe('category names', () => {
  it.each(LANGUAGES)('%s: a name the CMS gives is shown exactly as supplied, in the row and in the filter', (lang) => {
    const supplied = { hu: 'UX – ÉS appok  (béta)', en: 'UX & apps  (beta)', nl: 'UX- én apps  (bèta)' }
    prime([record('one')], [{ key: 'apps', label: supplied }])
    const html = render(ArchivePage, lang)
    const shown = supplied[lang].replace('&', '&amp;')
    expect(categoryOptions(html, lang)).toContainEqual(['apps', `${shown} (1)`])
    expect(entry(html, 'entry-project-one')).toContain(`>${shown}<`)
    expect(readable(html)).not.toContain(UNNAMED[lang])
  })

  it.each(LANGUAGES)('%s: a category the list does not name gets the neutral words, never its key; the key stays the filter’s value', (lang) => {
    prime([record('one', { category: 'zz-internal-key' }), record('two')], [apps])
    const html = render(ArchivePage, lang)
    expect(readable(html)).not.toContain('zz-internal-key')
    expect(entry(html, 'entry-project-one')).toContain(`>${UNNAMED[lang]}<`)
    expect(categoryOptions(html, lang)).toContainEqual(['zz-internal-key', `${UNNAMED[lang]} (1)`])
    expect(categoryOptions(html, lang)).toContainEqual(['apps', `${apps.label[lang]} (1)`])
  })

  it('tells several unnamed categories apart by a number that does not depend on the projects’ order', () => {
    const projects = [record('one', { category: 'bbb-key' }), record('two', { category: 'aaa-key' }), record('three', { category: 'bbb-key' })]
    for (const order of [projects, [...projects].reverse()]) {
      resetProjectStore()
      prime(order, [])
      const html = render(ArchivePage)
      expect(categoryOptions(html)).toContainEqual(['aaa-key', 'Unnamed category 1 (1)'])
      expect(categoryOptions(html)).toContainEqual(['bbb-key', 'Unnamed category 2 (2)'])
      expect(readable(html)).not.toMatch(/aaa-key|bbb-key/)
    }
  })

  it.each([
    ['an empty name', ''],
    ['spaces only', '   '],
    ['invisible characters only', '​⁠\u0000'],
    ['a number', 7],
    ['nothing', undefined],
  ])('treats %s as no name, in that language only, and never borrows another language’s name', (_what, value) => {
    prime([record('one')], [{ key: 'apps', label: { hu: value, en: 'Applications', nl: 'Toepassingen' } }])
    const hungarian = render(ArchivePage, 'hu')
    expect(categoryOptions(hungarian, 'hu')).toContainEqual(['apps', `${UNNAMED.hu} (1)`])
    expect(entry(hungarian, 'entry-project-one')).toContain(`>${UNNAMED.hu}<`)
    expect(entry(hungarian, 'entry-project-one')).not.toMatch(/Applications|Toepassingen|>apps</)
    expect(categoryOptions(render(ArchivePage, 'en'), 'en')).toContainEqual(['apps', 'Applications (1)'])
  })

  it.each([
    ['a label that is not an object', [{ key: 'apps', label: 'Applications' }]],
    ['a record without a label', [{ key: 'apps' }]],
    ['a list that is not a list', { apps: 'Applications' }],
    ['no list at all', undefined],
    ['records that are not records', [null, 4, 'apps', [], { label: all('Orphan') }, { key: 9, label: all('Nine') }]],
  ])('survives %s and still shows no key', (_what, categories) => {
    prime([record('one')], categories)
    const html = render(ArchivePage)
    expect(projectIds(html)).toEqual(['entry-project-one'])
    expect(categoryOptions(html)).toContainEqual(['apps', 'Unnamed category (1)'])
    expect(entry(html, 'entry-project-one')).not.toContain('>apps<')
    expect(readable(html)).not.toMatch(/Orphan|Nine|\[object/)
  })

  it('reads duplicate records as one category: the first name that can be read, whatever comes before or after it', () => {
    prime(
      [record('one'), record('two')],
      [
        { key: 'apps', label: all('') },
        { key: 'apps', label: all('First name') },
        { key: 'apps', label: all('Second name') },
        { key: 'apps', label: all(' ') },
      ],
    )
    const html = render(ArchivePage)
    expect(categoryOptions(html).filter(([key]) => key === 'apps')).toEqual([['apps', 'First name (2)']])
    expect(readable(html)).not.toMatch(/Second name/)
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['not text', 5],
    ['with spaces', 'Web Apps'],
    ['in capitals', 'SECRET_KEY'],
    ['markup', '<b>x</b>'],
    ['too long', 'k'.repeat(60)],
  ])('lists a project whose category is %s without any category: no label, no filter choice, no key', (_what, category) => {
    prime([record('one', { category }), record('two')], [apps])
    const html = render(ArchivePage)
    expect(projectIds(html)).toEqual(['entry-project-one', 'entry-project-two'])
    expect(categoryOptions(html).map(([key]) => key).sort()).toEqual(['apps', 'creative-coding', 'design-tools'])
    const row = entry(html, 'entry-project-one')
    expect(row).not.toMatch(/Unnamed|Web Apps|SECRET|kkkk|<b>x|&lt;b&gt;/)
    // The meta line has no separator left standing before nothing.
    expect(row).not.toMatch(/·<\/span><span[^>]*><\/span>/)
    expect(() => render(CommandCenterPage)).not.toThrow()
  })

  it('keeps a CMS category that happens to use one of the archive’s own keys apart from it', () => {
    prime(
      [record('one', { category: 'creative-coding' }), record('two', { category: 'design-tools' })],
      [
        { key: 'creative-coding', label: all('Client campaigns') },
        { key: 'design-tools', label: all('Studio kits') },
      ],
    )
    const html = render(ArchivePage)
    const options = categoryOptions(html)
    expect(options).toContainEqual(['creative-coding', 'Creative coding (6)'])
    expect(options).toContainEqual(['design-tools', 'Design tools (1)'])
    expect(options).toContainEqual(['project.creative-coding', 'Client campaigns (1)'])
    expect(options).toContainEqual(['project.design-tools', 'Studio kits (1)'])
    // An address shared before still means the Lab; the project's own category has its own.
    expect(entryIds(render(ArchivePage, 'en', '?category=creative-coding'))).toEqual(fixedEntries.slice(0, 6))
    expect(entryIds(render(ArchivePage, 'en', '?category=project.creative-coding'))).toEqual(['entry-project-one'])
    expect(entryIds(render(ArchivePage, 'en', '?category=project.design-tools'))).toEqual(['entry-project-two'])
  })

  it('filters and shares an address the same way whether the category has a name or not', () => {
    prime([record('one', { category: 'zz-internal-key' }), record('two')], [apps])
    for (const lang of LANGUAGES) {
      const html = render(ArchivePage, lang, '?category=zz-internal-key')
      expect(entryIds(html)).toEqual(['entry-project-one'])
      expect(html).toMatch(/<option value="zz-internal-key" selected="">/)
    }
    for (const category of ['zz-internal-key', 'apps', 'project.creative-coding', 'a']) {
      const query = { ...defaultQuery(), category }
      expect(readQuery(writeQuery(query)), category).toEqual(query)
    }
    for (const category of ['Web Apps', 'x.y', 'project.', 'project.project.a', 'other.apps', 'k'.repeat(41)]) expect(readQuery(new URLSearchParams({ category })).category, category).toBe('')
  })

  it('does not let a search find an entry by its category’s key', () => {
    prime([record('one', { category: 'zz-internal-key' }, { description: all('Nothing special here.') })], [])
    expect(entryIds(render(ArchivePage, 'en', '?q=zz-internal-key'))).toEqual([])
    expect(entryIds(render(ArchivePage, 'en', '?q=unnamed'))).toEqual(['entry-project-one'])
  })
})

describe('what is listed', () => {
  it('shows a project only in a language it has, never a draft, and each project once on both pages', () => {
    prime(
      [
        record('twice'),
        record('twice', {}, { title: all('The second copy') }),
        record('secret', { draft: true }, { title: all('Secret draft') }),
        record('english', {}, { languages: ['en'], title: all('English only') }),
        record('nameless', {}, { title: { hu: '', en: '', nl: 'Alleen Nederlands' }, languages: ['en', 'nl'] }),
        record('nowhere', {}, { languages: [], title: all('No language') }),
        { slug: '../admin', card: {} },
      ],
      [apps],
    )
    const archive = render(ArchivePage, 'en')
    expect(projectIds(archive)).toEqual(['entry-project-twice', 'entry-project-english'])
    expect(readable(archive)).not.toMatch(/The second copy|Secret draft|No language|Alleen/)
    expect(projectIds(render(ArchivePage, 'hu'))).toEqual(['entry-project-twice'])
    expect(projectIds(render(ArchivePage, 'nl'))).toEqual(['entry-project-twice', 'entry-project-nameless'])
    const center = render(CommandCenterPage, 'en')
    const featured = center.slice(center.indexOf('id="featured"'), center.indexOf('id="lab"'))
    expect(featured.match(/<h3/g)).toHaveLength(2)
    expect(readable(featured)).not.toMatch(/The second copy|Secret draft|No language/)
    expect(center).toContain(localize(archiveText, 'en').command.map.work.count.replace('{count}', '2'))
  })

  it('keeps the six experiences and the one design tool exactly, whatever the CMS sends', () => {
    prime([record('design-system', { category: 'design-tools' }), record('particle-universe', { category: 'creative-coding' }, { title: all('Not an experience') })], [])
    const html = render(ArchivePage)
    expect(entryIds(html).filter((id) => !id.startsWith('entry-project-'))).toEqual(fixedEntries)
    const center = render(CommandCenterPage)
    const lab = center.slice(center.indexOf('id="lab"'), center.indexOf('id="demos"'))
    expect(lab.match(/<li[ >]/g)).toHaveLength(6)
    expect(readable(lab)).not.toContain('Not an experience')
  })
})

/* ── demos ───────────────────────────────────────────────────────────── */

const demoOn = staticRecord('spendly')!.detail.demo!
/** One project in full, as `/api/projects/:slug` sends it. */
const full = (slug: string, demo: unknown, card: Raw = {}): Raw => ({ ...record(slug, {}, card), detail: { demo } })
const json = (data: unknown, meta?: unknown) => new Response(JSON.stringify({ data, meta }), { status: 200, headers: { 'Content-Type': 'application/json' } })

/** The backend for a test: what each address answers (a number is an HTTP status). */
function backend(answers: Record<string, Response | number | (() => Promise<Response>)>): string[] {
  const asked: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const path = new URL(input).pathname
      asked.push(path)
      const answer = answers[path]
      if (answer === undefined) throw new Error('network')
      if (typeof answer === 'number') return new Response('{}', { status: answer })
      return typeof answer === 'function' ? answer() : answer.clone()
    }),
  )
  return asked
}

async function settled(lang: Language = 'en'): Promise<string> {
  await vi.waitFor(() => expect(render(ArchivePage, lang)).not.toContain(loadingWords(lang)))
  return render(ArchivePage, lang)
}
const demoIds = (html: string) => entryIds(html).filter((id) => id.startsWith('entry-demo-'))

describe('demos', () => {
  const listed = async (detail: Response | number | undefined, slugs: string[] = ['spendly']) => {
    resetProjectStore()
    const asked = backend({ '/api/projects': json(slugs.map((slug) => record(slug)), { categories: [apps] }), ...(detail === undefined ? {} : Object.fromEntries(slugs.map((slug) => [`/api/projects/${slug}`, detail]))) })
    ensureList(false)
    await vi.waitFor(() => expect(listSnapshot().status).toBe('ready'))
    for (const slug of slugs) ensureDetail(slug, null)
    return { html: await settled(), asked }
  }

  it('lists a demo the backend says is switched on', async () => {
    expect(demoIds((await listed(json(full('spendly', demoOn)))).html)).toEqual(['entry-demo-spendly'])
  })

  it.each([
    ['switched off', json(full('spendly', null))],
    ['of a type that is not registered', json(full('spendly', { type: 'mystery' }))],
    ['of another project’s type', json(full('spendly', { type: 'booking-flow' }))],
    ['on a project without a page', json(full('spendly', demoOn, { detailPage: false }))],
    ['on a project not available in the language', json(full('spendly', demoOn, { languages: ['hu'] }))],
    ['in an answer about a different project', json(full('bookinghub', demoOn))],
    ['marked as a draft', json({ ...full('spendly', demoOn), draft: true })],
    ['on a project the backend no longer has', 404],
  ])('does not list a demo %s', async (_what, detail) => {
    const { html } = await listed(detail)
    expect(projectIds(html)).toEqual(['entry-project-spendly'])
    expect(demoIds(html)).toEqual([])
  })

  it.each([
    ['fails', 500],
    ['cannot be reached', undefined],
  ])('does not let the website’s own copy switch a demo on when the backend listed the projects but the project’s detail %s', async (_what, detail) => {
    const { html } = await listed(detail)
    expect(demoIds(html)).toEqual([])
    expect(readable(render(CommandCenterPage))).toContain(localize(archiveText, 'en').command.demos.none)
  })

  it('keeps the website’s own demos when the backend gives no answer at all', async () => {
    resetProjectStore()
    backend({})
    ensureList(false)
    await vi.waitFor(() => expect(listSnapshot().source).toBe('static'))
    for (const slug of ['spendly', 'bookinghub', 'logistics-platform']) ensureDetail(slug, null)
    expect(demoIds(await settled())).toEqual(['entry-demo-spendly', 'entry-demo-bookinghub', 'entry-demo-logistics-platform'])
  })

  it('lists one demo once, even when the project’s record comes twice', async () => {
    const { html } = await listed(json(full('spendly', demoOn)), ['spendly', 'spendly'])
    expect(demoIds(html)).toEqual(['entry-demo-spendly'])
    const center = render(CommandCenterPage)
    expect(center.match(/href="\/en\/work\/spendly\/demo"/g)).toHaveLength(1)
  })

  it('asks for no demo of a project that is not listed or cannot have one', async () => {
    const { asked } = await listed(json(full('spendly', demoOn)), ['unrelated'])
    expect(asked.filter((path) => path.startsWith('/api/projects/'))).toEqual(['/api/projects/unrelated'])
  })
})

/* ── an administrator's preview ──────────────────────────────────────── */

describe('the administrator’s preview', () => {
  const published = [record('public-work', {}, { title: all('Published work') })]
  const drafts = { projects: [...published, record('hidden-work', { draft: true }, { title: all('Hidden draft') })], categories: [apps] }
  /** An answer that arrives when the test says. */
  function later(response: () => Response) {
    let release: () => void = () => undefined
    const gate = new Promise<void>((done) => (release = done))
    return { answer: () => gate.then(response), release: () => release() }
  }
  const flush = async () => {
    for (let i = 0; i < 20; i += 1) await new Promise((done) => setTimeout(done, 0))
  }

  it('is never drawn, even while it is the list the store holds', async () => {
    backend({ '/api/admin/project-preview': new Response(JSON.stringify({ data: drafts }), { status: 200 }) })
    ensureList(true)
    await vi.waitFor(() => expect(listSnapshot().preview).toBe(true))
    for (const page of [ArchivePage, CommandCenterPage]) {
      const html = render(page)
      expect(readable(html)).not.toMatch(/Hidden draft|Published work/)
      expect(html).toContain(loadingWords('en'))
    }
  })

  it.each([
    ['before', ['preview', 'public']],
    ['after', ['public', 'preview']],
  ])('cannot take the public list’s place when its answer arrives %s the public one', async (_when, order) => {
    const preview = later(() => new Response(JSON.stringify({ data: drafts }), { status: 200 }))
    const open = later(() => json(published, { categories: [apps] }))
    backend({ '/api/admin/project-preview': preview.answer, '/api/projects': open.answer })
    // The administrator looked at a preview and went on to a public page before it had answered.
    ensureList(true)
    ensureList(false)
    for (const which of order) {
      ;(which === 'preview' ? preview : open).release()
      await flush()
      expect(listSnapshot().preview).toBe(false)
    }
    const html = render(ArchivePage)
    expect(projectIds(html)).toEqual(['entry-project-public-work'])
    expect(readable(html)).not.toContain('Hidden draft')
  })

  it('still answers the preview when it is what was asked for last', async () => {
    const preview = later(() => new Response(JSON.stringify({ data: drafts }), { status: 200 }))
    const open = later(() => json(published, { categories: [apps] }))
    backend({ '/api/admin/project-preview': preview.answer, '/api/projects': open.answer })
    ensureList(false)
    ensureList(true)
    preview.release()
    await flush()
    open.release()
    await flush()
    expect(listSnapshot().preview).toBe(true)
  })

  it('falls back to the public list for someone who is not an administrator', async () => {
    backend({ '/api/admin/project-preview': 401, '/api/projects': json(published, { categories: [apps] }) })
    ensureList(true)
    await vi.waitFor(() => expect(listSnapshot().status).toBe('ready'))
    expect(listSnapshot().preview).toBe(false)
    expect(projectIds(render(ArchivePage))).toEqual(['entry-project-public-work'])
  })
})

/* ── the boundary ────────────────────────────────────────────────────── */

describe('the public/private boundary', () => {
  const SRC = join(__dirname, '..')
  const PRIVATE = /^(admin|portal|quotes|booking|ai|components\/(ai|portal|consultation|contact)|content\/(portal|quotes|consultation))\//
  const target = (from: string, specifier: string): string | null => {
    const base = resolve(dirname(from), specifier.split('?')[0])
    return [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')].find((path) => existsSync(path) && statSync(path).isFile()) ?? null
  }

  it('is not crossed by anything the two pages import, directly or through the modules they use', () => {
    const queue = ['pages/ArchivePage.tsx', 'pages/CommandCenterPage.tsx'].map((file) => join(SRC, file))
    const seen = new Set<string>()
    while (queue.length > 0) {
      const file = queue.pop()!
      if (seen.has(file)) continue
      seen.add(file)
      if (!/\.tsx?$/.test(file)) continue
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      // A type-only import brings no code and no data with it.
      for (const match of code.matchAll(/(?:^|\n)\s*(?:import|export)\s+(type\s+)?(?:[^'";]*?from\s+)?['"](\.[^'"]+)['"]|import\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
        const next = match[1] ? null : target(file, match[2] ?? match[3])
        if (next) queue.push(next)
      }
    }
    const modules = [...seen].map((file) => relative(SRC, file).split(sep).join('/'))
    // The walk really follows the imports.
    expect(modules).toEqual(expect.arrayContaining(['archive/useArchive.ts', 'projects/store.ts', 'projects/api.ts', 'content/lab.ts']))
    expect(modules.filter((file) => PRIVATE.test(file))).toEqual([])
  })
})
