import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config.ts'
import { languageOfCountry, languageRedirect, namesNoLanguage, savedLanguage } from '../src/modules/system/language.ts'
import { startServer, type TestServer } from './helpers.ts'

/**
 * The starting language by country when the website is served by this process (PROMPT 20, `COUNTRY_HEADER`): the same rule as the edge
 * Worker's, which production does not run (it is served by Render). Off unless the operator names the header.
 */

let server: TestServer | null = null
const folders: string[] = []

/** A tiny built website: a root document and a page per language, a robots file and a 404 page. */
function website(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cc-language-'))
  folders.push(dir)
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>root</title>')
  for (const lang of ['hu', 'en', 'nl']) {
    mkdirSync(join(dir, lang, 'services'), { recursive: true })
    writeFileSync(join(dir, lang, 'index.html'), `<!doctype html><title>${lang}</title>`)
    writeFileSync(join(dir, lang, 'services', 'index.html'), `<!doctype html><title>${lang} services</title>`)
  }
  writeFileSync(join(dir, 'robots.txt'), 'User-agent: *\nAllow: /\n')
  writeFileSync(join(dir, '404.html'), '<!doctype html><title>404</title>')
  return dir
}

async function start(env: Record<string, string> = {}): Promise<TestServer> {
  server = await startServer({ seed: false, env: { STATIC_DIR: website(), ...env } })
  return server
}

afterEach(async () => {
  await server?.close()
  server = null
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

const ask = async (path: string, headers: Record<string, string> = {}, method = 'GET') => {
  const response = await server!.fetch(path, { headers, method })
  return { status: response.status, location: response.headers.get('location'), cache: response.headers.get('cache-control'), vary: response.headers.get('vary'), text: method === 'HEAD' ? '' : await response.text() }
}

describe('the starting language by country', () => {
  it('sends an address without a language to the language of the visitor\'s country, English elsewhere', async () => {
    await start({ COUNTRY_HEADER: 'CF-IPCountry' })
    expect(await ask('/', { 'CF-IPCountry': 'HU' })).toMatchObject({ status: 302, location: '/hu/' })
    expect(await ask('/', { 'CF-IPCountry': 'NL' })).toMatchObject({ status: 302, location: '/nl/' })
    expect(await ask('/', { 'CF-IPCountry': 'DE' })).toMatchObject({ status: 302, location: '/en/' })
    expect(await ask('/', { 'CF-IPCountry': 'hu' })).toMatchObject({ location: '/hu/' })
    // No country, an unknown one, Tor, or something that is not a country code: English.
    for (const value of [undefined, 'XX', 'T1', 'HUN', '', 'H', '<script>', 'hu; nl']) {
      expect(await ask('/', value === undefined ? {} : { 'CF-IPCountry': value }), String(value)).toMatchObject({ status: 302, location: '/en/' })
    }
  })

  it('answers privately: nothing may keep the redirect or show it to another visitor', async () => {
    await start({ COUNTRY_HEADER: 'CF-IPCountry' })
    const answer = await ask('/', { 'CF-IPCountry': 'HU' })
    expect(answer.cache).toBe('private, no-store')
    expect(answer.vary).toBe('Cookie')
  })

  it('lets a saved choice win over the country, and ignores a cookie that is not a language', async () => {
    await start({ COUNTRY_HEADER: 'CF-IPCountry' })
    expect(await ask('/', { 'CF-IPCountry': 'HU', Cookie: 'cc_lang=nl' })).toMatchObject({ location: '/nl/' })
    expect(await ask('/', { 'CF-IPCountry': 'NL', Cookie: 'theme=dark; cc_lang=en' })).toMatchObject({ location: '/en/' })
    expect(await ask('/', { 'CF-IPCountry': 'NL', Cookie: 'cc_lang=fr' })).toMatchObject({ location: '/nl/' })
    expect(await ask('/', { 'CF-IPCountry': 'HU', Cookie: 'cc_lang=' })).toMatchObject({ location: '/hu/' })
  })

  it('never touches a language the visitor chose in the address, a file, the API, the administration or a crawler', async () => {
    await start({ COUNTRY_HEADER: 'CF-IPCountry' })
    const hu = { 'CF-IPCountry': 'HU' }
    expect(await ask('/en/', hu)).toMatchObject({ status: 200 })
    expect(await ask('/nl/services/', hu)).toMatchObject({ status: 200, text: expect.stringContaining('nl services') })
    expect(await ask('/robots.txt', hu)).toMatchObject({ status: 200 })
    expect((await ask('/api/health', hu)).status).toBe(200)
    expect((await ask('/admin', hu)).location).toBeNull()
    expect(await ask('/', { ...hu, 'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })).toMatchObject({ status: 200, text: expect.stringContaining('root') })
    expect((await ask('/', { ...hu, 'User-Agent': 'facebookexternalhit/1.1' })).status).toBe(200)
    // A person's browser is redirected.
    expect((await ask('/', { ...hu, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130' })).status).toBe(302)
  })

  it('sends a page typed without its language to its directory in the visitor\'s language, keeping the query', async () => {
    await start({ COUNTRY_HEADER: 'CF-IPCountry' })
    expect(await ask('/services', { 'CF-IPCountry': 'HU' })).toMatchObject({ status: 302, location: '/hu/services/' })
    expect(await ask('/services/?package=grow', { 'CF-IPCountry': 'NL' })).toMatchObject({ location: '/nl/services/?package=grow' })
    expect((await ask('/services', { 'CF-IPCountry': 'HU' }, 'HEAD')).status).toBe(302)
  })

  it('only decides for a GET or a HEAD, and does nothing at all unless the operator named the header', async () => {
    await start({ COUNTRY_HEADER: 'CF-IPCountry' })
    expect((await ask('/', { 'CF-IPCountry': 'HU' }, 'POST')).status).toBe(405)
    await server!.close()
    await start()
    const plain = await ask('/', { 'CF-IPCountry': 'HU' })
    expect(plain).toMatchObject({ status: 200, location: null, text: expect.stringContaining('root') })
  })

  it('reads the country only from the header the operator named', async () => {
    await start({ COUNTRY_HEADER: 'X-Visitor-Country' })
    expect(await ask('/', { 'CF-IPCountry': 'HU' })).toMatchObject({ location: '/en/' })
    expect(await ask('/', { 'X-Visitor-Country': 'HU' })).toMatchObject({ location: '/hu/' })
  })

  it('refuses a setting that is not a header name', () => {
    const base = { APP_ENV: 'test', DATABASE_PATH: ':memory:', EMAIL_PROVIDER: 'none' }
    expect(loadConfig({ ...base, COUNTRY_HEADER: 'CF-IPCountry' }).countryHeader).toBe('CF-IPCountry')
    expect(loadConfig(base).countryHeader).toBeNull()
    for (const value of ['has space', 'a:b', 'x\r\nSet-Cookie: a=b', '-lead']) expect(() => loadConfig({ ...base, COUNTRY_HEADER: value }), value).toThrow(/COUNTRY_HEADER/)
  })

  it('has small rules of its own that read as the website\'s', () => {
    expect(languageOfCountry('HU')).toBe('hu')
    expect(languageOfCountry(' nl ')).toBe('nl')
    expect(languageOfCountry(undefined)).toBe('en')
    expect(savedLanguage('a=b; cc_lang=hu')).toBe('hu')
    expect(savedLanguage('cc_lang=xx')).toBeNull()
    expect(namesNoLanguage('/')).toBe(true)
    expect(namesNoLanguage('/hu/')).toBe(false)
    expect(namesNoLanguage('/favicon.svg')).toBe(false)
    expect(namesNoLanguage('/media/abcd.png')).toBe(false)
    expect(languageRedirect({ countryHeader: null, method: 'GET', pathname: '/', search: '', headers: {} })).toBeNull()
  })
})

describe('the same decision as the edge Worker\'s, for every combination', () => {
  it('redirects, or passes, exactly where worker/routing.ts does', async () => {
    const worker = await import(/* @vite-ignore */ pathToFileURL(join(import.meta.dirname, '..', '..', 'worker', 'routing.ts')).href)
    const paths = ['/', '/services', '/services/', '/services/packages/grow', '/hu/', '/en/services/', '/nl', '/hu', '/admin', '/admin/x', '/api/health', '/assets/a.js', '/projects/a.png', '/og/x.png', '/robots.txt', '/favicon.svg', '/.well-known/x', '/media/a.png', '/Services', '/work/spendly']
    const countries = [undefined, 'HU', 'NL', 'DE', 'XX', 'T1', 'hu', 'HUN', '']
    const cookies = [undefined, 'cc_lang=hu', 'cc_lang=nl', 'cc_lang=en', 'cc_lang=zz', 'other=1']
    const agents = [undefined, 'Mozilla/5.0 Chrome/130', 'Googlebot/2.1', 'facebookexternalhit/1.1', 'WhatsApp/2.23']
    const methods = ['GET', 'HEAD', 'POST']
    let compared = 0
    const mismatches: string[] = []
    for (const path of paths) {
      for (const country of countries) {
        for (const cookie of cookies) {
          for (const agent of agents) {
            for (const method of methods) {
              const headers: Record<string, string> = {}
              if (country !== undefined) headers['x-simulate-country'] = country
              if (cookie !== undefined) headers.cookie = cookie
              if (agent !== undefined) headers['user-agent'] = agent
              const decision = worker.decide(new Request(`https://site.test${path}?q=1`, { method: method === 'POST' ? 'POST' : method, headers, body: method === 'POST' ? 'x' : undefined }), { SIMULATE_COUNTRY: '1' })
              const mine = languageRedirect({ countryHeader: 'x-simulate-country', method, pathname: path, search: '?q=1', headers: Object.fromEntries(Object.entries(headers)) })
              const expected = decision.kind === 'redirect' ? decision.location : null
              const got = mine ? mine.headers.Location : null
              compared += 1
              if (expected !== got) mismatches.push(`${method} ${path} country=${country} cookie=${cookie} agent=${agent}: worker ${expected} / server ${got}`)
            }
          }
        }
      }
    }
    expect(mismatches.slice(0, 5)).toEqual([])
    expect(compared).toBeGreaterThan(15000)
  })
})
