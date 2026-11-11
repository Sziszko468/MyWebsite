import { afterAll, describe, expect, it } from 'vitest'
import { LANGUAGES } from '../i18n/config'
import { PAGES, findPage } from '../routes/pages'
import { allPageVersions, buildHead, serializeJsonLd, seoContextFrom, type Head, type SeoContext } from './head'
import { renderNoscript, renderPage, renderTag, HEAD_MARKER, BODY_MARKER } from './html'
import { seoPath } from './paths'
import { buildRobots, buildSitemap } from './sitemap'
import { normalizeSiteUrl } from './siteUrl'
import { resetProjectStore } from '../projects/store'
import { buildSiteFiles, pagesForBuild } from './entry'

const SITE = 'https://example.test'
const LIVE: SeoContext = { siteUrl: SITE, brandName: 'Test Brand', brandIsSet: true, profiles: ['https://github.com/test'] }
const UNSET: SeoContext = { siteUrl: null, brandName: 'Your Name', brandIsSet: false, profiles: [] }
const NO_BRAND: SeoContext = { siteUrl: SITE, brandName: 'Your Name', brandIsSet: false, profiles: [] }

// The design-system reference page exists in development only and says nothing of its own.
const allVersions = allPageVersions()
const versions = allVersions.filter(({ page }) => page.id !== 'designSystem')
const heads = new Map(versions.map(({ page, lang }) => [`${lang}:${page.id}`, buildHead(page, lang, LIVE)]))
const headOf = (id: string, lang: string): Head => heads.get(`${lang}:${id}`)!
const indexable = versions.filter(({ page }) => page.indexable)

const field = (head: Head, attribute: 'name' | 'property', key: string): string | undefined =>
  head.tags.flatMap((tag) => (tag.kind === 'meta' && tag.attrs[attribute] === key ? [tag.attrs.content] : []))[0]

describe('normalizeSiteUrl', () => {
  it('keeps only the origin of an https address', () => {
    expect(normalizeSiteUrl('https://example.com')).toBe('https://example.com')
    expect(normalizeSiteUrl(' https://example.com/some/path/?q=1#top ')).toBe('https://example.com')
    expect(normalizeSiteUrl('https://www.example.com:8443/')).toBe('https://www.example.com:8443')
  })

  it('accepts a local http address, and nothing else that is not https', () => {
    expect(normalizeSiteUrl('http://localhost:4173')).toBe('http://localhost:4173')
    expect(normalizeSiteUrl('http://example.com')).toBeNull()
    expect(normalizeSiteUrl('ftp://example.com')).toBeNull()
    expect(normalizeSiteUrl('javascript:alert(1)')).toBeNull()
  })

  it('treats nothing, rubbish and credentials as not configured', () => {
    for (const value of [undefined, null, '', '   ', 'example.com', 'https://', 'https://user:secret@example.com', 42]) {
      expect(normalizeSiteUrl(value), String(value)).toBeNull()
    }
  })
})

describe('seoContextFrom', () => {
  it('knows the template brand is not a brand, and lists only profiles that have an address', () => {
    const base = { siteUrl: SITE, social: [{ id: 'a', label: 'A', url: 'https://a.test/x' }, { id: 'b', label: 'B', url: null }] }
    expect(seoContextFrom({ ...base, brandName: 'Your Name' }).brandIsSet).toBe(false)
    expect(seoContextFrom({ ...base, brandName: 'Kovács Péter' })).toMatchObject({ brandIsSet: true, profiles: ['https://a.test/x'] })
  })
})

describe('every page is its own page', () => {
  it.each(LANGUAGES)('has a unique title and a unique description in %s', (lang) => {
    const own = versions.filter((v) => v.lang === lang && v.page.indexable)
    const titles = own.map((v) => headOf(v.page.id, lang).title)
    const descriptions = own.map((v) => headOf(v.page.id, lang).description)
    expect(new Set(titles).size, 'titles').toBe(titles.length)
    expect(new Set(descriptions).size, 'descriptions').toBe(descriptions.length)
  })

  it('has a unique title for the pages that stay out of the index too', () => {
    for (const lang of LANGUAGES) {
      const all = versions.filter((v) => v.lang === lang).map((v) => headOf(v.page.id, lang))
      expect(new Set(all.map((h) => h.title)).size).toBe(all.length)
    }
  })

  it('has titles and descriptions of a sensible length', () => {
    for (const [key, head] of heads) {
      expect(head.title.length, `${key} title`).toBeGreaterThan(8)
      expect(head.title.length, `${key} title`).toBeLessThanOrEqual(75)
      expect(head.description.length, `${key} description`).toBeGreaterThanOrEqual(40)
      expect(head.description.length, `${key} description`).toBeLessThanOrEqual(200)
    }
  })

  it('writes the same page differently in each language', () => {
    for (const { page } of versions.filter((v) => v.lang === 'hu')) {
      const descriptions = LANGUAGES.map((lang) => headOf(page.id, lang).description)
      expect(new Set(descriptions).size, `${page.id} descriptions`).toBe(3)
    }
  })

  it('does not describe the Lab as having an experience it does not have', () => {
    for (const lang of LANGUAGES) {
      const text = `${headOf('lab', lang).description} ${headOf('home', lang).description}`.toLowerCase()
      expect(text).not.toMatch(/generat(or|ive object)|generátor|objektumgener|objectgenerator|\bsix\b|\bhat\b|\bzes\b/)
    }
  })
})

describe('indexing rules', () => {
  it('lists the content pages and keeps the visitor-state pages out', () => {
    for (const { page, lang } of versions) {
      const head = headOf(page.id, lang)
      expect(head.indexable, `${lang}:${page.id}`).toBe(page.indexable)
      expect(head.robots, `${lang}:${page.id}`).toMatch(page.indexable ? /^index, follow/ : /^noindex, follow$/)
    }
    expect(findPage('/services/cart')?.indexable).toBe(false)
    expect(findPage('/services/configure')?.indexable).toBe(false)
    expect(findPage('/services')?.indexable).toBe(true)
  })

  it('says noindex for the page that is not there', () => {
    const head = buildHead(undefined, 'en', LIVE)
    expect(head.robots).toBe('noindex, follow')
    expect(head.canonical).toBeNull()
    expect(head.alternates).toEqual([])
    expect(head.jsonLd).toEqual([])
  })

  it('keeps every page out of the index until the site address is configured', () => {
    for (const { page, lang } of versions) {
      const head = buildHead(page, lang, UNSET)
      expect(head.robots).toBe('noindex, nofollow')
      expect(head.canonical).toBeNull()
      expect(head.alternates).toEqual([])
      expect(head.jsonLd).toEqual([])
      expect(JSON.stringify(head.tags)).not.toMatch(/https?:\/\//)
    }
  })
})

describe('canonical addresses and language alternates', () => {
  it('points every indexable page at itself, absolute, with one canonical per page', () => {
    for (const { page, lang } of indexable) {
      const head = headOf(page.id, lang)
      expect(head.canonical).toBe(`${SITE}${seoPath(lang, page.path)}`)
      expect(head.canonical).toMatch(/^https:\/\/[^?#]+\/$/)
      expect(head.tags.filter((t) => t.kind === 'link' && t.attrs.rel === 'canonical')).toHaveLength(1)
      expect(field(head, 'property', 'og:url')).toBe(head.canonical)
    }
  })

  it('lists every language and x-default on every indexable page, including itself', () => {
    for (const { page, lang } of indexable) {
      const head = headOf(page.id, lang)
      expect(head.alternates.map((a) => a.hreflang)).toEqual([...page.languages, 'x-default'])
      expect(head.alternates.find((a) => a.hreflang === lang)?.href).toBe(head.canonical)
      expect(head.alternates.find((a) => a.hreflang === 'x-default')?.href).toBe(`${SITE}${seoPath('en', page.path)}`)
    }
  })

  it('is reciprocal: if A names B as an alternate, B names A', () => {
    const byUrl = new Map([...heads.values()].filter((h) => h.canonical).map((h) => [h.canonical!, h]))
    for (const head of heads.values()) {
      for (const alternate of head.alternates) {
        const target = byUrl.get(alternate.href)
        expect(target, alternate.href).toBeDefined()
        if (alternate.hreflang !== 'x-default') expect(target!.alternates.some((a) => a.href === head.canonical)).toBe(true)
      }
    }
  })

  it('tells the document language and the Open Graph locale', () => {
    for (const { page, lang } of indexable) {
      const head = headOf(page.id, lang)
      expect(head.lang).toBe(lang)
      expect(field(head, 'property', 'og:locale')).toBe({ hu: 'hu_HU', en: 'en_US', nl: 'nl_NL' }[lang])
    }
  })
})

describe('Open Graph and Twitter', () => {
  it('describes every page and gives it the shared picture', () => {
    for (const [key, head] of heads) {
      expect(field(head, 'property', 'og:title'), key).toBe(head.title)
      expect(field(head, 'property', 'og:description'), key).toBe(head.description)
      expect(field(head, 'property', 'og:image'), key).toBe(`${SITE}/og/default.png`)
      expect(field(head, 'property', 'og:image:alt'), key).toBeTruthy()
      expect(field(head, 'name', 'twitter:card'), key).toBe('summary_large_image')
      expect(field(head, 'name', 'twitter:image'), key).toBe(`${SITE}/og/default.png`)
    }
  })

  it('types a project as an article and everything else as a website', () => {
    expect(field(headOf('project-spendly', 'en'), 'property', 'og:type')).toBe('article')
    expect(field(headOf('home', 'en'), 'property', 'og:type')).toBe('website')
  })
})

// ---------------------------------------------------------------- structured data

const FORBIDDEN =
  /aggregateRating|"review"|reviewRating|"offers?"|"price|priceRange|priceCurrency|"address"|PostalAddress|telephone|"email"|taxID|vatID|iso6523|"hasCredential"|EducationalOccupationalCredential|award|founder|foundingDate|numberOfEmployees|legalName|"rating/

describe('structured data', () => {
  const graphs = indexable.map(({ page, lang }) => ({ key: `${lang}:${page.id}`, head: headOf(page.id, lang) }))

  it('is valid JSON in one script per indexable page, and absent from the pages that stay out', () => {
    for (const { key, head } of graphs) {
      const scripts = head.tags.filter((t) => t.kind === 'jsonld')
      expect(scripts, key).toHaveLength(1)
      const parsed = JSON.parse((scripts[0] as { json: string }).json)
      expect(parsed['@context']).toBe('https://schema.org')
      expect(Array.isArray(parsed['@graph'])).toBe(true)
    }
    for (const { page, lang } of versions.filter((v) => !v.page.indexable)) {
      expect(headOf(page.id, lang).tags.some((t) => t.kind === 'jsonld')).toBe(false)
    }
  })

  it('states nothing the site cannot back: no rating, review, price, address, registration or certificate', () => {
    for (const { key, head } of graphs) expect(JSON.stringify(head.jsonLd), key).not.toMatch(FORBIDDEN)
  })

  it('refers only to nodes that exist in the same graph', () => {
    for (const { key, head } of graphs) {
      const ids = new Set(head.jsonLd.map((node) => (node as { '@id'?: string })['@id']))
      const refs = [...JSON.stringify(head.jsonLd).matchAll(/\{"@id":"([^"]+)"\}/g)].map((m) => m[1])
      for (const ref of refs) expect(ids.has(ref), `${key} -> ${ref}`).toBe(true)
    }
  })

  it('uses absolute addresses only, on the site', () => {
    for (const { key, head } of graphs) {
      const urls = [...JSON.stringify(head.jsonLd).matchAll(/"(?:url|item|image|@id)":"([^"]+)"/g)].map((m) => m[1])
      for (const url of urls) expect(url.startsWith(SITE) || url.startsWith('https://github.com/'), `${key} ${url}`).toBe(true)
    }
  })

  it('describes the person and the website only once the brand is real', () => {
    const types = (ctx: SeoContext) =>
      (buildHead(findPage('/'), 'en', ctx).jsonLd as { '@type': string }[]).map((node) => node['@type'])
    expect(types(LIVE)).toEqual(expect.arrayContaining(['Person', 'WebSite', 'WebPage']))
    expect(types(NO_BRAND)).toEqual(['WebPage'])
  })

  it('types each kind of page for what it is', () => {
    const typesOf = (id: string, lang = 'en') => (headOf(id, lang).jsonLd as { '@type': string }[]).map((node) => node['@type'])
    expect(typesOf('about')).toContain('AboutPage')
    expect(typesOf('contact')).toContain('ContactPage')
    expect(typesOf('service-website')).toEqual(expect.arrayContaining(['WebPage', 'Service', 'BreadcrumbList']))
    expect(typesOf('project-spendly')).toEqual(expect.arrayContaining(['WebPage', 'CreativeWork', 'BreadcrumbList']))
    expect(typesOf('lab-liquid-matter')).toEqual(expect.arrayContaining(['CreativeWork']))
  })

  it('names a project by its stack and a service by its own name, from the content', () => {
    const project = (headOf('project-spendly', 'en').jsonLd as Record<string, unknown>[]).find((node) => node['@type'] === 'CreativeWork')!
    expect(project.name).toBe('Spendly')
    expect(String(project.keywords)).toContain('Django REST Framework')
    expect(String(project.image)).toBe(`${SITE}/projects/spendly/dashboard-light.webp`)
    const service = (headOf('service-webapp', 'nl').jsonLd as Record<string, unknown>[]).find((node) => node['@type'] === 'Service')!
    expect(String(service.name).length).toBeGreaterThan(3)
  })

  it('can never be closed early by the text in it', () => {
    const separator = String.fromCharCode(0x2028)
    const json = serializeJsonLd({ name: '</script><script>alert(1)</script><!--', other: separator })
    expect(json).not.toContain('<')
    expect(json).not.toContain(separator)
    expect(JSON.parse(json).name).toBe('</script><script>alert(1)</script><!--')
  })
})

// ---------------------------------------------------------------- the build's files

describe('sitemap.xml and robots.txt', () => {
  const xml = buildSitemap(SITE)
  const urls = [...xml.matchAll(/<url>[\s\S]*?<\/url>/g)].map((m) => m[0])

  it('lists every indexable page in every language, once, and nothing else', () => {
    const locs = urls.map((u) => u.match(/<loc>([^<]+)<\/loc>/)![1])
    expect(new Set(locs).size).toBe(locs.length)
    expect(locs).toHaveLength(indexable.length)
    for (const { page, lang } of indexable) expect(locs).toContain(`${SITE}${seoPath(lang, page.path)}`)
    for (const loc of locs) expect(loc).not.toMatch(/\/services\/(cart|configure)\/|\?|#/)
  })

  it('gives each entry the alternates of its page, with x-default', () => {
    for (const url of urls) {
      expect(url.match(/hreflang="/g)!.length).toBe(LANGUAGES.length + 1)
      expect(url).toContain('hreflang="x-default"')
    }
  })

  it('is well-formed XML with the namespaces it uses', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"')
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"')
    expect(xml.match(/<url>/g)!.length).toBe(xml.match(/<\/url>/g)!.length)
    expect(urls.length).toBeLessThanOrEqual(50000)
  })

  it('escapes what XML and HTML need escaped', () => {
    expect(buildSitemap('https://example.test').includes('&amp;')).toBe(false)
    expect(renderTag({ kind: 'meta', attrs: { name: 'x', content: 'a "b" <c> & d' } })).toContain('a &quot;b&quot; &lt;c&gt; &amp; d')
  })

  it('has a robots.txt that allows crawling and names the sitemap only when it can', () => {
    expect(buildRobots(SITE)).toBe(`User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`)
    expect(buildRobots(null)).toBe('User-agent: *\nAllow: /\n')
  })
})

describe('the page files the build writes', () => {
  const template = `<!doctype html><html lang="hu" data-theme="dark"><head><meta charset="UTF-8" />${HEAD_MARKER}<style>html{}</style><script>var a=1</script></head><body><div id="root"></div>${BODY_MARKER}<script type="module" src="/assets/a.js"></script></body></html>`
  // (`null`: no projects pulled from a backend, whatever a developer's machine has in src/content/projects.generated.json.)
  const built = buildSiteFiles(template, { scriptHashes: ['AAA'], styleHashes: ['BBB'] }, LIVE, null)

  it('writes one file per page and language, the root, the 404 page, the sitemap, robots.txt and the headers', () => {
    const pageFiles = Object.keys(built.files).filter((p) => p.endsWith('index.html'))
    expect(pageFiles).toHaveLength(allVersions.length + 1)
    for (const { page, lang } of versions) {
      expect(built.files[`${lang}${page.path === '/' ? '' : page.path}/index.html`], `${lang}${page.path}`).toBeDefined()
    }
    for (const name of ['index.html', '404.html', 'sitemap.xml', 'robots.txt', '_headers']) expect(built.files[name], name).toBeDefined()
    expect(built.warnings.filter((w) => w.includes('VITE_SITE_URL'))).toEqual([])
  })

  it("puts each page's own language, title, canonical and fallback in its file", () => {
    const file = built.files['en/services/website/index.html']
    expect(file).toContain('<html lang="en"')
    expect(file).toMatch(/<title data-seo>[^<]+ — Test Brand<\/title>/)
    expect(file).toContain('<link rel="canonical" href="https://example.test/en/services/website/" data-seo>')
    expect(file).toContain('<link rel="alternate" hreflang="nl" href="https://example.test/nl/services/website/" data-seo>')
    expect(file).toContain('<noscript>')
    expect(file).not.toContain(HEAD_MARKER)
    expect(file).not.toContain(BODY_MARKER)
    expect(file).toContain('<script type="module" src="/assets/a.js">')
  })

  it('keeps the cart and the 404 page out of the index in their own files', () => {
    expect(built.files['hu/services/cart/index.html']).toContain('content="noindex, follow"')
    expect(built.files['404.html']).toContain('content="noindex, follow"')
    expect(built.files['404.html']).not.toContain('rel="canonical"')
  })

  it('canonicalises / to the default language', () => {
    expect(built.files['index.html']).toContain('<link rel="canonical" href="https://example.test/en/" data-seo>')
  })

  it('warns, and writes no sitemap, while the site address is not configured', () => {
    const unset = buildSiteFiles(template, { scriptHashes: [], styleHashes: [] }, UNSET, null)
    expect(unset.files['sitemap.xml']).toBeUndefined()
    expect(unset.files['robots.txt']).toBe('User-agent: *\nAllow: /\n')
    expect(unset.warnings.join(' ')).toContain('VITE_SITE_URL')
    expect(unset.files['hu/index.html']).toContain('content="noindex, nofollow"')
  })

  it('refuses a shell that lost its markers, rather than writing pages with no head', () => {
    expect(() => renderPage('<html lang="hu"><head></head></html>', headOf('home', 'hu'), findPage('/'))).toThrow(/marker/)
  })

  it('gives a no-script visitor the main pages and the other languages', () => {
    const html = renderNoscript(findPage('/about'), 'nl')
    for (const href of ['/nl/', '/nl/work/', '/nl/services/', '/nl/about/', '/nl/lab/', '/nl/contact/', '/hu/about/', '/en/about/']) {
      expect(html, href).toContain(`href="${href}"`)
    }
    expect(html).toContain('hreflang="en"')
  })
})

describe('every page in the registry is reachable by the build', () => {
  it('has a page version for each language it is translated into', () => {
    expect(allVersions.length).toBe(PAGES.reduce((n, p) => n + p.languages.length, 0))
  })
})

describe('the projects the backend published are what the build writes pages for', () => {
  const template = `<!doctype html><html lang="hu" data-theme="dark"><head><meta charset="UTF-8" />${HEAD_MARKER}</head><body><div id="root"></div>${BODY_MARKER}</body></html>`
  const served = (slug: string, card: Record<string, unknown> = {}) => ({
    slug,
    featured: false,
    position: 1,
    category: 'apps',
    status: 'published',
    card: { title: { hu: 'Útinapló', en: 'Travel log', nl: 'Reisdagboek' }, label: { hu: 'Napló', en: 'Log', nl: 'Dagboek' }, description: { hu: 'Kézzel írt kártyaszöveg.', en: 'A hand-written card text.', nl: 'Een kaarttekst.' }, tags: ['React'], detailPage: true, projectStatus: 'demo', ...card },
  })
  // The backend publishes the website's own Spendly, a project that exists only in the administration, one with no page of its own,
  // and does NOT publish BookingHub or the Logistics Platform (the owner unpublished them).
  const pulled = { projects: [served('spendly'), served('travel-log'), served('only-a-card', { detailPage: false })], categories: [] }
  const built = buildSiteFiles(template, { scriptHashes: [], styleHashes: [] }, LIVE, pulled)
  afterAll(() => resetProjectStore())

  it('writes a page in every language for a new project with a page, with its own title, description and canonical address', () => {
    for (const lang of LANGUAGES) expect(built.files[`${lang}/work/travel-log/index.html`], lang).toBeDefined()
    const english = built.files['en/work/travel-log/index.html']
    expect(english).toContain('<title data-seo>Travel log — Test Brand</title>')
    expect(english).toContain('A hand-written card text.')
    expect(english).toContain('<link rel="canonical" href="https://example.test/en/work/travel-log/" data-seo>')
    expect(english).not.toContain('noindex')
    expect(built.files['nl/work/travel-log/index.html']).toContain('<title data-seo>Reisdagboek — Test Brand</title>')
  })

  it('lists it in the sitemap with its language alternates, and lists nothing the backend does not publish', () => {
    const sitemap = built.files['sitemap.xml']
    expect(sitemap).toContain('<loc>https://example.test/en/work/travel-log/</loc>')
    expect(sitemap).toContain('hreflang="nl" href="https://example.test/nl/work/travel-log/"')
    expect(sitemap).toContain('<loc>https://example.test/en/work/spendly/</loc>')
    for (const gone of ['bookinghub', 'logistics-platform', 'only-a-card']) expect(sitemap, gone).not.toContain(`/work/${gone}/`)
  })

  it('writes no file for a project of the website that the backend does not publish, nor for one without a page of its own', () => {
    for (const gone of ['bookinghub', 'logistics-platform', 'only-a-card']) {
      for (const lang of LANGUAGES) expect(built.files[`${lang}/work/${gone}/index.html`], `${lang}/${gone}`).toBeUndefined()
    }
    // The website's own project the backend still publishes keeps its own, longer head.
    expect(built.files['en/work/spendly/index.html']).toContain('<link rel="canonical" href="https://example.test/en/work/spendly/" data-seo>')
  })

  it('builds exactly what it always did when nothing was pulled, or the file is not a list', () => {
    expect(pagesForBuild(null)).toBe(PAGES)
    expect(pagesForBuild({ projects: 'nope' })).toBe(PAGES)
    expect(pagesForBuild({})).toBe(PAGES)
  })

  it('ignores an entry that is not a project (no address, a bad address, no title) instead of writing a page for it', () => {
    const pages = pagesForBuild({ projects: [served('travel-log'), { slug: '../x', card: { title: { hu: 'X' }, detailPage: true } }, { slug: 'no-title', card: { title: {}, detailPage: true } }, 42, null] })
    const paths = pages.filter((page) => page.path.startsWith('/work/')).map((page) => page.path)
    expect(paths).toContain('/work/travel-log')
    expect(paths.filter((path) => path.includes('..') || path.includes('no-title'))).toEqual([])
  })
})
