import { useState, type FormEvent } from 'react'
import { statusLabel, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { CheckField, SelectField, TextAreaField } from './form'

export interface StatusFormCopy {
  heading: string
  button: string
  emailSender: string
  emailNote: string
  emailNoteHelp: string
  emailOff: string
}

/**
 * Changing a status: the new status, and, only if the administrator chooses, an e-mail to the person who wrote (never
 * automatic) with an optional note. With e-mail not configured the box is off and says why instead of pretending.
 * The parent gives it `key={current}`, so when the status changes the form starts over from what is true now.
 */
export function StatusForm({ kind, current, statuses, emailEnabled, copy, onSubmit }: { kind: 'inquiry' | 'quote'; current: string; statuses: readonly string[]; emailEnabled: boolean; copy: StatusFormCopy; onSubmit: (change: { status: string; notify: boolean; note: string }) => Promise<void> }) {
  const t = useText()
  const [status, setStatus] = useState(current)
  const [notify, setNotify] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await onSubmit({ status, notify, note: notify ? note : '' })
      setNotify(false)
      setNote('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.stack} onSubmit={submit}>
      <SelectField label={copy.heading} value={status} onChange={(event) => setStatus(event.target.value)} options={statuses.map((value) => ({ value, label: statusLabel(t, kind, value) }))} />
      <CheckField label={copy.emailSender} checked={notify && emailEnabled} disabled={!emailEnabled} onChange={setNotify} hint={emailEnabled ? undefined : copy.emailOff} />
      {notify && emailEnabled && <TextAreaField label={copy.emailNote} hint={copy.emailNoteHelp} value={note} maxLength={1000} rows={3} onChange={(event) => setNote(event.target.value)} />}
      <AdminButton type="submit" variant="primary" loading={busy} loadingLabel={t.common.saving} disabled={status === current && !notify}>
        {copy.button}
      </AdminButton>
    </form>
  )
}
