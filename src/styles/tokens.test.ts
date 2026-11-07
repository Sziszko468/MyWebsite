import { describe, expect, it } from 'vitest'
import { contrast, rawToken, resolveColor, tokenNames, type ThemeName } from '../test/tokens'

const THEMES: ThemeName[] = ['dark', 'light']

const SURFACES = [
  '--color-bg',
  '--color-bg-subtle',
  '--color-surface',
  '--color-surface-raised',
] as const

const INTERACTIVE_SURFACES = ['--color-surface-hover', '--color-surface-active'] as const

describe('brand palette', () => {
  it.each([
    ['--brand-red', '#ff161f'],
    ['--brand-black', '#0b0b0d'],
    ['--brand-blue', '#445cff'],
    ['--brand-paper', '#f4f0e8'],
    ['--brand-graphite', '#303036'],
  ])('%s is %s', (token, hex) => {
    expect(rawToken(token)).toBe(hex)
  })
})

describe('theme parity', () => {
  it('defines the same semantic tokens in dark and light', () => {
    expect(tokenNames('light').sort()).toEqual(tokenNames('dark').sort())
  })
})

describe.each(THEMES)('%s theme contrast (WCAG 2.x)', (theme) => {
  const ratio = (fg: string, bg: string) => {
    const a = resolveColor(fg, theme)
    const b = resolveColor(bg, theme)
    if (!a || !b) throw new Error(`cannot resolve ${fg} / ${bg} to hex in ${theme}`)
    return contrast(a, b)
  }

  describe('text', () => {
    it.each(SURFACES)('primary text on %s is AAA (7:1)', (bg) => {
      expect(ratio('--color-text', bg)).toBeGreaterThanOrEqual(7)
    })

    it.each([...SURFACES, ...INTERACTIVE_SURFACES])('secondary text on %s is AA (4.5:1)', (bg) => {
      expect(ratio('--color-text-secondary', bg)).toBeGreaterThanOrEqual(4.5)
    })

    it.each(SURFACES)('muted text on %s is AA (4.5:1)', (bg) => {
      expect(ratio('--color-text-muted', bg)).toBeGreaterThanOrEqual(4.5)
    })

    it.each(INTERACTIVE_SURFACES)('primary text on %s is AA (4.5:1)', (bg) => {
      expect(ratio('--color-text', bg)).toBeGreaterThanOrEqual(4.5)
    })

    it.each(SURFACES)('accent text on %s is AA (4.5:1)', (bg) => {
      expect(ratio('--color-accent-text', bg)).toBeGreaterThanOrEqual(4.5)
    })

    it.each(SURFACES)('secondary (blue) text on %s is AA (4.5:1)', (bg) => {
      expect(ratio('--color-secondary-text', bg)).toBeGreaterThanOrEqual(4.5)
    })
  })

  describe('primary button (dark text on bright red)', () => {
    it.each(['--color-accent', '--color-accent-hover', '--color-accent-active'])(
      'on-accent text on %s is AA (4.5:1)',
      (bg) => {
        expect(ratio('--color-on-accent', bg)).toBeGreaterThanOrEqual(4.5)
      },
    )
  })

  describe('text on the Cobalt fill (the selected tab and button of the Grow package)', () => {
    it('on-secondary text on the secondary colour is AA (4.5:1)', () => {
      expect(ratio('--color-on-secondary', '--color-secondary')).toBeGreaterThanOrEqual(4.5)
    })
  })

  describe('non-text UI (3:1)', () => {
    it.each(SURFACES.filter((s) => s !== '--color-bg-subtle'))('focus ring against %s', (bg) => {
      expect(ratio('--color-focus', bg)).toBeGreaterThanOrEqual(3)
    })

    it.each(SURFACES)('strong border against %s', (bg) => {
      expect(ratio('--color-border-strong', bg)).toBeGreaterThanOrEqual(3)
    })

    it.each(['--color-bg', '--color-surface-raised'])('accent fill against %s', (bg) => {
      expect(ratio('--color-accent', bg)).toBeGreaterThanOrEqual(3)
    })
  })

  it('keeps disabled controls visibly distinct from enabled ones', () => {
    const disabled = resolveColor('--color-disabled-bg', theme)
    const accent = resolveColor('--color-accent', theme)
    expect(disabled).not.toBe(accent)
    expect(resolveColor('--color-disabled-text', theme)).not.toBe(resolveColor('--color-text', theme))
  })
})
