import { useState } from 'react'
import { Link } from 'react-router'
import { LANGUAGES, type Language } from '../../i18n/config'
import * as endpoints from '../api/endpoints'
import { ApiError } from '../api/client'
import type { MediaItem } from '../api/projectTypes'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { FilterDropdown, TextField } from '../components/form'
import { Icon } from '../components/Icon'
import { PageHeader, useLanguageName } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, useInterfaceLanguage, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { prepareImage } from '../lib/image'
import { shortSize, titleOf } from '../lib/projects'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

const MAX_LABEL = '6 MB'

/**
 * The picture library (PROMPT 22): every picture the website can use, where it is used, its description in each language, and the three things
 * that change it: upload a new one, replace one (everything that used it switches to the new picture; the old one stays until it is deleted) and
 * delete one nothing uses. The project editor's picture chooser reads the same library.
 */
export function MediaPage() {
  const t = useText()
  const c = t.cms.media
  const toast = useToast()
  const session = useSession()
  const library = useResource((signal) => endpoints.media.list(signal), [])
  const storage = useResource((signal) => endpoints.media.storage(signal), [])
  const [filter, setFilter] = useState<'all' | 'used' | 'unused'>('all')
  const [busy, setBusy] = useState(false)

  if (!session.can('content:write')) return <ErrorState error={new ApiError(403, 'forbidden', '')} level={1} />

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const prepared = await prepareImage(file)
      await endpoints.media.upload(prepared.blob, prepared.name)
      toast.success(fill(c.uploaded, { name: file.name }))
      library.reload()
    } catch (error) {
      toast.error(error instanceof ApiError && (error.status === 422 || error.status === 415) ? c.failed : describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const all = library.data ?? []
  const shown = all.filter((item) => (filter === 'used' ? (item.uses ?? 0) > 0 : filter === 'unused' ? (item.uses ?? 0) === 0 : true))
  const warning = storage.data?.warning ?? null

  return (
    <>
      <PageHeader title={c.title} lead={c.lead} />
      <div className={styles.stackLg}>
        <section className={styles.card} aria-labelledby="media-storage">
          <h2 id="media-storage" className={styles.cardTitleTight}>
            {c.storage.title}
          </h2>
          {storage.data && (
            <>
              <p className={`${styles.small} ${styles.muted}`}>
                {c.storage.folder}: <code className={styles.mono}>{storage.data.directory}</code> · {c.storage.files}: {storage.data.files}
              </p>
              <p className={warning ? styles.notice : styles.hint} role="status" data-testid="media-storage-state">
                {warning === 'application_filesystem' ? c.storage.application : warning === 'not_writable' ? c.storage.notWritable : c.storage.ok}
              </p>
            </>
          )}
        </section>

        <div className={styles.stack}>
          <label className={styles.label} htmlFor="media-upload">
            {c.upload}
          </label>
          <input
            id="media-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={busy}
            onChange={(event) => {
              void upload(event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <p className={styles.hint}>{fill(c.uploadHelp, { max: MAX_LABEL })}</p>
        </div>

        {all.length > 0 && <FilterDropdown label={c.filter} value={filter} onChange={(value) => setFilter(value as typeof filter)} options={[{ value: 'all', label: c.filters.all }, { value: 'used', label: c.filters.used }, { value: 'unused', label: c.filters.unused }]} />}

        {library.loading ? (
          <LoadingState />
        ) : library.error && !library.data ? (
          <ErrorState error={library.error} onRetry={library.reload} />
        ) : all.length === 0 ? (
          <EmptyState icon="layers" title={c.empty} />
        ) : shown.length === 0 ? (
          <EmptyState icon="search" title={c.noMatch} />
        ) : (
          <ul className={page.items}>
            {shown.map((item) => (
              <MediaCard key={`${item.id}-${JSON.stringify(item.alt)}`} item={item} onChanged={library.reload} />
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function MediaCard({ item, onChanged }: { item: MediaItem; onChanged: () => void }) {
  const t = useText()
  const c = t.cms.media
  const toast = useToast()
  const confirm = useConfirm()
  const session = useSession()
  const language = useInterfaceLanguage()
  const name = useLanguageName()
  const [alt, setAlt] = useState<Record<Language, string>>(item.alt)
  const [busy, setBusy] = useState(false)
  const uses = item.uses ?? 0
  const dirty = LANGUAGES.some((code) => alt[code] !== item.alt[code])

  const saveAlt = async () => {
    setBusy(true)
    try {
      await endpoints.media.updateAlt(item.id, alt)
      toast.success(c.descriptionSaved)
      onChanged()
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const replace = async (file: File | undefined) => {
    if (!file) return
    if (uses > 0 && !(await confirm({ title: c.replaceConfirmTitle, body: fill(c.replaceConfirmBody, { count: uses }), confirmLabel: c.replace }))) return
    setBusy(true)
    try {
      const prepared = await prepareImage(file)
      const result = await endpoints.media.replace(item.id, prepared.blob, prepared.name)
      toast.success(fill(c.replaced, { count: result.projects }))
      onChanged()
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 409 ? c.replaceSame : error instanceof ApiError && (error.status === 422 || error.status === 415) ? c.failed : describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!(await confirm({ title: c.deleteTitle, body: c.deleteBody, danger: true, confirmLabel: c.delete }))) return
    try {
      await endpoints.media.remove(item.id)
      toast.success(c.deleted)
      onChanged()
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 409 ? c.inUse : describeError(t, error))
    }
  }

  return (
    <li className={page.item} data-testid="media-card">
      <div className={styles.row}>
        <img src={item.src} width={item.width} height={item.height} alt="" loading="lazy" className={page.thumbImage} />
        <div className={styles.stack}>
          <span className={page.itemTitle}>{item.storage === 'public' ? c.shipped : (item.name ?? `#${item.id}`)}</span>
          <span className={`${styles.small} ${styles.muted}`}>{fill(c.size, { width: item.width, height: item.height, size: shortSize(item.bytes) })}</span>
          <span className={styles.small}>{uses > 0 ? fill(c.uses, { count: uses }) : c.unused}</span>
          {(item.usedBy ?? []).length > 0 && (
            <span className={styles.small}>
              {c.usedBy}:{' '}
              {(item.usedBy ?? []).map((project, index) => (
                <span key={project.id}>
                  {index > 0 && ', '}
                  <Link className={styles.linkTarget} to={`/projects/${project.id}`}>
                    {titleOf(project.title, language, project.slug)}
                  </Link>
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
      <p className={styles.hint}>{c.descriptionHelp}</p>
      {LANGUAGES.map((code) => (
        <TextField key={code} label={`${c.description} · ${fill(c.descriptionLanguage, { language: name(code) })}`} value={alt[code]} lang={code} maxLength={400} optional onChange={(event) => setAlt({ ...alt, [code]: event.target.value })} />
      ))}
      <div className={styles.row}>
        <AdminButton variant="secondary" onClick={() => void saveAlt()} disabled={!dirty || busy}>
          {c.saveDescription}
        </AdminButton>
        <label className={styles.label}>
          <span>{c.replace}</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={busy}
            aria-label={`${c.replace}: ${item.name ?? `#${item.id}`}`}
            onChange={(event) => {
              void replace(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </label>
        {item.storage === 'upload' && uses === 0 && session.can('content:delete') && (
          <AdminButton variant="text" danger onClick={() => void remove()} disabled={busy}>
            <Icon name="trash" />
            {c.delete}
          </AdminButton>
        )}
      </div>
      <p className={styles.hint}>{c.replaceHelp}</p>
    </li>
  )
}
