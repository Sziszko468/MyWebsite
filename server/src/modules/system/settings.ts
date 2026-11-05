import type { Language } from '../../config.ts'
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
  /** E-mail the person who wrote to confirm that their message arrived. Off until an administrator turns it on. */
  confirmInquiry: boolean
  /** The same for a quote request. */
  confirmQuote: boolean
  /**
   * A sentence the administrator wrote for the confirmations, per language, for example how long an answer usually takes.
   * Empty means the confirmation says nothing about timing: the site never invents one.
   */
  responseNote: Record<Language, string>
}

/** The longest the sentence in a confirmation may be. */
export const RESPONSE_NOTE_MAX = 200

const KEYS = {
  newInquiry: 'notify.inquiry',
  newQuote: 'notify.quote',
  confirmInquiry: 'confirm.inquiry',
  confirmQuote: 'confirm.quote',
  note: (language: Language) => `confirm.note.${language}`,
} as const

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

/**
 * The owner's own notifications default to on (an owner who configured an address wants to hear about what arrives
 * until they say otherwise); the confirmations to visitors default to OFF (nobody gets an e-mail they did not ask for
 * from a site whose owner has not decided to send them).
 */
export function notificationPreferences(db: Database): NotificationPreferences {
  return {
    newInquiry: getSetting(db, KEYS.newInquiry) !== '0',
    newQuote: getSetting(db, KEYS.newQuote) !== '0',
    confirmInquiry: getSetting(db, KEYS.confirmInquiry) === '1',
    confirmQuote: getSetting(db, KEYS.confirmQuote) === '1',
    responseNote: { hu: getSetting(db, KEYS.note('hu')) ?? '', en: getSetting(db, KEYS.note('en')) ?? '', nl: getSetting(db, KEYS.note('nl')) ?? '' },
  }
}

export function saveNotificationPreferences(db: Database, clock: Clock, userId: string, preferences: NotificationPreferences): void {
  db.transaction(() => {
    setSetting(db, clock, KEYS.newInquiry, preferences.newInquiry ? '1' : '0', userId)
    setSetting(db, clock, KEYS.newQuote, preferences.newQuote ? '1' : '0', userId)
    setSetting(db, clock, KEYS.confirmInquiry, preferences.confirmInquiry ? '1' : '0', userId)
    setSetting(db, clock, KEYS.confirmQuote, preferences.confirmQuote ? '1' : '0', userId)
    for (const language of ['hu', 'en', 'nl'] as const) setSetting(db, clock, KEYS.note(language), preferences.responseNote[language], userId)
  })
}
