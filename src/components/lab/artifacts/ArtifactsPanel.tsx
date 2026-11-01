import { useCallback, useEffect, useId, useState } from 'react'
import { useNavigate } from 'react-router'
import { experimentPath } from '../../../content/lab'
import { localizedPath } from '../../../i18n/paths'
import { useI18n } from '../../../i18n/useI18n'
import { Container } from '../../Container/Container'
import { Section } from '../../Section/Section'
import { fill, useLocalized } from '../core/useLabText'
import { downloadBlob, downloadJson, safeFilename } from '../experience/persist'
import { Toast } from '../experience/ui'
import { artifacts, storageUsage, type Artifact } from './artifactDb'
import { openArtifact } from './artifactActions'
import { artifactText } from './artifactText'
import styles from './ArtifactsPanel.module.scss'

/**
 * The saved works on the Lab's page: every work the visitor kept, with a picture, a name and its
 * actions (open it in its experience, rename it, download it as JSON or PNG, delete it). Everything
 * here lives in this browser.
 */
export function ArtifactsPanel() {
  const t = useLocalized(artifactText)
  const { lang } = useI18n()
  const navigate = useNavigate()
  const titleId = useId()
  const [items, setItems] = useState<Artifact[] | null>(null)
  const [persistent, setPersistent] = useState(true)
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null)
  const [message, setMessage] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const service = await artifacts()
    setPersistent(service.persistent)
    setItems(await service.list())
    setUsage(await storageUsage())
  }, [])
  useEffect(() => {
    // Read from the browser's database once the page is up: an external system, so this is what an effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
  }, [refresh])

  const open = async (artifact: Artifact) => {
    const target = await openArtifact(artifact)
    if (!target) return setMessage(t.openFailed)
    navigate(localizedPath(lang, experimentPath(target)))
  }

  const rename = async (artifact: Artifact, name: string) => {
    setRenaming(null)
    if (!name.trim() || name === artifact.name) return
    const service = await artifacts()
    if (await service.rename(artifact.id, name)) setMessage(t.renamed)
    await refresh()
  }

  const remove = async (artifact: Artifact) => {
    setDeleting(null)
    const service = await artifacts()
    if (await service.remove(artifact.id)) setMessage(t.deleted)
    await refresh()
  }

  const downloadPng = async (artifact: Artifact) => {
    if (!artifact.thumbnail) return
    const blob = await (await fetch(artifact.thumbnail)).blob()
    downloadBlob(blob, safeFilename(artifact.name, 'png'))
  }

  const date = (time: number) => new Intl.DateTimeFormat(lang, { dateStyle: 'medium' }).format(new Date(time))
  const mb = (bytes: number) => (bytes / 1_048_576).toFixed(bytes > 1_073_741_824 ? 0 : 1)

  return (
    <Section id="artifacts" labelledBy={titleId} className={styles.section}>
      <Container size="wide">
        <header className={styles.head}>
          <h2 id={titleId} className={styles.title}>
            {t.title}
          </h2>
          <p className={styles.intro}>{t.intro}</p>
        </header>

        <div className={styles.layout}>
          <div>
            {items === null ? (
              <p className={styles.note}>{t.loading}</p>
            ) : items.length === 0 ? (
              <p className={styles.empty}>{t.empty}</p>
            ) : (
              <ul className={styles.grid} aria-label={t.title}>
                {items.map((artifact) => (
                  <li key={artifact.id} className={styles.card} data-type={artifact.type}>
                    <div className={styles.thumb} aria-hidden="true">
                      {artifact.thumbnail ? (
                        <img src={artifact.thumbnail} alt="" width={240} height={160} />
                      ) : (
                        <span>{t.types[artifact.type]}</span>
                      )}
                    </div>
                    <div className={styles.body}>
                      <span className={styles.type}>{t.types[artifact.type]}</span>
                      {renaming === artifact.id ? (
                        <form
                          className={styles.rename}
                          onSubmit={(event) => {
                            event.preventDefault()
                            void rename(artifact, String(new FormData(event.currentTarget).get('name') ?? ''))
                          }}
                        >
                          <label className="visually-hidden" htmlFor={`${artifact.id}-name`}>
                            {t.renameLabel}
                          </label>
                          <input
                            id={`${artifact.id}-name`}
                            name="name"
                            defaultValue={artifact.name}
                            maxLength={60}
                            autoFocus
                          />
                          <button type="submit">{t.confirmRename}</button>
                        </form>
                      ) : (
                        <h3 className={styles.name}>{artifact.name}</h3>
                      )}
                      <p className={styles.date}>{date(artifact.updatedAt)}</p>
                      {deleting === artifact.id ? (
                        <div
                          className={styles.confirm}
                          role="group"
                          aria-label={fill(t.confirmRemove, { name: artifact.name })}
                        >
                          <p>{fill(t.confirmRemove, { name: artifact.name })}</p>
                          <button type="button" className={styles.danger} onClick={() => void remove(artifact)}>
                            {t.yes}
                          </button>
                          <button type="button" onClick={() => setDeleting(null)}>
                            {t.no}
                          </button>
                        </div>
                      ) : (
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.primary}
                            aria-label={fill(t.open, { name: artifact.name })}
                            onClick={() => void open(artifact)}
                          >
                            {t.openShort}
                          </button>
                          <button
                            type="button"
                            aria-label={fill(t.rename, { name: artifact.name })}
                            onClick={() => setRenaming(artifact.id)}
                          >
                            ✎
                          </button>
                          <button
                            type="button"
                            aria-label={fill(t.json, { name: artifact.name })}
                            onClick={() =>
                              downloadJson(
                                { version: 1, type: artifact.type, name: artifact.name, payload: artifact.payload },
                                safeFilename(artifact.name, 'json'),
                              )
                            }
                          >
                            JSON
                          </button>
                          {artifact.thumbnail && (
                            <button
                              type="button"
                              aria-label={fill(t.png, { name: artifact.name })}
                              onClick={() => void downloadPng(artifact)}
                            >
                              PNG
                            </button>
                          )}
                          <button
                            type="button"
                            className={styles.danger}
                            aria-label={fill(t.remove, { name: artifact.name })}
                            onClick={() => setDeleting(artifact.id)}
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.note}>
              {persistent ? t.persistent : t.notPersistent}
              {usage ? ` ${fill(t.storage, { used: mb(usage.used), quota: mb(usage.quota) })}` : ''}
            </p>
            <Toast message={message} />
          </div>
        </div>
      </Container>
    </Section>
  )
}
