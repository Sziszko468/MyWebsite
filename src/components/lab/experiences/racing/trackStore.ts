import { createStore } from '../../experience/store'
import { loadJson, saveJson } from '../../experience/persist'
import { defaultTrack, parseTrack, serializeTrack, type TrackDef } from './trackModel'

/**
 * The track the Racing Experience drives. The Track Architect puts its track here ("drive it"),
 * and it survives a reload; with nothing saved, or something unreadable, the Lab Circuit is used.
 * Only this browser ever sees it.
 */
export type TrackSource = 'lab' | 'architect'

export interface ActiveTrack {
  track: TrackDef
  source: TrackSource
}

const KEY = 'lab:track:active'

function initial(): ActiveTrack {
  const saved = loadJson<ActiveTrack>(KEY, (raw) => {
    if (typeof raw !== 'object' || raw === null) return null
    const track = parseTrack((raw as Record<string, unknown>).track)
    return track ? { track, source: 'architect' } : null
  })
  return saved ?? { track: defaultTrack(), source: 'lab' }
}

export const activeTrack = createStore<ActiveTrack>(initial())

export function setActiveTrack(track: TrackDef): void {
  const value: ActiveTrack = { track: serializeTrack(track), source: 'architect' }
  activeTrack.set(value)
  saveJson(KEY, value)
}

export function resetActiveTrack(): void {
  activeTrack.set({ track: defaultTrack(), source: 'lab' })
  saveJson(KEY, { track: defaultTrack(), source: 'lab' })
}

// ── Personal bests ─────────────────────────────────────────────────────────────────────

const BEST_KEY = 'lab:racing:best'
const MAX_BESTS = 40

type Bests = Record<string, number>

function readBests(): Bests {
  return (
    loadJson<Bests>(BEST_KEY, (raw) => {
      if (typeof raw !== 'object' || raw === null) return null
      const result: Bests = {}
      for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_BESTS)) {
        if (
          /^[\w:-]{1,40}$/.test(key) &&
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value > 5 &&
          value < 3600
        )
          result[key] = value
      }
      return result
    }) ?? {}
  )
}

/** The best clean lap driven in this browser on this track with this setup. */
export function readBest(key: string): number | null {
  return readBests()[key] ?? null
}

export function saveBest(key: string, time: number): void {
  const bests = readBests()
  if (bests[key] !== undefined && bests[key] <= time) return
  delete bests[key]
  bests[key] = time
  const keys = Object.keys(bests)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_BESTS))) delete bests[old]
  saveJson(BEST_KEY, bests)
}

// ── Drift Challenge bests ───────────────────────────────────────────────────────────────

const DRIFT_KEY = 'lab:racing:drift'

function readDrifts(): Record<string, number> {
  return (
    loadJson<Record<string, number>>(DRIFT_KEY, (raw) => {
      if (typeof raw !== 'object' || raw === null) return null
      const result: Record<string, number> = {}
      for (const [key, value] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_BESTS)) {
        if (
          /^[\w:-]{1,40}$/.test(key) &&
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= 0 &&
          value < 1e7
        )
          result[key] = value
      }
      return result
    }) ?? {}
  )
}

/** The best Drift Challenge score in this browser on this track. */
export function readDriftBest(key: string): number {
  return readDrifts()[key] ?? 0
}

export function saveDriftBest(key: string, score: number): void {
  const all = readDrifts()
  if ((all[key] ?? 0) >= score) return
  delete all[key]
  all[key] = Math.round(score)
  const keys = Object.keys(all)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_BESTS))) delete all[old]
  saveJson(DRIFT_KEY, all)
}
