import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { artifacts, type Artifact } from '../../artifacts/artifactDb'
import { fill, useLabText, useLocalized } from '../../core/useLabText'
import { downloadBlob, downloadJson, safeFilename } from '../../experience/persist'
import { Toast } from '../../experience/ui'
import { composeObject } from './compose'
import { sanitizeCreation, type Creation } from './creation'
import { exportGlb } from './glb'
import { genText } from './genText'
import styles from './GenerativeObjects.module.scss'
import { forgetKeptModel, readKeptModel } from './keep'

const sizeOf = (bytes: number) => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

interface GalleryProps {
  /** Changes whenever something was saved, so the list is read again. */
  version: number
  onOpen(creation: Creation): void
}

/**
 * The gallery: every creation kept in this browser, with its picture, its words and its date, a larger
 * preview, and the ways to open, export or delete it. Everything that comes out of the store is checked
 * again, so a damaged entry shows up as damaged rather than breaking the page.
 */
export function Gallery({ version, onOpen }: GalleryProps) {
  const t = useLocalized(genText)
  const { lang } = useLabText()
  const [items, setItems] = useState<Artifact[] | null>(null)
  const [persistent, setPersistent] = useState(true)
  const [preview, setPreview] = useState<Artifact | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    const service = await artifacts()
    setPersistent(service.persistent)
    setItems((await service.list()).filter((item) => item.type === 'creation'))
  }, [])
  useEffect(() => {
    // The browser's database is an outside system; reading it once the panel is up is what an effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh, version])

  const date = (time: number) => new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(time))

  const remove = async (artifact: Artifact) => {
    setDeleting(null)
    setPreview(null)
    const creation = sanitizeCreation(artifact.payload)
    await (await artifacts()).remove(artifact.id)
    // The model file kept beside the work goes with it.
    await forgetKeptModel(creation)
    await refresh()
  }

  const open = (artifact: Artifact) => {
    const creation = sanitizeCreation(artifact.payload)
    if (!creation) return setMessage(t.gallery.damaged)
    setPreview(null)
    onOpen(creation)
  }

  const downloadPng = async (artifact: Artifact) => {
    if (!artifact.thumbnail) return
    downloadBlob(await (await fetch(artifact.thumbnail)).blob(), safeFilename(artifact.name, 'png'))
  }

  const downloadGlb = async (artifact: Artifact) => {
    const creation = sanitizeCreation(artifact.payload)
    if (!creation) return
    try {
      let buffer: ArrayBuffer
      if (creation.source === 'ai') {
        // The file exactly as the engine sent it, from this browser’s storage.
        const kept = await readKeptModel(creation)
        if (!kept) throw new Error('no-file')
        buffer = kept
      } else if (creation.spec) {
        const composed = composeObject(creation.spec, creation.seed)
        composed.applyLook(creation.look)
        try {
          buffer = await exportGlb(composed.root)
        } finally {
          composed.dispose()
        }
      } else {
        throw new Error('nothing-to-export')
      }
      downloadBlob(new Blob([buffer], { type: 'model/gltf-binary' }), safeFilename(artifact.name, 'glb'))
    } catch {
      setMessage(t.export.glbFailed)
    }
  }

  const card = (artifact: Artifact) => {
    const creation = sanitizeCreation(artifact.payload)
    const ai = creation?.source === 'ai' ? creation.ai : null
    const aiNote = !creation
      ? null
      : !ai
        ? t.gallery.quickKept
        : ai.model
          ? fill(t.gallery.aiKept, { stage: ai.stage === 'final' ? t.stage.stageFinal : t.stage.stageGeometry, provider: ai.provider, size: sizeOf(ai.bytes) })
          : t.gallery.aiNoFile
    return (
      <li key={artifact.id} className={styles.card}>
        <button type="button" className={styles.cardPicture} onClick={() => setPreview(artifact)} aria-label={`${t.gallery.preview}: ${artifact.name}`}>
          {artifact.thumbnail ? <img src={artifact.thumbnail} alt="" width={240} height={144} /> : <span aria-hidden="true">3D</span>}
        </button>
        <div className={styles.cardBody}>
          <h3 className={styles.cardTitle}>{artifact.name}</h3>
          <p className={styles.cardPrompt}>“{creation?.prompt ?? ''}”</p>
          <p className={styles.cardMeta}>{fill(t.gallery.created, { date: date(artifact.createdAt) })}</p>
          {aiNote && <p className={styles.cardMeta}>{aiNote}</p>}
          {deleting === artifact.id ? (
            <div className={styles.confirm} role="group" aria-label={t.gallery.confirm}>
              <span>{t.gallery.confirm}</span>
              <button type="button" className={styles.danger} onClick={() => void remove(artifact)}>
                {t.gallery.yes}
              </button>
              <button type="button" onClick={() => setDeleting(null)}>
                {t.gallery.no}
              </button>
            </div>
          ) : (
            <div className={styles.cardActions}>
              <button type="button" className={styles.primary} onClick={() => open(artifact)} disabled={!creation}>
                {t.gallery.open}
              </button>
              <button type="button" onClick={() => setPreview(artifact)}>
                {t.gallery.preview}
              </button>
              <button type="button" aria-label={`${t.gallery.exportJson}: ${artifact.name}`} onClick={() => downloadJson({ version: 1, type: artifact.type, name: artifact.name, payload: artifact.payload }, safeFilename(artifact.name, 'json'))}>
                {t.gallery.exportJson}
              </button>
              {artifact.thumbnail && (
                <button type="button" aria-label={`${t.gallery.exportPng}: ${artifact.name}`} onClick={() => void downloadPng(artifact)}>
                  {t.gallery.exportPng}
                </button>
              )}
              {creation && (
                <button type="button" aria-label={`${t.gallery.exportGlb}: ${artifact.name}`} onClick={() => void downloadGlb(artifact)}>
                  {t.gallery.exportGlb}
                </button>
              )}
              <button type="button" className={styles.danger} aria-label={`${t.gallery.remove}: ${artifact.name}`} onClick={() => setDeleting(artifact.id)}>
                {t.gallery.remove}
              </button>
            </div>
          )}
        </div>
      </li>
    )
  }

  return (
    <div className={styles.gallery}>
      {items === null ? (
        <p className={styles.note}>{t.gallery.loading}</p>
      ) : items.length === 0 ? (
        <p className={styles.note}>{t.gallery.empty}</p>
      ) : (
        <ul className={styles.cards} aria-label={t.gallery.title}>
          {items.map(card)}
        </ul>
      )}
      <p className={styles.note}>{persistent ? t.gallery.storage : t.gallery.memoryOnly}</p>
      <Toast message={message} />
      {preview && <PreviewDialog artifact={preview} onClose={() => setPreview(null)} onOpen={() => open(preview)} onDelete={() => void remove(preview)} date={date(preview.createdAt)} />}
    </div>
  )
}

function PreviewDialog({ artifact, onClose, onOpen, onDelete, date }: { artifact: Artifact; onClose(): void; onOpen(): void; onDelete(): void; date: string }) {
  const t = useLocalized(genText)
  const titleId = useId()
  const close = useRef<HTMLButtonElement>(null)
  const creation = sanitizeCreation(artifact.payload)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    close.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [onClose])

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} onClick={(event) => event.stopPropagation()}>
        <h3 id={titleId}>{artifact.name}</h3>
        {artifact.thumbnail ? <img className={styles.dialogPicture} src={artifact.thumbnail} alt="" /> : null}
        <p className={styles.dialogPrompt}>
          <strong>{t.gallery.prompt}</strong>
          <br />“{creation?.prompt ?? ''}”
        </p>
        <p className={styles.cardMeta}>{fill(t.gallery.created, { date })}</p>
        <div className={styles.cardActions}>
          <button type="button" className={styles.primary} onClick={onOpen} disabled={!creation}>
            {t.gallery.open}
          </button>
          <button type="button" className={styles.danger} onClick={onDelete}>
            {t.gallery.remove}
          </button>
          <button ref={close} type="button" onClick={onClose}>
            {t.gallery.close}
          </button>
        </div>
      </div>
    </div>
  )
}
