import {
  AddEquation,
  CanvasTexture,
  CustomBlending,
  OneFactor,
  OneMinusSrcAlphaFactor,
  RepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
  type IUniform,
} from 'three'

/** A glowing, premultiplied-alpha material (see heroShaders.ts). It never writes depth. */
export function createGlowMaterial(vertexShader: string, fragmentShader: string, uniforms: Record<string, IUniform>): ShaderMaterial {
  return new ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: CustomBlending,
    blendEquation: AddEquation,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: OneFactor,
    blendDstAlpha: OneMinusSrcAlphaFactor,
  })
}

/** Small deterministic generator, so the track and the particles look the same on every load. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fine grey grain for the asphalt. It multiplies the track colour, so it is theme-neutral. */
export function createAsphaltTexture(size = 256): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const random = seededRandom(7)

  ctx.fillStyle = 'rgb(214,214,214)'
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < size * size * 0.5; i++) {
    const v = 150 + Math.floor(random() * 105)
    ctx.fillStyle = `rgba(${v},${v},${v},${0.25 + random() * 0.5})`
    ctx.fillRect(random() * size, random() * size, 1 + random() * 1.6, 1 + random() * 1.6)
  }

  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

/** Soft round alpha falloff, used for the car's contact shadow. */
export function createRadialTexture(size = 64): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  gradient.addColorStop(0, 'rgba(255,255,255,1)')
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.45)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new CanvasTexture(canvas)
}
