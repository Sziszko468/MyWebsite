import { createStore } from '../experience/store'
import { loadJson, saveJson } from '../experience/persist'

/**
 * The Lab's light progress: experience points and achievements, earned only by things that
 * actually happened in an experience (a lap driven, a track that passed validation, a comparison
 * made). Every award has a key for the event that earned it, so the same event cannot pay twice,
 * and nothing is given for opening a page. It lives in this browser; there is no account.
 */
export interface Progress {
  version: 1
  xp: number
  /** Event key → when it was earned (ms since 1970). */
  events: Record<string, number>
  /** Achievement id → when. */
  achievements: Record<string, number>
}

export interface AchievementDef {
  id: string
  /** The experience it belongs to, for the list. */
  area: 'studio' | 'racing' | 'architect' | 'performance'
  xp: number
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-model', area: 'studio', xp: 30 },
  { id: 'first-lap', area: 'racing', xp: 40 },
  { id: 'perfect-lap', area: 'racing', xp: 80 },
  { id: 'track-designer', area: 'architect', xp: 60 },
  { id: 'engineer-mind', area: 'performance', xp: 60 },
]

const KEY = 'lab:progress'
const MAX_EVENTS = 400
const MAX_XP = 1_000_000

function parse(raw: unknown): Progress | null {
  if (typeof raw !== 'object' || raw === null) return null
  const record = raw as Record<string, unknown>
  const table = (value: unknown): Record<string, number> => {
    const result: Record<string, number> = {}
    if (typeof value !== 'object' || value === null) return result
    for (const [key, when] of Object.entries(value as Record<string, unknown>).slice(0, MAX_EVENTS)) {
      if (/^[\w:.-]{1,80}$/.test(key) && typeof when === 'number' && Number.isFinite(when)) result[key] = when
    }
    return result
  }
  const xp =
    typeof record.xp === 'number' && Number.isFinite(record.xp)
      ? Math.min(MAX_XP, Math.max(0, Math.floor(record.xp)))
      : 0
  return { version: 1, xp, events: table(record.events), achievements: table(record.achievements) }
}

export const progress = createStore<Progress>(
  loadJson(KEY, parse) ?? { version: 1, xp: 0, events: {}, achievements: {} },
)

export interface AwardResult {
  /** The event had not been counted before. */
  fresh: boolean
  xp: number
  achievement: string | null
}

/**
 * Counts an event once. `key` names it (`lap:clean`, `track:challenge:tech:2026-10-31`); `xp` is what it
 * is worth; `achievement`, if given, is unlocked by it (and pays its own points once).
 */
export function award(key: string, xp: number, achievement?: string, now: number = Date.now()): AwardResult {
  const current = progress.get()
  if (current.events[key] !== undefined) return { fresh: false, xp: 0, achievement: null }
  const events = { ...current.events, [key]: now }
  const keys = Object.keys(events)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_EVENTS))) delete events[old]
  let total = xp
  let unlocked: string | null = null
  const achievements = { ...current.achievements }
  const def = achievement ? ACHIEVEMENTS.find((item) => item.id === achievement) : undefined
  if (def && achievements[def.id] === undefined) {
    achievements[def.id] = now
    total += def.xp
    unlocked = def.id
  }
  const next: Progress = { version: 1, xp: Math.min(MAX_XP, current.xp + total), events, achievements }
  progress.set(next)
  saveJson(KEY, next)
  return { fresh: true, xp: total, achievement: unlocked }
}

/** Forgets everything, on the visitor's request. */
export function resetProgress(): void {
  const empty: Progress = { version: 1, xp: 0, events: {}, achievements: {} }
  progress.set(empty)
  saveJson(KEY, empty)
}

/** A level from the points: each takes a little more than the one before. */
export function levelOf(xp: number): { level: number; into: number; needed: number } {
  let level = 1
  let left = xp
  let needed = 100
  while (left >= needed && level < 99) {
    left -= needed
    level++
    needed = 100 + (level - 1) * 40
  }
  return { level, into: left, needed }
}
