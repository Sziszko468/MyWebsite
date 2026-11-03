/** The server's clock, so tests can move time instead of waiting for it. */
export interface Clock {
  now(): Date
}

export const systemClock: Clock = { now: () => new Date() }

/** Timestamps are stored and returned as UTC ISO-8601 text: sortable, readable and free of time-zone surprises. */
export const iso = (date: Date): string => date.toISOString()

export const addMs = (date: Date, ms: number): Date => new Date(date.getTime() + ms)
export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000
