import { useId, useState } from 'react'
import { LANGUAGES, type Language } from '../../i18n/config'
import type { Price } from '../api/types'
import { CURRENCIES, FAQ_LABELS, VAT_MODES, emptyValue, incompleteLanguages, type FieldSpec, type PriceForm, type TextValues } from '../lib/catalog'
import { fill, useText } from '../i18n'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import { SelectField, TextAreaField, TextField } from './form'
import { TabPanel, Tabs } from './layout'

/**
 * The texts of a record in all three languages, one tab each. A dot on a tab says a text is missing in that language
 * (empty while another language has it). Lists are one item per line. Errors from the server arrive keyed
 * `translations.<language>.<field>` and are shown on the field they belong to, on the tab they belong to.
 */
export function TextsEditor({ fields, values, onChange, errors, idBase, faq = false }: { fields: readonly FieldSpec[]; values: TextValues; onChange: (language: Language, name: string, value: string) => void; errors: Record<string, string>; idBase: string; faq?: boolean }) {
  const t = useText()
  const [active, setActive] = useState<Language>('hu')
  const incomplete = incompleteLanguages(fields, values)
  const label = (name: string) => (t.services.fields as Record<string, string>)[faq ? (FAQ_LABELS[name] ?? name) : name] ?? name
  const errorOn = (language: Language) => fields.some((field) => errors[`translations.${language}.${field.name}`])

  return (
    <div>
      <Tabs
        idBase={idBase}
        label={t.services.edit.texts}
        value={active}
        onChange={(id) => setActive(id as Language)}
        tabs={LANGUAGES.map((language) => ({
          id: language,
          label: (t.languages as Record<string, string>)[language],
          attention: incomplete.includes(language) || errorOn(language),
          attentionLabel: fill(t.services.edit.languageMissing, { language: (t.languages as Record<string, string>)[language] }),
        }))}
      />
      {LANGUAGES.map((language) => (
        <TabPanel key={language} id={language} idBase={idBase} active={active === language}>
          <div className={page.langPanel}>
            {fields.map((field) => {
              const error = errors[`translations.${language}.${field.name}`]
              const common = { label: label(field.name), error: error ? ((t.services.errors as Record<string, string>)[error] ?? error) : null, required: field.required, optional: !field.required, value: values[language][field.name] ?? '', maxLength: field.max }
              const missing = emptyValue(field, values[language]) && LANGUAGES.some((other) => other !== language && !emptyValue(field, values[other]))
              if (field.kind === 'line' && field.max <= 200) {
                return <TextField key={field.name} {...common} hint={missing ? fill(t.services.edit.languageMissing, { language: (t.languages as Record<string, string>)[language] }) : undefined} onChange={(event) => onChange(language, field.name, event.target.value)} />
              }
              return (
                <TextAreaField
                  key={field.name}
                  {...common}
                  rows={field.kind === 'list' ? 5 : field.kind === 'block' ? 5 : 3}
                  hint={field.kind === 'list' ? t.services.edit.listHelp : missing ? fill(t.services.edit.languageMissing, { language: (t.languages as Record<string, string>)[language] }) : undefined}
                  onChange={(event) => onChange(language, field.name, event.target.value)}
                />
              )
            })}
          </div>
        </TabPanel>
      ))}
    </div>
  )
}

/** How a record is priced. "From" shows the amount, currency and VAT; nothing else ever shows a figure. */
export function PriceEditor({ value, onChange, errors }: { value: PriceForm; onChange: (value: PriceForm) => void; errors: Record<string, string> }) {
  const t = useText()
  const id = useId()
  const e = t.services.edit
  const message = (key: string) => (errors[key] ? ((t.services.errors as Record<string, string>)[errors[key]] ?? errors[key]) : null)
  const kinds: Price['kind'][] = ['quote', 'tbd', 'from']
  return (
    <div className={styles.stack}>
      <div className={page.priceGrid}>
        <SelectField label={e.priceKind} value={value.kind} error={message('price')} onChange={(event) => onChange({ ...value, kind: event.target.value as Price['kind'] })} options={kinds.map((kind) => ({ value: kind, label: t.services.priceKinds[kind] }))} />
        {value.kind === 'from' && (
          <>
            <TextField label={e.amount} inputMode="numeric" value={value.amount} error={message('price.amount')} onChange={(event) => onChange({ ...value, amount: event.target.value })} required />
            <SelectField label={e.currency} value={value.currency} error={message('price.currency')} onChange={(event) => onChange({ ...value, currency: event.target.value as PriceForm['currency'] })} options={CURRENCIES.map((currency) => ({ value: currency, label: currency }))} />
            <SelectField label={e.vat} value={value.vat} error={message('vat')} onChange={(event) => onChange({ ...value, vat: event.target.value as PriceForm['vat'] })} options={VAT_MODES.map((mode) => ({ value: mode, label: e.vatModes[mode] }))} required />
          </>
        )}
      </div>
      <p className={styles.hint} id={`${id}-help`}>
        {e.priceHelp}
      </p>
    </div>
  )
}
