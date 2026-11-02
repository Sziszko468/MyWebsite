import { useId, type ReactNode } from 'react'
import { cx } from '../../utils/cx'
import { CheckIcon } from './icons'
import styles from './Choice.module.scss'

interface ChoiceCardProps {
  /** `radio`: one of a group. `checkbox`: any number. Both are real inputs, so keyboard and screen readers work. */
  type: 'radio' | 'checkbox'
  name?: string
  value?: string
  checked: boolean
  onChange: (checked: boolean) => void
  title: ReactNode
  text?: ReactNode
  /** A small label beside the title, e.g. "Suggested". */
  tag?: ReactNode
  /** Something at the end of the card, e.g. the price status. */
  meta?: ReactNode
  compact?: boolean
  disabled?: boolean
  className?: string
}

/**
 * A large choice: the whole card is the input's target (the input is stretched over it), the
 * chosen card shows a tick and a heavier frame as well as a colour, and its focus is drawn on the
 * card. At least 56px tall, so a thumb hits it without care.
 */
export function ChoiceCard({ type, name, value, checked, onChange, title, text, tag, meta, compact = false, disabled = false, className }: ChoiceCardProps) {
  return (
    <label className={cx(styles.card, compact && styles.compact, className)} data-checked={checked || undefined} data-disabled={disabled || undefined}>
      <input
        className={styles.input}
        type={type}
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className={cx(styles.mark, type === 'radio' && styles.round)} aria-hidden="true">
        <CheckIcon />
      </span>
      <span className={styles.body}>
        <span className={styles.titleRow}>
          <span className={styles.title}>{title}</span>
          {tag && <span className={styles.tag}>{tag}</span>}
        </span>
        {text && <span className={styles.text}>{text}</span>}
        {meta && <span className={styles.meta}>{meta}</span>}
      </span>
    </label>
  )
}

interface ChoiceFieldsetProps {
  legend: ReactNode
  hint?: ReactNode
  error?: string
  /** Lays the cards in two columns from `md`. */
  columns?: 1 | 2
  className?: string
  children: ReactNode
}

/** A group of choices with a name (the legend), an optional hint and its own error sentence. */
export function ChoiceFieldset({ legend, hint, error, columns = 1, className, children }: ChoiceFieldsetProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const described = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined

  return (
    <fieldset className={cx(styles.fieldset, className)} aria-describedby={described} data-invalid={error ? 'true' : undefined}>
      <legend className={styles.legend}>{legend}</legend>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <div className={cx(styles.grid, columns === 2 && styles.two)}>{children}</div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          <svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 4.2v4.6M8 11.2v.1" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  )
}
