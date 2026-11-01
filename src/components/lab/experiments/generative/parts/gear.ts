import { Group, SphereGeometry, Vector3 } from 'three'
import type { AccessoryId, Build, PropId } from '../spec'
import {
  BLACK,
  DARK,
  GLASS,
  GOLD,
  RED,
  RUBBER,
  STEEL,
  WHITE,
  ball,
  box,
  capsule,
  cone,
  cyl,
  ellipsoid,
  glow,
  slab,
  torus,
  type Built,
  type Fixed,
  type Painter,
} from './kit'

const v = (x: number, y: number, z: number) => new Vector3(x, y, z)
const SUNGLASS: Fixed = { colour: 0x07070a, rough: 0.08, metal: 0.5 }
const FLAME: Fixed = { colour: 0xff8a2a, glow: 2.2, opacity: 0.9 }

export interface GearContext {
  p: Painter
  built: Built
  /** Where attachments go: the body's scaled core, so they follow its build. */
  parent: Group
  build: Build
  tick: Array<(time: number, motion: number) => void>
}

/** The eyes of a body, or a guess at where they would be. */
function eyeSpots(b: Built): { l: Vector3; r: Vector3; size: number } {
  if (b.anchors.eyes) return b.anchors.eyes
  const { head } = b.anchors
  const y = head.pos.y - head.r * 0.85
  const z = Math.max(0.3, b.depth * 0.36)
  return { l: v(-head.r * 0.45, y, z), r: v(head.r * 0.45, y, z), size: head.r * 0.2 }
}

/** Adds one accessory. A part that does not fit a body (gloves on a thing with no arms) floats beside it. */
export function addAccessory(id: AccessoryId, c: GearContext): void {
  const { p, built: b, parent } = c
  const { head, chest, back } = b.anchors
  const g = new Group()
  parent.add(g)
  switch (id) {
    case 'sunglasses': {
      const e = eyeSpots(b)
      const s = e.size
      for (const eye of [e.l, e.r]) {
        p.put(g, ellipsoid(s * 1.55, s * 1.3, s * 0.5), SUNGLASS, eye.x, eye.y, eye.z + s * 0.75)
        p.put(g, ellipsoid(s * 0.5, s * 0.12, s * 0.06, 10, 6), WHITE, eye.x - s * 0.55, eye.y + s * 0.55, eye.z + s * 1.18).rotation.z = 0.5
      }
      p.put(g, box((e.r.x - e.l.x) * 0.5, s * 0.22, s * 0.25, 0.01), SUNGLASS, 0, e.l.y + s * 0.3, e.l.z + s * 0.75)
      for (const side of [-1, 1]) {
        const arm = p.put(g, box(s * 0.2, s * 0.2, s * 2.6, 0.01), SUNGLASS, (side === -1 ? e.l.x : e.r.x) + side * s * 1.5, e.l.y + s * 0.25, e.l.z - s * 0.4)
        arm.rotation.y = side * 0.1
      }
      break
    }
    case 'glasses': {
      const e = eyeSpots(b)
      const s = e.size
      for (const eye of [e.l, e.r]) p.put(g, torus(s * 1.35, s * 0.12, Math.PI * 2, 8, 28), GOLD, eye.x, eye.y, eye.z + s * 0.6)
      p.put(g, box((e.r.x - e.l.x) - s * 2.6, s * 0.14, s * 0.14, 0.01), GOLD, 0, e.l.y + s * 0.2, e.l.z + s * 0.6)
      break
    }
    case 'tophat': {
      const r = head.r
      g.position.set(head.pos.x, head.pos.y - r * 0.08, head.pos.z)
      p.put(g, cyl(r * 1.05, r * 1.05, 0.05, 28), BLACK, 0, 0, 0)
      p.put(g, cyl(r * 0.66, r * 0.7, r * 1.15, 24), BLACK, 0, r * 0.58, 0)
      p.put(g, cyl(r * 0.71, r * 0.71, r * 0.2, 24), RED, 0, r * 0.2, 0)
      break
    }
    case 'crown': {
      const r = head.r
      g.position.set(head.pos.x, head.pos.y - r * 0.05, head.pos.z)
      g.rotation.z = 0.08
      p.put(g, cyl(r * 0.66, r * 0.6, r * 0.34, 24), GOLD, 0, r * 0.17, 0)
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2
        p.put(g, cone(r * 0.13, r * 0.42, 5), GOLD, Math.sin(a) * r * 0.58, r * 0.5, Math.cos(a) * r * 0.58)
        p.put(g, ball(r * 0.07, 10, 8), glow([0xff3d4a, 0x4d8bff, 0x4dff9a][i % 3], 1.2), Math.sin(a) * r * 0.58, r * 0.73, Math.cos(a) * r * 0.58)
      }
      break
    }
    case 'helmet': {
      const r = head.r
      g.position.set(head.pos.x, head.pos.y - r, head.pos.z)
      p.put(g, ball(r * 1.38, 28, 18), { ...GLASS, opacity: 0.32 }, 0, r * 0.05, 0)
      p.put(g, torus(r * 1.12, r * 0.14, Math.PI * 2, 10, 32), WHITE, 0, -r * 0.82, 0).rotation.x = Math.PI / 2
      break
    }
    case 'cap': {
      const r = head.r
      g.position.set(head.pos.x, head.pos.y - r * 0.42, head.pos.z)
      p.put(g, new SphereGeometry(r * 1.02, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), RED, 0, 0, 0)
      const bill = p.put(g, ellipsoid(r * 0.85, r * 0.06, r * 0.7, 16, 6), RED, 0, 0.0, r * 0.95)
      bill.rotation.x = 0.08
      p.put(g, ball(r * 0.1, 8, 6), WHITE, 0, r * 1.0, 0)
      break
    }
    case 'partyhat': {
      const r = head.r
      g.position.set(head.pos.x, head.pos.y - r * 0.05, head.pos.z)
      g.rotation.z = -0.12
      p.put(g, cone(r * 0.62, r * 1.6, 20), { colour: 0xff5d9e, rough: 0.5 }, 0, r * 0.8, 0)
      for (let i = 0; i < 3; i++) p.put(g, torus(r * (0.5 - i * 0.14), r * 0.04, Math.PI * 2, 6, 20), { colour: 0xffe14d, rough: 0.5 }, 0, r * (0.28 + i * 0.4), 0).rotation.x = Math.PI / 2
      p.put(g, ball(r * 0.16, 10, 8), { colour: 0xffe14d, rough: 0.5 }, 0, r * 1.62, 0)
      break
    }
    case 'chefhat': {
      const r = head.r
      g.position.set(head.pos.x, head.pos.y - r * 0.05, head.pos.z)
      p.put(g, cyl(r * 0.75, r * 0.7, r * 0.5, 24), WHITE, 0, r * 0.25, 0)
      for (const [x, z, k] of [[0, 0, 0.62], [0.42, 0.1, 0.45], [-0.4, 0.15, 0.45], [0.1, -0.4, 0.45], [-0.1, 0.42, 0.42]] as const)
        p.put(g, ball(r * k, 16, 12), WHITE, x * r, r * (0.75 + (x === 0 && z === 0 ? 0.35 : 0.1)), z * r)
      break
    }
    case 'wizardhat': {
      const r = head.r
      g.position.set(head.pos.x, head.pos.y - r * 0.08, head.pos.z)
      p.put(g, cyl(r * 1.25, r * 1.25, 0.04, 28), { colour: 0x3b2f8f, rough: 0.7 }, 0, 0, 0)
      const hat = p.put(g, cone(r * 0.78, r * 2.2, 22), { colour: 0x3b2f8f, rough: 0.7 }, 0, r * 1.1, 0)
      hat.rotation.z = -0.15
      for (const [x, y, z] of [[0.25, 0.9, 0.55], [-0.3, 1.3, 0.3], [0.1, 0.5, 0.72]] as const)
        p.put(g, ball(r * 0.09, 8, 6), glow(0xffd24a, 1.6), x * r, y * r, z * r)
      break
    }
    case 'tie': {
      const w = Math.min(0.5, chest.w) * 0.28
      g.position.set(chest.pos.x, chest.pos.y, chest.pos.z + 0.03)
      p.put(g, box(w, w * 0.8, w * 0.4, 0.01), RED, 0, w * 0.2, 0)
      p.put(g, slab([[-w * 0.5, 0], [w * 0.5, 0], [w * 0.8, -w * 3.4], [0, -w * 4.0], [-w * 0.8, -w * 3.4]], w * 0.18, 0.005), RED, 0, -w * 0.1, 0)
      break
    }
    case 'bowtie': {
      const w = Math.min(0.5, chest.w) * 0.34
      g.position.set(chest.pos.x, chest.pos.y + 0.1, chest.pos.z + 0.03)
      for (const side of [-1, 1]) {
        const wing = p.put(g, cone(w * 0.7, w * 1.1, 4), RED, side * w * 0.6, 0, 0)
        wing.rotation.z = (side * Math.PI) / 2
        wing.scale.z = 0.5
      }
      p.put(g, ball(w * 0.28, 10, 8), RED, 0, 0, 0.02)
      break
    }
    case 'gloves':
      addGloves(c)
      break
    case 'cape': {
      const w = back.w * 1.15
      g.position.set(back.pos.x, back.pos.y + back.h * 0.45, back.pos.z - 0.04)
      const sheet = p.put(g, slab([[-w * 0.42, 0], [w * 0.42, 0], [w * 0.6, -back.h * 1.35], [-w * 0.6, -back.h * 1.35]], 0.04, 0.015), RED, 0, 0, 0)
      sheet.position.z = -0.03
      p.put(g, torus(w * 0.4, 0.05, Math.PI, 8, 20), GOLD, 0, 0.02, 0.03).rotation.set(0, 0, 0)
      const origin = g.rotation
      c.tick.push((t, m) => {
        origin.x = 0.1 + Math.sin(t * 2.2) * 0.07 * m
      })
      break
    }
    case 'scarf': {
      const y = Math.max(chest.pos.y + chest.w * 0.6, head.pos.y - head.r * 2.0)
      g.position.set(chest.pos.x, y, chest.pos.z * 0.5)
      p.put(g, torus(Math.max(0.3, chest.w * 0.5), 0.12, Math.PI * 2, 10, 28), { colour: 0xe0202c, rough: 0.9 }, 0, 0, 0).rotation.x = Math.PI / 2
      p.put(g, box(0.2, 0.7, 0.08, 0.03), { colour: 0xe0202c, rough: 0.9 }, 0.2, -0.38, chest.pos.z * 0.5 + 0.22)
      break
    }
    case 'headphones': {
      const r = head.r
      g.position.set(head.pos.x, head.pos.y - r, head.pos.z)
      p.put(g, torus(r * 1.05, r * 0.07, Math.PI, 8, 28), DARK, 0, 0, 0)
      for (const side of [-1, 1]) {
        const cup = p.put(g, cyl(r * 0.36, r * 0.36, r * 0.28, 20), RED, side * r * 1.08, 0, 0)
        cup.rotation.z = Math.PI / 2
        p.put(g, cyl(r * 0.26, r * 0.26, r * 0.32, 20), DARK, side * r * 1.1, 0, 0).rotation.z = Math.PI / 2
      }
      break
    }
    case 'backpack': {
      g.position.set(back.pos.x, back.pos.y, back.pos.z - 0.18)
      p.put(g, box(back.w * 0.6, back.h * 0.6, 0.36, 0.1), { colour: 0x3b4252, rough: 0.7 }, 0, 0, 0)
      p.put(g, box(back.w * 0.4, back.h * 0.22, 0.1, 0.04), { colour: 0x2a2f3a, rough: 0.7 }, 0, -back.h * 0.1, -0.2)
      break
    }
    case 'wings': {
      g.position.set(back.pos.x, back.pos.y + back.h * 0.2, back.pos.z - 0.05)
      const wings: Group[] = []
      for (const side of [-1, 1]) {
        const wing = new Group()
        wing.position.x = side * 0.12
        g.add(wing)
        wings.push(wing)
        for (let i = 0; i < 6; i++) {
          const feather = p.put(wing, ellipsoid(0.1, 0.56 - i * 0.04, 0.03, 10, 8), WHITE, side * (0.12 + i * 0.14), 0.3 - i * 0.07, 0)
          feather.rotation.z = -side * (0.5 + i * 0.12)
        }
      }
      c.tick.push((t, m) => {
        wings[0].rotation.y = -0.45 + Math.sin(t * 4) * 0.28 * m
        wings[1].rotation.y = 0.45 - Math.sin(t * 4) * 0.28 * m
      })
      break
    }
    case 'mustache': {
      const m = b.anchors.mouth
      const at = m ? m.pos.clone().add(v(0, m.w * 0.42, 0.04)) : v(0, head.pos.y - head.r * 1.2, b.depth * 0.4)
      const w = m ? m.w : head.r * 0.8
      g.position.copy(at)
      for (const side of [-1, 1]) {
        const half = p.put(g, ellipsoid(w * 0.42, w * 0.11, w * 0.1, 14, 8), { colour: 0x2a1b12, rough: 0.9 }, side * w * 0.36, 0, 0)
        half.rotation.z = -side * 0.25
      }
      break
    }
    case 'chain': {
      g.position.set(chest.pos.x, chest.pos.y + chest.w * 0.5, chest.pos.z)
      const loop = p.put(g, torus(Math.max(0.2, chest.w * 0.5), 0.03, Math.PI * 1.05, 8, 32), GOLD, 0, 0, 0)
      loop.rotation.z = Math.PI * 1.02
      loop.position.set(0, 0, -0.04)
      const medal = p.put(g, cyl(0.1, 0.1, 0.03, 20), GOLD, 0, -Math.max(0.2, chest.w * 0.5) - 0.02, 0.0)
      medal.rotation.x = Math.PI / 2
      p.put(g, ball(0.035, 8, 6), glow(0xff3d4a, 1), 0, medal.position.y, 0.03)
      break
    }
    case 'medal': {
      g.position.set(chest.pos.x - chest.w * 0.25, chest.pos.y, chest.pos.z + 0.03)
      p.put(g, box(0.1, 0.34, 0.025, 0.005), RED, 0, 0.15, 0)
      p.put(g, cyl(0.11, 0.11, 0.03, 22), GOLD, 0, -0.06, 0).rotation.x = Math.PI / 2
      break
    }
    case 'jetpack': {
      g.position.set(back.pos.x, back.pos.y, back.pos.z - 0.2)
      for (const side of [-1, 1]) {
        p.put(g, capsule(0.16, 0.5), STEEL, side * 0.22, 0, 0)
        p.put(g, cyl(0.1, 0.14, 0.14, 14), DARK, side * 0.22, -0.46, 0)
        const outer = p.put(g, cone(0.11, 0.55, 12), FLAME, side * 0.22, -0.78, 0)
        outer.rotation.x = Math.PI
        c.tick.push((t, m) => {
          outer.scale.y = 1 + Math.sin(t * 35 + side) * 0.18 * m
        })
      }
      break
    }
  }
}

function addGloves(c: GearContext) {
  const { p, built: b, parent } = c
  const r = c.build === 'muscular' ? 0.3 : 0.24
  const glove = (host: Group) => {
    p.put(host, ball(r, 18, 12), RED)
    p.put(host, ball(r * 0.4, 10, 8), RED, r * 0.7, r * 0.2, r * 0.3)
    p.put(host, cyl(r * 0.55, r * 0.6, r * 0.5, 16), WHITE, 0, r * 0.75, 0)
  }
  if (b.limbs) {
    glove(b.limbs.handL as Group)
    glove(b.limbs.handR as Group)
    return
  }
  // No arms: the gloves float beside it and bob, as if somebody were boxing for it.
  const floating: Group[] = []
  for (const side of [-1, 1]) {
    const host = new Group()
    host.position.set(side * (b.width / 2 + 0.35), b.anchors.chest.pos.y, 0.35)
    parent.add(host)
    glove(host)
    floating.push(host)
  }
  c.tick.push((t, m) => {
    floating[0].position.z = 0.35 + Math.max(0, Math.sin(t * 6)) * 0.4 * m
    floating[1].position.z = 0.35 + Math.max(0, -Math.sin(t * 6)) * 0.4 * m
  })
}

// ── Props ───────────────────────────────────────────────────────────────────

/** A prop that stands on the floor. Its base is at y = 0 and its middle at x = z = 0. */
export function buildProp(id: PropId, p: Painter): { group: Group; height: number; radius: number } {
  const g = new Group()
  let height = 0.8
  let radius = 0.4
  switch (id) {
    case 'coffee': {
      p.put(g, cyl(0.28, 0.22, 0.45, 22), WHITE, 0, 0.225, 0)
      p.put(g, cyl(0.24, 0.24, 0.02, 22), { colour: 0x4a2a14, rough: 0.4 }, 0, 0.44, 0)
      p.put(g, torus(0.14, 0.035, Math.PI * 1.2, 8, 18), WHITE, 0.3, 0.24, 0).rotation.z = -Math.PI * 0.6
      for (let i = 0; i < 2; i++) p.put(g, ball(0.05, 8, 6), { colour: 0xffffff, opacity: 0.35, rough: 0.9 }, (i - 0.5) * 0.1, 0.6 + i * 0.12, 0)
      height = 0.7
      radius = 0.4
      break
    }
    case 'globe': {
      const globe = new Group()
      globe.position.y = 0.8
      g.add(globe)
      p.put(globe, ball(0.62, 28, 18), { colour: 0x2d6fdc, rough: 0.35 }, 0, 0, 0)
      for (const [x, y, z, s] of [[0.3, 0.2, 0.5, 0.26], [-0.35, -0.1, 0.45, 0.3], [0.1, -0.35, -0.5, 0.25], [-0.4, 0.3, -0.35, 0.22]] as const) {
        const land = p.put(globe, ball(s, 12, 8), { colour: 0x47b26a, rough: 0.6 }, x, y, z)
        land.scale.set(1, 0.9, 0.4)
        land.lookAt(0, 0, 0)
      }
      p.put(g, torus(0.5, 0.04, Math.PI * 2, 6, 24), STEEL, 0, 0.12, 0).rotation.x = Math.PI / 2
      p.put(g, cyl(0.06, 0.1, 0.2, 10), STEEL, 0, 0.1, 0)
      height = 1.45
      radius = 0.65
      break
    }
    case 'trophy': {
      p.put(g, box(0.5, 0.14, 0.5, 0.03), { colour: 0x2a2a33, rough: 0.5 }, 0, 0.07, 0)
      p.put(g, cyl(0.07, 0.1, 0.4, 12), GOLD, 0, 0.34, 0)
      p.put(g, cyl(0.3, 0.12, 0.45, 20), GOLD, 0, 0.78, 0)
      for (const side of [-1, 1]) p.put(g, torus(0.13, 0.025, Math.PI, 6, 14), GOLD, side * 0.3, 0.8, 0).rotation.z = side === 1 ? -Math.PI / 2 : Math.PI / 2
      height = 1.05
      radius = 0.4
      break
    }
    case 'money': {
      for (let i = 0; i < 5; i++) p.put(g, box(0.62, 0.1, 0.34, 0.01), { colour: 0x4bae5c, rough: 0.6 }, (i % 2) * 0.03, 0.05 + i * 0.1, 0).rotation.y = (i - 2) * 0.06
      p.put(g, box(0.2, 0.52, 0.36, 0.01), { colour: 0xe8dcb0, rough: 0.7 }, 0, 0.26, 0)
      p.put(g, cyl(0.14, 0.14, 0.03, 22), GOLD, 0.45, 0.02, 0.1)
      p.put(g, cyl(0.14, 0.14, 0.03, 22), GOLD, 0.45, 0.06, 0.1)
      height = 0.6
      radius = 0.5
      break
    }
    case 'flag': {
      p.put(g, cyl(0.025, 0.025, 1.6, 8), STEEL, 0, 0.8, 0)
      p.put(g, ball(0.05, 8, 6), GOLD, 0, 1.62, 0)
      p.put(g, box(0.62, 0.38, 0.02, 0.005), RED, 0.33, 1.4, 0)
      height = 1.7
      radius = 0.45
      break
    }
    case 'balloon': {
      p.put(g, cyl(0.006, 0.006, 1.2, 4), WHITE, 0, 0.6, 0)
      const balloon = p.put(g, ellipsoid(0.34, 0.42, 0.34, 20, 14), { colour: 0xff4d6d, rough: 0.2 }, 0, 1.5, 0)
      balloon.rotation.z = 0.05
      p.put(g, cone(0.05, 0.08, 8), { colour: 0xff4d6d, rough: 0.2 }, 0, 1.07, 0).rotation.x = Math.PI
      height = 1.95
      radius = 0.35
      break
    }
    case 'laptop': {
      p.put(g, box(0.78, 0.05, 0.56, 0.02), STEEL, 0, 0.03, 0)
      const screen = p.put(g, box(0.78, 0.5, 0.03, 0.015), STEEL, 0, 0.3, -0.27)
      screen.rotation.x = -0.25
      p.put(g, box(0.68, 0.4, 0.02, 0.01), glow(0x8fe9ff, 0.8), 0, 0.3, -0.255).rotation.x = -0.25
      height = 0.6
      radius = 0.5
      break
    }
    case 'briefcase': {
      p.put(g, box(0.78, 0.5, 0.2, 0.06), { colour: 0x6b4a2b, rough: 0.5 }, 0, 0.28, 0)
      p.put(g, torus(0.12, 0.022, Math.PI, 6, 14), DARK, 0, 0.54, 0)
      for (const x of [-0.2, 0.2]) p.put(g, box(0.07, 0.05, 0.03, 0.01), GOLD, x, 0.34, 0.11)
      height = 0.7
      radius = 0.45
      break
    }
    case 'guitar': {
      const guitar = new Group()
      guitar.rotation.z = 0.25
      guitar.position.y = 0.05
      g.add(guitar)
      p.put(guitar, ball(0.3, 20, 14), { colour: 0xb5651d, rough: 0.35 }, 0, 0.3, 0).scale.set(1, 1, 0.3)
      p.put(guitar, ball(0.22, 18, 12), { colour: 0xb5651d, rough: 0.35 }, 0, 0.72, 0).scale.set(1, 1, 0.3)
      p.put(guitar, cyl(0.1, 0.1, 0.03, 18), BLACK, 0, 0.5, 0.05).rotation.x = Math.PI / 2
      p.put(guitar, box(0.07, 0.8, 0.04, 0.01), RUBBER, 0, 1.15, 0)
      p.put(guitar, box(0.14, 0.2, 0.05, 0.02), DARK, 0, 1.62, 0)
      height = 1.8
      radius = 0.5
      break
    }
    case 'flower': {
      p.put(g, cyl(0.2, 0.15, 0.26, 16), { colour: 0xc4663a, rough: 0.8 }, 0, 0.13, 0)
      p.put(g, cyl(0.015, 0.015, 0.75, 6), { colour: 0x4fa04a, rough: 0.8 }, 0, 0.62, 0)
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2
        p.put(g, ellipsoid(0.07, 0.15, 0.035, 8, 6), { colour: 0xff6fa5, rough: 0.5 }, Math.sin(a) * 0.15, 1.05 + Math.cos(a) * 0.15, 0).rotation.z = -a
      }
      p.put(g, ball(0.08, 10, 8), { colour: 0xffd54a, rough: 0.5 }, 0, 1.05, 0.01)
      height = 1.25
      radius = 0.3
      break
    }
    case 'cake': {
      p.put(g, cyl(0.42, 0.42, 0.26, 28), { colour: 0xf5d9a8, rough: 0.7 }, 0, 0.13, 0)
      p.put(g, cyl(0.3, 0.3, 0.22, 28), { colour: 0xff8fb3, rough: 0.6 }, 0, 0.37, 0)
      p.put(g, cyl(0.015, 0.015, 0.2, 6), WHITE, 0, 0.58, 0)
      p.put(g, cone(0.03, 0.08, 6), glow(0xffd24a, 2), 0, 0.72, 0)
      height = 0.8
      radius = 0.45
      break
    }
  }
  return { group: g, height, radius }
}
