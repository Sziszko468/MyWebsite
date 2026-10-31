import type { LightRig, LightingDef } from './studioDoc'

/**
 * The five lighting rigs. Each is a key light (the one that can cast shadows and that the visitor
 * aims), a fill, a rim from behind, an ambient wash and how much of the environment's reflections
 * to let in. The visitor's intensity multiplies the lights; the azimuth and elevation aim the key
 * and the other two follow it round, so one rig keeps its character in any direction.
 */
export interface RigDef {
  key: { color: number; intensity: number }
  fill: { color: number; intensity: number }
  rim: { color: number; intensity: number }
  ambient: { color: number; intensity: number }
  /** Multiplier on the environment's reflections. */
  environment: number
  /** Whether the key's shadow is sharp. */
  hardShadows: boolean
}

export const RIGS: Record<LightRig, RigDef> = {
  studio: {
    key: { color: 0xfff4e6, intensity: 2.6 },
    fill: { color: 0xdfe6ff, intensity: 0.8 },
    rim: { color: 0x445cff, intensity: 1.6 },
    ambient: { color: 0xffffff, intensity: 0.18 },
    environment: 1,
    hardShadows: false,
  },
  'dramatic-red': {
    key: { color: 0xffd9cf, intensity: 1.2 },
    fill: { color: 0x2a0a0c, intensity: 0.4 },
    rim: { color: 0xff161f, intensity: 5.5 },
    ambient: { color: 0x300407, intensity: 0.1 },
    environment: 0.35,
    hardShadows: true,
  },
  'cold-blue': {
    key: { color: 0xdbe5ff, intensity: 2.2 },
    fill: { color: 0x445cff, intensity: 1.5 },
    rim: { color: 0x9fb0ff, intensity: 2.4 },
    ambient: { color: 0x1a2250, intensity: 0.3 },
    environment: 0.7,
    hardShadows: false,
  },
  'soft-white': {
    key: { color: 0xffffff, intensity: 1.3 },
    fill: { color: 0xffffff, intensity: 1.1 },
    rim: { color: 0xf4f0e8, intensity: 0.8 },
    ambient: { color: 0xffffff, intensity: 0.9 },
    environment: 1.25,
    hardShadows: false,
  },
  'high-contrast': {
    key: { color: 0xffffff, intensity: 4.6 },
    fill: { color: 0x101014, intensity: 0.15 },
    rim: { color: 0xf4f0e8, intensity: 0.6 },
    ambient: { color: 0x000000, intensity: 0.02 },
    environment: 0.12,
    hardShadows: true,
  },
}

export type Direction = [number, number, number]

/** A unit vector pointing from the origin to a light, from an azimuth and an elevation in degrees. */
export function directionFrom(azimuth: number, elevation: number): Direction {
  const a = (azimuth * Math.PI) / 180
  const e = (elevation * Math.PI) / 180
  return [Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)]
}

export interface LightPlan {
  rig: RigDef
  key: Direction
  fill: Direction
  rim: Direction
  /** The multiplier on every light. */
  gain: number
}

/** Where each light of a rig is, for a lighting definition. */
export function planLighting(lighting: LightingDef): LightPlan {
  return {
    rig: RIGS[lighting.rig],
    key: directionFrom(lighting.azimuth, lighting.elevation),
    fill: directionFrom(lighting.azimuth + 150, 22),
    rim: directionFrom(lighting.azimuth + 205, 32),
    gain: lighting.intensity,
  }
}
