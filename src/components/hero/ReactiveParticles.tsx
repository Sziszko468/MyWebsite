import { useFrame } from '@react-three/fiber'
import { Points } from 'three'
import { createDustGeometry } from './fieldGeometry'
import { DUST_FRAG, DUST_VERT } from './fieldShaders'
import type { FieldUniforms } from './fieldUniforms'
import { createGlowMaterial } from './heroMaterials'
import { usePart } from './usePart'
import type { QualityProfile } from './velocityHeroConfig'

function buildParticles(profile: QualityProfile, uniforms: FieldUniforms) {
  const geometry = createDustGeometry(profile.particles)
  const material = createGlowMaterial(DUST_VERT, DUST_FRAG, {
    ...uniforms,
    uSize: { value: 1 },
    uPixelRatio: { value: 1 },
    uFineDust: { value: profile.hairlines > 0 ? 1 : 0 },
  })
  const points = new Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = 4

  return {
    root: points,
    material,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}

/**
 * Dust that parts around the cursor and scatters on every click wave. Each mote reacts a little
 * differently (its own random seed), so a gesture leaves a spread of particles, not a rigid shape.
 */
export function ReactiveParticles({ profile, uniforms }: { profile: QualityProfile; uniforms: FieldUniforms }) {
  const part = usePart(() => buildParticles(profile, uniforms))
  useFrame(({ gl }) => {
    part.material.uniforms.uPixelRatio.value = gl.getPixelRatio()
  })
  return <primitive object={part.root} />
}
