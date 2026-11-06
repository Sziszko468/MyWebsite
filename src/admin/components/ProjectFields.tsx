import type { ReactNode } from 'react'
import { LANGUAGES, type Language } from '../../i18n/config'
import { cx } from '../../utils/cx'
import type { LanguageReport, Tri } from '../api/projectTypes'
import { fill, useText } from '../i18n'
import { moveItem } from '../lib/projects'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { TextAreaField, TextField } from './form'
import { Icon } from './Icon'
import { useLanguageName } from './layout'

/**
 * The pieces the project editor is made of. Every text of a project is a `{ hu, en, nl }` object; the editor shows ONE
 * language at a time (the language bar), so a field is a single input whose value is that language's text, and a mark on the
 * bar says whether each language is whole.
 */

export function LanguageBar({ value, onChange, reports }: { value: Language; onChange: (language: Language) => void; reports: Record<Language, LanguageReport> }) {
  const t = useText()
  const name = useLanguageName()
  return (
    <div className={page.langBar} role="group" aria-label={t.projects.edit.languageBar}>
      <div className={page.langButtons}>
        {LANGUAGES.map((language) => {
          const state = reports[language].state
          return (
            <button key={language} type="button" className={cx(page.langButton, page[`lang_${state}`])} aria-pressed={value === language} onClick={() => onChange(language)}>
              <span className={page.langName}>{name(language)}</span>
              <span className={page.langState}>{t.projects.languageState[state]}</span>
              <span className={styles.srOnly}>{fill(t.projects.languageMark, { language: name(language), state: t.projects.languageState[state] })}</span>
            </button>
          )
        })}
      </div>
      <p className={cx(styles.hint, page.langHelp)}>{t.projects.edit.languageBarHelp}</p>
    </div>
  )
}

interface TriFieldProps {
  label: ReactNode
  /** Where the text lives in the document, e.g. `title` or `overview.what`: the server reports errors under `content.<path>.<language>`. */
  path: string
  value: Tri
  language: Language
  onChange: (value: Tri) => void
  errors: Record<string, string>
  max: number
  multiline?: boolean
  rows?: number
  hint?: ReactNode
  required?: boolean
  optional?: boolean
}

/** One text, in the language being edited; the other languages' texts are untouched. */
export function TriField({ label, path, value, language, onChange, errors, max, multiline = false, rows = 4, hint, required, optional }: TriFieldProps) {
  const t = useText()
  const error = errors[`content.${path}.${language}`] ?? null
  const missing = value[language] === '' && LANGUAGES.some((other) => other !== language && value[other] !== '')
  const note = missing ? fill(t.services.edit.languageMissing, { language: (t.languages as Record<string, string>)[language] }) : hint
  const set = (text: string) => onChange({ ...value, [language]: text })
  return multiline ? (
    <TextAreaField label={label} value={value[language]} onChange={(event) => set(event.target.value)} maxLength={max} rows={rows} error={error} hint={note} required={required} optional={optional} lang={language} />
  ) : (
    <TextField label={label} value={value[language]} onChange={(event) => set(event.target.value)} maxLength={max * 2} error={error} hint={note} required={required} optional={optional} lang={language} />
  )
}

/**
 * A list the administrator adds to, removes from and reorders: each item is a titled group of fields with its own move and
 * remove buttons (named with the item's number, so a screen reader knows which one). Nothing is kept in the list that was not
 * added: an empty list is an empty list. A list that is added to some other way (the gallery chooses a picture first) gives no
 * `create`, and then has no add button of its own.
 */
export function ItemList<T>({ items, onChange, render, create, max, addLabel, itemLabel }: { items: readonly T[]; onChange: (items: T[]) => void; render: (item: T, index: number, set: (item: T) => void) => ReactNode; create?: () => T; max: number; addLabel?: string; itemLabel: string }) {
  const t = useText()
  return (
    <div className={styles.stack}>
      {items.map((item, index) => (
        <fieldset key={index} className={cx(styles.fieldset, page.itemCard)}>
          <legend className={styles.legend}>
            {itemLabel} {index + 1}
          </legend>
          <div className={styles.stack}>{render(item, index, (next) => onChange(items.map((existing, at) => (at === index ? next : existing))))}</div>
          <div className={cx(styles.row, page.itemTools)}>
            <AdminButton variant="text" disabled={index === 0} onClick={() => onChange(moveItem(items, index, -1))} aria-label={fill(t.projects.actions.moveUp, { name: `${itemLabel} ${index + 1}` })}>
              <Icon name="up" />
            </AdminButton>
            <AdminButton variant="text" disabled={index === items.length - 1} onClick={() => onChange(moveItem(items, index, 1))} aria-label={fill(t.projects.actions.moveDown, { name: `${itemLabel} ${index + 1}` })}>
              <Icon name="down" />
            </AdminButton>
            <AdminButton variant="text" danger onClick={() => onChange(items.filter((_, at) => at !== index))} aria-label={`${t.common.delete}: ${itemLabel} ${index + 1}`}>
              <Icon name="trash" />
              {t.common.delete}
            </AdminButton>
          </div>
        </fieldset>
      ))}
      {create && addLabel && items.length < max && (
        <div>
          <AdminButton variant="secondary" onClick={() => onChange([...items, create()])}>
            <Icon name="plus" />
            {addLabel}
          </AdminButton>
        </div>
      )}
    </div>
  )
}
