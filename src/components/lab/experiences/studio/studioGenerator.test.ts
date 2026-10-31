import { describe, expect, it } from 'vitest'
import {
  GEN_DEFAULTS,
  GEN_RANGES,
  generate,
  isGenerated,
  randomGen,
  sanitizeGen,
  unexpected,
  withoutGenerated,
} from './studioGenerator'
import {
  MAX_OBJECTS,
  addObject,
  emptyDoc,
  parseStudioDoc,
  serializeStudioDoc,
  starterDoc,
  updateObject,
} from './studioDoc'

describe('the procedural generator', () => {
  it('clamps what it is given', () => {
    const wild = sanitizeGen({
      seed: 1e12,
      complexity: -4,
      variation: 9,
      scale: 0,
      rotation: NaN,
      distortion: -1,
      symmetry: 5,
    })
    for (const key of Object.keys(GEN_RANGES) as Array<keyof typeof GEN_RANGES>) {
      expect(wild[key]).toBeGreaterThanOrEqual(GEN_RANGES[key].min)
      expect(wild[key]).toBeLessThanOrEqual(GEN_RANGES[key].max)
    }
    expect(wild.symmetry).toBe(GEN_DEFAULTS.symmetry)
  })

  it('makes complexity × symmetry pieces, named so that a later run can find them', () => {
    const doc = generate(emptyDoc(), { ...GEN_DEFAULTS, complexity: 5, symmetry: 4 })
    expect(doc.objects).toHaveLength(20)
    expect(doc.objects.every((object) => isGenerated(object.name))).toBe(true)
    expect(new Set(doc.objects.map((object) => object.id)).size).toBe(20)
  })

  it('gives the same model for the same numbers and different models for different seeds', () => {
    const a = generate(emptyDoc(), { ...GEN_DEFAULTS, seed: 11 })
    const b = generate(emptyDoc(), { ...GEN_DEFAULTS, seed: 11 })
    const c = generate(emptyDoc(), { ...GEN_DEFAULTS, seed: 12 })
    expect(a).toEqual(b)
    expect(JSON.stringify(a.objects)).not.toBe(JSON.stringify(c.objects))
  })

  it('repeats the arrangement round the middle: pieces of one repeat are the same distance out', () => {
    const doc = generate(emptyDoc(), { ...GEN_DEFAULTS, complexity: 3, symmetry: 6 })
    for (let p = 0; p < 3; p++) {
      const ring = doc.objects.slice(p * 6, p * 6 + 6)
      const radii = ring.map((object) => Math.hypot(object.position[0], object.position[2]))
      for (const r of radii) expect(r).toBeCloseTo(radii[0], 5)
      expect(new Set(ring.map((object) => object.position[1].toFixed(4))).size).toBe(1)
    }
  })

  it('spreads a composition outward, piece by piece, so that it does not pile up', () => {
    for (const seed of [1, 9, 33, 480]) {
      const doc = generate(emptyDoc(), { ...GEN_DEFAULTS, seed, complexity: 10, symmetry: 1 })
      const radii = doc.objects.map((object) => Math.hypot(object.position[0], object.position[2]))
      for (let i = 1; i < radii.length; i++) expect(radii[i], `seed ${seed} piece ${i}`).toBeGreaterThan(radii[i - 1])
    }
  })

  it('is made mostly of solid finishes: glass only when the variation asks for it', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const doc = generate(emptyDoc(), { ...GEN_DEFAULTS, seed, variation: 0, complexity: 8 })
      expect(
        doc.objects.some((object) => object.material.preset === 'digital-glass'),
        `seed ${seed}`,
      ).toBe(false)
    }
  })

  it('replaces an earlier generation and leaves what was made by hand', () => {
    let doc = addObject(emptyDoc(), 'cube')
    doc = updateObject(doc, doc.selectedId!, { name: 'My cube' })
    const once = generate(doc, { ...GEN_DEFAULTS, seed: 1, complexity: 4, symmetry: 2 })
    const twice = generate(once, { ...GEN_DEFAULTS, seed: 2, complexity: 3, symmetry: 2 })
    expect(once.objects.filter((object) => isGenerated(object.name))).toHaveLength(8)
    expect(twice.objects.filter((object) => isGenerated(object.name))).toHaveLength(6)
    expect(twice.objects.filter((object) => object.name === 'My cube')).toHaveLength(1)
    expect(withoutGenerated(twice).objects.map((object) => object.name)).toEqual(['My cube'])
  })

  it('never goes past the number of objects a scene may hold', () => {
    const doc = generate(starterDoc(), { ...GEN_DEFAULTS, complexity: 14, symmetry: 6 })
    expect(doc.objects.length).toBeLessThanOrEqual(MAX_OBJECTS)
    expect(doc.objects.length).toBeGreaterThan(starterDoc().objects.length)
  })

  it('makes models that survive the project file: saved, read back and the same', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const doc = generate(emptyDoc(), randomGen(seed))
      const back = parseStudioDoc(JSON.parse(JSON.stringify(serializeStudioDoc(doc))))
      expect(back, `seed ${seed}`).not.toBeNull()
      expect(back!.objects).toHaveLength(doc.objects.length)
    }
  })

  it('RANDOMIZE gives seeds that look different from each other', () => {
    const kinds = new Set<string>()
    const symmetries = new Set<number>()
    for (let seed = 1; seed <= 60; seed++) {
      const params = randomGen(seed)
      symmetries.add(params.symmetry)
      for (const object of generate(emptyDoc(), params).objects) kinds.add(object.kind)
    }
    expect(kinds.size).toBeGreaterThanOrEqual(5)
    expect(symmetries.size).toBeGreaterThanOrEqual(4)
  })
})

describe('Create Something Unexpected', () => {
  it('makes a whole scene from one number: a floor, a composition and a light', () => {
    const doc = unexpected(123)
    expect(doc.objects[0].name).toBe('Floor')
    expect(doc.objects.length).toBeGreaterThan(4)
    expect(parseStudioDoc(JSON.parse(JSON.stringify(serializeStudioDoc(doc))))).not.toBeNull()
    expect(unexpected(123)).toEqual(doc)
  })

  it('does not make the same scene twice, in shape, material or light', () => {
    const scenes = Array.from({ length: 24 }, (_, i) => unexpected(i + 1))
    expect(new Set(scenes.map((doc) => doc.lighting.rig)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(scenes.map((doc) => doc.objects.length)).size).toBeGreaterThanOrEqual(5)
    expect(
      new Set(scenes.map((doc) => doc.objects.map((object) => object.material.preset).join())).size,
    ).toBeGreaterThanOrEqual(10)
    expect(new Set(scenes.map((doc) => Math.round(doc.lighting.azimuth / 20))).size).toBeGreaterThanOrEqual(8)
  })
})
