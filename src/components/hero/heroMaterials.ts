import {
  AddEquation,
  CustomBlending,
  DoubleSide,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  type IUniform,
} from 'three'

/**
 * A glowing, premultiplied-alpha material (see fieldShaders.ts). It neither reads nor writes
 * depth: the field is made of light, so order does not matter and nothing needs sorting.
 */
export function createGlowMaterial(vertexShader: string, fragmentShader: string, uniforms: Record<string, IUniform>): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    // Streaks and ribbons are widened on screen, so their winding changes with direction: draw both faces.
    side: DoubleSide,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  })
}
