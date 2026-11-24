/**
 * The layout laboratory's rules (PROMPT 36): safe, bounded values for the container, the grid, the spacing and the preview's width, and how many columns really fit.
 * Plain functions, no React and no DOM.
 */

export const LAYOUT_BOUNDS = {
  container: { min: 280, max: 1280, step: 10 },
  columns: { min: 1, max: 6, step: 1 },
  gap: { min: 0, max: 64, step: 4 },
  padding: { min: 0, max: 64, step: 4 },
  radius: { min: 0, max: 40, step: 2 },
  // A step of 8 puts all three presets (360, 768, 1280) on the slider's own grid: with a step of 10 a tablet's 768 would be rounded to 770 and no preset would stay chosen.
  previewWidth: { min: 320, max: 1280, step: 8 },
} as const

export const ALIGNMENTS = ['start', 'center', 'end', 'stretch'] as const
export type Alignment = (typeof ALIGNMENTS)[number]

/** The three widths the brief names: a phone, a tablet and a desktop. */
export const PREVIEW_PRESETS = { mobile: 360, tablet: 768, desktop: 1280 } as const
export type PreviewPreset = keyof typeof PREVIEW_PRESETS

/** A card's narrowest comfortable width in px: a column is dropped rather than made narrower than this. */
export const MIN_COLUMN = 148

export interface LayoutState {
  container: number
  columns: number
  gap: number
  padding: number
  radius: number
  align: Alignment
  previewWidth: number
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function bounded(value: unknown, { min, max, step }: { min: number; max: number; step: number }, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return clamp(Math.round((clamp(value, min, max) - min) / step) * step + min, min, max)
}

/** A layout state cut to every bound; anything missing or wrong falls back to the original. */
export function clampLayout(input: Partial<LayoutState>, original: LayoutState): LayoutState {
  return {
    container: bounded(input.container, LAYOUT_BOUNDS.container, original.container),
    columns: bounded(input.columns, LAYOUT_BOUNDS.columns, original.columns),
    gap: bounded(input.gap, LAYOUT_BOUNDS.gap, original.gap),
    padding: bounded(input.padding, LAYOUT_BOUNDS.padding, original.padding),
    radius: bounded(input.radius, LAYOUT_BOUNDS.radius, original.radius),
    align: ALIGNMENTS.includes(input.align as Alignment) ? (input.align as Alignment) : original.align,
    previewWidth: bounded(input.previewWidth, LAYOUT_BOUNDS.previewWidth, original.previewWidth),
  }
}

/**
 * How many columns fit in a frame of `frameWidth` px: the wanted number, fewer when the cards would get narrower than `MIN_COLUMN`, never fewer than one.
 * This is how the same layout answers a phone, a tablet and a desktop.
 */
export function columnsFor(frameWidth: number, wanted: number, gap: number, padding: number, container: number): number {
  const inner = Math.max(0, Math.min(container, frameWidth) - padding * 2)
  const fit = Math.floor((inner + gap) / (MIN_COLUMN + gap))
  return clamp(Math.min(wanted, fit), 1, LAYOUT_BOUNDS.columns.max)
}

/** The width the container really takes in a frame: the container's own width, or the frame's if that is narrower. */
export const containerIn = (frameWidth: number, container: number): number => Math.max(0, Math.min(container, frameWidth))

/** The CSS a visitor can copy for the layout. */
export function layoutCss(state: LayoutState): string {
  return [
    '.container {',
    `  max-width: ${state.container}px;`,
    '  margin-inline: auto;',
    `  padding: ${state.padding}px;`,
    '}',
    '',
    '.grid {',
    '  display: grid;',
    `  grid-template-columns: repeat(${state.columns}, minmax(0, 1fr));`,
    `  gap: ${state.gap}px;`,
    `  align-items: ${state.align};`,
    '}',
    '',
    '.card {',
    `  border-radius: ${state.radius}px;`,
    '}',
  ].join('\n')
}
