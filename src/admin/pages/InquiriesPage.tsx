import { useState } from 'react'
import { useSearchParams } from 'react-router'
import * as endpoints from '../api/endpoints'
import type { Inquiry } from '../api/types'
import { AdminButton } from '../components/AdminButton'
import { FilterDropdown, SearchInput, TextField } from '../components/form'
import { InquiryList } from '../components/InquiryList'
import { PageHeader } from '../components/layout'
import { Pagination } from '../components/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, statusLabel, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { hasFilters, readListState, toListQuery, writeListState, type ListState } from '../lib/listState'
import { useSession } from '../session/SessionProvider'
import styles from '../styles/ui.module.scss'

export const ORDERS = ['created_desc', 'created_asc', 'updated_desc', 'name_asc', 'name_desc', 'status_asc'] as const

/** The inquiries: search, status, type, dates and sort, all in the address; a quick status change on every row. */
export function InquiriesPage() {
  const t = useText()
  const toast = useToast()
  const session = useSession()
  const [params, setParams] = useSearchParams()
  const state = readListState(params)
  const [busyId, setBusyId] = useState<string | null>(null)
  const list = useResource((signal) => endpoints.inquiries.list(toListQuery(state), signal), [params.toString()])

  const change = (patch: Partial<ListState>) => setParams(writeListState(params, patch), { replace: true })
  const orders = ORDERS.map((value) => ({ value, label: (t.list.sorts as Record<string, string>)[value] }))
  const statuses = session.meta.statuses.inquiry

  const updateStatus = async (row: Inquiry, status: string) => {
    if (status === row.status) return
    setBusyId(row.id)
    try {
      await endpoints.inquiries.update(row.id, { status })
      if (list.data) list.set({ ...list.data, rows: list.data.rows.map((item) => (item.id === row.id ? { ...item, status } : item)) })
      toast.success(fill(t.list.quickStatusSaved, { name: row.name, status: statusLabel(t, 'inquiry', status) }))
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusyId(null)
    }
  }

  const rows = list.data?.rows ?? []
  const page = list.data?.page

  return (
    <>
      <PageHeader title={t.inquiries.title} lead={t.inquiries.lead} />
      <div className={styles.stackLg}>
        <form className={styles.toolbar} role="search" aria-label={t.list.filters} onSubmit={(event) => event.preventDefault()}>
          <SearchInput className={styles.toolbarSearch} label={t.list.searchLabel} value={state.q} placeholder={t.inquiries.searchPlaceholder} onSearch={(q) => change({ q })} />
          <FilterDropdown
            label={t.common.status}
            value={state.status}
            onChange={(status) => change({ status })}
            options={[{ value: '', label: t.list.statusAll }, ...statuses.map((value) => ({ value, label: statusLabel(t, 'inquiry', value) })), { value: 'archived', label: t.list.statusArchived }]}
          />
          <FilterDropdown label={t.common.type} value={state.kind} onChange={(kind) => change({ kind })} options={[{ value: '', label: t.list.typeAll }, ...session.meta.kinds.map((value) => ({ value, label: (t.kinds as Record<string, string>)[value] ?? value }))]} />
          <TextField label={t.list.dateFrom} type="date" value={state.from} max={state.to || undefined} onChange={(event) => change({ from: event.target.value })} />
          <TextField label={t.list.dateTo} type="date" value={state.to} min={state.from || undefined} onChange={(event) => change({ to: event.target.value })} />
          <FilterDropdown label={t.common.sort} value={state.order} onChange={(order) => change({ order })} options={orders} />
        </form>

        {list.loading ? (
          <LoadingState />
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : rows.length === 0 ? (
          hasFilters(state) ? (
            <EmptyState icon="search" title={t.common.emptyFiltered} action={<AdminButton onClick={() => setParams(new URLSearchParams(), { replace: true })}>{t.common.clearFilters}</AdminButton>} />
          ) : (
            <EmptyState title={t.inquiries.emptyTitle}>{t.inquiries.emptyBody}</EmptyState>
          )
        ) : (
          <>
            <InquiryList rows={rows} statuses={statuses} canChange={session.can('requests:write')} busyId={busyId} onStatus={updateStatus} />
            {page && <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={(next) => change({ page: next })} />}
          </>
        )}
      </div>
    </>
  )
}
