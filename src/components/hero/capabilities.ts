import { useSyncExternalStore } from 'react'
import type { DeviceHints } from './velocityHeroConfig'

let webglSupport: boolean | undefined

/** Whether a WebGL 2 context can be created (Three.js no longer supports WebGL 1). Probed once; the probe context is released. */
export function supportsWebGL(): boolean {
  if (webglSupport !== undefined) return webglSupport
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    webglSupport = gl !== null
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    webglSupport = false
  }
  return webglSupport
}

interface NavigatorHints extends Navigator {
  deviceMemory?: number
  connection?: { saveData?: boolean }
}

export function getDeviceHints(): DeviceHints {
  const nav = navigator as NavigatorHints
  return {
    width: window.innerWidth,
    cores: nav.hardwareConcurrency || undefined,
    memory: nav.deviceMemory,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    saveData: nav.connection?.saveData === true,
  }
}

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Live value of prefers-reduced-motion; flips if the visitor changes the setting while the page is open. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  )
}
