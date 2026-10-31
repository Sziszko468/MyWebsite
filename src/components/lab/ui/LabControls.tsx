import { useId, type CSSProperties, type ReactNode } from 'react'
import { cx } from '../../../utils/cx'
import styles from './LabControls.module.scss'

/**
 * The Lab's own controls: native inputs (range, radio, checkbox, button) dressed in the Lab's
 * language, so keyboard, touch and screen readers get what the platform already provides. Every
 * control has a visible label; a value that changes is also announced through the input itself.
 */

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
  /** How the value is written next to the label; defaults to the number. */
  format?: (value: number) => string
  className?: string
}

export function LabSlider({ label, value, min, max, step = 0.01, onChange, format, className }: SliderProps) {
  const id = useId()
  const text = format ? format(value) : String(value)
  const fill = ((value - min) / (max - min)) * 100

  return (
    <div className={cx(styles.field, className)}>
      <div className={styles.fieldHead}>
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
        <output htmlFor={id} className={styles.value}>
          {text}
        </output>
      </div>
      <input
        id={id}
        className={styles.range}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={text}
        style={{ '--fill': `${fill}%` } as CSSProperties}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  )
}

interface ChoiceOption<T extends string> {
  value: T
  label: string
  /** A short description, available to assistive technology and as a tooltip. */
  help?: string
}

interface ChoiceProps<T extends string> {
  label: string
  value: T
  options: readonly ChoiceOption<T>[]
  onChange: (value: T) => void
  /** Columns on a wide panel; the options wrap on a narrow one. */
  columns?: 2 | 3 | 4
  className?: string
}

export function LabChoice<T extends string>({
  label,
  value,
  options,
  onChange,
  columns = 2,
  className,
}: ChoiceProps<T>) {
  const name = useId()

  return (
    <fieldset className={cx(styles.field, styles.choice, className)}>
      <legend className={styles.label}>{label}</legend>
      <div className={styles.options} data-columns={columns}>
        {options.map((option) => (
          <label key={option.value} className={styles.option} title={option.help}>
            <input
              className={styles.optionInput}
              type="radio"
              name={name}
              value={option.value}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span className={styles.optionFace}>{option.label}</span>
            {option.help && <span className="visually-hidden">: {option.help}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

interface ToggleProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  className?: string
}

export function LabToggle({ label, checked, onChange, className }: ToggleProps) {
  const id = useId()
  return (
    <div className={cx(styles.field, styles.toggle, className)}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        id={id}
        className={styles.switch}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    </div>
  )
}

interface ActionProps {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'quiet'
  /** Reflects a toggled state (e.g. "break apart" on/off) to assistive technology. */
  pressed?: boolean
  disabled?: boolean
  /** `submit` makes it the button of the form it is in. */
  type?: 'button' | 'submit'
  className?: string
}

export function LabAction({
  children,
  onClick,
  variant = 'quiet',
  pressed,
  disabled,
  type = 'button',
  className,
}: ActionProps) {
  return (
    <button
      type={type}
      className={cx(styles.action, variant === 'primary' && styles.primary, className)}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** A titled group of controls inside a panel. */
export function LabGroup({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx(styles.group, className)} role="group" aria-label={title}>
      {title && <p className={styles.groupTitle}>{title}</p>}
      {children}
    </div>
  )
}

/** A row of actions. */
export function LabActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>
}

/** A short line of plain text inside a panel (a readout, a note). */
export function LabNote({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return (
    <p className={styles.note} aria-live={live ? 'polite' : undefined}>
      {children}
    </p>
  )
}
