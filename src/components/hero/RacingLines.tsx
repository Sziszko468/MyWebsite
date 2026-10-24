import { Group, Mesh, ShaderMaterial, type BufferGeometry } from 'three'
import { createRibbon, trackCurve } from './heroGeometry'
import { createGlowMaterial } from './heroMaterials'
import { LINE_FRAG, LINE_VERT } from './heroShaders'
import { usePart } from './usePart'
import type { HeroUniforms } from './heroUniforms'
import { LINES, type LineSpec, type QualityProfile } from './velocityHeroConfig'

function lineMaterial(spec: LineSpec, uniforms: HeroUniforms, soft: number, intensity: number): ShaderMaterial {
  return createGlowMaterial(LINE_VERT, LINE_FRAG, {
    uColor: spec.color === 'red' ? uniforms.uRed : uniforms.uBlue,
    uRate: { value: spec.rate },
    uPitch: { value: spec.pitch },
    uTail: { value: spec.tail },
    uBase: { value: spec.base },
    uIntensity: { value: intensity },
    uSoft: { value: soft },
    uTravel: uniforms.uTravel,
    uStreak: uniforms.uStreak,
    uPulse: uniforms.uPulse,
    uAdd: uniforms.uAdd,
    uGlow: uniforms.uGlow,
    uBright: uniforms.uBright,
    uFogNear: uniforms.uFogNear,
    uFogFar: uniforms.uFogFar,
  })
}

function buildLines(profile: QualityProfile, uniforms: HeroUniforms) {
  const root = new Group()
  const geometries: BufferGeometry[] = []
  const materials: ShaderMaterial[] = []

  for (const spec of LINES) {
    // A bright, narrow core, plus (where the device can afford it) a wide soft halo for bloom-like glow.
    const layers = [{ halfWidth: spec.width / 2, soft: 0.9, intensity: spec.intensity }]
    if (profile.halos) layers.push({ halfWidth: spec.width * 3.4, soft: 2.4, intensity: spec.intensity * 0.42 })

    for (const layer of layers) {
      const geometry = createRibbon(trackCurve, {
        samples: profile.trackSamples,
        offset: spec.offset,
        halfWidth: layer.halfWidth,
        y: spec.y,
      })
      const material = lineMaterial(spec, uniforms, layer.soft, layer.intensity)
      const mesh = new Mesh(geometry, material)
      mesh.renderOrder = 2
      mesh.frustumCulled = false
      root.add(mesh)
      geometries.push(geometry)
      materials.push(material)
    }
  }

  return {
    root,
    dispose() {
      for (const resource of [...geometries, ...materials]) resource.dispose()
    },
  }
}

/**
 * The light streaks: Racing Red dominant and close to the car, Cobalt Blue on the outside as
 * the secondary light. They follow the track's curve, so the bend shows in the light as well.
 */
export function RacingLines({ profile, uniforms }: { profile: QualityProfile; uniforms: HeroUniforms }) {
  const part = usePart(() => buildLines(profile, uniforms))
  return <primitive object={part.root} />
}
