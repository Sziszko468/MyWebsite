import { useEffect, useId, useRef, type ReactNode } from 'react'
import d from './Deliverables.module.scss'

/**
 * A question before something that cannot be taken back (PROMPT 27: an approval). It is the browser's own modal `<dialog>`: focus moves into it, stays there, Escape cancels,
 * the page behind cannot be used, and focus goes back to the control that opened it. Nothing is decided by opening it; the answer is the customer's explicit action inside it.
 */
export function Dialog({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const heading = useId()
  const opener = useRef<Element | null>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      opener.current = document.activeElement
      dialog.showModal()
    } else if (!open && dialog.open) {
      dialog.close()
      if (opener.current instanceof HTMLElement) opener.current.focus()
    }
  }, [open])

  return (
    <dialog ref={ref} className={d.dialog} aria-labelledby={heading} onCancel={(event) => { event.preventDefault(); onClose() }} onClose={() => { if (open) onClose() }}>
      <div className={d.dialogBody}>
        <h2 id={heading} className={d.dialogTitle}>
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  )
}
