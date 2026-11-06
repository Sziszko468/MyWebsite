import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTextOverrides } from '../content/textOverrides'
import { LANGUAGES, type Language } from '../i18n/config'
import { I18nContext } from '../i18n/context'
import { dictionaries } from '../i18n/dictionaries'
import { WorkPage } from '../pages/WorkPage'
import { ProjectRoute } from '../pages/ProjectPage'
import { Overview } from '../components/project/ProjectSections'
import { resolvePage, findPage } from '../routes/pages'
import { resolveLanguageSwitch } from '../routes/languageSwitch'
import { flattenKinetic } from '../test/markup'
import { ThemeContext } from '../theme/context'
import { parseCard, parseRecord } from './api'
import { staticCards, staticRecord } from './static'

/**
 * The portfolio on the website's side: the checks on what the backend sends, the website's own copy it falls back to, the
 * address of a project that exists only in the administration, the wording an administrator changed, and the two pages that
 * draw all of it.
 */

const tri = (text: string) => ({ hu: `${text} hu`, en: `${text} en`, nl: `${text} nl` })

/** An answer shaped as the backend's public API sends it. */
function served(overrides: Record<string, unknown> = {}) {
  return {
    slug: 'fresh-project',
    featured: true,
    position: 5,
    category: 'apps',
    status: 'published',
    card: {
      title: tri('Fresh'),
      label: tri('Label'),
      description: tri('Description'),
      tags: ['React', 7, 'Node'],
      projectStatus: 'demo',
      layout: 'wide',
      mockup: 'booking',
      detailPage: true,
      thumbnail: { id: 3, src: '/media/abcdefabcdefabcdefabcdef.png', width: 640, height: 480, alt: tri('Alt') },
      demoUrl: 'https://demo.example.com/app',
    },
    detail: {
      accent: 'blue',
      hero: 'stack',
      summary: tri('Summary'),
      role: null,
      repoName: null,
      stack: [{ group: 'frontend', items: ['React'] }, { group: 'nonsense', items: ['x'] }],
      overview: { what: tri('What'), audience: tri(''), problem: tri(''), goal: tri('') },
      challenges: [],
      approach: [],
      architectureText: tri('How it hangs together'),
      architecture: null,
      features: [{ title: tri('Feature'), text: tri('Text'), status: 'done', image: 'm3' }],
      limits: [],
      decisions: [],
      learned: [],
      results: [],
      next: [],
      gallery: [{ id: 'm3', src: '/media/abcdefabcdefabcdefabcdef.png', width: 640, height: 480, device: 'desktop', alt: tri('Shot'), caption: tri('Caption'), hero: true }],
      galleryNote: null,
      links: { demo: 'https://demo.example.com/app', source: null, extra: null, video: null },
      sourceUrl: null,
      reviewed: '2026-11-05',
    },
    ...overrides,
  }
}

describe('what the backend sends is checked before the pages see it', () => {
  it('reads a project card, keeps only what is usable, and links a page only when the project has one', () => {
    const card = parseCard(served())!
    expect(card).toMatchObject({ slug: 'fresh-project', status: 'demo', layout: 'wide', mockup: 'booking', detailPath: '/work/fresh-project', demoUrl: 'https://demo.example.com/app', featured: true })
    expect(card.tags).toEqual(['React', 'Node'])
    expect(card.image).toMatchObject({ src: '/media/abcdefabcdefabcdefabcdef.png', width: 640, height: 480 })
    const noPage = parseCard(served({ card: { ...served().card, detailPage: false } }))!
    expect(noPage.detailPath).toBeNull()
  })

  it('drops what is not acceptable: a bad address, a link that is not https, a picture path that climbs out, an unknown state', () => {
    expect(parseCard(served({ slug: 'Bad Slug' }))).toBeNull()
    expect(parseCard(served({ card: { ...served().card, title: tri('') && { hu: '', en: '', nl: '' } } }))).toBeNull()
    expect(parseCard(null)).toBeNull()
    const odd = parseCard(served({ card: { ...served().card, demoUrl: 'javascript:alert(1)', projectStatus: 'amazing', layout: 'huge', thumbnail: { src: '../../etc/passwd', width: 10, height: 10, alt: tri('x') } } }))!
    expect(odd.demoUrl).toBeNull()
    expect(odd.status).toBe('concept')
    expect(odd.layout).toBe('compact')
    expect(odd.image).toBeNull()
    const picture = parseCard(served({ card: { ...served().card, thumbnail: { src: 'data:image/png;base64,AAAA', width: 10, height: 10, alt: tri('x') } } }))!
    expect(picture.image).toBeNull()
  })

  it('builds a project page record: the stack without an unknown group, links only over https, the gallery with its sizes', () => {
    const record = parseRecord(served(), { previous: served({ slug: 'before' }), next: served({ slug: 'after' }) }, false)!
    expect(record.detail.stack).toEqual([{ group: 'frontend', items: ['React'] }, { group: 'frontend', items: ['x'] }])
    expect(record.detail.gallery[0]).toMatchObject({ id: 'm3', width: 640, hero: true })
    expect(record.detail.links).toMatchObject({ demo: 'https://demo.example.com/app', source: null })
    expect(record.neighbours?.next.slug).toBe('after')
    expect(record.detail.features[0].image).toBe('m3')
    const hostile = parseRecord(served({ detail: { ...served().detail, links: { demo: 'http://insecure.example', source: 'https://user:pass@example.com', extra: { url: 'ftp://x', label: tri('x') }, video: 'javascript:1' } } }), null, false)!
    expect(hostile.detail.links).toEqual({ demo: null, source: null, extra: null, video: null })
    expect(parseRecord(served({ detail: 'nope' }), null, false)).toBeNull()
  })
})

describe('the website\'s own projects, the fallback', () => {
  it('are the four it always had: three with a page, the concept without', () => {
    expect(staticCards.map((card) => card.slug)).toEqual(['spendly', 'bookinghub', 'hollandia', 'logistics-platform'])
    expect(staticCards.find((card) => card.slug === 'hollandia')?.detailPath).toBeNull()
    expect(staticRecord('hollandia')).toBeNull()
    const spendly = staticRecord('spendly')!
    expect(spendly.detail.gallery.length).toBe(10)
    // The neighbours are the projects with a page, wrapping round.
    expect(spendly.neighbours?.previous.slug).toBe('logistics-platform')
    expect(spendly.neighbours?.next.slug).toBe('bookinghub')
    expect(staticRecord('does-not-exist')).toBeNull()
  })
})

describe('the address of a project', () => {
  it('registered pages stay as they were; any other /work/<slug> is a project page in every language; the preview is never indexed', () => {
    expect(resolvePage('/work')?.id).toBe('work')
    expect(resolvePage('/work/spendly')?.id).toBe('project-spendly')
    const fresh = resolvePage('/work/fresh-project')!
    expect(fresh).toMatchObject({ id: 'project-fresh-project', languages: LANGUAGES, indexable: true })
    expect(resolvePage('/work/fresh-project/')).toBe(fresh)
    expect(resolvePage('/work/preview/12')).toMatchObject({ id: 'project-preview', indexable: false })
    // Not addresses of anything: a reserved word, an odd character, a deeper path.
    for (const path of ['/work/preview', '/work/Has Space', '/work/a', '/work/x/y/z', '/nothing']) expect(resolvePage(path), path).toBeUndefined()
    // The strict lookup the build uses is untouched.
    expect(findPage('/work/fresh-project')).toBeUndefined()
  })

  it('keeps the page when the language is switched, also for a project only the administration has', () => {
    expect(resolveLanguageSwitch('/hu/work/fresh-project', 'nl')).toEqual({ path: '/nl/work/fresh-project', samePage: true })
    expect(resolveLanguageSwitch('/en/work/spendly/', 'hu')).toEqual({ path: '/hu/work/spendly', samePage: true })
  })
})

describe('the wording an administrator changed', () => {
  const source = { hero: { title: 'Digital experiences.', greeting: 'Hello {name}' }, list: ['one', 'two'] }

  it('lays an override over the string at its path, in its language only, without touching the original', () => {
    const copy = applyTextOverrides(source, { 'dict.hero.title': { en: 'Websites with character.', hu: 'Magyar' } }, 'dict', 'en')
    expect(copy.hero.title).toBe('Websites with character.')
    expect(copy.hero.greeting).toBe('Hello {name}')
    expect(source.hero.title).toBe('Digital experiences.')
    expect(applyTextOverrides(source, { 'dict.hero.title': { hu: 'Magyar' } }, 'dict', 'en')).toBe(source)
    expect(applyTextOverrides(source, { 'dict.list.1': { en: 'deux' } }, 'dict', 'en').list).toEqual(['one', 'deux'])
  })

  it('returns the very same object with no overrides, ignores a key that is not there, another prefix, or a missing {placeholder}', () => {
    expect(applyTextOverrides(source, null, 'dict', 'en')).toBe(source)
    expect(applyTextOverrides(source, {}, 'dict', 'en')).toBe(source)
    const ignored = applyTextOverrides(source, { 'dict.hero.nothing': { en: 'x' }, 'dict.hero.greeting': { en: 'Hello there' }, 'shop.hero.title': { en: 'shop' }, 'dict.hero': { en: 'object' } }, 'dict', 'en')
    expect(ignored.hero).toEqual(source.hero)
    expect(applyTextOverrides(source, { 'dict.hero.greeting': { en: 'Welcome {name}!' } }, 'dict', 'en').hero.greeting).toBe('Welcome {name}!')
  })
})

/** A page rendered on the server with the real providers (the same way the About page is checked). */
function render(path: string, lang: Language, node: () => ReturnType<typeof createElement>): string {
  return flattenKinetic(
    renderToStaticMarkup(
      createElement(
        ThemeContext.Provider,
        { value: { theme: 'dark', setTheme: () => undefined, toggleTheme: () => undefined, followSystem: () => undefined } },
        createElement(MemoryRouter, { initialEntries: [path] }, createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, node())),
      ),
    ),
  )
}
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')

describe.each(LANGUAGES)('the Work page in %s', (lang) => {
  const html = render(`/${lang}/work`, lang, () => createElement(WorkPage))
  const t = dictionaries[lang]

  it('has one h1 with the page\'s words, the filter and one card for each project, each with its state', () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1)
    expect(html).toContain(escape(t.workPage.hero.titleLine1))
    expect(html).toContain(escape(t.workPage.filter.label))
    expect(html.match(/<article\b/g)).toHaveLength(4)
    for (const card of staticCards) expect(html).toContain(escape(card.name[lang]))
    expect(html).toContain(escape(t.status.demo))
    expect(html).toContain(escape(t.status.concept))
  })

  it('links the three projects that have a page, says so for the one that has not, and never links a demo that does not exist', () => {
    for (const slug of ['spendly', 'bookinghub', 'logistics-platform']) expect(html).toContain(`href="/${lang}/work/${slug}"`)
    expect(html).not.toContain('/work/hollandia')
    expect(html).toContain(escape(t.home.work.noDetails))
    expect(html).not.toContain('target="_blank"')
  })

  it('shows no key, no placeholder and no draft marker to an ordinary visitor', () => {
    expect(html).not.toMatch(/\bundefined\b|\[object|\{count\}/)
    expect(html).not.toContain(escape(t.workPage.draft))
  })
})

describe('the project route', () => {
  it('draws a static project from the website\'s own copy, and says "not found" for an address nothing has', () => {
    const page = (slug: string) => render(`/hu/work/${slug}`, 'hu', () => createElement(Routes, null, createElement(Route, { path: '/hu/work/:slug', element: createElement(ProjectRoute) })))
    expect(page('spendly')).toContain('Spendly')
    expect(page('spendly')).toMatch(/<h1\b/)
    const missing = page('never-existed')
    expect(missing).toContain(escape(dictionaries.hu.notFound.title))
    expect(page('hollandia')).toContain(escape(dictionaries.hu.notFound.title))
  })
})

describe('a project page draws nothing that has nothing in it', () => {
  const detail = staticRecord('spendly')!.detail
  const overview = (stack: typeof detail.stack) => render('/en/work/x', 'en', () => createElement(Overview, { detail: { ...detail, stack } }))

  it('shows the technologies label only when there is a technology to put under it', () => {
    const label = escape(dictionaries.en.project.stackLabel)
    expect(overview(detail.stack)).toContain(label)
    expect(overview([])).not.toContain(label)
    expect(overview([{ group: 'frontend', items: [] }])).not.toContain(label)
  })
})

describe('with a backend: its answer is the truth', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  async function store(answer: (url: string) => Response | Promise<Response>) {
    vi.resetModules()
    vi.stubEnv('VITE_API_URL', '/')
    vi.stubGlobal('fetch', vi.fn(async (input: string) => answer(String(input))))
    return import('./store')
  }
  const json = (data: unknown, meta?: unknown, status = 200) => new Response(JSON.stringify({ data, meta }), { status, headers: { 'Content-Type': 'application/json' } })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

  it("shows the published projects it sends instead of the website's own, and an empty answer is an empty list", async () => {
    const mod = await store((url) => (url === '/api/projects' ? json([served()], { categories: [{ key: 'apps', label: tri('Apps') }] }) : json(null, undefined, 404)))
    expect(mod.listSnapshot().status).toBe('loading')
    mod.ensureList(false)
    await settle()
    expect(mod.listSnapshot()).toMatchObject({ status: 'ready', source: 'api', preview: false })
    expect(mod.listSnapshot().cards.map((card) => card.slug)).toEqual(['fresh-project'])
    expect(mod.listSnapshot().categories[0].key).toBe('apps')
    const empty = await store(() => json([], { categories: [] }))
    empty.ensureList(false)
    await settle()
    expect(empty.listSnapshot()).toMatchObject({ status: 'ready', source: 'api', cards: [] })
    // Nothing answers at all: the website's own four.
    const down = await store(() => Promise.reject(new TypeError('network down')))
    down.ensureList(false)
    await settle()
    expect(down.listSnapshot()).toMatchObject({ source: 'static' })
    expect(down.listSnapshot().cards).toHaveLength(4)
  })

  it('does NOT bring the website\'s own copy back for a project the backend says is not there; it does when nothing answers', async () => {
    const gone = await store(() => json(null, undefined, 404))
    gone.ensureDetail('spendly', null)
    await settle()
    expect(gone.isMissingProject('spendly')).toBe(true)
    const down = await store(() => Promise.reject(new TypeError('network down')))
    down.ensureDetail('spendly', null)
    await settle()
    expect(down.isMissingProject('spendly')).toBe(false)
    expect(down.runtimeProject('spendly')?.slug).toBe('spendly')
    const unknown = await store(() => Promise.reject(new TypeError('network down')))
    unknown.ensureDetail('only-in-admin', null)
    await settle()
    expect(unknown.isMissingProject('only-in-admin')).toBe(true)
  })

  it('reads an administrator\'s preview only through the preview route, and treats a refusal as "sign in"', async () => {
    const calls: string[] = []
    const mod = await store((url) => {
      calls.push(url)
      return url.startsWith('/api/admin/') ? json(null, undefined, 401) : json(null, undefined, 404)
    })
    mod.ensureDetail('', '7')
    await settle()
    expect(calls).toEqual(['/api/admin/projects/7/preview'])
    expect(mod.isMissingProject('')).toBe(false)
  })
})
