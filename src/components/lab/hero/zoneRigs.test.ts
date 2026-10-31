import { Color, Mesh, MeshLambertMaterial, Object3D, type BufferGeometry, type Material } from 'three'
import { describe, expect, it } from 'vitest'
import type { ScenePalette } from '../../hero/heroPalette'
import { WAKE_HALF_LIFE, buildZoneRigs, easeAwake, type RigFrame } from './zoneRigs'
import { ZONE_IDS } from './zones'

const dark: ScenePalette = {
  bg: new Color('#0b0b0d'),
  ink: new Color('#f4f0e8'),
  grid: new Color('#4a5072'),
  red: new Color('#ff161f'),
  blue: new Color('#445cff'),
  glow: 1,
  bloom: 0.8,
  additive: 1,
}
const light: ScenePalette = { ...dark, bg: new Color('#f4f0e8'), ink: new Color('#17171b'), additive: 0 }

const frame = (over: Partial<RigFrame> = {}): RigFrame => ({
  dt: 1 / 60,
  t: 0,
  awake: 0,
  lookX: 0,
  lookY: 0,
  motion: 1,
  autonomous: true,
  palette: dark,
  ...over,
})

function finiteEverywhere(root: Object3D): boolean {
  let ok = true
  root.traverse((object) => {
    for (const v of [...object.position.toArray(), ...object.rotation.toArray().slice(0, 3), ...object.scale.toArray()])
      if (typeof v === 'number' && !Number.isFinite(v)) ok = false
    const geometry = (object as Mesh).geometry as BufferGeometry | undefined
    const position = geometry?.getAttribute('position')
    if (position) for (const v of position.array) if (!Number.isFinite(v)) ok = false
  })
  return ok
}

function materialsOf(root: Object3D): Material[] {
  const found = new Set<Material>()
  root.traverse((object) => {
    const material = (object as Mesh).material as Material | Material[] | undefined
    if (Array.isArray(material)) material.forEach((m) => found.add(m))
    else if (material) found.add(material)
  })
  return [...found]
}

describe('the four zone objects', () => {
  it('are built in the Lab order, one for each zone', () => {
    const rigs = buildZoneRigs()
    expect(rigs.map((rig) => rig.id)).toEqual([...ZONE_IDS])
    rigs.forEach((rig) => rig.dispose())
  })

  it('stand inside one unit, so the scene can scale them by one number', () => {
    for (const rig of buildZoneRigs()) {
      rig.update(frame())
      let far = 0
      rig.group.traverse((object) => {
        if ((object as Mesh).isMesh) far = Math.max(far, object.getWorldPosition(object.position.clone()).length())
      })
      expect(far, rig.id).toBeLessThan(1.8)
      rig.dispose()
    }
  })

  it('stay finite through a long time asleep, awake and asleep again, in both themes', () => {
    for (const palette of [dark, light]) {
      for (const rig of buildZoneRigs()) {
        let awake = 0
        for (let i = 0; i < 1500; i++) {
          awake = easeAwake(awake, i > 400 && i < 1100 ? 1 : 0, 1 / 60)
          rig.update(frame({ t: i / 60, awake, lookX: Math.sin(i / 50), lookY: Math.cos(i / 70), palette }))
        }
        expect(finiteEverywhere(rig.group), rig.id).toBe(true)
        rig.dispose()
      }
    }
  })

  it('also work when nothing moves by itself (the calm view)', () => {
    for (const rig of buildZoneRigs()) {
      for (let i = 0; i < 200; i++)
        rig.update(frame({ t: i / 60, autonomous: false, motion: 0.35, awake: i > 100 ? 1 : 0 }))
      expect(finiteEverywhere(rig.group), rig.id).toBe(true)
      rig.dispose()
    }
  })

  it('take their colours from the theme', () => {
    const [studio] = buildZoneRigs()
    const solid = () => materialsOf(studio.group).find((m) => m instanceof MeshLambertMaterial) as MeshLambertMaterial
    studio.update(frame({ palette: dark }))
    const inDark = solid().color.getHex()
    studio.update(frame({ palette: light }))
    const inLight = solid().color.getHex()
    expect(inDark).not.toBe(inLight)
    studio.dispose()
  })

  it('wake up when the zone is awake: the studio comes apart, the others move', () => {
    const [studio, racing, architect, performance] = buildZoneRigs()
    const reach = (root: Object3D) => {
      let far = 0
      root.traverse((object) => {
        if ((object as Mesh).isMesh) far = Math.max(far, object.position.length())
      })
      return far
    }
    studio.update(frame({ awake: 0 }))
    const asleep = reach(studio.group)
    studio.update(frame({ awake: 1 }))
    expect(reach(studio.group)).toBeGreaterThan(asleep * 1.2)

    // The car covers ground only while awake (autonomous off).
    const car = (root: Object3D) => {
      const meshes: Object3D[] = []
      root.traverse((object) => {
        if ((object as Mesh).isMesh && object.parent?.children.length === 8) meshes.push(object)
      })
      return meshes
    }
    // The car stands on its starting place once the rig has had its first frame.
    racing.update(frame({ autonomous: false, awake: 0 }))
    expect(car(racing.group).length).toBeGreaterThan(0)
    const before = car(racing.group)[0].parent!.position.clone()
    for (let i = 0; i < 120; i++) racing.update(frame({ t: i / 60, autonomous: false, awake: 0 }))
    const idle = car(racing.group)[0].parent!.position.clone()
    for (let i = 0; i < 120; i++) racing.update(frame({ t: i / 60, autonomous: false, awake: 1 }))
    const driven = car(racing.group)[0].parent!.position.clone()
    expect(idle.distanceTo(before)).toBeLessThan(1e-6)
    expect(driven.distanceTo(idle)).toBeGreaterThan(0.1)

    // The architect's line and the performance gauge change with time while awake.
    const signature = (root: Object3D) => {
      const parts: number[] = []
      root.traverse((object) => {
        const position = ((object as Mesh).geometry as BufferGeometry | undefined)?.getAttribute('position')
        if (position && (object as Object3D & { isLine?: boolean }).isLine)
          for (let i = 0; i < Math.min(position.array.length, 30); i++) parts.push(position.array[i])
      })
      return parts.join(',')
    }
    architect.update(frame({ t: 0, awake: 1 }))
    const a0 = signature(architect.group)
    architect.update(frame({ t: 1.3, awake: 1 }))
    expect(signature(architect.group)).not.toBe(a0)
    performance.update(frame({ t: 0, awake: 1 }))
    const p0 = signature(performance.group)
    performance.update(frame({ t: 0.9, awake: 1 }))
    expect(signature(performance.group)).not.toBe(p0)
    ;[studio, racing, architect, performance].forEach((rig) => rig.dispose())
  })

  it('release every geometry and material they made', () => {
    for (const rig of buildZoneRigs()) {
      const geometries = new Set<BufferGeometry>()
      rig.group.traverse((object) => {
        const geometry = (object as Mesh).geometry as BufferGeometry | undefined
        if (geometry) geometries.add(geometry)
      })
      const materials = materialsOf(rig.group)
      let disposed = 0
      for (const geometry of geometries) geometry.addEventListener('dispose', () => disposed++)
      for (const material of materials) material.addEventListener('dispose', () => disposed++)
      rig.dispose()
      expect(disposed, rig.id).toBe(geometries.size + materials.length)
    }
  })
})

describe('waking', () => {
  it('eases: halfway in about the half-life, never overshooting', () => {
    let value = 0
    for (let i = 0; i < Math.round(WAKE_HALF_LIFE * 60); i++) value = easeAwake(value, 1, 1 / 60)
    expect(value).toBeGreaterThan(0.4)
    expect(value).toBeLessThan(0.7)
    for (let i = 0; i < 600; i++) value = easeAwake(value, 1, 1 / 60)
    expect(value).toBeLessThanOrEqual(1)
    expect(value).toBeGreaterThan(0.999)
  })
})
