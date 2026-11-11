// Checks the BUILT site (dist/) the way a crawler would read it: no framework, no browser, only the files.
// Run after `npm run build`:  npm run check:seo
// It reads what the build actually wrote, so it catches what the unit tests of src/seo/ cannot: a marker left
// in a file, a page that was not written, a sitemap that names a file that is not there, a header hash that no
// longer matches the inline script.
import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const dist = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'dist')
const failures = []
const fail = (where, what) => failures.push(`${where}: ${what}`)
const check = (condition, where, what) => {
  if (!condition) fail(where, what)
}

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else yield path
  }
}

const decode = (value) => value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
const attrsOf = (tag) => Object.fromEntries([...tag.matchAll(/([a-zA-Z:-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]))
const tagsOf = (html, name) => [...html.matchAll(new RegExp(`<${name}\\s[^>]*>`, 'g'))].map((m) => attrsOf(m[0]))

const pages = new Map() // url path -> parsed head
for await (const file of walk(dist)) {
  const rel = relative(dist, file).split(sep).join('/')
  if (!rel.endsWith('index.html') && rel !== '404.html') continue
  const html = await readFile(file, 'utf8')
  const metas = tagsOf(html, 'meta')
  const links = tagsOf(html, 'link')
  const meta = (key) => metas.filter((m) => m.name === key || m.property === key).map((m) => m.content)
  const path = rel === '404.html' ? '/404.html' : `/${rel.replace(/index\.html$/, '')}`
  pages.set(path, {
    rel,
    html,
    lang: html.match(/<html lang="([^"]*)"/)?.[1],
    titles: [...html.matchAll(/<title[^>]*>([^<]*)<\/title>/g)].map((m) => decode(m[1])),
    description: meta('description'),
    robots: meta('robots'),
    canonical: links.filter((l) => l.rel === 'canonical').map((l) => l.href),
    alternates: links.filter((l) => l.rel === 'alternate' && l.hreflang),
    og: (key) => meta(key),
    jsonLd: [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]),
  })
}

check(pages.size > 0, 'dist', 'no page files found (run npm run build first)')

const sitemapFile = join(dist, 'sitemap.xml')
const hasSitemap = await stat(sitemapFile).then(() => true, () => false)
const indexablePages = [...pages].filter(([, p]) => p.robots[0]?.startsWith('index'))
const configured = hasSitemap

for (const [path, page] of pages) {
  const where = page.rel
  check(page.titles.length === 1 && page.titles[0].length > 3, where, `expected exactly one non-empty <title>, found ${page.titles.length}`)
  check(page.description.length === 1 && page.description[0].length >= 40, where, 'expected exactly one description of at least 40 characters')
  check(page.robots.length === 1, where, 'expected exactly one robots meta tag')
  check(!page.html.includes('<!--seo:'), where, 'an unreplaced seo marker is left in the file')
  check(page.og('og:title').length === 1 && page.og('og:description').length === 1, where, 'expected one og:title and one og:description')
  check(page.og('twitter:card').length === 1, where, 'expected one twitter:card')
  if (path !== '/404.html') {
    const first = path.split('/')[1]
    const expectedLang = ['hu', 'en', 'nl'].includes(first) ? first : 'en'
    check(page.lang === expectedLang, where, `<html lang="${page.lang}"> should be "${expectedLang}"`)
  }
  if (!configured) {
    check(page.robots[0] === 'noindex, nofollow', where, `site address not configured: robots should be "noindex, nofollow", is "${page.robots[0]}"`)
    check(page.canonical.length === 0 && page.alternates.length === 0 && page.jsonLd.length === 0, where, 'site address not configured: no canonical, hreflang or structured data should be written')
  }
}

if (configured) {
  const sitemap = await readFile(sitemapFile, 'utf8')
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => decode(m[1]))
  const origin = new URL(locs[0]).origin
  const robots = await readFile(join(dist, 'robots.txt'), 'utf8')
  check(robots.includes(`Sitemap: ${origin}/sitemap.xml`), 'robots.txt', `should name ${origin}/sitemap.xml`)
  check(/^User-agent: \*$/m.test(robots) && !/^Disallow: \/\s*$/m.test(robots), 'robots.txt', 'should allow crawling')

  const sitemapPaths = new Set(locs.map((loc) => new URL(loc).pathname))
  check(locs.length === new Set(locs).size, 'sitemap.xml', 'lists an address twice')
  check(locs.every((loc) => loc.startsWith(origin) && !/[?#]/.test(loc)), 'sitemap.xml', 'has an address that is on another origin, or has a query or fragment')
  for (const loc of sitemapPaths) {
    const page = pages.get(loc)
    check(Boolean(page), 'sitemap.xml', `${loc} has no file in dist`)
    if (page) check(page.robots[0]?.startsWith('index'), 'sitemap.xml', `${loc} is listed but says "${page.robots[0]}"`)
  }
  for (const [path, page] of indexablePages) {
    if (path === '/') continue
    check(sitemapPaths.has(path), page.rel, 'is indexable but not in the sitemap')
  }
  check(indexablePages.every(([path]) => path === '/' || sitemapPaths.has(path)), 'sitemap.xml', 'misses an indexable page')

  const titlesByLang = new Map()
  const descriptionsByLang = new Map()
  for (const [path, page] of indexablePages) {
    const where = page.rel
    const self = `${origin}${path}`
    if (path === '/') {
      check(page.canonical[0] === `${origin}/en/`, where, 'the root page should canonicalise to /en/ (English is the fallback language, i18n/config.ts)')
      continue
    }
    check(page.canonical.length === 1 && page.canonical[0] === self, where, `canonical should be ${self}, is ${page.canonical.join(', ') || 'missing'}`)
    check(page.og('og:url')[0] === self, where, 'og:url should equal the canonical address')
    const codes = page.alternates.map((a) => a.hreflang)
    check(new Set(codes).size === codes.length, where, 'repeats a hreflang')
    check(codes.includes('x-default'), where, 'has no x-default alternate')
    check(page.alternates.some((a) => a.hreflang === page.lang && a.href === self), where, 'does not list itself among its alternates')
    for (const alternate of page.alternates) {
      const target = pages.get(new URL(alternate.href).pathname)
      check(Boolean(target), where, `alternate ${alternate.href} has no file`)
      if (target && alternate.hreflang !== 'x-default') {
        check(target.alternates.some((a) => a.href === self), where, `alternate ${alternate.href} does not link back`)
        check(target.lang === alternate.hreflang, where, `alternate ${alternate.href} is declared ${alternate.hreflang} but its page is ${target.lang}`)
      }
    }
    const t = titlesByLang.get(page.lang) ?? new Map()
    const d = descriptionsByLang.get(page.lang) ?? new Map()
    check(!t.has(page.titles[0]), where, `shares its title with ${t.get(page.titles[0])}`)
    check(!d.has(page.description[0]), where, `shares its description with ${d.get(page.description[0])}`)
    t.set(page.titles[0], page.rel)
    d.set(page.description[0], page.rel)
    titlesByLang.set(page.lang, t)
    descriptionsByLang.set(page.lang, d)

    check(page.jsonLd.length === 1, where, `expected one JSON-LD block, found ${page.jsonLd.length}`)
    for (const block of page.jsonLd) {
      let data
      try {
        data = JSON.parse(block)
      } catch (error) {
        fail(where, `JSON-LD is not valid JSON (${error.message})`)
        continue
      }
      const graph = data['@graph'] ?? []
      const ids = new Set(graph.map((n) => n['@id']))
      for (const ref of block.matchAll(/\{"@id":"([^"]+)"\}/g)) check(ids.has(ref[1]), where, `JSON-LD refers to missing node ${ref[1]}`)
      check(graph.some((n) => n.url === self), where, 'JSON-LD has no node for this page address')
    }
  }

  // The shared picture exists and is the size the tags promise.
  const image = join(dist, 'og', 'default.png')
  const png = await readFile(image).catch(() => null)
  check(png !== null, 'og/default.png', 'is missing')
  if (png) check(png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630, 'og/default.png', `should be 1200x630, is ${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`)
}

// The headers file allows exactly the inline script and style blocks the shell has.
const shell = pages.get('/')?.html ?? ''
const headers = await readFile(join(dist, '_headers'), 'utf8').catch(() => '')
check(headers.includes('Content-Security-Policy'), '_headers', 'has no Content-Security-Policy')
for (const tag of ['script', 'style']) {
  const bodies = [...shell.matchAll(new RegExp(`<${tag}(?![^>]*\\bsrc=)(?![^>]*ld\\+json)[^>]*>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]).filter((b) => b.trim())
  for (const body of bodies) {
    // The browser hashes the parsed text, in which every CRLF is already an LF (see scripts/prerender.mjs).
    const hash = createHash('sha256').update(body.replace(/\r\n?/g, '\n')).digest('base64')
    check(headers.includes(`'sha256-${hash}'`), '_headers', `does not allow the page's inline <${tag}> (sha256-${hash})`)
  }
}
check(!/unsafe-eval|script-src[^;]*unsafe-inline/.test(headers), '_headers', 'allows unsafe-eval or unsafe-inline scripts')

const total = pages.size
if (failures.length > 0) {
  console.error(`check:seo FAILED: ${failures.length} problem(s) in ${total} files`)
  for (const failure of failures.slice(0, 60)) console.error(`  - ${failure}`)
  if (failures.length > 60) console.error(`  ... and ${failures.length - 60} more`)
  process.exit(1)
}
console.log(
  `check:seo ok: ${total} files, ${indexablePages.length} indexable, ${total - indexablePages.length} noindex; ${configured ? 'sitemap, hreflang reciprocity, canonicals, structured data and headers verified' : 'site address NOT configured: everything is noindex (as intended)'}`,
)
