import tokensCss from '../styles/tokens.css?raw'

// Test helper: reads src/styles/tokens.css (the single source of truth) and resolves
// tokens per theme, so checks run against what ships rather than a copy of it.

export type ThemeName = 'dark' | 'light'

type TokenMap = Map<string, string>

function parseDeclarations(body: string): TokenMap {
  const map: TokenMap = new Map()
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    map.set(match[1], match[2].replace(/\s+/g, ' ').trim())
  }
  return map
}

function blockFor(css: string, selector: RegExp): TokenMap {
  const match = css.match(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`))
  if (!match) throw new Error(`tokens.css: block not found for ${selector}`)
  return parseDeclarations(match[1])
}

const css = tokensCss.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, '')

// The first `:root {` is the theme-independent block.
const base = blockFor(css, /(?<=^|\n):root/)
const themes: Record<ThemeName, TokenMap> = {
  dark: blockFor(css, /:root,\s*\[data-theme='dark'\]/),
  light: blockFor(css, /(?<=^|\n)\[data-theme='light'\]/),
}

export function rawToken(name: string, theme?: ThemeName): string | undefined {
  return (theme && themes[theme].get(name)) ?? base.get(name)
}

/** Follows var() chains down to a hex colour. Returns null for anything else. */
export function resolveColor(name: string, theme: ThemeName): string | null {
  let value = rawToken(name, theme)
  for (let depth = 0; value && depth < 8; depth++) {
    const ref = value.match(/^var\((--[\w-]+)\)$/)
    if (!ref) break
    value = rawToken(ref[1], theme)
  }
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null
}

export function tokenNames(theme: ThemeName): string[] {
  return [...themes[theme].keys()]
}

function channel(hex: string, offset: number): number {
  const c = parseInt(hex.slice(offset, offset + 2), 16) / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5)
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
