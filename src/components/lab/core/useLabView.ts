import { useCallback, useMemo, useRef, useState } from 'react'
import { getDeviceHints, supportsWebGL, useReducedMotion } from '../../hero/capabilities'
import { UNUSABLE_FRAME_MS, type QualityTier } from '../../hero/velocityHeroConfig'
import { decideView, readViewPreference, storeViewPreference, type LabView, type StillReason } from './labMode'
import { lowerTier, pickLabTier } from './labProfile'

interface DevOverride {
  still: boolean
  tier?: QualityTier
}

/**
 * Development only: `?lab=still` forces the static view (as if WebGL were missing) and
 * `?lab=high|medium|low` forces a quality tier, so every path can be checked on one machine.
 * Production ignores the query.
 */
function readDevOverride(): DevOverride {
  if (!import.meta.env.DEV) return { still: false }
  const value = new URLSearchParams(window.location.search).get('lab')
  return {
    still: value === 'still',
    tier: value === 'high' || value === 'medium' || value === 'low' ? value : undefined,
  }
}

function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export interface LabViewState {
  /** How the stage is shown right now. */
  view: LabView
  /** Why it is still, if it is. */
  reason: StillReason
  /** The system asks for reduced motion. */
  reducedMotion: boolean
  /** The visitor's explicit choice, or null while the system's setting decides. */
  preference: LabView | null
  /** Picks a view; picking `live` or `calm` also gives a stage that failed another try. */
  choose: (view: LabView) => void
  tier: QualityTier
  /** For the canvas: the frame rate cannot hold at this tier. Lowers the tier; at the lowest, falls back to the still view. */
  onSlow: (averageMs: number) => void
  /** For the boundary: the scene threw or lost its context for good. */
  onFail: () => void
}

/**
 * Decides, for any stage of the Lab, whether the live scene runs, runs calmly or stays a picture,
 * and at which quality. WebGL 2 must exist, nothing may have failed, and the visitor can always
 * choose: Live, Calm or Still. Under reduced motion the default is Calm, which keeps the stage
 * interactive without anything moving by itself.
 */
export function useLabView(): LabViewState {
  const reducedMotion = useReducedMotion()
  const [override] = useState(readDevOverride)
  const [webgl] = useState(() => supportsWebGL() && !readDevOverride().still)
  const [preference, setPreference] = useState<LabView | null>(() => readViewPreference(sessionStorageOrNull()))
  const [failed, setFailed] = useState(false)
  const [tier, setTier] = useState<QualityTier>(() => override.tier ?? pickLabTier(getDeviceHints()))
  const tierRef = useRef(tier)

  const { view, reason } = useMemo(
    () => decideView({ preference, reducedMotion, webgl, failed }),
    [preference, reducedMotion, webgl, failed],
  )

  const choose = useCallback((next: LabView) => {
    setPreference(next)
    storeViewPreference(sessionStorageOrNull(), next)
    if (next !== 'still') setFailed(false)
  }, [])

  const onSlow = useCallback((averageMs: number) => {
    const lower = lowerTier(tierRef.current)
    if (lower) {
      tierRef.current = lower
      setTier(lower)
    } else if (averageMs > UNUSABLE_FRAME_MS) {
      setFailed(true)
    }
  }, [])

  const onFail = useCallback(() => setFailed(true), [])

  return { view, reason, reducedMotion, preference, choose, tier, onSlow, onFail }
}
