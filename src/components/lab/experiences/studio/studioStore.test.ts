import { beforeEach, describe, expect, it } from 'vitest'
import { addObject, emptyDoc, starterDoc, updateObject } from './studioDoc'
import { GEN_DEFAULTS, isGenerated } from './studioGenerator'
import {
  applyGenerator,
  commit,
  createStudioState,
  createUnexpected,
  generator,
  hasGenerated,
  pushHistory,
  redo,
  replaceDoc,
  select,
  setGenerator,
  studio,
  transient,
  undo,
} from './studioStore'

const count = () => studio.get().doc.objects.length
const generated = () => studio.get().doc.objects.filter((object) => isGenerated(object.name)).length

beforeEach(() => {
  studio.set(() => createStudioState(starterDoc()))
  generator.set(() => ({ ...GEN_DEFAULTS }))
})

describe('undo and redo', () => {
  it('step back and forward through committed edits', () => {
    commit(addObject(studio.get().doc, 'cube'))
    commit(addObject(studio.get().doc, 'cone'))
    expect(count()).toBe(5)
    undo()
    expect(count()).toBe(4)
    undo()
    expect(count()).toBe(3)
    undo()
    expect(count()).toBe(3)
    redo()
    redo()
    expect(count()).toBe(5)
    redo()
    expect(count()).toBe(5)
  })

  it('drop what could be redone as soon as there is a new edit', () => {
    commit(addObject(studio.get().doc, 'cube'))
    undo()
    commit(addObject(studio.get().doc, 'torus'))
    expect(studio.get().future).toHaveLength(0)
    redo()
    expect(studio.get().doc.objects.at(-1)?.kind).toBe('torus')
  })

  it('keep only the last sixty steps', () => {
    for (let i = 0; i < 100; i++) commit(updateObject(studio.get().doc, 'o1', { name: `n${i}` }))
    expect(studio.get().past).toHaveLength(60)
  })

  it('treat a drag as one step: transient changes, one pushHistory at the end', () => {
    const before = studio.get().doc
    for (let i = 1; i <= 20; i++) transient(updateObject(studio.get().doc, 'o1', { position: [i, 0, 0] }))
    expect(studio.get().past).toHaveLength(0)
    pushHistory(before)
    expect(studio.get().past).toHaveLength(1)
    undo()
    expect(studio.get().doc.objects[0].position[0]).toBe(0)
  })

  it('never record a selection as an edit', () => {
    select('o3')
    expect(studio.get().doc.selectedId).toBe('o3')
    expect(studio.get().past).toHaveLength(0)
  })

  it('are cleared when a whole project is loaded', () => {
    commit(addObject(studio.get().doc, 'cube'))
    replaceDoc(emptyDoc(), 'loaded')
    expect(studio.get().past).toHaveLength(0)
    expect(studio.get().message).toBe('loaded')
    undo()
    expect(count()).toBe(0)
  })
})

describe('the generator in the studio', () => {
  it('builds from its numbers and leaves the hand-made objects', () => {
    setGenerator({ complexity: 4, symmetry: 2 })
    expect(hasGenerated()).toBe(false)
    expect(applyGenerator()).toBe(8)
    expect(hasGenerated()).toBe(true)
    expect(count()).toBe(3 + 8)
    expect(studio.get().doc.selectedId).toBeNull()
  })

  it('makes a whole session of tweaking one undo step', () => {
    applyGenerator()
    for (const complexity of [3, 5, 8, 4]) {
      setGenerator({ complexity })
      applyGenerator()
    }
    expect(studio.get().past).toHaveLength(1)
    expect(generated()).toBe(4 * GEN_DEFAULTS.symmetry)
    undo()
    expect(count()).toBe(3)
    expect(hasGenerated()).toBe(false)
  })

  it('starts a new undo step once something else has been edited in between', () => {
    applyGenerator()
    commit(updateObject(studio.get().doc, 'o1', { name: 'Edited' }))
    setGenerator({ complexity: 3 })
    applyGenerator()
    expect(studio.get().past).toHaveLength(3)
    undo()
    expect(studio.get().doc.objects.find((object) => object.id === 'o1')?.name).toBe('Edited')
    expect(generated()).toBe(GEN_DEFAULTS.complexity * GEN_DEFAULTS.symmetry)
  })

  it('keeps the numbers inside their ranges', () => {
    setGenerator({ complexity: 1e6, variation: -3, symmetry: 7, seed: NaN })
    const { complexity, variation, symmetry, seed } = generator.get()
    expect(complexity).toBe(14)
    expect(variation).toBe(0)
    expect(symmetry).toBe(GEN_DEFAULTS.symmetry)
    expect(seed).toBe(GEN_DEFAULTS.seed)
  })

  it('makes a whole new scene that Undo takes back, with the numbers it was built from', () => {
    const before = studio.get().doc
    const scene = createUnexpected(77)
    expect(studio.get().doc).toBe(scene)
    expect(scene.objects[0].name).toBe('Floor')
    expect(generator.get().seed).toBe(77)
    undo()
    expect(studio.get().doc).toBe(before)
  })

  it('lets the sliders reshape an unexpected scene without a new undo step', () => {
    createUnexpected(5)
    const steps = studio.get().past.length
    setGenerator({ complexity: 3 })
    applyGenerator()
    expect(studio.get().past).toHaveLength(steps)
    expect(studio.get().doc.objects[0].name).toBe('Floor')
  })
})
