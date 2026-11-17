import type { AppContext } from '../../context.ts'
import { getSetting, setSetting } from '../system/settings.ts'
import { DEFAULT_SETTINGS, SETTINGS_KEY, type CommunicationSettings } from './model.ts'

/** The owner's choices about the communication system: one switch for customers starting threads and one per e-mail, every one a plain yes or no. */

export function communicationSettings(app: Pick<AppContext, 'db'>): CommunicationSettings {
  const stored = getSetting(app.db, SETTINGS_KEY)
  if (!stored) return { ...DEFAULT_SETTINGS }
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>
    const out = { ...DEFAULT_SETTINGS }
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof CommunicationSettings)[]) if (typeof parsed[key] === 'boolean') out[key] = parsed[key] as boolean
    return out
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveCommunicationSettings(app: Pick<AppContext, 'db' | 'clock'>, next: CommunicationSettings, userId: string): CommunicationSettings {
  setSetting(app.db, app.clock, SETTINGS_KEY, JSON.stringify(next), userId)
  return next
}
