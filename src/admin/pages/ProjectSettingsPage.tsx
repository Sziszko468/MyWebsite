import { useState } from 'react'
import { LANGUAGES } from '../../i18n/config'
import * as endpoints from '../api/endpoints'
import { ApiError } from '../api/client'
import type { Category } from '../api/projectTypes'
import { AdminButton } from '../components/AdminButton'
import { SwitchField, TextField } from '../components/form'
import { Icon } from '../components/Icon'
import { DetailPanel, PageHeader, useLanguageName } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { fill, useInterfaceLanguage, useText } from '../i18n'
import { describeError, fieldErrors } from '../lib/errors'
import { emptyTri, sameDocument } from '../lib/projects'
import { useSession } from '../session/SessionProvider'
import styles from '../styles/ui.module.scss'

interface Settings {
  categories: Category[]
  requireAllLanguages: boolean
}

/** The categories the Work page filters by, and the rule for publishing a project that is not complete in every language. */
export function ProjectSettingsPage() {
  const session = useSession()
  const resource = useResource((signal) => endpoints.projects.settings(signal), [])
  if (!session.can('content:write')) return <ErrorState error={new ApiError(403, 'forbidden', '')} level={1} />
  if (resource.loading || !resource.data) return resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} level={1} /> : <LoadingState />
  return <SettingsForm initial={resource.data} />
}

function SettingsForm({ initial }: { initial: Settings }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const name = useLanguageName()
  const toast = useToast()
  const [saved, setSaved] = useState<Settings>(initial)
  const [draft, setDraft] = useState<Settings>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  useUnsavedChanges(!sameDocument(draft, saved))

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      const next = await endpoints.projects.saveSettings(draft)
      setSaved(next)
      setDraft(next)
      toast.success(t.projects.settingsPage.saved)
    } catch (error) {
      setErrors(fieldErrors(t, error))
      toast.error(error instanceof ApiError && error.status === 409 ? t.projects.settingsPage.categoriesHelp : describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const change = (index: number, patch: Partial<Category>) => setDraft({ ...draft, categories: draft.categories.map((category, at) => (at === index ? { ...category, ...patch } : category)) })

  return (
    <>
      <PageHeader title={t.projects.settingsPage.title} lead={t.projects.settingsPage.lead} back={{ to: '/projects', label: t.projects.settingsPage.back }} actions={<AdminButton variant="primary" onClick={() => void save()} loading={busy} loadingLabel={t.projects.edit.saving}>{t.common.save}</AdminButton>} />
      <div className={styles.stackLg}>
        <DetailPanel title={t.projects.settingsPage.categories}>
          <p className={styles.hint}>{t.projects.settingsPage.categoriesHelp}</p>
          {draft.categories.map((category, index) => (
            <fieldset key={index} className={styles.fieldset}>
              <legend className={styles.legend}>{category.label[language] || category.label.hu || category.key || `#${index + 1}`}</legend>
              <div className={styles.formGrid}>
                <TextField label={t.projects.settingsPage.key} value={category.key} onChange={(event) => change(index, { key: event.target.value.toLowerCase() })} error={errors[`categories.${index}.key`] ?? null} maxLength={40} required />
                {LANGUAGES.map((code) => (
                  <TextField key={code} label={fill(t.projects.settingsPage.label, { language: name(code) })} value={category.label[code]} onChange={(event) => change(index, { label: { ...category.label, [code]: event.target.value } })} error={errors[`categories.${index}.label.${code}`] ?? null} maxLength={60} required lang={code} />
                ))}
              </div>
              <AdminButton variant="text" danger onClick={() => setDraft({ ...draft, categories: draft.categories.filter((_, at) => at !== index) })} aria-label={fill(t.projects.settingsPage.remove, { name: category.label[language] || category.key })}>
                <Icon name="trash" />
                {t.common.delete}
              </AdminButton>
            </fieldset>
          ))}
          {draft.categories.length < 12 && (
            <div>
              <AdminButton variant="secondary" onClick={() => setDraft({ ...draft, categories: [...draft.categories, { key: '', label: emptyTri() }] })}>
                <Icon name="plus" />
                {t.projects.settingsPage.add}
              </AdminButton>
            </div>
          )}
        </DetailPanel>
        <DetailPanel title={t.projects.settingsPage.requireAll}>
          <SwitchField label={t.projects.settingsPage.requireAll} hint={t.projects.settingsPage.requireAllHelp} checked={draft.requireAllLanguages} onChange={(checked) => setDraft({ ...draft, requireAllLanguages: checked })} />
        </DetailPanel>
      </div>
    </>
  )
}
