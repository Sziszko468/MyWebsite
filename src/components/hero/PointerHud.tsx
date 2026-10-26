import { useFrame } from '@react-three/fiber'
import { Mesh, PlaneGeometry } from 'three'
import { CURSOR, FIELD } from './velocityHeroConfig'
import { HUD_FRAG, HUD_VERT } from './fieldShaders'
import type { FieldUniforms } from './fieldUniforms'
import { createGlowMaterial } from './heroMaterials'
import { usePart } from './usePart'

function buildHud(uniforms: FieldUniforms) {
  const geometry = new PlaneGeometry(2, 2)
  const material = createGlowMaterial(HUD_VERT, HUD_FRAG, { ...uniforms })
  const mesh = new Mesh(geometry, material)
  mesh.frustumCulled = false
  mesh.renderOrder = 7

  return {
    root: mesh,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}

/**
 * The fine line work drawn over the field: the pointer's reticle, the shock rings that travel out
 * of every click, and the starburst of the exit. It is one full-screen quad, drawn only while one
 * of the three is showing: at rest, with no wave in flight, it is not drawn at all.
 */
export function PointerHud({ uniforms }: { uniforms: FieldUniforms }) {
  const part = usePart(() => buildHud(uniforms))

  useFrame(() => {
    const now = uniforms.uTime.value
    let wave = false
    for (let i = 0; i < CURSOR.maxRipples; i++) {
      if (now - uniforms.uRipples.value[i].z < FIELD.rippleSeconds) wave = true
    }
    part.root.visible = uniforms.uPresence.value > 0.04 || uniforms.uExit.value > 0.001 || wave
  })

  return <primitive object={part.root} />
}
