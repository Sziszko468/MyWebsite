import { Group, SphereGeometry, Vector3 } from 'three'
import type { Build, Mood } from '../spec'
import {
  BLACK,
  RED,
  WHITE,
  ball,
  box,
  capsule,
  cone,
  createBuilt,
  cyl,
  ellipsoid,
  makeLimbs,
  slab,
  sweep,
  torus,
  type Built,
  type Fixed,
  type LimbSpec,
  type Painter,
} from './kit'

/** What a body builder is given. */
export interface BodyContext {
  p: Painter
  mood: Mood
  build: Build
}

export type BodyBuilder = (c: BodyContext) => Built

const v = (x: number, y: number, z: number) => new Vector3(x, y, z)

/** Eyes and mouth on the front of a body, `z` being how far the surface is in front of the middle. */
export function setFace(b: Built, eyeY: number, gap: number, z: number, size: number, mouthY: number, mouthW: number, mouthZ = z) {
  b.anchors.eyes = { l: v(-gap, eyeY, z), r: v(gap, eyeY, z), size }
  b.anchors.mouth = { pos: v(0, mouthY, mouthZ), w: mouthW }
}

export function setSize(b: Built, width: number, height: number, depth: number) {
  b.width = width
  b.height = height
  b.depth = depth
}

export function addLimbs(c: BodyContext, b: Built, spec: Omit<LimbSpec, 'build'>) {
  b.limbs = makeLimbs(c.p, b.core, { ...spec, build: c.build })
}

const ORANGE: Fixed = { colour: 0xf28c1f, rough: 0.5 }

// ── Food ────────────────────────────────────────────────────────────────────

export const banana: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const mid = 1.45
  const R = 1.15
  const pts: Vector3[] = []
  for (let i = 0; i <= 10; i++) {
    const a = -0.82 + (1.64 * i) / 10
    pts.push(v(R * (1 - Math.cos(a)), mid + R * Math.sin(a), 0))
  }
  const radius = (t: number) => 0.31 * (0.42 + 0.58 * Math.pow(Math.sin(Math.PI * t), 0.55)) + 0.02
  p.put(b.core, sweep(pts, radius, { samples: 40, radial: 20, ridges: 5, ridgeDepth: 0.05 }), 'main')
  const top = pts[pts.length - 1]
  const bottom = pts[0]
  p.put(b.core, cyl(0.07, 0.1, 0.22, 10), { colour: 0x6b4a1b, rough: 0.8 }, top.x + 0.04, top.y + 0.12, 0).rotation.z = -0.5
  p.put(b.core, ball(0.1, 10, 8), { colour: 0x4a3316, rough: 0.8 }, bottom.x - 0.01, bottom.y - 0.06, 0)
  setFace(b, mid + 0.22, 0.14, 0.27, 0.085, mid - 0.06, 0.26)
  addLimbs(c, b, {
    shoulder: v(0.34, mid + 0.05, 0),
    armLen: 0.8,
    hip: v(0.12, bottom.y + 0.1, 0),
    legLen: bottom.y + 0.05,
    radius: 0.075,
    paint: 'main',
    handPaint: WHITE,
    footPaint: WHITE,
  })
  b.limbs!.legL!.position.x += bottom.x
  b.limbs!.legR!.position.x += bottom.x
  b.anchors.head = { pos: v(top.x, top.y + 0.1, 0), r: 0.27 }
  b.anchors.chest = { pos: v(0, mid - 0.2, 0.3), w: 0.4 }
  b.anchors.back = { pos: v(0, mid, -0.3), w: 0.5, h: 1.2 }
  setSize(b, 0.9, top.y + 0.3, 0.62)
  return b
}

export const croissant: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const R = 0.98
  const base = 0.12
  const profile = [0.5, 0.74, 0.92, 1, 0.92, 0.74, 0.5]
  profile.forEach((k, i) => {
    const a = ((i - 3) / 3) * 1.08
    const seg = p.put(
      b.core,
      ellipsoid(0.27, 0.4 * k + 0.06, 0.37 * k + 0.05),
      i % 2 === 0 ? 'main' : 'accent',
      R * Math.sin(a),
      base + 0.45 + R * Math.cos(a) * 0.92,
      0,
    )
    seg.rotation.z = -a * 0.96
    seg.scale.x = 1 + (1 - k) * 0.4
  })
  p.put(b.core, ellipsoid(0.26, 0.3, 0.34), 'accent', 0, base + 0.45 + R * 0.92, 0)
  setFace(b, base + 0.45 + R * 0.92 + 0.06, 0.2, 0.34, 0.09, base + 0.45 + R * 0.92 - 0.32, 0.3)
  addLimbs(c, b, {
    shoulder: v(0.6, base + 1.1, 0),
    armLen: 0.6,
    hip: v(0.52, base + 0.85, 0),
    legLen: base + 0.82,
    radius: 0.075,
    paint: 'accent',
    handPaint: WHITE,
    footPaint: WHITE,
  })
  b.anchors.head = { pos: v(0, base + 0.45 + R * 0.92 + 0.38, 0), r: 0.34 }
  b.anchors.chest = { pos: v(0, base + 0.7 + R * 0.92 - 0.5, 0.34), w: 0.4 }
  b.anchors.back = { pos: v(0, base + 1.2, -0.34), w: 0.7, h: 0.9 }
  setSize(b, 2.1, base + 0.45 + R * 0.92 + 0.4, 0.75)
  return b
}

export const pizza: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const lift = 0.62
  p.put(b.core, slab([[-0.82, 1.5], [0.82, 1.5], [0, 0.05]], 0.2, 0.05), 'main', 0, lift, 0)
  const crust = p.put(b.core, capsule(0.17, 1.55), 'accent', 0, lift + 1.52, 0)
  crust.rotation.z = Math.PI / 2
  const spots = [[-0.35, 1.2], [0.3, 1.05], [0, 0.65], [0.38, 1.38], [-0.3, 0.88]] as const
  spots.forEach(([x, y], i) => {
    if (i === 4) return
    const spot = p.put(b.core, cyl(0.13, 0.13, 0.05, 20), RED, x, lift + y, 0.15)
    spot.rotation.x = Math.PI / 2
  })
  setFace(b, lift + 1.08, 0.24, 0.17, 0.085, lift + 0.72, 0.3)
  addLimbs(c, b, {
    shoulder: v(0.62, lift + 1.2, 0),
    armLen: 0.55,
    hip: v(0.14, lift + 0.12, 0),
    legLen: lift + 0.1,
    radius: 0.07,
    paint: 'main',
    handPaint: WHITE,
    footPaint: WHITE,
  })
  b.anchors.head = { pos: v(0, lift + 1.7, 0), r: 0.3 }
  b.anchors.chest = { pos: v(0, lift + 0.9, 0.2), w: 0.4 }
  b.anchors.back = { pos: v(0, lift + 1.1, -0.15), w: 0.8, h: 1 }
  setSize(b, 1.8, lift + 1.7, 0.4)
  return b
}

export const donut: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const R = 0.62
  const r = 0.36
  const cy = 0.5 + R + r
  p.put(b.core, torus(R, r, Math.PI * 2, 24, 48), 'main', 0, cy, 0)
  p.put(b.core, torus(R, r * 0.9, Math.PI * 2, 24, 48), 'accent', 0, cy, 0.13).scale.set(1.02, 1.02, 0.8)
  const colours = [0xff5d73, 0xffe14d, 0x4dd0ff, 0x7dff8a, 0xffffff, 0xc77dff]
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + c.p.random() * 0.3
    const k = 0.9 + c.p.random() * 0.35
    const sprinkle = p.put(b.core, capsule(0.022, 0.09), { colour: colours[i % colours.length], rough: 0.5 }, Math.cos(a) * R * k, cy + Math.sin(a) * R * k, 0.13 + r * 0.82)
    sprinkle.rotation.z = c.p.random() * Math.PI
  }
  setFace(b, cy + 0.06, R, 0.5, 0.1, cy - R - 0.0, 0.4)
  b.anchors.mouth!.pos.z = 0.5
  addLimbs(c, b, {
    shoulder: v(R + r - 0.02, cy, 0),
    armLen: 0.65,
    hip: v(0.25, cy - R - r + 0.1, 0),
    legLen: 0.5,
    radius: 0.07,
    paint: 'main',
    handPaint: WHITE,
    footPaint: WHITE,
  })
  b.anchors.head = { pos: v(0, cy + R + r, 0), r: 0.4 }
  b.anchors.chest = { pos: v(0, cy - R + 0.1, 0.5), w: 0.4 }
  b.anchors.back = { pos: v(0, cy, -r), w: 1.2, h: 1.2 }
  setSize(b, 2, cy + R + r, 0.9)
  return b
}

export const burger: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const y0 = 0.5
  p.put(b.core, ellipsoid(0.82, 0.3, 0.82), 'main', 0, y0 + 0.26, 0)
  p.put(b.core, cyl(0.84, 0.84, 0.26, 32), 'accent', 0, y0 + 0.62, 0)
  const cheese = p.put(b.core, box(1.55, 0.05, 1.55, 0.01), { colour: 0xffc928, rough: 0.5 }, 0, y0 + 0.78, 0)
  cheese.rotation.y = Math.PI / 4
  p.put(b.core, cyl(0.9, 0.9, 0.07, 32), { colour: 0x55b84a, rough: 0.6 }, 0, y0 + 0.86, 0)
  p.put(b.core, cyl(0.7, 0.7, 0.07, 28), RED, 0, y0 + 0.93, 0)
  const dome = p.put(b.core, new SphereGeometry(0.86, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), 'main', 0, y0 + 0.96, 0)
  dome.scale.set(1, 0.72, 1)
  for (let i = 0; i < 12; i++) {
    const a = c.p.random() * Math.PI * 2
    const t = 0.15 + c.p.random() * 0.7
    const rr = Math.sin(t * 1.5) * 0.74
    const seed = p.put(b.core, ellipsoid(0.05, 0.025, 0.03, 8, 6), { colour: 0xfff2d0, rough: 0.5 }, Math.cos(a) * rr, y0 + 0.96 + Math.cos(t * 1.5) * 0.62, Math.sin(a) * rr)
    seed.rotation.y = a
  }
  setFace(b, y0 + 1.18, 0.28, 0.62, 0.1, y0 + 0.95, 0.34, 0.76)
  addLimbs(c, b, {
    shoulder: v(0.88, y0 + 0.7, 0),
    armLen: 0.62,
    hip: v(0.3, y0 + 0.05, 0),
    legLen: y0,
    radius: 0.08,
    paint: 'accent',
    handPaint: WHITE,
    footPaint: WHITE,
  })
  b.anchors.head = { pos: v(0, y0 + 1.5, 0), r: 0.5 }
  b.anchors.chest = { pos: v(0, y0 + 0.6, 0.86), w: 0.5 }
  b.anchors.back = { pos: v(0, y0 + 0.7, -0.84), w: 1, h: 1 }
  setSize(b, 1.9, y0 + 1.5, 1.7)
  return b
}

export const egg: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const cy = 0.45 + 0.82
  p.put(b.core, ellipsoid(0.64, 0.84, 0.62, 32, 24), 'main', 0, cy, 0)
  setFace(b, cy + 0.2, 0.2, 0.52, 0.095, cy - 0.12, 0.32, 0.58)
  addLimbs(c, b, {
    shoulder: v(0.62, cy, 0),
    armLen: 0.65,
    hip: v(0.22, 0.52, 0),
    legLen: 0.5,
    radius: 0.07,
    paint: 'accent',
    handPaint: WHITE,
    footPaint: WHITE,
  })
  b.anchors.head = { pos: v(0, cy + 0.82, 0), r: 0.35 }
  b.anchors.chest = { pos: v(0, cy - 0.3, 0.58), w: 0.4 }
  b.anchors.back = { pos: v(0, cy, -0.6), w: 0.9, h: 1.2 }
  setSize(b, 1.3, cy + 0.84, 1.2)
  return b
}

export const avocado: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const cy = 0.5 + 0.95
  p.put(b.core, ellipsoid(0.72, 0.96, 0.55, 32, 24), 'accent', 0, cy, 0)
  p.put(b.core, ellipsoid(0.6, 0.84, 0.5, 32, 24), 'main', 0, cy, 0.12)
  p.put(b.core, ball(0.27), { colour: 0x7a4a2a, rough: 0.6 }, 0, cy - 0.3, 0.5)
  setFace(b, cy + 0.38, 0.2, 0.55, 0.095, cy + 0.08, 0.3, 0.58)
  addLimbs(c, b, {
    shoulder: v(0.7, cy + 0.1, 0),
    armLen: 0.65,
    hip: v(0.25, 0.58, 0),
    legLen: 0.55,
    radius: 0.075,
    paint: 'accent',
    handPaint: WHITE,
    footPaint: WHITE,
  })
  b.anchors.head = { pos: v(0, cy + 0.95, 0), r: 0.38 }
  b.anchors.chest = { pos: v(0, cy - 0.5, 0.58), w: 0.4 }
  b.anchors.back = { pos: v(0, cy, -0.55), w: 0.9, h: 1.2 }
  setSize(b, 1.4, cy + 0.96, 1.1)
  return b
}

export const cheese: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const lift = 0.5
  p.put(b.core, slab([[-0.85, 0], [0.85, 0], [0.85, 0.95], [-0.85, 1.6]], 0.7, 0.06), 'main', 0, lift, 0)
  const holes = [[-0.45, 0.45, 0.16], [0.45, 0.28, 0.13], [0.52, 0.75, 0.1], [-0.55, 1.05, 0.1], [0.05, 0.12, 0.08]] as const
  for (const [x, y, r] of holes) {
    const hole = p.put(b.core, cyl(r, r, 0.06, 18), 'accent', x, lift + y, 0.38)
    hole.rotation.x = Math.PI / 2
  }
  setFace(b, lift + 0.95, 0.24, 0.42, 0.09, lift + 0.62, 0.3)
  addLimbs(c, b, {
    shoulder: v(0.9, lift + 0.8, 0),
    armLen: 0.6,
    hip: v(0.3, lift + 0.05, 0),
    legLen: lift,
    radius: 0.075,
    paint: 'accent',
    handPaint: WHITE,
    footPaint: WHITE,
  })
  b.anchors.head = { pos: v(0, lift + 1.45, -0.05), r: 0.3 }
  b.anchors.chest = { pos: v(0, lift + 0.45, 0.45), w: 0.5 }
  b.anchors.back = { pos: v(0, lift + 0.8, -0.38), w: 1, h: 1 }
  setSize(b, 1.9, lift + 1.6, 0.8)
  return b
}

// ── Animals and a plant ─────────────────────────────────────────────────────

export const frog: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, ellipsoid(0.72, 0.6, 0.66, 28, 20), 'main', 0, 0.85, 0)
  p.put(b.core, ellipsoid(0.52, 0.46, 0.5), 'accent', 0, 0.78, 0.22)
  const head = new Group()
  b.core.add(head)
  b.headParts = head
  p.put(head, ellipsoid(0.7, 0.42, 0.58, 28, 18), 'main', 0, 1.28, 0.14)
  for (const side of [-1, 1]) p.put(head, ball(0.23), 'main', 0.4 * side, 1.62, 0.12)
  b.anchors.eyes = { l: v(-0.4, 1.64, 0.3), r: v(0.4, 1.64, 0.3), size: 0.15 }
  b.anchors.mouth = { pos: v(0, 1.18, 0.68), w: 1 }
  addLimbs(c, b, {
    shoulder: v(0.66, 0.95, 0.2),
    armLen: 0.55,
    hip: v(0.4, 0.55, -0.1),
    legLen: 0.5,
    radius: 0.1,
    paint: 'main',
    handPaint: 'main',
    footPaint: 'accent',
  })
  b.anchors.head = { pos: v(0, 1.72, 0.14), r: 0.52 }
  b.anchors.chest = { pos: v(0, 0.9, 0.6), w: 0.6 }
  b.anchors.back = { pos: v(0, 0.95, -0.6), w: 0.9, h: 0.8 }
  setSize(b, 1.5, 1.85, 1.4)
  return b
}

export const dinosaur: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, ellipsoid(0.62, 0.8, 0.58, 28, 20), 'main', 0, 1.35, -0.05)
  p.put(b.core, ellipsoid(0.46, 0.66, 0.34), 'accent', 0, 1.3, 0.3)
  const head = new Group()
  b.core.add(head)
  b.headParts = head
  p.put(head, ellipsoid(0.5, 0.42, 0.55, 24, 16), 'main', 0, 2.15, 0.3)
  p.put(head, ellipsoid(0.34, 0.24, 0.4, 20, 14), 'main', 0, 2.02, 0.78)
  for (const side of [-1, 1]) p.put(head, cone(0.04, 0.12, 8), WHITE, 0.14 * side, 1.84, 0.98).rotation.x = Math.PI
  const tail = sweep([v(0, 1.1, -0.45), v(0, 0.75, -1), v(0.1, 0.55, -1.7)], (t) => 0.42 * (1 - t) + 0.04, { samples: 20, radial: 14 })
  p.put(b.core, tail, 'main')
  for (let i = 0; i < 5; i++) {
    const spike = p.put(b.core, cone(0.12 - i * 0.01, 0.3, 4), 'accent', 0, 2.1 - i * 0.28, -0.38 - i * 0.06)
    spike.rotation.x = -0.9
  }
  b.anchors.eyes = { l: v(-0.22, 2.3, 0.62), r: v(0.22, 2.3, 0.62), size: 0.11 }
  b.anchors.mouth = { pos: v(0, 1.94, 1.1), w: 0.42 }
  addLimbs(c, b, {
    shoulder: v(0.52, 1.45, 0.3),
    armLen: 0.4,
    hip: v(0.3, 0.8, -0.05),
    legLen: 0.78,
    radius: 0.14,
    paint: 'main',
    handPaint: 'main',
    footPaint: 'accent',
  })
  b.anchors.head = { pos: v(0, 2.58, 0.3), r: 0.46 }
  b.anchors.chest = { pos: v(0, 1.35, 0.58), w: 0.5 }
  b.anchors.back = { pos: v(0, 1.5, -0.62), w: 0.8, h: 1 }
  setSize(b, 1.4, 2.6, 2.3)
  return b
}

export const cat: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, ellipsoid(0.55, 0.68, 0.5, 26, 18), 'main', 0, 0.98, 0)
  p.put(b.core, ellipsoid(0.34, 0.5, 0.3), WHITE, 0, 0.92, 0.28)
  const head = new Group()
  b.core.add(head)
  b.headParts = head
  p.put(head, ball(0.52, 28, 20), 'main', 0, 1.9, 0.05)
  for (const side of [-1, 1]) {
    const ear = p.put(head, cone(0.2, 0.4, 4), 'main', 0.3 * side, 2.38, 0.0)
    ear.rotation.z = -0.25 * side
    p.put(head, cone(0.11, 0.26, 4), { colour: 0xffb3b8, rough: 0.6 }, 0.3 * side, 2.34, 0.08).rotation.z = -0.25 * side
    for (let k = 0; k < 3; k++) {
      const whisker = p.put(head, cyl(0.008, 0.008, 0.5, 4), WHITE, 0.5 * side, 1.82 - k * 0.07, 0.38)
      whisker.rotation.z = Math.PI / 2 + (k - 1) * 0.14 * side
    }
  }
  for (let i = 0; i < 3; i++) p.put(head, box(0.05, 0.13, 0.03, 0.01), 'accent', (i - 1) * 0.12, 2.36, 0.36).rotation.z = (i - 1) * 0.3
  p.put(head, ball(0.06, 10, 8), { colour: 0xff8ca1, rough: 0.5 }, 0, 1.82, 0.52)
  const tail = sweep([v(0.2, 0.45, -0.4), v(0.7, 0.55, -0.6), v(0.85, 1.1, -0.5), v(0.7, 1.6, -0.4)], (t) => 0.11 - t * 0.03, { samples: 24, radial: 10 })
  p.put(b.core, tail, 'accent')
  b.anchors.eyes = { l: v(-0.2, 1.98, 0.43), r: v(0.2, 1.98, 0.43), size: 0.1 }
  b.anchors.mouth = { pos: v(0, 1.68, 0.5), w: 0.3 }
  addLimbs(c, b, {
    shoulder: v(0.5, 1.2, 0.05),
    armLen: 0.62,
    hip: v(0.25, 0.5, 0),
    legLen: 0.48,
    radius: 0.1,
    paint: 'main',
    handPaint: WHITE,
    footPaint: WHITE,
  })
  b.anchors.head = { pos: v(0, 2.4, 0.05), r: 0.46 }
  b.anchors.chest = { pos: v(0, 1.2, 0.46), w: 0.4 }
  b.anchors.back = { pos: v(0, 1.2, -0.5), w: 0.8, h: 1 }
  setSize(b, 1.3, 2.6, 1.2)
  return b
}

export const duck: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, ellipsoid(0.7, 0.62, 0.85, 28, 20), 'main', 0, 0.98, -0.05)
  const tail = p.put(b.core, cone(0.2, 0.45, 12), 'main', 0, 1.2, -0.85)
  tail.rotation.x = -2.0
  const head = new Group()
  b.core.add(head)
  b.headParts = head
  p.put(head, ball(0.44, 26, 18), 'main', 0, 1.78, 0.32)
  p.put(head, ellipsoid(0.24, 0.1, 0.32, 16, 10), ORANGE, 0, 1.7, 0.78)
  b.anchors.eyes = { l: v(-0.19, 1.9, 0.62), r: v(0.19, 1.9, 0.62), size: 0.075 }
  b.anchors.mouth = null
  addLimbs(c, b, {
    shoulder: v(0.68, 1.1, -0.05),
    armLen: 0.55,
    hip: v(0.3, 0.5, 0),
    legLen: 0.42,
    radius: 0.075,
    paint: 'accent',
    handPaint: 'accent',
    footPaint: ORANGE,
  })
  b.anchors.head = { pos: v(0, 2.2, 0.32), r: 0.42 }
  b.anchors.chest = { pos: v(0, 1.0, 0.66), w: 0.5 }
  b.anchors.back = { pos: v(0, 1.15, -0.85), w: 0.9, h: 0.9 }
  setSize(b, 1.4, 2.25, 1.8)
  return b
}

export const penguin: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, ellipsoid(0.64, 0.95, 0.56, 28, 22), 'main', 0, 1.1, 0)
  p.put(b.core, ellipsoid(0.48, 0.78, 0.4), 'accent', 0, 1.02, 0.22)
  const head = new Group()
  b.core.add(head)
  b.headParts = head
  p.put(head, ball(0.46, 26, 18), 'main', 0, 2.05, 0.04)
  p.put(head, ellipsoid(0.32, 0.3, 0.1), 'accent', 0, 2.0, 0.38)
  p.put(head, cone(0.1, 0.25, 12), ORANGE, 0, 1.94, 0.58).rotation.x = Math.PI / 2
  b.anchors.eyes = { l: v(-0.17, 2.1, 0.43), r: v(0.17, 2.1, 0.43), size: 0.075 }
  b.anchors.mouth = null
  addLimbs(c, b, {
    shoulder: v(0.62, 1.55, 0),
    armLen: 0.75,
    hip: v(0.25, 0.4, 0.05),
    legLen: 0.32,
    radius: 0.08,
    paint: 'main',
    handPaint: 'main',
    footPaint: ORANGE,
  })
  b.anchors.head = { pos: v(0, 2.48, 0.04), r: 0.44 }
  b.anchors.chest = { pos: v(0, 1.45, 0.44), w: 0.5 }
  b.anchors.back = { pos: v(0, 1.4, -0.55), w: 0.9, h: 1.2 }
  setSize(b, 1.5, 2.55, 1.2)
  return b
}

export const shark: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  const cy = 0.95
  p.put(b.core, ellipsoid(0.56, 0.52, 1.3, 28, 20), 'main', 0, cy, 0)
  p.put(b.core, ellipsoid(0.46, 0.3, 1.1), 'accent', 0, cy - 0.2, 0.1)
  const fin = p.put(b.core, cone(0.3, 0.7, 4), 'main', 0, cy + 0.68, -0.15)
  fin.rotation.x = -0.35
  const tail = p.put(b.core, slab([[0, 0.4], [0.7, 0.9], [0.25, 0], [0.7, -0.9], [0, -0.4]], 0.1, 0.03), 'main', 0, cy, -1.4)
  tail.rotation.set(0, Math.PI / 2, Math.PI / 2)
  for (const side of [-1, 1]) {
    const flipper = p.put(b.core, slab([[0, 0.3], [0.55, -0.1], [0, -0.35]], 0.06, 0.02), 'main', 0.5 * side, cy - 0.2, 0.2)
    flipper.rotation.set(0.3, side === 1 ? 0 : Math.PI, -0.6 * side)
  }
  for (let i = 0; i < 7; i++) {
    const tooth = p.put(b.core, cone(0.045, 0.12, 6), WHITE, (i - 3) * 0.1, cy - 0.28, 1.22 - Math.abs(i - 3) * 0.04)
    tooth.rotation.x = Math.PI
  }
  b.anchors.eyes = { l: v(-0.34, cy + 0.16, 0.95), r: v(0.34, cy + 0.16, 0.95), size: 0.09 }
  b.anchors.mouth = { pos: v(0, cy - 0.12, 1.28), w: 0.6 }
  b.anchors.head = { pos: v(0, cy + 0.5, 0.7), r: 0.4 }
  b.anchors.chest = { pos: v(0, cy - 0.1, 1.0), w: 0.4 }
  b.anchors.back = { pos: v(0, cy + 0.3, -0.6), w: 0.8, h: 0.8 }
  b.root.position.y = 0.2
  setSize(b, 1.3, 2.2, 3.2)
  return b
}

export const cactus: BodyBuilder = (c) => {
  const { p } = c
  const b = createBuilt()
  p.put(b.core, cyl(0.52, 0.38, 0.55, 24), { colour: 0xc4663a, rough: 0.8 }, 0, 0.28, 0)
  p.put(b.core, cyl(0.56, 0.56, 0.1, 24), { colour: 0xb15a31, rough: 0.8 }, 0, 0.58, 0)
  const colY = 1.65
  p.put(b.core, capsule(0.42, 1.2), 'main', 0, colY, 0)
  for (let i = 0; i < 26; i++) {
    const a = c.p.random() * Math.PI * 2
    const y = colY - 0.8 + c.p.random() * 1.6
    const spine = p.put(b.core, cone(0.018, 0.1, 5), 'accent', Math.cos(a) * 0.43, y, Math.sin(a) * 0.43)
    spine.lookAt(Math.cos(a) * 2, y, Math.sin(a) * 2)
    spine.rotateX(Math.PI / 2)
  }
  const flower = new Group()
  flower.position.set(0, colY + 0.66, 0)
  b.core.add(flower)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    p.put(flower, ellipsoid(0.1, 0.05, 0.14, 10, 8), { colour: 0xff6fa5, rough: 0.5 }, Math.sin(a) * 0.12, 0.02, Math.cos(a) * 0.12).rotation.y = a
  }
  p.put(flower, ball(0.07, 10, 8), { colour: 0xffd54a, rough: 0.5 }, 0, 0.05, 0)
  setFace(b, colY + 0.25, 0.17, 0.38, 0.09, colY - 0.05, 0.3, 0.41)
  addLimbs(c, b, {
    shoulder: v(0.36, colY - 0.05, 0),
    armLen: 0.78,
    radius: 0.17,
    paint: 'main',
    handPaint: 'main',
    restOut: 1.75,
    noHands: true,
  })
  b.anchors.head = { pos: v(0, colY + 0.95, 0), r: 0.3 }
  b.anchors.chest = { pos: v(0, colY - 0.3, 0.42), w: 0.4 }
  b.anchors.back = { pos: v(0, colY, -0.42), w: 0.7, h: 1.2 }
  setSize(b, 1.9, colY + 0.95, 0.9)
  return b
}

export const FOOD_ANIMAL_BODIES = { banana, croissant, pizza, donut, burger, egg, avocado, cheese, frog, dinosaur, cat, duck, penguin, shark, cactus }
void BLACK
