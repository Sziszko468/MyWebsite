import { Mesh } from 'three'
import { createRibbonGeometry, createRingGeometry } from './fieldGeometry'
import { RING_FRAG, RING_VERT } from './fieldShaders'
import type { FieldUniforms } from './fieldUniforms'
import { createGlowMaterial } from './heroMaterials'
import { usePart } from './usePart'
import type { QualityProfile } from './velocityHeroConfig'

function buildRings(profile: QualityProfile, uniforms: FieldUniforms) {
  const geometry = createRibbonGeometry(createRingGeometry(profile.rings))
  const material = createGlowMaterial(RING_VERT, RING_FRAG, { ...uniforms, uLineWidth: { value: 1.1 } })
  const lines = new Mesh(geometry, material)
  lines.frustumCulled = false
  lines.renderOrder = 1

  return {
    root: lines,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}

/**
 * Concentric rings in four families that rush towards the viewer like the gates of a tunnel, and
 * give the open field a structure to move through. One draw call. The pointer bends them and a
 * few of them are red.
 */
export function TunnelRings({ profile, uniforms }: { profile: QualityProfile; uniforms: FieldUniforms }) {
  const part = usePart(() => buildRings(profile, uniforms))
  return <primitive object={part.root} />
}
