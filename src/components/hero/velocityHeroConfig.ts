/**
 * Everything tunable about the hero scene, in one place: quality tiers, camera poses,
 * the track's path and the light streaks. Plain data and pure functions, no WebGL.
 */

// ── Quality ────────────────────────────────────────────────────────────

export type QualityTier = 'high' | 'medium' | 'low'

export interface QualityProfile {
  tier: QualityTier
  /** Upper bound for the renderer's device pixel ratio. */
  maxDpr: number
  particles: number
  /** Real post-processing bloom. Everything else glows through additive halos. */
  bloom: boolean
  antialias: boolean
  /** Extra wide, soft halo layers around the light streaks. */
  halos: boolean
  /** Resolution of the generated reflection environment. */
  envSize: number
  /** Radial segments of wheels and the lofted body. */
  detail: number
  /** Samples along the track ribbon. */
  trackSamples: number
}

export const QUALITY: Record<QualityTier, QualityProfile> = {
  high: { tier: 'high', maxDpr: 2, particles: 900, bloom: true, antialias: true, halos: true, envSize: 256, detail: 40, trackSamples: 220 },
  medium: { tier: 'medium', maxDpr: 1.5, particles: 450, bloom: false, antialias: true, halos: true, envSize: 128, detail: 28, trackSamples: 150 },
  low: { tier: 'low', maxDpr: 1, particles: 200, bloom: false, antialias: false, halos: false, envSize: 64, detail: 18, trackSamples: 100 },
}

export interface DeviceHints {
  /** Viewport width in CSS pixels. */
  width: number
  /** Logical CPU cores, when the browser reports them. */
  cores?: number
  /** Device memory in GB, when the browser reports it (coarse, Chromium only). */
  memory?: number
  coarsePointer: boolean
  /** The visitor asked for reduced data usage. */
  saveData: boolean
}

/** First guess from what the browser tells us; the frame-time governor corrects it later. */
export function pickQuality({ width, cores, memory, coarsePointer, saveData }: DeviceHints): QualityTier {
  if (saveData) return 'low'
  if ((memory !== undefined && memory <= 2) || (cores !== undefined && cores <= 2)) return 'low'

  const handheld = coarsePointer || width < 768
  if (handheld) {
    const modest = (memory !== undefined && memory <= 4) || (cores !== undefined && cores <= 4)
    return modest ? 'low' : 'medium'
  }

  const strong = (cores !== undefined && cores >= 6) || (memory !== undefined && memory >= 8)
  return strong ? 'high' : 'medium'
}

export function lowerTier(tier: QualityTier): QualityTier | null {
  if (tier === 'high') return 'medium'
  if (tier === 'medium') return 'low'
  return null
}

/** Average frame time (ms) above which the governor lowers the tier, and the one that gives up on WebGL. */
export const SLOW_FRAME_MS = 30
export const UNUSABLE_FRAME_MS = 55

// ── World ──────────────────────────────────────────────────────────────

/** Metres per second at full speed. Kept modest so lane dashes never strobe. */
export const TOP_SPEED = 34
export const TRACK_WIDTH = 9
export const DASH_PITCH = 9

/** Centre line of the track in the XZ plane, running away from the camera along -z with an S-bend. */
export const TRACK_PATH: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 22],
  [0, 0, 6],
  [-0.2, 0, -14],
  [-1.6, 0, -34],
  [-5.5, 0, -56],
  [-9.5, 0, -78],
  [-9.5, 0, -100],
  [-4, 0, -122],
  [5, 0, -146],
  [16, 0, -170],
]

export const FOG = { near: 28, far: 150 }

export type LineColor = 'red' | 'blue'

export interface LineSpec {
  id: string
  color: LineColor
  /** Lateral offset from the track centre, metres (negative = left). */
  offset: number
  /** Height above the surface, metres. */
  y: number
  /** Core width, metres. */
  width: number
  /** Metres between pulses, and how fast they move relative to the road. */
  pitch: number
  rate: number
  /** Tail sharpness: higher means shorter, brighter comets. */
  tail: number
  /** Always-on glow between pulses, 0..1. */
  base: number
  intensity: number
}

// Red dominates and sits close to the car; blue stays outside as the secondary light.
export const LINES: readonly LineSpec[] = [
  { id: 'edge-left', color: 'red', offset: -4.5, y: 0.05, width: 0.5, pitch: 26, rate: 1.0, tail: 7, base: 0.55, intensity: 1.5 },
  { id: 'edge-right', color: 'red', offset: 4.5, y: 0.05, width: 0.5, pitch: 31, rate: 1.0, tail: 7, base: 0.55, intensity: 1.5 },
  { id: 'lane-left', color: 'red', offset: -2.3, y: 0.04, width: 0.2, pitch: 22, rate: 1.4, tail: 8, base: 0.06, intensity: 1.3 },
  { id: 'lane-right', color: 'red', offset: 2.3, y: 0.04, width: 0.2, pitch: 27, rate: 1.6, tail: 8, base: 0.06, intensity: 1.3 },
  { id: 'trail-left', color: 'red', offset: -3.3, y: 1.1, width: 0.16, pitch: 38, rate: 1.7, tail: 9, base: 0.08, intensity: 1.4 },
  { id: 'trail-right', color: 'red', offset: 3.5, y: 0.7, width: 0.14, pitch: 44, rate: 2.1, tail: 10, base: 0.07, intensity: 1.3 },
  { id: 'wall-left', color: 'blue', offset: -7.2, y: 0.78, width: 0.32, pitch: 30, rate: 1.0, tail: 6, base: 0.6, intensity: 1.2 },
  { id: 'wall-right', color: 'blue', offset: 7.2, y: 0.78, width: 0.32, pitch: 34, rate: 1.0, tail: 6, base: 0.6, intensity: 1.2 },
  { id: 'overhead-blue', color: 'blue', offset: 5.4, y: 2.6, width: 0.12, pitch: 52, rate: 2.4, tail: 12, base: 0.05, intensity: 1.2 },
]

// ── Camera ─────────────────────────────────────────────────────────────

export interface CameraPose {
  /** Camera position relative to the car, metres. */
  x: number
  y: number
  z: number
  /** Look-at target relative to the car. */
  tx: number
  ty: number
  tz: number
  /** Vertical field of view, degrees (wide screens). */
  fov: number
}

export const POSE_IDLE: CameraPose = { x: 1.3, y: 1.05, z: 7.9, tx: 0, ty: 0.45, tz: -2, fov: 37 }
export const POSE_SPEED: CameraPose = { x: 0.8, y: 0.8, z: 9.6, tx: 0, ty: 0.5, tz: -9, fov: 46 }

/** Cursor reaction: limited, smoothed range (metres of camera travel at the screen edge). */
export const POINTER = { rangeX: 0.9, rangeY: 0.35, lookX: 0.5, halfLife: 0.22 }

/** Idle sway so the camera never looks locked off, in metres and radians per second. */
export const SWAY = { x: 0.06, y: 0.04, speed: 0.35 }

export interface Composition {
  /** Fraction of the viewport the image is shifted by (+ is right), so the car sits clear of the headline. */
  shiftX: number
  /** Fraction of the viewport the image is shifted by (+ is up). */
  shiftY: number
  /** Extra metres between camera and car. */
  dolly: number
  /** Vertical field of view, degrees. */
  fov: number
}

/**
 * How the scene is laid out, decided in CSS (`--hero-layout` on the scene's container) and read
 * back here:
 *   full     the scene fills the whole hero behind the text (wide screens)
 *   stacked  the scene is its own stage below the text (narrow screens)
 */
export type HeroLayout = 'full' | 'stacked'

export function parseLayout(value: string): HeroLayout {
  return value.trim() === 'stacked' ? 'stacked' : 'full'
}

/** Wide screens put the car beside the headline; a stacked stage centres it and backs off as it narrows. */
export function composeFor(aspect: number, baseFov: number, layout: HeroLayout = 'full'): Composition {
  if (layout === 'stacked') {
    return {
      shiftX: 0,
      shiftY: 0,
      dolly: Math.min(Math.max((1.15 - aspect) * 4, 0), 3),
      fov: baseFov + (aspect < 1.3 ? 2 : 0),
    }
  }

  if (aspect >= 1.25) return { shiftX: 0.24, shiftY: 0.02, dolly: 0, fov: baseFov }

  // A full-bleed hero on a squarish window: the car still has to fit beside the text.
  return { shiftX: 0.1, shiftY: -0.04, dolly: 1, fov: Math.min(baseFov + 6, 52) }
}

// ── Lights and interaction ─────────────────────────────────────────────

/** A click adds a short light impulse that fades over this many seconds. */
export const PULSE_SECONDS = 1.1
