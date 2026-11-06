import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCatalogSeed } from './catalogExport'

/**
 * The live catalogue: what the administrator edited reaches the website's own lists at run time, with the build-time overlay's
 * rules, and the website with no answer is exactly the website it was.
 */

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

/** The catalogue the backend serves, with a package's price and text and a service's overview edited. */
function edited() {
  const seed = buildCatalogSeed() as unknown as { services: Record<string, any>[]; packages: Record<string, any>[]; extras: Record<string, any>[]; faq: Record<string, any>[] }
  const catalog = structuredClone({ ...seed, faq: seed.faq.map((item) => ({ slug: item.slug, translations: Object.fromEntries(['hu', 'en', 'nl'].map((l) => [l, { question: item.translations[l].title, answer: item.translations[l].description }])) })) })
  const launch = catalog.packages.find((pack) => pack.code === 'launch')!
  Object.assign(launch, { price: { kind: 'from', amount: 1200, currency: 'EUR' }, vat: 'excluded' })
  for (const l of ['hu', 'en', 'nl']) {
    launch.translations[l].tagline = `Edited tagline ${l}`
    catalog.services.find((service) => service.slug === 'website')!.translations[l].overview = `Edited overview ${l}`
  }
  return catalog
}

describe('the live catalogue', () => {
  it('lays the owner\'s edits over the website\'s own lists in place, and says whether anything changed', async () => {
    vi.resetModules()
    const live = await import('./liveCatalog')
    const { packages } = await import('./packages')
    const { serviceDetails } = await import('./services/detail')
    const same = packages // the very array the pages read
    expect(live.applyLiveCatalog(buildCatalogSeed())).toBe(false)
    expect(live.applyLiveCatalog(edited())).toBe(true)
    expect(packages).toBe(same)
    expect(packages.find((pack) => pack.id === 'launch')).toMatchObject({ price: { kind: 'from', amount: 1200, currency: 'EUR' }, vat: 'excluded', tagline: { en: 'Edited tagline en' } })
    expect(serviceDetails.find((detail) => detail.id === 'website')?.overview.hu).toBe('Edited overview hu')
    // A catalogue that says nothing leaves the website's own wording: nothing is invented, nothing lost.
    live.applyLiveCatalog(null)
    expect(packages.find((pack) => pack.id === 'launch')?.price).toEqual({ kind: 'quote' })
  })

  it('is settled at once with no backend, and reads the backend\'s answer when there is one, with no page held back for ever', async () => {
    vi.resetModules()
    const offline = await import('./liveCatalog')
    await offline.catalogReady()
    expect(() => offline.useCatalogGate).not.toThrow()

    vi.resetModules()
    vi.stubEnv('VITE_API_URL', '/')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: edited() }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
    const online = await import('./liveCatalog')
    const { packages } = await import('./packages')
    await online.catalogReady()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(packages.find((pack) => pack.id === 'launch')?.price).toEqual({ kind: 'from', amount: 1200, currency: 'EUR' })

    // A backend that never answers does not hold a page: the wait is bounded.
    vi.resetModules()
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)))
    const slow = await import('./liveCatalog')
    const ready = slow.catalogReady()
    vi.advanceTimersByTime(1600)
    await expect(ready).resolves.toBeUndefined()
    vi.useRealTimers()
  })
})
