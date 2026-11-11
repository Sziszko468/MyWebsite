import { describe, expect, it } from 'vitest'
import worker from './index'
import { decide, isCrawler, namesNoLanguage } from './routing'

/** A request as Cloudflare hands it to the Worker: `cf.country` is filled in by the network, headers come from the client. */
function request(path: string, options: { country?: string; cookie?: string; headers?: Record<string, string>; method?: string; userAgent?: string } = {}): Request {
  const headers = new Headers(options.headers)
  if (options.cookie) headers.set('cookie', options.cookie)
  headers.set('user-agent', options.userAgent ?? 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/156.0 Safari/537.36')
  const built = new Request(`https://example.test${path}`, { method: options.method ?? 'GET', headers })
  if (options.country !== undefined) Object.defineProperty(built, 'cf', { value: { country: options.country } })
  return built
}

const ASSETS = { fetch: async (incoming: Request) => new Response(`asset:${new URL(incoming.url).pathname}`, { status: 200 }) }

async function run(path: string, options: Parameters<typeof request>[1] = {}, env: { SIMULATE_COUNTRY?: string } = {}) {
  const response = await worker.fetch(request(path, options), { ASSETS, ...env })
  return { status: response.status, location: response.headers.get('location'), headers: response.headers, body: response.status === 200 ? await response.text() : '' }
}

describe('the starting language at the edge', () => {
  it('sends a Hungarian visitor to Hungarian', async () => {
    const result = await run('/', { country: 'HU' })
    expect(result.status).toBe(302)
    expect(result.location).toBe('/hu/')
  })

  it('sends a Dutch visitor to Dutch', async () => {
    expect((await run('/', { country: 'NL' })).location).toBe('/nl/')
  })

  it.each(['DE', 'FR', 'US', 'GB', 'BE', 'XX', 'T1'])('sends a visitor from %s to English', async (country) => {
    expect((await run('/', { country })).location).toBe('/en/')
  })

  it('sends a visitor whose country is missing to English', async () => {
    expect((await run('/')).location).toBe('/en/')
  })

  it('follows the country a VPN exit shows (it is the only country the edge can see)', async () => {
    // A Hungarian behind a Dutch exit starts in Dutch, and one behind a German exit in English; the language links are one click away.
    expect((await run('/', { country: 'NL' })).location).toBe('/nl/')
    expect((await run('/', { country: 'DE' })).location).toBe('/en/')
  })

  it('lets the saved choice beat the country, whichever way', async () => {
    expect((await run('/', { country: 'HU', cookie: 'cc_lang=en' })).location).toBe('/en/')
    expect((await run('/', { country: 'DE', cookie: 'cc_lang=hu' })).location).toBe('/hu/')
    expect((await run('/', { country: 'NL', cookie: 'theme=dark; cc_lang=hu' })).location).toBe('/hu/')
  })

  it('ignores a saved value that is not a language', async () => {
    expect((await run('/', { country: 'HU', cookie: 'cc_lang=de' })).location).toBe('/hu/')
    expect((await run('/', { country: 'HU', cookie: 'cc_lang=' })).location).toBe('/hu/')
  })

  it('keeps the query and puts a path typed without a language into the language, as a directory', async () => {
    expect((await run('/services?plan=grow', { country: 'NL' })).location).toBe('/nl/services/?plan=grow')
    expect((await run('/services/packages/launch/', { country: 'HU' })).location).toBe('/hu/services/packages/launch/')
    expect((await run('/?utm_source=x', { country: 'DE' })).location).toBe('/en/?utm_source=x')
  })

  it('answers with a redirect nothing may cache', async () => {
    const { headers } = await run('/', { country: 'HU' })
    expect(headers.get('cache-control')).toBe('private, no-store')
    expect(headers.get('vary')).toBe('Cookie')
    expect(headers.get('set-cookie')).toBeNull()
  })
})

describe('what the edge never touches', () => {
  it.each(['/hu/', '/en/services/', '/nl/work/', '/hu', '/en/quote/abc123'])('leaves %s alone, whatever the country', async (path) => {
    const result = await run(path, { country: 'DE' })
    expect(result.status).toBe(200)
    expect(result.body).toBe(`asset:${path}`)
  })

  it.each(['/favicon.svg', '/robots.txt', '/sitemap.xml', '/404.html', '/assets/main-abc.js', '/og/default.png', '/projects/a.webp', '/admin', '/admin/quotes', '/api/health', '/.well-known/security.txt'])('leaves %s alone', async (path) => {
    expect((await run(path, { country: 'HU' })).status).toBe(200)
  })

  it('leaves anything but a read alone', async () => {
    expect((await run('/', { country: 'HU', method: 'POST' })).status).toBe(200)
  })

  it('does not send crawlers and link previews anywhere: they read the root document', async () => {
    for (const userAgent of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'facebookexternalhit/1.1',
      'Mozilla/5.0 (compatible; DuckDuckBot-Https/1.1; https://duckduckgo.com/duckduckbot)',
      'WhatsApp/2.23.20.0',
      'Slackbot-LinkExpanding 1.0',
    ]) {
      const result = await run('/', { country: 'HU', userAgent })
      expect(result.status, userAgent).toBe(200)
      expect(result.body).toBe('asset:/')
    }
  })

  it('does not take real browsers for crawlers (a headless Chrome is a browser)', () => {
    expect(isCrawler('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36')).toBe(false)
    expect(isCrawler('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe(false)
    expect(isCrawler(null)).toBe(false)
  })
})

describe('what a visitor cannot forge', () => {
  it('ignores a country the browser writes into a header', async () => {
    const forged = { 'cf-ipcountry': 'HU', 'x-simulate-country': 'HU', 'x-country': 'HU', 'x-forwarded-for': '84.0.0.1' }
    expect((await run('/', { country: 'DE', headers: forged })).location).toBe('/en/')
    expect((await run('/', { headers: forged })).location).toBe('/en/')
  })

  it('reads a simulated country only where the environment allows it (local tests, never the deployed Worker)', async () => {
    expect((await run('/', { country: 'DE', headers: { 'x-simulate-country': 'NL' } }, { SIMULATE_COUNTRY: '1' })).location).toBe('/nl/')
    expect((await run('/', { country: 'DE', headers: { 'x-simulate-country': 'NL' } }, { SIMULATE_COUNTRY: '0' })).location).toBe('/en/')
    expect((await run('/', { country: 'HU' }, { SIMULATE_COUNTRY: '1' })).location).toBe('/hu/')
  })

  it('does not read, keep or pass on anything about the visitor: the answer is an address and caches nothing', () => {
    const decision = decide(request('/', { country: 'HU', headers: { 'x-forwarded-for': '84.0.0.1', 'cf-connecting-ip': '84.0.0.1' } }))
    expect(JSON.stringify(decision)).not.toMatch(/84\.0\.0\.1/)
    expect(decision).toEqual({ kind: 'redirect', location: '/hu/', language: 'hu', source: 'country' })
  })
})

describe('which addresses name no language', () => {
  it('is the root and the pages typed without one', () => {
    expect(namesNoLanguage('/')).toBe(true)
    expect(namesNoLanguage('/services')).toBe(true)
    expect(namesNoLanguage('/services/packages/launch')).toBe(true)
    expect(namesNoLanguage('/quote/abc')).toBe(true)
  })
  it('is not a language page, a file, or the administration and the API', () => {
    expect(namesNoLanguage('/hu/')).toBe(false)
    expect(namesNoLanguage('/nl/services/')).toBe(false)
    expect(namesNoLanguage('/robots.txt')).toBe('not-a-page')
    expect(namesNoLanguage('/admin')).toBe('not-a-page')
    expect(namesNoLanguage('/api/quote-requests')).toBe('not-a-page')
  })
})
