import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { cx } from '../../../utils/cx'
import styles from './ui.module.scss'

/**
 * The small parts the four applications are built from. They are deliberately plain: a tool
 * button, a stepper, tabs, a collapsible section, a toast. Each application arranges them in its
 * own way (a workbench, a cockpit, a drawing board, a lab bench), so the parts match and the
 * screens do not.
 */

interface ToolButtonProps {
  label: string
  /** An icon (an inline SVG); the label is shown under it, or only to assistive technology when `iconOnly`. */
  icon?: ReactNode
  pressed?: boolean
  disabled?: boolean
  onClick: () => void
  /** Hides the visible label; the name stays for assistive technology. */
  iconOnly?: boolean
  /** A short hint of the keyboard shortcut, shown as a tooltip and to assistive technology. */
  shortcut?: string
  tone?: 'default' | 'accent' | 'danger'
  className?: string
}

export function ToolButton({
  label,
  icon,
  pressed,
  disabled,
  onClick,
  iconOnly,
  shortcut,
  tone = 'default',
  className,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      className={cx(styles.tool, tone === 'accent' && styles.accent, tone === 'danger' && styles.danger, className)}
      aria-pressed={pressed}
      aria-keyshortcuts={shortcut}
      aria-label={iconOnly ? label : undefined}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon && <span className={styles.toolIcon}>{icon}</span>}
      {!iconOnly && <span className={styles.toolLabel}>{label}</span>}
    </button>
  )
}

/** A strip of tools. */
export function ToolRow({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <div className={cx(styles.row, className)} role="group" aria-label={label}>
      {children}
    </div>
  )
}

interface StepperProps {
  label: string
  value: number
  onChange: (value: number) => void
  step?: number
  min?: number
  max?: number
  /** Digits after the point shown and kept. */
  digits?: number
  unit?: string
  /** Coloured mark for an axis. */
  axis?: 'x' | 'y' | 'z'
}

/**
 * A number with a minus and a plus: exact values from a finger, where dragging a handle is
 * clumsy. The number itself can also be typed.
 */
export function Stepper({
  label,
  value,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  digits = 2,
  unit,
  axis,
}: StepperProps) {
  const id = useId()
  const clamp = (next: number) => Math.min(max, Math.max(min, Number(next.toFixed(digits))))
  return (
    <div className={styles.stepper}>
      <label htmlFor={id} className={styles.stepperLabel} data-axis={axis}>
        {label}
      </label>
      <button
        type="button"
        className={styles.stepButton}
        aria-label={`${label} −`}
        onClick={() => onChange(clamp(value - step))}
      >
        −
      </button>
      <input
        id={id}
        className={styles.stepInput}
        type="number"
        inputMode="decimal"
        value={Number.isFinite(value) ? Number(value.toFixed(digits)) : 0}
        step={step}
        min={Number.isFinite(min) ? min : undefined}
        max={Number.isFinite(max) ? max : undefined}
        onChange={(event) => {
          const parsed = Number(event.currentTarget.value)
          if (event.currentTarget.value !== '' && Number.isFinite(parsed)) onChange(clamp(parsed))
        }}
      />
      <button
        type="button"
        className={styles.stepButton}
        aria-label={`${label} +`}
        onClick={() => onChange(clamp(value + step))}
      >
        +
      </button>
      {unit && <span className={styles.unit}>{unit}</span>}
    </div>
  )
}

interface TabBarProps<T extends string> {
  label: string
  tabs: ReadonlyArray<{ id: T; label: string; icon?: ReactNode }>
  value: T
  onChange: (id: T) => void
  className?: string
}

/** Tabs with the keyboard behaviour of the platform: arrow keys move, Home and End jump. */
export function TabBar<T extends string>({ label, tabs, value, onChange, className }: TabBarProps<T>) {
  const base = useId()
  const row = useRef<HTMLDivElement>(null)
  // A row that scrolls sideways keeps the selected tab in view, however it was chosen. Only the row
  // moves: the page never scrolls because a tab was picked.
  useEffect(() => {
    const strip = row.current
    const tab = document.getElementById(`${base}-${value}`)
    if (!strip || !tab || strip.scrollWidth <= strip.clientWidth) return
    const from = tab.getBoundingClientRect().left - strip.getBoundingClientRect().left + strip.scrollLeft
    const to = from + tab.offsetWidth
    if (from < strip.scrollLeft) strip.scrollLeft = from
    else if (to > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = to - strip.clientWidth
  }, [base, value])
  const move = (index: number) => {
    const target = tabs[(index + tabs.length) % tabs.length]
    onChange(target.id)
    document.getElementById(`${base}-${target.id}`)?.focus()
  }
  return (
    <div ref={row} className={cx(styles.tabs, className)} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          id={`${base}-${tab.id}`}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          tabIndex={tab.id === value ? 0 : -1}
          className={styles.tab}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') move(index + 1)
            else if (event.key === 'ArrowLeft') move(index - 1)
            else if (event.key === 'Home') move(0)
            else if (event.key === 'End') move(tabs.length - 1)
            else return
            event.preventDefault()
          }}
        >
          {tab.icon && <span className={styles.tabIcon}>{tab.icon}</span>}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  )
}

interface SectionProps {
  title: string
  children: ReactNode
  /** Collapsible: a closed section is one line. */
  collapsible?: boolean
  defaultOpen?: boolean
  className?: string
  actions?: ReactNode
}

export function PanelSection({
  title,
  children,
  collapsible = false,
  defaultOpen = true,
  className,
  actions,
}: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <section className={cx(styles.section, className)} aria-labelledby={`${id}-t`}>
      <header className={styles.sectionHead}>
        {collapsible ? (
          <button
            type="button"
            className={styles.sectionToggle}
            aria-expanded={open}
            aria-controls={`${id}-b`}
            onClick={() => setOpen((value) => !value)}
          >
            <span id={`${id}-t`}>{title}</span>
            <span className={styles.chevron} aria-hidden="true" />
          </button>
        ) : (
          <h2 id={`${id}-t`} className={styles.sectionTitle}>
            {title}
          </h2>
        )}
        {actions}
      </header>
      <div id={`${id}-b`} className={styles.sectionBody} hidden={collapsible && !open}>
        {children}
      </div>
    </section>
  )
}

/** A line the visitor is told, politely, when something happens (saved, exported, an error). */
export function Toast({ message, tone = 'info' }: { message: string; tone?: 'info' | 'warning' | 'error' }) {
  return (
    <p className={cx(styles.toast, styles[tone])} role="status" aria-live="polite" hidden={!message}>
      {message}
    </p>
  )
}

export function Meter({
  label,
  value,
  max,
  text,
  tone,
}: {
  label: string
  value: number
  max: number
  text: string
  tone?: 'red' | 'blue'
}) {
  const fraction = Math.max(0, Math.min(1, value / max))
  return (
    <div className={styles.meter}>
      <span className={styles.meterLabel}>{label}</span>
      <span className={styles.meterBar} data-tone={tone}>
        <span style={{ width: `${fraction * 100}%` }} />
      </span>
      <span className={styles.meterValue}>{text}</span>
    </div>
  )
}

/** The icons the applications share, as plain strokes that take the text colour. */
export function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  )
}
