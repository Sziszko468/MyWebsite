import { loadJson, saveJson } from '../../experience/persist'

/**
 * Ghost racing: the best lap, recorded as where the car was twenty times a second, and played back
 * beside the next lap as a see-through car. It is only a recording of the driver's own earlier lap
 * in this browser: it takes no part in the physics, so it can neither be hit nor hit anything, and
 * there is no other player and no server behind it.
 *
 * A ghost is a flat list of samples `x, z, heading, distance` taken `1 / GHOST_RATE` seconds apart,
 * counted from the moment the car crossed the line. The distance along the lap is what makes the
 * live gap possible: how long the ghost took to get as far as you are now.
 */
export const GHOST_RATE = 20
/** The longest lap that is kept, s. */
export const GHOST_MAX_TIME = 300
const FIELDS = 4
const MAX_SAMPLES = GHOST_MAX_TIME * GHOST_RATE
const MAX_GHOSTS = 6

export interface Ghost {
  version: 1
  /** Duration of the recorded lap, s. */
  time: number
  /** x, z, heading, distance for each sample. */
  data: number[]
}

export class GhostRecorder {
  private data: number[] = []
  private best = 0
  private last = 0

  reset(): void {
    this.data = []
    this.best = 0
    this.last = 0
  }

  get length(): number {
    return this.data.length / FIELDS
  }

  /** Offers the car's place `seconds` after the line; keeps it if one is due. */
  add(seconds: number, x: number, z: number, heading: number, distance: number): void {
    const due = Math.floor(seconds * GHOST_RATE)
    if (due < this.length || this.length >= MAX_SAMPLES) {
      this.last = seconds
      return
    }
    // The distance never goes back, so the gap can be found by searching it.
    this.best = Math.max(this.best, distance)
    this.data.push(round(x, 100), round(z, 100), round(heading, 1000), round(this.best, 10))
    this.last = seconds
  }

  /** The lap as a ghost, or null if there is too little (or too much) of it to be worth keeping. */
  finish(time: number): Ghost | null {
    if (this.length < 20 || time > GHOST_MAX_TIME || !Number.isFinite(time)) return null
    return { version: 1, time: round(Math.min(time, this.last || time), 1000), data: [...this.data] }
  }
}

const round = (value: number, scale: number) => Math.round(value * scale) / scale

export interface GhostPlace {
  x: number
  z: number
  heading: number
  distance: number
}

export function newPlace(): GhostPlace {
  return { x: 0, z: 0, heading: 0, distance: 0 }
}

/** Where the ghost was `seconds` after the line, between two samples. False once it has finished. */
export function sampleGhost(ghost: Ghost, seconds: number, out: GhostPlace): boolean {
  const count = ghost.data.length / FIELDS
  if (count < 2 || seconds < 0 || seconds > ghost.time + 0.5) return false
  const position = Math.min(seconds * GHOST_RATE, count - 1)
  const i = Math.min(Math.floor(position), count - 2)
  const f = position - i
  const a = i * FIELDS
  const b = a + FIELDS
  const d = ghost.data
  out.x = d[a] + (d[b] - d[a]) * f
  out.z = d[a + 1] + (d[b + 1] - d[a + 1]) * f
  let turn = d[b + 2] - d[a + 2]
  while (turn > Math.PI) turn -= Math.PI * 2
  while (turn < -Math.PI) turn += Math.PI * 2
  out.heading = d[a + 2] + turn * f
  out.distance = d[a + 3] + (d[b + 3] - d[a + 3]) * f
  return true
}

/** How long after the line the ghost had covered `distance` metres: the other half of the gap. */
export function ghostTimeAt(ghost: Ghost, distance: number): number | null {
  const count = ghost.data.length / FIELDS
  if (count < 2) return null
  const at = (i: number) => ghost.data[i * FIELDS + 3]
  if (distance <= at(0)) return 0
  if (distance >= at(count - 1)) return null
  let low = 0
  let high = count - 1
  while (high - low > 1) {
    const mid = (low + high) >> 1
    if (at(mid) <= distance) low = mid
    else high = mid
  }
  const span = at(high) - at(low)
  const f = span > 1e-9 ? (distance - at(low)) / span : 0
  return (low + f) / GHOST_RATE
}

// ── Storage ────────────────────────────────────────────────────────────────────────────

const KEY = 'lab:racing:ghosts'

export function parseGhost(raw: unknown): Ghost | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  if (record.version !== 1 || !Array.isArray(record.data) || typeof record.time !== 'number') return null
  if (!Number.isFinite(record.time) || record.time <= 0 || record.time > GHOST_MAX_TIME) return null
  if (record.data.length < 8 * 2 || record.data.length > MAX_SAMPLES * FIELDS || record.data.length % FIELDS !== 0)
    return null
  const data: number[] = []
  for (const value of record.data) {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e6) return null
    data.push(value)
  }
  return { version: 1, time: record.time, data }
}

function readAll(): Record<string, Ghost> {
  return (
    loadJson<Record<string, Ghost>>(KEY, (raw) => {
      if (typeof raw !== 'object' || raw === null) return null
      const result: Record<string, Ghost> = {}
      for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_GHOSTS)) {
        const ghost = /^[\w:-]{1,40}$/.test(key) ? parseGhost(value) : null
        if (ghost) result[key] = ghost
      }
      return result
    }) ?? {}
  )
}

export function loadGhost(key: string): Ghost | null {
  return readAll()[key] ?? null
}

/** Keeps the ghost of this track and setup; the oldest ones go when there are more than a few. */
export function saveGhost(key: string, ghost: Ghost): boolean {
  const all = readAll()
  delete all[key]
  all[key] = ghost
  for (const old of Object.keys(all).slice(0, Math.max(0, Object.keys(all).length - MAX_GHOSTS))) delete all[old]
  return saveJson(KEY, all).ok
}
