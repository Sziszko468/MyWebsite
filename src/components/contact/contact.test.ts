/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findPage } from '../../routes/pages'
import { contrast, resolveColor, type ThemeName } from '../../test/tokens'
import { resolveTone } from '../Section/tone'
import { CONTACT_RHYTHM, contactTone } from './rhythm'

// What the contact page, its form and the shared hero and door pieces say about links and layers.
const sources = import.meta.glob(
  ['./*.tsx', '../form/*.tsx', '../PageHero/*.tsx', '../home/PathDoors.tsx', '../motion/SpeedLines.tsx', '../../pages/ContactPage.tsx'],
  { eager: true, query: '?raw', import: 'default' },
) as Record<string, string>

// Stylesheets are read as text with Node: the test runner does not hand a CSS module over as a string.
const style = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const styles: Record<string, string> = {
  '../PageHero/PageHero.module.scss': style('../PageHero/PageHero.module.scss'),
  '../motion/SpeedLines.module.scss': style('../motion/SpeedLines.module.scss'),
  '../home/PathChooser.module.scss': style('../home/PathChooser.module.scss'),
}

const themes: ThemeName[] = ['dark', 'light']
const ids = CONTACT_RHYTHM.map((section) => section.id)

describe('the contact page’s dark and light rhythm', () => {
  it.each(themes)('puts the form’s band against the hero on a %s page', (page) => {
    const worn = ['base' as const, ...CONTACT_RHYTHM.map((section) => section.tone)].map((tone) => resolveTone(tone, page))
    for (let i = 1; i < worn.length; i++) expect(worn[i], `band ${i}`).not.toBe(worn[i - 1])
  })

  it('knows its band by id, and only that one', () => {
    expect(ids).toEqual(['message'])
    expect(contactTone('message')).toBe('inverse')
    // @ts-expect-error an unknown id is a type error as well as a runtime one
    expect(() => contactTone('nowhere')).toThrow()
  })

  it('gives the band its anchor in the markup', () => {
    const markup = Object.values(sources).join('\n')
    expect(markup).toContain('id="message"')
  })
})

describe('the contact page’s links', () => {
  it('finds the sources it is checking', () => {
    expect(Object.keys(sources).length).toBeGreaterThanOrEqual(8)
    expect(Object.keys(sources).some((file) => file.endsWith('ContactForm.tsx'))).toBe(true)
  })

  it('sends both doors to the form, and has each door start the form on its own topic', () => {
    const hero = sources['./ContactHero.tsx']
    expect(hero.match(/href: '#message'/g)).toHaveLength(2)
    expect(hero).toMatch(/onClick: \(\) => onChoose\('employers'\)/)
    expect(hero).toMatch(/onClick: \(\) => onChoose\('clients'\)/)
  })

  it('sends every in-page link to a band that exists', () => {
    for (const [file, source] of Object.entries(sources)) {
      for (const match of [...source.matchAll(/\bhref="#([^"]+)"/g), ...source.matchAll(/\bhref: '#([^']+)'/g)]) {
        expect(ids, `${file}: ${match[0]}`).toContain(match[1])
      }
    }
  })

  it('sends every route link to a page that exists', () => {
    for (const [file, source] of Object.entries(sources)) {
      for (const match of source.matchAll(/\bto="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) expect(findPage(match[1]), `${file}: ${match[0]}`).toBeDefined()
    }
  })

  it('opens another site only in a new tab that cannot reach back (noopener, noreferrer) and says so', () => {
    let checked = 0
    for (const [file, source] of Object.entries(sources)) {
      for (const match of source.matchAll(/<(?:a|LocalizedLink)\b[^>]*target="_blank"[^>]*>/g)) {
        expect(match[0], file).toMatch(/rel="noopener noreferrer"/)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(2)
    expect(sources['./ProfileLinks.tsx']).toMatch(/opensInNewTab/)
  })

  it('leaves no placeholder or empty destination behind', () => {
    for (const [file, source] of Object.entries(sources)) {
      expect(source, file).not.toMatch(/href=["'](#|)["']/)
      expect(source, file).not.toMatch(/javascript:/i)
    }
  })

  it('shows no address or profile of its own: everything comes from the configuration', () => {
    for (const [file, source] of Object.entries(sources)) {
      const body = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect(body, file).not.toMatch(/https?:\/\/(?!schemas)/)
      expect(body, file).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)
    }
  })
})

describe('the graphic layers', () => {
  it('never take a click: the glow, the speed lines and the doors’ decoration pass them through', () => {
    const hero = styles['../PageHero/PageHero.module.scss']
    for (const selector of ['.glow', '.lines']) {
      const block = hero.match(new RegExp(`\\${selector} \\{[^}]*\\}`))?.[0] ?? ''
      expect(block, selector).toMatch(/pointer-events:\s*none/)
    }
    const doors = styles['../home/PathChooser.module.scss']
    for (const selector of ['.grid', '.streaks', '.beam']) {
      const block = doors.match(new RegExp(`\\${selector} \\{[^}]*\\}`))?.[0] ?? ''
      expect(block, selector).toMatch(/pointer-events:\s*none/)
    }
  })

  it('are hidden from assistive technology', () => {
    expect(sources['../PageHero/PageHero.tsx']).toMatch(/className=\{styles\.glow\} aria-hidden="true"/)
    expect(sources['../motion/SpeedLines.tsx']).toMatch(/aria-hidden="true"/)
  })

  it('do not move for a visitor who asked for less motion', () => {
    expect(styles['../motion/SpeedLines.module.scss']).toMatch(/prefers-reduced-motion: reduce[\s\S]*transform: none/)
  })
})

describe('the hero and the form keep their text readable', () => {
  it.each(themes)('the lead, the eyebrow and the red line are 4.5:1 on the page in the %s theme', (theme) => {
    const background = resolveColor('--color-bg', theme)!
    expect(contrast(resolveColor('--color-text-secondary', theme)!, background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(resolveColor('--color-accent-text', theme)!, background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(resolveColor('--color-text', theme)!, background)).toBeGreaterThanOrEqual(7)
  })
})
