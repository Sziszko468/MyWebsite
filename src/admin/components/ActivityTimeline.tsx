import type { ActivityEvent } from '../api/types'
import type { AdminText } from '../i18n/en'
import { fill, formatDateTime, statusLabel, useInterfaceLanguage, useText } from '../i18n'
import styles from '../styles/ui.module.scss'

/** Old inquiries recorded `answered` and `closed` before the statuses were renamed; the history still reads right. */
const LEGACY: Record<string, string> = { answered: 'waiting_client', closed: 'completed' }

/** What an event says, as a sentence, in the administrator's language. Only the action and its short summary: the log never holds what anyone wrote. */
export function describeActivity(t: AdminText, event: Pick<ActivityEvent, 'action' | 'detail'>): string {
  if (event.action === 'received') return t.activity.received
  const actions = t.activity.actions as Record<string, string>
  const base = actions[event.action]
  if (!base) return fill(t.activity.unknown, { action: event.action })
  const detail = event.detail ?? {}
  if (event.action === 'inquiry.status' || event.action === 'quote.status') {
    const kind = event.action === 'inquiry.status' ? 'inquiry' : 'quote'
    const word = (value: unknown) => {
      const raw = typeof value === 'string' ? value : ''
      return statusLabel(t, kind, kind === 'inquiry' ? (LEGACY[raw] ?? raw) : raw)
    }
    const change = fill(t.activity.statusChange, { from: word(detail.from), to: word(detail.to) })
    return `${base}: ${change}${detail.emailed === true ? ` (${t.activity.emailed})` : ''}`
  }
  if (event.action === 'quote.link') return fill(base, { inquiry: typeof detail.inquiry === 'string' ? detail.inquiry : '' })
  if (event.action === 'translation.update') return fill(base, { language: typeof detail.language === 'string' ? ((t.languages as Record<string, string>)[detail.language] ?? detail.language) : '' })
  return base
}

export function ActivityTimeline({ events, heading = true }: { events: readonly ActivityEvent[]; heading?: boolean }) {
  const t = useText()
  const language = useInterfaceLanguage()
  // Newest first: what happened last is what the administrator wants to see.
  const ordered = [...events].reverse()
  return (
    <section aria-label={t.timeline.title}>
      {heading && <h2 className={styles.cardTitle}>{t.timeline.title}</h2>}
      <ol className={styles.timeline}>
        {ordered.map((event, index) => (
          <li key={`${event.at}-${event.action}-${index}`} className={styles.timelineItem}>
            <span>{describeActivity(t, event)}</span>
            <span className={styles.timelineWhen}>
              <time dateTime={event.at}>{formatDateTime(event.at, language)}</time> · {event.actor ? fill(t.activity.actor, { name: event.actor }) : t.activity.system}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}
