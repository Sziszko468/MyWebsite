/**
 * Everything tunable about the hero's generative scene, in one place: quality tiers, the field's
 * geometry, how strongly the visitor's input moves it, and the screen composition. Plain data
 * and pure functions, no WebGL.
 */

// ── Quality ────────────────────────────────────────────────────────────

export type QualityTier = 'high' | 'medium' | 'low'

export interface QualityProfile {
  tier: QualityTier
  /** Upper bound for the renderer's device pixel ratio. */
  maxDpr: number
  /** Instanced light streaks that rush towards the camera. */
  streaks: number
  /** Cursor-reactive dust. */
  particles: number
  /** Curved light trails and the samples along each. */
  trails: number
  trailSegments: number
  /** Distortion surfaces: 0 none, 1 floor, 2 floor and ceiling. */
  surfaces: 0 | 1 | 2
  /**
   * Real post-processing bloom (a half-float render target and several full-screen passes). Off in
   * every tier: it is the most expensive and the least portable part of the pipeline, and the glow
   * comes from additive blending and halos instead. It can still be switched on in development.
   */
  bloom: boolean
  /**
   * Multisampling. Off in every tier: every primitive in the scene already has a soft, shader-made edge
   * (ribbons, streak and trail profiles, round dust, the overlay), so it adds nothing you can see, and
   * with thousands of overdrawn additive quads it was the single most expensive thing in the frame
   * (18 ms against 0.9 ms without it on one integrated GPU). It also means the canvas's context never
   * has to be re-created when the quality tier changes.
   */
  antialias: boolean
  /** A second, wider and softer layer under each trail. */
  halos: boolean
  /** Most pixels the canvas may have; the pixel ratio is lowered on big screens to stay within it. */
  maxPixels: number
  /** A second, much denser layer of thin, short streaks under the main ones. 0 for none. */
  hairlines: number
  /** Thin trails added to the main ones, in the same geometry. 0 for none. */
  fineTrails: number
  /** Rows of concentric rings per family rushing down the tunnel. 0 for none. */
  rings: number
  /** 1 is the standard surface grid; 2 has twice as many lines, with every fourth one stronger. */
  gridDetail: number
  /** The pointer reticle, click shock rings and the exit starburst, drawn over the field. */
  overlay: boolean
}

/** What the Home hero draws. */
export const QUALITY: Record<QualityTier, QualityProfile> = {
  high: { tier: 'high', maxDpr: 2, streaks: 2600, particles: 2000, trails: 24, trailSegments: 96, surfaces: 2, bloom: false, antialias: false, halos: true, maxPixels: 3_400_000, hairlines: 0, fineTrails: 0, rings: 0, gridDetail: 1, overlay: false },
  medium: { tier: 'medium', maxDpr: 1.5, streaks: 1400, particles: 1000, trails: 16, trailSegments: 64, surfaces: 1, bloom: false, antialias: false, halos: true, maxPixels: 2_000_000, hairlines: 0, fineTrails: 0, rings: 0, gridDetail: 1, overlay: false },
  low: { tier: 'low', maxDpr: 1, streaks: 700, particles: 450, trails: 10, trailSegments: 40, surfaces: 1, bloom: false, antialias: false, halos: false, maxPixels: 1_100_000, hairlines: 0, fineTrails: 0, rings: 0, gridDetail: 1, overlay: false },
}

/**
 * What the fullscreen intro draws: the same engine with several times the detail, because the intro
 * has no text over most of its field and is the first thing a visitor sees. Dust and hairlines are
 * several times denser, trails and surface lines about twice as many, concentric rings rush down
 * the tunnel, and a thin overlay draws the pointer's reticle, click shock rings and the exit's
 * starburst. The pixel budget is a little lower to pay for it.
 */
export const INTRO_QUALITY: Record<QualityTier, QualityProfile> = {
  high: { ...QUALITY.high, streaks: 3000, particles: 9000, trails: 28, fineTrails: 40, trailSegments: 112, hairlines: 9000, rings: 12, gridDetail: 2, overlay: true, maxPixels: 2_800_000 },
  medium: { ...QUALITY.medium, streaks: 1700, particles: 3600, trails: 18, fineTrails: 18, trailSegments: 80, hairlines: 3600, rings: 8, gridDetail: 1.5, overlay: true, maxPixels: 1_500_000 },
  low: { ...QUALITY.low, streaks: 800, particles: 1500, trails: 10, fineTrails: 10, trailSegments: 48, hairlines: 1500, rings: 5, gridDetail: 1, overlay: true, maxPixels: 900_000 },
}

/** The profile for a use of the engine at a quality tier. */
export function profileFor(mode: 'hero' | 'intro', tier: QualityTier): QualityProfile {
  return (mode === 'intro' ? INTRO_QUALITY : QUALITY)[tier]
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
  /** The connection reports itself as 2G or slower (Network Information API, Chromium only). Heavy scenes start light there. */
  slowNetwork?: boolean
}

/** First guess from what the browser tells us; the frame-time watchdog corrects it later. */
export function pickQuality({ width, cores, memory, coarsePointer, saveData, slowNetwork }: DeviceHints): QualityTier {
  if (saveData || slowNetwork) return 'low'
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

/** The step back up (see qualityGovernor.ts), or null at the top. */
export function raiseTier(tier: QualityTier): QualityTier | null {
  if (tier === 'low') return 'medium'
  if (tier === 'medium') return 'high'
  return null
}

const TIER_RANK: Record<QualityTier, number> = { low: 0, medium: 1, high: 2 }

/** Whether `tier` is above `ceiling`. */
export function isAbove(tier: QualityTier, ceiling: QualityTier): boolean {
  return TIER_RANK[tier] > TIER_RANK[ceiling]
}

/** Average frame time (ms) above which the watchdog lowers the tier, and the one that gives up on WebGL. */
export const SLOW_FRAME_MS = 30
export const UNUSABLE_FRAME_MS = 55

// ── The field ──────────────────────────────────────────────────────────

export const FIELD = {
  /** Length of the volume the streaks, trails and surfaces fill, in world units. */
  depth: 140,
  /** Units per second the world rushes past at rest. */
  baseSpeed: 15,
  /** Extra units per second at full cursor energy. */
  energySpeed: 14,
  /** Cursor influence radius in screen units (1 = half the screen height). */
  cursorRadius: 0.42,
  /** Seconds a click's wave takes to fade. */
  rippleSeconds: 2.4,
  /** Seconds the scene takes to light up and reach speed after it appears. */
  introSeconds: 1.8,
  /** The same for the fullscreen intro, which wakes up faster. */
  introRampSeconds: 0.9,
}

// ── Visitor input ──────────────────────────────────────────────────────

/**
 * How the cursor is turned into a smooth, bounded signal. The scene never sees the raw pointer:
 * it sees a position that eases towards it, a velocity measured on that eased position, and an
 * `energy` that rises with movement and drains away slowly once the cursor rests.
 */
export const CURSOR = {
  /** Seconds for the eased position to cover half the distance to the real one. */
  positionHalfLife: 0.14,
  velocityHalfLife: 0.09,
  /** Seconds for the energy to halve while the cursor is still. */
  energyHalfLife: 0.6,
  /** Screen units per second that count as full energy. */
  velocityRef: 2,
  maxVelocity: 6,
  /** Seconds for the pointer's "presence" to halve once it stops moving. */
  presenceHalfLife: 0.9,
  /** Concurrent click waves. */
  maxRipples: 4,
} as const

/** Scroll position is eased before it drives anything; these are the time constants. */
export const SCROLL = {
  progressHalfLife: 0.16,
  velocityHalfLife: 0.12,
} as const

// ── Composition ────────────────────────────────────────────────────────

/**
 * How the scene is laid out, decided in CSS (`--hero-layout` on the scene's container) and read
 * back here:
 *   full     the scene fills the whole hero behind the text (wide screens)
 *   stacked  the scene is its own stage below the text (narrow screens)
 *   intro    the scene is the whole screen of the fullscreen intro
 */
export type HeroLayout = 'full' | 'stacked' | 'intro'

export function parseLayout(value: string): HeroLayout {
  const layout = value.trim()
  return layout === 'stacked' || layout === 'intro' ? layout : 'full'
}

export interface Composition {
  /** Fraction of the viewport the image is shifted by (+ is right): the focal point sits clear of the headline. */
  shiftX: number
  /** Fraction of the viewport the image is shifted by (+ is up). */
  shiftY: number
  /** Vertical field of view, degrees. */
  fov: number
}

export function composeFor(aspect: number, layout: HeroLayout): Composition {
  if (layout === 'intro') {
    // Fullscreen: the focal point sits to the right of the editorial headline on wide screens,
    // a little below centre on narrow ones, where the headline is above it.
    if (aspect >= 1.25) return { shiftX: 0.16, shiftY: 0, fov: 62 }
    if (aspect >= 0.9) return { shiftX: 0.06, shiftY: -0.04, fov: 68 }
    return { shiftX: 0, shiftY: -0.1, fov: 76 }
  }
  if (layout === 'stacked') {
    return { shiftX: 0, shiftY: 0, fov: aspect < 1 ? 74 : 66 }
  }
  if (aspect >= 1.25) return { shiftX: 0.2, shiftY: 0, fov: 60 }
  return { shiftX: 0.08, shiftY: 0, fov: 66 }
}
