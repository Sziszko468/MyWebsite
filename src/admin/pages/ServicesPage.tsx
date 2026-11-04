import { useState } from 'react'
import { useSearchParams } from 'react-router'
import * as endpoints from '../api/endpoints'
import { ApiError } from '../api/client'
import type { Orderable, Price } from '../api/types'
import { AdminButton } from '../components/AdminButton'
import { CatalogTable, type CatalogRow } from '../components/CatalogTable'
import { useConfirm } from '../components/Confirm'
import { Icon } from '../components/Icon'
import { PageHeader, TabPanel, Tabs } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, formatNumber, useInterfaceLanguage, useText } from '../i18n'
import type { AdminText } from '../i18n/en'
import { describeError } from '../lib/errors'
import { extraBody, moved, packageBody, serviceBody } from '../lib/catalog'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

type Tab = 'services' | 'packages' | 'extras'
const TABS: readonly Tab[] = ['services', 'packages', 'extras']

function priceLabel(t: AdminText, price: Price, language: 'hu' | 'en'): string {
  return price.kind === 'from' ? fill(t.quotes.detail.priceFrom, { amount: formatNumber(price.amount, language), currency: price.currency }) : price.kind === 'tbd' ? t.quotes.detail.priceTbd : t.quotes.detail.priceQuote
}

/**
 * The services, the packages and the add-ons the website offers: switch one on or off, put them in the order the website
 * lists them, open one to edit its texts and price, create a new one, delete one nothing refers to. Every change is
 * saved when it is made and the list is read again from the server, so what is shown is what is stored.
 */
export function ServicesPage() {
  const t = useText()
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const session = useSession()
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab')
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'services'
  const [busy, setBusy] = useState(false)

  const services = useResource(() => endpoints.catalog.services().then((answer) => answer.data), [])
  const packages = useResource(() => endpoints.catalog.packages().then((answer) => answer.data), [])
  const extras = useResource(() => endpoints.catalog.extras().then((answer) => answer.data), [])

  const canWrite = session.can('catalog:write')
  const canDelete = session.can('catalog:delete')
  const current = tab === 'services' ? services : tab === 'packages' ? packages : extras

  const rows: CatalogRow[] =
    tab === 'services'
      ? (services.data ?? []).map((record) => ({ key: record.slug, title: record.translations.hu?.title ?? record.slug, detail: `${record.slug} · ${record.category}`, active: record.status === 'active', editTo: `/services/service/${record.slug}` }))
      : tab === 'packages'
        ? (packages.data ?? []).map((record) => ({ key: record.code, title: record.translations.hu?.name ?? record.code, detail: record.code, price: priceLabel(t, record.price, language), active: record.status === 'active', editTo: `/services/package/${record.code}` }))
        : (extras.data ?? []).map((record) => ({ key: record.code, title: record.translations.hu?.name ?? record.code, detail: record.code, price: priceLabel(t, record.price, language), active: record.status === 'active', editTo: `/services/extra/${record.code}` }))

  const run = async (work: () => Promise<unknown>, done: string) => {
    setBusy(true)
    try {
      await work()
      current.reload()
      toast.success(done)
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const toggle = (row: CatalogRow, active: boolean) => {
    const status = active ? 'active' : 'disabled'
    const state = active ? t.common.active : t.common.disabled
    void run(() => {
      if (tab === 'services') return endpoints.catalog.updateService(row.key, serviceBody(services.data!.find((record) => record.slug === row.key)!, { status }))
      if (tab === 'packages') return endpoints.catalog.updatePackage(row.key, packageBody(packages.data!.find((record) => record.code === row.key)!, { status }))
      return endpoints.catalog.updateExtra(row.key, extraBody(extras.data!.find((record) => record.code === row.key)!, { status }))
    }, fill(t.services.toggled, { name: row.title, state }))
  }

  const move = (index: number, direction: -1 | 1) => {
    const keys = moved(rows, index, direction).map((row) => row.key)
    void run(() => endpoints.catalog.reorder(tab satisfies Orderable, keys), t.services.reordered)
  }

  const remove = async (row: CatalogRow) => {
    const yes = await confirm({ title: fill(t.services.deleteTitle, { name: row.title }), body: t.services.deleteBody, danger: true })
    if (!yes) return
    setBusy(true)
    try {
      if (tab === 'services') await endpoints.catalog.deleteService(row.key)
      else if (tab === 'packages') await endpoints.catalog.deletePackage(row.key)
      else await endpoints.catalog.deleteExtra(row.key)
      current.reload()
      toast.success(fill(t.services.deleted, { name: row.title }))
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 409 ? t.services.inUse : describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const newPath = tab === 'services' ? '/services/new/service' : tab === 'packages' ? '/services/new/package' : '/services/new/extra'

  return (
    <>
      <PageHeader
        title={t.services.title}
        lead={t.services.lead}
        actions={
          canWrite ? (
            <AdminButton to={newPath} variant="primary">
              <Icon name="plus" />
              {t.services.new[tab]}
            </AdminButton>
          ) : undefined
        }
      />
      <div className={styles.stackLg}>
        <p className={styles.notice}>
          <Icon name="info" />
          <span>{t.services.note}</span>
        </p>
        <div>
          <Tabs idBase="services" label={t.services.title} value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} tabs={TABS.map((id) => ({ id, label: t.services.tabs[id] }))} />
          {TABS.map((id) => (
            <TabPanel key={id} id={id} idBase="services" active={tab === id}>
              <div className={page.tabPanelGap}>
                {current.loading ? (
                  <LoadingState />
                ) : current.error && !current.data ? (
                  <ErrorState error={current.error} onRetry={current.reload} />
                ) : rows.length === 0 ? (
                  <EmptyState icon="layers" title={t.services.emptyTitle}>
                    {t.services.emptyBody}
                  </EmptyState>
                ) : (
                  <CatalogTable rows={rows} caption={t.services.tabs[id]} showPrice={id !== 'services'} busy={busy || current.refreshing} canWrite={canWrite} canDelete={canDelete} onToggle={toggle} onMove={move} onDelete={(row) => void remove(row)} />
                )}
              </div>
            </TabPanel>
          ))}
        </div>
      </div>
    </>
  )
}
