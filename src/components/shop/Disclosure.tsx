import { useId, useState, type ReactNode } from 'react'
import { cx } from '../../utils/cx'
import { ChevronIcon } from './icons'
import styles from './Disclosure.module.scss'

interface DisclosureProps {
  title: ReactNode
  /** A short note at the right of the title, e.g. how many things are chosen inside. */
  meta?: ReactNode
  defaultOpen?: boolean
  /** Heading level of the title; the button inside it is what is announced. */
  level?: 2 | 3 | 4
  className?: string
  children: ReactNode
}

/**
 * A section that opens and closes with a short slide. It is a button that controls a region (the
 * state is announced, Enter and Space work, the closed content is out of the tab order and hidden
 * from assistive technology), not a native <details>, so the height can animate. Under reduced
 * motion the durations collapse to nothing (styles/tokens.css), so it simply appears.
 */
export function Disclosure({ title, meta, defaultOpen = false, level = 3, className, children }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  const Heading = `h${level}` as const

  return (
    <div className={cx(styles.root, open && styles.open, className)}>
      <Heading className={styles.heading}>
        <button type="button" className={styles.trigger} aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen((value) => !value)}>
          <span className={styles.title}>{title}</span>
          {meta && <span className={styles.meta}>{meta}</span>}
          <span className={styles.icon} aria-hidden="true">
            <ChevronIcon />
          </span>
        </button>
      </Heading>
      <div id={`${id}-panel`} className={styles.panel} role="region" aria-label={typeof title === 'string' ? title : undefined} inert={!open}>
        <div className={styles.inner}>{children}</div>
      </div>
    </div>
  )
}
