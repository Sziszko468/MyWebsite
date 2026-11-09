import { useState, type FormEvent } from 'react'
import { statusLabel, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { CheckField, SelectField, TextAreaField } from './form'

export interface QuoteStatusChange {
  status: string
  show: boolean
  notify: boolean
  note: string
  internalNote: string
}

/**
 * Changing a request's status. The moves offered are the ones the server allows from the current status (an acceptance or decline recorded by
 * hand needs a reason of its own). What the customer sees is the administrator's choice, never automatic: nothing, the status page, or the status
 * page and an e-mail with a message of the administrator's own.
 */
export function QuoteStatusForm({ current, moves, emailEnabled, onSubmit }: { current: string; moves: readonly string[]; emailEnabled: boolean; onSubmit: (change: QuoteStatusChange) => Promise<void> }) {
  const t = useText()
  const f = t.quotation.detail.statusForm
  const [status, setStatus] = useState(current)
  const [show, setShow] = useState(false)
  const [notify, setNotify] = useState(false)
  const [note, setNote] = useState('')
  const [internalNote, setInternalNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [tried, setTried] = useState(false)

  const manual = status === 'accepted' || status === 'declined'
  const missing = manual && status !== current && internalNote.trim().length < 3
  const options = [current, ...moves.filter((move) => move !== current)]

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setTried(true)
    if (missing) return
    setBusy(true)
    try {
      await onSubmit({ status, show: show || notify, notify: notify && emailEnabled, note: show || notify ? note : '', internalNote })
      setShow(false)
      setNotify(false)
      setNote('')
      setInternalNote('')
      setTried(false)
    } finally {
      setBusy(false)
    }
  }

  if (moves.length === 0) return <p className={styles.muted}>{f.noMoves}</p>

  return (
    <form className={styles.stack} onSubmit={submit} noValidate>
      <SelectField label={f.heading} value={status} onChange={(event) => setStatus(event.target.value)} options={options.map((value) => ({ value, label: statusLabel(t, 'quote', value) }))} />
      {manual && status !== current && <p className={styles.hint}>{f.manualDecision}</p>}
      <CheckField label={f.show} checked={show || notify} disabled={notify} onChange={setShow} hint={f.showHelp} />
      <CheckField label={f.email} checked={notify && emailEnabled} disabled={!emailEnabled} onChange={setNotify} hint={emailEnabled ? undefined : t.quotes.detail.emailOff} />
      {(show || notify) && <TextAreaField label={f.customerMessage} hint={f.customerMessageHelp} value={note} maxLength={1000} rows={3} onChange={(event) => setNote(event.target.value)} />}
      <TextAreaField label={f.internalNote} hint={tried && missing ? f.internalNoteRequired : f.internalNoteHelp} error={tried && missing ? f.internalNoteRequired : null} value={internalNote} maxLength={2000} rows={2} onChange={(event) => setInternalNote(event.target.value)} optional={!manual} />
      <AdminButton type="submit" variant="primary" loading={busy} loadingLabel={t.common.saving} disabled={status === current && !show && !notify && !internalNote.trim()}>
        {f.heading}
      </AdminButton>
    </form>
  )
}
