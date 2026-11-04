import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { LANGUAGES, type Language } from '../../i18n/config'
import { ApiError } from '../api/client'
import * as endpoints from '../api/endpoints'
import type { TranslationGroup, TranslationItem, TranslationField, TranslationValue } from '../api/types'
import { AdminButton } from '../components/AdminButton'
import { CheckField, FilterDropdown, TextAreaField, TextField } from '../components/form'
import { PageHeader } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { StatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { linesOf } from '../lib/catalog'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import { cx } from '../../utils/cx'

const asText = (value: TranslationValue | undefined): string => (Array.isArray(value) ? value.join('\n') : (value ?? ''))
const GROUP_EDIT_PATH: Record<TranslationGroup, (key: string) => string> = {
  services: (key) => `/services/service/${key}`,
  packages: (key) => `/services/package/${key}`,
  extras: (key) => `/services/extra/${key}`,
  faq: (key) => `/content/faq/${key}`,
}

/** One record, one language: every text of it, with the other languages beside it for reference, and one save for what changed. */
function TranslationCard({ group, item, language, onSaved }: { group: TranslationGroup; item: TranslationItem; language: Language; onSaved: (item: TranslationItem) => void }) {
  const t = useText()
  const toast = useToast()
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(item.fields.map((field) => [field.name, asText(field.values[language])])))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const languageName = (code: string) => (t.languages as Record<string, string>)[code] ?? code
  const label = (field: TranslationField) => (t.services.fields as Record<string, string>)[field.name] ?? field.name

  const saved = Object.fromEntries(item.fields.map((field) => [field.name, asText(field.values[language])]))
  const changed = item.fields.filter((field) => draft[field.name] !== saved[field.name])
  const missing = item.missing[language]

  const save = async () => {
    setBusy(true)
    setErrors({})
    const fields = Object.fromEntries(changed.map((field) => [field.name, field.kind === 'list' ? linesOf(draft[field.name]) : draft[field.name]]))
    try {
      const { data } = await endpoints.translations.save(group, item.key, language, fields)
      onSaved(data)
      toast.success(t.translations.saved)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrors(Object.fromEntries(Object.entries(error.fields).map(([key, code]) => [key.replace(/^fields\./, ''), (t.services.errors as Record<string, string>)[code] ?? code])))
        toast.error(fill(t.translations.notSaved, { message: t.services.edit.fixErrors }))
      } else {
        toast.error(describeError(t, error))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <details className={styles.card} open={missing > 0 || undefined}>
      <summary className={page.translationSummary}>
        <span className={styles.cellTitle}>{item.label}</span>
        <span className={cx(styles.muted, styles.small, styles.mono)}> {item.key}</span>
        <span className={styles.rowTight}>
          <StatusBadge kind="availability" status={item.status} />
          <span className={cx(styles.badge, missing > 0 ? styles.toneWarning : styles.toneSuccess)}>{missing > 0 ? fill(t.translations.fieldsMissing, { count: missing }) : t.translations.complete}</span>
        </span>
      </summary>
      <div className={page.translationItem}>
        {item.fields.map((field) => {
          const others = LANGUAGES.filter((other) => other !== language && asText(field.values[other]).trim() !== '')
          const isMissing = field.missing.includes(language)
          const common = { label: label(field), value: draft[field.name], error: errors[field.name] ?? null, hint: isMissing ? fill(t.translations.missingIn, { language: languageName(language) }) : undefined, maxLength: field.max, required: field.required, optional: !field.required }
          return (
            <div key={field.name} className={page.translationField}>
              {field.kind === 'line' && field.max <= 200 ? (
                <TextField {...common} onChange={(event) => setDraft({ ...draft, [field.name]: event.target.value })} />
              ) : (
                <TextAreaField {...common} rows={field.kind === 'list' ? 4 : 3} hint={field.kind === 'list' ? t.services.edit.listHelp : common.hint} onChange={(event) => setDraft({ ...draft, [field.name]: event.target.value })} />
              )}
              {others.length > 0 && (
                <div className={page.reference}>
                  <span className={styles.srOnly}>{t.translations.reference}</span>
                  {others.map((other) => (
                    <span key={other} className={page.referenceLine}>
                      <strong>{languageName(other)}</strong>
                      {asText(field.values[other])}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div className={styles.formActions}>
          <AdminButton variant="primary" onClick={() => void save()} loading={busy} loadingLabel={t.translations.savingRecord} disabled={changed.length === 0}>
            {t.translations.saveRecord}
          </AdminButton>
          <AdminButton to={GROUP_EDIT_PATH[group](item.key)} variant="text">
            {t.translations.openEditor}
          </AdminButton>
        </div>
      </div>
    </details>
  )
}

/**
 * The texts of the catalogue side by side in three languages: which are missing, in which language, and the way to fill
 * them in. Nothing is translated or published automatically; a text is what was typed and saved here.
 */
export function TranslationsPage() {
  const t = useText()
  const [params, setParams] = useSearchParams()
  const requested = params.get('lang')
  const language: Language = (LANGUAGES as readonly string[]).includes(requested ?? '') ? (requested as Language) : 'nl'
  const groupParam = params.get('group') ?? ''
  const group = (['services', 'packages', 'extras', 'faq'] as const).find((id) => id === groupParam) ?? ''
  const onlyMissing = params.get('missing') === '1'
  const languageName = (code: string) => (t.languages as Record<string, string>)[code] ?? code

  const resource = useResource((signal) => endpoints.translations.overview({ group, lang: language, missing: onlyMissing }, signal).then((answer) => answer.data), [group, language, onlyMissing])
  const data = resource.data

  const change = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  const saved = (groupId: TranslationGroup, item: TranslationItem) => {
    if (data) resource.set({ ...data, groups: data.groups.map((entry) => (entry.id === groupId ? { ...entry, items: entry.items.map((candidate) => (candidate.key === item.key ? item : candidate)) } : entry)) })
    resource.reload()
  }

  return (
    <>
      <PageHeader title={t.translations.title} lead={t.translations.lead} />
      <div className={styles.stackLg}>
        <div className={styles.toolbar}>
          <FilterDropdown label={t.translations.editing} value={language} onChange={(value) => change({ lang: value })} options={LANGUAGES.map((code) => ({ value: code, label: languageName(code) }))} />
          <FilterDropdown label={t.translations.group} value={group} onChange={(value) => change({ group: value })} options={[{ value: '', label: t.common.all }, ...(['services', 'packages', 'extras', 'faq'] as const).map((id) => ({ value: id, label: t.translations.groups[id] }))]} />
          <div className={styles.span2}>
            <CheckField label={t.translations.onlyMissing} checked={onlyMissing} onChange={(on) => change({ missing: on ? '1' : null })} />
          </div>
        </div>

        {data && (
          <ul className={page.summaryChips} aria-label={t.translations.title}>
            {LANGUAGES.map((code) => {
              const entry = data.summary[code]
              return (
                <li key={code} className={cx(styles.badge, entry.fields > 0 ? styles.toneWarning : styles.toneSuccess)}>
                  {languageName(code)}: {entry.fields > 0 ? fill(t.translations.summary, { fields: entry.fields, records: entry.records }) : t.translations.summaryNone}
                </li>
              )
            })}
          </ul>
        )}

        {resource.loading ? (
          <LoadingState />
        ) : resource.error && !data ? (
          <ErrorState error={resource.error} onRetry={resource.reload} />
        ) : data && data.groups.every((entry) => entry.items.length === 0) ? (
          <EmptyState icon="globe" title={onlyMissing ? t.translations.nothingMissing : t.translations.emptyTitle}>
            {onlyMissing ? undefined : t.translations.emptyBody}
          </EmptyState>
        ) : (
          data?.groups
            .filter((entry) => entry.items.length > 0)
            .map((entry) => (
              <section key={entry.id} className={styles.stack} aria-labelledby={`group-${entry.id}`}>
                <div>
                  <h2 id={`group-${entry.id}`} className={styles.sectionTitle}>
                    {t.translations.groups[entry.id]}
                  </h2>
                  <p className={styles.hint}>{entry.reachesWebsite ? t.translations.reaches : t.translations.apiOnly}</p>
                </div>
                {entry.items.map((item) => (
                  <TranslationCard key={`${entry.id}-${item.key}-${language}`} group={entry.id} item={item} language={language} onSaved={(next) => saved(entry.id, next)} />
                ))}
              </section>
            ))
        )}
      </div>
    </>
  )
}
