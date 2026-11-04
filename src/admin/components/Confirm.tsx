import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'

/**
 * A question before something that cannot be taken back (or that sends something out). It is the browser's own modal
 * dialog: focus moves into it and stays there, Escape cancels, the page behind cannot be used, and focus goes back to
 * the control that opened it. The safe answer has the focus, so Enter never confirms a deletion by accident.
 */

export interface ConfirmOptions {
  title: string
  body?: ReactNode
  confirmLabel?: string
  /** A deletion: the confirming button is the red one. */
  danger?: boolean
}

type Ask = (options: ConfirmOptions) => Promise<boolean>

const Context = createContext<Ask | null>(null)

export function ConfirmationDialog({ options, onAnswer }: { options: ConfirmOptions | null; onAnswer: (confirmed: boolean) => void }) {
  const t = useText()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const bodyId = useId()

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (options && !element.open) element.showModal()
    if (!options && element.open) element.close()
  }, [options])

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={options?.body ? bodyId : undefined}
      onCancel={(event) => {
        event.preventDefault()
        onAnswer(false)
      }}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself, outside its content) is a "no".
        if (event.target === event.currentTarget) onAnswer(false)
      }}
    >
      {options && (
        <div className={styles.dialogBody}>
          <h2 id={titleId} className={styles.dialogTitle}>
            {options.title}
          </h2>
          {options.body && (
            <div id={bodyId} className={styles.dialogText}>
              {options.body}
            </div>
          )}
          <div className={styles.dialogActions}>
            <AdminButton variant="secondary" onClick={() => onAnswer(false)} autoFocus>
              {t.confirm.cancel}
            </AdminButton>
            <AdminButton variant="primary" danger={options.danger} onClick={() => onAnswer(true)}>
              {options.confirmLabel ?? (options.danger ? t.confirm.delete : t.confirm.confirm)}
            </AdminButton>
          </div>
        </div>
      )}
    </dialog>
  )
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const pending = useRef<((confirmed: boolean) => void) | null>(null)

  const ask = useCallback<Ask>((next) => {
    pending.current?.(false)
    return new Promise<boolean>((resolve) => {
      pending.current = resolve
      setOptions(next)
    })
  }, [])

  const answer = useCallback((confirmed: boolean) => {
    pending.current?.(confirmed)
    pending.current = null
    setOptions(null)
  }, [])

  const value = useMemo(() => ask, [ask])
  return (
    <Context value={value}>
      {children}
      <ConfirmationDialog options={options} onAnswer={answer} />
    </Context>
  )
}

export function useConfirm(): Ask {
  const value = useContext(Context)
  if (!value) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return value
}
