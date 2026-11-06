import { useMemo, useState } from 'react'
import { LANGUAGES, type Language } from '../../i18n/config'
import * as endpoints from '../api/endpoints'
import { ApiError } from '../api/client'
import type { TextKey } from '../api/projectTypes'
import { AdminButton } from '../components/AdminButton'
import { CheckField, FilterDropdown, SearchInput, TextAreaField } from '../components/form'
import { PageHeader, useLanguageName } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, useText } from '../i18n'
import { describeError, fieldErrors } from '../lib/errors'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

const SHOWN = 40

/**
 * The website's own wording that may be changed without touching code: the home page, the shop's buttons, the configurator's
 * questions and answers. Each text shows the wording the website ships in the three languages and a field per language for
 * the administrator's own; an empty field brings the original back. A text that has `{placeholders}` must keep them. Only
 * wording that already exists can be changed: nothing is added or removed here.
 */
export function TextsPage() {
  const t = useText()
  const session = useSession()
  const list = useResource((signal) => endpoints.texts.list(signal), [])
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const [changedOnly, setChangedOnly] = useState(false)
  const [limit, setLimit] = useState(SHOWN)

  const keys = useMemo(() => list.data ?? [], [list.data])
  const groups = useMemo(() => [...new Set(keys.map((item) => item.group))], [keys])
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return keys.filter((item) => {
      if (group && item.group !== group) return false
      if (changedOnly && !LANGUAGES.some((language) => item.values[language] !== '')) return false
      if (!needle) return true
      return [item.key, item.label, ...LANGUAGES.map((language) => item.default[language]), ...LANGUAGES.map((language) => item.values[language])].some((text) => text.toLowerCase().includes(needle))
    })
  }, [keys, query, group, changedOnly])

  if (!session.can('content:write')) return <ErrorState error={new ApiError(403, 'forbidden', '')} level={1} />

  return (
    <>
      <PageHeader title={t.texts.title} lead={t.texts.lead} />
      <div className={styles.stackLg}>
        <p className={styles.notice}>{t.texts.note}</p>
        <div className={styles.toolbar}>
          <SearchInput label={t.texts.search} value={query} onSearch={(value) => { setQuery(value); setLimit(SHOWN) }} className={styles.toolbarSearch} />
          <FilterDropdown label={t.texts.group} value={group} onChange={(value) => { setGroup(value); setLimit(SHOWN) }} options={[{ value: '', label: t.texts.allGroups }, ...groups.map((value) => ({ value, label: value }))]} />
          <CheckField label={t.texts.changedOnly} checked={changedOnly} onChange={(checked) => { setChangedOnly(checked); setLimit(SHOWN) }} />
        </div>
        {list.loading ? (
          <LoadingState />
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : filtered.length === 0 ? (
          <EmptyState icon="search">{t.texts.empty}</EmptyState>
        ) : (
          <>
            <p className={styles.muted} role="status">
              {fill(t.texts.count, { count: filtered.length })}
            </p>
            <ul className={page.textList}>
              {filtered.slice(0, limit).map((item) => (
                <TextRow key={item.key} item={item} onSaved={list.reload} />
              ))}
            </ul>
            {filtered.length > limit && (
              <div>
                <AdminButton variant="secondary" onClick={() => setLimit(limit + SHOWN)}>
                  {t.common.all} ({filtered.length - limit})
                </AdminButton>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

function TextRow({ item, onSaved }: { item: TextKey; onSaved: () => void }) {
  const t = useText()
  const toast = useToast()
  const name = useLanguageName()
  const [values, setValues] = useState<Record<Language, string>>({ hu: item.values.hu, en: item.values.en, nl: item.values.nl })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const changed = LANGUAGES.some((language) => values[language] !== item.values[language])
  const overridden = LANGUAGES.some((language) => item.values[language] !== '')

  const save = async (next: Record<Language, string>) => {
    setBusy(true)
    setErrors({})
    try {
      const saved = await endpoints.texts.save(item.key, next)
      setValues({ hu: saved.values.hu, en: saved.values.en, nl: saved.values.nl })
      toast.success(t.texts.saved)
      onSaved()
    } catch (error) {
      setErrors(fieldErrors(t, error))
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className={styles.card}>
      <details>
        <summary className={page.textSummary}>
          <span className={styles.cellTitle}>{item.label}</span>
          {overridden && <span className={`${styles.badge} ${styles.toneAccent}`}>{t.texts.changed}</span>}
          <span className={styles.muted}>{item.default.en || item.default.hu}</span>
        </summary>
        <div className={styles.stack}>
          {(item.placeholders ?? []).length > 0 && <p className={styles.hint}>{fill(t.texts.placeholders, { names: (item.placeholders ?? []).join(' ') })}</p>}
          {LANGUAGES.map((language) => (
            <TextAreaField
              key={language}
              label={fill(t.texts.override, { language: name(language) })}
              hint={`${t.texts.default}: ${item.default[language]}`}
              value={values[language]}
              onChange={(event) => setValues({ ...values, [language]: event.target.value })}
              maxLength={600}
              rows={2}
              optional
              lang={language}
              error={errors[`values.${language}`] ?? null}
            />
          ))}
          <div className={styles.row}>
            <AdminButton variant="primary" disabled={!changed} loading={busy} onClick={() => void save(values)}>
              {t.texts.save}
            </AdminButton>
            {overridden && (
              <AdminButton variant="text" disabled={busy} onClick={() => void save({ hu: '', en: '', nl: '' })}>
                {t.texts.reset}
              </AdminButton>
            )}
          </div>
        </div>
      </details>
    </li>
  )
}
