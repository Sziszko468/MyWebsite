import { useFrame } from '@react-three/fiber'
import { BufferGeometry, Float32BufferAttribute, Points } from 'three'
import { createGlowMaterial, seededRandom } from './heroMaterials'
import { PARTICLE_FRAG, PARTICLE_VERT } from './heroShaders'
import { usePart } from './usePart'
import type { HeroUniforms } from './heroUniforms'
import type { QualityProfile } from './velocityHeroConfig'

const DEPTH = 130

function buildParticles(count: number, uniforms: HeroUniforms) {
  const random = seededRandom(11)
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    // Spread to both sides and above the road; mostly low, with a few high ones.
    const side = random() < 0.5 ? -1 : 1
    positions[i * 3] = side * (1.5 + random() * 17)
    positions[i * 3 + 1] = 0.12 + Math.pow(random(), 1.8) * 9
    positions[i * 3 + 2] = random() * DEPTH
    seeds[i] = random()
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setAttribute('aSeed', new Float32BufferAttribute(seeds, 1))

  const material = createGlowMaterial(PARTICLE_VERT, PARTICLE_FRAG, {
    uTravel: uniforms.uTravel,
    uDepth: { value: DEPTH },
    uSize: { value: 1 },
    uPixelRatio: { value: 1 },
    uFogNear: uniforms.uFogNear,
    uFogFar: uniforms.uFogFar,
    uRed: uniforms.uRed,
    uBlue: uniforms.uBlue,
    uAdd: uniforms.uAdd,
    uGlow: uniforms.uGlow,
    uBright: uniforms.uBright,
    uPulse: uniforms.uPulse,
  })

  const points = new Points(geometry, material)
  points.frustumCulled = false
  points.renderOrder = 3

  return {
    root: points,
    material,
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
}

/** A restrained field of motes that streams past the camera. The count follows the quality tier. */
export function ParticleField({ profile, uniforms }: { profile: QualityProfile; uniforms: HeroUniforms }) {
  const part = usePart(() => buildParticles(profile.particles, uniforms))
  useFrame(({ gl }) => {
    part.material.uniforms.uPixelRatio.value = gl.getPixelRatio()
  })
  return <primitive object={part.root} />
}
