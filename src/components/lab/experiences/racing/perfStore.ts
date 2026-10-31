import { createStore } from '../../experience/store'
import { loadJson, saveJson } from '../../experience/persist'
import { DEFAULT_SETUP, sanitizeSetup, type CarSetup, type SetupKey } from './carSetup'

/**
 * The Performance Lab's document: two setups, A and B, and which one the sliders edit. They
 * are kept in this browser as they change. Named setups are kept in a few save slots; a setup
 * is sent to the Racing Experience with `setActiveSetup` (carSetup.ts), not from here.
 */
export type Which = 'a' | 'b'

export interface PerfState {
  a: CarSetup
  b: CarSetup
  edit: Which
  message: string
}

export interface SetupSlot {
  id: string
  name: string
  savedAt: number
  setup: CarSetup
}

const KEY = 'lab:perf:ab'
const SLOTS = 'lab:perf:slots'
export const MAX_SETUP_SLOTS = 8

function initial(): PerfState {
  const saved = loadJson<{ a: CarSetup; b: CarSetup }>(KEY, (raw) => {
    if (typeof raw !== 'object' || raw === null) return null
    const record = raw as Record<string, unknown>
    return { a: sanitizeSetup(record.a), b: sanitizeSetup(record.b) }
  })
  return { a: saved?.a ?? { ...DEFAULT_SETUP }, b: saved?.b ?? { ...DEFAULT_SETUP }, edit: 'a', message: '' }
}

export const perf = createStore<PerfState>(initial())

let timer = 0
function persist(state: PerfState): void {
  window.clearTimeout(timer)
  timer = window.setTimeout(() => saveJson(KEY, { a: state.a, b: state.b }), 300)
}

export function setParam(key: SetupKey, value: number): void {
  perf.set((s) => {
    const next = { ...s, [s.edit]: sanitizeSetup({ ...s[s.edit], [key]: value }) }
    persist(next)
    return next
  })
}

export function setEdit(edit: Which): void {
  perf.set((s) => (s.edit === edit ? s : { ...s, edit }))
}

export function setMessage(message: string): void {
  perf.set((s) => ({ ...s, message }))
}

/** Replaces the setup being edited (a loaded slot, a file). */
export function replaceCurrent(setup: CarSetup, message = ''): void {
  perf.set((s) => {
    const next = { ...s, [s.edit]: sanitizeSetup(setup), message }
    persist(next)
    return next
  })
}

/** A copy of one setup into the other, to start a variation from it. */
export function copySetup(from: Which): void {
  perf.set((s) => {
    const to: Which = from === 'a' ? 'b' : 'a'
    const next = { ...s, [to]: { ...s[from] } }
    persist(next)
    return next
  })
}

export function resetCurrent(): void {
  replaceCurrent({ ...DEFAULT_SETUP })
}

// ── Save slots ─────────────────────────────────────────────────────────────────────────

export function readSetupSlots(): SetupSlot[] {
  return (
    loadJson<SetupSlot[]>(SLOTS, (raw) => {
      if (!Array.isArray(raw)) return null
      const slots: SetupSlot[] = []
      for (const item of raw.slice(0, MAX_SETUP_SLOTS)) {
        if (typeof item !== 'object' || item === null) continue
        const record = item as Record<string, unknown>
        if (typeof record.id !== 'string' || !/^[\w-]{1,40}$/.test(record.id) || typeof record.name !== 'string')
          continue
        slots.push({
          id: record.id,
          name: record.name.replace(/[<>"'`&\\]/g, '').slice(0, 40) || 'Setup',
          savedAt: typeof record.savedAt === 'number' ? record.savedAt : 0,
          setup: sanitizeSetup(record.setup),
        })
      }
      return slots
    }) ?? []
  )
}

export type SlotResult = { ok: true; slots: SetupSlot[] } | { ok: false; reason: 'full' | 'blocked' | 'too-large' }

export function saveSetupSlot(name: string, setup: CarSetup): SlotResult {
  const slots = readSetupSlots()
  const clean =
    name
      .replace(/[<>"'`&\\]/g, '')
      .trim()
      .slice(0, 40) || 'Setup'
  const existing = slots.findIndex((slot) => slot.name === clean)
  if (existing < 0 && slots.length >= MAX_SETUP_SLOTS) return { ok: false, reason: 'full' }
  const slot: SetupSlot = {
    id: existing >= 0 ? slots[existing].id : `p${Date.now().toString(36)}`,
    name: clean,
    savedAt: Date.now(),
    setup: { ...setup },
  }
  const next = existing >= 0 ? slots.map((s, i) => (i === existing ? slot : s)) : [...slots, slot]
  const result = saveJson(SLOTS, next)
  return result.ok ? { ok: true, slots: next } : { ok: false, reason: result.reason }
}

export function deleteSetupSlot(id: string): SetupSlot[] {
  const next = readSetupSlots().filter((slot) => slot.id !== id)
  saveJson(SLOTS, next)
  return next
}
