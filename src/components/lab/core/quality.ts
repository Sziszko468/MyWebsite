import type { QualityTier } from '../../hero/velocityHeroConfig'

/**
 * The graphics quality a visitor can choose for the experiences: three named profiles, or
 * `auto`, which follows the device and lowers itself when the frame rate drops. The names are
 * the visitor's; the tiers are the engine's (the same three the whole Lab uses), so one choice
 * sets the particle counts, the shadows, the resolution budget and the geometry detail at once.
 */
export type LabQuality = 'auto' | 'high' | 'balanced' | 'performance'

export const QUALITY_OPTIONS: readonly LabQuality[] = ['auto', 'high', 'balanced', 'performance']

export const QUALITY_TIER: Record<Exclude<LabQuality, 'auto'>, QualityTier> = {
  high: 'high',
  balanced: 'medium',
  performance: 'low',
}

export const QUALITY_STORAGE_KEY = 'lab:quality'

export function isLabQuality(value: unknown): value is LabQuality {
  return typeof value === 'string' && (QUALITY_OPTIONS as readonly string[]).includes(value)
}

export function readQuality(storage: Pick<Storage, 'getItem'> | null): LabQuality {
  try {
    const value = storage?.getItem(QUALITY_STORAGE_KEY)
    return isLabQuality(value) ? value : 'auto'
  } catch {
    return 'auto'
  }
}

export function storeQuality(storage: Pick<Storage, 'setItem'> | null, quality: LabQuality): void {
  try {
    storage?.setItem(QUALITY_STORAGE_KEY, quality)
  } catch {
    // A blocked store only means the choice is not remembered.
  }
}

/** The tier a choice stands for, given the tier the device would get on its own. */
export function resolveTier(quality: LabQuality, automatic: QualityTier): QualityTier {
  return quality === 'auto' ? automatic : QUALITY_TIER[quality]
}

/** What the engine's tier is called to the visitor. */
export function qualityOfTier(tier: QualityTier): Exclude<LabQuality, 'auto'> {
  return tier === 'high' ? 'high' : tier === 'medium' ? 'balanced' : 'performance'
}
