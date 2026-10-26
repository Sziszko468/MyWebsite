import { Group, Mesh, ShaderMaterial } from 'three'
import { createBeamGeometry } from './fieldGeometry'
import { BEAM_FRAG, BEAM_VERT } from './fieldShaders'
import type { FieldUniforms } from './fieldUniforms'
import { createGlowMaterial } from './heroMaterials'
import { usePart } from './usePart'

function buildBeam(uniforms: FieldUniforms) {
  const geometry = createBeamGeometry()
  const root = new Group()
  const materials: ShaderMaterial[] = []

  // A thin bright core and a wide soft glow around it.
  for (const width of [1, 3.4]) {
    const material = createGlowMaterial(BEAM_VERT, BEAM_FRAG, {
      ...uniforms,
      uWidth: { value: width },
      uBoost: { value: width === 1 ? 1 : 0.35 },
    })
    const mesh = new Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.renderOrder = 6
    root.add(mesh)
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
 * The light that follows the pointer: a beam that starts at the eased pointer and trails back
 * along its path. It grows longer, wider and brighter with the pointer's speed, points along its
 * heading, and leans red for movement to the right and blue to the left. At rest it is invisible.
 */
export function PointerBeam({ uniforms }: { uniforms: FieldUniforms }) {
  const part = usePart(() => buildBeam(uniforms))
  return <primitive object={part.root} />
}
