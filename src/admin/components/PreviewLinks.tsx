import { useState } from 'react'
import * as endpoints from '../api/endpoints'
import { ApiError } from '../api/client'
import type { PreviewLink } from '../api/projectTypes'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import { describeError } from '../lib/errors'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { useConfirm } from './Confirm'
import { TextField } from './form'
import { Icon } from './Icon'
import { ErrorState, LoadingState } from './states'
import { useToast } from './Toast'

/**
 * The preview links of one project (PROMPT 22). A link is made here, shown ONCE (the server keeps only its hash), copied to whoever should see the
 * draft, and withdrawn here. The address it opens is the website's own preview page; the list shows each link's state, when it ends and when it
 * was last opened, never the secret.
 */
export function PreviewLinks({ projectId, dirty }: { projectId: number; dirty: boolean }) {
  const t = useText()
  const c = t.cms.project.previewLinks
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const links = useResource((signal) => endpoints.projects.previewLinks(projectId, signal), [projectId])
  const [days, setDays] = useState('7')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [fresh, setFresh] = useState<{ url: string; expiresAt: string } | null>(null)

  const create = async () => {
    const count = Number(days)
    if (!Number.isInteger(count) || count < 1 || count > 30) return toast.error(c.days)
    setBusy(true)
    try {
      const made = await endpoints.projects.createPreviewLink(projectId, { days: count, label })
      setFresh({ url: `${window.location.origin}/${language}/work/preview/link/${made.token}`, expiresAt: made.expiresAt })
      setLabel('')
      links.reload()
      toast.success(c.created)
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 409 ? c.tooMany : describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (link: PreviewLink) => {
    if (!(await confirm({ title: c.revokeTitle, body: c.revokeBody, danger: true, confirmLabel: c.revoke }))) return
    try {
      await endpoints.projects.revokePreviewLink(projectId, link.id)
      links.reload()
      toast.success(c.revoked)
    } catch (error) {
      toast.error(describeError(t, error))
    }
  }

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(c.copied)
    } catch {
      toast.error(describeError(t, new ApiError(0, 'unreadable', '')))
    }
  }

  const date = (value: string) => formatDateTime(value, language)
  return (
    <div className={styles.stack}>
      <p className={styles.hint}>{c.lead}</p>
      {dirty && (
        <p className={styles.notice} role="status">
          <Icon name="info" />
          <span>{c.notSaved}</span>
        </p>
      )}
      <div className={styles.formGrid}>
        <TextField label={c.days} type="number" inputMode="numeric" min={1} max={30} value={days} onChange={(event) => setDays(event.target.value)} />
        <TextField label={c.label} value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} optional />
      </div>
      <div>
        <AdminButton variant="primary" onClick={() => void create()} loading={busy}>
          <Icon name="link" />
          {c.create}
        </AdminButton>
      </div>
      {fresh && (
        <div className={styles.notice} role="status">
          <Icon name="info" />
          <span>
            <strong>{c.created}</strong>
            <br />
            <code className={styles.mono} data-testid="preview-link-url">
              {fresh.url}
            </code>
            <br />
            <AdminButton variant="secondary" onClick={() => void copy(fresh.url)}>
              {c.copy}
            </AdminButton>
          </span>
        </div>
      )}
      {links.loading ? (
        <LoadingState />
      ) : links.error && !links.data ? (
        <ErrorState error={links.error} onRetry={links.reload} />
      ) : (links.data ?? []).length === 0 ? (
        <p className={styles.muted}>{c.none}</p>
      ) : (
        <ul className={page.items}>
          {(links.data ?? []).map((link) => (
            <li key={link.id} className={page.item}>
              <div className={styles.spread}>
                <span className={page.itemTitle}>{link.label || `#${link.id.slice(0, 8)}`}</span>
                <span className={styles.badge}>{c.state[link.state]}</span>
              </div>
              <span className={`${styles.muted} ${styles.small}`}>
                {fill(c.expires, { date: date(link.expiresAt) })} · {link.lastUsedAt ? fill(c.lastUsed, { date: date(link.lastUsedAt) }) : c.neverUsed}
              </span>
              {link.state === 'active' && (
                <div>
                  <AdminButton variant="text" danger onClick={() => void revoke(link)}>
                    {c.revoke}
                  </AdminButton>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
