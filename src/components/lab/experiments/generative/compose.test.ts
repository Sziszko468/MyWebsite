import { describe, expect, it } from 'vitest'
import { Box3, Vector3, type BufferGeometry, type Mesh, type MeshStandardMaterial } from 'three'
import { composeObject, meshesOf } from './compose'
import { EXAMPLES } from './ideas'
import { interpret } from './interpret'
import { LANGS } from './lexicon'
import {
  ACCESSORIES,
  BUILDS,
  CONCEPTS,
  DEFAULT_LOOK,
  MATERIALS,
  MOODS,
  POSES,
  PROPS,
  defaultSpec,
  isVehicle,
  type ConceptId,
  type ObjectSpec,
} from './spec'

const VEHICLES = CONCEPTS.filter(isVehicle)
const BODIES = CONCEPTS.filter((id) => !isVehicle(id))

function check(spec: ObjectSpec, seed = 7) {
  const composed = composeObject(spec, seed)
  const meshes = meshesOf(composed.root)
  expect(meshes.length, JSON.stringify(spec)).toBeGreaterThan(3)
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position')
    expect(position.count).toBeGreaterThan(0)
    for (let i = 0; i < position.count; i++) {
      const sum = position.getX(i) + position.getY(i) + position.getZ(i)
      if (!Number.isFinite(sum)) throw new Error(`${spec.main}: a vertex is not a number`)
    }
  }
  composed.root.updateMatrixWorld(true)
  const size = new Box3().setFromObject(composed.root).getSize(new Vector3())
  expect(size.y, JSON.stringify(spec)).toBeGreaterThan(0.3)
  expect(Math.max(size.x, size.y, size.z), JSON.stringify(spec)).toBeLessThan(14)
  composed.applyLook({ ...DEFAULT_LOOK })
  for (let t = 0; t < 3; t += 0.37) composed.update(t, 1)
  return { composed, meshes }
}

describe('building a creation', () => {
  it.each(CONCEPTS)('%s builds on its own: real geometry, finite, a sane size', (id) => {
    check(defaultSpec(id)).composed.dispose()
  })

  it('builds every body as a rider on every vehicle, and as a thing turned into every vehicle', { timeout: 60_000 }, () => {
    for (const id of BODIES) {
      for (const vehicle of VEHICLES) {
        check({ ...defaultSpec(id), vehicle, pose: 'drive' }).composed.dispose()
        check({ ...defaultSpec(id), kit: vehicle }).composed.dispose()
      }
    }
  })

  it('puts another thing on as a head, for every body', { timeout: 60_000 }, () => {
    for (const id of BODIES) {
      check({ ...defaultSpec(id), headOf: 'coffeemachine', mood: 'sad' }).composed.dispose()
      check({ ...defaultSpec('robot'), headOf: id }).composed.dispose()
    }
  })

  it('wears every accessory and holds every prop, in every mood, pose and build', { timeout: 60_000 }, () => {
    const mains: ConceptId[] = ['banana', 'frog', 'robot', 'fridge', 'shark', 'cactus', 'spaceship']
    for (const main of mains) {
      for (let from = 0; from < ACCESSORIES.length; from += 7) {
        check({
          ...defaultSpec(main),
          accessories: ACCESSORIES.slice(from, from + 7) as unknown as ObjectSpec['accessories'],
          props: PROPS.slice(from % 9, (from % 9) + 3) as unknown as ObjectSpec['props'],
        }).composed.dispose()
      }
    }
    for (const mood of MOODS)
      for (const pose of POSES) for (const build of BUILDS) check({ ...defaultSpec('dinosaur'), mood, pose, build }).composed.dispose()
  })

  it('builds every example of the brief in every language, and puts companions beside the main thing', { timeout: 60_000 }, () => {
    for (const example of EXAMPLES) for (const lang of LANGS) check(interpret(example[lang]).spec).composed.dispose()
    check({ ...defaultSpec('cat'), companions: ['frog', 'spaceship'] }).composed.dispose()
  })

  it('makes the same object from the same seed and a different one from another', () => {
    const shape = (seed: number) => {
      const { composed, meshes } = check(defaultSpec('frog'), seed)
      const out =
        meshes.length +
        ':' +
        meshes
          .slice(0, 12)
          .map((m) => m.position.x.toFixed(3) + (m.material as MeshStandardMaterial).color.getHexString())
          .join(',')
      composed.dispose()
      return out
    }
    expect(shape(5)).toBe(shape(5))
    expect(shape(5)).not.toBe(shape(6))
  })

  it('dresses every recolourable part for each material and colour, and leaves eyes and tyres alone', () => {
    const composed = composeObject({ ...defaultSpec('frog'), accessories: ['sunglasses'] }, 3)
    const meshes = meshesOf(composed.root)
    const fixed = meshes.filter((m) => m.userData.paint === 'fixed')
    const before = fixed.map((m) => (m.material as MeshStandardMaterial).color.getHex())
    expect(fixed.length).toBeGreaterThan(5)
    for (const material of MATERIALS) {
      composed.applyLook({ ...DEFAULT_LOOK, material, colour: '#3355ff' })
      composed.applyLook({ ...DEFAULT_LOOK, material, colour: null })
    }
    expect(fixed.map((m) => (m.material as MeshStandardMaterial).color.getHex())).toEqual(before)
    composed.applyLook({ ...DEFAULT_LOOK, material: 'gold' })
    const body = meshes.find((m) => m.userData.paint === 'main')!
    expect((body.material as MeshStandardMaterial).metalness).toBe(1)
    composed.applyLook({ ...DEFAULT_LOOK, material: 'neon', colour: '#ff0000' })
    expect((body.material as MeshStandardMaterial).emissive.getHexString()).toBe('ff0000')
    composed.applyLook({ ...DEFAULT_LOOK, scale: 1.5 })
    expect(composed.root.scale.x).toBe(1.5)
    composed.dispose()
  })

  it('stands on the floor and is centred, whatever it is', { timeout: 60_000 }, () => {
    for (const id of CONCEPTS) {
      // Measured as built, before any animation: a turning wheel or a swinging arm moves a box's corners.
      const composed = composeObject(defaultSpec(id), 7)
      composed.root.updateMatrixWorld(true)
      const box = new Box3().setFromObject(composed.root)
      expect(Math.abs(box.min.y), id).toBeLessThan(0.02)
      expect(Math.abs((box.min.x + box.max.x) / 2), id).toBeLessThan(0.02)
      expect(Math.abs((box.min.z + box.max.z) / 2), id).toBeLessThan(0.02)
      composed.dispose()
    }
  })

  it('releases its geometry and materials when it is disposed', () => {
    const composed = composeObject({ ...defaultSpec('robot'), accessories: ['crown'], props: ['coffee'] }, 1)
    const meshes = meshesOf(composed.root)
    let geometries = 0
    let materials = 0
    for (const mesh of meshes) {
      mesh.geometry.addEventListener('dispose', () => geometries++)
      ;(mesh.material as MeshStandardMaterial).addEventListener('dispose', () => materials++)
    }
    const count = meshes.length
    composed.dispose()
    expect(geometries).toBe(count)
    expect(materials).toBe(count)
    expect(meshesOf(composed.root)).toHaveLength(0)
  })

  it('keeps the number of draw calls and triangles reasonable', { timeout: 60_000 }, () => {
    let worst = 0
    for (const id of CONCEPTS) {
      const { composed, meshes } = check({ ...defaultSpec(id), accessories: ['crown', 'sunglasses', 'cape'], props: ['globe', 'trophy'] })
      worst = Math.max(worst, meshes.length)
      let triangles = 0
      for (const mesh of meshes as Mesh[]) {
        const geometry = mesh.geometry as BufferGeometry
        triangles += (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3
      }
      expect(triangles, id).toBeLessThan(120_000)
      composed.dispose()
    }
    expect(worst).toBeLessThan(400)
  })
})
