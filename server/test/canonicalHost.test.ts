import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { canonicalHostOf, canonicalRedirect } from '../src/http/canonical.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * The canonical host (PROMPT 25): the website says it lives at ONE address (canonical links, hreflang, the sitemap, robots.txt), and the
 * host the safeguard redirect sends every other host to is the same one. The website's own modules are loaded by path (they belong to the
 * other TypeScript project), as the contract tests do, and held against the backend's redirect function: if the two ever name different
 * hosts, this fails. Nothing here changes a DNS record, a Cloudflare rule or a Render setting.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const load = (path: string): Promise<any> => import(/* @vite-ignore */ pathToFileURL(join(root, path)).href)

const APEX = 'https://szilardkiss.com'
const WWW_HOST = 'www.szilardkiss.com'

const at = (host: string | undefined, path = '/hu/', method = 'GET', publicUrl = APEX) => {
  const [pathname, search = ''] = path.split('?')
  return canonicalRedirect({ publicUrl, method, host, pathname, search: search ? `?${search}` : '' })
}

describe('the redirect to the canonical host', () => {
  it('sends a page asked for on another host to the same path on the canonical one, with the query, for GET and HEAD', () => {
    expect(at(WWW_HOST, '/hu/work/?utm=x&y=1')).toEqual({ status: 301, headers: { Location: `${APEX}/hu/work/?utm=x&y=1`, 'Cache-Control': 'public, max-age=300' } })
    expect(at(WWW_HOST, '/nl/', 'HEAD')?.status).toBe(301)
    expect(at('szilardkiss.onrender.com', '/en/')?.headers.Location).toBe(`${APEX}/en/`)
    expect(at(WWW_HOST, '/')?.headers.Location).toBe(`${APEX}/`)
  })

  it('does nothing on the canonical host, whatever the case, a trailing dot or the port its scheme implies', () => {
    for (const host of ['szilardkiss.com', 'SZILARDKISS.COM', 'szilardkiss.com.', 'szilardkiss.com:443']) expect(at(host), host).toBeNull()
    expect(at('szilardkiss.com:8443', '/hu/', 'GET', 'https://szilardkiss.com:8443')).toBeNull()
    expect(at('szilardkiss.com', '/hu/', 'GET', 'https://szilardkiss.com:8443')?.status).toBe(301)
  })

  it('never redirects what cannot be redirected or must not be: other methods, the health checks, an IP or localhost, a host that is not one', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) expect(at(WWW_HOST, '/api/contact', method), method).toBeNull()
    expect(at(WWW_HOST, '/api/health')).toBeNull()
    expect(at(WWW_HOST, '/api/ready')).toBeNull()
    expect(at(WWW_HOST, '/api/healthz')?.status, 'only the two exact addresses are exempt').toBe(301)
    for (const host of ['127.0.0.1', '127.0.0.1:10000', '10.1.2.3:8787', '[::1]', '[::1]:8787', 'localhost', 'localhost:3000']) expect(at(host), host).toBeNull()
    for (const host of [undefined, '', '   ', 'bad host', 'evil.com/path', 'a_b.example', 'ex ample.com', 'x@y.com']) expect(at(host), String(host)).toBeNull()
  })

  it('builds the target only from the configured address and the request’s own path: nothing in a header can steer it', () => {
    const hostile = [
      ['evil.example', '//attacker.example/x'],
      ['evil.example', '/%2F%2Fattacker.example'],
      ['evil.example', '/\\attacker.example'],
      ['evil.example', '/hu/\r\nSet-Cookie: x=1'],
      ['attacker.example:80', '/path?next=https://attacker.example'],
    ]
    for (const [host, path] of hostile) {
      const found = at(host, path)
      if (found === null) continue
      const location = new URL(found.headers.Location)
      expect(location.origin, `${host} ${path}`).toBe(APEX)
      expect(found.headers.Location).not.toMatch(/[\r\n]/)
      expect(Object.keys(found.headers).sort()).toEqual(['Cache-Control', 'Location'])
    }
    expect(canonicalHostOf('not a url')).toBeNull()
    expect(at(WWW_HOST, '/hu/', 'GET', 'not a url')).toBeNull()
  })
})

describe('the safeguard in the running server', () => {
  let server: TestServer | null = null
  afterEach(async () => {
    await server?.close()
    server = null
  })

  /** A request with the Host header a client wrote (fetch refuses to set it). */
  const ask = (s: TestServer, path: string, options: { host: string; method?: string; headers?: Record<string, string> }): Promise<{ status: number; location: string | null; cache: string | null }> =>
    new Promise((resolve, reject) => {
      const url = new URL(s.url)
      const req = request({ host: url.hostname, port: url.port, path, method: options.method ?? 'GET', headers: { Host: options.host, ...(options.headers ?? {}), ...(options.method === 'POST' ? { 'Content-Type': 'application/json' } : {}) } }, (res) => {
        res.resume()
        res.on('end', () => resolve({ status: res.statusCode ?? 0, location: String(res.headers.location ?? '') || null, cache: String(res.headers['cache-control'] ?? '') || null }))
      })
      req.on('error', reject)
      req.end(options.method === 'POST' ? '{}' : undefined)
    })

  it('is off unless CANONICAL_REDIRECT is set: another host is served, not redirected', async () => {
    server = await startServer({ env: { PUBLIC_URL: APEX } })
    expect((await ask(server, '/api/services', { host: WWW_HOST })).status).toBe(200)
  })

  it('when on, redirects a page on the wrong host, leaves the right host and the health checks alone, and does not redirect forever', async () => {
    server = await startServer({ env: { PUBLIC_URL: APEX, CANONICAL_REDIRECT: 'true' } })
    const first = await ask(server, '/api/services?lang=hu', { host: WWW_HOST })
    expect([first.status, first.location, first.cache]).toEqual([301, `${APEX}/api/services?lang=hu`, 'public, max-age=300'])
    // Following it: the same request on the canonical host is answered, not redirected again (no loop).
    expect((await ask(server, '/api/services?lang=hu', { host: 'szilardkiss.com' })).status).toBe(200)
    // The host's own health check comes with a host of its own and must never be redirected.
    expect((await ask(server, '/api/health', { host: WWW_HOST })).status).toBe(200)
    expect((await ask(server, '/api/ready', { host: 'srv-123.onrender.com' })).status).toBe(200)
    expect((await ask(server, '/api/health', { host: '10.0.0.7:10000' })).status).toBe(200)
  })

  it('does not touch a POST or a preflight, and takes no notice of a forwarded host header', async () => {
    server = await startServer({ env: { PUBLIC_URL: APEX, CANONICAL_REDIRECT: 'true' } })
    expect((await ask(server, '/api/contact', { host: WWW_HOST, method: 'POST' })).status, 'processed (and refused as an empty form), not redirected').not.toBe(301)
    expect((await ask(server, '/api/services', { host: WWW_HOST, method: 'OPTIONS' })).status).not.toBe(301)
    expect((await ask(server, '/api/services', { host: 'szilardkiss.com', headers: { 'X-Forwarded-Host': WWW_HOST } })).status).toBe(200)
    expect((await ask(server, '/api/services', { host: WWW_HOST, headers: { 'X-Forwarded-Host': 'szilardkiss.com' } })).status).toBe(301)
  })
})

describe('the website and the backend name the same host', () => {
  /** Every address the website declares about itself, for a site published at `siteUrl`: what a crawler sees. */
  async function declared(siteUrl: string) {
    const { buildSitemap, buildRobots } = await load('src/seo/sitemap.ts')
    const { allPageVersions, buildHead } = await load('src/seo/head.ts')
    const { PAGES } = await load('src/routes/pages.ts')
    const ctx = { siteUrl, brandName: 'A Brand', brandIsSet: true, profiles: [] as string[] }
    const sitemap: string = buildSitemap(siteUrl, PAGES)
    const heads = (allPageVersions(PAGES) as { page: unknown; lang: string }[]).map(({ page, lang }) => ({ lang, head: buildHead(page, lang, ctx) as { canonical: string | null; alternates: { hreflang: string; href: string }[]; indexable: boolean; tags: { kind: string; attrs?: Record<string, string> }[] } }))
    return {
      sitemap,
      locs: [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]),
      sitemapLinks: [...sitemap.matchAll(/<xhtml:link\s[^>]*href="([^"]+)"/g)].map((match) => match[1]),
      robots: buildRobots(siteUrl) as string,
      heads,
    }
  }

  /** The addresses (as strings) the safeguard redirects to when the sitemap's own pages are asked for on `host`. */
  const destinations = (locs: string[], publicUrl: string, host: string) => locs.map((loc) => ({ loc, destination: canonicalRedirect({ publicUrl, method: 'GET', host, pathname: new URL(loc).pathname, search: '' })?.headers.Location ?? null }))

  it('uses one origin in the sitemap, its alternates, robots.txt, every canonical address, every hreflang and og:url', async () => {
    const site = await declared(APEX)
    expect(site.locs.length).toBeGreaterThan(30)
    const origins = new Set([...site.locs, ...site.sitemapLinks].map((address) => new URL(address).origin))
    expect([...origins]).toEqual([APEX])
    expect(site.robots).toContain(`Sitemap: ${APEX}/sitemap.xml`)
    const indexable = site.heads.filter(({ head }) => head.indexable)
    expect(indexable.length).toBe(site.locs.length)
    for (const { head } of indexable) {
      expect(new URL(head.canonical!).origin).toBe(APEX)
      for (const alternate of head.alternates) expect(new URL(alternate.href).origin, alternate.href).toBe(APEX)
      const ogUrl = head.tags.find((tag) => tag.kind === 'meta' && tag.attrs?.property === 'og:url')?.attrs?.content
      if (ogUrl) expect(new URL(ogUrl).origin).toBe(APEX)
    }
  })

  it('has every sitemap address redirect from the other host to exactly itself, in all three languages', async () => {
    const site = await declared(APEX)
    const found = destinations(site.locs, APEX, WWW_HOST)
    expect(found.filter((entry) => entry.destination !== entry.loc)).toEqual([])
    for (const language of ['hu', 'en', 'nl']) expect(site.locs.some((loc) => new URL(loc).pathname === `/${language}/`), language).toBe(true)
    // And every language's pages are there: no route lost its language on the way.
    expect(new Set(site.locs.map((loc) => new URL(loc).pathname.split('/')[1]))).toEqual(new Set(['hu', 'en', 'nl']))
  })

  it('would FAIL if the two named different hosts (the situation the live site is in today): the check is not vacuous', async () => {
    const site = await declared(APEX)
    // The live site today: pages say the apex, the redirect rule in the dashboard sends the apex to www.
    const sendsToWww = destinations(site.locs, 'https://www.szilardkiss.com', 'szilardkiss.com')
    expect(sendsToWww.filter((entry) => entry.destination !== entry.loc).length).toBe(site.locs.length)
    // And a build for www with the safeguard set to the apex.
    const wwwSite = await declared('https://www.szilardkiss.com')
    expect(destinations(wwwSite.locs, APEX, WWW_HOST).filter((entry) => entry.destination !== entry.loc).length).toBe(wwwSite.locs.length)
  })

  it('writes no host-level redirect in the files the build adds (_redirects holds only the customer pages’ rewrites), and no www address', async () => {
    const { buildSiteFiles } = await load('src/seo/entry.ts')
    const template = readFileSync(join(root, 'index.html'), 'utf8')
    const ctx = { siteUrl: APEX, brandName: 'A Brand', brandIsSet: true, profiles: [] as string[] }
    const { files } = buildSiteFiles(template, { scriptHashes: [], styleHashes: [] }, ctx, null) as { files: Record<string, string> }
    for (const line of files._redirects.split('\n').filter(Boolean)) {
      expect(line, line).toMatch(/^\/(hu|en|nl)\/[a-z/]+\/\*\s+\/(hu|en|nl)\/[a-z/]+\/\s+200$/)
    }
    expect(files._redirects).not.toMatch(/https?:|\b301\b|\b302\b|www\./)
    for (const [name, content] of Object.entries(files)) if (/\.(html|xml|txt)$/.test(name)) expect(content, name).not.toContain('www.szilardkiss.com')
    expect(files['robots.txt']).toContain(`Sitemap: ${APEX}/sitemap.xml`)
  })
})
