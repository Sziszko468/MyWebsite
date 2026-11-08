import { useState } from 'react'
import { controlRoom, useControlRoom } from '../../ai/controlRoom'
import { useAiText } from '../../ai/useAiText'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { fill } from '../../utils/format'
import styles from './History.module.scss'

/**
 * The visitor's conversations in this browser tab: open one, delete one (its words leave the server at once), start a new one.
 * The list is the server's, for this anonymous session only; another visitor's conversations are not reachable from it.
 */
export function HistoryList({ onChosen }: { onChosen?: () => void }) {
  const room = useControlRoom()
  const text = useAiText()
  const { lang } = useI18n()
  const [asking, setAsking] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const format = new Intl.DateTimeFormat(lang, { dateStyle: 'short', timeStyle: 'short' })

  return (
    <div className={styles.history}>
      <div className={styles.head}>
        <h2 className={styles.title}>{text.history.title}</h2>
        <button
          type="button"
          className={styles.new}
          onClick={() => {
            controlRoom.newConversation()
            onChosen?.()
          }}
        >
          {text.actions.newChat}
        </button>
      </div>
      {room.conversations.length === 0 ? (
        <p className={styles.empty}>{text.history.empty}</p>
      ) : (
        <ul className={styles.list}>
          {room.conversations.map((conversation) => {
            const title = conversation.title?.trim() || text.history.untitled
            const current = conversation.id === room.conversationId
            return (
              <li key={conversation.id} className={cx(styles.item, current && styles.current)}>
                {asking === conversation.id ? (
                  <span className={styles.confirm} role="group" aria-label={text.actions.clearConfirm}>
                    <span>{text.actions.clearConfirm}</span>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={() => {
                        setAsking(null)
                        void controlRoom.remove(conversation.id).then(() => setMessage(text.actions.deleted))
                      }}
                    >
                      {text.actions.confirm}
                    </button>
                    <button type="button" className={styles.ghost} onClick={() => setAsking(null)}>
                      {text.actions.cancel}
                    </button>
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      className={styles.open}
                      aria-current={current ? 'true' : undefined}
                      aria-label={fill(text.history.open, { title })}
                      onClick={() => {
                        void controlRoom.open(conversation.id)
                        onChosen?.()
                      }}
                    >
                      <span className={styles.name}>{title}</span>
                      <span className={styles.when}>{format.format(new Date(conversation.updatedAt))}</span>
                    </button>
                    <button type="button" className={styles.remove} aria-label={fill(text.history.delete, { title })} onClick={() => setAsking(conversation.id)}>
                      <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                        <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {message && (
        <p className={styles.note} role="status">
          {message}
        </p>
      )}
      <p className={styles.note}>{text.history.note}</p>
    </div>
  )
}
