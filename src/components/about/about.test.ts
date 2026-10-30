import { describe, expect, it } from 'vitest'
import { findPage } from '../../routes/pages'
import { resolveTone } from '../Section/tone'
import { HOME_RHYTHM } from '../home/rhythm'
import { ABOUT_RHYTHM, aboutTone } from './rhythm'

// What the About page says about where it links to.
const sources = import.meta.glob(['./*.tsx', '../../pages/AboutPage.tsx'], { eager: true, query: '?raw', import: 'default' }) as Record<string, string>

const ids = ABOUT_RHYTHM.map((section) => section.id)

describe('the About page’s dark and light rhythm', () => {
  it.each(['dark', 'light'] as const)('alternates band by band on a %s page, starting from the hero', (page) => {
    const worn = ['base' as const, ...ABOUT_RHYTHM.map((section) => section.tone)].map((tone) => resolveTone(tone, page))
    // The last band is Racing Red and sits against the band above it by colour, not by theme.
    for (let i = 1; i < worn.length - 1; i++) expect(worn[i], `band ${i}`).not.toBe(worn[i - 1])
  })

  it('knows its bands by id, in order, and only those', () => {
    expect(ids).toEqual(['story', 'approach', 'skills', 'focus', 'start'])
    expect(aboutTone('skills')).toBe('inverse')
    // @ts-expect-error an unknown id is a type error as well as a runtime one
    expect(() => aboutTone('nowhere')).toThrow()
  })

  it('gives each band its anchor in the markup', () => {
    const markup = Object.entries(sources)
      .filter(([file]) => !file.includes('/pages/'))
      .map(([, source]) => source)
      .join('\n')
    for (const id of ids.filter((section) => section !== 'start')) expect(markup, id).toContain(`id="${id}"`)
    expect(sources['../../pages/AboutPage.tsx']).toContain('id="start"')
  })
})

describe('the About page’s call to action targets', () => {
  it('finds the sources it is checking', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(6)
  })

  it('leads the hero to the work on the home page and to the contact page', () => {
    const hero = sources['./AboutHero.tsx']
    const work = hero.match(/to="(\/)#(\w+)"/)
    expect(work, 'the work button’s address').not.toBeNull()
    expect(findPage(work![1])?.id).toBe('home')
    expect(HOME_RHYTHM.map((section) => section.id)).toContain(work![2])
    expect(hero).toMatch(/to="\/contact"/)
    expect(findPage('/contact')?.id).toBe('contact')
  })

  it('leads the closing call to action to the contact page', () => {
    expect(sources['../../pages/AboutPage.tsx']).toMatch(/action=\{\{ to: '\/contact' \}\}/)
  })

  it('sends every route link to a page that exists', () => {
    for (const [file, source] of Object.entries(sources)) {
      for (const match of source.matchAll(/\bto="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) expect(findPage(match[1]), `${file}: ${match[0]}`).toBeDefined()
    }
  })

  it('leaves no placeholder or empty destination behind', () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/href=["'](#|)["']/)
      expect(source, file).not.toMatch(/javascript:/i)
      expect(source, file).not.toMatch(/https?:\/\//)
    }
  })

  it('shows nothing of the skills or the story in an image: no logo, no picture of the owner', () => {
    for (const [file, source] of Object.entries(sources)) expect(source, file).not.toMatch(/<img\b|\.svg['"]|\.png['"]|\.webp['"]|\.jpe?g['"]/)
  })

  it('leaves nothing in the console and nothing in storage', () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/console\./)
      expect(source, file).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
    }
  })
})
