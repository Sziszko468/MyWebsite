import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { consentActions } from '../analytics/consent'
import type { AnalyticsEvent } from '../analytics/events'
import { clearProviders, publicPage, registerProvider, track } from '../analytics/tracker'
import { LANGUAGES } from '../i18n/config'
import { findPage, isPrivatePage, resolvePage } from '../routes/pages'
import { buildHead, type SeoContext } from '../seo/head'
import { BODY_MARKER, HEAD_MARKER } from '../seo/html'
import { buildSiteFiles } from '../seo/entry'
import { buildRobots } from '../seo/sitemap'

/**
 * PROMPT 24.1: what a search engine is told about the consultation booking. The public page (`/<lang>/consultation/`) is indexable by definition and the
 * backend takes that away while booking is closed (server/test/bookingSeo.test.ts); the customer's own page (`/<lang>/consultation/booking/<secret>`) is
 * never indexable, never listed and never carries its secret anywhere but its own address. These tests pin the part that lives in the website's code:
 * the head, the built files, the sitemap and the measurement path.
 */

const SITE = 'https://example.test'
const LIVE: SeoContext = { siteUrl: SITE, brandName: 'Test Brand', brandIsSet: true, profiles: [] }
const UNSET: SeoContext = { siteUrl: null, brandName: 'Your Name', brandIsSet: false, profiles: [] }
const SECRET = 'Zx9_-Zx9_-Zx9_-Zx9_-Zx9_-Zx9_-Zx9_-abc'

const template = `<!doctype html><html lang="hu"><head><meta charset="UTF-8" />${HEAD_MARKER}</head><body><div id="root"></div>${BODY_MARKER}</body></html>`
const built = buildSiteFiles(template, { scriptHashes: [], styleHashes: [] }, LIVE, null)
const consultation = findPage('/consultation')!
const customer = findPage('/consultation/booking')!

describe('the public consultation page', () => {
  it('is indexable in every language, with its own canonical address, language alternates and x-default', () => {
    expect(consultation.indexable).toBe(true)
    for (const lang of LANGUAGES) {
      const head = buildHead(consultation, lang, LIVE)
      expect(head.indexable, lang).toBe(true)
      expect(head.robots, lang).toMatch(/^index, follow/)
      expect(head.canonical, lang).toBe(`${SITE}/${lang}/consultation/`)
      expect(head.alternates.map((a) => `${a.hreflang} ${a.href}`).sort(), lang).toEqual(
        ['hu', 'en', 'nl'].map((code) => `${code} ${SITE}/${code}/consultation/`).concat(`x-default ${SITE}/en/consultation/`).sort(),
      )
      expect(head.lang).toBe(lang)
    }
  })

  it('has a title and a description of its own in each language, in the file the build writes', () => {
    const titles = new Set<string>()
    const descriptions = new Set<string>()
    for (const lang of LANGUAGES) {
      const head = buildHead(consultation, lang, LIVE)
      titles.add(head.title)
      descriptions.add(head.description)
      const file = built.files[`${lang}/consultation/index.html`]
      expect(file, lang).toContain(`<html lang="${lang}"`)
      expect(file, lang).toContain(`<link rel="canonical" href="${SITE}/${lang}/consultation/" data-seo>`)
      expect(file, lang).toContain('content="index, follow')
    }
    expect(titles.size).toBe(3)
    expect(descriptions.size).toBe(3)
  })

  it('is in the sitemap the build writes, in every language, with the same alternates as its head', () => {
    const sitemap = built.files['sitemap.xml']
    for (const lang of LANGUAGES) expect(sitemap).toContain(`<loc>${SITE}/${lang}/consultation/</loc>`)
    for (const lang of LANGUAGES) expect(sitemap).toContain(`hreflang="${lang}" href="${SITE}/${lang}/consultation/"`)
  })

  it('has a head that says "do not index" and writes no canonical address, alternate or structured data for the closed state', () => {
    // The page the visitor's browser shows while booking is closed (ConsultationPage): the same page, told it is not indexable.
    for (const lang of LANGUAGES) {
      const closed = buildHead({ ...consultation, indexable: false }, lang, LIVE)
      expect(closed.indexable).toBe(false)
      expect(closed.robots).toBe('noindex, follow')
      expect(closed.canonical).toBeNull()
      expect(closed.alternates).toEqual([])
      expect(closed.jsonLd).toEqual([])
      expect(JSON.stringify(closed.tags)).not.toContain('"rel":"canonical"')
    }
  })

  it('is kept out of every index while the site address is not configured', () => {
    for (const lang of LANGUAGES) {
      const head = buildHead(consultation, lang, UNSET)
      expect(head.robots).toBe('noindex, nofollow')
      expect(head.canonical).toBeNull()
      expect(head.alternates).toEqual([])
    }
    const unset = buildSiteFiles(template, { scriptHashes: [], styleHashes: [] }, UNSET, null)
    expect(unset.files['sitemap.xml']).toBeUndefined()
  })

  it('is not hidden from crawlers by robots.txt, which would stop them from reading its noindex', () => {
    expect(buildRobots(SITE)).not.toMatch(/Disallow/i)
    expect(buildRobots(null)).not.toMatch(/Disallow/i)
  })
})

describe("a customer's private booking page", () => {
  it('is a private page, never indexable, whatever the secret is', () => {
    expect(customer.indexable).toBe(false)
    expect(isPrivatePage(customer)).toBe(true)
    expect(isPrivatePage(consultation)).toBe(false)
    expect(resolvePage(`/consultation/booking/${SECRET}`)).toBe(customer)
  })

  it('says "noindex, nofollow", with no canonical address, alternates or structured data, in every language', () => {
    for (const lang of LANGUAGES) {
      const head = buildHead(customer, lang, LIVE)
      expect(head.indexable, lang).toBe(false)
      expect(head.robots, lang).toBe('noindex, nofollow')
      expect(head.canonical, lang).toBeNull()
      expect(head.alternates, lang).toEqual([])
      expect(head.jsonLd, lang).toEqual([])
    }
  })

  it('is written by the build as a noindex shell, and is in no sitemap', () => {
    for (const lang of LANGUAGES) {
      const file = built.files[`${lang}/consultation/booking/index.html`]
      expect(file, lang).toContain('content="noindex, nofollow"')
      // No canonical address and no language alternates in the head (the no-script language links are ordinary links in the body).
      expect(file, lang).not.toContain('rel="canonical"')
      expect(file, lang).not.toContain('rel="alternate"')
      expect(file, lang).not.toContain('application/ld+json')
    }
    expect(built.files['sitemap.xml']).not.toContain('/consultation/booking')
  })

  it('has a title and a description that cannot hold the secret', () => {
    for (const lang of LANGUAGES) {
      const head = buildHead(customer, lang, LIVE)
      // Nothing long and random-looking, and nothing that reads the address: the head is built from the page's registered path and the language only.
      expect(head.title).not.toMatch(/[A-Za-z0-9_-]{30,}/)
      expect(head.description).not.toMatch(/[A-Za-z0-9_-]{30,}/)
      expect(JSON.stringify(head.tags)).not.toContain(SECRET)
    }
    for (const file of ['src/routes/documentMeta.ts', 'src/seo/head.ts', 'src/seo/apply.ts']) {
      expect(readFileSync(join(process.cwd(), file), 'utf8'), file).not.toMatch(/\blocation\b|\bdocument\.referrer\b/)
    }
  })
})

describe("the secret in a booking's address and measurement", () => {
  const events: AnalyticsEvent[] = []
  beforeEach(() => {
    events.length = 0
    clearProviders()
    registerProvider({ id: 'test', send: (event) => events.push(event) })
    consentActions.reset()
    consentActions.grant()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    clearProviders()
    consentActions.reset()
  })

  it('never reaches an analytics event, whichever language and whichever event is sent from the private page', () => {
    for (const lang of LANGUAGES) {
      vi.stubGlobal('window', { location: { pathname: `/${lang}/consultation/booking/${SECRET}` } })
      track('booking_cancel_requested', {})
      track('booking_reschedule_requested', {})
    }
    expect(events).toHaveLength(6)
    for (const event of events) {
      expect(event.page).toBe('/consultation/booking')
      expect(JSON.stringify(event)).not.toContain(SECRET)
    }
  })

  it("strips a quote's or request's secret the same way, and leaves the public page's path alone", () => {
    expect(publicPage(`/quote/${SECRET}`)).toBe('/quote')
    expect(publicPage(`/request/${SECRET}`)).toBe('/request')
    expect(publicPage('/consultation/')).toBe('/consultation/')
    expect(publicPage(`/consultation/booking/${SECRET}/`)).toBe('/consultation/booking/')
  })

  it('has an analytics path that reads the address from nowhere but the page path it strips', () => {
    // The tracker is the one place that reads the address, and it reads the pathname only (never the query, the hash, the full address or the referrer).
    const source = readFileSync(join(process.cwd(), 'src/analytics/tracker.ts'), 'utf8')
    expect(source).not.toMatch(/location\.(href|search|hash)|document\.referrer|document\.title/)
    expect(source).toContain('publicPage(rest)')
  })
})
