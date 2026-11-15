import type { AppContext } from '../../context.ts'
import { loadSettings as loadBookingSettings } from '../bookings/model.ts'
import { getSetting, setSetting } from '../system/settings.ts'
import { DEFAULT_WORK_SETTINGS, WORK_SETTINGS_KEY, type ProjectWorkSettings } from './model.ts'

/** The owner's choices about what the project work e-mails, and the one definition of "today" every date on a project is compared with. */

export function workSettings(app: Pick<AppContext, 'db'>): ProjectWorkSettings {
  const stored = getSetting(app.db, WORK_SETTINGS_KEY)
  if (!stored) return { ...DEFAULT_WORK_SETTINGS }
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>
    const out = { ...DEFAULT_WORK_SETTINGS }
    for (const key of Object.keys(DEFAULT_WORK_SETTINGS) as (keyof ProjectWorkSettings)[]) {
      if (key === 'dueSoonDays') {
        if (typeof parsed.dueSoonDays === 'number' && Number.isInteger(parsed.dueSoonDays) && parsed.dueSoonDays >= 1 && parsed.dueSoonDays <= 30) out.dueSoonDays = parsed.dueSoonDays
      } else if (typeof parsed[key] === 'boolean') {
        out[key] = parsed[key] as boolean
      }
    }
    return out
  } catch {
    return { ...DEFAULT_WORK_SETTINGS }
  }
}

export function saveWorkSettings(app: Pick<AppContext, 'db' | 'clock'>, next: ProjectWorkSettings, userId: string): ProjectWorkSettings {
  setSetting(app.db, app.clock, WORK_SETTINGS_KEY, JSON.stringify(next), userId)
  return next
}

/**
 * The calendar day it is now, as `YYYY-MM-DD`: in the zone the owner schedules consultations in when one is set (the same zone the booking system reads every time
 * in), else in UTC. A task's start and due dates and a milestone's date are calendar days with no zone; "overdue" means "the day has passed in THIS zone". The
 * server decides it, so the owner's screen, the customer's screen and the reminders always agree.
 */
export function todayKey(app: Pick<AppContext, 'db' | 'clock'>): string {
  const zone = loadBookingSettings(app.db).timeZone
  if (zone) {
    try {
      // The parts are put together by hand: the order of a formatted date belongs to a locale, the order of `YYYY-MM-DD` does not.
      const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(app.clock.now())
      const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? ''
      return `${part('year')}-${part('month')}-${part('day')}`
    } catch {
      // An unknown zone name falls back to UTC rather than failing a page.
    }
  }
  return app.clock.now().toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (both `YYYY-MM-DD`), negative when `to` is earlier. Calendar arithmetic in UTC, so no daylight-saving hour can shift it. */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
