import { createStore } from '../../experience/store'
import { loadJson, saveJson } from '../../experience/persist'

/**
 * The car's setup: eight settings, each with a range that means something. The Performance Lab
 * edits them, the Racing Experience drives with them and the lap simulation estimates with them,
 * so the one record is the whole connection between the three. Every value is a real quantity
 * in real units; `deriveCarParams` (carPhysics.ts) turns it into what the physics uses.
 */
export interface CarSetup {
  /** Downforce coefficient times area (ClA), m². */
  downforce: number
  /** Drag coefficient times area (CdA), m². */
  drag: number
  /** Spring rate, N/mm (the stiffness of the suspension). */
  springs: number
  /** Ride height, mm. */
  rideHeight: number
  /** Brake balance: the share of the braking done at the front axle, %. */
  brakeBias: number
  /** Final drive ratio: higher is shorter gearing (quicker, lower top speed). */
  gearing: number
  /** Tyre grip: the friction coefficient of the tyre on dry asphalt. */
  tyreGrip: number
  /** Mass of the car with the driver, kg. */
  mass: number
}

export type SetupKey = keyof CarSetup

export interface SetupRange {
  min: number
  max: number
  step: number
  digits: number
  unit: string
}

export const SETUP_RANGES: Record<SetupKey, SetupRange> = {
  downforce: { min: 1, max: 5, step: 0.1, digits: 1, unit: 'm²' },
  drag: { min: 0.6, max: 1.2, step: 0.02, digits: 2, unit: 'm²' },
  springs: { min: 40, max: 200, step: 5, digits: 0, unit: 'N/mm' },
  rideHeight: { min: 30, max: 90, step: 1, digits: 0, unit: 'mm' },
  brakeBias: { min: 45, max: 75, step: 0.5, digits: 1, unit: '%' },
  gearing: { min: 3.4, max: 5.6, step: 0.05, digits: 2, unit: ':1' },
  tyreGrip: { min: 1.1, max: 1.9, step: 0.02, digits: 2, unit: 'μ' },
  mass: { min: 680, max: 950, step: 5, digits: 0, unit: 'kg' },
}

export const SETUP_KEYS = Object.keys(SETUP_RANGES) as SetupKey[]

export const DEFAULT_SETUP: Readonly<CarSetup> = {
  downforce: 3,
  drag: 0.9,
  springs: 110,
  rideHeight: 55,
  brakeBias: 58,
  gearing: 4.4,
  tyreGrip: 1.5,
  mass: 780,
}

/** Brings any record inside the ranges: a stored or imported setup may carry anything. */
export function sanitizeSetup(raw: unknown): CarSetup {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const result = { ...DEFAULT_SETUP }
  for (const key of SETUP_KEYS) {
    const value = record[key]
    const { min, max } = SETUP_RANGES[key]
    if (typeof value === 'number' && Number.isFinite(value)) result[key] = Math.min(max, Math.max(min, value))
  }
  return result
}

export function parseSetup(raw: unknown): CarSetup | null {
  return typeof raw === 'object' && raw !== null ? sanitizeSetup(raw) : null
}

export function sameSetup(a: CarSetup, b: CarSetup): boolean {
  return SETUP_KEYS.every((key) => Math.abs(a[key] - b[key]) < 1e-9)
}

/** Where the Racing Experience's setup came from, so it can say so. */
export type SetupSource = 'default' | 'a' | 'b' | 'custom'

export interface ActiveSetup {
  setup: CarSetup
  source: SetupSource
}

const KEY = 'lab:car:active'

/**
 * The setup the Racing Experience drives with. The Performance Lab sets it ("test on the track");
 * it survives a reload, and an unreadable store simply means the default setup.
 */
export const activeSetup = createStore<ActiveSetup>(
  (() => {
    const saved = loadJson<ActiveSetup>(KEY, (raw) => {
      if (typeof raw !== 'object' || raw === null) return null
      const record = raw as Record<string, unknown>
      const source =
        record.source === 'a' || record.source === 'b' || record.source === 'custom' ? record.source : 'default'
      return { setup: sanitizeSetup(record.setup), source }
    })
    return saved ?? { setup: { ...DEFAULT_SETUP }, source: 'default' as const }
  })(),
)

/** A short text that changes whenever any setting does: part of the key of a saved best lap. */
export function setupSignature(setup: CarSetup): string {
  let hash = 2166136261
  for (const key of SETUP_KEYS) {
    hash ^= Math.round(setup[key] * 100)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function setActiveSetup(setup: CarSetup, source: SetupSource): void {
  const value = { setup: sanitizeSetup(setup), source }
  activeSetup.set(value)
  saveJson(KEY, value)
}

export function resetActiveSetup(): void {
  setActiveSetup({ ...DEFAULT_SETUP }, 'default')
}
