import { createStore } from '../../experience/store'
import { loadJson, saveJson } from '../../experience/persist'
import { defaultTrack, parseTrack, serializeTrack, type TrackDef } from './trackModel'

/**
 * The Track Architect's document and its undo history. A drag changes the track many times a
 * second (`transient`) and costs one history step (`checkpoint` at its start); everything else is
 * one `commit`. The working track is kept in this browser as it changes, and named copies are
 * kept in a handful of save slots. Nothing leaves the browser unless the visitor downloads it.
 */
export type ArchitectTool = 'select' | 'add'

export interface ArchitectState {
  track: TrackDef
  /** Index of the selected control point, or -1. */
  selected: number
  past: TrackDef[]
  future: TrackDef[]
  tool: ArchitectTool
  snap: boolean
  message: string
  /** The Roulette draw the visitor is on. */
  draw: number
}

export interface Slot {
  id: string
  name: string
  savedAt: number
  track: TrackDef
}

const CURRENT = 'lab:architect:current'
const SLOTS = 'lab:architect:slots'
const MAX_HISTORY = 80
export const MAX_SLOTS = 8

function loadCurrent(): TrackDef {
  return loadJson(CURRENT, parseTrack) ?? defaultTrack()
}

export const architect = createStore<ArchitectState>({
  track: loadCurrent(),
  selected: -1,
  past: [],
  future: [],
  tool: 'select',
  snap: true,
  message: '',
  draw: 1,
})

let timer = 0
function persist(track: TrackDef): void {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => saveJson(CURRENT, serializeTrack(track)), 400)
}

/** One undoable change. */
export function commit(track: TrackDef, selected?: number): void {
  architect.set((s) => {
    persist(track)
    return { ...s, track, selected: selected ?? s.selected, past: [...s.past, s.track].slice(-MAX_HISTORY), future: [] }
  })
}

/** Remembers the track before a drag begins; the drag itself is `transient`. */
export function checkpoint(): void {
  architect.set((s) => ({ ...s, past: [...s.past, s.track].slice(-MAX_HISTORY), future: [] }))
}

export function transient(track: TrackDef): void {
  architect.set((s) => {
    persist(track)
    return { ...s, track }
  })
}

export function undo(): void {
  architect.set((s) => {
    const previous = s.past[s.past.length - 1]
    if (!previous) return s
    persist(previous)
    return {
      ...s,
      track: previous,
      past: s.past.slice(0, -1),
      future: [s.track, ...s.future],
      selected: Math.min(s.selected, previous.points.length - 1),
    }
  })
}

export function redo(): void {
  architect.set((s) => {
    const next = s.future[0]
    if (!next) return s
    persist(next)
    return {
      ...s,
      track: next,
      past: [...s.past, s.track],
      future: s.future.slice(1),
      selected: Math.min(s.selected, next.points.length - 1),
    }
  })
}

export function select(index: number): void {
  architect.set((s) => (s.selected === index ? s : { ...s, selected: index }))
}

export function patchUi(patch: Partial<Pick<ArchitectState, 'tool' | 'snap' | 'message' | 'draw'>>): void {
  architect.set((s) => ({ ...s, ...patch }))
}

export function setMessage(message: string): void {
  patchUi({ message })
}

/** Starts again from another track (a new one, a slot, a file): history is cleared. */
export function replace(track: TrackDef, message = ''): void {
  persist(track)
  architect.set((s) => ({ ...s, track, selected: -1, past: [], future: [], message }))
}

// ── Save slots ─────────────────────────────────────────────────────────────────────────

export function readSlots(): Slot[] {
  return (
    loadJson<Slot[]>(SLOTS, (raw) => {
      if (!Array.isArray(raw)) return null
      const slots: Slot[] = []
      for (const item of raw.slice(0, MAX_SLOTS)) {
        if (typeof item !== 'object' || item === null) continue
        const record = item as Record<string, unknown>
        const track = parseTrack(record.track)
        if (!track || typeof record.id !== 'string' || !/^[\w-]{1,40}$/.test(record.id)) continue
        slots.push({
          id: record.id,
          name: track.name,
          savedAt: typeof record.savedAt === 'number' ? record.savedAt : 0,
          track,
        })
      }
      return slots
    }) ?? []
  )
}

export type SlotResult = { ok: true; slots: Slot[] } | { ok: false; reason: 'full' | 'blocked' | 'too-large' }

export function saveSlot(track: TrackDef): SlotResult {
  const slots = readSlots()
  const existing = slots.findIndex((slot) => slot.name === track.name)
  if (existing < 0 && slots.length >= MAX_SLOTS) return { ok: false, reason: 'full' }
  const slot: Slot = {
    id: existing >= 0 ? slots[existing].id : `s${Date.now().toString(36)}`,
    name: track.name,
    savedAt: Date.now(),
    track: serializeTrack(track),
  }
  const next = existing >= 0 ? slots.map((s, i) => (i === existing ? slot : s)) : [...slots, slot]
  const result = saveJson(SLOTS, next)
  return result.ok ? { ok: true, slots: next } : { ok: false, reason: result.reason }
}

export function deleteSlot(id: string): Slot[] {
  const next = readSlots().filter((slot) => slot.id !== id)
  saveJson(SLOTS, next)
  return next
}
