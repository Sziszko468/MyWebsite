import { seeded } from './trackMesh'
import {
  TRACK,
  cleanTrackName,
  defaultTrack,
  sanitizePoint,
  validateTrack,
  type TrackDef,
  type TrackPoint,
  type TrackReport,
  type TrackSamples,
} from './trackModel'

/**
 * Everything the Track Architect can do to a track, as pure functions from a track to a new
 * track: moving, adding and removing points, setting their properties, closing the loop. The
 * editor keeps the history; these only compute. A track from here is the same `TrackDef` the
 * Racing Experience drives, so there is no second format to convert.
 */

export const GRID = 5

const withPoints = (track: TrackDef, points: TrackPoint[], start = track.start): TrackDef => ({
  ...track,
  points,
  start: points.length === 0 ? 0 : Math.min(Math.max(0, start), points.length - 1),
})

const clean = (point: TrackPoint): TrackPoint => sanitizePoint(point) ?? point

export function movePoint(track: TrackDef, index: number, x: number, z: number): TrackDef {
  if (!track.points[index]) return track
  const points = track.points.map((p, i) => (i === index ? clean({ ...p, x, z }) : p))
  return withPoints(track, points)
}

/** Adds a point at the end of the track, in the width and height of the one before. */
export function addPoint(track: TrackDef, x: number, z: number): TrackDef {
  if (track.points.length >= TRACK.maxPoints) return track
  const last = track.points[track.points.length - 1]
  const point = clean({ x, z, y: last?.y ?? 0, width: last?.width ?? 12, kerb: false, gravel: false })
  return withPoints({ ...track, closed: false }, [...track.points, point])
}

/** Adds a point after `index`, between it and the next, in the width and height between them. */
export function insertPoint(track: TrackDef, index: number, x: number, z: number): TrackDef {
  if (track.points.length >= TRACK.maxPoints) return track
  const a = track.points[index]
  const b = track.points[(index + 1) % track.points.length] ?? a
  if (!a) return addPoint(track, x, z)
  const point = clean({
    x,
    z,
    y: (a.y + b.y) / 2,
    width: (a.width + b.width) / 2,
    kerb: a.kerb && b.kerb,
    gravel: a.gravel && b.gravel,
  })
  const points = [...track.points.slice(0, index + 1), point, ...track.points.slice(index + 1)]
  return withPoints(track, points, track.start > index ? track.start + 1 : track.start)
}

export function removePoint(track: TrackDef, index: number): TrackDef {
  if (!track.points[index]) return track
  const points = track.points.filter((_, i) => i !== index)
  const start = track.start === index ? 0 : track.start > index ? track.start - 1 : track.start
  return withPoints(track, points, start)
}

export type PointPatch = Partial<Pick<TrackPoint, 'width' | 'y' | 'kerb' | 'gravel'>>

export function patchPoint(track: TrackDef, index: number, patch: PointPatch): TrackDef {
  if (!track.points[index]) return track
  return withPoints(
    track,
    track.points.map((p, i) => (i === index ? clean({ ...p, ...patch }) : p)),
  )
}

/** One width for the whole road. */
export function setAllWidths(track: TrackDef, width: number): TrackDef {
  return withPoints(
    track,
    track.points.map((p) => clean({ ...p, width })),
  )
}

export function setClosed(track: TrackDef, closed: boolean): TrackDef {
  return track.closed === closed ? track : { ...track, closed }
}

export function setStart(track: TrackDef, index: number): TrackDef {
  return track.points[index] ? { ...track, start: index } : track
}

export function renameTrack(track: TrackDef, name: string): TrackDef {
  return { ...track, name: cleanTrackName(name, track.name) }
}

/** The same road driven the other way. */
export function reverseTrack(track: TrackDef): TrackDef {
  const n = track.points.length
  if (n === 0) return track
  return { ...track, points: [...track.points].reverse(), start: n - 1 - track.start }
}

/** The segment closest to a point of the plan: where a click on the line would insert a point. */
export function nearestSegment(track: TrackDef, x: number, z: number): { index: number; distance: number } | null {
  const { points } = track
  const links = track.closed ? points.length : points.length - 1
  let best: { index: number; distance: number } | null = null
  for (let i = 0; i < links; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    const abx = b.x - a.x
    const abz = b.z - a.z
    const lenSq = abx * abx + abz * abz || 1
    const t = Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.z) * abz) / lenSq))
    const distance = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t))
    if (!best || distance < best.distance) best = { index: i, distance }
  }
  return best
}

export function snap(value: number, on: boolean): number {
  return on ? Math.round(value / GRID) * GRID : value
}

// ── What the track is like ───────────────────────────────────────────────────────────

export interface TrackStats {
  length: number
  /** Corners tighter than 90 m radius, counted as separate bends. */
  corners: number
  /** Of those, the ones tighter than 32 m. */
  hairpins: number
  /** Longest nearly straight stretch, m. */
  straight: number
  /** Highest minus lowest point of the road, m. */
  elevation: number
  /** The tightest corner's radius, m. */
  radius: number
}

export function trackStats(samples: TrackSamples): TrackStats {
  let corners = 0
  let hairpins = 0
  let inCorner = false
  let tightest = Infinity
  let runTightest = Infinity
  let straight = 0
  let run = 0
  let low = Infinity
  let high = -Infinity
  for (let i = 0; i < samples.count; i++) {
    const c = Math.abs(samples.curv[i])
    if (c > 1 / 90) {
      if (!inCorner) {
        inCorner = true
        runTightest = Infinity
      }
      runTightest = Math.min(runTightest, 1 / c)
    } else if (inCorner) {
      inCorner = false
      corners++
      if (runTightest < 32) hairpins++
    }
    tightest = Math.min(tightest, c > 1e-6 ? 1 / c : Infinity)
    if (c < 1 / 400) run += samples.spacing
    else {
      straight = Math.max(straight, run)
      run = 0
    }
    low = Math.min(low, samples.y[i])
    high = Math.max(high, samples.y[i])
  }
  if (inCorner) {
    corners++
    if (runTightest < 32) hairpins++
  }
  return {
    length: samples.length,
    corners,
    hairpins,
    straight: Math.max(straight, run),
    elevation: high - low,
    radius: tightest,
  }
}

// ── Track Roulette ─────────────────────────────────────────────────────────────────────

/**
 * A random track that can be driven. It is a closed curve whose radius around a centre varies
 * smoothly with the angle (so it cannot cross itself), stretched and bumped by a few harmonics,
 * with gentle hills. Each draw is checked by the same validation the editor uses and redrawn,
 * with less variation, until it passes; the same number always gives the same track.
 */
export function rouletteTrack(seed: number): TrackDef {
  for (let attempt = 0; attempt < 40; attempt++) {
    const random = seeded(`roulette:${seed}:${attempt}`)
    const amplitude = Math.max(0.05, 0.62 - attempt * 0.014)
    const count = 38 + Math.floor(random() * 14)
    const base = 300 + random() * 150
    const stretch = 1 + random() * 0.7
    const harmonics = [2, 3, 4, 5].map((k) => ({
      k,
      a: (random() * amplitude) / Math.pow(k, 0.7),
      phase: random() * Math.PI * 2,
    }))
    const hills = [1, 2].map((k) => ({ k, a: random() * 4, phase: random() * Math.PI * 2 }))
    const width = 12 + Math.floor(random() * 4)
    const points: TrackPoint[] = []
    for (let i = 0; i < count; i++) {
      const theta = (i / count) * Math.PI * 2
      let r = 1
      for (const h of harmonics) r += h.a * Math.cos(h.k * theta + h.phase)
      let y = 0
      for (const h of hills) y += h.a * Math.cos(h.k * theta + h.phase)
      points.push(
        clean({
          x: base * r * Math.cos(theta) * stretch,
          z: base * r * Math.sin(theta),
          y,
          width,
          kerb: false,
          gravel: false,
        }),
      )
    }
    // The turn at each point decides where there are kerbs and gravel.
    const turn = points.map((p, i) => {
      const a = points[(i - 1 + count) % count]
      const b = points[(i + 1) % count]
      const d1 = Math.atan2(p.z - a.z, p.x - a.x)
      const d2 = Math.atan2(b.z - p.z, b.x - p.x)
      return Math.abs(Math.atan2(Math.sin(d2 - d1), Math.cos(d2 - d1)))
    })
    points.forEach((p, i) => {
      p.kerb = turn[i] > 0.28
      p.gravel = turn[i] > 0.45 && (i + seed) % 2 === 0
    })
    let start = 0
    let calm = Infinity
    for (let i = 0; i < count; i++) {
      const spread = turn[(i - 1 + count) % count] + turn[i] + turn[(i + 1) % count]
      if (spread < calm) {
        calm = spread
        start = i
      }
    }
    const track: TrackDef = { version: 1, name: `Roulette ${seed}`, closed: true, start, points }
    const report = validateTrack(track)
    if (
      report.drivable &&
      report.minRadius >= 26 &&
      report.length >= 1500 &&
      report.length <= 4500 &&
      report.issues.length === 0
    )
      return track
  }
  return { ...defaultTrack(), name: `Roulette ${seed}` }
}

// ── Track Challenge ────────────────────────────────────────────────────────────────────

export type Metric = keyof TrackStats

export interface Rule {
  metric: Metric
  /** `min`: the track must have at least this much; `max`: at most. */
  kind: 'min' | 'max'
  value: number
}

export interface TrackChallenge {
  id: string
  rules: readonly Rule[]
}

/** Each is a brief: build a track, within these limits, that passes validation. */
export const TRACK_CHALLENGES: readonly TrackChallenge[] = [
  {
    id: 'technical',
    rules: [
      { metric: 'length', kind: 'min', value: 1800 },
      { metric: 'length', kind: 'max', value: 3000 },
      { metric: 'corners', kind: 'min', value: 6 },
      { metric: 'hairpins', kind: 'min', value: 1 },
    ],
  },
  {
    id: 'flowing',
    rules: [
      { metric: 'length', kind: 'min', value: 2200 },
      { metric: 'straight', kind: 'min', value: 450 },
      { metric: 'radius', kind: 'min', value: 30 },
    ],
  },
  {
    id: 'hills',
    rules: [
      { metric: 'length', kind: 'min', value: 1500 },
      { metric: 'elevation', kind: 'min', value: 8 },
    ],
  },
  {
    id: 'compact',
    rules: [
      { metric: 'length', kind: 'min', value: 800 },
      { metric: 'length', kind: 'max', value: 1600 },
      { metric: 'corners', kind: 'min', value: 5 },
    ],
  },
]

/** The challenge of a day: the same for everyone on the same date, from the calendar alone. */
export function dailyChallenge(date: Date): TrackChallenge {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000)
  return TRACK_CHALLENGES[((day % TRACK_CHALLENGES.length) + TRACK_CHALLENGES.length) % TRACK_CHALLENGES.length]
}

export interface RuleResult {
  rule: Rule
  actual: number
  pass: boolean
}

/** Checks each rule against what the track really is. A track that cannot be driven passes nothing. */
export function evaluateChallenge(
  challenge: TrackChallenge,
  report: TrackReport,
  stats: TrackStats | null,
): { rules: RuleResult[]; complete: boolean } {
  const rules = challenge.rules.map((rule) => {
    const actual = stats ? stats[rule.metric] : 0
    const pass = !!stats && report.drivable && (rule.kind === 'min' ? actual >= rule.value : actual <= rule.value)
    return { rule, actual, pass }
  })
  return { rules, complete: report.drivable && rules.every((r) => r.pass) }
}
