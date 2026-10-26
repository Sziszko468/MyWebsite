import { Group, LineSegments, ShaderMaterial } from 'three'
import { createGridGeometry } from './fieldGeometry'
import { GRID_FRAG, GRID_VERT } from './fieldShaders'
import type { FieldUniforms } from './fieldUniforms'
import { createGlowMaterial } from './heroMaterials'
import { usePart } from './usePart'
import type { QualityProfile } from './velocityHeroConfig'

/** Distance of the floor and the ceiling from the view axis, world units. */
const HEIGHT = 5.4

function buildSurfaces(profile: QualityProfile, uniforms: FieldUniforms) {
  const geometry = createGridGeometry(undefined, profile.gridDetail)
  const root = new Group()
  const materials: ShaderMaterial[] = []

  // Face -1 is the floor, +1 the ceiling.
  const faces = profile.surfaces === 2 ? [-1, 1] : [-1]
  for (const face of faces) {
    const material = createGlowMaterial(GRID_VERT, GRID_FRAG, {
      ...uniforms,
      uFace: { value: face },
      uHeight: { value: HEIGHT },
    })
    const lines = new LineSegments(geometry, material)
    lines.frustumCulled = false
    lines.renderOrder = 1
    root.add(lines)
    materials.push(material)
  }

  return {
    root,
    dispose() {
      geometry.dispose()
      for (const material of materials) material.dispose()
    },
  }
}

/**
 * Deforming surfaces: wireframe floor and ceiling in perspective, rolling in slow waves towards
 * the viewer. The cursor raises a relief that follows it, a click sends a ring through the
 * surface, and the lines that are being moved light up in red.
 */
export function DistortionField({ profile, uniforms }: { profile: QualityProfile; uniforms: FieldUniforms }) {
  const part = usePart(() => buildSurfaces(profile, uniforms))
  return <primitive object={part.root} />
}
