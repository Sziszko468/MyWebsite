import { Color, type IUniform } from 'three'
import type { ScenePalette } from './heroPalette'
import { damp } from './heroMath'
import { FOG } from './velocityHeroConfig'

/**
 * Values every glowing surface reads, shared by reference: updating one number here updates the
 * light streaks, the particles and the lamps in a single write per frame.
 */
export interface HeroUniforms {
  [name: string]: IUniform
  uTravel: IUniform<number>
  uStreak: IUniform<number>
  uPulse: IUniform<number>
  /** 1: glows add to the image (dark theme). 0: they paint over it (light theme). */
  uAdd: IUniform<number>
  uGlow: IUniform<number>
  uBright: IUniform<number>
  uFogNear: IUniform<number>
  uFogFar: IUniform<number>
  uRed: IUniform<Color>
  uBlue: IUniform<Color>
}

export function createUniforms(): HeroUniforms {
  return {
    uTravel: { value: 0 },
    uStreak: { value: 0.12 },
    uPulse: { value: 0 },
    uAdd: { value: 1 },
    uGlow: { value: 1 },
    uBright: { value: 1 },
    uFogNear: { value: FOG.near },
    uFogFar: { value: FOG.far },
    uRed: { value: new Color() },
    uBlue: { value: new Color() },
  }
}

/** The palette the scene is currently showing: eases towards the active theme instead of snapping. */
export type BlendedPalette = ScenePalette

export function createBlended(target: ScenePalette): BlendedPalette {
  return {
    bg: target.bg.clone(),
    track: target.track.clone(),
    marking: target.marking.clone(),
    carBody: target.carBody.clone(),
    carTrim: target.carTrim.clone(),
    red: target.red.clone(),
    blue: target.blue.clone(),
    reflection: target.reflection,
    env: target.env,
    glow: target.glow,
    bloom: target.bloom,
    additive: target.additive,
  }
}

/** Moves the shown palette towards the target. Returns true while it is still moving. */
export function blendPalette(current: BlendedPalette, target: ScenePalette, dt: number, halfLife = 0.16): boolean {
  const k = 1 - Math.pow(0.5, dt / halfLife)
  current.bg.lerp(target.bg, k)
  current.track.lerp(target.track, k)
  current.marking.lerp(target.marking, k)
  current.carBody.lerp(target.carBody, k)
  current.carTrim.lerp(target.carTrim, k)
  current.red.lerp(target.red, k)
  current.blue.lerp(target.blue, k)
  current.reflection = damp(current.reflection, target.reflection, halfLife, dt)
  current.env = damp(current.env, target.env, halfLife, dt)
  current.glow = damp(current.glow, target.glow, halfLife, dt)
  current.bloom = damp(current.bloom, target.bloom, halfLife, dt)
  current.additive = damp(current.additive, target.additive, halfLife, dt)

  return (
    Math.abs(current.additive - target.additive) > 0.002 ||
    Math.abs(current.bloom - target.bloom) > 0.002 ||
    Math.abs(current.env - target.env) > 0.002 ||
    current.bg.r !== target.bg.r
  )
}
