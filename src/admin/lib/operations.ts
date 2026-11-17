import type { OperationsData } from '../api/types'
import type { AdminText } from '../i18n/en'
import type { InterfaceLanguage } from '../api/types'

/** Small helpers for the Operations panels of the System page: wording and measures, nothing that calls the server. */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const

/** A size in bytes in the unit people read (1024-based), with one decimal from the megabytes up. */
export function formatBytes(bytes: number, language: InterfaceLanguage): string {
  let value = Math.max(0, bytes)
  let unit = 0
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024
    unit += 1
  }
  const locale = language === 'hu' ? 'hu-HU' : 'en-GB'
  return `${value.toLocaleString(locale, { maximumFractionDigits: unit >= 2 ? 1 : 0 })} ${UNITS[unit]}`
}

/** The categories the backend records for a failed backup (server/src/modules/backups/errors.ts, and `interrupted`); the dictionaries must word each one. */
export const BACKUP_ERROR_CATEGORIES = ['drive_auth', 'drive_http', 'drive_network', 'integrity', 'snapshot', 'encryption', 'busy', 'internal', 'interrupted'] as const

/** A sentence for a backup failure category in the administrator's language; one the screen does not know is "unknown", never shown as it is. */
export function backupErrorText(t: AdminText, category: string | null): string {
  const words = t.settings.operations.backup.errors as Record<string, string>
  return (category !== null && Object.prototype.hasOwnProperty.call(words, category) ? words[category] : undefined) ?? words.unknown
}

export type SendingState = 'on' | 'paused' | 'off'

export function sendingState(email: OperationsData['email']): SendingState {
  if (email.provider === 'none') return 'off'
  return email.paused || !email.enabled ? 'paused' : 'on'
}

/** Whether the e-mail panel should say that sending is not yet proof of delivery: the checks have not run, or one of them is not verified. */
export function emailNeedsAttention(email: OperationsData['email']): boolean {
  if (email.provider === 'none') return false
  if (email.checks === null) return true
  return email.checks.items.some((item) => item.state === 'not_verified' || item.state === 'unknown')
}

/** Everything on the Operations part that asks for attention, as keys the screen can show in one line. */
export function attentionOf(data: OperationsData): ('backup' | 'disk' | 'migrations' | 'email' | 'network' | 'assistant')[] {
  const found: ReturnType<typeof attentionOf> = []
  if (data.backup.enabled && (data.backup.state === 'stale' || data.backup.state === 'never' || data.backup.lastAttempt?.status === 'failed')) found.push('backup')
  if (data.disk.low) found.push('disk')
  if (data.migrations.pending > 0) found.push('migrations')
  if (emailNeedsAttention(data.email)) found.push('email')
  if (data.network.verdict === 'differs_from_cloudflare_header') found.push('network')
  if (data.assistant.verification === 'failed' || data.assistant.verification === 'stale') found.push('assistant')
  return found
}
