import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'
import { blockShows, visibleBlocks } from '../components/project/blocks'
import type { DetailBlock } from '../content/projectDetails/types'
import { LANGUAGES, type Language } from '../i18n/config'
import { I18nContext } from '../i18n/context'
import { dictionaries } from '../i18n/dictionaries'
import { ProjectPage } from '../pages/ProjectPage'
import { parseProfile } from '../profile/store'
import { buildDocumentMeta } from '../routes/documentMeta'
import { resolvePage } from '../routes/pages'
import { buildHead, languagesOfPage, type SeoContext } from '../seo/head'
import { pagesForBuild } from '../seo/entry'
import { buildSitemap } from '../seo/sitemap'
import { flattenKinetic } from '../test/markup'
import { ThemeContext } from '../theme/context'
import { parseCard, parseRecord } from './api'
import { primeProjects, resetProjectStore, isUnavailableIn } from './store'
import { isAvailable, neighboursIn, viewOf } from './types'

/**
 * PROMPT 22 on the website's side: a project that lacks a language shows nothing in it (never another language's words), the owner's blocks and
 * services are drawn as plain text, the search and sharing words reach the head, preview links have their own address, and the About page reads
 * the saved profile.
 */

const tri = (text: string) => ({ hu: `${text} hu`, en: `${text} en`, nl: `${text} nl` })
const none = { hu: '', en: '', nl: '' }

function served(overrides: { card?: Record<string, unknown>; detail?: Record<string, unknown>; slug?: string } = {}) {
  return {
    slug: overrides.slug ?? 'fresh-project',
    featured: true,
    position: 5,
    category: 'apps',
    status: 'published',
    card: { title: tri('Fresh'), label: tri('Label'), description: tri('Description'), tags: ['React'], projectStatus: 'demo', layout: 'wide', mockup: 'booking', detailPage: true, thumbnail: null, demoUrl: null, languages: ['hu', 'en', 'nl'], seo: null, ...overrides.card },
    detail: {
      accent: 'blue',
      hero: 'stack',
      summary: tri('Summary'),
      role: null,
      repoName: null,
      stack: [],
      overview: { what: tri('What it is'), audience: none, problem: none, goal: none },
      services: [],
      challenges: [],
      approach: [],
      architectureText: none,
      architecture: null,
      features: [],
      limits: [],
      decisions: [],
      learned: [],
      results: [],
      next: [],
      gallery: [],
      blocks: [],
      galleryNote: null,
      links: { demo: null, source: null, extra: null, video: null },
      sourceUrl: null,
      reviewed: '2026-11-05',
      ...overrides.detail,
    },
  }
}

const picture = { src: '/media/abcdefabcdefabcdefabcdef.png', width: 640, height: 480 }

function render(lang: Language, node: () => ReturnType<typeof createElement>): string {
  return flattenKinetic(
    renderToStaticMarkup(
      createElement(
        ThemeContext.Provider,
        { value: { theme: 'dark', setTheme: () => undefined, toggleTheme: () => undefined, followSystem: () => undefined } },
        createElement(MemoryRouter, { initialEntries: [`/${lang}/work/fresh-project`] }, createElement(I18nContext.Provider, { value: { lang, t: dictionaries[lang] } }, node())),
      ),
    ),
  )
}

afterEach(() => resetProjectStore())

describe('what the backend sends about languages, search words, services and blocks', () => {
  it('reads the languages a project can be shown in (an answer that says nothing means every language) and the words for search and sharing', () => {
    const card = parseCard(served({ card: { languages: ['hu', 'nl', 'xx'], seo: { title: tri('S'), description: tri('D'), ogTitle: none, ogDescription: tri('O'), image: { ...picture, alt: tri('A') } } } }))!
    expect(card.languages).toEqual(['hu', 'nl'])
    expect(card.seo).toMatchObject({ title: tri('S'), ogDescription: tri('O'), image: { src: picture.src, width: 640, alt: tri('A') } })
    const old = parseCard({ ...served(), card: { ...served().card, languages: undefined, seo: undefined } })!
    expect(old.languages).toEqual(['hu', 'en', 'nl'])
    expect(old.seo).toBeNull()
    expect(isAvailable(card, 'en')).toBe(false)
    expect(isAvailable(old, 'en')).toBe(true)
  })

  it('reads services and blocks, and drops a block of a type it does not know, a picture with an unusable path and a link that is not https', () => {
    const blocks = [
      { type: 'text', heading: tri('T'), body: tri('B') },
      { type: 'html', heading: tri('X'), body: tri('<p>x</p>') },
      { type: 'image', heading: tri('I'), picture: { src: '../../etc/passwd', width: 10, height: 10 }, alt: none, caption: none },
      { type: 'image', heading: tri('I2'), picture, alt: tri('a'), caption: none },
      { type: 'links', heading: tri('L'), links: [{ label: tri('bad'), url: 'javascript:alert(1)' }, { label: tri('good'), url: 'https://ok.example.com/' }] },
      { type: 'links', heading: tri('L2'), links: [{ label: tri('bad'), url: 'http://insecure.example' }] },
    ]
    const record = parseRecord(served({ detail: { services: [tri('Design')], blocks } }), null, false)!
    expect(record.detail.services).toEqual([tri('Design')])
    expect(record.detail.blocks?.map((block) => block.type)).toEqual(['text', 'image', 'links'])
    const links = record.detail.blocks![2] as Extract<DetailBlock, { type: 'links' }>
    expect(links.links).toEqual([{ label: tri('good'), url: 'https://ok.example.com/' }])
  })
})

describe('no language is ever filled with another', () => {
  it('shows a card\'s words in the language asked for, empty when the project has none there', () => {
    const card = parseCard(served({ card: { title: { hu: 'Magyar cím', en: '', nl: '' }, description: { hu: 'Leírás', en: '', nl: '' } } }))!
    expect(viewOf(card, 'hu').name).toBe('Magyar cím')
    expect(viewOf(card, 'en').name).toBe('')
    expect(viewOf(card, 'nl').description).toBe('')
  })

  it('picks the neighbours among the projects that have a page and can be shown in the language', () => {
    const cards = ['a1', 'b2', 'c3'].map((slug) => parseCard(served({ slug, card: { languages: slug === 'b2' ? ['hu'] : ['hu', 'en', 'nl'] }, detail: {} }))!).map((card, index) => ({ ...card, position: index }))
    expect(neighboursIn(cards, 'a1', 'hu')?.next.slug).toBe('b2')
    expect(neighboursIn(cards, 'a1', 'en')?.next.slug).toBe('c3')
    expect(neighboursIn(cards, 'a1', 'en')?.previous.slug).toBe('c3')
    expect(neighboursIn(cards.slice(0, 2), 'a1', 'en')).toBeNull()
  })

  it('treats a project as not found in a language it cannot be shown in, only once the list or the project is known', () => {
    primeProjects([parseCard(served({ card: { languages: ['hu'] } }))!], [])
    expect(isUnavailableIn('fresh-project', 'hu')).toBe(false)
    expect(isUnavailableIn('fresh-project', 'nl')).toBe(true)
    expect(isUnavailableIn('somebody-else', 'nl')).toBe(false)
  })

  it('draws a page in Dutch with no Hungarian in it when the Dutch texts are missing', () => {
    const record = parseRecord(served({ detail: { summary: { hu: 'Magyar összefoglaló', en: 'English summary', nl: '' } } }), null, false)!
    const html = render('nl', () => createElement(ProjectPage, { record }))
    expect(html).not.toContain('Magyar összefoglaló')
    expect(html).not.toContain('English summary')
  })
})

describe('the owner\'s own sections', () => {
  const blocks: DetailBlock[] = [
    { type: 'text', heading: tri('Why'), body: { hu: 'Első.\n\nMásodik.', en: 'First.\n\n<script>alert(1)</script>', nl: '' } },
    { type: 'features', heading: { hu: 'Jellemzők', en: 'Features', nl: '' }, items: [tri('One'), tri('Two')] },
    { type: 'technologies', heading: tri('Tech'), items: ['React', 'Node'] },
    { type: 'highlight', heading: tri('Note'), text: tri('Remember') },
    { type: 'links', heading: tri('Links'), links: [{ label: tri('Docs'), url: 'https://docs.example.com/' }] },
    { type: 'image', heading: tri('Picture'), picture, alt: tri('A picture'), caption: tri('Caption') },
  ]
  const record = () => parseRecord(served({ detail: { services: [tri('Design'), tri('Build')], blocks } }), null, false)!

  it('decides per language what to draw: a block needs its heading and something to say in that language', () => {
    expect(blockShows(blocks[0], 'en')).toBe(true)
    // The text block has nothing in Dutch (its body is empty there): it is not drawn in Dutch, and nothing else is drawn in its place.
    expect(blockShows(blocks[0], 'nl')).toBe(false)
    expect(blockShows({ ...blocks[0], heading: { hu: 'x', en: '', nl: 'x' } } as DetailBlock, 'en')).toBe(false)
    expect(blockShows({ type: 'text', heading: tri('H'), body: { hu: 'x', en: '', nl: '' } }, 'en')).toBe(false)
    expect(visibleBlocks(blocks, 'en').map((entry) => entry.index)).toEqual([0, 1, 2, 3, 4, 5])
    expect(visibleBlocks(blocks, 'hu').map((entry) => entry.index)).toEqual([0, 1, 2, 3, 4, 5])
    expect(visibleBlocks(undefined, 'en')).toEqual([])
    // Dutch lacks the features heading: that block is left out, the others are not.
    expect(visibleBlocks(blocks, 'nl').map((entry) => entry.index)).toEqual([2, 3, 4, 5])
  })

  it.each(LANGUAGES)('draws every block as its own band with its own heading, as text, in %s', (lang) => {
    const html = render(lang, () => createElement(ProjectPage, { record: record() }))
    for (const word of ['Tech', 'Note', 'Remember', 'Docs', 'A picture']) expect(html).toContain(`${word} ${lang}`)
    expect(html).toContain('Design ' + lang)
    // Each drawn block is a band of its own, numbered by its place among all the blocks; one with nothing to say in this language is not there.
    for (const { index } of visibleBlocks(blocks, lang)) expect(html).toContain(`id="block-${index + 1}"`)
    const drawn = visibleBlocks(blocks, lang).map((entry) => entry.index)
    for (const index of blocks.keys()) if (!drawn.includes(index)) expect(html).not.toContain(`id="block-${index + 1}"`)
    expect(html).not.toMatch(/<script>alert/)
  })

  it('writes markup in a block as text, opens a block link safely, and gives a picture its description', () => {
    const html = render('en', () => createElement(ProjectPage, { record: record() }))
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).toMatch(/<a [^>]*href="https:\/\/docs\.example\.com\/"[^>]*rel="noopener noreferrer"/)
    expect(html).toContain('alt="A picture en"')
    expect(html).toContain('Services delivered')
  })
})

describe('the head of a project\'s page', () => {
  const ctx: SeoContext = { siteUrl: 'https://site.test', brandName: 'Brand', brandIsSet: true, profiles: [] }
  const seo = { title: tri('Search'), description: tri('Search words'), ogTitle: { hu: '', en: 'Share title', nl: '' }, ogDescription: tri('Share words'), image: { ...picture, alt: { hu: '', en: 'Share alt', nl: '' } } }
  const prime = (languages: string[] = ['hu', 'en', 'nl']) => primeProjects([parseCard(served({ card: { languages, seo } }))!], [])

  it('uses the owner\'s words for search and sharing, falling back inside the same language, and their picture', () => {
    prime()
    const page = resolvePage('/work/fresh-project')!
    const meta = buildDocumentMeta(page, 'en', dictionaries.en, 'Brand')
    expect(meta).toMatchObject({ title: 'Search en — Brand', description: 'Search words en', og: { title: 'Share title', description: 'Share words en', image: { src: picture.src, alt: 'Share alt' } } })
    expect(buildDocumentMeta(page, 'nl', dictionaries.nl, 'Brand').og?.title).toBe('Search nl — Brand')
    const head = buildHead(page, 'en', ctx)
    const og = (property: string) => head.tags.find((tag) => tag.kind === 'meta' && tag.attrs.property === property) as { attrs: { content: string } } | undefined
    expect(og('og:title')?.attrs.content).toBe('Share title')
    expect(og('og:image')?.attrs.content).toBe(`https://site.test${picture.src}`)
    expect(og('og:image:width')?.attrs.content).toBe('640')
    expect(og('og:image:type')?.attrs.content).toBe('image/png')
  })

  it('has no page, canonical address or alternate for a language the project cannot be shown in, and does not index it', () => {
    prime(['hu', 'en'])
    const page = resolvePage('/work/fresh-project')!
    expect(languagesOfPage(page)).toEqual(['hu', 'en'])
    const head = buildHead(page, 'en', ctx)
    expect(head.alternates.map((alternate) => alternate.hreflang)).toEqual(['hu', 'en', 'x-default'])
    expect(head.canonical).toBe('https://site.test/en/work/fresh-project/')
    const dutch = buildHead(page, 'nl', ctx)
    expect(dutch.indexable).toBe(false)
    expect(dutch.canonical).toBeNull()
  })

  it('writes the build only for the languages a project has, and lists only those in the sitemap', () => {
    const pulled = { projects: [served({ card: { languages: ['hu', 'en'] } }), served({ slug: 'only-dutch', card: { languages: ['nl'] } }), served({ slug: 'nowhere', card: { languages: [] } })], categories: [] }
    const pages = pagesForBuild(pulled)
    const fresh = pages.find((page) => page.path === '/work/fresh-project')!
    expect([...fresh.languages]).toEqual(['hu', 'en'])
    expect([...pages.find((page) => page.path === '/work/only-dutch')!.languages]).toEqual(['nl'])
    expect(pages.some((page) => page.path === '/work/nowhere')).toBe(false)
    const xml = buildSitemap('https://site.test', pages)
    expect(xml).toContain('https://site.test/en/work/fresh-project/')
    expect(xml).not.toContain('https://site.test/nl/work/fresh-project/')
    expect(xml).toContain('https://site.test/nl/work/only-dutch/')
    expect(xml).not.toContain('nowhere')
  })
})

describe('the address of a preview link', () => {
  it('is one page that is never indexed, whatever the secret is; a secret of the wrong shape is no page at all', () => {
    const token = 'A'.repeat(43)
    const page = resolvePage(`/work/preview/link/${token}`)
    expect(page).toMatchObject({ id: 'project-preview', indexable: false })
    expect(resolvePage(`/work/preview/link/${'B'.repeat(43)}`)).toBe(page)
    expect([...page!.languages]).toEqual([...LANGUAGES])
    for (const path of ['/work/preview/link/short', '/work/preview/link', `/work/preview/link/${'C'.repeat(80)}`, `/work/preview/link/${token}/x`]) expect(resolvePage(path), path).toBeUndefined()
    // The secret is not part of the page's identity: nothing about it reaches the document's title.
    const head = buildHead(page, 'en', { siteUrl: 'https://site.test', brandName: 'Brand', brandIsSet: true, profiles: [] })
    expect(head.indexable).toBe(false)
    expect(head.canonical).toBeNull()
    expect(JSON.stringify(head)).not.toContain(token)
  })
})

describe('the saved profile', () => {
  const doc = {
    story: { title: tri('Story'), paragraphs: [tri('One'), none, tri('Two')], thought: tri('Thought') },
    strengths: [{ id: 'order', name: tri('Order'), text: tri('Text') }, { id: 'empty', name: none, text: none }],
    skills: [{ id: 'fe', label: tri('Frontend'), skills: [{ name: 'React', level: 'working' }, { name: 'Odd', level: 'expert' }, { name: '', level: null }] }, { id: 'none', label: tri('Empty'), skills: [] }],
    focus: [{ id: 'a', active: true, title: tri('Now'), text: tri('Doing') }, { id: 'b', active: false, title: tri('Later'), text: tri('Soon') }],
    contact: { email: 'hello@example.com', social: [{ id: 'gh', label: 'GitHub', url: 'https://github.com/example' }, { id: 'bad', label: 'Bad', url: 'javascript:alert(1)' }, { id: 'http', label: 'Http', url: 'http://insecure.example' }] },
  }

  it('is read as the server promises: empty entries, unknown levels, inactive topics and addresses that are not https are left out', () => {
    const saved = parseProfile(doc)!
    expect(saved.about.paragraphs).toEqual([tri('One'), tri('Two')])
    expect(saved.about.strengths.map((item) => item.id)).toEqual(['order'])
    expect(saved.about.skillGroups).toHaveLength(1)
    expect(saved.about.skillGroups[0].skills).toEqual([{ name: 'React', level: 'working' }, { name: 'Odd', level: null }])
    expect(saved.about.focus.map((item) => item.id)).toEqual(['a'])
    expect(saved.contact).toEqual({ email: 'hello@example.com', social: [{ id: 'gh', label: 'GitHub', url: 'https://github.com/example' }] })
  })

  it('is nothing when there is nothing saved or the answer is not a document', () => {
    expect(parseProfile(null)).toBeNull()
    expect(parseProfile('nope')).toBeNull()
    expect(parseProfile([])).toBeNull()
  })
})
