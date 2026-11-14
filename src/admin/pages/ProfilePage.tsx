import { useMemo, useState } from 'react'
import { LANGUAGES, type Language } from '../../i18n/config'
import * as endpoints from '../api/endpoints'
import { ApiError } from '../api/client'
import type { LanguageReport, ProfileData, ProfileDocument, Tri } from '../api/projectTypes'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { CheckField, TextAreaField, TextField } from '../components/form'
import { DetailPanel, PageHeader } from '../components/layout'
import { ItemList, LanguageBar, TriField } from '../components/ProjectFields'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { useText } from '../i18n'
import { describeError, fieldErrors } from '../lib/errors'
import { emptyTri, linesToList, sameDocument } from '../lib/projects'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

/**
 * The About page and the contact details (PROMPT 22): one document, edited in one language at a time, saved whole. The website shows its own
 * content until something is saved here; after that this document is what visitors read for these parts. Every text must exist in all three
 * languages before it can be saved (the website never shows another language in its place), and the server names the one that does not.
 */
export function ProfilePage() {
  const t = useText()
  const session = useSession()
  const data = useResource((signal) => endpoints.profile.get(signal), [])
  if (!session.can('content:write')) return <ErrorState error={new ApiError(403, 'forbidden', '')} level={1} />
  if (data.loading) return <LoadingState />
  if (data.error || !data.data) return <ErrorState error={data.error} onRetry={data.reload} level={1} />
  return <Editor key={data.data.updatedAt ?? 'own'} initial={data.data} onChanged={data.set} t={t} />
}

/** Every text of the document, to say per language whether it is whole. */
function reportsOf(profile: ProfileDocument): Record<Language, LanguageReport> {
  const texts: Tri[] = [profile.story.title, ...profile.story.paragraphs, profile.story.thought, ...profile.strengths.flatMap((item) => [item.name, item.text]), ...profile.skills.map((group) => group.label), ...profile.focus.flatMap((item) => [item.title, item.text])]
  const out = {} as Record<Language, LanguageReport>
  for (const code of LANGUAGES) {
    const filled = texts.filter((text) => text[code] !== '').length
    const missing = texts.filter((text) => text[code] === '' && LANGUAGES.some((other) => text[other] !== ''))
    out[code] = { state: filled === 0 ? 'missing' : missing.length === 0 ? 'complete' : 'incomplete', blocking: [], untranslated: missing.map(() => '') }
  }
  return out
}

function Editor({ initial, onChanged, t }: { initial: ProfileData; onChanged: (data: ProfileData) => void; t: ReturnType<typeof useText> }) {
  const toast = useToast()
  const confirm = useConfirm()
  const c = t.cms.profile
  const [saved, setSaved] = useState<ProfileDocument>(initial.profile)
  const [draft, setDraft] = useState<ProfileDocument>(initial.profile)
  const [editing, setEditing] = useState<Language>('hu')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const dirty = !sameDocument(draft, saved)
  useUnsavedChanges(dirty)
  const reports = useMemo(() => reportsOf(draft), [draft])
  // The shared text field reads its errors under `content.<path>`; the profile's server fields have no `content.` in front.
  const triErrors = useMemo(() => Object.fromEntries(Object.entries(errors).map(([key, value]) => [`content.${key}`, value])), [errors])
  const err = (field: string) => errors[field] ?? null
  const set = (next: ProfileDocument) => setDraft(next)
  const tri = (path: string, value: Tri, max: number, onChange: (value: Tri) => void, multiline = false) => ({ path, value, max, onChange, language: editing, errors: triErrors, multiline, rows: multiline ? 4 : undefined })

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      const data = await endpoints.profile.save(draft, initial.updatedAt)
      setSaved(data.profile)
      setDraft(data.profile)
      onChanged(data)
      toast.success(c.saved)
    } catch (error) {
      setErrors(fieldErrors(t, error))
      toast.error(error instanceof ApiError && error.status === 409 ? c.conflict : error instanceof ApiError && error.status === 422 ? c.failed : describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const reset = async () => {
    if (!(await confirm({ title: c.resetTitle, body: c.resetBody, confirmLabel: c.reset, danger: true }))) return
    setBusy(true)
    try {
      await endpoints.profile.reset()
      toast.success(c.resetDone)
      const fresh = await endpoints.profile.get()
      setSaved(fresh.profile)
      setDraft(fresh.profile)
      onChanged(fresh)
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader
        title={c.title}
        lead={c.lead}
        actions={
          <AdminButton variant="primary" onClick={() => void save()} loading={busy} loadingLabel={c.saving} disabled={!dirty}>
            {c.save}
          </AdminButton>
        }
      />
      <p className={`${styles.hint} ${page.saveState}`} role="status">
        {dirty ? c.unsaved : c.allSaved} · {initial.saved ? c.stateSaved : c.stateOwn}
      </p>
      <div className={styles.stackLg}>
        <LanguageBar value={editing} onChange={setEditing} reports={reports} />
        <p className={styles.hint}>{c.languageHelp}</p>

        <DetailPanel title={c.story.title}>
          <TriField label={c.story.heading} {...tri('story.title', draft.story.title, 160, (value) => set({ ...draft, story: { ...draft.story, title: value } }))} />
          <ItemList
            items={draft.story.paragraphs}
            onChange={(paragraphs) => set({ ...draft, story: { ...draft.story, paragraphs } })}
            max={8}
            create={emptyTri}
            addLabel={c.story.paragraph}
            itemLabel={c.story.paragraph}
            render={(paragraph, index, update) => <TriField label={c.story.paragraph} {...tri(`story.paragraphs.${index}`, paragraph, 1500, update, true)} />}
          />
          <TriField label={c.story.thought} {...tri('story.thought', draft.story.thought, 600, (value) => set({ ...draft, story: { ...draft.story, thought: value } }), true)} />
        </DetailPanel>

        <DetailPanel title={c.strengths.title}>
          <ItemList
            items={draft.strengths}
            onChange={(strengths) => set({ ...draft, strengths })}
            max={12}
            create={() => ({ id: '', name: emptyTri(), text: emptyTri() })}
            addLabel={c.strengths.item}
            itemLabel={c.strengths.item}
            render={(item, index, update) => (
              <>
                <TriField label={c.strengths.name} {...tri(`strengths.${index}.name`, item.name, 80, (value) => update({ ...item, name: value }))} />
                <TriField label={c.strengths.text} {...tri(`strengths.${index}.text`, item.text, 300, (value) => update({ ...item, text: value }), true)} />
              </>
            )}
          />
        </DetailPanel>

        <DetailPanel title={c.skills.title}>
          <p className={styles.hint}>{c.skills.help}</p>
          <ItemList
            items={draft.skills}
            onChange={(skills) => set({ ...draft, skills })}
            max={8}
            create={() => ({ id: '', label: emptyTri(), skills: [] })}
            addLabel={c.skills.group}
            itemLabel={c.skills.group}
            render={(group, index, update) => (
              <>
                <TriField label={c.skills.label} {...tri(`skills.${index}.label`, group.label, 60, (value) => update({ ...group, label: value }))} />
                <TextAreaField
                  label={c.skills.names}
                  value={group.skills.map((skill) => skill.name).join('\n')}
                  rows={4}
                  error={err(`skills.${index}.names`)}
                  onChange={(event) => update({ ...group, skills: linesToList(event.target.value).map((name) => group.skills.find((skill) => skill.name === name) ?? { name, level: null }) })}
                />
              </>
            )}
          />
        </DetailPanel>

        <DetailPanel title={c.focus.title}>
          <ItemList
            items={draft.focus}
            onChange={(focus) => set({ ...draft, focus })}
            max={12}
            create={() => ({ id: '', active: true, title: emptyTri(), text: emptyTri() })}
            addLabel={c.focus.item}
            itemLabel={c.focus.item}
            render={(item, index, update) => (
              <>
                <TriField label={c.focus.heading} {...tri(`focus.${index}.title`, item.title, 100, (value) => update({ ...item, title: value }))} />
                <TriField label={c.focus.text} {...tri(`focus.${index}.text`, item.text, 300, (value) => update({ ...item, text: value }), true)} />
                <CheckField label={c.focus.active} checked={item.active} onChange={(active) => update({ ...item, active })} />
              </>
            )}
          />
        </DetailPanel>

        <DetailPanel title={c.contact.title}>
          <TextField label={c.contact.email} hint={c.contact.emailHelp} type="email" value={draft.contact.email} onChange={(event) => set({ ...draft, contact: { ...draft.contact, email: event.target.value } })} error={err('contact.email')} optional maxLength={254} />
          <h3 className={styles.sectionTitle}>{c.contact.social}</h3>
          <p className={styles.hint}>{c.contact.socialHelp}</p>
          <ItemList
            items={draft.contact.social}
            onChange={(social) => set({ ...draft, contact: { ...draft.contact, social } })}
            max={6}
            create={() => ({ id: '', label: '', url: '' })}
            addLabel={c.contact.add}
            itemLabel={c.contact.item}
            render={(entry, index, update) => (
              <div className={styles.formGrid}>
                <TextField label={c.contact.label} value={entry.label} onChange={(event) => update({ ...entry, label: event.target.value })} error={err(`contact.social.${index}.label`)} maxLength={40} />
                <TextField label={c.contact.url} type="url" inputMode="url" placeholder="https://" value={entry.url} onChange={(event) => update({ ...entry, url: event.target.value })} error={err(`contact.social.${index}.url`)} />
              </div>
            )}
          />
        </DetailPanel>

        {initial.saved && (
          <div>
            <AdminButton variant="text" danger onClick={() => void reset()} disabled={busy}>
              {c.reset}
            </AdminButton>
          </div>
        )}
      </div>
    </>
  )
}
