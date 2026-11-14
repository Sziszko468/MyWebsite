import { useState } from 'react'
import { useSearchParams } from 'react-router'
import * as endpoints from '../api/endpoints'
import type { Quote } from '../api/types'
import { AdminButton } from '../components/AdminButton'
import { FilterDropdown, SearchInput, TextField } from '../components/form'
import { Icon } from '../components/Icon'
import { DashboardStatCard, PageHeader } from '../components/layout'
import { Pagination } from '../components/Pagination'
import { QuoteRequestList } from '../components/QuoteRequestList'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, formatNumber, statusLabel, useInterfaceLanguage, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { hasFilters, readListState, toListQuery, writeListState, type ListState } from '../lib/listState'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

/** The quote requests: the same list as the inquiries, with what each asked for, and the current list as a CSV. */
export const QUOTE_ORDERS = ['created_desc', 'created_asc', 'updated_desc', 'name_asc', 'name_desc', 'status_asc', 'priority_desc', 'priority_asc', 'type_asc', 'reference_desc'] as const

export function QuotesPage() {
  const t = useText()
  const language = useInterfaceLanguage()
  const toast = useToast()
  const session = useSession()
  const [params, setParams] = useSearchParams()
  const state = readListState(params)
  const [busyId, setBusyId] = useState<string | null>(null)
  const query = toListQuery(state)
  const list = useResource((signal) => endpoints.quotes.list(query, signal), [params.toString()])
  const overview = useResource((signal) => endpoints.quotes.overview(signal), [])

  const change = (patch: Partial<ListState>) => setParams(writeListState(params, patch), { replace: true })
  const statuses = session.meta.statuses.quote
  const q = t.quotation
  const number = (value: number) => formatNumber(value, language)

  const updateStatus = async (row: Quote, status: string) => {
    if (status === row.status) return
    setBusyId(row.id)
    try {
      await endpoints.quotes.update(row.id, { status })
      if (list.data) list.set({ ...list.data, rows: list.data.rows.map((item) => (item.id === row.id ? { ...item, status } : item)) })
      toast.success(fill(t.list.quickStatusSaved, { name: row.name, status: statusLabel(t, 'quote', status) }))
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusyId(null)
    }
  }

  const rows = list.data?.rows ?? []
  const pageInfo = list.data?.page
  const sortLabel = (value: string) => `${value.startsWith('priority') ? q.list.sortPriority : value.startsWith('type') ? q.list.sortType : q.list.sortReference}`

  return (
    <>
      <PageHeader
        title={t.quotes.title}
        lead={t.quotes.lead}
        actions={
          rows.length > 0 ? (
            <AdminButton href={endpoints.quotes.csvUrl(query)} download>
              <Icon name="download" />
              {t.quotes.exportCsv}
            </AdminButton>
          ) : undefined
        }
      />
      <div className={styles.stackLg}>
        {overview.data && (
          <section aria-label={q.overview.title} className={page.stats}>
            <DashboardStatCard compact label={q.overview.total} value={number(overview.data.open.total)} note={fill(t.dashboard.stats.inquiriesNote, { archived: overview.data.open.archived })} />
            <DashboardStatCard compact label={q.overview.new} value={number(overview.data.open.new)} to="/quotes?status=new" tone="accent" />
            <DashboardStatCard compact label={q.overview.underReview} value={number(overview.data.open.underReview)} to="/quotes?status=under_review" tone="info" />
            <DashboardStatCard compact label={q.overview.quotePreparation} value={number(overview.data.open.quotePreparation)} to="/quotes?status=quote_preparation" tone="info" />
            <DashboardStatCard compact label={q.overview.quoteSent} value={number(overview.data.open.quoteSent)} to="/quotes?status=quote_sent" tone="warning" />
            <DashboardStatCard compact label={q.overview.accepted} value={number(overview.data.open.accepted)} to="/quotes?status=accepted" tone="success" />
            <DashboardStatCard compact label={q.overview.declined} value={number(overview.data.open.declined)} to="/quotes?status=declined" />
            <DashboardStatCard compact label={q.overview.activeProjects} value={number(overview.data.open.activeProjects)} to="/quotes?status=in_progress" tone="info" />
            <DashboardStatCard compact label={q.overview.completed} value={number(overview.data.open.completed)} to="/quotes?status=completed" tone="success" />
          </section>
        )}
        <form className={styles.toolbar} role="search" aria-label={t.list.filters} onSubmit={(event) => event.preventDefault()}>
          <SearchInput className={styles.toolbarSearch} label={t.list.searchLabel} value={state.q} placeholder={t.quotes.searchPlaceholder} onSearch={(q) => change({ q })} />
          <FilterDropdown
            label={t.common.status}
            value={state.status}
            onChange={(status) => change({ status })}
            options={[{ value: '', label: t.list.statusAll }, ...statuses.map((value) => ({ value, label: statusLabel(t, 'quote', value) })), { value: 'archived', label: t.list.statusArchived }]}
          />
          <FilterDropdown label={q.list.type} value={state.type} onChange={(type) => change({ type })} options={[{ value: '', label: q.list.all }, ...session.meta.quoteMeta.types.map((value) => ({ value, label: (q.types as Record<string, string>)[value] ?? value }))]} />
          <FilterDropdown label={q.list.priority} value={state.priority} onChange={(priority) => change({ priority })} options={[{ value: '', label: q.list.all }, ...session.meta.quoteMeta.priorities.map((value) => ({ value, label: (q.priorities as Record<string, string>)[value] ?? value }))]} />
          <FilterDropdown label={q.list.source} value={state.source} onChange={(source) => change({ source })} options={[{ value: '', label: q.list.all }, ...session.meta.quoteMeta.sources.map((value) => ({ value, label: (q.sources as Record<string, string>)[value] ?? value }))]} />
          <FilterDropdown label={q.list.language} value={state.language} onChange={(language) => change({ language })} options={[{ value: '', label: q.list.all }, ...session.meta.languages.map((value) => ({ value, label: (t.languages as Record<string, string>)[value] ?? value }))]} />
          <TextField label={t.list.dateFrom} type="date" value={state.from} max={state.to || undefined} onChange={(event) => change({ from: event.target.value })} />
          <TextField label={t.list.dateTo} type="date" value={state.to} min={state.from || undefined} onChange={(event) => change({ to: event.target.value })} />
          <FilterDropdown label={t.common.sort} value={state.order} onChange={(order) => change({ order })} options={QUOTE_ORDERS.map((value) => ({ value, label: (t.list.sorts as Record<string, string>)[value] ?? sortLabel(value) }))} />
        </form>

        {list.loading ? (
          <LoadingState />
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : rows.length === 0 ? (
          hasFilters(state) ? (
            <EmptyState icon="search" title={t.common.emptyFiltered} action={<AdminButton onClick={() => setParams(new URLSearchParams(), { replace: true })}>{t.common.clearFilters}</AdminButton>} />
          ) : (
            <EmptyState icon="quote" title={t.quotes.emptyTitle}>
              {t.quotes.emptyBody}
            </EmptyState>
          )
        ) : (
          <>
            <QuoteRequestList rows={rows} moves={session.meta.quoteTransitions} canChange={session.can('requests:write')} busyId={busyId} onStatus={updateStatus} />
            {pageInfo && <Pagination page={pageInfo.page} pageSize={pageInfo.pageSize} total={pageInfo.total} onPage={(next) => change({ page: next })} />}
          </>
        )}
      </div>
    </>
  )
}
