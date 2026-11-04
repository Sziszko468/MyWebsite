import { Link } from 'react-router'
import { cx } from '../../utils/cx'
import type { Inquiry } from '../api/types'
import { fill, formatDateTime, statusLabel, useInterfaceLanguage, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import { DataList, type Column } from './DataList'
import { StatusBadge } from './StatusBadge'

/** The status as a small control on the row: a quick change without opening the inquiry (the main way to work through a list on a phone). */
export function QuickStatus({ name, value, statuses, kind, disabled, onChange }: { name: string; value: string; statuses: readonly string[]; kind: 'inquiry' | 'quote'; disabled?: boolean; onChange: (status: string) => void }) {
  const t = useText()
  return (
    <select className={cx(styles.select, styles.selectCompact)} value={value} disabled={disabled} aria-label={fill(t.list.quickStatus, { name })} onChange={(event) => onChange(event.target.value)}>
      {statuses.map((status) => (
        <option key={status} value={status}>
          {statusLabel(t, kind, status)}
        </option>
      ))}
    </select>
  )
}

export function InquiryList({ rows, statuses, canChange, busyId, onStatus }: { rows: readonly Inquiry[]; statuses: readonly string[]; canChange: boolean; busyId: string | null; onStatus: (row: Inquiry, status: string) => void }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const kind = (value: string) => (t.kinds as Record<string, string>)[value] ?? value

  const columns: Column<Inquiry>[] = [
    {
      key: 'from',
      header: t.inquiries.columns.from,
      cell: (row) => (
        <span className={styles.cellMain}>
          <span className={styles.cellTitle}>{row.name}</span>
          <span className={cx(styles.muted, styles.small)}>{row.email}</span>
        </span>
      ),
    },
    {
      key: 'subject',
      header: t.inquiries.columns.subject,
      cell: (row) => (
        <span className={styles.cellMain}>
          <Link className={cx(styles.cellTitle, styles.cellLink)} to={`/inquiries/${row.id}`} aria-label={fill(t.list.open, { name: `${row.subject} (${row.reference})` })}>
            {row.subject}
          </Link>
          <span className={cx(styles.muted, styles.small, styles.mono)}>{row.reference}</span>
        </span>
      ),
    },
    { key: 'type', header: t.inquiries.columns.type, cell: (row) => kind(row.kind) },
    { key: 'received', header: t.inquiries.columns.received, cell: (row) => formatDateTime(row.created_at, language) },
    {
      key: 'status',
      header: t.inquiries.columns.status,
      cell: (row) =>
        canChange ? (
          <span className={styles.cellMain}>
            <QuickStatus name={row.name} value={row.status} statuses={statuses} kind="inquiry" disabled={busyId === row.id} onChange={(status) => onStatus(row, status)} />
            {row.archived_at && <StatusBadge kind="inquiry" status={row.status} archived />}
          </span>
        ) : (
          <StatusBadge kind="inquiry" status={row.status} archived={row.archived_at !== null} />
        ),
    },
  ]

  return (
    <DataList
      rows={rows}
      rowKey={(row) => row.id}
      columns={columns}
      caption={t.inquiries.title}
      card={(row) => (
        <>
          <div className={styles.listCardTop}>
            <span className={styles.cellMain}>
              <Link className={cx(styles.cellTitle, styles.cellLink)} to={`/inquiries/${row.id}`}>
                {row.subject}
              </Link>
              <span className={styles.small}>
                {row.name} · <span className={styles.muted}>{row.email}</span>
              </span>
            </span>
            <StatusBadge kind="inquiry" status={row.status} archived={row.archived_at !== null} />
          </div>
          <div className={styles.listCardMeta}>
            <span className={styles.mono}>{row.reference}</span>
            <span>{kind(row.kind)}</span>
            <span>{formatDateTime(row.created_at, language)}</span>
          </div>
          {canChange && <QuickStatus name={row.name} value={row.status} statuses={statuses} kind="inquiry" disabled={busyId === row.id} onChange={(status) => onStatus(row, status)} />}
        </>
      )}
    />
  )
}
