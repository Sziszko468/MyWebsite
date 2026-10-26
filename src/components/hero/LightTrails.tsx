import { Group, Mesh, ShaderMaterial } from 'three'
import { createTrailGeometry, makeTrailSpecs } from './fieldGeometry'
import { TRAIL_FRAG, TRAIL_VERT } from './fieldShaders'
import type { FieldUniforms } from './fieldUniforms'
import { createGlowMaterial } from './heroMaterials'
import { usePart } from './usePart'
import type { QualityProfile } from './velocityHeroConfig'

function buildTrails(profile: QualityProfile, uniforms: FieldUniforms) {
  const main = makeTrailSpecs(profile.trails)
  const fine = profile.fineTrails > 0 ? makeTrailSpecs(profile.fineTrails, 13, true) : []
  // The bright cores are every trail. The wide soft halos only go under the main trails: a
  // hair-thin trail gains nothing from one, and halos are the expensive part of a trail.
  const core = createTrailGeometry([...main, ...fine], profile.trailSegments)
  const halo = profile.halos ? (fine.length > 0 ? createTrailGeometry(main, profile.trailSegments) : core) : null

  const root = new Group()
  const materials: ShaderMaterial[] = []

  const layers = [{ geometry: core, width: 1, intensity: 1, soft: 0.9 }]
  if (halo) layers.push({ geometry: halo, width: 3.2, intensity: 0.3, soft: 2.2 })

  for (const layer of layers) {
    const material = createGlowMaterial(TRAIL_VERT, TRAIL_FRAG, {
      ...uniforms,
      uWidthScale: { value: layer.width },
      uIntensity: { value: layer.intensity },
      uSoft: { value: layer.soft },
    })
    const mesh = new Mesh(layer.geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 3
    root.add(mesh)
    materials.push(material)
  }

  return {
    root,
    dispose() {
      core.dispose()
      if (halo && halo !== core) halo.dispose()
      for (const material of materials) material.dispose()
    },
  }
}

/**
 * Long curved light trails winding through the field in Racing Red, white and Cobalt Blue. All
 * of them are one geometry and one draw call per layer. Pulses of light run along them towards
 * the viewer; the cursor bends them, and a click makes them part and settle back. The detailed
 * intro adds a second class of thin trails among the main ones.
 */
export function LightTrails({ profile, uniforms }: { profile: QualityProfile; uniforms: FieldUniforms }) {
  const part = usePart(() => buildTrails(profile, uniforms))
  return <primitive object={part.root} />
}
