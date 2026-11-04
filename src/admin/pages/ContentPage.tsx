import { useState } from 'react'
import * as endpoints from '../api/endpoints'
import { AdminButton } from '../components/AdminButton'
import { CatalogTable, type CatalogRow } from '../components/CatalogTable'
import { useConfirm } from '../components/Confirm'
import { Icon } from '../components/Icon'
import { DetailPanel, PageHeader } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { faqBody, moved } from '../lib/catalog'
import { useSession } from '../session/SessionProvider'
import styles from '../styles/ui.module.scss'

/**
 * The website's own content that is worth editing here: its questions and answers. The home page, About, the project pages
 * and the interface texts are kept in the website's source files (the screen says so), because moving them into a database
 * would give the same words a second home and solve nothing.
 */
export function ContentPage() {
  const t = useText()
  const toast = useToast()
  const confirm = useConfirm()
  const session = useSession()
  const [busy, setBusy] = useState(false)
  const list = useResource(() => endpoints.catalog.faq().then((answer) => answer.data), [])
  const canWrite = session.can('content:write')

  const rows: CatalogRow[] = (list.data ?? []).map((record) => ({ key: record.slug, title: record.translations.hu?.title || record.slug, detail: record.slug, active: record.status === 'active', editTo: `/content/faq/${record.slug}` }))

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await work()
      list.reload()
      toast.success(done)
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (row: CatalogRow, active: boolean) =>
    void run(() => endpoints.catalog.updateFaq(row.key, faqBody(list.data!.find((record) => record.slug === row.key)!, { status: active ? 'active' : 'disabled' })), fill(t.services.toggled, { name: row.title, state: active ? t.common.active : t.common.disabled }))

  const move = (index: number, direction: -1 | 1) =>
    void run(
      () =>
        endpoints.catalog.reorder(
          'faq',
          moved(rows, index, direction).map((row) => row.key),
        ),
      t.services.reordered,
    )

  const remove = async (row: CatalogRow) => {
    const yes = await confirm({ title: t.content.deleteTitle, body: t.content.deleteBody, danger: true })
    if (yes) await run(() => endpoints.catalog.deleteFaq(row.key), t.content.deleted)
  }

  return (
    <>
      <PageHeader
        title={t.content.title}
        lead={t.content.lead}
        actions={
          canWrite ? (
            <AdminButton to="/content/new" variant="primary">
              <Icon name="plus" />
              {t.content.newFaq}
            </AdminButton>
          ) : undefined
        }
      />
      <div className={styles.stackLg}>
        <DetailPanel title={t.content.faq}>
          <p className={styles.hint}>{t.content.reaches}</p>
          {list.loading ? (
            <LoadingState />
          ) : list.error && !list.data ? (
            <ErrorState error={list.error} onRetry={list.reload} />
          ) : rows.length === 0 ? (
            <EmptyState icon="edit" title={t.content.emptyTitle}>
              {t.content.emptyBody}
            </EmptyState>
          ) : (
            <CatalogTable rows={rows} caption={t.content.faq} showPrice={false} busy={busy || list.refreshing} canWrite={canWrite} canDelete={session.can('content:delete')} onToggle={toggle} onMove={move} onDelete={(row) => void remove(row)} />
          )}
        </DetailPanel>
        <DetailPanel title={t.content.sourceTitle}>
          <p className={styles.prose}>{t.content.sourceBody}</p>
        </DetailPanel>
      </div>
    </>
  )
}
