import { useEffect, useState } from 'react'
import type { Object3D } from 'three'

/** A piece of the scene built imperatively with Three.js: an object tree plus the means to free it. */
export interface ScenePart {
  root: Object3D
  dispose(): void
}

/**
 * Builds a scene part once and releases its GPU resources (geometries, materials, textures) when
 * the component unmounts. Parts depend on the quality tier, so the scene gives each of them
 * `key={tier}` and a tier change rebuilds them from scratch.
 */
export function usePart<T extends ScenePart>(factory: () => T): T {
  const [part] = useState(factory)
  useEffect(() => () => part.dispose(), [part])
  return part
}
