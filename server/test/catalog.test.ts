import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { contact, quote, startServer, type TestServer } from './helpers.ts'

let server: TestServer
beforeEach(async () => {
  server = await startServer()
})
afterEach(async () => {
  await server.close()
})

describe('the public catalogue', () => {
  it('lists the services, localised, in the website\'s order', async () => {
    const hu = await server.api('/api/services')
    expect(hu.status).toBe(200)
    expect(hu.json.data.map((s: { slug: string }) => s.slug)).toEqual(['website', 'webapp', 'ui', 'integrations'])
    expect(hu.json.data[0]).toMatchObject({ slug: 'website', category: 'web', title: 'Weboldalfejlesztés', packages: expect.any(Array) })
    const nl = await server.api('/api/services?lang=nl')
    expect(nl.json.data[0].title).toBe('Website-ontwikkeling')
    expect(nl.json.data[0].features.length).toBeGreaterThan(2)
  })

  it('gives every translation with lang=all, and falls back to Hungarian for a missing one', async () => {
    const all = await server.api('/api/services/website?lang=all')
    expect(Object.keys(all.json.data.translations).sort()).toEqual(['en', 'hu', 'nl'])
    server.db.run("DELETE FROM service_translations WHERE service_id = (SELECT id FROM services WHERE slug = 'ui') AND language = 'nl'")
    const nl = await server.api('/api/services/ui?lang=nl')
    expect(nl.json.data.title).toBe((await server.api('/api/services/ui?lang=hu')).json.data.title)
  })

  it('refuses an unknown language and says a missing service is missing', async () => {
    const bad = await server.api('/api/services?lang=de')
    expect(bad.status).toBe(422)
    expect(bad.json.error.details.fields.lang).toBe('invalid')
    const missing = await server.api('/api/services/blog')
    expect(missing.status).toBe(404)
    expect(missing.json.error.code).toBe('not_found')
    expect((await server.api('/api/packages/platinum')).status).toBe(404)
  })

  it('lists the packages with their price in the shape the website understands, and their needs and add-ons', async () => {
    const packages = (await server.api('/api/packages?lang=en')).json.data
    expect(packages.map((p: { code: string }) => p.code)).toEqual(['launch', 'grow', 'build', 'care'])
    expect(packages[0]).toMatchObject({ code: 'launch', name: 'Launch', price: { kind: 'quote' }, vat: 'unspecified', quoteRequired: true, needs: ['website'], extras: expect.arrayContaining(['pages']) })
    expect(packages[0].includes.length).toBeGreaterThan(2)
    expect((await server.api('/api/packages/grow')).json.data.code).toBe('grow')
    expect((await server.api('/api/shop/packages')).json.data).toHaveLength(4)
  })

  it('lists the add-ons with the needs they apply to, the categories and the FAQ', async () => {
    const extras = (await server.api('/api/shop/extras?lang=en')).json.data
    expect(extras).toHaveLength(8)
    expect(extras.find((e: { code: string }) => e.code === 'pages')).toMatchObject({ appliesTo: ['improve', 'website'], name: 'Additional pages', price: { kind: 'quote' } })
    expect((await server.api('/api/shop/categories')).json.data).toEqual([
      { slug: 'web', services: ['website', 'webapp'] },
      { slug: 'design', services: ['ui'] },
      { slug: 'integration', services: ['integrations'] },
    ])
    const faq = (await server.api('/api/content/faq?lang=en')).json.data
    expect(faq).toHaveLength(6)
    expect(faq[0]).toMatchObject({ slug: 'start', question: 'How does a project start?' })
    expect(faq[0].answer.length).toBeGreaterThan(40)
    expect((await server.api('/api/shop/services')).json.data).toHaveLength(4)
  })

  it('answers the whole catalogue in one request, with a version that changes exactly when something visible does', async () => {
    const first = await server.api('/api/shop/catalog')
    expect(first.json.data.version).toMatch(/^[0-9a-f]{16}$/)
    expect(first.json.data.services).toHaveLength(4)
    expect(first.json.data.packages[0].translations.hu.name).toBe('Launch')
    const again = await server.api('/api/shop/catalog')
    expect(again.json.data.version).toBe(first.json.data.version)
    server.db.run("UPDATE packages SET featured = 1 WHERE code = 'grow'")
    expect((await server.api('/api/shop/catalog')).json.data.version).not.toBe(first.json.data.version)
  })

  it('answers a conditional request with 304, and says how long it may be cached', async () => {
    const first = await server.api('/api/shop/catalog')
    const etag = first.headers.get('etag')!
    expect(etag).toMatch(/^"[0-9a-f]{24}"$/)
    expect(first.headers.get('cache-control')).toBe('public, max-age=60')
    const cached = await server.api('/api/shop/catalog', { headers: { 'If-None-Match': etag } })
    expect(cached.status).toBe(304)
    expect(cached.text).toBe('')
  })

  it('shows only what is active, and a price only when one is published', async () => {
    server.db.run("UPDATE packages SET status = 'disabled' WHERE code = 'care'")
    server.db.run("UPDATE extras SET status = 'disabled' WHERE code = 'care'")
    server.db.run("UPDATE services SET status = 'disabled' WHERE slug = 'ui'")
    expect((await server.api('/api/packages')).json.data.map((p: { code: string }) => p.code)).toEqual(['launch', 'grow', 'build'])
    expect((await server.api('/api/shop/extras')).json.data.map((e: { code: string }) => e.code)).not.toContain('care')
    expect((await server.api('/api/services')).json.data.map((s: { slug: string }) => s.slug)).not.toContain('ui')
    expect((await server.api('/api/services/ui')).status).toBe(404)
    server.db.run("UPDATE packages SET price_kind = 'from', price_amount = 900, price_currency = 'HUF', vat_mode = 'included' WHERE code = 'launch'")
    expect((await server.api('/api/packages/launch')).json.data).toMatchObject({ price: { kind: 'from', amount: 900, currency: 'HUF' }, vat: 'included' })
  })

  it('holds no customer data, whatever has been sent to the site', async () => {
    await server.api('/api/contact', { body: contact({ email: 'private.person@example.com', name: 'Private Person' }) })
    await server.api('/api/quote-requests', { body: quote({ email: 'private.person@example.com', name: 'Private Person' }) })
    for (const path of ['/api/services', '/api/packages', '/api/shop/extras', '/api/shop/catalog', '/api/content/faq', '/api/shop/categories', '/api/ready']) {
      const text = (await server.api(path)).text
      expect(text, path).not.toMatch(/private\.person|Private Person|bakery/i)
    }
  })
})
