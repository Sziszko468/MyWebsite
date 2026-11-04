import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client'
import * as endpoints from '../api/endpoints'
import type { ContentRecord } from '../api/types'
import { AdminButton } from '../components/AdminButton'
import { TextsEditor } from '../components/CatalogForm'
import { SwitchField, TextField } from '../components/form'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { useText } from '../i18n'
import { describeError } from '../lib/errors'
import { FAQ_FIELDS, fromForm, toForm, type TextValues } from '../lib/catalog'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import type { Language } from '../../i18n/config'

/** One question and its answer, in all three languages. */
export function FaqEditPage() {
  const { slug } = useParams()
  const creating = slug === undefined
  const entry = useResource((signal) => (creating ? Promise.resolve(null) : endpoints.catalog.faqEntry(slug, signal).then((answer) => answer.data)), [slug])
  const all = useResource(() => (creating ? endpoints.catalog.faq().then((answer) => answer.data) : Promise.resolve([] as ContentRecord[])), [creating])
  if ((creating ? false : entry.loading) || all.loading) return <LoadingState />
  const error = entry.error ?? all.error
  if (error) return <ErrorState level={1} error={error} onRetry={() => { entry.reload(); all.reload() }} />
  return <FaqForm key={slug ?? 'new'} record={creating ? null : entry.data} position={all.data?.length ?? 0} />
}

function FaqForm({ record, position }: { record: ContentRecord | null; position: number }) {
  const t = useText()
  const toast = useToast()
  const navigate = useNavigate()
  const e = t.services.edit
  const [slug, setSlug] = useState(record?.slug ?? '')
  const [active, setActive] = useState((record?.status ?? 'active') === 'active')
  const [texts, setTexts] = useState<TextValues>(() => toForm(FAQ_FIELDS, record?.translations ?? {}))
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const back = '/content'

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    const body = { status: active ? 'active' : 'disabled', position: record?.position ?? position, translations: fromForm(FAQ_FIELDS, texts) }
    try {
      if (record) await endpoints.catalog.updateFaq(record.slug, body)
      else await endpoints.catalog.createFaq({ slug: slug.trim(), ...body })
      toast.success(record ? e.saved : e.created)
      void navigate(back)
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        setErrors(error.fields)
        toast.error(e.fixErrors)
      } else if (error instanceof ApiError && error.status === 409 && !record) {
        setErrors({ slug: 'duplicate' })
        toast.error(t.states.conflict)
      } else {
        toast.error(describeError(t, error))
      }
      setBusy(false)
    }
  }

  const slugError = errors.slug ? ((t.services.errors as Record<string, string>)[errors.slug] ?? errors.slug) : null

  return (
    <>
      <PageHeader title={record ? record.translations.hu?.title || record.slug : t.content.edit.new} back={{ to: back, label: t.content.edit.back }} />
      <form className={page.editor} onSubmit={(event) => void submit(event)} noValidate>
        <DetailPanel title={e.identity}>
          <div className={styles.stack}>
            {record === null ? <TextField label={t.content.edit.slug} hint={t.content.edit.slugHelp} value={slug} onChange={(event) => setSlug(event.target.value)} error={slugError} required autoCapitalize="none" spellCheck={false} /> : <TextField label={t.content.edit.slug} value={record.slug} readOnly />}
            <SwitchField label={active ? t.common.active : t.common.disabled} checked={active} onChange={setActive} hint={e.statusHelp} />
          </div>
        </DetailPanel>
        <DetailPanel title={e.texts}>
          <p className={styles.hint}>{e.textsHelp}</p>
          <TextsEditor faq fields={FAQ_FIELDS} values={texts} errors={errors} idBase="faq-texts" onChange={(language: Language, name, value) => setTexts({ ...texts, [language]: { ...texts[language], [name]: value } })} />
        </DetailPanel>
        <div className={styles.formActions}>
          <AdminButton type="submit" variant="primary" loading={busy} loadingLabel={t.common.saving}>
            {record ? e.save : e.create}
          </AdminButton>
          <AdminButton to={back} variant="text">
            {t.common.cancel}
          </AdminButton>
        </div>
      </form>
    </>
  )
}
