import { Group, Mesh, ShaderMaterial } from 'three'
import { createStreakGeometry } from './fieldGeometry'
import { STREAK_FRAG, STREAK_VERT } from './fieldShaders'
import type { FieldUniforms } from './fieldUniforms'
import { createGlowMaterial } from './heroMaterials'
import { usePart } from './usePart'
import type { QualityProfile } from './velocityHeroConfig'

/** The detailed intro never draws a streak thinner than this many CSS pixels; thinner ones are dimmed instead. */
const MIN_WIDTH = 1.1

interface StreakLayer {
  count: number
  seed: number
  /** Multipliers on width, length and brightness, relative to the main streaks. */
  width: number
  length: number
  alpha: number
  /** How strongly the layer flies apart when the intro leaves (1 follows the field). */
  spread: number
  /** Brighter heads. */
  tip: number
}

function buildField(profile: QualityProfile, uniforms: FieldUniforms) {
  const detailed = profile.hairlines > 0
  const layers: StreakLayer[] = [{ count: profile.streaks, seed: 3, width: 1, length: 1, alpha: 1, spread: 1, tip: detailed ? 1 : 0 }]
  // The fine layer: many more, thinner, shorter and fainter streaks that fill the gaps between the
  // main ones and fly apart faster on exit, so the field has depth and grain.
  if (detailed) layers.push({ count: profile.hairlines, seed: 17, width: 0.72, length: 0.55, alpha: 0.6, spread: 1.7, tip: 1 })

  const root = new Group()
  const geometries = layers.map((layer) => createStreakGeometry(layer.count, layer.seed))
  const materials: ShaderMaterial[] = layers.map((layer) =>
    createGlowMaterial(STREAK_VERT, STREAK_FRAG, {
      ...uniforms,
      uWidthScale: { value: layer.width },
      uLenScale: { value: layer.length },
      uAlphaScale: { value: layer.alpha },
      uLayerSpread: { value: layer.spread },
      uTipGain: { value: layer.tip },
      uMinWidth: { value: detailed ? MIN_WIDTH : 0 },
    }),
  )
  geometries.forEach((geometry, index) => {
    const mesh = new Mesh(geometry, materials[index])
    mesh.frustumCulled = false
    mesh.renderOrder = 2
    root.add(mesh)
  })

  return {
    root,
    dispose() {
      for (const geometry of geometries) geometry.dispose()
      for (const material of materials) material.dispose()
    },
  }
}

/**
 * The perspective space itself: thousands of light streaks rushing out of the vanishing point,
 * one instanced draw call per layer. Their length grows with the world's speed and the cursor's
 * energy, and the shared forces part them around the pointer and push them with every click wave.
 * The detailed intro adds a second, much denser layer of hairlines.
 */
export function VelocityField({ profile, uniforms }: { profile: QualityProfile; uniforms: FieldUniforms }) {
  const part = usePart(() => buildField(profile, uniforms))
  return <primitive object={part.root} />
}
