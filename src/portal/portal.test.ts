import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consentActions } from '../analytics/consent'
import type { AnalyticsEvent } from '../analytics/events'
import { clearProviders, isPortalPath, publicPage, registerProvider, track } from '../analytics/tracker'
import { portalText } from '../content/portal'
import { LANGUAGES } from '../i18n/config'
import { findPage, isPrivatePage, resolvePage } from '../routes/pages'
import { buildHead, type SeoContext } from '../seo/head'
import { BODY_MARKER, HEAD_MARKER } from '../seo/html'
import { buildSiteFiles } from '../seo/entry'
import { call, setCsrf } from './api'
import { failureText } from './text'

/**
 * PROMPT 25: what the website's code does about the client portal's privacy. The server's half (isolation, sessions, links, headers) is in
 * server/test/clientPortal*.test.ts; this pins the part that lives here: the page is private in every way a page can be, nothing on it is measured, the
 * address never carries a secret, the browser's storage is never used, and every word it can show exists in three languages.
 */

const SITE = 'https://example.test'
const LIVE: SeoContext = { siteUrl: SITE, brandName: 'Test Brand', brandIsSet: true, profiles: [] }
const template = `<!doctype html><html lang="hu"><head><meta charset="UTF-8" />${HEAD_MARKER}</head><body><div id="root"></div>${BODY_MARKER}</body></html>`
const built = buildSiteFiles(template, { scriptHashes: [], styleHashes: [] }, LIVE, null)
const portal = findPage('/client-portal')!

describe('the portal is a private page', () => {
  it('is registered once, never indexable, and every address below it is that one page', () => {
    expect(portal.id).toBe('client-portal')
    expect(portal.indexable).toBe(false)
    expect(portal.languages).toEqual([...LANGUAGES])
    expect(isPrivatePage(portal)).toBe(true)
    for (const path of ['/client-portal/', '/client-portal/verify', '/client-portal/projects', '/client-portal/projects/PRJ-7K3M9XQH', '/client-portal/requests/CC-2026-000001', '/client-portal/account']) {
      expect(resolvePage(path), path).toBe(portal)
    }
    expect(resolvePage('/client-portal-extra')).toBeUndefined()
  })

  it('says "noindex, nofollow", with no canonical address, alternates or structured data, in every language', () => {
    for (const lang of LANGUAGES) {
      const head = buildHead(portal, lang, LIVE)
      expect(head.indexable, lang).toBe(false)
      expect(head.robots, lang).toBe('noindex, nofollow')
      expect(head.canonical, lang).toBeNull()
      expect(head.alternates, lang).toEqual([])
      expect(head.jsonLd, lang).toEqual([])
    }
  })

  it('is built as a quiet shell in every language and is in no sitemap', () => {
    for (const lang of LANGUAGES) {
      const file = built.files[`${lang}/client-portal/index.html`]
      expect(file, lang).toContain('content="noindex, nofollow"')
      expect(file, lang).not.toContain('rel="canonical"')
      expect(file, lang).not.toContain('application/ld+json')
    }
    expect(built.files['sitemap.xml']).not.toContain('client-portal')
  })

  it('is served with a policy that keeps it out of every cache and every referrer, and any address below it is the same shell', () => {
    const headers = built.files['_headers']
    const redirects = built.files['_redirects']
    for (const lang of LANGUAGES) {
      expect(headers).toContain(`/${lang}/client-portal/*\n  Referrer-Policy: no-referrer\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow`)
      expect(redirects).toContain(`/${lang}/client-portal/*  /${lang}/client-portal/  200`)
    }
  })

  it('has a title and a description that hold nobody’s data', () => {
    for (const lang of LANGUAGES) {
      const head = buildHead(portal, lang, LIVE)
      expect(head.title).toBe(`${portalText.meta.title[lang]} — Test Brand`)
      expect(head.title + head.description).not.toMatch(/[A-Za-z0-9_-]{30,}|PRJ-|@/)
    }
    for (const file of ['src/routes/documentMeta.ts', 'src/seo/head.ts', 'src/seo/apply.ts']) {
      expect(readFileSync(join(process.cwd(), file), 'utf8'), file).not.toMatch(/\bdocument\.referrer\b/)
    }
  })
})

describe('nothing on the portal is measured', () => {
  let events: AnalyticsEvent[]
  beforeEach(() => {
    events = []
    clearProviders()
    registerProvider({ id: 'test', send: (event) => void events.push(event) })
    consentActions.grant()
  })
  afterEach(() => {
    clearProviders()
    vi.unstubAllGlobals()
  })

  it('collapses every portal address to the page, whatever is after it', () => {
    expect(publicPage('/client-portal/projects/PRJ-7K3M9XQH')).toBe('/client-portal')
    expect(publicPage('/client-portal/')).toBe('/client-portal')
    expect(publicPage('/client-portal')).toBe('/client-portal')
    expect(publicPage('/services')).toBe('/services')
    expect(isPortalPath('/client-portal/account')).toBe(true)
    expect(isPortalPath('/client-portal-x')).toBe(false)
  })

  it('sends no event from a portal address, even to a provider that has consent', () => {
    vi.stubGlobal('window', { location: { pathname: '/en/client-portal/projects/PRJ-7K3M9XQH' } })
    track('project_opened', { project: 'spendly' })
    expect(events).toEqual([])
    vi.stubGlobal('window', { location: { pathname: '/en/work/' } })
    track('project_opened', { project: 'spendly' })
    expect(events.length).toBeLessThanOrEqual(1)
    expect(JSON.stringify(events)).not.toContain('client-portal')
  })
})

describe('the portal’s requests', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    setCsrf(null)
  })

  function stubFetch(answer: { status?: number; body?: unknown } = {}) {
    const calls: { url: string; init: RequestInit }[] = []
    vi.stubGlobal('window', { location: { origin: 'http://localhost' } })
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify(answer.body ?? { data: {} }), { status: answer.status ?? 200, headers: { 'Content-Type': 'application/json' } })
    })
    return calls
  }

  it('is unusable without a backend on the same origin (the cookie cannot cross sites)', async () => {
    const calls = stubFetch()
    const result = await call('GET', '/api/portal/session')
    // The test build has no API address: the portal says so instead of sending anything.
    expect(result).toEqual({ ok: false, failure: { kind: 'no_backend' } })
    expect(calls).toEqual([])
  })

  it('never sends a secret in the address, never stores one, and keeps the CSRF token in memory only', () => {
    const files = readdirSync(join(process.cwd(), 'src/portal')).filter((name) => /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts'))
    expect(files).toEqual(expect.arrayContaining(['api.ts', 'session.tsx', 'usePortal.ts', 'text.ts', 'context.ts']))
    for (const file of files) {
      const text = readFileSync(join(process.cwd(), 'src/portal', file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      expect(text, file).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|document\.cookie)\b/)
    }
    const api = readFileSync(join(process.cwd(), 'src/portal/api.ts'), 'utf8')
    expect(api).toContain("credentials: 'same-origin'")
    expect(api).toContain("referrerPolicy: 'no-referrer'")
    expect(api).toContain("cache: 'no-store'")
    // A customer’s id is never sent: the server knows who is asking.
    expect(api).not.toMatch(/customerId|customer_id/)
  })
})

describe('the words', () => {
  const STATUSES = ['awaiting_start', 'discovery', 'planning', 'design', 'development', 'review', 'waiting_customer', 'finalization', 'completed', 'on_hold', 'cancelled']
  const CATEGORIES = ['website', 'webapp', 'ui', 'integrations', 'ai', 'other']
  const EVENTS = ['created', 'status_changed', 'dates_changed', 'milestone_added', 'milestone_completed', 'document_published', 'feedback_requested', 'update_posted']

  it('has a word for every status, category and kind of event in every language', () => {
    for (const lang of LANGUAGES) {
      for (const status of STATUSES) {
        expect(portalText.status[status as keyof typeof portalText.status][lang].length, `${lang} ${status}`).toBeGreaterThan(2)
        expect(portalText.statusNote[status as keyof typeof portalText.statusNote][lang].length, `${lang} ${status} note`).toBeGreaterThan(8)
      }
      for (const category of CATEGORIES) expect(portalText.categories[category as keyof typeof portalText.categories][lang].length).toBeGreaterThan(2)
      for (const event of EVENTS) expect(portalText.events[event as keyof typeof portalText.events][lang].length).toBeGreaterThan(5)
    }
    expect(Object.keys(portalText.status)).toEqual(STATUSES)
  })

  it('never says an email arrived, and promises neither a time nor a price', () => {
    const everything = JSON.stringify(portalText)
    for (const lang of LANGUAGES) {
      const text = JSON.stringify(Object.values(flatten(portalText)).map((entry) => entry[lang]))
      expect(text, lang).not.toMatch(/\b(delivered|has arrived|was delivered|megérkezett a|is aangekomen)\b/i)
      expect(text, lang).not.toMatch(/within \d|\d+ (hours|days)|€|\b(EUR|HUF)\b/)
    }
    expect(everything.length).toBeGreaterThan(5000)
  })

  it('says why a request failed in the customer’s language', () => {
    const words = {
      problems: { network: 'n', rateLimited: 'r', notFound: 'f', noBackend: 'b', refused: 'x', ended: 'e', unavailable: 'u' },
    } as unknown as Parameters<typeof failureText>[1]
    expect(failureText({ kind: 'network' }, words)).toBe('n')
    expect(failureText({ kind: 'rate_limited' }, words)).toBe('r')
    expect(failureText({ kind: 'not_found' }, words)).toBe('f')
    expect(failureText({ kind: 'unauthorized' }, words)).toBe('e')
    expect(failureText({ kind: 'expired' }, words)).toBe('u')
  })
})

/** Every {hu, en, nl} object in a tree of words. */
function flatten(value: unknown, found: Record<string, Record<string, string>> = {}, path = ''): Record<string, Record<string, string>> {
  if (typeof value !== 'object' || value === null) return found
  const entry = value as Record<string, unknown>
  if (typeof entry.hu === 'string' && typeof entry.en === 'string' && typeof entry.nl === 'string') {
    found[path] = entry as Record<string, string>
    return found
  }
  for (const [key, child] of Object.entries(entry)) flatten(child, found, `${path}.${key}`)
  return found
}
