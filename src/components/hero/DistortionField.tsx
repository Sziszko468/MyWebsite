import { Group, Mesh, ShaderMaterial } from 'three'
import { createGridGeometry, createRibbonGeometry } from './fieldGeometry'
import { GRID_FRAG, GRID_VERT } from './fieldShaders'
import type { FieldUniforms } from './fieldUniforms'
import { createGlowMaterial } from './heroMaterials'
import { usePart } from './usePart'
import type { QualityProfile } from './velocityHeroConfig'

/** Distance of the floor and the ceiling from the view axis, world units. */
const HEIGHT = 5.4

/** Width of a surface line, in CSS pixels. */
const LINE_WIDTH = 1.1

function buildSurfaces(profile: QualityProfile, uniforms: FieldUniforms) {
  // Every line is a screen-space ribbon: a raw GL line is one aliased pixel and crawls when it moves.
  const geometry = createRibbonGeometry(createGridGeometry(undefined, profile.gridDetail))
  const root = new Group()
  const materials: ShaderMaterial[] = []

  // Face -1 is the floor, +1 the ceiling.
  const faces = profile.surfaces === 2 ? [-1, 1] : [-1]
  for (const face of faces) {
    const material = createGlowMaterial(GRID_VERT, GRID_FRAG, {
      ...uniforms,
      uFace: { value: face },
      uHeight: { value: HEIGHT },
      uLineWidth: { value: LINE_WIDTH },
    })
    const lines = new Mesh(geometry, material)
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
