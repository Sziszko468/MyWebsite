import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The phone rules, held to the sources so a later edit cannot quietly break them (see docs/mobile/README.md): the
 * viewport the page asks for, the safe areas, the touch behaviour of controls and fields, the intro's touch input,
 * and the viewport units. These are source checks; what a browser does with them was measured in the real one
 * (tools/audit, docs/release/mobile-performance-report.md).
 */

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const SRC = join(ROOT, 'src')

function files(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return files(path, pattern)
    return pattern.test(entry.name) ? [path] : []
  })
}

const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '')
const read = (path: string) => readFileSync(path, 'utf8')
const styles = files(SRC, /\.(scss|css)$/).map((path) => ({ file: basename(path), css: strip(read(path)) }))

describe('the viewport', () => {
  it.each(['index.html', 'admin.html'])('%s draws under the notch and never forbids zooming', (name) => {
    const meta = /<meta\s+name="viewport"\s+content="([^"]*)"/.exec(read(join(ROOT, name)))?.[1] ?? ''
    expect(meta).toContain('width=device-width')
    expect(meta).toContain('initial-scale=1')
    expect(meta).toContain('viewport-fit=cover')
    // Pinch-zoom is how many people read small text (WCAG 1.4.4): never switched off.
    expect(meta).not.toMatch(/user-scalable\s*=\s*(no|0)/)
    expect(meta).not.toMatch(/maximum-scale/)
  })
})

describe('safe areas', () => {
  const tokens = strip(read(join(SRC, 'styles/tokens.css')))

  it('defines the four insets, and a gutter that is never less than either side needs', () => {
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(tokens).toMatch(new RegExp(`--safe-${side}:\\s*env\\(safe-area-inset-${side},\\s*0px\\)`))
    }
    expect(tokens).toMatch(/--gutter:\s*max\([^;]*var\(--safe-left\)[^;]*var\(--safe-right\)/)
  })

  it('offsets the sticky header by the top inset', () => {
    expect(tokens).toMatch(/--header-height:\s*calc\(var\(--header-bar\)\s*\+\s*var\(--safe-top\)\)/)
  })

  it('writes no raw env(safe-area-inset-*) outside the token definitions, so every use is one of the four tokens', () => {
    const raw = styles.filter(({ file }) => file !== 'tokens.css').filter(({ css }) => /env\(safe-area-inset/.test(css))
    expect(raw.map(({ file }) => file)).toEqual([])
  })
})

describe('touch', () => {
  const global = strip(read(join(SRC, 'styles/global.scss')))

  it('controls do not wait for a second tap and do not zoom on one', () => {
    expect(global).toMatch(/touch-action:\s*manipulation/)
    for (const selector of ['a,', 'button,', "[role='button']", 'select,']) expect(global).toContain(selector)
  })

  it('fields are at least 16px where the pointer is a finger, so iOS does not zoom the page on focus', () => {
    const block = /@media \(pointer: coarse\) \{[\s\S]*?\n\}/.exec(global)?.[0] ?? ''
    expect(block).toMatch(/input[\s\S]*select,[\s\S]*textarea/)
    expect(block).toMatch(/font-size:\s*max\(1rem,\s*16px\)/)
  })

  it('the fullscreen intro takes the finger as the field input, and only pans when its content is taller than the screen', () => {
    const intro = strip(read(join(SRC, 'components/intro/VelocityIntro.module.scss')))
    expect(intro).toMatch(/\.content\s*\{[\s\S]*?touch-action:\s*none/)
    expect(intro).toMatch(/\[data-scrollable='true'\]\s*\.content\s*\{\s*touch-action:\s*pan-y/)
  })

  it('a small button is a full finger on a touch screen', () => {
    const button = strip(read(join(SRC, 'components/Button/Button.module.scss')))
    expect(button).toMatch(/\.sm\s*\{[\s\S]*?@media \(pointer: coarse\)\s*\{\s*min-height:\s*var\(--size-touch\)/)
  })
})

describe('viewport units', () => {
  it('a full-height box that uses vh has the dynamic unit as its normal rule, not the other way round', () => {
    for (const { file, css } of styles) {
      // `height: 100vh` is allowed only directly followed by its `100dvh` upgrade (the line before is the fallback for old browsers),
      // or inside @supports not (...) as the fallback of a svh rule.
      for (const match of css.matchAll(/(min-)?height:\s*100vh;\s*([^}]*?)\}/g)) {
        const after = match[2] ?? ''
        const insideFallback = /@supports not/.test(css.slice(Math.max(0, match.index - 120), match.index))
        expect(/100d?svh|100dvh/.test(after) || insideFallback, `${file}: ${match[0].slice(0, 60)}`).toBe(true)
      }
    }
  })
})
