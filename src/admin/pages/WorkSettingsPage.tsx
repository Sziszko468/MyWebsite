import { useState } from 'react'
import { ApiError } from '../api/client'
import { communications, type CommunicationSettings } from '../api/communications'
import { deliverables, type DeliverableSettings } from '../api/deliverables'
import { work, type Category, type Language, type WorkSettings } from '../api/work'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { SwitchField, TextField } from '../components/form'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import w from '../styles/work.module.scss'

/**
 * The categories a task can carry and the choices about what the work e-mails. Both are the administrator's (the server refuses an editor). A category in use is
 * switched off, never deleted; nothing is e-mailed that was not switched on.
 */

const LANGUAGES: readonly Language[] = ['hu', 'en', 'nl']
const COMMUNICATION_CHOICES = ['customerCanStart', 'replies', 'announcements', 'important', 'resolution', 'messageToOwner', 'resolutionRequested'] as const
const DELIVERABLE_CHOICES = ['ready', 'newVersion', 'approvalRequested', 'reply', 'feedback', 'changesRequested', 'approved'] as const
const CHOICES = ['actionAssigned', 'actionDueSoon', 'actionOverdue', 'responseSubmitted', 'responseReviewed', 'changesRequested', 'milestoneCompleted', 'statusChanged'] as const

function CategoryCard({ category, busy, onSave, onRemove }: { category: Category; busy: string | null; onSave: (names: Record<Language, string>, enabled: boolean) => void; onRemove: () => void }) {
  const t = useText().work.settings
  const [names, setNames] = useState<Record<Language, string>>(category.names)
  const [enabled, setEnabled] = useState(category.enabled)
  return (
    <li className={w.categoryRow}>
      <p className={styles.rowTight}>
        <strong className={styles.mono}>{category.code}</strong>
        <span className={w.hint}>{fill(t.used, { count: category.used })}</span>
      </p>
      <form
        className={styles.stack}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          onSave(names, enabled)
        }}
      >
        <div className={styles.formGrid}>
          {LANGUAGES.map((language) => (
            <TextField key={language} label={fill(t.nameIn, { language: t.languages[language] })} value={names[language]} maxLength={60} onChange={(event) => setNames({ ...names, [language]: event.target.value })} />
          ))}
        </div>
        <SwitchField label={t.enabled} checked={enabled} onChange={setEnabled} />
        {category.used > 0 && <p className={w.hint}>{t.inUse}</p>}
        <div className={styles.formActions}>
          <AdminButton type="submit" loading={busy === `save-${category.id}`}>
            {t.save}
          </AdminButton>
          <AdminButton variant="text" danger disabled={category.used > 0} onClick={onRemove}>
            {t.remove}
          </AdminButton>
        </div>
      </form>
    </li>
  )
}

export function WorkSettingsPage() {
  const text = useText()
  const t = text.work
  const s = t.settings
  const toast = useToast()
  const confirm = useConfirm()
  const categories = useResource((signal) => work.categories(signal), [])
  const settings = useResource((signal) => work.settings(signal), [])
  const deliverableSettings = useResource((signal) => deliverables.settings(signal), [])
  const communicationSettings = useResource((signal) => communications.settings(signal), [])
  const [busy, setBusy] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [fresh, setFresh] = useState<{ code: string; names: Record<Language, string> }>({ code: '', names: { hu: '', en: '', nl: '' } })
  const [days, setDays] = useState<string | null>(null)

  async function run<T>(name: string, job: () => Promise<T>, done: string | null, after?: () => void): Promise<T | null> {
    setBusy(name)
    setErrors({})
    try {
      const result = await job()
      if (done) toast.success(done)
      after?.()
      categories.reload()
      settings.reload()
      deliverableSettings.reload()
      communicationSettings.reload()
      return result
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) setErrors(Object.fromEntries(Object.entries(error.fields).map(([field, code]) => [field, code === 'duplicate' ? s.duplicate : code === 'required' ? s.required : s.invalid])))
      else if (error instanceof ApiError && error.details.reason === 'category_in_use') toast.error(s.inUse)
      else toast.error(error instanceof ApiError ? error.message : String(error))
      return null
    } finally {
      setBusy(null)
    }
  }

  if (categories.loading || settings.loading || deliverableSettings.loading || communicationSettings.loading) return <LoadingState />
  if (categories.error && !categories.data) return <ErrorState error={categories.error} onRetry={categories.reload} />
  if (settings.error && !settings.data) return <ErrorState error={settings.error} onRetry={settings.reload} />
  if (deliverableSettings.error && !deliverableSettings.data) return <ErrorState error={deliverableSettings.error} onRetry={deliverableSettings.reload} />
  if (communicationSettings.error && !communicationSettings.data) return <ErrorState error={communicationSettings.error} onRetry={communicationSettings.reload} />
  const list = categories.data ?? []
  const current = settings.data as WorkSettings

  const deliverableChoices = deliverableSettings.data as DeliverableSettings
  const communicationChoices = communicationSettings.data as CommunicationSettings
  const toggleCommunication = (key: (typeof COMMUNICATION_CHOICES)[number], value: boolean) => void run(`cchoice-${key}`, () => communications.saveSettings({ [key]: value }), text.communications.settings.saved)
  const toggleDeliverable = (key: (typeof DELIVERABLE_CHOICES)[number], value: boolean) => void run(`dchoice-${key}`, () => deliverables.saveSettings({ [key]: value }), text.deliverables.settings.saved)
  const toggle = (key: (typeof CHOICES)[number], value: boolean) => void run(`choice-${key}`, () => work.saveSettings({ [key]: value }), s.saved)

  return (
    <>
      <PageHeader title={s.title} lead={s.lead} back={{ to: '/clients', label: text.clients.title }} />
      <div className={styles.stackLg}>
        <DetailPanel title={s.notifications}>
          <p className={styles.muted}>{s.notificationsNote}</p>
          <div className={styles.stack}>
            {CHOICES.map((key) => (
              <SwitchField key={key} label={s.choices[key]} hint={key === 'actionOverdue' ? s.overdueHint : undefined} checked={current[key]} disabled={busy === `choice-${key}`} onChange={(value) => toggle(key, value)} />
            ))}
            <form
              className={styles.stack}
              noValidate
              onSubmit={(event) => {
                event.preventDefault()
                const value = Number(days ?? current.dueSoonDays)
                void run('days', () => work.saveSettings({ dueSoonDays: value }), s.saved, () => setDays(null))
              }}
            >
              <TextField label={s.dueSoonDays} hint={s.dueSoonHint} type="number" min={1} max={30} step={1} value={days ?? String(current.dueSoonDays)} error={errors.dueSoonDays} onChange={(event) => setDays(event.target.value)} />
              <div className={styles.formActions}>
                <AdminButton type="submit" loading={busy === 'days'}>
                  {s.save}
                </AdminButton>
              </div>
            </form>
          </div>
        </DetailPanel>

        <DetailPanel title={text.deliverables.settings.title}>
          <p className={styles.muted}>{text.deliverables.settings.lead}</p>
          <div className={styles.stack}>
            {DELIVERABLE_CHOICES.map((key) => (
              <SwitchField key={key} label={text.deliverables.settings.choices[key]} checked={deliverableChoices[key]} disabled={busy === `dchoice-${key}`} onChange={(value) => toggleDeliverable(key, value)} />
            ))}
          </div>
        </DetailPanel>

        <DetailPanel title={text.communications.settings.title}>
          <p className={styles.muted}>{text.communications.settings.lead}</p>
          <div className={styles.stack}>
            {COMMUNICATION_CHOICES.map((key) => (
              <SwitchField key={key} label={text.communications.settings.choices[key]} checked={communicationChoices[key]} disabled={busy === `cchoice-${key}`} onChange={(value) => toggleCommunication(key, value)} />
            ))}
          </div>
          <p className={styles.muted}>{text.communications.settings.note}</p>
        </DetailPanel>

        <DetailPanel title={s.categories}>
          <p className={styles.muted}>{s.categoriesNote}</p>
          {list.length === 0 ? (
            <p>{s.noCategories}</p>
          ) : (
            <ul className={w.cards}>
              {list.map((category) => (
                <CategoryCard
                  key={`${category.id}-${category.enabled}-${Object.values(category.names).join('|')}`}
                  category={category}
                  busy={busy}
                  onSave={(names, enabled) =>
                    void run(`save-${category.id}`, async () => {
                      await work.editCategory(category.id, { names })
                      return work.editCategory(category.id, { enabled })
                    }, s.saved)
                  }
                  onRemove={async () => {
                    if (await confirm({ title: s.removeTitle, body: s.removeBody, confirmLabel: s.remove, danger: true })) void run(`remove-${category.id}`, () => work.removeCategory(category.id), s.saved)
                  }}
                />
              ))}
            </ul>
          )}
          <div className={styles.formActions}>
            <AdminButton
              onClick={() =>
                void run('suggested', () => work.suggestCategories(), null).then((result) => {
                  if (result) toast.success(result.added > 0 ? fill(s.suggestedDone, { count: result.added }) : s.suggestedNone)
                })
              }
              loading={busy === 'suggested'}
            >
              {s.suggested}
            </AdminButton>
          </div>
          <form
            className={styles.stack}
            noValidate
            onSubmit={(event) => {
              event.preventDefault()
              void run('add', () => work.addCategory({ code: fresh.code.trim(), names: { hu: fresh.names.hu.trim(), en: fresh.names.en.trim(), nl: fresh.names.nl.trim() } }), s.added, () => setFresh({ code: '', names: { hu: '', en: '', nl: '' } }))
            }}
          >
            <TextField label={s.code} hint={s.codeHint} value={fresh.code} maxLength={40} error={errors.code} onChange={(event) => setFresh({ ...fresh, code: event.target.value })} />
            <div className={styles.formGrid}>
              {LANGUAGES.map((language) => (
                <TextField key={language} label={fill(s.nameIn, { language: s.languages[language] })} value={fresh.names[language]} maxLength={60} error={errors[`names.${language}`]} onChange={(event) => setFresh({ ...fresh, names: { ...fresh.names, [language]: event.target.value } })} />
              ))}
            </div>
            <div className={styles.formActions}>
              <AdminButton type="submit" variant="primary" loading={busy === 'add'}>
                {s.add}
              </AdminButton>
            </div>
          </form>
        </DetailPanel>
      </div>
    </>
  )
}
