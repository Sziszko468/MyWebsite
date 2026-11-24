/**
 * The typography laboratory's rules (PROMPT 36): the families the project really has, the bounds of every control, and what a visitor's own words are cleaned to.
 * Plain data and functions, no React and no DOM.
 *
 * The families are the ones the site already ships or already names: Archivo Variable (the brand face, loaded by the site itself, weight 100 to 900 and a width axis),
 * the system UI stack (the fallback of `--font-sans`) and the monospace stack the code and figures use elsewhere. Nothing is downloaded for the playground.
 */

import { ARCHIVO_COPY_STACK, MONO_STACK, SYSTEM_STACK } from '../content/playground/stacks'

export const FONT_FAMILIES = ['archivo', 'system', 'mono'] as const
export type FontFamilyId = (typeof FONT_FAMILIES)[number]

/** The font stacks. Archivo's is the site's own token; the other two are the stacks already written in the site's stylesheets. */
export const FAMILY_STACKS: Readonly<Record<FontFamilyId, string>> = {
  archivo: 'var(--font-sans)',
  system: SYSTEM_STACK,
  mono: MONO_STACK,
}

/** The same stacks as a visitor would copy them (the brand face written out instead of the token). */
export const COPY_STACKS: Readonly<Record<FontFamilyId, string>> = {
  archivo: ARCHIVO_COPY_STACK,
  system: SYSTEM_STACK,
  mono: MONO_STACK,
}

export const TYPE_BOUNDS = {
  size: { min: 12, max: 40, step: 1 },
  lineHeight: { min: 0.9, max: 2.2, step: 0.05 },
  tracking: { min: -0.08, max: 0.4, step: 0.01 },
  width: { min: 62, max: 125, step: 1 },
  weight: { min: 100, max: 900, step: 100 },
} as const

/** The scale ratios offered (a major second to a perfect fifth). */
export const SCALE_RATIOS = [1.125, 1.2, 1.25, 1.333, 1.5] as const

/** The longest text each preview line takes. */
export const TEXT_MAX = { heading: 80, body: 400, caption: 80 } as const

/** The weights a family supports: Archivo is a variable face (every hundred from 100 to 900); a system or monospace stack is offered its regular and bold. */
export function weightsFor(family: FontFamilyId): readonly number[] {
  return family === 'archivo' ? [100, 200, 300, 400, 500, 600, 700, 800, 900] : [400, 700]
}

/** Whether the family has a width axis (Archivo does: 62% to 125%). */
export const hasWidth = (family: FontFamilyId): boolean => family === 'archivo'

export interface TypeState {
  family: FontFamilyId
  /** The body size in px; the heading and the caption follow from it and the ratio. */
  size: number
  headingWeight: number
  bodyWeight: number
  lineHeight: number
  /** letter-spacing in em. */
  tracking: number
  /** font-stretch in %, Archivo only. */
  width: number
  ratio: number
  heading: string
  body: string
  caption: string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const snap = (value: number, step: number, min: number) => Math.round((value - min) / step) * step + min
/** A number cut to the bounds and to its step, and 0-safe against NaN and Infinity. */
export const bounded = (value: unknown, { min, max, step }: { min: number; max: number; step: number }, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const snapped = snap(clamp(value, min, max), step, min)
  return Number(clamp(snapped, min, max).toFixed(4))
}

const nearest = (value: number, allowed: readonly number[]): number => allowed.reduce((best, candidate) => (Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best))

/**
 * A visitor's words as they are shown: control characters removed, line breaks and runs of spaces turned into one space, cut to `max` characters (by code point, so an
 * emoji is not split). The result is only ever drawn as text, never as markup.
 */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ')
  return [...stripped].slice(0, max).join('')
}

/** A type state cut to what the family supports and to every bound. Anything missing or wrong falls back to the original. */
export function clampType(input: Partial<TypeState>, original: TypeState): TypeState {
  const family = FONT_FAMILIES.includes(input.family as FontFamilyId) ? (input.family as FontFamilyId) : original.family
  const weights = weightsFor(family)
  const weight = (value: unknown, fallback: number) => nearest(typeof value === 'number' && Number.isFinite(value) ? value : fallback, weights)
  return {
    family,
    size: bounded(input.size, TYPE_BOUNDS.size, original.size),
    headingWeight: weight(input.headingWeight, original.headingWeight),
    bodyWeight: weight(input.bodyWeight, original.bodyWeight),
    lineHeight: bounded(input.lineHeight, TYPE_BOUNDS.lineHeight, original.lineHeight),
    tracking: bounded(input.tracking, TYPE_BOUNDS.tracking, original.tracking),
    width: hasWidth(family) ? bounded(input.width, TYPE_BOUNDS.width, original.width) : 100,
    ratio: SCALE_RATIOS.includes(input.ratio as (typeof SCALE_RATIOS)[number]) ? (input.ratio as number) : original.ratio,
    heading: input.heading === undefined ? original.heading : cleanText(input.heading, TEXT_MAX.heading),
    body: input.body === undefined ? original.body : cleanText(input.body, TEXT_MAX.body),
    caption: input.caption === undefined ? original.caption : cleanText(input.caption, TEXT_MAX.caption),
  }
}

/** The three sizes in px: the heading three steps up the scale, the body, the caption one step down (never under 10 px). */
export function typeScale(state: Pick<TypeState, 'size' | 'ratio'>): { heading: number; body: number; caption: number } {
  const round = (value: number) => Math.round(value * 10) / 10
  return { heading: round(state.size * state.ratio ** 3), body: state.size, caption: Math.max(10, round(state.size / state.ratio)) }
}

/** The CSS a visitor can copy for the three styles. */
export function typeCss(state: TypeState): string {
  const scale = typeScale(state)
  const family = COPY_STACKS[state.family]
  const common = [`font-family: ${family};`, `line-height: ${state.lineHeight};`, `letter-spacing: ${state.tracking}em;`, ...(hasWidth(state.family) ? [`font-stretch: ${state.width}%;`] : [])]
  const rule = (name: string, size: number, weight: number) => `${name} {\n${[`  font-size: ${size}px;`, `  font-weight: ${weight};`, ...common.map((line) => `  ${line}`)].join('\n')}\n}`
  return [rule('.heading', scale.heading, state.headingWeight), rule('.body', scale.body, state.bodyWeight), rule('.caption', scale.caption, state.bodyWeight)].join('\n\n')
}
