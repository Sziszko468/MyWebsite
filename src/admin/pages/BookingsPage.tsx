import { Link, useSearchParams } from 'react-router'
import { cx } from '../../utils/cx'
import * as endpoints from '../api/endpoints'
import type { BookingListItem, BookingStatus } from '../api/bookingTypes'
import { AdminButton } from '../components/AdminButton'
import { DataList, type Column } from '../components/DataList'
import { FilterDropdown, SearchInput, TextField } from '../components/form'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/layout'
import { Pagination } from '../components/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useResource } from '../hooks/useResource'
import { formatDateTime, formatInZone, useInterfaceLanguage, useText } from '../i18n'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

const STATUSES: readonly BookingStatus[] = ['pending', 'confirmed', 'reschedule_requested', 'rescheduled', 'cancelled', 'completed', 'no_show']
const SORTS = ['-created', 'created', 'start', '-start', 'name', 'status'] as const

const TONES: Record<BookingStatus, string> = {
  pending: styles.toneWarning,
  confirmed: styles.toneSuccess,
  reschedule_requested: styles.toneInfo,
  rescheduled: styles.toneSuccess,
  cancelled: styles.toneNeutral,
  completed: styles.toneNeutral,
  no_show: styles.toneDanger,
}

/** A booking's state as a word and a coloured dot (the word carries the meaning, the colour is a quick scan). */
export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const t = useText()
  return (
    <span className={cx(styles.badge, TONES[status] ?? styles.toneNeutral)}>
      <span className={styles.badgeDot} aria-hidden="true" />
      {t.booking.statuses[status] ?? status}
    </span>
  )
}

/** The consultation bookings: who booked what and when, searchable and filterable, with the set-up one click away. */
export function BookingsPage() {
  const t = useText()
  const b = t.booking
  const language = useInterfaceLanguage()
  const [params, setParams] = useSearchParams()
  const value = (name: string) => params.get(name) ?? ''
  const pageNumber = Math.max(1, Number.parseInt(value('page') || '1', 10) || 1)
  const query = { q: value('q') || undefined, status: value('status') || undefined, type: value('type') || undefined, from: value('from') || undefined, to: value('to') || undefined, sort: value('sort') || undefined, page: pageNumber > 1 ? pageNumber : undefined, pageSize: 20 }
  const list = useResource((signal) => endpoints.bookings.list(query, signal), [params.toString()])
  const config = useResource((signal) => endpoints.bookings.config(signal), [])

  const change = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, entry] of Object.entries(patch)) {
      if (entry === undefined || entry === '' || entry === 1) next.delete(key)
      else next.set(key, String(entry))
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  const rows = list.data?.rows ?? []
  const pageInfo = list.data?.page
  const filtered = Boolean(query.q || query.status || query.type || query.from || query.to)
  const closed = config.data?.closedReasons ?? []

  const columns: Column<BookingListItem>[] = [
    {
      key: 'customer',
      header: b.list.columns.customer,
      cell: (row) => (
        <span className={styles.cellMain}>
          <Link className={cx(styles.cellTitle, styles.cellLink)} to={`/bookings/${row.id}`}>
            {row.name}
          </Link>
          <span className={cx(styles.muted, styles.small)}>{row.email}</span>
        </span>
      ),
    },
    { key: 'consultation', header: b.list.columns.consultation, cell: (row) => row.typeName },
    {
      key: 'when',
      header: b.list.columns.when,
      cell: (row) => (
        <span className={styles.cellMain}>
          <span>{formatInZone(row.startAt, row.timeZone, language)}</span>
          <span className={cx(styles.muted, styles.small)}>{row.timeZone}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: b.list.columns.status,
      cell: (row) => (
        <span className={styles.stack}>
          <BookingStatusBadge status={row.status} />
          {row.openChange && <span className={cx(styles.badge, styles.toneAccent)}>{b.list.openChange[row.openChange]}</span>}
        </span>
      ),
    },
    { key: 'reference', header: b.list.columns.reference, cell: (row) => <span className={styles.mono}>{row.reference}</span> },
    { key: 'created', header: b.list.columns.created, cell: (row) => formatDateTime(row.createdAt, language) },
  ]

  return (
    <>
      <PageHeader
        title={b.title}
        lead={b.lead}
        actions={
          <AdminButton to="/bookings/setup">
            <Icon name="settings" />
            {b.setupLink}
          </AdminButton>
        }
      />
      <div className={styles.stackLg}>
        {config.data && (
          <div className={cx(styles.notice, closed.length > 0 && styles.noticeWarning)} role="status">
            {closed.length > 0 ? (
              <>
                <strong>{b.closed.title}</strong>
                <p>{b.closed.body}</p>
                <ul className={page.textList}>
                  {closed.map((reason) => (
                    <li key={reason}>{b.closed.reasons[reason]}</li>
                  ))}
                </ul>
                <AdminButton to="/bookings/setup">{b.closed.openSetup}</AdminButton>
              </>
            ) : (
              <span>{b.closed.open}</span>
            )}
          </div>
        )}

        <form className={styles.toolbar} role="search" aria-label={b.list.search} onSubmit={(event) => event.preventDefault()}>
          <SearchInput className={styles.toolbarSearch} label={b.list.search} value={value('q')} placeholder={b.list.searchPlaceholder} onSearch={(q) => change({ q })} />
          <FilterDropdown label={b.list.status} value={value('status')} onChange={(status) => change({ status })} options={[{ value: '', label: b.list.allStatuses }, ...STATUSES.map((status) => ({ value: status, label: b.statuses[status] }))]} />
          <FilterDropdown label={b.list.type} value={value('type')} onChange={(type) => change({ type })} options={[{ value: '', label: b.list.allTypes }, ...(config.data?.types ?? []).map((type) => ({ value: type.code, label: type.translations[language]?.name || type.code }))]} />
          <TextField label={b.list.from} type="date" value={value('from')} max={value('to') || undefined} onChange={(event) => change({ from: event.target.value })} />
          <TextField label={b.list.to} type="date" value={value('to')} min={value('from') || undefined} onChange={(event) => change({ to: event.target.value })} />
          <FilterDropdown label={b.list.sort} value={value('sort') || '-created'} onChange={(sort) => change({ sort })} options={SORTS.map((sort) => ({ value: sort, label: b.list.sorts[sort] }))} />
        </form>

        {list.loading ? (
          <LoadingState />
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState icon="search" title={b.list.emptyFiltered} action={<AdminButton onClick={() => setParams(new URLSearchParams(), { replace: true })}>{t.common.clearFilters}</AdminButton>} />
          ) : (
            <EmptyState icon="bell" title={b.list.empty}>
              {b.list.emptyBody}
            </EmptyState>
          )
        ) : (
          <>
            <DataList
              rows={rows}
              rowKey={(row) => row.id}
              columns={columns}
              caption={b.list.caption}
              card={(row) => (
                <>
                  <div className={styles.listCardTop}>
                    <span className={styles.cellMain}>
                      <Link className={cx(styles.cellTitle, styles.cellLink)} to={`/bookings/${row.id}`}>
                        {row.name}
                      </Link>
                      <span className={cx(styles.muted, styles.small)}>{row.typeName}</span>
                    </span>
                    <BookingStatusBadge status={row.status} />
                  </div>
                  <p className={styles.small}>{formatInZone(row.startAt, row.timeZone, language)} · {row.timeZone}</p>
                  <div className={styles.listCardMeta}>
                    <span className={styles.mono}>{row.reference}</span>
                    {row.openChange && <span>{b.list.openChange[row.openChange]}</span>}
                    <span>{formatDateTime(row.createdAt, language)}</span>
                  </div>
                </>
              )}
            />
            {pageInfo && <Pagination page={pageInfo.page} pageSize={pageInfo.pageSize} total={pageInfo.total} onPage={(next) => change({ page: next })} />}
          </>
        )}
      </div>
    </>
  )
}
