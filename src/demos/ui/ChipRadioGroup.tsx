import { useId } from 'react'
import { cx } from '../../utils/cx'
import ui from './demoUi.module.scss'

export interface ChipOption {
  value: string
  label: string
  /** A taken or unavailable option: shown, struck through, and skipped by the keyboard. */
  disabled?: boolean
  /** Extra words for a screen reader, e.g. "taken". */
  extra?: string
}

interface ChipRadioGroupProps {
  legend: string
  value: string
  onChange: (value: string) => void
  options: readonly ChipOption[]
  hint?: string
  error?: string
  /** The legend names the group for assistive technology but is not drawn (a heading right above already says it). */
  hideLegend?: boolean
}

/**
 * One answer out of a handful, as chips. They are real radio buttons: the arrow keys move between them, the chosen one is filled, and an invalid group marks
 * itself (`data-invalid`) so a form can send focus to it. The error is a sentence under the group, never only a colour.
 */
export function ChipRadioGroup({ legend, value, onChange, options, hint, error, hideLegend = false }: ChipRadioGroupProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  return (
    <fieldset className={ui.fieldset} data-invalid={error ? 'true' : undefined} aria-describedby={[hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined}>
      <legend className={hideLegend ? 'visually-hidden' : ui.legend}>{legend}</legend>
      {hint && (
        <p id={hintId} className={ui.hint}>
          {hint}
        </p>
      )}
      <div className={ui.chips}>
        {options.map((option) => (
          <label key={option.value} className={cx(ui.chip, ui.radioChip)} data-selected={value === option.value} data-disabled={option.disabled ? 'true' : undefined}>
            <input
              className={ui.radioInput}
              type="radio"
              name={id}
              value={option.value}
              checked={value === option.value}
              disabled={option.disabled}
              onChange={() => onChange(option.value)}
            />
            {option.label}
            {option.extra && <span className="visually-hidden">, {option.extra}</span>}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className={ui.error}>
          <span aria-hidden="true">!</span>
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  )
}
