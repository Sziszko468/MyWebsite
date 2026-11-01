import { Group, Quaternion, Vector3 } from 'three'
import {
  BLACK,
  DARK,
  GLASS,
  RUBBER,
  STEEL,
  WHITE,
  ball,
  box,
  cone,
  cyl,
  ellipsoid,
  glow,
  lathe,
  slab,
  torus,
  type Fixed,
  type Painter,
} from './kit'

/** A vehicle: built along +z (forward) with its wheels under it; a rider sits at `seat`. */
export interface VehicleBuilt {
  root: Group
  seat: Vector3
  width: number
  height: number
  length: number
  tick: Array<(time: number, motion: number) => void>
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
const FLAME: Fixed = { colour: 0xff8a2a, glow: 2.2, opacity: 0.9 }
const FLAME_CORE: Fixed = { colour: 0xffe08a, glow: 2.4 }

/** A wheel that spins about x. It registers its own spin with the vehicle. */
function wheel(p: Painter, parent: Group, tick: VehicleBuilt['tick'], x: number, y: number, z: number, r: number, w: number) {
  const group = new Group()
  group.position.set(x, y, z)
  parent.add(group)
  const tyre = p.put(group, cyl(r, r, w, 28), RUBBER)
  tyre.rotation.z = Math.PI / 2
  const rim = p.put(group, cyl(r * 0.62, r * 0.62, w * 1.04, 20), STEEL)
  rim.rotation.z = Math.PI / 2
  for (let i = 0; i < 5; i++) {
    const spoke = p.put(group, box(w * 1.08, r * 0.1, r * 1.0, 0.01), DARK)
    spoke.rotation.x = (i / 5) * Math.PI
  }
  tick.push((t, m) => {
    group.rotation.x = -t * 5 * m
  })
  return group
}

/** A bar between two points. */
function bar(p: Painter, parent: Group, a: Vector3, b: Vector3, r: number, paint: Parameters<Painter['mesh']>[1]) {
  const length = a.distanceTo(b)
  const mesh = p.put(parent, cyl(r, r, length, 10), paint, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize()))
  return mesh
}

function flame(p: Painter, parent: Group, tick: VehicleBuilt['tick'], x: number, y: number, z: number, size: number, direction: 'back' | 'down') {
  const outer = p.put(parent, cone(size * 0.5, size * 1.8, 14), FLAME, x, y, z)
  const inner = p.put(parent, cone(size * 0.28, size * 1.1, 12), FLAME_CORE, x, y, z)
  for (const part of [outer, inner]) {
    if (direction === 'back') part.rotation.x = -Math.PI / 2
    else part.rotation.x = Math.PI
  }
  const length = size * 0.9
  outer.position[direction === 'back' ? 'z' : 'y'] -= length
  inner.position[direction === 'back' ? 'z' : 'y'] -= length * 0.6
  tick.push((t, m) => {
    const k = 1 + Math.sin(t * 38 + x * 9) * 0.12 * m
    outer.scale.set(1, k, 1)
    inner.scale.set(1, 1 + Math.sin(t * 47) * 0.1 * m, 1)
  })
}

export function sportscar(p: Painter, open: boolean): VehicleBuilt {
  const root = new Group()
  const tick: VehicleBuilt['tick'] = []
  p.put(root, box(1.72, 0.5, 3.9, 0.22), 'main', 0, 0.62, 0)
  p.put(root, box(1.4, 0.2, 1.3, 0.1), 'main', 0, 0.9, 1.15)
  p.put(root, box(0.3, 0.02, 3.8, 0.005), 'accent', 0, 0.9, 0.0).scale.y = 1
  if (open) {
    const windshield = p.put(root, box(1.34, 0.5, 0.05, 0.02), GLASS, 0, 1.08, 0.5)
    windshield.rotation.x = -0.55
    p.put(root, box(1.1, 0.12, 0.8, 0.06), DARK, 0, 0.93, -0.5)
    const wheelRing = p.put(root, torus(0.2, 0.025, Math.PI * 2, 8, 24), BLACK, 0, 1.05, 0.28)
    wheelRing.rotation.x = -0.7
  } else {
    p.put(root, box(1.34, 0.5, 1.7, 0.25), GLASS, 0, 1.0, -0.3)
    p.put(root, box(1.3, 0.07, 1.5, 0.05), 'main', 0, 1.27, -0.3)
  }
  for (const x of [-1, 1]) {
    wheel(p, root, tick, 0.88 * x, 0.4, 1.28, 0.4, 0.3)
    wheel(p, root, tick, 0.88 * x, 0.4, -1.28, 0.4, 0.3)
    p.put(root, ball(0.13, 12, 8), glow(0xfff4c8, 2), 0.55 * x, 0.72, 1.92)
    p.put(root, box(0.3, 0.1, 0.05, 0.01), glow(0xff2a2a, 1.6), 0.6 * x, 0.72, -1.95)
    p.put(root, cyl(0.06, 0.06, 0.4, 10), STEEL, 0.4 * x, 0.35, -1.9).rotation.x = Math.PI / 2
    p.put(root, box(0.06, 0.3, 0.06, 0.01), DARK, 0.5 * x, 1.12, -1.7)
  }
  p.put(root, box(1.6, 0.07, 0.42, 0.02), 'accent', 0, 1.3, -1.78)
  return { root, seat: v(0, 0.92, -0.45), width: 1.9, height: 1.3, length: 4, tick }
}

export function racecar(p: Painter): VehicleBuilt {
  const root = new Group()
  const tick: VehicleBuilt['tick'] = []
  p.put(root, ellipsoid(0.46, 0.3, 1.8, 24, 14), 'main', 0, 0.6, -0.1)
  p.put(root, ellipsoid(0.2, 0.17, 1.1, 18, 10), 'main', 0, 0.45, 1.75)
  p.put(root, ellipsoid(0.28, 0.34, 0.8, 16, 10), 'accent', 0, 0.85, -1.0)
  for (const x of [-1, 1]) {
    p.put(root, box(0.42, 0.34, 1.2, 0.12), 'main', 0.62 * x, 0.5, -0.1)
    wheel(p, root, tick, 1.0 * x, 0.42, -1.35, 0.45, 0.46)
    wheel(p, root, tick, 0.95 * x, 0.38, 1.4, 0.4, 0.38)
    p.put(root, box(0.04, 0.3, 0.5, 0.01), 'accent', 0.92 * x, 0.28, 2.2)
    p.put(root, box(0.04, 0.4, 0.55, 0.01), 'accent', 0.7 * x, 1.18, -1.95)
  }
  p.put(root, box(1.9, 0.05, 0.42, 0.01), 'accent', 0, 0.2, 2.2)
  p.put(root, box(1.45, 0.07, 0.5, 0.02), 'accent', 0, 1.2, -1.95)
  p.put(root, box(0.06, 0.4, 0.1, 0.01), DARK, 0, 1.0, -1.9)
  p.put(root, torus(0.26, 0.03, Math.PI, 8, 20), DARK, 0, 0.98, 0.35).rotation.set(0, 0, 0)
  p.put(root, box(0.1, 0.18, 0.3, 0.04), WHITE, 0, 0.63, 0.65)
  return { root, seat: v(0, 0.78, -0.05), width: 2.3, height: 1.1, length: 4.6, tick }
}

export function spaceship(p: Painter): VehicleBuilt {
  const root = new Group()
  const tick: VehicleBuilt['tick'] = []
  const body = p.put(
    root,
    lathe(
      [
        [0.001, -1.7],
        [0.45, -1.55],
        [0.62, -0.9],
        [0.66, 0.1],
        [0.48, 1.1],
        [0.2, 1.85],
        [0.001, 2.1],
      ],
      32,
    ),
    'main',
    0,
    0.8,
    0.2,
  )
  body.rotation.x = Math.PI / 2
  p.put(root, ellipsoid(0.46, 0.4, 0.95, 20, 14), GLASS, 0, 1.15, 0.65)
  for (const x of [-1, 1]) {
    const wing = p.put(root, slab([[0, 0.9], [1.6, -0.9], [1.6, -1.25], [0, -0.7]], 0.09, 0.03), 'accent', 0.5 * x, 0.72, 0)
    wing.rotation.set(Math.PI / 2, 0, x === 1 ? 0 : Math.PI)
    if (x === -1) wing.position.x = -0.5
    p.put(root, cyl(0.16, 0.2, 0.55, 16), STEEL, 0.3 * x, 0.78, -1.5).rotation.x = Math.PI / 2
    flame(p, root, tick, 0.3 * x, 0.78, -1.78, 0.2, 'back')
  }
  const fin = p.put(root, slab([[0, 0], [0.9, 0], [0.2, 0.9]], 0.08, 0.02), 'accent', 0, 1.3, -1.2)
  fin.rotation.y = -Math.PI / 2
  return { root, seat: v(0, 1.05, 0.55), width: 3.4, height: 1.9, length: 4.3, tick }
}

export function rocket(p: Painter): VehicleBuilt {
  const root = new Group()
  const tick: VehicleBuilt['tick'] = []
  const body = p.put(
    root,
    lathe(
      [
        [0.001, -1.8],
        [0.4, -1.7],
        [0.5, -1.0],
        [0.5, 0.7],
        [0.42, 1.5],
        [0.2, 2.2],
        [0.001, 2.55],
      ],
      30,
    ),
    WHITE,
    0,
    0.75,
    0.25,
  )
  body.rotation.x = Math.PI / 2
  const nose = p.put(root, cone(0.27, 0.8, 24), 'main', 0, 0.75, 2.4)
  nose.rotation.x = Math.PI / 2
  for (let i = 0; i < 4; i++) {
    const fin = p.put(root, slab([[0, 0], [0.7, -0.5], [0.7, -0.95], [0, -0.7]], 0.07, 0.02), 'main', 0, 0.75, -1.2)
    fin.rotation.set(0, Math.PI / 2, (i / 4) * Math.PI * 2)
  }
  p.put(root, cyl(0.22, 0.3, 0.3, 18), STEEL, 0, 0.75, -1.65).rotation.x = Math.PI / 2
  flame(p, root, tick, 0, 0.75, -1.8, 0.32, 'back')
  return { root, seat: v(0, 1.3, 0.1), width: 1.9, height: 1.4, length: 4.4, tick }
}

export function ufo(p: Painter): VehicleBuilt {
  const root = new Group()
  const tick: VehicleBuilt['tick'] = []
  p.put(
    root,
    lathe(
      [
        [0.001, 0.1],
        [0.8, 0.12],
        [1.7, 0.3],
        [2.0, 0.5],
        [1.6, 0.66],
        [0.9, 0.75],
      ],
      40,
    ),
    'main',
    0,
    0.25,
    0,
  )
  const dome = p.put(root, ball(0.82, 28, 14), GLASS, 0, 1.0, 0)
  dome.scale.set(1, 0.85, 1)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    p.put(root, ball(0.09, 10, 8), glow(i % 2 ? 0xffd24a : 0x4dffb0, 1.8), Math.sin(a) * 1.75, 0.62, Math.cos(a) * 1.75)
  }
  const beam = p.put(root, cone(1.3, 1.6, 28), { colour: 0xb7ffe8, glow: 0.8, opacity: 0.14 }, 0, -0.55, 0)
  beam.rotation.x = Math.PI
  tick.push((t, m) => {
    root.position.y = Math.sin(t * 2) * 0.05 * m
    root.rotation.y = Math.sin(t * 0.8) * 0.06 * m
  })
  return { root, seat: v(0, 0.75, 0), width: 4, height: 1.9, length: 4, tick }
}

export function bicycle(p: Painter): VehicleBuilt {
  const root = new Group()
  const tick: VehicleBuilt['tick'] = []
  for (const z of [-0.95, 0.95]) {
    const tyre = p.put(root, torus(0.55, 0.05, Math.PI * 2, 10, 36), RUBBER, 0, 0.6, z)
    tyre.rotation.y = Math.PI / 2
    const spin = new Group()
    spin.position.set(0, 0.6, z)
    root.add(spin)
    for (let i = 0; i < 6; i++) {
      const spoke = p.put(spin, cyl(0.008, 0.008, 1.08, 4), STEEL)
      spoke.rotation.x = (i / 6) * Math.PI
    }
    tick.push((t, m) => {
      spin.rotation.x = -t * 4 * m
    })
  }
  const rear = v(0, 0.6, -0.95)
  const seat = v(0, 1.25, -0.5)
  const bottom = v(0, 0.55, -0.05)
  const head = v(0, 1.2, 0.6)
  const front = v(0, 0.6, 0.95)
  for (const [a, b] of [
    [bottom, seat],
    [bottom, rear],
    [seat, rear],
    [bottom, head],
    [seat, head],
    [head, front],
  ] as const)
    bar(p, root, a, b, 0.035, 'main')
  p.put(root, box(0.62, 0.035, 0.035, 0.01), DARK, 0, 1.42, 0.62)
  p.put(root, box(0.2, 0.07, 0.4, 0.03), DARK, 0, 1.32, -0.55)
  return { root, seat: v(0, 1.3, -0.5), width: 0.7, height: 1.5, length: 2.2, tick }
}

export function buildVehicle(id: string, p: Painter, open: boolean): VehicleBuilt {
  switch (id) {
    case 'racecar':
      return racecar(p)
    case 'spaceship':
      return spaceship(p)
    case 'rocket':
      return rocket(p)
    case 'ufo':
      return ufo(p)
    case 'bicycle':
      return bicycle(p)
    default:
      return sportscar(p, open)
  }
}

/** What a body needs to be turned into a vehicle: the parts and how far the body must rise to make room. */
export interface KitBuilt {
  group: Group
  lift: number
  tick: Array<(time: number, motion: number) => void>
}

/**
 * The parts that turn something into a vehicle: wheels and a spoiler for a car, wings and thrusters
 * for a spaceship, fins and a flame for a rocket, a saucer ring for a UFO, wheels for a bicycle. They
 * are sized from the thing's own bounds (`w` wide, `h` tall, `d` deep, facing +z).
 */
export function buildKit(id: string, p: Painter, w: number, h: number, d: number): KitBuilt {
  const group = new Group()
  const tick: KitBuilt['tick'] = []
  switch (id) {
    case 'sportscar':
    case 'racecar': {
      const r = Math.min(0.52, Math.max(0.3, h * 0.2))
      const lift = r * 1.1
      const wx = w / 2 + r * 0.25
      for (const x of [-1, 1]) {
        wheel(p, group, tick, wx * x, r, d * 0.3, r, r * 0.75)
        wheel(p, group, tick, wx * x, r, -d * 0.3, r, r * 0.75)
        p.put(group, ball(0.045, 12, 8), glow(0xfff4c8, 2), w * 0.3 * x, lift + h * 0.28, d / 2 + 0.03)
        p.put(group, box(0.3, 0.1, 0.05, 0.01), glow(0xff2a2a, 1.6), w * 0.3 * x, lift + h * 0.28, -d / 2 - 0.03)
        p.put(group, cyl(0.06, 0.06, 0.4, 10), STEEL, w * 0.2 * x, lift + 0.12, -d / 2 - 0.1).rotation.x = Math.PI / 2
        p.put(group, box(0.06, 0.3, 0.06, 0.01), DARK, w * 0.36 * x, lift + h + 0.13, -d / 2 + 0.2)
      }
      p.put(group, box(w * 0.95, 0.07, 0.42, 0.02), 'accent', 0, lift + h + 0.3, -d / 2 + 0.2)
      return { group, lift, tick }
    }
    case 'spaceship': {
      const lift = 0.45
      for (const x of [-1, 1]) {
        const wing = p.put(group, slab([[0, d * 0.3], [w * 1.0, -d * 0.35], [w * 1.0, -d * 0.55], [0, -d * 0.2]], 0.09, 0.03), 'accent', (w / 2) * x, lift + h * 0.35, 0)
        wing.rotation.set(Math.PI / 2, 0, x === 1 ? 0 : Math.PI)
        p.put(group, cyl(0.16, 0.2, 0.5, 16), STEEL, w * 0.26 * x, lift + h * 0.3, -d / 2 - 0.1).rotation.x = Math.PI / 2
        flame(p, group, tick, w * 0.26 * x, lift + h * 0.3, -d / 2 - 0.35, 0.2, 'back')
      }
      const canopy = p.put(group, ball(w * 0.3, 20, 12), GLASS, 0, lift + h * 0.82, d * 0.1)
      canopy.scale.set(1, 0.8, 1.4)
      const fin = p.put(group, slab([[0, 0], [d * 0.4, 0], [d * 0.1, h * 0.5]], 0.08, 0.02), 'accent', 0, lift + h * 0.9, -d * 0.3)
      fin.rotation.y = -Math.PI / 2
      return { group, lift, tick }
    }
    case 'rocket': {
      const lift = 1.0
      const nose = p.put(group, cone(w * 0.42, w * 0.9, 24), 'accent', 0, lift + h + w * 0.45, 0)
      nose.scale.z = Math.max(0.6, d / w)
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2
        const fin = p.put(group, slab([[0, 0], [0.7, -0.4], [0.7, -0.9], [0, -0.7]], 0.07, 0.02), 'accent', Math.sin(a) * w * 0.52, lift + h * 0.2, Math.cos(a) * d * 0.52)
        fin.rotation.set(0, a + Math.PI / 2, 0)
        fin.scale.set(1, 1.5, 1)
      }
      p.put(group, cyl(w * 0.2, w * 0.3, 0.4, 18), STEEL, 0, lift - 0.15, 0)
      flame(p, group, tick, 0, lift - 0.4, 0, 0.45, 'down')
      return { group, lift, tick }
    }
    case 'ufo': {
      const lift = 0.7
      const ring = p.put(group, torus(Math.max(w, d) * 0.72, 0.18, Math.PI * 2, 12, 48), STEEL, 0, lift + h * 0.45, 0)
      ring.rotation.x = Math.PI / 2
      ring.scale.z = 0.55
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2
        const R = Math.max(w, d) * 0.72
        p.put(group, ball(0.07, 8, 6), glow(i % 2 ? 0xffd24a : 0x4dffb0, 1.8), Math.sin(a) * R, lift + h * 0.45, Math.cos(a) * R)
      }
      const beam = p.put(group, cone(Math.max(w, d) * 0.7, lift + 0.8, 24), { colour: 0xb7ffe8, glow: 0.8, opacity: 0.14 }, 0, (lift - 0.8) / 2, 0)
      beam.rotation.x = Math.PI
      return { group, lift, tick }
    }
    default: {
      const r = Math.max(0.42, h * 0.2)
      const lift = r * 0.9
      for (const z of [-1, 1]) {
        const tyre = p.put(group, torus(r, 0.06, Math.PI * 2, 10, 36), RUBBER, 0, r, z * d * 0.38)
        tyre.rotation.y = Math.PI / 2
        const spin = new Group()
        spin.position.set(0, r, z * d * 0.38)
        group.add(spin)
        for (let i = 0; i < 6; i++) p.put(spin, cyl(0.01, 0.01, r * 2, 4), STEEL).rotation.x = (i / 6) * Math.PI
        tick.push((t, m) => {
          spin.rotation.x = -t * 4 * m
        })
      }
      p.put(group, box(0.7, 0.04, 0.04, 0.01), DARK, 0, lift + h * 0.7, d / 2 + 0.05)
      return { group, lift, tick }
    }
  }
}
