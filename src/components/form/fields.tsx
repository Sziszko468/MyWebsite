import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cx } from '../../utils/cx'
import styles from './Form.module.scss'

/*
 * The form's building blocks. Each one owns the wiring that is easy to get wrong: the label is
 * tied to its control, the hint and the error are read with it (aria-describedby), an invalid
 * control says so (aria-invalid), and an error is a sentence with an icon, never only a colour.
 */

/** Where focus goes when a form is not acceptable: the first control that says it is invalid, in page order. */
export const FIRST_INVALID =
  'input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"], fieldset[data-invalid="true"] input'

const join = (...ids: Array<string | false | undefined>) => ids.filter(Boolean).join(' ') || undefined

function ErrorMessage({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className={styles.error}>
      <svg className={styles.errorIcon} viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.2v4.6M8 11.2v.1" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  )
}

function LabelText({ children, optionalText }: { children: ReactNode; optionalText?: string }) {
  return (
    <>
      {children}
      {optionalText && <span className={styles.optional}> ({optionalText})</span>}
    </>
  )
}

interface CommonProps {
  label: string
  /** The word for "optional" in the visitor's language; present only on an optional question. */
  optionalText?: string
  hint?: string
  error?: string
  className?: string
}

type TextFieldProps = CommonProps &
  (
    | ({ multiline?: false; counter?: undefined } & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>)
    | ({ multiline: true; counter?: string } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>)
  )

/** A one-line input, or (with `multiline`) a text area with an optional character counter. */
export function TextField(props: TextFieldProps) {
  const { label, optionalText, hint, error, className, multiline, counter, ...control } = props
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = join(hint && hintId, error && errorId)

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        <LabelText optionalText={optionalText}>{label}</LabelText>
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {multiline ? (
        <textarea
          {...(control as TextareaHTMLAttributes<HTMLTextAreaElement>)}
          id={id}
          className={styles.control}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      ) : (
        <input
          {...(control as InputHTMLAttributes<HTMLInputElement>)}
          id={id}
          className={styles.control}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      )}
      {counter && <p className={styles.counter}>{counter}</p>}
      {error && <ErrorMessage id={errorId}>{error}</ErrorMessage>}
    </div>
  )
}

interface SelectFieldProps extends CommonProps {
  value: string
  onChange: (value: string) => void
  /** The empty choice; picking it means "no answer". */
  placeholder: string
  options: ReadonlyArray<{ value: string; label: string }>
  name?: string
}

export function SelectField({ label, optionalText, hint, error, className, value, onChange, placeholder, options, name }: SelectFieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={id} className={styles.label}>
        <LabelText optionalText={optionalText}>{label}</LabelText>
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <select
        id={id}
        name={name}
        className={cx(styles.control, styles.select)}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={join(hint && hintId, error && errorId)}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <ErrorMessage id={errorId}>{error}</ErrorMessage>}
    </div>
  )
}

interface ChoiceGroupProps<V extends string> {
  legend: string
  optionalText?: string
  hint?: string
  error?: string
  value: V | null
  onChange: (value: V) => void
  /** `note` is a short line under the choice's name, to help decide. */
  options: ReadonlyArray<{ value: V; label: string; note?: string }>
  className?: string
}

/**
 * One answer out of a few, as large tappable choices. They are real radio buttons: the arrow keys
 * move between them, the chosen one is marked by a filled dot and a heavier frame, not by colour
 * alone, and the group has a name and an error of its own.
 */
export function ChoiceGroup<V extends string>({ legend, optionalText, hint, error, value, onChange, options, className }: ChoiceGroupProps<V>) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`

  return (
    <fieldset
      role="radiogroup"
      className={cx(styles.group, className)}
      aria-describedby={join(hint && hintId, error && errorId)}
      aria-invalid={error ? true : undefined}
      data-invalid={error ? 'true' : undefined}
    >
      <legend className={styles.label}>
        <LabelText optionalText={optionalText}>{legend}</LabelText>
      </legend>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <div className={styles.choices}>
        {options.map((option) => (
          <div key={option.value} className={styles.choice}>
            <input
              type="radio"
              id={`${id}-${option.value}`}
              name={id}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <label htmlFor={`${id}-${option.value}`} className={styles.chip}>
              <span className={styles.chipText}>
                <span>{option.label}</span>
                {option.note && <span className={styles.chipNote}>{option.note}</span>}
              </span>
            </label>
          </div>
        ))}
      </div>
      {error && <ErrorMessage id={errorId}>{error}</ErrorMessage>}
    </fieldset>
  )
}

interface CheckboxFieldProps {
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
  error?: string
  className?: string
}

export function CheckboxField({ label, checked, onChange, error, className }: CheckboxFieldProps) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className={cx(styles.field, className)}>
      <div className={styles.checkbox}>
        <input
          type="checkbox"
          id={id}
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={join(error && errorId)}
        />
        <label htmlFor={id}>{label}</label>
      </div>
      {error && <ErrorMessage id={errorId}>{error}</ErrorMessage>}
    </div>
  )
}
