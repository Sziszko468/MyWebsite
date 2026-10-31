import { createStore } from '../../experience/store'
import { loadJson, saveJson } from '../../experience/persist'

/**
 * How the race car looks: its paint and finish, the stripe, the rims and a light under the floor.
 * It is only a look: nothing here touches the physics, and there are no logos or maker marks to
 * choose from, only colours and shapes. The Racing Experience and the Performance Lab show the same
 * look, which is kept in this browser.
 */
export type Finish = 'gloss' | 'matte' | 'metallic'
export type StripeStyle = 'none' | 'centre' | 'twin' | 'sides'
export type Glow = 'off' | 'red' | 'blue' | 'white'

export interface CarLook {
  paint: string
  stripe: string
  stripeStyle: StripeStyle
  rims: string
  finish: Finish
  glow: Glow
}

export const FINISHES: readonly Finish[] = ['gloss', 'matte', 'metallic']
export const STRIPES: readonly StripeStyle[] = ['none', 'centre', 'twin', 'sides']
export const GLOWS: readonly Glow[] = ['off', 'red', 'blue', 'white']
/** The rim colours on offer, as well as any other the colour picker gives. */
export const RIM_COLOURS = ['#c9ccd6', '#17171b', '#d4a73c', '#ff161f', '#f4f0e8'] as const

export const GLOW_COLOUR: Record<Exclude<Glow, 'off'>, number> = { red: 0xff2a2a, blue: 0x4a6bff, white: 0xf4f0e8 }

export const DEFAULT_LOOK: Readonly<CarLook> = {
  paint: '#ff161f',
  stripe: '#f4f0e8',
  stripeStyle: 'centre',
  rims: '#c9ccd6',
  finish: 'gloss',
  glow: 'off',
}

export type PresetId = 'racing-red' | 'cobalt' | 'paper' | 'carbon' | 'sunset' | 'mint'

export const LOOK_PRESETS: ReadonlyArray<{ id: PresetId; look: Readonly<CarLook> }> = [
  { id: 'racing-red', look: DEFAULT_LOOK },
  {
    id: 'cobalt',
    look: {
      paint: '#445cff',
      stripe: '#f4f0e8',
      stripeStyle: 'twin',
      rims: '#17171b',
      finish: 'metallic',
      glow: 'blue',
    },
  },
  {
    id: 'paper',
    look: { paint: '#f4f0e8', stripe: '#ff161f', stripeStyle: 'sides', rims: '#d4a73c', finish: 'gloss', glow: 'off' },
  },
  {
    id: 'carbon',
    look: { paint: '#1d1d22', stripe: '#ff161f', stripeStyle: 'twin', rims: '#c9ccd6', finish: 'matte', glow: 'red' },
  },
  {
    id: 'sunset',
    look: {
      paint: '#ff7a2f',
      stripe: '#1a1a22',
      stripeStyle: 'centre',
      rims: '#f4f0e8',
      finish: 'metallic',
      glow: 'white',
    },
  },
  {
    id: 'mint',
    look: { paint: '#2fd5a0', stripe: '#17171b', stripeStyle: 'sides', rims: '#17171b', finish: 'gloss', glow: 'off' },
  },
]

const HEX = /^#[0-9a-fA-F]{6}$/

/** Brings anything (a stored look, a file) to a look that is safe to show: unknown values fall back to the default. */
export function sanitizeLook(raw: unknown): CarLook {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const colour = (value: unknown, fallback: string) =>
    typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : fallback
  return {
    paint: colour(record.paint, DEFAULT_LOOK.paint),
    stripe: colour(record.stripe, DEFAULT_LOOK.stripe),
    stripeStyle: STRIPES.includes(record.stripeStyle as StripeStyle)
      ? (record.stripeStyle as StripeStyle)
      : DEFAULT_LOOK.stripeStyle,
    rims: colour(record.rims, DEFAULT_LOOK.rims),
    finish: FINISHES.includes(record.finish as Finish) ? (record.finish as Finish) : DEFAULT_LOOK.finish,
    glow: GLOWS.includes(record.glow as Glow) ? (record.glow as Glow) : DEFAULT_LOOK.glow,
  }
}

export const sameLook = (a: CarLook, b: CarLook): boolean =>
  a.paint === b.paint &&
  a.stripe === b.stripe &&
  a.stripeStyle === b.stripeStyle &&
  a.rims === b.rims &&
  a.finish === b.finish &&
  a.glow === b.glow

const KEY = 'lab:car:look'

export const carLook = createStore<CarLook>(loadJson(KEY, (raw) => sanitizeLook(raw)) ?? { ...DEFAULT_LOOK })

export function setLook(look: CarLook): void {
  const next = sanitizeLook(look)
  carLook.set(next)
  saveJson(KEY, next)
}

export function patchLook(patch: Partial<CarLook>): void {
  setLook({ ...carLook.get(), ...patch })
}
