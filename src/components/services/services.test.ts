import { describe, expect, it } from 'vitest'
import { findPage } from '../../routes/pages'
import { contrast, resolveColor, type ThemeName } from '../../test/tokens'
import { resolveTone } from '../Section/tone'
import { PAGE_INDEX, SERVICES_RHYTHM, servicesTone } from './rhythm'

// What the services page, its form and the home page's package cards say about where they link to.
const sources = import.meta.glob(
  ['./*.tsx', '../form/*.tsx', '../../pages/ServicesPage.tsx', '../home/ServicePackages.tsx', '../home/FinalCta.tsx'],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>

const themes: ThemeName[] = ['dark', 'light']
const ids = SERVICES_RHYTHM.map((section) => section.id)

describe('the services page’s dark and light rhythm', () => {
  it.each(themes)('alternates band by band on a %s page, starting from the hero', (page) => {
    const worn = ['base' as const, ...SERVICES_RHYTHM.map((section) => section.tone)].map((tone) => resolveTone(tone, page))
    // The last band is Racing Red and sits against the band above it by colour, not by theme.
    for (let i = 1; i < worn.length - 1; i++) expect(worn[i], `band ${i}`).not.toBe(worn[i - 1])
  })

  it('knows its bands by id, in order, and only those', () => {
    expect(ids).toEqual(['areas', 'packages', 'quote', 'process', 'faq', 'start'])
    expect(servicesTone('quote')).toBe('inverse')
    // @ts-expect-error an unknown id is a type error as well as a runtime one
    expect(() => servicesTone('nowhere')).toThrow()
  })

  it('lists in the hero only bands that exist, once each', () => {
    expect(new Set(PAGE_INDEX).size).toBe(PAGE_INDEX.length)
    for (const id of PAGE_INDEX) expect(ids).toContain(id)
  })

  it('gives each band its anchor in the markup', () => {
    const markup = Object.entries(sources)
      .filter(([file]) => !file.includes('/home/'))
      .map(([, source]) => source)
      .join('\n')
    for (const id of ids.filter((section) => section !== 'start')) expect(markup, id).toContain(`id="${id}"`)
    expect(sources['../../pages/ServicesPage.tsx']).toContain('id="start"')
  })
})

describe('the services page’s call to action targets', () => {
  it('finds the sources it is checking', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(12)
    expect(Object.keys(sources).some((file) => file.endsWith('QuoteForm.tsx'))).toBe(true)
  })

  it('sends every in-page link to a band that exists', () => {
    let checked = 0
    for (const [file, source] of Object.entries(sources)) {
      for (const match of source.matchAll(/\bhref="#([^"]+)"/g)) {
        expect(ids, `${file}: href="#${match[1]}"`).toContain(match[1])
        checked++
      }
      for (const match of source.matchAll(/\bhref=\{`#\$\{(\w+)\}`\}/g)) {
        // The hero builds its index links from PAGE_INDEX, checked above.
        expect(match[1], file).toBe('id')
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(5)
  })

  it('has the hero’s two buttons lead to the services and to the quote request', () => {
    const hero = sources['./ServicesHero.tsx']
    expect(hero).toMatch(/href="#areas"/)
    expect(hero).toMatch(/href="#quote"/)
  })

  it('has every service button and the packages’ bar lead to the quote request', () => {
    expect(sources['./ServiceAreas.tsx']).toMatch(/<Button href="#quote"[^>]*onClick=\{\(\) => onChoose\(area\.id\)\}/)
    expect(sources['./PackagePicker.tsx']).toMatch(/<Button href="#quote"/)
    expect(sources['../../pages/ServicesPage.tsx']).toMatch(/action=\{\{ href: '#quote' \}\}/)
  })

  it('sends every route link to a page that exists', () => {
    for (const [file, source] of Object.entries(sources)) {
      for (const match of source.matchAll(/\bto="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
        expect(findPage(match[1]), `${file}: ${match[0]}`).toBeDefined()
      }
    }
  })

  it('has the home page’s package buttons open the quote request with the package chosen', () => {
    const home = sources['../home/ServicePackages.tsx']
    const match = home.match(/to=\{`(\/[^?`#]+)\?package=\$\{pkg\.id\}#(\w+)`\}/)
    expect(match, 'the package button’s address').not.toBeNull()
    expect(findPage(match![1])?.id).toBe('services')
    expect(ids).toContain(match![2])
  })

  it('leaves no placeholder or empty destination behind', () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/href=["'](#|)["']/)
      expect(source, file).not.toMatch(/javascript:/i)
    }
  })
})

describe('the form never keeps what it is given', () => {
  it('uses no storage, cookie or address-bar state for the answers', () => {
    for (const [file, source] of Object.entries(sources)) {
      const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(body, file).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|history\.(push|replace)State|setSearchParams/)
    }
  })

  it('leaves nothing in the console', () => {
    for (const [file, source] of Object.entries(sources)) expect(source, file).not.toMatch(/console\./)
  })
})

describe('the form and the cards keep their text readable', () => {
  it.each(themes)('error text (accent) is 4.5:1 on every surface an error appears on in the %s theme', (theme) => {
    // An error sits under its question: on the form's card, on a band, or in a panel. Never on the chosen (active) face.
    const surfaces = ['--color-bg', '--color-bg-subtle', '--color-surface', '--color-surface-raised'] as const
    const error = resolveColor('--color-accent-text', theme)!
    for (const surface of surfaces) {
      expect(contrast(error, resolveColor(surface, theme)!), `${surface}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(themes)('hints (muted) and secondary text are 4.5:1 on the form’s surfaces in the %s theme', (theme) => {
    for (const surface of ['--color-bg', '--color-bg-subtle', '--color-surface', '--color-surface-raised', '--color-surface-active'] as const) {
      const background = resolveColor(surface, theme)!
      expect(contrast(resolveColor('--color-text-muted', theme)!, background), `muted on ${surface}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(resolveColor('--color-text-secondary', theme)!, background), `secondary on ${surface}`).toBeGreaterThanOrEqual(4.5)
      expect(contrast(resolveColor('--color-text', theme)!, background), `text on ${surface}`).toBeGreaterThanOrEqual(7)
    }
  })

  it.each(themes)('the tick on the chosen card (on accent) is 4.5:1 in the %s theme', (theme) => {
    expect(contrast(resolveColor('--color-on-accent', theme)!, resolveColor('--color-accent', theme)!)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(themes)('a frame (strong border) is 3:1 against the surfaces it encloses in the %s theme', (theme) => {
    const border = resolveColor('--color-border-strong', theme)!
    for (const surface of ['--color-surface', '--color-surface-raised', '--color-bg'] as const) {
      expect(contrast(border, resolveColor(surface, theme)!), `border on ${surface}`).toBeGreaterThanOrEqual(3)
    }
  })
})
