/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SERVICE_IDS } from '../../content/services/ids'
import { findPage } from '../../routes/pages'
import { SHOP_PATHS, servicePath } from '../../shop/paths'
import { contrast, resolveColor, type ThemeName } from '../../test/tokens'
import { resolveTone } from '../Section/tone'
import { SHOP_RHYTHM, shopTone } from './rhythm'

// What the shop's pages and components say about where they link to and what they keep.
const sources = import.meta.glob(
  ['./*.tsx', './tiers/*.tsx', './experience/*.tsx', '../../pages/ServicesPage.tsx', '../../pages/PackagePage.tsx', '../../pages/FullExperiencePage.tsx', '../../pages/FullExperienceStartPage.tsx', '../../pages/ServiceDetailPage.tsx', '../../pages/ConfiguratorPage.tsx', '../../pages/CartPage.tsx', '../../shop/*.ts', '../../shop/!(*.test).ts'],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>
// Stylesheets are read from disk: the test runner hands CSS modules over as a proxy, not as text.
const STYLE_DIRS = ['src/components/shop', 'src/pages']
const styles: Record<string, string> = Object.fromEntries(
  STYLE_DIRS.flatMap((dir) =>
    readdirSync(join(process.cwd(), dir))
      .filter((name) => name.endsWith('.module.scss') && (dir.endsWith('shop') || /^(ServiceDetailPage|ShopPage)\./.test(name)))
      .map((name) => [`${dir}/${name}`, readFileSync(join(process.cwd(), dir, name), 'utf8')]),
  ),
)

const themes: ThemeName[] = ['dark', 'light']
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('the shop’s dark and light rhythm', () => {
  it.each(themes)('alternates band by band on a %s page, starting from the hero', (page) => {
    const worn = ['base' as const, ...SHOP_RHYTHM.map((section) => section.tone)].map((tone) => resolveTone(tone, page))
    // The last band is Racing Red and sits against the band above it by colour, not by theme.
    for (let i = 1; i < worn.length - 1; i++) expect(worn[i], `band ${i}`).not.toBe(worn[i - 1])
  })

  it('knows its bands by id, in order, and only those', () => {
    expect(SHOP_RHYTHM.map((section) => section.id)).toEqual(['services', 'packages', 'full-experience', 'configure', 'process', 'support', 'work', 'faq', 'start'])
    expect(shopTone('packages')).toBe('base')
    // @ts-expect-error an unknown id is a type error as well as a runtime one
    expect(() => shopTone('nowhere')).toThrow()
  })

  it('alternates band by band on a service’s page too, ending on Racing Red', () => {
    const page = sources['../../pages/ServiceDetailPage.tsx']
    const tones = [...page.matchAll(/<Section id="(\w+)" tone="(\w+)"/g)].map((match) => match[2])
    expect(tones.length).toBeGreaterThanOrEqual(9)
    for (const theme of themes) {
      const worn = ['base' as const, ...(tones as Array<'base' | 'inverse'>)].map((tone) => resolveTone(tone, theme))
      for (let i = 1; i < worn.length; i++) expect(worn[i], `${theme}: band ${i}`).not.toBe(worn[i - 1])
    }
    expect(page).toMatch(/<FinalCta[^>]*tone="dark"/)
  })
})

describe('where the shop’s links go', () => {
  it('finds the sources it is checking', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(25)
    expect(Object.keys(sources).some((file) => file.endsWith('Configurator.tsx'))).toBe(true)
  })

  it('sends every in-page link to a band that exists on that page', () => {
    const hero = sources['./ShopHero.tsx']
    expect(hero).toMatch(/href="#services"/)
    const landing = ['./Discovery.tsx', './Bands.tsx', './tiers/Tiers.tsx', './experience/FullExperienceBand.tsx', './ShopHero.tsx'].map((file) => sources[file]).join('\n')
    for (const id of ['services', 'packages', 'full-experience', 'configure', 'process', 'support', 'work', 'faq', 'find']) expect(landing, id).toContain(`id="${id}"`)
    const detail = sources['../../pages/ServiceDetailPage.tsx']
    for (const match of detail.matchAll(/<a href=\{`#\$\{(\w+)\}`\}/g)) expect(match[1]).toBe('id')
    for (const id of ['overview', 'get', 'features', 'audience', 'how', 'addons', 'work', 'faq', 'price', 'final']) expect(detail, id).toContain(`id="${id}"`)
  })

  it('sends every route link to a page that exists', () => {
    let checked = 0
    for (const [file, source] of Object.entries(sources)) {
      for (const match of source.matchAll(/\bto="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
        expect(findPage(match[1]), `${file}: ${match[0]}`).toBeDefined()
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(1)
    for (const path of Object.values(SHOP_PATHS)) expect(findPage(path), path).toBeDefined()
    for (const id of SERVICE_IDS) expect(findPage(servicePath(id)), id).toBeDefined()
  })

  it('has the home page’s package buttons open the packages with the package chosen', () => {
    const home = import.meta.glob('../home/ServicePackages.tsx', { eager: true, query: '?raw', import: 'default' }) as Record<string, string>
    const match = Object.values(home)[0].match(/to=\{`(\/[^?`#]+)\?package=\$\{pkg\.id\}#(\w+)`\}/)
    expect(match, 'the package button’s address').not.toBeNull()
    expect(findPage(match![1])?.id).toBe('services')
    expect(match![2]).toBe('packages')
  })

  it('leaves no placeholder or empty destination behind', () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/href=["'](#|)["']/)
      expect(source, file).not.toMatch(/javascript:/i)
    }
  })
})

describe('what the shop keeps', () => {
  it('writes to storage only the cart’s choices, and never an answer, a name or an address', () => {
    for (const [file, source] of Object.entries(sources)) {
      const body = code(source)
      if (file.endsWith('cartStore.ts')) {
        expect(body).toMatch(/localStorage/)
        expect(body).not.toMatch(/sessionStorage|indexedDB|document\.cookie/)
        continue
      }
      expect(body, file).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|history\.(push|replace)State|setSearchParams/)
    }
  })

  it('stores the cart under one key and nothing else with it', () => {
    const body = code(sources['../../shop/cartStore.ts'])
    expect([...body.matchAll(/getItem\(|setItem\(|removeItem\(/g)]).toHaveLength(2)
    expect(body).toContain('cc-shop-cart-v1')
  })

  it('leaves nothing in the console and loads no 3D code', () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/console\./)
      expect(source, file).not.toMatch(/from 'three'|@react-three|SceneLayer|VelocityHero|lab\/core/)
    }
  })

  it('animates only with the durations that collapse under reduced motion, or its own guarded keyframes', () => {
    for (const [file, source] of Object.entries(styles)) {
      for (const match of source.matchAll(/\banimation:\s*([^;]+);/g)) {
        const timing = match[1]
        const tokens = /var\(--dur-/.test(timing)
        const guarded = /prefers-reduced-motion/.test(source)
        expect(tokens || guarded, `${file}: ${match[0]}`).toBe(true)
      }
      for (const match of source.matchAll(/\btransition:\s*([^;]+);/g)) {
        expect(/var\(--dur-|var\(--transition-colors\)|^\s*(0s|none)/.test(match[1]) || /var\(--dur-/.test(match[1].replace(/\n/g, ' ')), `${file}: ${match[0]}`).toBe(true)
      }
    }
  })
})

describe('the shop keeps its text readable', () => {
  it.each(themes)('the tick and the cart count (on accent) are 4.5:1 in the %s theme', (theme) => {
    expect(contrast(resolveColor('--color-on-accent', theme)!, resolveColor('--color-accent', theme)!)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(themes)('labels in the accent and in cobalt are 4.5:1 on every surface they sit on in the %s theme', (theme) => {
    for (const surface of ['--color-bg', '--color-bg-subtle', '--color-surface', '--color-surface-raised'] as const) {
      const background = resolveColor(surface, theme)!
      expect(contrast(resolveColor('--color-accent-text', theme)!, background), `accent on ${surface}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(resolveColor('--color-secondary-text', theme)!, background), `cobalt on ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(themes)('text, secondary and muted text are readable on the sticky bar, the cards and the summary in the %s theme', (theme) => {
    for (const surface of ['--color-surface', '--color-surface-raised', '--color-bg-subtle', '--color-surface-hover'] as const) {
      const background = resolveColor(surface, theme)!
      expect(contrast(resolveColor('--color-text', theme)!, background), `text on ${surface}`).toBeGreaterThanOrEqual(7)
      expect(contrast(resolveColor('--color-text-secondary', theme)!, background), `secondary on ${surface}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(resolveColor('--color-text-muted', theme)!, background), `muted on ${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(themes)('the chosen filter chip (page colour on text colour) is 7:1 in the %s theme', (theme) => {
    expect(contrast(resolveColor('--color-bg', theme)!, resolveColor('--color-text', theme)!)).toBeGreaterThanOrEqual(7)
  })

  it.each(themes)('a card’s frame and the package marks (strong border, accent, cobalt) are 3:1 on the surfaces in the %s theme', (theme) => {
    for (const surface of ['--color-surface', '--color-surface-raised', '--color-bg'] as const) {
      const background = resolveColor(surface, theme)!
      expect(contrast(resolveColor('--color-border-strong', theme)!, background), `frame on ${surface}`).toBeGreaterThanOrEqual(3)
      expect(contrast(resolveColor('--color-accent', theme)!, background), `accent on ${surface}`).toBeGreaterThanOrEqual(3)
    }
    // The cobalt Grow mark is drawn in the readable cobalt, not the brand one.
    expect(contrast(resolveColor('--color-secondary-text', theme)!, resolveColor('--color-surface-raised', theme)!)).toBeGreaterThanOrEqual(3)
  })
})
