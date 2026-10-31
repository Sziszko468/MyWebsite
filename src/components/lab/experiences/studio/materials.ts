import {
  CanvasTexture,
  Color,
  DoubleSide,
  FrontSide,
  MeshPhysicalMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three'
import type { MaterialDef } from './studioDoc'

/**
 * The studio's materials. Every object has one physically based material and a preset only sets
 * its numbers (colour, roughness, metalness, opacity, glow) and a few extras: a clear coat on the
 * paint and the ceramic, a stretched highlight on the brushed metal, a woven texture on the
 * carbon. Changing a preset is a real change of the surface, not a tint: the reflections, the
 * highlights and the transparency all change with it.
 */

/** A small twill weave, dark with lighter threads, drawn once and tiled. */
export function createCarbonTexture(): CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#2a2a30'
    context.fillRect(0, 0, size, size)
    const cell = size / 8
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        // Two threads over, two under, stepping one cell each row: a twill.
        const over = ((x + y) >> 1) % 2 === 0
        const gradient = over
          ? context.createLinearGradient(x * cell, y * cell, (x + 1) * cell, (y + 1) * cell)
          : context.createLinearGradient((x + 1) * cell, y * cell, x * cell, (y + 1) * cell)
        gradient.addColorStop(0, over ? '#5b5b66' : '#17171b')
        gradient.addColorStop(0.5, over ? '#34343b' : '#2c2c33')
        gradient.addColorStop(1, over ? '#17171b' : '#4d4d57')
        context.fillStyle = gradient
        context.fillRect(x * cell + 0.5, y * cell + 0.5, cell - 1, cell - 1)
      }
    }
  }
  const texture = new CanvasTexture(canvas)
  texture.wrapS = texture.wrapT = RepeatWrapping
  texture.repeat.set(3, 3)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function createStudioMaterial(): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color: new Color('#ff161f'), roughness: 0.3, metalness: 0.2 })
}

/** Sets a material from a definition. Safe to call every time the definition changes. */
export function applyMaterialDef(
  material: MeshPhysicalMaterial,
  def: MaterialDef,
  carbon: Texture | null,
  forceDouble = false,
): void {
  material.color.set(def.color)
  material.roughness = def.roughness
  material.metalness = def.metalness
  material.opacity = def.opacity
  material.transparent = def.opacity < 0.999
  material.depthWrite = !material.transparent
  material.emissive.set(def.color)
  material.emissiveIntensity = def.emissive
  material.side = def.preset === 'digital-glass' || forceDouble ? DoubleSide : FrontSide

  material.clearcoat =
    def.preset === 'racing-red' || def.preset === 'carbon-fiber' ? 1 : def.preset === 'ceramic' ? 0.9 : 0
  material.clearcoatRoughness = def.preset === 'ceramic' ? 0.12 : 0.05
  material.anisotropy = def.preset === 'brushed-metal' ? 0.85 : 0
  material.anisotropyRotation = Math.PI / 2
  material.envMapIntensity = def.preset === 'digital-glass' ? 1.5 : 1

  const map = def.preset === 'carbon-fiber' ? carbon : null
  if (material.map !== map) {
    material.map = map
    material.needsUpdate = true
  }
}
