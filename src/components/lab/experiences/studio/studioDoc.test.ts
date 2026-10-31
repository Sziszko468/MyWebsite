import { describe, expect, it } from 'vitest'
import {
  LIGHT_RIGS,
  MATERIAL_PRESETS,
  MAX_NAME,
  MAX_OBJECTS,
  POSITION_LIMIT,
  PRESETS,
  SCALE_MAX,
  SCALE_MIN,
  addObject,
  duplicateObject,
  emptyDoc,
  materialFromPreset,
  parseStudioDoc,
  removeObject,
  safeColor,
  safeName,
  selectObject,
  selectedObject,
  serializeStudioDoc,
  setLighting,
  starterDoc,
  updateMaterial,
  updateObject,
  type StudioDoc,
} from './studioDoc'

/** Freezes a document all the way down: an operation that changes its input then throws. */
function frozen<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    Object.values(value).forEach(frozen)
    Object.freeze(value)
  }
  return value
}

const withObjects = (count: number): StudioDoc => {
  let doc = emptyDoc()
  for (let i = 0; i < count; i++) doc = addObject(doc, 'cube')
  return doc
}

describe('the starting scene', () => {
  it('is a small arrangement with unique ids and a valid selection', () => {
    const doc = starterDoc()
    expect(doc.objects).toHaveLength(3)
    expect(new Set(doc.objects.map((object) => object.id)).size).toBe(3)
    expect(selectedObject(doc)).not.toBeNull()
  })

  it('survives its own project file unchanged', () => {
    const doc = starterDoc()
    expect(parseStudioDoc(JSON.parse(JSON.stringify(serializeStudioDoc(doc))))).toEqual(doc)
  })
})

describe('adding shapes', () => {
  it('selects the new shape and gives each kind a readable, unique name', () => {
    let doc = addObject(emptyDoc(), 'cube')
    doc = addObject(doc, 'cube')
    doc = addObject(doc, 'torus')
    expect(doc.objects.map((object) => object.name)).toEqual(['Cube', 'Cube 2', 'Torus'])
    expect(selectedObject(doc)?.kind).toBe('torus')
  })

  it('lays a plane flat and puts each new shape a little aside from the last', () => {
    const doc = addObject(addObject(emptyDoc(), 'cube'), 'plane')
    const plane = doc.objects[1]
    expect(plane.rotation[0]).toBeCloseTo(-Math.PI / 2)
    expect(doc.objects[0].position).not.toEqual(addObject(doc, 'cube').objects[2].position)
  })

  it('stops at the cap and hands back the very same document', () => {
    const full = withObjects(MAX_OBJECTS)
    expect(full.objects).toHaveLength(MAX_OBJECTS)
    expect(addObject(full, 'sphere')).toBe(full)
    expect(duplicateObject(full, full.objects[0].id)).toBe(full)
  })

  it('never changes the document it was given', () => {
    const doc = frozen(starterDoc())
    expect(() => addObject(doc, 'cone')).not.toThrow()
    expect(() => removeObject(doc, 'o1')).not.toThrow()
    expect(() => duplicateObject(doc, 'o2')).not.toThrow()
    expect(() => updateObject(doc, 'o1', { name: 'x' })).not.toThrow()
    expect(() => updateMaterial(doc, 'o1', { color: '#ffffff' })).not.toThrow()
    expect(() => setLighting(doc, { intensity: 1.5 })).not.toThrow()
  })
})

describe('editing', () => {
  it('clamps what it is given: position, scale and bad numbers', () => {
    const doc = starterDoc()
    const next = updateObject(doc, 'o1', {
      position: [1e9, -1e9, NaN],
      scale: [0, 1e6, Infinity],
    })
    const object = next.objects[0]
    expect(object.position).toEqual([POSITION_LIMIT, -POSITION_LIMIT, 0])
    expect(object.scale[0]).toBe(SCALE_MIN)
    expect(object.scale[1]).toBe(SCALE_MAX)
    expect(object.scale[2]).toBe(1)
  })

  it('cannot change an id, and an unknown id changes nothing', () => {
    const doc = starterDoc()
    const next = updateObject(doc, 'o1', { name: 'Renamed', ...({ id: 'hijack' } as object) })
    expect(next.objects[0].id).toBe('o1')
    expect(next.objects[0].name).toBe('Renamed')
    expect(updateObject(doc, 'nope', { name: 'x' })).toBe(doc)
    expect(updateMaterial(doc, 'nope', { roughness: 0.3 })).toBe(doc)
  })

  it('starts from the preset when another one is chosen, and changes only what was touched otherwise', () => {
    const doc = starterDoc()
    const swapped = updateMaterial(doc, 'o1', { preset: 'chrome' })
    expect(swapped.objects[0].material).toEqual(materialFromPreset('chrome'))
    const tinted = updateMaterial(swapped, 'o1', { color: '#123456' })
    expect(tinted.objects[0].material.color).toBe('#123456')
    expect(tinted.objects[0].material.roughness).toBe(PRESETS.chrome.roughness)
  })

  it('refuses a colour that is not #rrggbb', () => {
    const doc = updateMaterial(starterDoc(), 'o1', { color: 'url(javascript:alert(1))' })
    expect(doc.objects[0].material.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(safeColor('red', '#000000')).toBe('#000000')
    expect(safeColor('#ABCDEF', '#000000')).toBe('#abcdef')
  })

  it('selects only what exists', () => {
    const doc = starterDoc()
    expect(selectObject(doc, 'nope')).toBe(doc)
    expect(selectObject(doc, null).selectedId).toBeNull()
    expect(selectObject(doc, 'o3').selectedId).toBe('o3')
  })
})

describe('removing and duplicating', () => {
  it('selects the neighbour of a removed selection, and nothing when the scene is empty', () => {
    let doc = withObjects(3)
    const [a, b, c] = doc.objects.map((object) => object.id)
    doc = selectObject(doc, b)
    doc = removeObject(doc, b)
    expect(doc.objects.map((object) => object.id)).toEqual([a, c])
    expect(doc.selectedId).toBe(c)
    doc = removeObject(removeObject(doc, c), a)
    expect(doc.objects).toHaveLength(0)
    expect(doc.selectedId).toBeNull()
    expect(removeObject(doc, 'nope')).toBe(doc)
  })

  it('keeps the selection when another object is removed', () => {
    const doc = starterDoc()
    expect(removeObject(doc, 'o1').selectedId).toBe(doc.selectedId)
  })

  it('makes an independent copy: a new id and name, moved aside, never locked', () => {
    const doc = updateObject(starterDoc(), 'o2', { locked: true })
    const next = duplicateObject(doc, 'o2')
    const copy = selectedObject(next)!
    const source = next.objects.find((object) => object.id === 'o2')!
    expect(copy.id).not.toBe('o2')
    expect(copy.name).not.toBe(source.name)
    expect(copy.locked).toBe(false)
    expect(copy.position[0]).toBeCloseTo(source.position[0] + 0.8)
    copy.material.color = '#000000'
    expect(source.material.color).not.toBe('#000000')
    expect(new Set(next.objects.map((object) => object.id)).size).toBe(next.objects.length)
  })
})

describe('reading a project from anywhere', () => {
  it('refuses what is not a project', () => {
    for (const raw of [
      null,
      undefined,
      'text',
      4,
      [],
      {},
      { version: 2, objects: [] },
      { version: 1 },
      { version: 1, objects: 'x' },
    ])
      expect(parseStudioDoc(raw), JSON.stringify(raw)).toBeNull()
  })

  it('never reads more objects than a scene may hold', () => {
    const objects = Array.from({ length: MAX_OBJECTS * 3 }, (_, i) => ({ id: `a${i}`, kind: 'sphere' }))
    expect(parseStudioDoc({ version: 1, objects })!.objects).toHaveLength(MAX_OBJECTS)
  })

  it('makes ids unique even when the file repeats one', () => {
    const doc = parseStudioDoc({ version: 1, objects: [{ id: 'same' }, { id: 'same' }, { id: 'same' }] })!
    expect(new Set(doc.objects.map((object) => object.id)).size).toBe(3)
  })

  it('cleans names, kinds, numbers and the selection', () => {
    const doc = parseStudioDoc({
      version: 1,
      selectedId: 'ghost',
      objects: [
        {
          id: '<script>',
          name: `  <b>x</b>\u0000${'y'.repeat(200)}`,
          kind: 'dragon',
          position: ['a', null, {}],
          scale: [-3, 1e9, 2],
          material: { preset: 'unobtainium', color: 'blue', opacity: -4, roughness: 9, emissive: 99 },
          custom: { sides: 1, twist: 1e6, taper: -1, slices: 1e6 },
        },
      ],
      lighting: { rig: 'disco', intensity: 99, azimuth: -50, elevation: 1000 },
    })!
    const object = doc.objects[0]
    expect(object.id).toMatch(/^[\w-]+$/)
    expect(object.name).not.toMatch(/[<>]/)
    expect(object.name.includes('\u0000')).toBe(false)
    expect(object.name.length).toBeLessThanOrEqual(MAX_NAME)
    expect(object.kind).toBe('cube')
    expect(object.position).toEqual([0, 0, 0])
    expect(object.scale[0]).toBe(SCALE_MIN)
    expect(object.scale[1]).toBe(SCALE_MAX)
    expect(MATERIAL_PRESETS).toContain(object.material.preset)
    expect(object.material.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(object.material.roughness).toBeLessThanOrEqual(1)
    expect(object.material.emissive).toBeLessThanOrEqual(2)
    expect(object.custom.sides).toBeGreaterThanOrEqual(3)
    expect(object.custom.slices).toBeLessThanOrEqual(24)
    expect(object.custom.taper).toBeGreaterThanOrEqual(0)
    expect(doc.selectedId).toBeNull()
    expect(LIGHT_RIGS).toContain(doc.lighting.rig)
    expect(doc.lighting.intensity).toBe(2)
    expect(doc.lighting.azimuth).toBe(0)
    expect(doc.lighting.elevation).toBe(85)
  })

  it('writes names that are short and free of markup', () => {
    expect(safeName('<img onerror=1>', 'x')).not.toMatch(/[<>]/)
    expect(safeName('   ', 'fallback')).toBe('fallback')
    expect(safeName(42, 'fallback')).toBe('fallback')
    expect(safeName('z'.repeat(500), 'f')).toHaveLength(MAX_NAME)
  })

  it('reads what it wrote: parse(serialize(x)) is x', () => {
    let doc = starterDoc()
    doc = addObject(doc, 'custom')
    doc = updateMaterial(doc, selectedObject(doc)!.id, { preset: 'digital-glass' })
    doc = setLighting(doc, { rig: 'dramatic-red', azimuth: 200, elevation: 20, intensity: 1.4 })
    expect(parseStudioDoc(JSON.parse(JSON.stringify(serializeStudioDoc(doc))))).toEqual(doc)
  })
})

describe('lighting', () => {
  it('keeps every value inside its range and ignores a rig that does not exist', () => {
    const doc = setLighting(starterDoc(), { intensity: 99, elevation: -4, azimuth: 720, rig: 'nope' as never })
    expect(doc.lighting.intensity).toBe(2)
    expect(doc.lighting.elevation).toBe(5)
    expect(doc.lighting.azimuth).toBe(360)
    expect(LIGHT_RIGS).toContain(doc.lighting.rig)
  })
})
