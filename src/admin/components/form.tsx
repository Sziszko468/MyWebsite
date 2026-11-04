import { useEffect, useId, useState, type ChangeEvent, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { cx } from '../../utils/cx'
import { fill, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import { Icon } from './Icon'

/**
 * The form controls. Each one is a label tied to its control, an optional hint and an error, wired so a screen reader
 * hears them with the control (`aria-describedby`, `aria-invalid`), and the error is a sentence, not a colour.
 */

interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  required?: boolean
  optional?: boolean
  className?: string
}

function Frame({ id, label, hint, error, required, optional, className, children }: FieldProps & { id: string; children: ReactNode }) {
  const t = useText()
  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required && <span className={styles.srOnly}> ({t.common.required})</span>}
        {optional && <span className={styles.muted}> ({t.common.optional})</span>}
      </label>
      {children}
      {hint && (
        <p className={styles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className={styles.error} id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

const describedBy = (id: string, hint: boolean, error: boolean) => [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined

type InputProps = Omit<ComponentPropsWithoutRef<'input'>, 'className' | 'id'>

export function TextField({ label, hint, error, required, optional, className, ...input }: FieldProps & InputProps) {
  const id = useId()
  return (
    <Frame id={id} label={label} hint={hint} error={error} required={required} optional={optional} className={className}>
      <input {...input} id={id} className={styles.input} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, Boolean(hint), Boolean(error))} />
    </Frame>
  )
}

export function TextAreaField({ label, hint, error, required, optional, className, maxLength, value, rows = 5, ...area }: FieldProps & Omit<ComponentPropsWithoutRef<'textarea'>, 'className' | 'id' | 'value'> & { value: string }) {
  const id = useId()
  const t = useText()
  return (
    <Frame id={id} label={label} hint={maxLength === undefined ? hint : undefined} error={error} required={required} optional={optional} className={className}>
      <textarea {...area} id={id} className={styles.textarea} rows={rows} value={value} maxLength={undefined} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, Boolean(hint) || Boolean(maxLength), Boolean(error))} />
      {maxLength !== undefined && (
        <p className={styles.hint} id={`${id}-hint`} aria-live="off">
          {hint ? <>{hint} · </> : null}
          {fill(t.services.edit.characters, { count: [...value].length, max: maxLength })}
        </p>
      )}
    </Frame>
  )
}

export function SelectField({ label, hint, error, required, optional, className, options, compact = false, ...select }: FieldProps & Omit<ComponentPropsWithoutRef<'select'>, 'className' | 'id'> & { options: { value: string; label: string }[]; compact?: boolean }) {
  const id = useId()
  return (
    <Frame id={id} label={label} hint={hint} error={error} required={required} optional={optional} className={className}>
      <select {...select} id={id} className={cx(styles.select, compact && styles.selectCompact)} required={required} aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, Boolean(hint), Boolean(error))}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Frame>
  )
}

/** A select that filters a list: the same control with a short label above it. */
export function FilterDropdown({ label, value, options, onChange, className }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (value: string) => void; className?: string }) {
  return <SelectField label={label} value={value} options={options} onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)} className={className} />
}

export function CheckField({ label, hint, checked, onChange, disabled }: { label: ReactNode; hint?: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return (
    <div>
      <label className={styles.check} htmlFor={id}>
        <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
        <span>{label}</span>
      </label>
      {hint && (
        <p className={styles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}

/** An on/off switch (a checkbox underneath, so it is a switch to a screen reader and works with the keyboard as one). */
export function SwitchField({ label, checked, onChange, disabled, hint }: { label: ReactNode; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean; hint?: ReactNode }) {
  const id = useId()
  return (
    <div>
      <label className={styles.switch} htmlFor={id}>
        <input id={id} type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} aria-describedby={hint ? `${id}-hint` : undefined} />
        <span className={styles.track} aria-hidden="true">
          <span className={styles.thumb} />
        </span>
        <span>{label}</span>
      </label>
      {hint && (
        <p className={styles.hint} id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  )
}

export function Fieldset({ legend, children, className }: { legend: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx(styles.fieldset, className)}>
      <legend className={styles.legend}>{legend}</legend>
      {children}
    </fieldset>
  )
}

/**
 * A search box that waits for a pause in typing before it asks (so a list is not reloaded on every key), can be cleared
 * with one press, and keeps its own text while the list re-renders around it.
 */
export function SearchInput({ label, value, onSearch, placeholder, className, delay = 300 }: { label: string; value: string; onSearch: (value: string) => void; placeholder?: string; className?: string; delay?: number }) {
  const t = useText()
  const id = useId()
  const [text, setText] = useState(value)
  const [seen, setSeen] = useState(value)
  // The list was changed from elsewhere (the filters were cleared, the address changed): follow it.
  if (value !== seen) {
    setSeen(value)
    setText(value)
  }

  // Ask once typing pauses; a text the list already shows is not asked for again.
  useEffect(() => {
    if (text.trim() === value) return
    const timer = window.setTimeout(() => onSearch(text.trim()), delay)
    return () => window.clearTimeout(timer)
    // Only a change of the typed text starts the wait.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <span className={styles.search}>
        <Icon name="search" className={styles.searchIcon} />
        <input
          id={id}
          type="search"
          className={cx(styles.input, styles.searchInput)}
          value={text}
          placeholder={placeholder}
          autoComplete="off"
          enterKeyHint="search"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSearch(text.trim())
          }}
        />
        {text !== '' && (
          <button
            type="button"
            className={cx(styles.iconButton, styles.searchClear)}
            aria-label={t.common.clear}
            onClick={() => {
              setText('')
              onSearch('')
            }}
          >
            <Icon name="x" />
          </button>
        )}
      </span>
    </div>
  )
}
