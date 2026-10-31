import { useId, useState, type ReactNode } from 'react'
import { cx } from '../../../utils/cx'
import styles from './LabPanel.module.scss'

interface LabPanelProps {
  title: string
  showLabel: string
  hideLabel: string
  children: ReactNode
  /** Fixed at the bottom of the panel, below the scrolling controls (the display switch). */
  footer?: ReactNode
  /** Open on first render. The Lab opens it on wide screens and keeps it closed on phones. */
  defaultOpen?: boolean
  className?: string
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" focusable="false">
      <path d="M3 6h8M15 6h2M3 14h2M9 14h8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="13" cy="6" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="7" cy="14" r="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

/**
 * The control panel of an experiment: a glass sheet at the side of the stage on wide screens and a
 * collapsible sheet above the navigation on phones. Closed, it is one button; open, it scrolls
 * inside itself and never covers more than the stage's side. The button reports its state with
 * aria-expanded; the controls are in the DOM either way, but hidden from every user while closed.
 */
export function LabPanel({
  title,
  showLabel,
  hideLabel,
  children,
  footer,
  defaultOpen = true,
  className,
}: LabPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const bodyId = useId()

  return (
    <section
      className={cx(styles.panel, open && styles.open, className)}
      aria-label={title}
      data-lab-ui
      data-lab-panel
      data-open={open}
    >
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersIcon />
        <span className={styles.toggleLabel}>{title}</span>
        <span className="visually-hidden">: {open ? hideLabel : showLabel}</span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>

      <div id={bodyId} className={styles.body} hidden={!open}>
        <div className={styles.scroll}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </section>
  )
}
