import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast, resolveColor, type ThemeName } from '../test/tokens'

// Read from disk (not `?raw`: the test runner does not hand the raw text of these stylesheets over).
const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8')
const adminCss = read('./styles/admin.css')
const ui = read('./styles/ui.module.scss')

/**
 * The colours the administration adds to the website's tokens (a working green, an amber, a danger red) are checked
 * against the surfaces they are drawn on, in both themes: as text, and as the text of a badge, whose background is the
 * same colour at a low opacity over whatever is behind it (so the worst case is the one measured).
 */

const css = adminCss.replace(/\/\*[\s\S]*?\*\//g, '')
const block = (selector: RegExp) => {
  const match = css.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`admin.css: block not found for ${selector}`)
  return new Map([...match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()] as const))
}
const base = block(/(?<=^|\n):root(?!\[)/)
const light = block(/:root\[data-theme='light'\]/)

/** A token as a #rrggbb colour: the administration's own, else the website's. */
function color(name: string, theme: ThemeName): string {
  let value: string | undefined = (theme === 'light' ? light.get(name) : undefined) ?? base.get(name)
  for (let depth = 0; value && depth < 6; depth += 1) {
    if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase()
    const ref = value.match(/^var\((--[\w-]+)\)$/)
    if (!ref) break
    name = ref[1]
    value = (theme === 'light' ? light.get(name) : undefined) ?? base.get(name)
    if (!value) {
      const site = resolveColor(name, theme)
      if (site) return site
    }
  }
  const site = resolveColor(name, theme)
  if (!site) throw new Error(`cannot resolve ${name} in ${theme}`)
  return site
}

/** `tone` at `share` (0..1) over `backdrop`, in sRGB: what `color-mix(in srgb, tone N%, transparent)` looks like on it. */
function over(toneHex: string, backdropHex: string, share: number): string {
  const channel = (hex: string, at: number) => parseInt(hex.slice(at, at + 2), 16)
  const mixed = [1, 3, 5].map((at) => Math.round(channel(toneHex, at) * share + channel(backdropHex, at) * (1 - share)))
  return `#${mixed.map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

/** The share of its own colour a badge tints its background with, read from the stylesheet so a change is measured. */
const badgeShare = (() => {
  const match = ui.match(/\.badge\s*\{[\s\S]*?background-color:\s*color-mix\(in srgb,\s*var\(--_tone\)\s*(\d+)%/)
  if (!match) throw new Error('ui.module.scss: the badge background was not found')
  return Number(match[1]) / 100
})()

const THEMES: ThemeName[] = ['dark', 'light']
const SURFACES = ['--color-bg', '--color-bg-subtle', '--color-surface', '--color-surface-hover'] as const
const TONES = ['--admin-accent', '--admin-info', '--admin-success', '--admin-warning', '--admin-danger', '--color-text-secondary'] as const

describe.each(THEMES)('%s theme: the administration’s colours', (theme) => {
  it.each(TONES.flatMap((tone) => SURFACES.map((surface) => [tone, surface] as const)))('%s as text on %s is AA (4.5:1)', (tone, surface) => {
    expect(contrast(color(tone, theme), color(surface, theme))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(TONES.flatMap((tone) => SURFACES.map((surface) => [tone, surface] as const)))('a %s badge on %s is AA (4.5:1)', (tone, surface) => {
    const text = color(tone, theme)
    const background = over(text, color(surface, theme), badgeShare)
    expect(contrast(text, background)).toBeGreaterThanOrEqual(4.5)
  })

  it('the danger red stays distinct from the success green and the warning amber', () => {
    const colors = ['--admin-danger', '--admin-success', '--admin-warning'].map((name) => color(name, theme))
    expect(new Set(colors).size).toBe(3)
  })
})

describe('the badge tint', () => {
  it('is a light wash, not a fill (the text must stay readable on it)', () => {
    expect(badgeShare).toBeGreaterThan(0)
    expect(badgeShare).toBeLessThanOrEqual(0.15)
  })
})
