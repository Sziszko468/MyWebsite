import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

/**
 * The page frame's structure, read from the sources. A page that is a lazy chunk must never be given a
 * Suspense boundary of its own inside the keyed wrapper: a navigation would then mount a new boundary
 * whose fallback replaces the page on screen (a blank content area, found in the browser run), where one
 * boundary that stays mounted lets the router's transition keep the current page until the next can be drawn.
 */
describe('the page frame', () => {
  const layout = read('../routes/LanguageLayout.tsx')
  const app = read('../App.tsx')

  it('has one Suspense boundary for all the lazy pages, outside the wrapper that is keyed by the page', () => {
    expect(layout.match(/<Suspense\b/g)).toHaveLength(1)
    expect(layout.indexOf('<Suspense')).toBeLessThan(layout.indexOf('<PageTransition'))
    expect(layout.indexOf('</PageTransition>')).toBeLessThan(layout.indexOf('</Suspense>'))
  })

  it('gives the route elements no Suspense of their own', () => {
    expect(app).not.toMatch(/<Suspense\b/)
    expect(app).not.toMatch(/import \{[^}]*\bSuspense\b/)
  })

  it('navigates in a React transition (the router’s default), which is what keeps the page on screen', () => {
    expect(app).not.toMatch(/useTransitions=\{?\s*false/)
  })

  it('shows the shop’s placeholder for the shop and the cart, and a plain one elsewhere, for a visit that starts on a page', () => {
    expect(layout).toMatch(/scope === 'shop' \|\| scope === 'checkout' \? <ShopFallback \/> : <PageFallback \/>/)
  })
})
