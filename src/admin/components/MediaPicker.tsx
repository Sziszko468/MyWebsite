import { useEffect, useId, useRef, useState } from 'react'
import * as endpoints from '../api/endpoints'
import { ApiError } from '../api/client'
import type { MediaItem } from '../api/projectTypes'
import { useResource } from '../hooks/useResource'
import { fill, useText } from '../i18n'
import { prepareImage } from '../lib/image'
import { shortSize } from '../lib/projects'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { useConfirm } from './Confirm'
import { Icon } from './Icon'
import { ErrorState, LoadingState } from './states'
import { useToast } from './Toast'
import { describeError } from '../lib/errors'

/** The largest upload the server takes by default (MEDIA_MAX_BYTES), as the form says it. */
const MAX_LABEL = '6 MB'

/**
 * Chooses a picture for a project: from the library (uploaded pictures and the ones that ship with the website) or from a new
 * file. A new file is made smaller in the browser first when it is large (lib/image.ts), then sent; the library is read again so
 * what is shown is what is stored. It is the browser's own modal dialog, so focus stays inside it and Escape closes it.
 */
export function MediaPicker({ open, onClose, onChoose }: { open: boolean; onClose: () => void; onChoose: (item: MediaItem) => void }) {
  const t = useText()
  const toast = useToast()
  const confirm = useConfirm()
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const library = useResource((signal) => endpoints.media.list(signal), [open])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    const element = dialog.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setFailure(null)
    try {
      const prepared = await prepareImage(file)
      const item = await endpoints.media.upload(prepared.blob, prepared.name)
      if (prepared.resized) toast.info(fill(t.projects.picker.optimized, { name: file.name, before: shortSize(prepared.before), after: shortSize(prepared.after) }))
      else toast.success(fill(t.projects.picker.uploaded, { name: file.name }))
      library.reload()
      onChoose(item)
    } catch (error) {
      setFailure(error instanceof ApiError && (error.status === 422 || error.status === 415) ? t.projects.picker.failed : describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (item: MediaItem) => {
    const yes = await confirm({ title: t.projects.picker.deleteTitle, body: t.projects.picker.deleteBody, danger: true })
    if (!yes) return
    try {
      await endpoints.media.remove(item.id)
      library.reload()
      toast.success(t.projects.picker.deleted)
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 409 ? t.projects.picker.inUse : describeError(t, error))
    }
  }

  return (
    <dialog ref={dialog} className={`${styles.dialog} ${page.pickerDialog}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }}>
      {open && (
        <div className={page.pickerBody}>
          <div className={styles.spread}>
            <h2 id={titleId} className={styles.dialogTitle}>
              {t.projects.picker.title}
            </h2>
            <AdminButton variant="text" onClick={onClose}>
              <Icon name="x" />
              {t.projects.picker.close}
            </AdminButton>
          </div>

          <div className={styles.stack}>
            <label className={styles.label} htmlFor={`${titleId}-file`}>
              {t.projects.picker.upload}
            </label>
            <input id={`${titleId}-file`} type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }} aria-describedby={`${titleId}-help`} />
            <p id={`${titleId}-help`} className={styles.hint}>
              {busy ? t.projects.picker.uploading : fill(t.projects.picker.uploadHelp, { max: MAX_LABEL })}
            </p>
            {failure && (
              <p className={styles.error} role="alert">
                {failure}
              </p>
            )}
          </div>

          <h3 className={styles.sectionTitle}>{t.projects.picker.library}</h3>
          {library.loading ? (
            <LoadingState />
          ) : library.error && !library.data ? (
            <ErrorState error={library.error} onRetry={library.reload} />
          ) : (library.data ?? []).length === 0 ? (
            <p className={styles.muted}>{t.projects.picker.empty}</p>
          ) : (
            <ul className={page.pickerGrid}>
              {(library.data ?? []).map((item) => (
                <li key={item.id} className={page.pickerItem}>
                  <img src={item.src} width={item.width} height={item.height} alt="" loading="lazy" className={page.pickerImage} />
                  <p className={styles.small}>
                    {item.storage === 'public' ? t.projects.picker.shipped : (item.name ?? `#${item.id}`)}
                    <br />
                    <span className={styles.muted}>{fill(t.projects.edit.images.size, { width: item.width, height: item.height, size: shortSize(item.bytes) })}</span>
                    {(item.uses ?? 0) > 0 && (
                      <>
                        <br />
                        <span className={styles.muted}>{fill(t.projects.picker.uses, { count: item.uses ?? 0 })}</span>
                      </>
                    )}
                  </p>
                  <div className={styles.row}>
                    <AdminButton variant="primary" onClick={() => onChoose(item)}>
                      {t.projects.picker.choose}
                    </AdminButton>
                    {item.storage === 'upload' && (
                      <AdminButton variant="text" danger onClick={() => void remove(item)} aria-label={t.projects.picker.delete}>
                        <Icon name="trash" />
                      </AdminButton>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </dialog>
  )
}
