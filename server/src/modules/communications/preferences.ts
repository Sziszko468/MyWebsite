import type { AppContext } from '../../context.ts'
import { iso } from '../../lib/time.ts'
import { DEFAULT_PREFERENCES, type MessagePreferences } from './model.ts'

/** What a customer chose to be e-mailed about. No row means the defaults (everything on). It is their own: read and written only through their session. */

interface PreferencesRow {
  replies: number
  announcements: number
  important: number
  resolution: number
}

export function readPreferences(app: Pick<AppContext, 'db'>, customerId: string): MessagePreferences {
  const row = app.db.get<PreferencesRow>('SELECT replies, announcements, important, resolution FROM customer_message_preferences WHERE customer_id = ?', [customerId])
  if (!row) return { ...DEFAULT_PREFERENCES }
  return { replies: row.replies === 1, announcements: row.announcements === 1, important: row.important === 1, resolution: row.resolution === 1 }
}

export function savePreferences(app: Pick<AppContext, 'db' | 'clock'>, customerId: string, changes: Partial<MessagePreferences>): MessagePreferences {
  const next = { ...readPreferences(app, customerId), ...changes }
  const now = iso(app.clock.now())
  app.db.run(
    `INSERT INTO customer_message_preferences (customer_id, replies, announcements, important, resolution, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (customer_id) DO UPDATE SET replies = excluded.replies, announcements = excluded.announcements, important = excluded.important, resolution = excluded.resolution, updated_at = excluded.updated_at`,
    [customerId, next.replies ? 1 : 0, next.announcements ? 1 : 0, next.important ? 1 : 0, next.resolution ? 1 : 0, now],
  )
  return next
}
