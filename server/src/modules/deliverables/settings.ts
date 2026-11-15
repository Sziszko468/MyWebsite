import type { AppContext } from '../../context.ts'
import { getSetting, setSetting } from '../system/settings.ts'
import { DEFAULT_SETTINGS, SETTINGS_KEY, type DeliverableSettings } from './model.ts'

/** The owner's choices about what the feedback and approval work e-mails: one switch per message, every one a plain yes or no. */

export function deliverableSettings(app: Pick<AppContext, 'db'>): DeliverableSettings {
  const stored = getSetting(app.db, SETTINGS_KEY)
  if (!stored) return { ...DEFAULT_SETTINGS }
  try {
    const parsed = JSON.parse(stored) as Record<string, unknown>
    const out = { ...DEFAULT_SETTINGS }
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof DeliverableSettings)[]) if (typeof parsed[key] === 'boolean') out[key] = parsed[key] as boolean
    return out
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveDeliverableSettings(app: Pick<AppContext, 'db' | 'clock'>, next: DeliverableSettings, userId: string): DeliverableSettings {
  setSetting(app.db, app.clock, SETTINGS_KEY, JSON.stringify(next), userId)
  return next
}
