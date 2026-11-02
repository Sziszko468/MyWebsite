import { describe, expect, it } from 'vitest'
import { PAGES } from '../routes/pages'
import { rawToken } from '../test/tokens'
import { MOTION, MOTION_SCOPES, distanceAt, scopeOfPage, staggerDelay } from './config'

const ms = (value: string | undefined) => Number.parseFloat(value ?? 'NaN')

describe('the motion identity', () => {
  it('has one set of numbers: config.ts equals the CSS tokens', () => {
    for (const [name, value] of Object.entries(MOTION.duration)) {
      expect(ms(rawToken(`--dur-${name}`)), `--dur-${name}`).toBe(value)
    }
    const easing = { standard: '--ease-out', inOut: '--ease-in-out', accelerate: '--ease-accelerate', racing: '--ease-racing', elastic: '--ease-elastic' } as const
    for (const [name, token] of Object.entries(easing)) {
      expect(rawToken(token), token).toBe(MOTION.easing[name as keyof typeof MOTION.easing])
    }
    for (const [name, value] of Object.entries(MOTION.distance)) {
      expect(ms(rawToken(`--motion-distance-${name}`)), `--motion-distance-${name}`).toBe(value)
    }
    expect(ms(rawToken('--motion-stagger'))).toBe(MOTION.stagger.step)
    expect(ms(rawToken('--motion-intensity'))).toBe(1)
    expect(ms(rawToken('--motion-time'))).toBe(MOTION.scope.site.time)
  })

  it('gives every scope the same intensity in the stylesheet as in the config', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
    for (const scope of MOTION_SCOPES) {
      if (scope === 'site') continue
      const block = new RegExp(`\\[data-motion-scope='${scope}'\\]\\s*\\{([^}]*)\\}`).exec(css)
      expect(block, `a block for ${scope}`).not.toBeNull()
      const intensity = /--motion-intensity:\s*([\d.]+)/.exec(block![1])?.[1]
      expect(Number(intensity), scope).toBe(MOTION.scope[scope].intensity)
      expect(Number(/--motion-time:\s*([\d.]+)/.exec(block![1])?.[1]), scope).toBe(MOTION.scope[scope].time)
    }
  })

  it('takes all the distance out of motion under reduced motion, whatever the scope', async () => {
    const { readFileSync } = await import('node:fs')
    const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8')
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)![1]
    expect(reduced).toMatch(/:root,\s*\[data-motion-scope\]/)
    expect(reduced).toMatch(/--motion-intensity:\s*0;/)
    expect(reduced).toMatch(/--motion-parallax:\s*0;/)
    for (const name of ['instant', 'fast', 'base', 'slow', 'scene', 'theme']) expect(reduced).toMatch(new RegExp(`--dur-${name}:\\s*0\\.01ms`))
    // The reduced block comes after every scope, so it wins on the same selectors.
    expect(css.indexOf("[data-motion-scope='lab']")).toBeLessThan(css.indexOf('prefers-reduced-motion: reduce'))
  })

  it('keeps the curves valid and the durations in order', () => {
    for (const curve of Object.values(MOTION.easing)) expect(curve).toMatch(/^cubic-bezier\(-?[\d.]+, -?[\d.]+, -?[\d.]+, -?[\d.]+\)$/)
    const { instant, fast, base, slow, scene } = MOTION.duration
    expect([instant, fast, base, slow, scene]).toEqual([...[instant, fast, base, slow, scene]].sort((a, b) => a - b))
    expect(MOTION.reduced.intensity).toBe(0)
    expect(MOTION.touch.parallax).toBeLessThan(1)
  })

  it('makes the shop and the checkout quicker and quieter than the portfolio, and the Lab bolder', () => {
    const { site, portfolio, shop, checkout, lab } = MOTION.scope
    expect(checkout.intensity).toBeLessThan(shop.intensity)
    expect(shop.intensity).toBeLessThan(portfolio.intensity)
    expect(portfolio.intensity).toBeLessThanOrEqual(site.intensity)
    expect(lab.intensity).toBeGreaterThan(portfolio.intensity)
    expect(shop.enter.duration).toBeLessThanOrEqual(MOTION.duration.base)
    expect(checkout.enter.duration).toBeLessThanOrEqual(shop.enter.duration)
    expect(lab.time).toBeGreaterThan(site.time)
    expect(shop.time).toBeLessThan(site.time)
    expect(checkout.time).toBeLessThan(shop.time)
    expect(lab.enter.kind).toBe('wipe')
    for (const scope of [site, portfolio, shop, checkout]) expect(scope.enter.kind).toBe('fade')
  })
})

describe('which scope a page has', () => {
  it('puts every registered page in one', () => {
    const scopes = new Set(PAGES.map((page) => scopeOfPage(page.id)))
    for (const scope of scopes) expect(MOTION_SCOPES).toContain(scope)
  })

  it('treats the Lab as experimental, the cart and the builder as plain, the shop as quick and the portfolio as refined', () => {
    expect(scopeOfPage('lab')).toBe('lab')
    expect(scopeOfPage('lab-particle-universe')).toBe('lab')
    expect(scopeOfPage('configure')).toBe('checkout')
    expect(scopeOfPage('cart')).toBe('checkout')
    expect(scopeOfPage('services')).toBe('shop')
    expect(scopeOfPage('service-webapp')).toBe('shop')
    for (const id of ['work', 'about', 'contact', 'project-spendly'] as const) expect(scopeOfPage(id)).toBe('portfolio')
    expect(scopeOfPage('home')).toBe('site')
    expect(scopeOfPage(undefined)).toBe('site')
  })
})

describe('staggering and distance', () => {
  it('delays the n-th sibling by a step, never beyond the cap, never below zero', () => {
    expect(staggerDelay(0)).toBe(0)
    expect(staggerDelay(1)).toBe(MOTION.stagger.step)
    expect(staggerDelay(3)).toBe(3 * MOTION.stagger.step)
    expect(staggerDelay(500)).toBe(MOTION.stagger.max)
    expect(staggerDelay(-2)).toBe(0)
    expect(staggerDelay(2.9)).toBe(2 * MOTION.stagger.step)
  })

  it('scales a distance by the scope’s intensity, and to nothing when it is reduced', () => {
    expect(distanceAt('md', 1)).toBe(16)
    expect(distanceAt('md', 0.5)).toBe(8)
    expect(distanceAt('lg', MOTION.reduced.intensity)).toBe(0)
    expect(distanceAt('sm', -3)).toBe(0)
  })
})
