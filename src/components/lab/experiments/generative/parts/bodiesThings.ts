import { BufferGeometry, Group, SphereGeometry, Vector3 } from 'three'
import {
  BLACK,
  DARK,
  GLASS,
  RED,
  RUBBER,
  STEEL,
  WHITE,
  ball,
  box,
  capsule,
  cone,
  createBuilt,
  cyl,
  ellipsoid,
  glow,
  lathe,
  slab,
  sweep,
  torus,
  type Fixed,
} from './kit'
import { addLimbs, setFace, setSize, type BodyBuilder } from './bodiesFoodAnimals'

const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
const GREY: Fixed = { colour: 0x6b7280, rough: 0.4, metal: 0.6 }
const SKIN: Fixed = { colour: 0xf0c8a0, rough: 0.6 }

// ── Machines and objects ────────────────────────────────────────────────────

export const robot: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, box(0.95, 1.05, 0.62, 0.1), 'main', 0, 1.4, 0)
  p.put(b.core, box(0.62, 0.38, 0.05, 0.03), DARK, 0, 1.45, 0.32)
  for (let i = 0; i < 3; i++) p.put(b.core, ball(0.045, 10, 8), glow([0xff3d4a, 0xffd24a, 0x4dff9a][i], 1.8), (i - 1) * 0.18, 1.45, 0.36)
  p.put(b.core, box(0.8, 0.14, 0.5, 0.04), 'accent', 0, 0.84, 0)
  const head = new Group()
  b.core.add(head)
  b.headParts = head
  p.put(head, box(0.74, 0.58, 0.58, 0.1), 'main', 0, 2.3, 0)
  p.put(head, box(0.6, 0.3, 0.04, 0.02), DARK, 0, 2.32, 0.3)
  for (const side of [-1, 1]) p.put(head, cyl(0.07, 0.07, 0.16, 12), 'accent', 0.42 * side, 2.3, 0).rotation.z = Math.PI / 2
  p.put(head, cyl(0.02, 0.02, 0.3, 8), STEEL, 0, 2.74, 0)
  p.put(head, ball(0.06, 10, 8), glow(0xff3d4a, 2), 0, 2.92, 0)
  b.anchors.eyes = { l: v(-0.16, 2.34, 0.33), r: v(0.16, 2.34, 0.33), size: 0.075 }
  b.anchors.mouth = { pos: v(0, 2.14, 0.33), w: 0.26 }
  addLimbs(c, b, {
    shoulder: v(0.6, 1.75, 0),
    armLen: 0.85,
    hip: v(0.26, 0.85, 0),
    legLen: 0.8,
    radius: 0.09,
    paint: 'accent',
    handPaint: 'main',
    footPaint: 'main',
  })
  b.anchors.head = { pos: v(0, 2.62, 0), r: 0.38 }
  b.anchors.chest = { pos: v(0, 1.75, 0.31), w: 0.6 }
  b.anchors.back = { pos: v(0, 1.45, -0.31), w: 0.9, h: 1 }
  setSize(b, 1.4, 2.95, 0.7)
  return b
}

export const fridge: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const cy = 0.5 + 0.95
  p.put(b.core, box(1.05, 1.9, 0.92, 0.1), 'main', 0, cy, 0)
  p.put(b.core, box(1.07, 0.04, 0.94, 0.005), 'accent', 0, cy + 0.32, 0.01)
  for (const y of [cy + 0.62, cy - 0.35]) p.put(b.core, cyl(0.025, 0.025, 0.45, 8), STEEL, 0.4, y, 0.5)
  const magnets = [0xff4d5a, 0x4d8bff, 0xffd24a, 0x4dff9a]
  magnets.forEach((colour, i) => p.put(b.core, box(0.1, 0.1, 0.03, 0.01), { colour, rough: 0.5 }, -0.3 + (i % 2) * 0.14, cy - 0.45 - Math.floor(i / 2) * 0.16, 0.48))
  setFace(b, cy + 0.62, 0.2, 0.47, 0.09, cy + 0.4 - 0.0, 0.32)
  b.anchors.mouth!.pos.y = cy - 0.1
  addLimbs(c, b, {
    shoulder: v(0.58, cy + 0.5, 0),
    armLen: 0.85,
    hip: v(0.28, 0.55, 0),
    legLen: 0.5,
    radius: 0.075,
    paint: GREY,
    handPaint: STEEL,
    footPaint: DARK,
  })
  b.anchors.head = { pos: v(0, cy + 0.98, 0), r: 0.5 }
  b.anchors.chest = { pos: v(0, cy + 0.2, 0.47), w: 0.7 }
  b.anchors.back = { pos: v(0, cy + 0.3, -0.47), w: 1, h: 1.4 }
  setSize(b, 1.3, cy + 0.96, 0.95)
  return b
}

export const coffeemachine: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, box(1.05, 1.35, 0.8, 0.09), 'main', 0, 1.15, 0)
  p.put(b.core, box(1.05, 0.26, 0.8, 0.07), 'accent', 0, 1.95, 0)
  p.put(b.core, cyl(0.3, 0.3, 0.5, 24), GLASS, -0.2, 2.35, -0.05)
  p.put(b.core, cyl(0.27, 0.27, 0.22, 24), { colour: 0x6b3a1e, rough: 0.7 }, -0.2, 2.22, -0.05)
  p.put(b.core, box(0.62, 0.42, 0.04, 0.02), glow(0x7fe3ff, 0.55), 0, 1.45, 0.41)
  p.put(b.core, cyl(0.07, 0.07, 0.24, 12), STEEL, 0, 0.96, 0.4)
  p.put(b.core, cyl(0.17, 0.14, 0.2, 18), WHITE, 0, 0.62, 0.42)
  for (let i = 0; i < 3; i++) p.put(b.core, ball(0.05, 10, 8), 'accent', -0.28 + i * 0.28, 1.02, 0.4)
  b.anchors.eyes = { l: v(-0.16, 1.5, 0.45), r: v(0.16, 1.5, 0.45), size: 0.075 }
  b.anchors.mouth = { pos: v(0, 1.32, 0.45), w: 0.28 }
  addLimbs(c, b, {
    shoulder: v(0.6, 1.5, 0),
    armLen: 0.8,
    hip: v(0.28, 0.5, 0),
    legLen: 0.45,
    radius: 0.07,
    paint: GREY,
    handPaint: STEEL,
    footPaint: DARK,
  })
  b.anchors.head = { pos: v(0, 2.6, -0.05), r: 0.42 }
  b.anchors.chest = { pos: v(0, 1.2, 0.41), w: 0.6 }
  b.anchors.back = { pos: v(0, 1.4, -0.4), w: 0.9, h: 1.2 }
  setSize(b, 1.4, 2.7, 0.9)
  return b
}

export const toaster: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, box(1.4, 0.95, 0.78, 0.16), 'main', 0, 0.9, 0)
  for (const x of [-0.3, 0.3]) {
    p.put(b.core, box(0.46, 0.04, 0.12, 0.01), DARK, x, 1.375, 0)
    p.put(b.core, box(0.4, 0.5, 0.09, 0.03), 'accent', x, 1.55, 0)
  }
  p.put(b.core, cyl(0.04, 0.04, 0.2, 10), RUBBER, 0.72, 1.1, 0).rotation.z = Math.PI / 2
  p.put(b.core, box(0.8, 0.06, 0.04, 0.01), STEEL, 0, 0.6, 0.4)
  setFace(b, 1.05, 0.3, 0.4, 0.1, 0.78, 0.4)
  addLimbs(c, b, {
    shoulder: v(0.76, 1.0, 0),
    armLen: 0.75,
    hip: v(0.4, 0.45, 0),
    legLen: 0.42,
    radius: 0.075,
    paint: GREY,
    handPaint: STEEL,
    footPaint: DARK,
  })
  b.anchors.head = { pos: v(0, 1.88, 0), r: 0.5 }
  b.anchors.chest = { pos: v(0, 0.9, 0.4), w: 0.7 }
  b.anchors.back = { pos: v(0, 0.95, -0.4), w: 1.1, h: 0.8 }
  setSize(b, 1.6, 1.9, 0.8)
  return b
}

export const washer: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const cy = 0.45 + 0.7
  p.put(b.core, box(1.15, 1.4, 0.95, 0.09), 'main', 0, cy, 0)
  p.put(b.core, box(1.1, 0.26, 0.04, 0.02), DARK, 0, cy + 0.52, 0.49)
  p.put(b.core, torus(0.36, 0.06, Math.PI * 2, 12, 36), STEEL, 0, cy - 0.12, 0.5)
  p.put(b.core, cyl(0.35, 0.35, 0.05, 32), GLASS, 0, cy - 0.12, 0.49).rotation.x = Math.PI / 2
  p.put(b.core, ball(0.04, 8, 6), 'accent', 0.38, cy + 0.52, 0.52)
  setFace(b, cy + 0.52, 0.2, 0.52, 0.065, cy - 0.12, 0.3, 0.52)
  b.anchors.mouth = null
  addLimbs(c, b, {
    shoulder: v(0.64, cy + 0.35, 0),
    armLen: 0.8,
    hip: v(0.3, 0.55, 0),
    legLen: 0.5,
    radius: 0.075,
    paint: GREY,
    handPaint: STEEL,
    footPaint: DARK,
  })
  b.anchors.head = { pos: v(0, cy + 0.72, 0), r: 0.45 }
  b.anchors.chest = { pos: v(0, cy + 0.2, 0.49), w: 0.6 }
  b.anchors.back = { pos: v(0, cy, -0.48), w: 1, h: 1.2 }
  setSize(b, 1.4, cy + 0.72, 1)
  return b
}

export const tv: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const cy = 0.55 + 0.55
  p.put(b.core, box(1.5, 1.1, 0.7, 0.12), 'accent', 0, cy, 0)
  p.put(b.core, box(1.08, 0.82, 0.06, 0.05), glow(0x8fe9ff, 0.7), -0.12, cy, 0.34)
  for (let i = 0; i < 2; i++) p.put(b.core, cyl(0.06, 0.06, 0.05, 14), 'main', 0.6, cy + 0.2 - i * 0.3, 0.36).rotation.x = Math.PI / 2
  for (const side of [-1, 1]) {
    const antenna = p.put(b.core, cyl(0.012, 0.012, 0.7, 6), STEEL, 0.2 * side, cy + 0.9, 0)
    antenna.rotation.z = -0.55 * side
  }
  p.put(b.core, ball(0.07, 10, 8), STEEL, 0, cy + 0.58, 0)
  b.anchors.eyes = { l: v(-0.32, cy + 0.12, 0.4), r: v(0.1, cy + 0.12, 0.4), size: 0.1 }
  b.anchors.mouth = { pos: v(-0.11, cy - 0.2, 0.4), w: 0.4 }
  addLimbs(c, b, {
    shoulder: v(0.8, cy + 0.2, 0),
    armLen: 0.8,
    hip: v(0.4, cy - 0.5, 0),
    legLen: 0.55,
    radius: 0.075,
    paint: GREY,
    handPaint: STEEL,
    footPaint: DARK,
  })
  b.anchors.head = { pos: v(0, cy + 0.58, 0), r: 0.5 }
  b.anchors.chest = { pos: v(0, cy - 0.1, 0.36), w: 0.7 }
  b.anchors.back = { pos: v(0, cy, -0.35), w: 1.2, h: 0.9 }
  setSize(b, 1.7, cy + 1.2, 0.8)
  return b
}

export const teapot: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, ball(0.78, 32, 22), 'main', 0, 0.85, 0)
  p.put(b.core, torus(0.77, 0.07, Math.PI * 2, 8, 40), 'accent', 0, 0.38, 0).rotation.x = Math.PI / 2
  const lid = p.put(b.core, new SphereGeometry(0.4, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), 'main', 0, 1.58, 0)
  lid.scale.set(1, 0.6, 1)
  p.put(b.core, ball(0.09, 12, 8), 'accent', 0, 1.82, 0)
  const spout = sweep([v(0.62, 0.7, 0), v(1.0, 0.95, 0), v(1.25, 1.4, 0)], (t) => 0.14 - t * 0.05, { samples: 14, radial: 12 })
  p.put(b.core, spout, 'main')
  const handle = p.put(b.core, torus(0.42, 0.07, Math.PI * 1.2, 10, 28), 'accent', -0.8, 0.88, 0)
  handle.rotation.z = Math.PI * 0.4
  setFace(b, 1.0, 0.27, 0.72, 0.1, 0.66, 0.4, 0.74)
  b.anchors.head = { pos: v(0, 1.85, 0), r: 0.42 }
  b.anchors.chest = { pos: v(0, 0.9, 0.78), w: 0.6 }
  b.anchors.back = { pos: v(0, 0.9, -0.78), w: 1, h: 1 }
  setSize(b, 2.4, 1.9, 1.6)
  return b
}

export const sneaker: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, box(0.72, 0.17, 1.9, 0.07), 'accent', 0, 0.1, 0)
  p.put(b.core, ellipsoid(0.37, 0.34, 0.9, 24, 16), 'main', 0, 0.42, 0.18)
  p.put(b.core, ellipsoid(0.35, 0.46, 0.52, 22, 16), 'main', 0, 0.55, -0.5)
  p.put(b.core, ellipsoid(0.34, 0.2, 0.42, 20, 12), 'accent', 0, 0.26, 0.72)
  const tongue = p.put(b.core, box(0.34, 0.5, 0.06, 0.02), WHITE, 0, 0.78, -0.12)
  tongue.rotation.x = 0.55
  for (let i = 0; i < 4; i++) p.put(b.core, box(0.4, 0.035, 0.05, 0.01), WHITE, 0, 0.66 - i * 0.01, 0.1 - i * 0.13).rotation.x = 0.1
  const stripe = p.put(b.core, slab([[-0.4, 0.15], [0.35, 0.02], [0.05, 0.12], [0.5, 0.2], [-0.3, 0.3]], 0.04, 0.01), WHITE, 0.37, 0.45, 0.0)
  stripe.rotation.y = Math.PI / 2
  b.anchors.eyes = { l: v(-0.14, 0.6, 0.55), r: v(0.14, 0.6, 0.55), size: 0.08 }
  b.anchors.mouth = { pos: v(0, 0.4, 0.98), w: 0.3 }
  b.anchors.head = { pos: v(0, 1.0, -0.5), r: 0.3 }
  b.anchors.chest = { pos: v(0, 0.6, 0.4), w: 0.4 }
  b.anchors.back = { pos: v(0, 0.6, -0.9), w: 0.6, h: 0.6 }
  setSize(b, 0.8, 1.1, 1.9)
  return b
}

// ── Beings ──────────────────────────────────────────────────────────────────

export const alien: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, ellipsoid(0.36, 0.58, 0.28, 20, 14), 'main', 0, 1.0, 0)
  const head = new Group()
  b.core.add(head)
  b.headParts = head
  p.put(head, ellipsoid(0.82, 0.72, 0.7, 28, 20), 'main', 0, 2.05, 0)
  for (const side of [-1, 1]) {
    const eye = p.put(head, ellipsoid(0.27, 0.15, 0.1, 18, 12), { colour: 0x07070b, rough: 0.12, metal: 0.4 }, 0.34 * side, 2.0, 0.62)
    eye.rotation.z = -0.5 * side
    p.put(head, ball(0.045, 8, 6), WHITE, 0.4 * side, 2.04, 0.7)
    const antenna = p.put(head, cyl(0.02, 0.02, 0.5, 6), 'main', 0.3 * side, 2.85, 0)
    antenna.rotation.z = -0.35 * side
    p.put(head, ball(0.08, 10, 8), glow(0xb7ff4a, 1.8), 0.43 * side, 3.08, 0)
  }
  b.anchors.eyes = null
  b.anchors.mouth = { pos: v(0, 1.62, 0.64), w: 0.22 }
  addLimbs(c, b, {
    shoulder: v(0.34, 1.35, 0),
    armLen: 0.9,
    hip: v(0.14, 0.5, 0),
    legLen: 0.5,
    radius: 0.05,
    paint: 'main',
    handPaint: 'main',
    footPaint: 'main',
  })
  b.anchors.head = { pos: v(0, 2.78, 0), r: 0.6 }
  b.anchors.chest = { pos: v(0, 1.15, 0.27), w: 0.4 }
  b.anchors.back = { pos: v(0, 1.1, -0.27), w: 0.6, h: 0.8 }
  setSize(b, 1.7, 3.1, 1.4)
  return b
}

export const ghost: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const profile: Array<[number, number]> = [
    [0.02, 0.0],
    [0.6, 0.02],
    [0.74, 0.35],
    [0.72, 0.95],
    [0.64, 1.45],
    [0.46, 1.85],
    [0.2, 2.1],
    [0.0, 2.15],
  ]
  p.put(b.core, lathe(profile, 36), 'main', 0, 0.3, 0)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    p.put(b.core, ball(0.2, 12, 8), 'main', Math.sin(a) * 0.58, 0.32, Math.cos(a) * 0.58)
  }
  for (const side of [-1, 1]) {
    p.put(b.core, ellipsoid(0.12, 0.22, 0.1, 10, 8), { colour: 0x0b0b12, rough: 0.2 }, 0.2 * side, 1.95, 0.64)
    p.put(b.core, ellipsoid(0.15, 0.1, 0.12, 12, 8), { colour: 0xffb3c6, rough: 0.8 }, 0.36 * side, 1.7, 0.6)
  }
  b.anchors.eyes = null
  b.anchors.mouth = { pos: v(0, 1.62, 0.7), w: 0.28 }
  addLimbs(c, b, {
    shoulder: v(0.7, 1.4, 0),
    armLen: 0.55,
    radius: 0.12,
    paint: 'main',
    handPaint: 'main',
  })
  b.root.position.y = 0.15
  b.anchors.head = { pos: v(0, 2.45, 0), r: 0.45 }
  b.anchors.chest = { pos: v(0, 1.4, 0.7), w: 0.6 }
  b.anchors.back = { pos: v(0, 1.4, -0.66), w: 1, h: 1 }
  setSize(b, 1.6, 2.5, 1.5)
  return b
}

export const snowman: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, ball(0.78, 28, 20), 'main', 0, 0.78, 0)
  p.put(b.core, ball(0.56, 26, 18), 'main', 0, 1.8, 0)
  const head = new Group()
  b.core.add(head)
  b.headParts = head
  p.put(head, ball(0.43, 26, 18), 'main', 0, 2.65, 0)
  p.put(head, cone(0.07, 0.42, 12), { colour: 0xff7a1a, rough: 0.5 }, 0, 2.6, 0.52).rotation.x = Math.PI / 2
  for (let i = 0; i < 3; i++) p.put(b.core, ball(0.055, 8, 6), BLACK, 0, 2.0 - i * 0.27, 0.54 - i * 0.04)
  b.anchors.eyes = { l: v(-0.15, 2.75, 0.38), r: v(0.15, 2.75, 0.38), size: 0.065 }
  b.anchors.mouth = { pos: v(0, 2.43, 0.4), w: 0.3 }
  addLimbs(c, b, {
    shoulder: v(0.5, 1.95, 0),
    armLen: 0.95,
    radius: 0.035,
    paint: { colour: 0x6a4a2a, rough: 0.9 },
    handPaint: { colour: 0x6a4a2a, rough: 0.9 },
    noHands: true,
    restOut: 0.7,
  })
  b.anchors.head = { pos: v(0, 3.08, 0), r: 0.38 }
  b.anchors.chest = { pos: v(0, 1.75, 0.54), w: 0.5 }
  b.anchors.back = { pos: v(0, 1.8, -0.54), w: 0.8, h: 1 }
  setSize(b, 1.6, 3.1, 1.5)
  return b
}

function lumpy(geometry: BufferGeometry, ridges: number, depth: number): BufferGeometry {
  const position = geometry.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i)
    const z = position.getZ(i)
    const k = 1 + depth * Math.cos(Math.atan2(z, x) * ridges)
    position.setX(i, x * k)
    position.setZ(i, z * k)
  }
  geometry.computeVertexNormals()
  return geometry
}

export const pumpkin: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const cy = 0.55 + 0.82
  p.put(b.core, lumpy(ellipsoid(1.0, 0.82, 1.0, 40, 26), 9, 0.07), 'main', 0, cy, 0)
  p.put(b.core, cyl(0.1, 0.15, 0.32, 10), { colour: 0x4f8f2f, rough: 0.8 }, 0.04, cy + 0.88, 0).rotation.z = 0.2
  const vine = sweep([v(0.1, cy + 0.95, 0), v(0.35, cy + 1.1, 0.05), v(0.5, cy + 0.9, 0.1)], (t) => 0.025 - t * 0.01, { samples: 10, radial: 6 })
  p.put(b.core, vine, { colour: 0x4f8f2f, rough: 0.8 })
  for (const side of [-1, 1]) {
    const eye = p.put(b.core, cyl(0.17, 0.17, 0.05, 3), glow(0xffd24a, 1.4), 0.34 * side, cy + 0.2, 0.93)
    eye.rotation.set(Math.PI / 2, 0, Math.PI)
  }
  p.put(b.core, cyl(0.1, 0.1, 0.05, 3), glow(0xffd24a, 1.4), 0, cy - 0.02, 0.97).rotation.set(Math.PI / 2, 0, Math.PI)
  b.anchors.eyes = null
  b.anchors.mouth = { pos: v(0, cy - 0.3, 0.95), w: 0.62 }
  addLimbs(c, b, {
    shoulder: v(0.98, cy - 0.1, 0),
    armLen: 0.6,
    hip: v(0.38, 0.6, 0),
    legLen: 0.55,
    radius: 0.09,
    paint: 'main',
    handPaint: { colour: 0x4f8f2f, rough: 0.8 },
    footPaint: { colour: 0x4f8f2f, rough: 0.8 },
  })
  b.anchors.head = { pos: v(0, cy + 0.85, 0), r: 0.55 }
  b.anchors.chest = { pos: v(0, cy - 0.5, 0.9), w: 0.7 }
  b.anchors.back = { pos: v(0, cy, -0.95), w: 1.4, h: 1.2 }
  setSize(b, 2.2, cy + 1.1, 2)
  return b
}

export const person: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, capsule(0.35, 0.72), 'main', 0, 1.62, 0)
  const head = new Group()
  b.core.add(head)
  b.headParts = head
  p.put(head, ball(0.31, 26, 18), SKIN, 0, 2.45, 0)
  const hair = p.put(head, new SphereGeometry(0.33, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.46), { colour: 0x3a2a1d, rough: 0.8 }, 0, 2.48, -0.02)
  hair.scale.set(1, 1, 1.02)
  b.anchors.eyes = { l: v(-0.11, 2.47, 0.27), r: v(0.11, 2.47, 0.27), size: 0.055 }
  b.anchors.mouth = { pos: v(0, 2.33, 0.29), w: 0.18 }
  addLimbs(c, b, {
    shoulder: v(0.44, 2.0, 0),
    armLen: 0.9,
    hip: v(0.17, 1.0, 0),
    legLen: 1.0,
    radius: 0.1,
    paint: 'main',
    handPaint: SKIN,
    footPaint: { colour: 0x2b2b33, rough: 0.7 },
  })
  b.anchors.head = { pos: v(0, 2.78, 0), r: 0.32 }
  b.anchors.chest = { pos: v(0, 1.85, 0.34), w: 0.4 }
  b.anchors.back = { pos: v(0, 1.7, -0.34), w: 0.7, h: 1 }
  setSize(b, 1.2, 2.8, 0.8)
  void RED
  void WHITE
  return b
}

export const THING_BODIES = { robot, fridge, coffeemachine, toaster, washer, tv, teapot, sneaker, alien, ghost, snowman, pumpkin, person }
