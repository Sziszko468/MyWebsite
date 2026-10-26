import { useCallback, useRef, useState } from 'react'
import { getDeviceHints, supportsWebGL, useReducedMotion } from './capabilities'
import { lowerTier, pickQuality, UNUSABLE_FRAME_MS, type QualityTier } from './velocityHeroConfig'

interface DevOverride {
  fallback: boolean
  tier?: QualityTier
  bloom?: boolean
}

/**
 * Development only: `?hero=fallback` forces the static graphic, `?hero=high|medium|low` forces a
 * quality tier and `?bloom=0|1` forces bloom off or on, so every path (and bloom's cost) can be
 * checked on one machine. Production ignores the query.
 */
function readDevOverride(): DevOverride {
  if (!import.meta.env.DEV) return { fallback: false }
  const params = new URLSearchParams(window.location.search)
  const hero = params.get('hero')
  const bloom = params.get('bloom')
  return {
    fallback: hero === 'fallback',
    tier: hero === 'high' || hero === 'medium' || hero === 'low' ? hero : undefined,
    bloom: bloom === '1' ? true : bloom === '0' ? false : undefined,
  }
}

/**
 * Decides, for any user of the generative scene (the hero and the intro), whether the live scene
 * runs or the generated SVG stays, and at which quality. The scene is used only when it can run
 * well: WebGL 2 is available, the visitor has not asked for reduced motion, nothing has failed,
 * and the frame rate holds up. It reports back through the handlers: sustained slow frames step
 * the tier down, and when even the lightest tier cannot keep up the SVG takes over for good.
 */
export function useSceneHealth() {
  const reducedMotion = useReducedMotion()
  const [override] = useState(readDevOverride)
  const [webgl] = useState(supportsWebGL)
  const [tier, setTier] = useState<QualityTier>(() => override.tier ?? pickQuality(getDeviceHints()))
  const tierRef = useRef(tier)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)
  const [contextLost, setContextLost] = useState(false)

  const mode = reducedMotion || !webgl || failed || override.fallback ? 'fallback' : 'scene'

  const onSlow = useCallback((averageMs: number) => {
    const lower = lowerTier(tierRef.current)
    if (lower) {
      tierRef.current = lower
      setTier(lower)
      // The new tier may rebuild the canvas; show the static graphic until its first frame.
      setReady(false)
    } else if (averageMs > UNUSABLE_FRAME_MS) {
      setFailed(true)
    }
  }, [])

  const onReady = useCallback(() => setReady(true), [])
  const onContextLost = useCallback(() => setContextLost(true), [])
  const onContextRestored = useCallback(() => setContextLost(false), [])
  const onError = useCallback(() => setFailed(true), [])

  return {
    reducedMotion,
    mode,
    tier,
    bloom: override.bloom,
    /** True once the live scene has drawn its first frame and has not lost its context. */
    sceneVisible: mode === 'scene' && ready && !contextLost,
    sceneHandlers: { onReady, onSlow, onContextLost, onContextRestored },
    onError,
  }
}
