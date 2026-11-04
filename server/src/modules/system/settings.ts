import type { Database } from '../../db/database.ts'
import { iso, type Clock } from '../../lib/time.ts'

/**
 * The few switches an administrator may change while the server runs. They live in the database because a restart
 * with new environment variables is the wrong tool for "stop e-mailing me about quote requests". Anything that is a
 * secret or a piece of server configuration is NOT here: it stays an environment variable, and the browser never sees it.
 */

export interface NotificationPreferences {
  /** E-mail the owner (NOTIFY_TO) when a message arrives. */
  newInquiry: boolean
  /** E-mail the owner when a quote request arrives. */
  newQuote: boolean
}

const KEYS = { newInquiry: 'notify.inquiry', newQuote: 'notify.quote' } as const

export function getSetting(db: Database, key: string): string | null {
  return db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null
}

export function setSetting(db: Database, clock: Clock, key: string, value: string, userId: string | null): void {
  db.run(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    [key, value, iso(clock.now()), userId],
  )
}

/** Both default to on: an owner who configured an address wants to hear about what arrives until they say otherwise. */
export function notificationPreferences(db: Database): NotificationPreferences {
  return { newInquiry: getSetting(db, KEYS.newInquiry) !== '0', newQuote: getSetting(db, KEYS.newQuote) !== '0' }
}

export function saveNotificationPreferences(db: Database, clock: Clock, userId: string, preferences: NotificationPreferences): void {
  db.transaction(() => {
    setSetting(db, clock, KEYS.newInquiry, preferences.newInquiry ? '1' : '0', userId)
    setSetting(db, clock, KEYS.newQuote, preferences.newQuote ? '1' : '0', userId)
  })
}
