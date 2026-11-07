import { Link } from 'react-router'
import { cx } from '../../utils/cx'
import type { Quote } from '../api/types'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import { DataList, type Column } from './DataList'
import { QuickStatus } from './InquiryList'
import { StatusBadge } from './StatusBadge'

/** "Website · Launch, Web application · Custom project": what a request asked for, in the words of the request builder. */
export function useItemsSummary(): (items: Quote['items']) => string {
  const t = useText()
  return (items) =>
    (items ?? [])
      .map((item) => `${(t.needs as Record<string, string>)[item.need] ?? item.need} · ${(t.plans as Record<string, string>)[item.plan] ?? item.plan}`)
      .join(', ')
}

export function QuoteRequestList({ rows, statuses, canChange, busyId, onStatus }: { rows: readonly Quote[]; statuses: readonly string[]; canChange: boolean; busyId: string | null; onStatus: (row: Quote, status: string) => void }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const summary = useItemsSummary()

  const columns: Column<Quote>[] = [
    {
      key: 'customer',
      header: t.quotes.columns.customer,
      cell: (row) => (
        <span className={styles.cellMain}>
          <Link className={cx(styles.cellTitle, styles.cellLink)} to={`/quotes/${row.id}`} aria-label={fill(t.list.open, { name: `${row.name} (${row.reference})` })}>
            {row.name}
          </Link>
          <span className={cx(styles.muted, styles.small)}>{row.email}</span>
        </span>
      ),
    },
    {
      key: 'services',
      header: t.quotes.columns.services,
      cell: (row) => (
        <span className={styles.cellMain}>
          <span>{row.kind === 'full_experience' ? t.shop.quote.kind : summary(row.items) || t.common.noValue}</span>
          <span className={cx(styles.muted, styles.small, styles.mono)}>{row.reference}</span>
        </span>
      ),
    },
    { key: 'received', header: t.quotes.columns.received, cell: (row) => formatDateTime(row.created_at, language) },
    {
      key: 'status',
      header: t.quotes.columns.status,
      cell: (row) =>
        canChange ? (
          <span className={styles.cellMain}>
            <QuickStatus name={row.name} value={row.status} statuses={statuses} kind="quote" disabled={busyId === row.id} onChange={(status) => onStatus(row, status)} />
            {row.archived_at && <StatusBadge kind="quote" status={row.status} archived />}
          </span>
        ) : (
          <StatusBadge kind="quote" status={row.status} archived={row.archived_at !== null} />
        ),
    },
  ]

  return (
    <DataList
      rows={rows}
      rowKey={(row) => row.id}
      columns={columns}
      caption={t.quotes.title}
      card={(row) => (
        <>
          <div className={styles.listCardTop}>
            <span className={styles.cellMain}>
              <Link className={cx(styles.cellTitle, styles.cellLink)} to={`/quotes/${row.id}`}>
                {row.name}
              </Link>
              <span className={cx(styles.muted, styles.small)}>{row.email}</span>
            </span>
            <StatusBadge kind="quote" status={row.status} archived={row.archived_at !== null} />
          </div>
          <p className={styles.small}>{row.kind === 'full_experience' ? t.shop.quote.kind : summary(row.items) || t.common.noValue}</p>
          <div className={styles.listCardMeta}>
            <span className={styles.mono}>{row.reference}</span>
            <span>{formatDateTime(row.created_at, language)}</span>
          </div>
          {canChange && <QuickStatus name={row.name} value={row.status} statuses={statuses} kind="quote" disabled={busyId === row.id} onChange={(status) => onStatus(row, status)} />}
        </>
      )}
    />
  )
}
