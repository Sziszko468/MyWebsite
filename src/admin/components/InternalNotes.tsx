import { useState, type FormEvent } from 'react'
import type { Note } from '../api/types'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { TextAreaField } from './form'

export const NOTE_MAX = 2000

/**
 * What the administrators wrote about a record, and the form to add to it. Nothing here is ever shown to the sender or
 * on the website: notes are only in the administration's API, behind the session. A note cannot be edited or removed
 * (the history is the point); it goes with the record when the record is deleted.
 */
export function InternalNotes({ notes, canAdd, onAdd }: { notes: readonly Note[]; canAdd: boolean; onAdd: (body: string) => Promise<void> }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if (!text) return setProblem(t.notes.required)
    if ([...text].length > NOTE_MAX) return setProblem(t.notes.tooLong)
    setProblem(null)
    setBusy(true)
    try {
      await onAdd(text)
      setBody('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className={styles.stack} aria-labelledby="notes-title">
      <div>
        <h2 id="notes-title" className={styles.cardTitleTight}>
          {t.notes.title}
        </h2>
        <p className={styles.hint}>{t.notes.help}</p>
      </div>
      {notes.length === 0 ? (
        <p className={styles.muted}>{t.notes.empty}</p>
      ) : (
        <ul className={styles.notes}>
          {notes.map((note) => (
            <li key={note.id} className={styles.note}>
              <p className={styles.prose}>{note.body}</p>
              <p className={styles.noteMeta}>{fill(t.notes.by, { name: note.author_email ?? t.notes.unknownAuthor, date: formatDateTime(note.created_at, language) })}</p>
            </li>
          ))}
        </ul>
      )}
      {canAdd && (
        <form className={styles.stack} onSubmit={submit} noValidate>
          <TextAreaField label={t.notes.label} value={body} onChange={(event) => setBody(event.target.value)} maxLength={NOTE_MAX} error={problem} rows={3} />
          <div className={styles.formActions}>
            <AdminButton type="submit" variant="secondary" loading={busy} loadingLabel={t.notes.adding}>
              {t.notes.add}
            </AdminButton>
          </div>
        </form>
      )}
    </section>
  )
}
