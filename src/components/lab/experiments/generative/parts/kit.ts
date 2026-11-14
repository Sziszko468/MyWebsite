import {
  BufferGeometry,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  type Object3D,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import type { Build, Mood, Pose } from '../spec'

/**
 * The small toolkit every part is made with: a painter that owns the materials and geometry of one
 * creation (so it can recolour and release them), geometry helpers, a face, and arms and legs that
 * can take a pose. Nothing here knows about any one creature.
 */

/** A colour that is the object's own and never recoloured. */
export interface Fixed {
  colour: number
  metal?: number
  rough?: number
  glow?: number
  opacity?: number
}
export type Paint = 'main' | 'accent' | Fixed

export const BLACK: Fixed = { colour: 0x14141a, rough: 0.5 }
export const DARK: Fixed = { colour: 0x2a2a33, rough: 0.55 }
export const WHITE: Fixed = { colour: 0xf4f1ea, rough: 0.45 }
export const STEEL: Fixed = { colour: 0xb9bfcb, metal: 1, rough: 0.28 }
export const GLASS: Fixed = { colour: 0x9fd8ff, metal: 0, rough: 0.05, opacity: 0.45 }
export const RUBBER: Fixed = { colour: 0x1b1b1f, rough: 0.9 }
export const GOLD: Fixed = { colour: 0xe5b23c, metal: 1, rough: 0.22 }
export const RED: Fixed = { colour: 0xe0202c, rough: 0.4 }
export const MOUTH: Fixed = { colour: 0x2b0f10, rough: 0.7 }
export const glow = (colour: number, strength = 1.6): Fixed => ({ colour, glow: strength, rough: 0.4 })

export interface Skin {
  main: number
  accent: number
  /** How shiny the object's own surface is. */
  metal?: number
  rough?: number
}

/** Owns what one creation is made of, so it can be recoloured and released as a unit. */
export class Painter {
  readonly meshes: Mesh[] = []
  private readonly geometries: BufferGeometry[] = []

  readonly skin: Skin
  readonly random: () => number

  constructor(skin: Skin, random: () => number) {
    this.skin = skin
    this.random = random
  }

  /** A number near `base`, the same for the same seed. */
  jitter(base: number, amount = 0.08): number {
    return base * (1 + (this.random() * 2 - 1) * amount)
  }

  mesh(geometry: BufferGeometry, paint: Paint, parent?: Object3D): Mesh {
    this.geometries.push(geometry)
    // Nothing here is textured: the coordinates would only cost memory and make an exported file a quarter bigger.
    geometry.deleteAttribute('uv')
    const fixed = typeof paint === 'object' ? paint : null
    const colour = fixed ? fixed.colour : paint === 'main' ? this.skin.main : this.skin.accent
    const material = new MeshStandardMaterial({
      color: colour,
      metalness: fixed ? (fixed.metal ?? 0.05) : (this.skin.metal ?? 0.05),
      roughness: fixed ? (fixed.rough ?? 0.5) : (this.skin.rough ?? 0.5),
      transparent: fixed?.opacity !== undefined,
      opacity: fixed?.opacity ?? 1,
      emissive: fixed?.glow ? new Color(colour) : new Color(0x000000),
      emissiveIntensity: fixed?.glow ?? 0,
    })
    const mesh = new Mesh(geometry, material)
    mesh.userData.paint = fixed ? 'fixed' : paint
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.meshes.push(mesh)
    parent?.add(mesh)
    return mesh
  }

  /** A mesh already placed: shorthand for the common case. */
  put(parent: Object3D, geometry: BufferGeometry, paint: Paint, x = 0, y = 0, z = 0): Mesh {
    const mesh = this.mesh(geometry, paint, parent)
    mesh.position.set(x, y, z)
    return mesh
  }

  dispose(): void {
    for (const mesh of this.meshes) (mesh.material as MeshStandardMaterial).dispose()
    for (const geometry of this.geometries) geometry.dispose()
    this.meshes.length = 0
    this.geometries.length = 0
  }
}

// ── Geometry ────────────────────────────────────────────────────────────────

export const ball = (r: number, w = 24, h = 16) => new SphereGeometry(r, w, h)

export function ellipsoid(rx: number, ry: number, rz: number, w = 24, h = 16): BufferGeometry {
  const geometry = new SphereGeometry(1, w, h)
  geometry.scale(rx, ry, rz)
  return geometry
}

export const capsule = (r: number, length: number) => new CapsuleGeometry(r, Math.max(0.001, length), 6, 14)
export const box = (w: number, h: number, d: number, r = 0.04) =>
  new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.2, h / 2.2, d / 2.2))
export const cyl = (rTop: number, rBottom: number, h: number, seg = 24) => new CylinderGeometry(rTop, rBottom, h, seg)
export const cone = (r: number, h: number, seg = 18) => new ConeGeometry(r, h, seg)
export const torus = (R: number, r: number, arc = Math.PI * 2, radial = 10, tubular = 32) =>
  new TorusGeometry(R, r, radial, tubular, arc)

/** A solid of revolution from [radius, height] pairs, bottom to top. */
export function lathe(points: ReadonlyArray<readonly [number, number]>, seg = 28): BufferGeometry {
  return new LatheGeometry(
    points.map(([r, y]) => new Vector2(r, y)),
    seg,
  )
}

/** A flat outline pushed into a slab, with a soft edge. Points are [x, y]; the slab is centred on z. */
export function slab(points: ReadonlyArray<readonly [number, number]>, depth: number, bevel = 0.04): BufferGeometry {
  const shape = new Shape()
  points.forEach(([x, y], index) => (index === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)))
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 3,
    curveSegments: 8,
  })
  geometry.translate(0, 0, -depth / 2)
  return geometry
}

/**
 * A tube along a curve whose thickness changes along it: a banana, a tail, a horn. `ridges` gives the
 * cross-section that many soft corners. The curve is sampled in the XY plane (any 3D points work).
 */
export function sweep(
  points: Vector3[],
  radius: (t: number) => number,
  options: { samples?: number; radial?: number; ridges?: number; ridgeDepth?: number } = {},
): BufferGeometry {
  const samples = options.samples ?? 32
  const radial = options.radial ?? 18
  const curve = new CatmullRomCurve3(points)
  const positions: number[] = []
  const indices: number[] = []
  const up = new Vector3(0, 0, 1)
  for (let i = 0; i <= samples; i++) {
    const t = i / samples
    const centre = curve.getPoint(t)
    const tangent = curve.getTangent(t).normalize()
    const normal = new Vector3().crossVectors(tangent, up).normalize()
    if (normal.lengthSq() < 0.5) normal.set(1, 0, 0)
    const binormal = new Vector3().crossVectors(normal, tangent).normalize()
    const base = radius(t)
    for (let j = 0; j < radial; j++) {
      const angle = (j / radial) * Math.PI * 2
      const ridge = options.ridges ? 1 + (options.ridgeDepth ?? 0.06) * Math.cos(angle * options.ridges) : 1
      const r = base * ridge
      positions.push(
        centre.x + (Math.cos(angle) * normal.x + Math.sin(angle) * binormal.x) * r,
        centre.y + (Math.cos(angle) * normal.y + Math.sin(angle) * binormal.y) * r,
        centre.z + (Math.cos(angle) * normal.z + Math.sin(angle) * binormal.z) * r,
      )
    }
  }
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j
      const b = i * radial + ((j + 1) % radial)
      const c = (i + 1) * radial + j
      const d = (i + 1) * radial + ((j + 1) % radial)
      indices.push(a, c, b, b, c, d)
    }
  }
  // Close both ends with a fan to the centre.
  for (const end of [0, samples]) {
    const centre = curve.getPoint(end / samples)
    const index = positions.length / 3
    positions.push(centre.x, centre.y, centre.z)
    for (let j = 0; j < radial; j++) {
      const a = end * radial + j
      const b = end * radial + ((j + 1) % radial)
      if (end === 0) indices.push(index, b, a)
      else indices.push(index, a, b)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

// ── Anatomy ────────────────────────────────────────────────────────────────

export interface Anchors {
  /** Where a hat sits: the top of the head, and about how wide the head is. */
  head: { pos: Vector3; r: number }
  /** The eyes, facing forward (+z). Absent: no face is drawn. */
  eyes: { l: Vector3; r: Vector3; size: number } | null
  mouth: { pos: Vector3; w: number } | null
  /** Where a tie or a chain hangs: a point on the front of the body. */
  chest: { pos: Vector3; w: number }
  /** A point on the back, for a cape, a backpack and wings. */
  back: { pos: Vector3; w: number; h: number }
}

export interface Limbs {
  armL: Group
  armR: Group
  legL: Group | null
  legR: Group | null
  handL: Object3D
  handR: Object3D
  pose(pose: Pose, time: number, motion: number): void
}

export interface Built {
  root: Group
  /** Everything that belongs to the body and is scaled by its build. */
  core: Group
  anchors: Anchors
  /** The head's own parts, removed when another thing is used as the head. */
  headParts: Group | null
  limbs: Limbs | null
  width: number
  height: number
  depth: number
  /** Called every frame with the time and how much to move (0 to 1). */
  tick: Array<(time: number, motion: number) => void>
  /** Where the body sits when it is seated, and how far it sinks into the seat. */
  seatDrop: number
}

export function createBuilt(): Built {
  const root = new Group()
  const core = new Group()
  root.add(core)
  return {
    root,
    core,
    anchors: {
      head: { pos: new Vector3(0, 1.6, 0), r: 0.4 },
      eyes: null,
      mouth: null,
      chest: { pos: new Vector3(0, 1, 0.4), w: 0.5 },
      back: { pos: new Vector3(0, 1, -0.4), w: 0.7, h: 1 },
    },
    headParts: null,
    limbs: null,
    width: 1,
    height: 2,
    depth: 1,
    tick: [],
    seatDrop: 0.35,
  }
}

export interface LimbSpec {
  /** Half the distance between the shoulders, and the shoulder height and depth. */
  shoulder: Vector3
  armLen: number
  hip?: Vector3
  legLen?: number
  radius: number
  paint: Paint
  handPaint?: Paint
  footPaint?: Paint
  build: Build
  /** A rest angle that spreads the arms (a cactus holds them up). */
  restOut?: number
  /** Arms end in a rounded tip instead of a hand. */
  noHands?: boolean
}

/** Builds two arms, and two legs if asked, that hang from pivots so they can be posed. */
export function makeLimbs(p: Painter, parent: Object3D, spec: LimbSpec): Limbs {
  const muscle = spec.build === 'muscular' ? 1.55 : spec.build === 'thin' ? 0.72 : 1
  const r = spec.radius * (spec.build === 'thin' ? 0.8 : 1)
  const armRadius = r * (spec.build === 'muscular' ? 1.25 : 1)
  const arm = (side: -1 | 1) => {
    const pivot = new Group()
    pivot.position.set(spec.shoulder.x * side, spec.shoulder.y, spec.shoulder.z)
    p.put(pivot, capsule(armRadius, spec.armLen - armRadius * 2), spec.paint, 0, -spec.armLen / 2, 0)
    if (spec.build === 'muscular') {
      p.put(pivot, ball(armRadius * muscle), spec.paint, 0, -spec.armLen * 0.3, 0.02)
      p.put(pivot, ball(armRadius * 1.3), spec.paint, 0, -spec.armLen * 0.68, 0)
    }
    const hand = new Group()
    hand.position.set(0, -spec.armLen, 0)
    pivot.add(hand)
    if (!spec.noHands) p.put(hand, ball(armRadius * 1.3), spec.handPaint ?? spec.paint)
    else p.put(hand, ball(armRadius), spec.paint)
    parent.add(pivot)
    return { pivot, hand }
  }
  const left = arm(-1)
  const right = arm(1)
  let legL: Group | null = null
  let legR: Group | null = null
  if (spec.hip && spec.legLen) {
    const hip = spec.hip
    const length = spec.legLen
    const leg = (side: -1 | 1) => {
      const pivot = new Group()
      pivot.position.set(hip.x * side, hip.y, hip.z)
      const legRadius = r * 1.1 * (spec.build === 'muscular' ? 1.2 : 1)
      p.put(pivot, capsule(legRadius, length - legRadius * 2), spec.paint, 0, -length / 2, 0)
      p.put(pivot, ellipsoid(legRadius * 1.3, legRadius * 0.8, legRadius * 2.1), spec.footPaint ?? spec.paint, 0, -length, legRadius * 0.9)
      parent.add(pivot)
      return pivot
    }
    legL = leg(-1)
    legR = leg(1)
  }
  const out = spec.restOut ?? 0.18
  const limbs: Limbs = {
    armL: left.pivot,
    armR: right.pivot,
    legL,
    legR,
    handL: left.hand,
    handR: right.hand,
    pose(pose, t, m) {
      const swing = (a: number) => Math.sin(t * a) * m
      let lOut = out
      let rOut = out
      let lFwd = 0
      let rFwd = 0
      let lLeg = 0
      let rLeg = 0
      switch (pose) {
        case 'dance':
          lOut = 2.3 + swing(5) * 0.45
          rOut = 2.3 - swing(5) * 0.45
          lFwd = swing(2.5) * 0.3
          rFwd = -swing(2.5) * 0.3
          lLeg = swing(5) * 0.45
          rLeg = -swing(5) * 0.45
          break
        case 'flex':
          lOut = rOut = 1.55 + swing(3) * 0.05
          lFwd = rFwd = 0
          break
        case 'drive':
          lFwd = rFwd = 1.2
          lOut = rOut = 0.12
          lLeg = rLeg = 1.35
          break
        case 'work':
          lFwd = 0.95 + swing(11) * 0.08
          rFwd = 0.95 - swing(11) * 0.08
          lOut = rOut = 0.1
          break
        case 'fly':
          lFwd = rFwd = 2.9
          lOut = rOut = 0.1
          lLeg = rLeg = -0.15
          break
        case 'run':
          lFwd = swing(8) * 0.9
          rFwd = -swing(8) * 0.9
          lLeg = -swing(8) * 0.7
          rLeg = swing(8) * 0.7
          break
        case 'sit':
          lLeg = rLeg = 1.5
          break
        case 'box':
          lFwd = 1.15 + Math.max(0, swing(6)) * 0.45
          rFwd = 1.15 + Math.max(0, -swing(6)) * 0.45
          lOut = rOut = 0.25
          break
        default:
          break
      }
      left.pivot.rotation.set(lFwd, 0, -lOut)
      right.pivot.rotation.set(rFwd, 0, rOut)
      if (legL && legR) {
        legL.rotation.x = lLeg
        legR.rotation.x = rLeg
      }
    },
  }
  return limbs
}

// ── Face ────────────────────────────────────────────────────────────────────

/** Eyes, brows and a mouth for a mood, placed on the anchors. */
export function addFace(p: Painter, parent: Object3D, anchors: Anchors, mood: Mood): Group | null {
  const { eyes, mouth } = anchors
  if (!eyes && !mouth) return null
  const face = new Group()
  parent.add(face)
  if (eyes) {
    const s = eyes.size * (mood === 'surprised' || mood === 'scared' ? 1.25 : 1)
    for (const side of [-1, 1] as const) {
      const at = side === -1 ? eyes.l : eyes.r
      const eye = new Group()
      eye.position.copy(at)
      face.add(eye)
      p.put(eye, ellipsoid(s, s * 1.12, s * 0.62), WHITE)
      const look = mood === 'sad' ? -0.12 : mood === 'cool' ? 0.1 : 0
      p.put(eye, ball(s * (mood === 'scared' ? 0.36 : 0.52)), BLACK, s * look, mood === 'sad' ? -s * 0.15 : 0, s * 0.42)
      p.put(eye, ball(s * 0.14, 8, 6), WHITE, s * 0.16, s * 0.2, s * 0.78)
      if (mood === 'sleepy' || mood === 'cool') {
        const cover = mood === 'sleepy' ? 0.58 : 0.35
        const lid = p.put(eye, new SphereGeometry(s * 1.07, 20, 10, 0, Math.PI * 2, 0, Math.PI * (0.5 + cover * 0.28)), 'main')
        lid.scale.set(1, 1.12, 0.7)
        lid.position.y = s * (cover - 0.35) * 0.1
      }
      const angle = mood === 'angry' ? -0.55 : mood === 'sad' || mood === 'scared' ? 0.45 : mood === 'proud' ? -0.18 : 0
      if (mood !== 'cool' && mood !== 'sleepy') {
        const brow = p.put(
          eye,
          box(s * 1.7, s * 0.3, s * 0.3, s * 0.1),
          mood === 'happy' ? 'accent' : DARK,
          0,
          s * (mood === 'surprised' ? 1.9 : mood === 'happy' ? 1.65 : 1.45),
          s * 0.2,
        )
        brow.rotation.z = angle * -side
      }
    }
  }
  if (mouth) {
    const w = mouth.w
    const group = new Group()
    group.position.copy(mouth.pos)
    face.add(group)
    const tube = w * 0.055
    switch (mood) {
      case 'happy':
      case 'proud': {
        const smile = p.put(group, torus(w * 0.5, tube, Math.PI, 8, 24), MOUTH, 0, w * 0.18, 0)
        smile.rotation.z = Math.PI
        break
      }
      case 'sad':
      case 'scared':
      case 'angry': {
        const frown = p.put(group, torus(w * (mood === 'angry' ? 0.42 : 0.5), tube * 1.2, Math.PI, 8, 24), MOUTH, 0, -w * 0.2, 0)
        if (mood === 'angry') {
          p.put(group, box(w * 0.14, w * 0.14, tube * 2, 0.01), WHITE, -w * 0.12, -w * 0.04, 0.0)
          p.put(group, box(w * 0.14, w * 0.14, tube * 2, 0.01), WHITE, w * 0.12, -w * 0.04, 0.0)
        }
        void frown
        break
      }
      case 'surprised':
        p.put(group, ellipsoid(w * 0.2, w * 0.27, w * 0.1), MOUTH)
        break
      case 'sleepy':
        p.put(group, ellipsoid(w * 0.13, w * 0.1, w * 0.06), MOUTH)
        break
      default: {
        const smirk = p.put(group, box(w * 0.7, tube * 2.2, tube * 2, 0.01), MOUTH, w * 0.05, 0, 0)
        smirk.rotation.z = 0.2
        break
      }
    }
  }
  return face
}

export function placeAt<T extends Object3D>(object: T, x: number, y: number, z: number): T {
  object.position.set(x, y, z)
  return object
}
