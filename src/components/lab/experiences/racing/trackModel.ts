/**
 * The track as data. A track is a short list of control points (where it goes, how wide it is, how
 * high, whether the corner has kerbs or a gravel trap); a smooth centripetal Catmull-Rom curve runs
 * through them and is cut into evenly spaced samples. The samples are everything the rest needs:
 * the racing physics asks which part of the track a point is on, the meshes are built from them
 * and the lap simulation walks along them. Plan view, metres: x to the right, z down the screen,
 * y up. The curve is closed for a lap, open while it is still being drawn.
 *
 * No React and no Three.js in here, so all of it can be tested.
 */

export const TRACK = {
  minPoints: 4,
  maxPoints: 160,
  /** What the editor allows; below `drivableWidth` the track is flagged as too narrow. */
  minWidth: 5,
  maxWidth: 30,
  drivableWidth: 8,
  maxElevation: 12,
  maxCoord: 2500,
  minLength: 500,
  maxLength: 7000,
  /** Distance between samples, metres. */
  spacing: 2.5,
  kerbWidth: 1.4,
  /** Sharper than this (corner radius, m) cannot be driven at all; below `tightRadius` it is a warning. */
  minRadius: 14,
  tightRadius: 22,
  maxGrade: 0.15,
  warnGrade: 0.1,
  /** Closest and furthest apart two neighbouring control points may be. */
  minSegment: 8,
  maxSegment: 400,
  /** Width of the run-off between the road's edge and the barrier. */
  runoffGrass: 9,
  runoffGravel: 18,
} as const

export interface TrackPoint {
  x: number
  z: number
  /** Height of the road above the lowest ground, m. */
  y: number
  /** Road width at this point, m. */
  width: number
  /** Kerbs on both edges here. */
  kerb: boolean
  /** A gravel trap instead of grass beside the road here. */
  gravel: boolean
}

export interface TrackDef {
  version: 1
  name: string
  /** The last point connects back to the first: a lap. */
  closed: boolean
  /** Index of the point the start/finish line is on; the cars run towards the next point. */
  start: number
  points: TrackPoint[]
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function num(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? clamp(value, min, max) : fallback
}

/** A name that is safe to show and to use in a file name. */
export function cleanTrackName(raw: unknown, fallback = 'My circuit'): string {
  if (typeof raw !== 'string') return fallback
  let name = ''
  for (const char of raw) {
    // Control characters and the ones that mean something in HTML, URLs or file names are dropped.
    if (char.charCodeAt(0) >= 32 && !'<>"\'`&\\'.includes(char)) name += char
  }
  name = name.trim().slice(0, 40)
  return name || fallback
}

export function sanitizePoint(raw: unknown): TrackPoint | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (
    typeof record.x !== 'number' ||
    typeof record.z !== 'number' ||
    !Number.isFinite(record.x) ||
    !Number.isFinite(record.z)
  )
    return null
  return {
    x: clamp(record.x, -TRACK.maxCoord, TRACK.maxCoord),
    z: clamp(record.z, -TRACK.maxCoord, TRACK.maxCoord),
    y: num(record.y, -TRACK.maxElevation, TRACK.maxElevation, 0),
    width: num(record.width, TRACK.minWidth, TRACK.maxWidth, 12),
    kerb: record.kerb === true,
    gravel: record.gravel === true,
  }
}

/** Accepts only what a track is; clamps every number, cuts the list at the limit and refuses the rest. */
export function parseTrack(raw: unknown): TrackDef | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (record.version !== 1 || !Array.isArray(record.points)) return null
  const points: TrackPoint[] = []
  for (const item of record.points.slice(0, TRACK.maxPoints)) {
    const point = sanitizePoint(item)
    if (point) points.push(point)
  }
  if (points.length < 2) return null
  return {
    version: 1,
    name: cleanTrackName(record.name),
    closed: record.closed === true,
    start: Math.floor(num(record.start, 0, points.length - 1, 0)),
    points,
  }
}

export function serializeTrack(track: TrackDef): TrackDef {
  return {
    version: 1,
    name: track.name,
    closed: track.closed,
    start: track.start,
    points: track.points.map((p) => ({ ...p })),
  }
}

/** A short text that changes whenever the track's shape does: the key for a saved best lap. */
export function trackSignature(track: TrackDef): string {
  let hash = 2166136261
  const feed = (value: number) => {
    hash ^= Math.round(value * 10)
    hash = Math.imul(hash, 16777619)
  }
  feed(track.closed ? 1 : 0)
  feed(track.start)
  for (const p of track.points) {
    feed(p.x)
    feed(p.z)
    feed(p.y)
    feed(p.width)
    feed(p.kerb ? 1 : 0)
    feed(p.gravel ? 1 : 0)
  }
  return (hash >>> 0).toString(36)
}

// ── Turtle: the track's building blocks ───────────────────────────────────────────────

interface PieceFlags {
  kerb?: boolean
  gravel?: boolean
}

/**
 * Draws a track the way you would drive it: forward, and round a corner of a given radius. The
 * elements of the editor and the default circuit are made with it. Positive turns are to the right.
 */
export class Turtle {
  x: number
  z: number
  /** Heading, radians; 0 is +x, and it grows clockwise on the screen (towards +z). */
  psi: number
  y: number
  width: number
  points: TrackPoint[] = []

  constructor(x: number, z: number, psi: number, y: number, width: number) {
    this.x = x
    this.z = z
    this.psi = psi
    this.y = y
    this.width = width
  }

  private push(flags?: PieceFlags): void {
    this.points.push({
      x: this.x,
      z: this.z,
      y: this.y,
      width: this.width,
      kerb: flags?.kerb === true,
      gravel: flags?.gravel === true,
    })
  }

  /** The first point of a track. */
  begin(flags?: PieceFlags): this {
    this.push(flags)
    return this
  }

  straight(length: number, dy = 0, flags?: PieceFlags): this {
    const pieces = Math.max(1, Math.ceil(length / 40))
    for (let i = 0; i < pieces; i++) {
      this.x += (length / pieces) * Math.cos(this.psi)
      this.z += (length / pieces) * Math.sin(this.psi)
      this.y += dy / pieces
      this.push(flags)
    }
    return this
  }

  /** A corner of `radius` metres through `degrees`, to the `side`. */
  arc(radius: number, degrees: number, side: 'left' | 'right', dy = 0, flags?: PieceFlags): this {
    const pieces = Math.max(1, Math.ceil(degrees / 30))
    const step = ((degrees / pieces) * Math.PI) / 180
    for (let i = 0; i < pieces; i++) {
      if (side === 'left') {
        const cx = this.x + radius * Math.sin(this.psi)
        const cz = this.z - radius * Math.cos(this.psi)
        this.psi -= step
        this.x = cx - radius * Math.sin(this.psi)
        this.z = cz + radius * Math.cos(this.psi)
      } else {
        const cx = this.x - radius * Math.sin(this.psi)
        const cz = this.z + radius * Math.cos(this.psi)
        this.psi += step
        this.x = cx + radius * Math.sin(this.psi)
        this.z = cz - radius * Math.cos(this.psi)
      }
      this.y += dy / pieces
      this.push(flags)
    }
    return this
  }
}

export type ElementKind = 'straight' | 'gentle' | 'tight' | 'hairpin' | 'sbend' | 'climb' | 'descent'
export type Side = 'left' | 'right'

export const ELEMENT_KINDS: readonly ElementKind[] = [
  'straight',
  'gentle',
  'tight',
  'hairpin',
  'sbend',
  'climb',
  'descent',
]

/** How many control points an element adds, so the editor can tell before it adds one. */
export function elementSize(kind: ElementKind): number {
  switch (kind) {
    case 'straight':
    case 'climb':
    case 'descent':
      return 2
    case 'gentle':
    case 'tight':
      return 3
    case 'hairpin':
      return 6
    case 'sbend':
      return 4
  }
}

/** Where the next element starts: the last point and the way it is heading. */
export function endOfTrack(track: TrackDef): { x: number; z: number; psi: number; y: number; width: number } {
  const last = track.points[track.points.length - 1]
  const before = track.points[track.points.length - 2]
  if (!last) return { x: 0, z: 0, psi: 0, y: 0, width: 12 }
  const psi = before ? Math.atan2(last.z - before.z, last.x - before.x) : 0
  return { x: last.x, z: last.z, psi, y: last.y, width: last.width }
}

/**
 * Adds an element to the end of the track, in the direction it is heading. Adding to a closed loop
 * opens it again: the new points go after the last one, and the visitor closes it when done.
 */
export function appendElement(track: TrackDef, kind: ElementKind, side: Side): TrackDef {
  if (track.points.length + elementSize(kind) > TRACK.maxPoints) return track
  const end = endOfTrack(track)
  const turtle = new Turtle(end.x, end.z, end.psi, end.y, end.width)
  const other: Side = side === 'left' ? 'right' : 'left'
  if (track.points.length === 0) turtle.begin()
  switch (kind) {
    case 'straight':
      turtle.straight(60)
      break
    case 'gentle':
      turtle.arc(70, 90, side)
      break
    case 'tight':
      turtle.arc(35, 90, side, 0, { kerb: true })
      break
    case 'hairpin':
      turtle.arc(26, 150, side, 0, { kerb: true })
      turtle.arc(26, 30, side, 0, { kerb: true, gravel: true })
      break
    case 'sbend':
      turtle.arc(60, 40, side)
      turtle.arc(60, 40, other)
      break
    case 'climb':
      turtle.straight(80, 5)
      break
    case 'descent':
      turtle.straight(80, -5)
      break
  }
  const added = turtle.points.map((p) => sanitizePoint(p)).filter((p): p is TrackPoint => p !== null)
  return { ...track, closed: false, points: [...track.points, ...added] }
}

// ── The curve ─────────────────────────────────────────────────────────────────────────

export interface TrackSamples {
  count: number
  /** Distance between samples, m (the length divided into a whole number of steps). */
  spacing: number
  length: number
  closed: boolean
  x: Float64Array
  y: Float64Array
  z: Float64Array
  /** Unit tangent in plan. */
  tx: Float64Array
  tz: Float64Array
  /** Half the road width, m. */
  half: Float32Array
  /** Curvature in plan, 1/m: positive turns right. */
  curv: Float32Array
  /** Climb per metre driven. */
  slope: Float32Array
  kerb: Uint8Array
  gravel: Uint8Array
  /** Distance from the centre line to the barrier on each side, m. */
  left: Float32Array
  right: Float32Array
  /** Index in the (rotated) control point list that each sample is nearest. */
  control: Uint16Array
}

function cr(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number,
): number {
  const a1 = ((t1 - t) * p0 + (t - t0) * p1) / (t1 - t0)
  const a2 = ((t2 - t) * p1 + (t - t1) * p2) / (t2 - t1)
  const a3 = ((t3 - t) * p2 + (t - t2) * p3) / (t3 - t2)
  const b1 = ((t2 - t) * a1 + (t - t0) * a2) / (t2 - t0)
  const b2 = ((t3 - t) * a2 + (t - t1) * a3) / (t3 - t1)
  return ((t2 - t) * b1 + (t - t1) * b2) / (t2 - t1)
}

const knot = (a: TrackPoint, b: TrackPoint, t: number) =>
  t + Math.max(Math.sqrt(Math.hypot(b.x - a.x, b.z - a.z)), 1e-3)

const wrapAngle = (angle: number) => {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

/** Starts the list at the start/finish point, so sample 0 is the line. */
function rotated(track: TrackDef): TrackPoint[] {
  const { points } = track
  if (!track.closed || track.start <= 0 || track.start >= points.length) return points
  return [...points.slice(track.start), ...points.slice(0, track.start)]
}

export function sampleTrack(track: TrackDef, spacing: number = TRACK.spacing): TrackSamples | null {
  const points = rotated(track)
  const n = points.length
  if (n < 3) return null
  const closed = track.closed
  const segments = closed ? n : n - 1

  // Dense polyline along the curve.
  const dx: number[] = []
  const dz: number[] = []
  const dy: number[] = []
  const dw: number[] = []
  const dk: number[] = []
  const dg: number[] = []
  const dc: number[] = []
  for (let i = 0; i < segments; i++) {
    const p0 = points[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)]
    const p1 = points[i]
    const p2 = points[closed ? (i + 1) % n : i + 1]
    const p3 = points[closed ? (i + 2) % n : Math.min(i + 2, n - 1)]
    const t0 = 0
    const t1 = knot(p0, p1, t0)
    const t2 = knot(p1, p2, t1)
    const t3 = knot(p2, p3, t2)
    const chord = Math.hypot(p2.x - p1.x, p2.z - p1.z)
    const steps = Math.max(8, Math.ceil(chord / 1.2))
    const last = !closed && i === segments - 1
    const upto = last ? steps : steps - 1
    for (let s = 0; s <= upto; s++) {
      const u = s / steps
      const t = t1 + (t2 - t1) * u
      dx.push(cr(p0.x, p1.x, p2.x, p3.x, t0, t1, t2, t3, t))
      dz.push(cr(p0.z, p1.z, p2.z, p3.z, t0, t1, t2, t3, t))
      dy.push(cr(p0.y, p1.y, p2.y, p3.y, t0, t1, t2, t3, t))
      const eased = u * u * (3 - 2 * u)
      dw.push(p1.width + (p2.width - p1.width) * eased)
      const near = u < 0.5 ? p1 : p2
      dk.push(near.kerb ? 1 : 0)
      dg.push(near.gravel ? 1 : 0)
      dc.push(u < 0.5 ? i : (i + 1) % n)
    }
  }

  const m = dx.length
  const cumulative = new Float64Array(m + 1)
  for (let i = 1; i <= m; i++) {
    const a = i - 1
    const b = i % m
    cumulative[i] = cumulative[i - 1] + Math.hypot(dx[b] - dx[a], dz[b] - dz[a])
  }
  const length = closed ? cumulative[m] : cumulative[m - 1]
  if (!(length > 1)) return null

  const count = closed ? Math.max(8, Math.round(length / spacing)) : Math.max(8, Math.round(length / spacing) + 1)
  const step = closed ? length / count : length / (count - 1)

  const x = new Float64Array(count)
  const y = new Float64Array(count)
  const z = new Float64Array(count)
  const half = new Float32Array(count)
  const kerb = new Uint8Array(count)
  const gravel = new Uint8Array(count)
  const control = new Uint16Array(count)

  let j = 0
  for (let k = 0; k < count; k++) {
    const target = k * step
    while (j < m - 1 && cumulative[j + 1] < target) j++
    const a = j
    const b = (j + 1) % m
    const span = cumulative[j + 1] - cumulative[j]
    const f = span > 1e-9 ? clamp((target - cumulative[j]) / span, 0, 1) : 0
    x[k] = dx[a] + (dx[b] - dx[a]) * f
    z[k] = dz[a] + (dz[b] - dz[a]) * f
    y[k] = dy[a] + (dy[b] - dy[a]) * f
    half[k] = (dw[a] + (dw[b] - dw[a]) * f) / 2
    kerb[k] = dk[a]
    gravel[k] = dg[a]
    control[k] = dc[a]
  }

  const wrap = (i: number) => (closed ? (i + count) % count : clamp(i, 0, count - 1))
  const tx = new Float64Array(count)
  const tz = new Float64Array(count)
  const heading = new Float64Array(count)
  const slope = new Float32Array(count)
  for (let k = 0; k < count; k++) {
    const a = wrap(k - 1)
    const b = wrap(k + 1)
    let ex = x[b] - x[a]
    let ez = z[b] - z[a]
    const len = Math.hypot(ex, ez) || 1
    ex /= len
    ez /= len
    tx[k] = ex
    tz[k] = ez
    heading[k] = Math.atan2(ez, ex)
    slope[k] = (y[b] - y[a]) / len
  }

  const rawCurv = new Float32Array(count)
  for (let k = 0; k < count; k++) {
    const a = wrap(k - 1)
    const b = wrap(k + 1)
    const reach = (a === k || b === k ? 1 : 2) * step
    rawCurv[k] = wrapAngle(heading[b] - heading[a]) / reach
  }
  const curv = smooth(rawCurv, 3, closed)

  // The barrier: a standard distance from the road's edge, brought in on the inside of a tight corner.
  const rawLeft = new Float32Array(count)
  const rawRight = new Float32Array(count)
  for (let k = 0; k < count; k++) {
    const wanted = half[k] + (gravel[k] ? TRACK.runoffGravel : TRACK.runoffGrass)
    const inner = Math.max(half[k] + 2.2, 0.8 / Math.max(Math.abs(curv[k]), 1e-6))
    rawRight[k] = curv[k] > 0 ? Math.min(wanted, inner) : wanted
    rawLeft[k] = curv[k] < 0 ? Math.min(wanted, inner) : wanted
  }
  const reachSamples = Math.max(1, Math.round(16 / step))
  const left = smooth(rollingMin(rawLeft, reachSamples, closed), Math.max(1, Math.round(10 / step)), closed)
  const right = smooth(rollingMin(rawRight, reachSamples, closed), Math.max(1, Math.round(10 / step)), closed)

  return {
    count,
    spacing: step,
    length,
    closed,
    x,
    y,
    z,
    tx,
    tz,
    half,
    curv,
    slope,
    kerb,
    gravel,
    left,
    right,
    control,
  }
}

function smooth(values: Float32Array, radius: number, closed: boolean): Float32Array {
  const n = values.length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    let used = 0
    for (let k = -radius; k <= radius; k++) {
      const index = closed ? (i + k + n * 4) % n : i + k
      if (index < 0 || index >= n) continue
      sum += values[index]
      used++
    }
    out[i] = sum / Math.max(used, 1)
  }
  return out
}

function rollingMin(values: Float32Array, radius: number, closed: boolean): Float32Array {
  const n = values.length
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let low = Infinity
    for (let k = -radius; k <= radius; k++) {
      const index = closed ? (i + k + n * 4) % n : i + k
      if (index < 0 || index >= n) continue
      if (values[index] < low) low = values[index]
    }
    out[i] = low
  }
  return out
}

// ── Where on the track is a point? ───────────────────────────────────────────────────

export type Surface = 'asphalt' | 'kerb' | 'grass' | 'gravel' | 'wall'

export interface TrackQuery {
  /** The nearest sample. */
  index: number
  /** Distance along the track from the line, m. */
  s: number
  /** Sideways distance from the centre line, m; positive is to the right of the way the track runs. */
  d: number
  /** The way the track runs here, radians (0 is +x, growing towards +z). */
  heading: number
  y: number
  slope: number
  half: number
  surface: Surface
  /** How far from the centre line the barrier stands on the side the point is on. */
  barrier: number
}

export function newQuery(): TrackQuery {
  return { index: 0, s: 0, d: 0, heading: 0, y: 0, slope: 0, half: 6, surface: 'asphalt', barrier: 12 }
}

const WINDOW = 48
const LOST = 70

/**
 * Finds a point's place on the track. With a `hint` (where it was last frame) only a short stretch
 * is searched, which keeps a car that is on a different part of a track that doubles back from
 * jumping onto the wrong one; without it, or if the point has got far from the hint, the whole
 * track is searched. Writes into `out` and returns it: no allocation.
 */
export function queryTrack(track: TrackSamples, px: number, pz: number, hint: number, out: TrackQuery): TrackQuery {
  const { count, closed } = track
  let best = 0
  let bestD = Infinity
  const scan = (from: number, to: number) => {
    for (let k = from; k <= to; k++) {
      const i = closed ? ((k % count) + count) % count : k
      if (i < 0 || i >= count) continue
      const ex = px - track.x[i]
      const ez = pz - track.z[i]
      const d = ex * ex + ez * ez
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
  }
  if (hint >= 0) {
    scan(hint - WINDOW, hint + WINDOW)
    if (bestD > LOST * LOST) {
      bestD = Infinity
      scan(0, count - 1)
    }
  } else scan(0, count - 1)

  // Project onto the two segments touching the nearest sample and take the nearer.
  let from = best
  let toIndex = best
  let bestT = 0
  let bestSq = Infinity
  for (let pass = 0; pass < 2; pass++) {
    const a = pass === 0 ? (closed ? (best - 1 + count) % count : Math.max(best - 1, 0)) : best
    const b = pass === 0 ? best : closed ? (best + 1) % count : Math.min(best + 1, count - 1)
    if (a === b) continue
    const abx = track.x[b] - track.x[a]
    const abz = track.z[b] - track.z[a]
    const lenSq = abx * abx + abz * abz || 1
    const t = clamp(((px - track.x[a]) * abx + (pz - track.z[a]) * abz) / lenSq, 0, 1)
    const cx = track.x[a] + abx * t - px
    const cz = track.z[a] + abz * t - pz
    const sq = cx * cx + cz * cz
    if (sq < bestSq) {
      bestSq = sq
      from = a
      toIndex = b
      bestT = t
    }
  }

  const abx = track.x[toIndex] - track.x[from]
  const abz = track.z[toIndex] - track.z[from]
  const len = Math.hypot(abx, abz) || 1
  const ux = abx / len
  const uz = abz / len
  const cx = track.x[from] + abx * bestT
  const cz = track.z[from] + abz * bestT
  // Right of the direction of travel, with z down the screen: (-uz, ux).
  const d = (px - cx) * -uz + (pz - cz) * ux

  const nearest = bestT < 0.5 ? from : toIndex
  out.index = nearest
  out.s = ((((from + bestT) * track.spacing) % track.length) + track.length) % track.length
  out.d = d
  out.heading = Math.atan2(uz, ux)
  out.y = track.y[from] + (track.y[toIndex] - track.y[from]) * bestT
  out.slope = track.slope[nearest]
  out.half = track.half[nearest]
  const side = d > 0 ? track.right[nearest] : track.left[nearest]
  out.barrier = side
  const away = Math.abs(d)
  if (away <= out.half) out.surface = 'asphalt'
  else if (track.kerb[nearest] && away <= out.half + TRACK.kerbWidth) out.surface = 'kerb'
  else if (away < side) out.surface = track.gravel[nearest] ? 'gravel' : 'grass'
  else out.surface = 'wall'
  return out
}

/** Position and heading of the first grid slot, a little behind the line. */
export function gridSlot(track: TrackSamples, metresBehind = 6): { x: number; z: number; y: number; heading: number } {
  const back = Math.round(metresBehind / track.spacing)
  const i = track.closed ? (track.count - back) % track.count : 0
  const j = (i + 1) % track.count
  return {
    x: track.x[i],
    z: track.z[i],
    y: track.y[i],
    heading: Math.atan2(track.z[j] - track.z[i], track.x[j] - track.x[i]),
  }
}

// ── Is it a track a car can lap? ───────────────────────────────────────────────────────

export type IssueId =
  | 'few-points'
  | 'not-closed'
  | 'too-short'
  | 'too-long'
  | 'bad-connection'
  | 'narrow'
  | 'self-intersection'
  | 'sharp-corner'
  | 'tight-corner'
  | 'steep'
  | 'start-in-corner'
  | 'parallel-close'

export interface TrackIssue {
  id: IssueId
  severity: 'error' | 'warning'
  /** Where, in plan view, so the editor can mark it. */
  at?: { x: number; z: number }
  /** A number for the message (a radius, a distance, a percentage). */
  value?: number
}

export interface TrackReport {
  issues: TrackIssue[]
  /** No errors: the track can be driven. Warnings do not stop it. */
  drivable: boolean
  length: number
  /** The smallest corner radius, m. */
  minRadius: number
  samples: TrackSamples | null
}

export function validateTrack(track: TrackDef, spacing: number = TRACK.spacing): TrackReport {
  const issues: TrackIssue[] = []
  const { points } = track
  const error = (id: IssueId, at?: { x: number; z: number }, value?: number) =>
    issues.push({ id, severity: 'error', at, value })
  const warn = (id: IssueId, at?: { x: number; z: number }, value?: number) =>
    issues.push({ id, severity: 'warning', at, value })

  if (points.length < TRACK.minPoints) error('few-points', undefined, TRACK.minPoints)
  if (!track.closed) error('not-closed')

  // Connections: neighbours too close make a kink, too far apart make the curve wander.
  const links = track.closed ? points.length : points.length - 1
  for (let i = 0; i < links; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const gap = Math.hypot(b.x - a.x, b.z - a.z)
    if (gap < TRACK.minSegment || gap > TRACK.maxSegment) {
      error('bad-connection', { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, gap)
      break
    }
  }

  const narrowest = points.reduce((low, p) => (p.width < low.width ? p : low), points[0] ?? { width: 12, x: 0, z: 0 })
  if (points.length > 0 && narrowest.width < TRACK.drivableWidth)
    error('narrow', { x: narrowest.x, z: narrowest.z }, narrowest.width)

  const blocking = issues.some((issue) => issue.id === 'few-points' || issue.id === 'bad-connection')
  const samples = blocking ? null : sampleTrack(track, spacing)
  if (!samples) {
    return { issues, drivable: false, length: 0, minRadius: Infinity, samples: null }
  }

  if (samples.length < TRACK.minLength) error('too-short', undefined, samples.length)
  if (samples.length > TRACK.maxLength) error('too-long', undefined, samples.length)

  // Corners.
  let maxCurv = 0
  let maxAt = 0
  for (let i = 0; i < samples.count; i++) {
    const c = Math.abs(samples.curv[i])
    if (c > maxCurv) {
      maxCurv = c
      maxAt = i
    }
  }
  const minRadius = maxCurv > 1e-6 ? 1 / maxCurv : Infinity
  const cornerAt = { x: samples.x[maxAt], z: samples.z[maxAt] }
  const floor = Math.max(TRACK.minRadius, samples.half[maxAt] + 3.5)
  if (minRadius < floor) error('sharp-corner', cornerAt, minRadius)
  else if (minRadius < TRACK.tightRadius) warn('tight-corner', cornerAt, minRadius)

  // Climb.
  let steepest = 0
  let steepAt = 0
  for (let i = 0; i < samples.count; i++) {
    const g = Math.abs(samples.slope[i])
    if (g > steepest) {
      steepest = g
      steepAt = i
    }
  }
  const steepPoint = { x: samples.x[steepAt], z: samples.z[steepAt] }
  if (steepest > TRACK.maxGrade) error('steep', steepPoint, steepest * 100)
  else if (steepest > TRACK.warnGrade) warn('steep', steepPoint, steepest * 100)

  // The start line wants a straight.
  if (samples.closed) {
    const reach = Math.round(40 / samples.spacing)
    let worst = 0
    for (let k = -reach; k <= reach; k++)
      worst = Math.max(worst, Math.abs(samples.curv[(k + samples.count) % samples.count]))
    if (worst > 1 / 90) warn('start-in-corner', { x: samples.x[0], z: samples.z[0] }, worst > 0 ? 1 / worst : 0)
  }

  // Two parts of the road that touch or cross.
  const stride = Math.max(1, Math.round(5 / samples.spacing))
  let crossing: { x: number; z: number } | null = null
  let close: { x: number; z: number; gap: number } | null = null
  for (let i = 0; i < samples.count && !crossing; i += stride) {
    for (let j = i + stride; j < samples.count; j += stride) {
      let apart = j - i
      if (samples.closed) apart = Math.min(apart, samples.count - apart)
      const along = apart * samples.spacing
      const need = samples.half[i] + samples.half[j]
      if (along < need * 2 + 14) continue
      const gap = Math.hypot(samples.x[i] - samples.x[j], samples.z[i] - samples.z[j])
      if (gap < need + 1) {
        crossing = { x: (samples.x[i] + samples.x[j]) / 2, z: (samples.z[i] + samples.z[j]) / 2 }
        break
      }
      if (gap < need + 12 && (!close || gap < close.gap))
        close = { x: (samples.x[i] + samples.x[j]) / 2, z: (samples.z[i] + samples.z[j]) / 2, gap }
    }
  }
  if (crossing) error('self-intersection', crossing)
  else if (close) warn('parallel-close', close, close.gap)

  return {
    issues,
    drivable: !issues.some((issue) => issue.severity === 'error'),
    length: samples.length,
    minRadius,
    samples,
  }
}

// ── The default circuit ────────────────────────────────────────────────────────────────

/**
 * The Lab Circuit: a long main straight into a hairpin, a climb through two sweepers, a fast
 * return and a final left onto the straight. Built from straights and arcs whose lengths close
 * the loop exactly, then given its elevation, kerbs and a gravel trap.
 */
export function defaultTrack(): TrackDef {
  const t = new Turtle(-180, 0, 0, 0, 13).begin()
  t.straight(620)
  t.arc(28, 180, 'left', 0, { kerb: true })
  t.points[t.points.length - 1].gravel = true
  t.points[t.points.length - 2].gravel = true
  t.straight(200, 3)
  t.arc(60, 90, 'right', 2, { kerb: true })
  t.straight(130, 3)
  t.arc(70, 90, 'left', 0, { kerb: true })
  t.straight(310, -4)
  t.arc(60, 90, 'left', -2, { kerb: true })
  t.straight(176, -2)
  t.arc(80, 90, 'left', 0, { kerb: true })
  // The loop closes where it began: the last point is the first one again. The line is a little
  // way down the straight, so there is road behind the grid.
  const points = t.points
    .slice(0, -1)
    .map((p) => sanitizePoint(p))
    .filter((p): p is TrackPoint => p !== null)
  return { version: 1, name: 'Lab Circuit', closed: true, start: 3, points }
}

export function emptyTrack(): TrackDef {
  return { version: 1, name: 'My circuit', closed: false, start: 0, points: [] }
}
