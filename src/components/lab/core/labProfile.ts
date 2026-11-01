import { pickQuality, lowerTier, type DeviceHints, type QualityTier } from '../../hero/velocityHeroConfig'

/**
 * What each quality tier of the Lab spends: pixels, particles, vertices and layers. The tier comes
 * from the same device hints and frame-time watchdog as the hero's (see hero/velocityHeroConfig.ts),
 * so a phone gets a lighter Lab than a workstation without a second set of rules. Plain data, no
 * WebGL, so the budgets can be tested.
 */
export interface LabProfile {
  tier: QualityTier
  /** Upper bound for the renderer's pixel ratio. */
  maxDpr: number
  /** Most pixels the canvas may have; the pixel ratio is lowered on big screens to stay within it. */
  maxPixels: number

  /** Hero core: subdivisions of the icosphere, dust points, orbit-ring samples. */
  heroDetail: number
  heroDust: number

  /** Particle Universe: the most particles (the density slider scales this), the flow field's cells. */
  particles: number
  fluidCols: number

  /** Liquid Matter: subdivisions of the icosphere. */
  liquidDetail: number

  /** Type in Motion: layers stacked per letter. */
  typeLayers: number

  /** Infinite Space: streaks, dust points, floating planes and rings. */
  spaceStreaks: number
  spaceDust: number
  spacePlanes: number
  spaceRings: number

  /** Chromatic Distortion: pixel ratio cap of the full-screen shader and how many form layers it draws (1 to 3). */
  chromaticDpr: number
  chromaticLayers: 1 | 2 | 3

}

export const LAB_PROFILES: Record<QualityTier, LabProfile> = {
  high: {
    tier: 'high',
    maxDpr: 2,
    maxPixels: 3_200_000,
    heroDetail: 64,
    heroDust: 2600,
    particles: 36_000,
    fluidCols: 48,
    liquidDetail: 72,
    typeLayers: 14,
    spaceStreaks: 3200,
    spaceDust: 2400,
    spacePlanes: 36,
    spaceRings: 14,
    chromaticDpr: 1.5,
    chromaticLayers: 3,
  },
  medium: {
    tier: 'medium',
    maxDpr: 1.5,
    maxPixels: 1_800_000,
    heroDetail: 44,
    heroDust: 1400,
    particles: 18_000,
    fluidCols: 36,
    liquidDetail: 48,
    typeLayers: 9,
    spaceStreaks: 1800,
    spaceDust: 1200,
    spacePlanes: 24,
    spaceRings: 10,
    chromaticDpr: 1.15,
    chromaticLayers: 2,
  },
  low: {
    tier: 'low',
    maxDpr: 1.25,
    maxPixels: 950_000,
    heroDetail: 24,
    heroDust: 600,
    particles: 7500,
    fluidCols: 28,
    liquidDetail: 26,
    typeLayers: 5,
    spaceStreaks: 800,
    spaceDust: 500,
    spacePlanes: 14,
    spaceRings: 6,
    chromaticDpr: 0.85,
    chromaticLayers: 1,
  },
}

export function labProfileFor(tier: QualityTier): LabProfile {
  return LAB_PROFILES[tier]
}

/** The first guess for a device; the frame-time watchdog corrects it later. */
export function pickLabTier(hints: DeviceHints): QualityTier {
  return pickQuality(hints)
}

export { lowerTier }

/**
 * The pixel ratio the canvas should use: the device's own, capped by the tier, by the pixel budget
 * (so a 4K window does not ask for 8 million pixels) and by the adaptive scale the watchdog lowers
 * when the frame rate cannot hold. Never below `floor`.
 */
export function chooseDpr(
  profile: Pick<LabProfile, 'maxDpr' | 'maxPixels'>,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  scale = 1,
  floor = 0.55,
): number {
  const cssPixels = Math.max(cssWidth * cssHeight, 1)
  const budget = Math.sqrt(profile.maxPixels / cssPixels)
  const chosen = Math.min(devicePixelRatio || 1, profile.maxDpr, budget) * scale
  return Math.min(3, Math.max(floor, chosen))
}
