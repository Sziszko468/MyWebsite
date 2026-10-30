import { describe, expect, it } from 'vitest'
import { PAGES } from '../../routes/pages'
import { contrast, resolveColor, rawToken } from '../../test/tokens'
import { resolveTone, type SectionTone } from '../Section/tone'
import { HOME_RHYTHM, homeTone } from './rhythm'

// Everything the home page's components and the hero's say about where they link to.
const sources = import.meta.glob(['./*.tsx', '../project/*.tsx', '../../pages/ProjectPage.tsx', '../hero/VelocityHero.tsx', '../intro/*.tsx'], {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

function color(token: string): string {
  const value = rawToken(token)
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${token} is not a plain hex colour`)
  return value
}

/** color-mix(in srgb, a pct%, b), as CSS does it, for the colours the Lab's tiles are made of. */
function mix(a: string, pct: number, b: string): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16)
  const part = (at: number) => Math.round((channel(a, at) * pct) / 100 + (channel(b, at) * (100 - pct)) / 100)
  return `#${[1, 3, 5].map((at) => part(at).toString(16).padStart(2, '0')).join('')}`
}

describe('the dark and light rhythm', () => {
  const themes = ['dark', 'light'] as const

  it.each(themes)('alternates band by band on a %s page', (page) => {
    const worn = HOME_RHYTHM.map((section) => resolveTone(section.tone, page))
    // The last band is Racing Red and sits against the band above it by colour, not by theme.
    for (let i = 1; i < worn.length - 1; i++) {
      expect(worn[i], `${HOME_RHYTHM[i].id} against ${HOME_RHYTHM[i - 1].id} on a ${page} page`).not.toBe(worn[i - 1])
    }
  })

  it('maps tones to themes', () => {
    const cases: Array<[SectionTone, 'dark' | 'light', 'dark' | 'light']> = [
      ['base', 'dark', 'dark'],
      ['base', 'light', 'light'],
      ['inverse', 'dark', 'light'],
      ['inverse', 'light', 'dark'],
      ['dark', 'light', 'dark'],
      ['light', 'dark', 'light'],
    ]
    for (const [tone, page, expected] of cases) expect(resolveTone(tone, page), `${tone} on ${page}`).toBe(expected)
  })

  it('knows every section by id, and only those', () => {
    expect(HOME_RHYTHM.map((s) => s.id)).toEqual(['path', 'work', 'build', 'about', 'lab', 'services', 'start'])
    expect(homeTone('work')).toBe('inverse')
    // @ts-expect-error an unknown id is a type error as well as a runtime one
    expect(() => homeTone('nowhere')).toThrow()
  })
})

describe('the saturated bands keep their text readable', () => {
  const red = color('--brand-red')
  const black = color('--brand-black')
  const paper = color('--brand-paper')

  it('Racing Red: black type is 4.5:1 or better (the closing call to action, the Lab’s red tile)', () => {
    expect(contrast(black, red)).toBeGreaterThanOrEqual(4.5)
  })

  it('the call to action on red: paper type on a black button is AAA', () => {
    expect(contrast(paper, black)).toBeGreaterThanOrEqual(7)
  })

  it('the Lab’s deep cobalt tile: paper and secondary text are 4.5:1 or better', () => {
    // Mirrors `color-mix(in srgb, var(--brand-blue) 52%, var(--brand-black))` in LabSection.module.scss.
    const tile = mix(color('--brand-blue'), 52, black)
    expect(contrast(resolveColor('--color-text', 'dark')!, tile)).toBeGreaterThanOrEqual(7)
    expect(contrast(resolveColor('--color-text-secondary', 'dark')!, tile)).toBeGreaterThanOrEqual(4.5)
  })

  it('the Lab’s carbon tile and the red-tinted blocks use theme tokens already tested for contrast', () => {
    expect(contrast(resolveColor('--color-text-secondary', 'dark')!, black)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('call to action targets', () => {
  const routes = PAGES.map((page) => page.path)
  const sectionIds = HOME_RHYTHM.map((section) => section.id)

  it('finds the home page’s sources and the project page’s', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(16)
    expect(Object.keys(sources).some((file) => file.includes('ProjectNav'))).toBe(true)
  })

  it('send every route link to a page that exists, and its #fragment to a band that exists', () => {
    for (const [file, source] of Object.entries(sources)) {
      // A link as an attribute (to="/contact") or as a door's action ({ to: '/contact?for=clients' }),
      // with an optional ?query and #fragment.
      const links = [
        ...source.matchAll(/\bto="(\/[^"#?]*)(?:\?[^"#]*)?(?:#([^"]*))?"/g),
        ...source.matchAll(/\bto: '(\/[^'#?]*)(?:\?[^'#]*)?(?:#([^']*))?'/g),
      ]
      for (const match of links) {
        expect(routes, `${file}: ${match[0]}`).toContain(match[1])
        if (match[2]) expect(sectionIds, `${file}: ${match[0]}`).toContain(match[2])
      }
    }
  })

  it('send every in-page link to a section that exists', () => {
    for (const [file, source] of Object.entries(sources)) {
      for (const match of [...source.matchAll(/\bhref="#([^"]+)"/g), ...source.matchAll(/\bhref: '#([^']+)'/g)]) {
        expect(sectionIds, `${file}: ${match[0]}`).toContain(match[1])
      }
    }
  })

  it('leave no placeholder or empty destination behind', () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/href=["'](#|)["']/)
      expect(source, file).not.toMatch(/javascript:/i)
    }
  })
})
