import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { makeKit, type Kit } from './bookingKit.ts'

/**
 * PROMPT 24.1: what the backend tells a search engine about the consultation booking, in both states. The build wrote the public page as indexable (it cannot
 * know whether the owner has opened booking) and listed it in its sitemap; the backend, which does know, takes both away while booking is closed. The
 * customer's own page is the same quiet shell for every secret, never cached, never indexed, never carrying its address to another site.
 */

const LANGS = ['hu', 'en', 'nl'] as const
const SITE = 'https://site.test'

/** What the build leaves in the folder the backend serves: the pages, and the sitemap that lists the consultation page. */
function staticSite(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cc-site-241-'))
  for (const lang of LANGS) {
    mkdirSync(join(dir, lang, 'consultation', 'booking'), { recursive: true })
    writeFileSync(join(dir, lang, 'consultation', 'index.html'), `<!doctype html><title>Consultation ${lang}</title>`)
    writeFileSync(join(dir, lang, 'consultation', 'booking', 'index.html'), `<!doctype html><title>Booking shell ${lang}</title>`)
  }
  writeFileSync(join(dir, '404.html'), '<!doctype html><title>Not found</title>')
  const alternates = (path: string) => [...LANGS.map((lang) => `    <xhtml:link rel="alternate" hreflang="${lang}" href="${SITE}/${lang}${path}"/>`), `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/en${path}"/>`].join('\n')
  const entry = (lang: string, path: string) => `  <url>\n    <loc>${SITE}/${lang}${path}</loc>\n${alternates(path)}\n  </url>`
  writeFileSync(
    join(dir, 'sitemap.xml'),
    ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">', ...LANGS.map((lang) => entry(lang, '/')), ...LANGS.map((lang) => entry(lang, '/consultation/')), '</urlset>', ''].join('\n'),
  )
  return dir
}

let kit: Kit
afterEach(async () => {
  await kit?.close()
})

const start = (options: { open?: boolean } = {}) => makeKit({ open: options.open, env: { STATIC_DIR: staticSite(), MEDIA_DIR: mkdtempSync(join(tmpdir(), 'cc-media-241-')) } })
const page = (lang: string) => kit.server.fetch(`/${lang}/consultation/`)
const sitemap = async () => (await kit.server.fetch('/sitemap.xml')).text()

describe('the public consultation page while booking is closed', () => {
  it('is told "noindex" in every language and is not in the sitemap', async () => {
    kit = await start({ open: false })
    for (const lang of LANGS) {
      const response = await page(lang)
      expect(response.status, lang).toBe(200)
      expect(response.headers.get('x-robots-tag'), lang).toBe('noindex')
    }
    const map = await sitemap()
    expect(map).not.toContain('/consultation/')
    // The rest of the sitemap is passed on as the build wrote it.
    for (const lang of LANGS) expect(map).toContain(`<loc>${SITE}/${lang}/</loc>`)
  })

  it('offers nothing to book: no types, no zone, no hours, and the server says so', async () => {
    kit = await start({ open: false })
    for (const lang of LANGS) {
      const config = (await kit.api(`/api/consultations/config?lang=${lang}`)).json.data
      expect(config).toMatchObject({ open: false, timeZone: null, types: [] })
    }
    const refused = await kit.book()
    expect(refused.status).toBe(409)
    expect(refused.json.error.details.reason).toBe('closed')
    expect((await kit.api('/api/consultations/types/discovery/days?from=2026-11-04&to=2026-11-30')).status).not.toBe(200)
  })

  it('stays out of the index when the owner has configured everything except the switch', async () => {
    kit = await start()
    await kit.settings({ enabled: false })
    for (const lang of LANGS) expect((await page(lang)).headers.get('x-robots-tag'), lang).toBe('noindex')
    expect(await sitemap()).not.toContain('/consultation/')
  })
})

describe('the public consultation page once the owner has opened booking', () => {
  it('is indexable (no header against it) and listed in every language, with the alternates the build wrote', async () => {
    kit = await start()
    for (const lang of LANGS) {
      const response = await page(lang)
      expect(response.status, lang).toBe(200)
      expect(response.headers.get('x-robots-tag'), lang).toBeNull()
    }
    const map = await sitemap()
    for (const lang of LANGS) {
      expect(map).toContain(`<loc>${SITE}/${lang}/consultation/</loc>`)
      expect(map).toContain(`hreflang="${lang}" href="${SITE}/${lang}/consultation/"`)
    }
    expect(map).toContain(`hreflang="x-default" href="${SITE}/en/consultation/"`)
  })

  it('follows the owner: closing booking again takes the page out of the index and the sitemap at once', async () => {
    kit = await start()
    expect((await page('hu')).headers.get('x-robots-tag')).toBeNull()
    await kit.settings({ enabled: false })
    expect((await page('hu')).headers.get('x-robots-tag')).toBe('noindex')
    expect(await sitemap()).not.toContain('/consultation/')
    await kit.settings({ enabled: true })
    expect((await page('hu')).headers.get('x-robots-tag')).toBeNull()
    expect(await sitemap()).toContain('/hu/consultation/')
  })

  it('is indexed in all three languages or in none: the page and the sitemap ask the same question', async () => {
    kit = await start()
    // One language loses its words (the owner cannot do this through the administration: a type cannot be on without all three): booking is not open in it.
    kit.server.db.run("UPDATE consultation_type_translations SET name = '' WHERE language = 'nl'")
    expect((await kit.api('/api/consultations/config?lang=nl')).json.data.open).toBe(false)
    for (const lang of LANGS) expect((await page(lang)).headers.get('x-robots-tag'), lang).toBe('noindex')
    expect(await sitemap()).not.toContain('/consultation/')
  })
})

describe("a customer's private booking page", () => {
  const unknown = 'A'.repeat(43)

  async function look(lang: string, token: string) {
    const response = await kit.server.fetch(`/${lang}/consultation/booking/${token}`)
    return { status: response.status, headers: response.headers, body: await response.text() }
  }

  for (const open of [false, true]) {
    it(`is the same quiet shell, never cached, never indexed, with no referrer, ${open ? 'while booking is open' : 'while booking is closed'}`, async () => {
      kit = await start({ open })
      for (const lang of LANGS) {
        const shell = await look(lang, unknown)
        expect(shell.status, lang).toBe(200)
        expect(shell.headers.get('cache-control'), lang).toBe('no-store')
        expect(shell.headers.get('x-robots-tag'), lang).toBe('noindex, nofollow')
        expect(shell.headers.get('referrer-policy'), lang).toBe('no-referrer')
        expect(shell.body).toContain(`Booking shell ${lang}`)
      }
      expect(await sitemap()).not.toContain('/consultation/booking')
    })
  }

  it('answers a real secret and a made-up one with exactly the same page, so the page tells nobody which secrets exist', async () => {
    kit = await start()
    const made = await kit.book()
    expect(made.status).toBe(201)
    await kit.settle()
    const email = kit.server.db.get<{ email: string }>('SELECT email FROM bookings WHERE reference = ?', [made.json.data.reference])!.email
    const token = kit.tokenOf(kit.linkIn(kit.mailTo(email).at(-1)!.text))
    for (const lang of LANGS) {
      const real = await look(lang, token)
      const fake = await look(lang, unknown)
      expect(real.status).toBe(fake.status)
      expect(real.body).toBe(fake.body)
      for (const name of ['cache-control', 'x-robots-tag', 'referrer-policy', 'content-type']) expect(real.headers.get(name), name).toBe(fake.headers.get(name))
    }
    // The server's own log names the kind of page, never the address with its secret in it, and nothing about the person.
    const logged = kit.server.logs.join('\n')
    expect(logged).not.toContain(token)
    expect(logged).not.toContain(unknown)
    expect(logged.toLowerCase()).not.toContain(email.toLowerCase())
  })

  it('is not a page at all for an address that cannot be a secret, and the sitemap never lists a customer page', async () => {
    kit = await start()
    expect((await kit.server.fetch('/hu/consultation/booking/short')).status).toBe(404)
    expect((await kit.server.fetch('/hu/consultation/booking/' + 'A'.repeat(80))).status).toBe(404)
    expect(await sitemap()).not.toMatch(/consultation\/booking|quote\/|request\//)
  })
})
