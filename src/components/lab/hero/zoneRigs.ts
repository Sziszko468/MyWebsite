import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Material,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import { damp } from '../../hero/heroMath'
import type { ScenePalette } from '../../hero/heroPalette'
import { defaultTrack, sampleTrack } from '../experiences/racing/trackModel'
import type { ZoneId } from './zones'

/**
 * The four objects that stand for the four zones of the Lab's space. Each is built from plain
 * three.js primitives, about one unit in radius, and does one small thing of its own while it is
 * awake (the pointer is over it, or its link has focus), which is the preview of what the zone
 * is: the Studio's scene comes apart into its pieces, the car drives the real Lab Circuit, the
 * circuit's handles are dragged and its line follows, the two setups' bars compare and a gauge
 * sweeps. They are symbols, not data: nothing here measures anything.
 *
 * Everything is created once. A frame writes numbers into objects that already exist.
 */

export interface RigFrame {
  dt: number
  /** Seconds on the Lab clock. */
  t: number
  /** 0..1, eased: how awake this zone is. */
  awake: number
  /** The pointer's eased position over the stage, -1..1. */
  lookX: number
  lookY: number
  /** 1 live, less when calm. */
  motion: number
  /** The scene may move by itself. */
  autonomous: boolean
  palette: ScenePalette
}

export interface ZoneRig {
  id: ZoneId
  /** Placed and scaled by the scene; local space is about one unit in radius. */
  group: Group
  update(frame: RigFrame): void
  dispose(): void
}

type Role = 'red' | 'blue' | 'ink' | 'soft'
type Vec3 = [number, number, number]

/** Owns what a rig creates, so it can be tinted with the theme and released together. */
class Kit {
  private readonly tinted: Array<{ color: Color; role: Role }> = []
  private readonly geometries: BufferGeometry[] = []
  private readonly materials: Material[] = []
  private readonly scratch = new Color()

  geometry<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry)
    return geometry
  }

  solid(role: Role): MeshLambertMaterial {
    const material = new MeshLambertMaterial()
    this.tinted.push({ color: material.color, role })
    this.materials.push(material)
    return material
  }

  flat(role: Role, opacity: number): MeshBasicMaterial {
    const material = new MeshBasicMaterial({ transparent: true, opacity, depthWrite: false })
    this.tinted.push({ color: material.color, role })
    this.materials.push(material)
    return material
  }

  line(role: Role, opacity: number): LineBasicMaterial {
    const material = new LineBasicMaterial({ transparent: true, opacity, depthWrite: false })
    this.tinted.push({ color: material.color, role })
    this.materials.push(material)
    return material
  }

  apply(palette: ScenePalette): void {
    for (const { color, role } of this.tinted) {
      if (role === 'red') color.copy(palette.red)
      else if (role === 'blue') color.copy(palette.blue)
      else if (role === 'ink') color.copy(palette.ink)
      else color.copy(this.scratch.copy(palette.bg).lerp(palette.ink, 0.55))
    }
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose()
    for (const material of this.materials) material.dispose()
  }
}

function lineGeometry(kit: Kit, positions: ArrayLike<number>): BufferGeometry {
  const geometry = kit.geometry(new BufferGeometry())
  geometry.setAttribute('position', new Float32BufferAttribute(positions as number[], 3))
  return geometry
}

function circle(kit: Kit, radius: number, segments = 72): BufferGeometry {
  const positions = new Float32Array(segments * 3)
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    positions[i * 3] = Math.cos(a) * radius
    positions[i * 3 + 1] = Math.sin(a) * radius
  }
  return lineGeometry(kit, positions)
}

function noCulling(root: Object3D): void {
  root.traverse((object) => {
    object.frustumCulled = false
  })
}

/** The ring that says "this one is awake": faint at rest, bright when the zone wakes. */
function halo(kit: Kit, group: Group): LineBasicMaterial {
  const material = kit.line('red', 0.16)
  group.add(new LineLoop(circle(kit, 1.06), material))
  return material
}

// ── The circuit the Racing and Track Architect objects share ─────────────────────────────

interface Circuit {
  count: number
  x: Float32Array
  z: Float32Array
  /** Unit tangent in plan. */
  tx: Float32Array
  tz: Float32Array
}

let circuitCache: Circuit | null = null

/**
 * The Lab Circuit (the same data the race drives), cut into about a hundred points and scaled to
 * stand inside one unit: the object is the real track, not a drawing of "a track".
 */
function circuit(): Circuit {
  if (circuitCache) return circuitCache
  const samples = sampleTrack(defaultTrack(), 24)
  if (!samples) throw new Error('The default circuit could not be sampled.')
  const n = samples.count
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, samples.x[i])
    maxX = Math.max(maxX, samples.x[i])
    minZ = Math.min(minZ, samples.z[i])
    maxZ = Math.max(maxZ, samples.z[i])
  }
  const cx = (minX + maxX) / 2
  const cz = (minZ + maxZ) / 2
  const scale = 0.94 / Math.max((maxX - minX) / 2, (maxZ - minZ) / 2, 1)
  const result: Circuit = {
    count: n,
    x: new Float32Array(n),
    z: new Float32Array(n),
    tx: new Float32Array(n),
    tz: new Float32Array(n),
  }
  for (let i = 0; i < n; i++) {
    result.x[i] = (samples.x[i] - cx) * scale
    result.z[i] = (samples.z[i] - cz) * scale
    result.tx[i] = samples.tx[i]
    result.tz[i] = samples.tz[i]
  }
  circuitCache = result
  return result
}

// ── 07 Model Studio: a scene that comes apart ────────────────────────────────────────────

function studioRig(): ZoneRig {
  const kit = new Kit()
  const group = new Group()
  const body = new Group()
  group.add(body)
  const ring = halo(kit, group)

  const parts: Array<{ mesh: Mesh; home: Vec3; spin: Vec3 }> = []
  const part = (geometry: BufferGeometry, role: Role, home: Vec3, spin: Vec3): Mesh => {
    const mesh = new Mesh(kit.geometry(geometry), kit.solid(role))
    mesh.position.set(...home)
    body.add(mesh)
    parts.push({ mesh, home, spin })
    return mesh
  }
  part(new BoxGeometry(0.62, 0.62, 0.62), 'soft', [-0.4, -0.2, 0.05], [0.5, 0.7, 0.1])
  part(new SphereGeometry(0.36, 28, 20), 'red', [0.42, 0.08, 0.1], [0.2, 0.4, 0])
  part(new TorusGeometry(0.46, 0.07, 12, 44), 'blue', [0, 0.6, -0.1], [0.3, 0, 0.5]).rotation.x = 1.1
  part(new ConeGeometry(0.27, 0.56, 24), 'ink', [0.14, -0.56, 0.3], [0, 0.8, 0])

  // The gizmo: three axes from a corner, which the Studio's handles are.
  const axes = new Group()
  const axisMaterials = [kit.line('red', 0.4), kit.line('ink', 0.4), kit.line('blue', 0.4)]
  const ends: Vec3[] = [
    [0.5, 0, 0],
    [0, 0.5, 0],
    [0, 0, 0.5],
  ]
  ends.forEach((end, i) => axes.add(new Line(lineGeometry(kit, [0, 0, 0, ...end]), axisMaterials[i])))
  axes.position.set(-0.95, -0.8, 0)
  body.add(axes)
  noCulling(group)

  return {
    id: 'model-studio',
    group,
    update(f) {
      kit.apply(f.palette)
      const k = f.awake
      body.rotation.x = 0.26 + f.lookY * 0.18 * f.motion
      body.rotation.y += f.dt * ((f.autonomous ? 0.26 : 0) + 0.5 * k)
      const spread = 1 + 0.5 * k
      const spin = (f.autonomous ? 0.35 : 0) + 1.1 * k
      for (const { mesh, home, spin: s } of parts) {
        mesh.position.set(home[0] * spread, home[1] * spread, home[2] * spread)
        mesh.rotation.x += s[0] * f.dt * spin
        mesh.rotation.y += s[1] * f.dt * spin
        mesh.rotation.z += s[2] * f.dt * spin
      }
      for (const material of axisMaterials) material.opacity = 0.3 + 0.65 * k
      ring.opacity = 0.16 + 0.8 * k
    },
    dispose: () => kit.dispose(),
  }
}

// ── 08 Racing Experience: the car on the real circuit ───────────────────────────────────

function racingRig(): ZoneRig {
  const kit = new Kit()
  const track = circuit()
  const group = new Group()
  const body = new Group()
  group.add(body)
  const ring = halo(kit, group)

  // The road: a flat ribbon with the centre line on it.
  const road = 0.055
  const vertices = new Float32Array(track.count * 2 * 3)
  const indices: number[] = []
  for (let i = 0; i < track.count; i++) {
    const nx = -track.tz[i]
    const nz = track.tx[i]
    vertices.set([track.x[i] + nx * road, 0, track.z[i] + nz * road], i * 6)
    vertices.set([track.x[i] - nx * road, 0, track.z[i] - nz * road], i * 6 + 3)
    const next = (i + 1) % track.count
    indices.push(i * 2, i * 2 + 1, next * 2, i * 2 + 1, next * 2 + 1, next * 2)
  }
  const ribbon = kit.geometry(new BufferGeometry())
  ribbon.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  ribbon.setIndex(indices)
  body.add(new Mesh(ribbon, kit.flat('ink', 0.3)))
  const centre = new Float32Array(track.count * 3)
  for (let i = 0; i < track.count; i++) centre.set([track.x[i], 0.004, track.z[i]], i * 3)
  const centreMaterial = kit.line('red', 0.75)
  body.add(new LineLoop(lineGeometry(kit, centre), centreMaterial))

  // The car, about as long as the road is wide.
  const car = new Group()
  const box = (w: number, h: number, d: number, role: Role, x: number, y: number, z: number) => {
    const mesh = new Mesh(kit.geometry(new BoxGeometry(w, h, d)), kit.solid(role))
    mesh.position.set(x, y, z)
    car.add(mesh)
  }
  box(0.062, 0.022, 0.15, 'red', 0, 0.026, 0)
  box(0.038, 0.02, 0.055, 'ink', 0, 0.046, -0.012)
  box(0.1, 0.006, 0.02, 'blue', 0, 0.016, 0.082)
  box(0.075, 0.006, 0.016, 'ink', 0, 0.056, -0.075)
  const wheel = kit.geometry(new CylinderGeometry(0.02, 0.02, 0.022, 14))
  const wheelMaterial = kit.solid('ink')
  for (const [x, z] of [
    [-0.044, 0.05],
    [0.044, 0.05],
    [-0.044, -0.05],
    [0.044, -0.05],
  ]) {
    const mesh = new Mesh(wheel, wheelMaterial)
    mesh.rotation.z = Math.PI / 2
    mesh.position.set(x, 0.02, z)
    car.add(mesh)
  }
  car.scale.setScalar(1.7)
  body.add(car)
  noCulling(group)

  let lap = 0.12
  return {
    id: 'racing',
    group,
    update(f) {
      kit.apply(f.palette)
      const k = f.awake
      body.rotation.x = 0.95 + f.lookY * 0.12 * f.motion
      body.rotation.y = f.lookX * 0.16 * f.motion
      // Slowly on its own, flat out when the zone is awake: a lap in about five seconds.
      lap = (lap + f.dt * ((f.autonomous ? 0.03 : 0) + 0.2 * k)) % 1
      const at = lap * track.count
      const i = Math.floor(at) % track.count
      const j = (i + 1) % track.count
      const u = at - Math.floor(at)
      car.position.set(track.x[i] + (track.x[j] - track.x[i]) * u, 0, track.z[i] + (track.z[j] - track.z[i]) * u)
      car.rotation.y = Math.atan2(track.tx[i], track.tz[i])
      centreMaterial.opacity = 0.5 + 0.45 * k
      ring.opacity = 0.16 + 0.8 * k
    },
    dispose: () => kit.dispose(),
  }
}

// ── 09 Track Architect: handles that are dragged, a line that follows ───────────────────

const HANDLES = 12
const SEGMENT_POINTS = 7

function architectRig(): ZoneRig {
  const kit = new Kit()
  const track = circuit()
  const group = new Group()
  const body = new Group()
  group.add(body)
  const ring = halo(kit, group)

  const home = new Float32Array(HANDLES * 2)
  for (let h = 0; h < HANDLES; h++) {
    const i = Math.floor((h * track.count) / HANDLES)
    home[h * 2] = track.x[i]
    home[h * 2 + 1] = track.z[i]
  }

  // The plan grid the editor draws on.
  const grid: number[] = []
  for (let g = -4; g <= 4; g++) {
    const at = g * 0.25
    grid.push(-1, 0, at, 1, 0, at, at, 0, -1, at, 0, 1)
  }
  body.add(new LineSegments(lineGeometry(kit, grid), kit.line('soft', 0.2)))

  const spline = new Float32Array(HANDLES * SEGMENT_POINTS * 3)
  const splineGeometry = lineGeometry(kit, spline)
  const splineMaterial = kit.line('red', 0.85)
  body.add(new LineLoop(splineGeometry, splineMaterial))

  const handleGeometry = kit.geometry(new SphereGeometry(0.036, 14, 10))
  const handleMaterial = kit.solid('blue')
  const grabbedMaterial = kit.solid('red')
  const handles: Mesh[] = []
  for (let h = 0; h < HANDLES; h++) {
    const mesh = new Mesh(handleGeometry, handleMaterial)
    body.add(mesh)
    handles.push(mesh)
  }
  const cursor = new LineLoop(circle(kit, 0.085, 28), kit.line('red', 0.9))
  cursor.rotation.x = Math.PI / 2
  body.add(cursor)
  const grabbed = new Mesh(handleGeometry, grabbedMaterial)
  grabbed.scale.setScalar(1.5)
  body.add(grabbed)
  noCulling(group)

  const pos = new Float32Array(HANDLES * 2)
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
    0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t)

  let grab = 0
  let since = 0
  return {
    id: 'track-architect',
    group,
    update(f) {
      kit.apply(f.palette)
      const k = f.awake
      body.rotation.x = 0.95 + f.lookY * 0.12 * f.motion
      body.rotation.y = f.lookX * 0.16 * f.motion

      // Every handle drifts a little; the one being dragged is taken somewhere on purpose.
      since += f.dt
      if (since > 2.2 && (k > 0.5 || f.autonomous)) {
        since = 0
        grab = (grab + 5) % HANDLES
      }
      const wobble = (f.autonomous ? 0.012 : 0) + 0.03 * k
      for (let h = 0; h < HANDLES; h++) {
        const drag = h === grab ? (0.03 + 0.16 * k) * Math.sin(f.t * 1.5) : 0
        pos[h * 2] = home[h * 2] + Math.sin(f.t * 0.9 + h * 1.7) * wobble + drag * 0.7
        pos[h * 2 + 1] = home[h * 2 + 1] + Math.cos(f.t * 0.7 + h * 2.3) * wobble + drag
      }
      for (let h = 0; h < HANDLES; h++) {
        handles[h].position.set(pos[h * 2], 0, pos[h * 2 + 1])
        handles[h].visible = h !== grab
        const a = ((h - 1 + HANDLES) % HANDLES) * 2
        const b = h * 2
        const c = ((h + 1) % HANDLES) * 2
        const d = ((h + 2) % HANDLES) * 2
        for (let s = 0; s < SEGMENT_POINTS; s++) {
          const t = s / SEGMENT_POINTS
          const o = (h * SEGMENT_POINTS + s) * 3
          spline[o] = cr(pos[a], pos[b], pos[c], pos[d], t)
          spline[o + 1] = 0
          spline[o + 2] = cr(pos[a + 1], pos[b + 1], pos[c + 1], pos[d + 1], t)
        }
      }
      const attribute = splineGeometry.getAttribute('position')
      ;(attribute.array as Float32Array).set(spline)
      attribute.needsUpdate = true
      grabbed.position.set(pos[grab * 2], 0, pos[grab * 2 + 1])
      cursor.position.set(pos[grab * 2], 0.001, pos[grab * 2 + 1])
      cursor.scale.setScalar(1 + 0.2 * Math.sin(f.t * 5) * k)
      splineMaterial.opacity = 0.6 + 0.35 * k
      ring.opacity = 0.16 + 0.8 * k
    },
    dispose: () => kit.dispose(),
  }
}

// ── 10 Performance Lab: two setups side by side, a gauge, the air ───────────────────────

const PAIRS = 6
const BAR_BASE = -0.62
const STREAKS = 7

function performanceRig(): ZoneRig {
  const kit = new Kit()
  const group = new Group()
  const body = new Group()
  group.add(body)
  const ring = halo(kit, group)

  const barGeometry = kit.geometry(new BoxGeometry(1, 1, 1))
  const aMaterial = kit.solid('soft')
  const bMaterial = kit.solid('red')
  const baseA = [0.5, 0.7, 0.45, 0.8, 0.6, 0.55]
  const baseB = [0.62, 0.6, 0.58, 0.72, 0.75, 0.5]
  const bars: Array<{ a: Mesh; b: Mesh }> = []
  for (let i = 0; i < PAIRS; i++) {
    const x = -0.75 + i * 0.3
    const a = new Mesh(barGeometry, aMaterial)
    const b = new Mesh(barGeometry, bMaterial)
    a.scale.set(0.095, baseA[i], 0.095)
    b.scale.set(0.095, baseB[i], 0.095)
    a.position.set(x - 0.065, BAR_BASE + baseA[i] / 2, 0)
    b.position.set(x + 0.065, BAR_BASE + baseB[i] / 2, 0)
    body.add(a, b)
    bars.push({ a, b })
  }
  body.add(new Line(lineGeometry(kit, [-0.95, BAR_BASE, 0, 0.95, BAR_BASE, 0]), kit.line('soft', 0.5)))

  // The gauge: an arc, its ticks and a needle.
  const arc: number[] = []
  for (let i = 0; i <= 32; i++) {
    const a = Math.PI - (i / 32) * Math.PI
    arc.push(Math.cos(a) * 0.42, 0.5 + Math.sin(a) * 0.42, 0)
  }
  body.add(new Line(lineGeometry(kit, arc), kit.line('ink', 0.55)))
  const ticks: number[] = []
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI - (i / 8) * Math.PI
    ticks.push(Math.cos(a) * 0.42, 0.5 + Math.sin(a) * 0.42, 0, Math.cos(a) * 0.49, 0.5 + Math.sin(a) * 0.49, 0)
  }
  body.add(new LineSegments(lineGeometry(kit, ticks), kit.line('ink', 0.55)))
  const needle = lineGeometry(kit, [0, 0.5, 0, 0, 0.9, 0])
  const needleMaterial = kit.line('red', 0.95)
  body.add(new Line(needle, needleMaterial))

  // The air: short streaks that run across and wrap.
  const streakGeometry = lineGeometry(kit, new Float32Array(STREAKS * 6))
  const streakMaterial = kit.line('blue', 0.5)
  body.add(new LineSegments(streakGeometry, streakMaterial))
  noCulling(group)

  const streakRows = Array.from({ length: STREAKS }, (_, i) => -0.3 + (i / (STREAKS - 1)) * 0.95)
  const streakPhase = Array.from({ length: STREAKS }, (_, i) => (i * 0.37) % 1)
  let flow = 0
  let sweep = 0
  return {
    id: 'performance-lab',
    group,
    update(f) {
      kit.apply(f.palette)
      const k = f.awake
      body.rotation.x = 0.16 + f.lookY * 0.16 * f.motion
      body.rotation.y = -0.18 + f.lookX * 0.3 * f.motion

      // Setup B against setup A: B's bars move, A's stay where the baseline was.
      const move = (f.autonomous ? 0.07 : 0) + 0.3 * k
      for (let i = 0; i < PAIRS; i++) {
        const h = Math.max(0.08, baseB[i] * (1 + move * Math.sin(f.t * 1.9 + i * 1.1)))
        bars[i].b.scale.y = h
        bars[i].b.position.y = BAR_BASE + h / 2
      }

      sweep += f.dt * ((f.autonomous ? 0.6 : 0) + 2.4 * k)
      const reading = 0.5 + 0.38 * Math.sin(sweep)
      const angle = Math.PI - reading * Math.PI
      const attribute = needle.getAttribute('position')
      const array = attribute.array as Float32Array
      array[3] = Math.cos(angle) * 0.4
      array[4] = 0.5 + Math.sin(angle) * 0.4
      attribute.needsUpdate = true

      flow += f.dt * ((f.autonomous ? 0.14 : 0) + 0.9 * k)
      const streaks = streakGeometry.getAttribute('position')
      const s = streaks.array as Float32Array
      for (let i = 0; i < STREAKS; i++) {
        const x = ((streakPhase[i] + flow * (0.7 + (i % 3) * 0.25)) % 1) * 2.1 - 1.05
        const length = 0.1 + (i % 3) * 0.05
        s[i * 6] = x
        s[i * 6 + 1] = streakRows[i]
        s[i * 6 + 2] = 0.12
        s[i * 6 + 3] = x + length
        s[i * 6 + 4] = streakRows[i]
        s[i * 6 + 5] = 0.12
      }
      streaks.needsUpdate = true
      streakMaterial.opacity = 0.12 + 0.55 * k
      needleMaterial.opacity = 0.5 + 0.45 * k
      ring.opacity = 0.16 + 0.8 * k
    },
    dispose: () => kit.dispose(),
  }
}

/** The four rigs, in the Lab's order. */
export function buildZoneRigs(): ZoneRig[] {
  return [studioRig(), racingRig(), architectRig(), performanceRig()]
}

/** How fast a zone wakes and falls asleep: seconds for the difference to halve. */
export const WAKE_HALF_LIFE = 0.14

export function easeAwake(current: number, target: number, dt: number): number {
  return damp(current, target, WAKE_HALF_LIFE, dt)
}
