import { describe, expect, it } from 'vitest'
import { DEFAULT_LOOK, FINISHES, GLOWS, LOOK_PRESETS, STRIPES, sameLook, sanitizeLook } from './carLook'
import { createCarModel } from './carModel'

describe('the car look', () => {
  it('keeps good values and falls back for bad ones, so nothing hostile reaches a material', () => {
    expect(sanitizeLook(null)).toEqual(DEFAULT_LOOK)
    const good = sanitizeLook({
      paint: '#AABBCC',
      stripe: '#112233',
      stripeStyle: 'twin',
      rims: '#ff161f',
      finish: 'matte',
      glow: 'blue',
    })
    expect(good).toEqual({
      paint: '#aabbcc',
      stripe: '#112233',
      stripeStyle: 'twin',
      rims: '#ff161f',
      finish: 'matte',
      glow: 'blue',
    })
    const bad = sanitizeLook({
      paint: 'url(javascript:alert(1))',
      stripe: 12,
      stripeStyle: 'logo',
      rims: '#12',
      finish: 'chrome',
      glow: 'laser',
    })
    expect(bad).toEqual(DEFAULT_LOOK)
  })

  it('offers presets that are all valid and different from each other', () => {
    for (const { look } of LOOK_PRESETS) expect(sameLook(sanitizeLook(look), look as typeof DEFAULT_LOOK)).toBe(true)
    const paints = new Set(LOOK_PRESETS.map((preset) => preset.look.paint))
    expect(paints.size).toBe(LOOK_PRESETS.length)
    expect(LOOK_PRESETS[0].look).toEqual(DEFAULT_LOOK)
    expect(STRIPES.length + FINISHES.length + GLOWS.length).toBeGreaterThan(8)
  })
})

describe('the car model wears a look', () => {
  it('changes the paint and shows only the chosen stripe', () => {
    const model = createCarModel()
    const colours: number[] = []
    model.root.traverse((object) => {
      const material = (object as { material?: { color?: { getHex(): number }; clearcoat?: number } }).material
      if (material?.clearcoat !== undefined && material.color) colours.push(material.color.getHex())
    })
    expect(colours.length).toBeGreaterThan(5)
    model.applyLook({ ...DEFAULT_LOOK, paint: '#2fd5a0', stripeStyle: 'twin', finish: 'matte' })
    const after: number[] = []
    let roughness = 0
    model.root.traverse((object) => {
      const material = (
        object as { material?: { color?: { getHex(): number }; clearcoat?: number; roughness?: number } }
      ).material
      if (material?.clearcoat !== undefined && material.color) {
        after.push(material.color.getHex())
        roughness = material.roughness ?? 0
      }
    })
    expect(new Set(after)).toEqual(new Set([0x2fd5a0]))
    expect(roughness).toBeGreaterThan(0.7)
    const stripes = model.root.children[0].children.filter((child) => child.name.startsWith('stripe-'))
    expect(stripes.filter((child) => child.visible).every((child) => child.name === 'stripe-twin')).toBe(true)
    expect(stripes.some((child) => child.visible)).toBe(true)
    model.applyLook({ ...DEFAULT_LOOK, stripeStyle: 'none' })
    expect(stripes.some((child) => child.visible)).toBe(false)
    model.dispose()
  })
})
