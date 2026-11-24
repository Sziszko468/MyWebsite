/**
 * The colour laboratory's arithmetic (PROMPT 36): reading a HEX colour, the WCAG 2 contrast ratio, mixing, and the tokens a visitor's palette makes inside the
 * preview. Plain functions on plain strings, no React and no DOM, so every rule can be tested alone.
 *
 * Nothing here touches the page: `previewTokens` only RETURNS custom properties, and the preview stage puts them on its own element. The site's theme and
 * tokens (src/styles/tokens.css) are never written to.
 */

/** The five brand colours, in the order the palette lists them. Their values are the brand tokens of tokens.css (a test keeps the two equal). */
export const BRAND_IDS = ['red', 'black', 'blue', 'paper', 'graphite'] as const
export type BrandId = (typeof BRAND_IDS)[number]

/** The brand tokens' names and original values: Racing Red, Carbon Black, Cobalt Blue, Warm Paper, Graphite. */
export const BRAND_TOKENS: Readonly<Record<BrandId, { token: string; hex: string }>> = {
  red: { token: '--brand-red', hex: '#ff161f' },
  black: { token: '--brand-black', hex: '#0b0b0d' },
  blue: { token: '--brand-blue', hex: '#445cff' },
  paper: { token: '--brand-paper', hex: '#f4f0e8' },
  graphite: { token: '--brand-graphite', hex: '#303036' },
}

/** A palette: `#rrggbb`, lower case, one entry per brand colour. */
export type Palette = Record<BrandId, string>

export const originalPalette = (): Palette => ({
  red: BRAND_TOKENS.red.hex,
  black: BRAND_TOKENS.black.hex,
  blue: BRAND_TOKENS.blue.hex,
  paper: BRAND_TOKENS.paper.hex,
  graphite: BRAND_TOKENS.graphite.hex,
})

export const isOriginalPalette = (palette: Palette): boolean => BRAND_IDS.every((id) => palette[id] === BRAND_TOKENS[id].hex)

export type HexError = 'empty' | 'characters' | 'length'
export type HexResult = { ok: true; hex: string } | { ok: false; error: HexError }

/** The longest text the field is asked to take: `#` and six digits, with some room for spaces. */
export const HEX_INPUT_MAX = 12

/**
 * Reads what a visitor typed as a colour: three or six hexadecimal digits, with or without the leading `#`, in any case, with spaces around it ignored.
 * Anything else is an error that says why (nothing, a character that is not a digit, or the wrong number of digits).
 */
export function parseHex(input: string): HexResult {
  const text = input.trim().replace(/^#/, '')
  if (text === '') return { ok: false, error: 'empty' }
  if (!/^[0-9a-fA-F]*$/.test(text)) return { ok: false, error: 'characters' }
  if (text.length !== 3 && text.length !== 6) return { ok: false, error: 'length' }
  const six = text.length === 3 ? [...text].map((digit) => digit + digit).join('') : text
  return { ok: true, hex: `#${six.toLowerCase()}` }
}

export type Rgb = readonly [number, number, number]

/** `#rrggbb` → [r, g, b] (0 to 255). The input must be a valid hex colour (use `parseHex` first). */
export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

const byte = (value: number) => Math.min(255, Math.max(0, Math.round(value)))

export function rgbToHex([r, g, b]: Rgb): string {
  return `#${[r, g, b].map((channel) => byte(channel).toString(16).padStart(2, '0')).join('')}`
}

/** sRGB channel (0 to 255) → linear light, as WCAG 2 defines it. */
const linear = (channel: number): number => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** The relative luminance of a colour (0 black to 1 white). */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex)
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
}

/** The WCAG 2 contrast ratio of two colours: 1 (identical) to 21 (black on white). Not rounded. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [light, dark] = la >= lb ? [la, lb] : [lb, la]
  return (light + 0.05) / (dark + 0.05)
}

/**
 * A ratio as it is shown: cut to two decimals, never rounded up, because WCAG's thresholds are exact (4.499 is not 4.5) and a display that rounded
 * would tell a visitor a failing pair passes.
 */
export const showRatio = (ratio: number): string => (Math.floor(ratio * 100 + 1e-9) / 100).toFixed(2)

export interface WcagResult {
  /** Body text, level AA: 4.5:1. */
  aa: boolean
  /** Large text (from 24 px, or 19 px bold), level AA: 3:1. */
  aaLarge: boolean
  /** Body text, level AAA: 7:1. */
  aaa: boolean
  /** Large text, level AAA: 4.5:1. */
  aaaLarge: boolean
  /** Interface parts and graphics, level AA (WCAG 1.4.11): 3:1. */
  ui: boolean
}

export function wcag(ratio: number): WcagResult {
  return { aa: ratio >= 4.5, aaLarge: ratio >= 3, aaa: ratio >= 7, aaaLarge: ratio >= 4.5, ui: ratio >= 3 }
}

/** `a` moved `amount` (0 to 1) of the way to `b`, channel by channel in sRGB. */
export function mix(a: string, b: string, amount: number): string {
  const t = Math.min(1, Math.max(0, amount))
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return rgbToHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t])
}

/**
 * `color` as it has to be to be read on `background`: unchanged if it already reaches `target`, otherwise moved toward `toward` (the text colour) in small steps until it
 * does, or all the way if it never can.
 */
export function readable(color: string, background: string, target: number, toward: string): string {
  if (contrastRatio(color, background) >= target) return color
  for (let step = 1; step <= 20; step += 1) {
    const candidate = mix(color, toward, step / 20)
    if (contrastRatio(candidate, background) >= target) return candidate
  }
  return toward
}

/** Whichever of the candidates has the highest contrast on `background` (the first on a tie). */
export function bestOn(background: string, candidates: readonly string[]): string {
  return candidates.reduce((best, candidate) => (contrastRatio(candidate, background) > contrastRatio(best, background) ? candidate : best))
}

export type PreviewTheme = 'dark' | 'light'

/**
 * The semantic tokens a palette makes in a theme: the same names as tokens.css, with the values worked out from the five colours. Dark reads Warm Paper on Carbon
 * Black, light reads Carbon Black on Warm Paper, as the site does; the accent and secondary colours are the palette's red and blue, and their TEXT colours are moved only as
 * far as they must be to be read. These are the values the preview uses once the palette is changed, and the values the contrast report is made from.
 */
export function derivedTokens(palette: Palette, theme: PreviewTheme): Record<string, string> {
  const dark = theme === 'dark'
  const bg = dark ? palette.black : palette.paper
  const text = dark ? palette.paper : palette.black
  const surface = dark ? mix(bg, text, 0.06) : mix(bg, '#ffffff', 0.55)
  const raised = dark ? mix(bg, text, 0.1) : '#ffffff'
  const accentText = readable(palette.red, bg, 4.5, text)
  return {
    '--color-bg': bg,
    '--color-bg-subtle': mix(bg, text, dark ? 0.03 : 0.04),
    '--color-surface': surface,
    '--color-surface-raised': raised,
    '--color-surface-hover': mix(bg, text, dark ? 0.14 : 0.05),
    '--color-surface-active': mix(bg, text, dark ? 0.19 : 0.1),
    '--color-text': text,
    '--color-text-secondary': dark ? mix(text, bg, 0.14) : palette.graphite,
    '--color-text-muted': readable(mix(text, bg, 0.38), bg, 4.5, text),
    '--color-border': mix(bg, text, dark ? 0.16 : 0.12),
    '--color-border-strong': mix(bg, text, 0.45),
    '--color-divider': mix(bg, text, dark ? 0.12 : 0.1),
    '--color-accent': palette.red,
    '--color-accent-text': accentText,
    '--color-accent-hover': mix(palette.red, text, 0.18),
    '--color-accent-active': mix(palette.red, bg, 0.12),
    '--color-on-accent': bestOn(palette.red, [palette.black, palette.paper, '#ffffff']),
    '--color-secondary': palette.blue,
    '--color-on-secondary': bestOn(palette.blue, [palette.paper, palette.black, '#ffffff']),
    '--color-secondary-text': readable(palette.blue, bg, 4.5, text),
    '--color-focus': readable(palette.blue, bg, 3, text),
    '--color-disabled-bg': mix(bg, text, 0.08),
    '--color-disabled-text': mix(bg, text, 0.35),
    '--color-disabled-border': mix(bg, text, 0.16),
  }
}

/**
 * What the preview stage sets on itself. For the original palette: NOTHING, so the preview is the site's own tokens, exactly. For a changed palette: the five brand
 * tokens and every semantic token worked out from them. The keys are all custom properties (`--…`); the values are `#rrggbb`.
 */
export function previewTokens(palette: Palette, theme: PreviewTheme): Record<string, string> {
  if (isOriginalPalette(palette)) return {}
  const brand = Object.fromEntries(BRAND_IDS.map((id) => [BRAND_TOKENS[id].token, palette[id]]))
  return { ...brand, ...derivedTokens(palette, theme) }
}

/** The pairs the report checks: what is drawn on what, and the least contrast WCAG asks of it. */
export const REPORT_PAIRS = [
  { id: 'text', fg: '--color-text', bg: '--color-bg', needs: 4.5 },
  { id: 'secondary', fg: '--color-text-secondary', bg: '--color-bg', needs: 4.5 },
  { id: 'muted', fg: '--color-text-muted', bg: '--color-bg', needs: 4.5 },
  { id: 'accent', fg: '--color-accent-text', bg: '--color-bg', needs: 4.5 },
  { id: 'link', fg: '--color-secondary-text', bg: '--color-bg', needs: 4.5 },
  { id: 'onAccent', fg: '--color-on-accent', bg: '--color-accent', needs: 4.5 },
  { id: 'onSecondary', fg: '--color-on-secondary', bg: '--color-secondary', needs: 4.5 },
  { id: 'focus', fg: '--color-focus', bg: '--color-bg', needs: 3 },
  { id: 'border', fg: '--color-border-strong', bg: '--color-bg', needs: 3 },
] as const

export type ReportId = (typeof REPORT_PAIRS)[number]['id']

export interface ReportRow {
  id: ReportId
  fg: string
  bg: string
  ratio: number
  needs: number
  ok: boolean
}

/** The contrast of every role pair the preview draws, for a palette in a theme. */
export function contrastReport(palette: Palette, theme: PreviewTheme): ReportRow[] {
  const tokens = derivedTokens(palette, theme)
  return REPORT_PAIRS.map(({ id, fg, bg, needs }) => {
    const foreground = tokens[fg]
    const background = tokens[bg]
    const ratio = contrastRatio(foreground, background)
    return { id, fg: foreground, bg: background, ratio, needs, ok: ratio >= needs }
  })
}

/** The CSS a visitor can copy for a palette: the five brand tokens. */
export function paletteCss(palette: Palette): string {
  return `:root {\n${BRAND_IDS.map((id) => `  ${BRAND_TOKENS[id].token}: ${palette[id]};`).join('\n')}\n}`
}
