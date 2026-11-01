import { tri } from '../../../../content/trilingual'
import { createHandoff } from '../../experience/handoff'
import { MATTERS, type MatterId } from './liquidMaterials'

/** What the panel sets and the scene reads each frame. One mutable object, never React state. */
export interface LiquidControls {
  matter: MatterId
  /** 0.3..1.7: a multiplier on how far the state's deformation pushes the surface. */
  deformation: number
  /** 0..2: a multiplier on how fast the surface flows by itself. */
  flow: number
  /** 0.4..1.6: how bright the studio light is. */
  light: number
  /** `#rrggbb` that recolours the light the surface gives back, or null for the state's own colours. */
  tint: string | null
  /** Bumped by the panel to send a pulse through the form from the middle. */
  pulseVersion: number
}

export const LIQUID_DEFAULTS: Readonly<LiquidControls> = {
  matter: 'chrome',
  deformation: 1,
  flow: 1,
  light: 1,
  tint: null,
  pulseVersion: 0,
}

export const LIQUID_RANGES = {
  deformation: { min: 0.3, max: 1.7 },
  flow: { min: 0, max: 2 },
  light: { min: 0.4, max: 1.6 },
} as const

/** What is kept of a material: the state of matter and the three numbers that tune it. */
export interface MaterialWork {
  version: 2
  matter: MatterId
  deformation: number
  flow: number
  light: number
  tint: string | null
}

export function materialWork(controls: LiquidControls): MaterialWork {
  return {
    version: 2,
    matter: controls.matter,
    deformation: controls.deformation,
    flow: controls.flow,
    light: controls.light,
    tint: controls.tint,
  }
}

const within = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback

/** Reads a kept material from anything; null unless it is recognisably one. Numbers are clamped to the panel's ranges. */
export function sanitizeMaterialWork(raw: unknown): LiquidControls | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  if (r.version !== 1 && r.version !== 2) return null
  if (!MATTERS.includes(r.matter as MatterId)) return null
  return {
    ...LIQUID_DEFAULTS,
    matter: r.matter as MatterId,
    deformation: within(
      r.deformation,
      LIQUID_RANGES.deformation.min,
      LIQUID_RANGES.deformation.max,
      LIQUID_DEFAULTS.deformation,
    ),
    flow: within(r.flow, LIQUID_RANGES.flow.min, LIQUID_RANGES.flow.max, LIQUID_DEFAULTS.flow),
    light: within(r.light, LIQUID_RANGES.light.min, LIQUID_RANGES.light.max, LIQUID_DEFAULTS.light),
    tint: r.version === 2 && typeof r.tint === 'string' && /^#[0-9a-fA-F]{6}$/.test(r.tint) ? r.tint.toLowerCase() : null,
  }
}

/** A kept material on its way to the page that shows it (see experience/handoff.ts). */
export const liquidHandoff = createHandoff<LiquidControls>()

export const liquidText = {
  matter: tri('Anyagállapot', 'State of matter', 'Toestand'),
  deformation: tri('Deformáció', 'Deformation', 'Vervorming'),
  flow: tri('Áramlás sebessége', 'Flow speed', 'Stroomsnelheid'),
  light: tri('Fényerő', 'Light', 'Licht'),
  tint: tri('Szín', 'Colour', 'Kleur'),
  ownColours: tri('Az állapot színei', 'State’s own colours', 'Eigen kleuren'),
  randomise: tri('Véletlen anyag', 'Random material', 'Willekeurig materiaal'),
  pulse: tri('Impulzus', 'Pulse', 'Puls'),
} as const
