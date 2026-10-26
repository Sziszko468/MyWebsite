import { Color, Vector2, Vector4, type IUniform } from 'three'
import { damp } from './heroMath'
import type { ScenePalette } from './heroPalette'
import { CURSOR, FIELD } from './velocityHeroConfig'

/**
 * The values every system reads, shared by reference: one write per frame updates the streaks,
 * the trails, the surfaces and the dust together.
 */
export interface FieldUniforms {
  [name: string]: IUniform
  /** Seconds on the shared clock; click waves are aged against it. */
  uTime: IUniform<number>
  /** Units the world has moved past the camera: the phase of every flowing pattern. */
  uTravel: IUniform<number>
  /** Clock of the ambient motion (swirl, surface waves). It runs slowly or not at all when nothing is happening. */
  uPhase: IUniform<number>
  /** 0..1: how recently the pointer moved; lets slow, careful movement show finer detail. */
  uPresence: IUniform<number>
  /** Multiplier on the field's radius: 1 at rest, growing while the intro exits so the field flies apart. */
  uSpread: IUniform<number>
  /** 0..1: progress of the intro's exit, for the overlay's starburst. */
  uExit: IUniform<number>
  /** Where the exit started, in view space (-1..1), for the overlay. */
  uOrigin: IUniform<Vector2>
  /** 0..1: how long the light streaks are drawn. */
  uStreak: IUniform<number>
  /** 0..1: how strongly the cursor is moving the field. */
  uEnergy: IUniform<number>
  /** Strength of the ambient swirl. */
  uWarp: IUniform<number>
  uAspect: IUniform<number>
  uRadius: IUniform<number>
  uCursor: IUniform<Vector2>
  uCursorVel: IUniform<Vector2>
  /** Click waves: x, y, start time, strength. */
  uRipples: IUniform<Vector4[]>
  /** Size of one pixel in screen units, for constant-width lines. */
  uPixel: IUniform<Vector2>
  uDepth: IUniform<number>
  /** 1: lights add to the image (dark theme). 0: they paint over it (light theme). */
  uAdd: IUniform<number>
  uGlow: IUniform<number>
  uBright: IUniform<number>
  uRed: IUniform<Color>
  uBlue: IUniform<Color>
  uInk: IUniform<Color>
  uGrid: IUniform<Color>
}

export function createUniforms(): FieldUniforms {
  return {
    uTime: { value: 0 },
    uTravel: { value: 0 },
    uPhase: { value: 0 },
    uPresence: { value: 0 },
    uSpread: { value: 1 },
    uExit: { value: 0 },
    uOrigin: { value: new Vector2() },
    uStreak: { value: 0.3 },
    uEnergy: { value: 0 },
    uWarp: { value: 1 },
    uAspect: { value: 1 },
    uRadius: { value: FIELD.cursorRadius },
    uCursor: { value: new Vector2() },
    uCursorVel: { value: new Vector2() },
    uRipples: { value: Array.from({ length: CURSOR.maxRipples }, () => new Vector4(0, 0, -1e4, 0)) },
    uPixel: { value: new Vector2(0.002, 0.002) },
    uDepth: { value: FIELD.depth },
    uAdd: { value: 1 },
    uGlow: { value: 1 },
    uBright: { value: 0 },
    uRed: { value: new Color() },
    uBlue: { value: new Color() },
    uInk: { value: new Color() },
    uGrid: { value: new Color() },
  }
}

/** The palette the scene is currently showing: eases towards the active theme instead of snapping. */
export type BlendedPalette = ScenePalette

export function createBlended(target: ScenePalette): BlendedPalette {
  return {
    bg: target.bg.clone(),
    ink: target.ink.clone(),
    grid: target.grid.clone(),
    red: target.red.clone(),
    blue: target.blue.clone(),
    glow: target.glow,
    bloom: target.bloom,
    additive: target.additive,
  }
}

/** Moves the shown palette towards the target. Returns true while it is still on its way. */
export function blendPalette(current: BlendedPalette, target: ScenePalette, dt: number, halfLife = 0.16): boolean {
  const k = 1 - Math.pow(0.5, dt / halfLife)
  current.bg.lerp(target.bg, k)
  current.ink.lerp(target.ink, k)
  current.grid.lerp(target.grid, k)
  current.red.lerp(target.red, k)
  current.blue.lerp(target.blue, k)
  current.glow = damp(current.glow, target.glow, halfLife, dt)
  current.bloom = damp(current.bloom, target.bloom, halfLife, dt)
  current.additive = damp(current.additive, target.additive, halfLife, dt)

  return (
    Math.abs(current.additive - target.additive) > 0.002 ||
    Math.abs(current.glow - target.glow) > 0.01 ||
    Math.abs(current.bg.r - target.bg.r) > 0.002 ||
    Math.abs(current.bg.b - target.bg.b) > 0.002
  )
}
