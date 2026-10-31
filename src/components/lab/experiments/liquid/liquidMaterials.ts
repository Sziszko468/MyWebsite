import { tri } from '../../../../content/trilingual'
import { damp } from '../../../hero/heroMath'

/**
 * The four states of matter, as parameters of one shading model and one deformation. Switching
 * state does not swap a colour: it eases every number below towards the new state's, so the surface
 * changes how light behaves on it (mirror, clay, glass, lava), how far it is pushed, how fast it
 * flows, and how it answers a touch (a thick material follows the pointer slowly and a click
 * rings on it for longer). Plain data and one function, so the table is tested.
 */

export const MATTERS = ['chrome', 'soft', 'glass', 'molten'] as const
export type MatterId = (typeof MATTERS)[number]

export interface MatterParams {
  /** Surface colour, as linear-light-ish 0..1 values the shader tints with. */
  baseR: number
  baseG: number
  baseB: number
  /** 0..1: how much of the look is a mirror image of the room. */
  metal: number
  /** 0..1: how blurred that reflection is. */
  rough: number
  /** Strength of the glancing-angle reflection. */
  fres: number
  /** 0..1: the surface is glass: it shows the room through itself, split into colours. */
  glass: number
  dispersion: number
  /** 0..1: flat facets instead of a smooth skin. */
  facet: number
  /** 0..1: the surface snaps to a coarse crystal lattice (a change of geometry, not only of shading). */
  quant: number
  /** 0..1: glowing heat along the deformation. */
  molten: number
  /** Soft rim light of the clay-like state. */
  sheen: number
  /** The deformation: how far the surface moves, how fine its waves are and how fast they flow. */
  amp: number
  freq: number
  noiseSpeed: number
  /** How strongly a click rings on the surface. */
  pulseGain: number
  pulseDecay: number
  /** How deep the pointer dents it, and how quickly the dent follows the pointer (seconds to half way). */
  hitStrength: number
  response: number
}

export const MATTER_PARAMS: Record<MatterId, MatterParams> = {
  chrome: {
    baseR: 0.88,
    baseG: 0.9,
    baseB: 0.95,
    metal: 1,
    rough: 0.04,
    fres: 1,
    glass: 0,
    dispersion: 0,
    facet: 0,
    quant: 0,
    molten: 0,
    sheen: 0,
    amp: 0.2,
    freq: 0.9,
    noiseSpeed: 0.3,
    pulseGain: 0.9,
    pulseDecay: 0.5,
    hitStrength: 1,
    response: 0.05,
  },
  soft: {
    baseR: 0.93,
    baseG: 0.85,
    baseB: 0.76,
    metal: 0,
    rough: 0.85,
    fres: 0.28,
    glass: 0,
    dispersion: 0,
    facet: 0,
    quant: 0,
    molten: 0,
    sheen: 1,
    amp: 0.17,
    freq: 0.8,
    noiseSpeed: 0.1,
    pulseGain: 0.5,
    pulseDecay: 0.9,
    hitStrength: 0.75,
    response: 0.16,
  },
  glass: {
    baseR: 0.6,
    baseG: 0.76,
    baseB: 1,
    metal: 0,
    rough: 0.1,
    fres: 1,
    glass: 1,
    dispersion: 0.075,
    facet: 1,
    quant: 1,
    molten: 0,
    sheen: 0,
    amp: 0.16,
    freq: 1.2,
    noiseSpeed: 0.18,
    pulseGain: 0.7,
    pulseDecay: 0.6,
    hitStrength: 0.9,
    response: 0.09,
  },
  molten: {
    baseR: 0.1,
    baseG: 0.03,
    baseB: 0.03,
    metal: 0.35,
    rough: 0.32,
    fres: 0.5,
    glass: 0,
    dispersion: 0,
    facet: 0,
    quant: 0,
    molten: 1,
    sheen: 0,
    amp: 0.28,
    freq: 0.9,
    noiseSpeed: 0.5,
    pulseGain: 1,
    pulseDecay: 0.4,
    hitStrength: 1,
    response: 0.22,
  },
}

export const MATTER_NAMES = {
  chrome: tri('Folyékony króm', 'Liquid Chrome', 'Vloeibaar chroom'),
  soft: tri('Lágy anyag', 'Soft Matter', 'Zachte materie'),
  glass: tri('Digitális üveg', 'Digital Glass', 'Digitaal glas'),
  molten: tri('Izzó vörös', 'Molten Red', 'Gesmolten rood'),
} as const

/** The keys that are plain numbers to ease (all of them: the table holds nothing else). */
const KEYS = Object.keys(MATTER_PARAMS.chrome) as Array<keyof MatterParams>

/** A copy of a state's parameters, to start easing from. */
export function cloneParams(id: MatterId): MatterParams {
  return { ...MATTER_PARAMS[id] }
}

/**
 * Eases `current` towards a state by `dt` seconds. Returns true while any value is still more
 * than a hair away, so an on-demand canvas keeps drawing until the change has finished.
 */
export function easeMatter(current: MatterParams, target: MatterParams, dt: number, halfLife = 0.3): boolean {
  let moving = false
  for (const key of KEYS) {
    current[key] = damp(current[key], target[key], halfLife, dt)
    if (Math.abs(current[key] - target[key]) > 0.002) moving = true
  }
  return moving
}
