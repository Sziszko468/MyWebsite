import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cx } from '../../utils/cx'
import { useText } from '../i18n'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { DataList, type Column } from './DataList'
import { Icon } from './Icon'
import { StatusBadge } from './StatusBadge'
import { SwitchField } from './form'

export interface CatalogRow {
  key: string
  title: string
  detail?: string
  price?: string
  active: boolean
  editTo: string
}

/**
 * A catalogue list in its display order: each row can be switched on or off, moved up or down (the order is saved at once),
 * opened for editing and, for an administrator, deleted. The buttons are named after the row they act on.
 */
export function CatalogTable({ rows, caption, showPrice, busy, canWrite, canDelete, onToggle, onMove, onDelete }: { rows: readonly CatalogRow[]; caption: string; showPrice: boolean; busy: boolean; canWrite: boolean; canDelete: boolean; onToggle: (row: CatalogRow, active: boolean) => void; onMove: (index: number, direction: -1 | 1) => void; onDelete: (row: CatalogRow) => void }) {
  const t = useText()
  const indexOf = (row: CatalogRow) => rows.findIndex((candidate) => candidate.key === row.key)

  const controls = (row: CatalogRow): ReactNode => (
    <span className={page.rowActions}>
      <AdminButton to={row.editTo} aria-label={`${t.common.edit}: ${row.title}`}>
        <Icon name="edit" />
        {t.common.edit}
      </AdminButton>
      {canDelete && (
        <button type="button" className={styles.iconButton} onClick={() => onDelete(row)} aria-label={`${t.common.delete}: ${row.title}`}>
          <Icon name="trash" />
        </button>
      )}
    </span>
  )

  const order = (row: CatalogRow): ReactNode => {
    const index = indexOf(row)
    return (
      <span className={page.orderCell}>
        <button type="button" className={styles.iconButton} disabled={!canWrite || busy || index === 0} onClick={() => onMove(index, -1)} aria-label={`${t.common.moveUp}: ${row.title}`}>
          <Icon name="up" />
        </button>
        <button type="button" className={styles.iconButton} disabled={!canWrite || busy || index === rows.length - 1} onClick={() => onMove(index, 1)} aria-label={`${t.common.moveDown}: ${row.title}`}>
          <Icon name="down" />
        </button>
      </span>
    )
  }

  const state = (row: CatalogRow): ReactNode =>
    canWrite ? <SwitchField label={row.active ? t.common.active : t.common.disabled} checked={row.active} disabled={busy} onChange={(on) => onToggle(row, on)} /> : <StatusBadge kind="availability" status={row.active ? 'active' : 'disabled'} />

  const columns: Column<CatalogRow>[] = [
    {
      key: 'name',
      header: t.services.columns.name,
      cell: (row) => (
        <span className={styles.cellMain}>
          <Link className={cx(styles.cellTitle, styles.cellLink)} to={row.editTo}>
            {row.title}
          </Link>
          {row.detail && <span className={cx(styles.muted, styles.small, styles.mono)}>{row.detail}</span>}
        </span>
      ),
    },
    ...(showPrice ? [{ key: 'price', header: t.services.columns.price, cell: (row: CatalogRow) => row.price ?? t.common.noValue }] : []),
    { key: 'status', header: t.services.columns.status, cell: state },
    { key: 'order', header: t.services.columns.order, cell: order },
    { key: 'actions', header: t.services.columns.actions, cell: controls },
  ]

  return (
    <DataList
      rows={rows}
      rowKey={(row) => row.key}
      columns={columns}
      caption={caption}
      card={(row) => (
        <>
          <div className={styles.listCardTop}>
            <span className={styles.cellMain}>
              <Link className={cx(styles.cellTitle, styles.cellLink)} to={row.editTo}>
                {row.title}
              </Link>
              {row.detail && <span className={cx(styles.muted, styles.small, styles.mono)}>{row.detail}</span>}
            </span>
            {order(row)}
          </div>
          {showPrice && row.price && <span className={styles.small}>{row.price}</span>}
          {state(row)}
          {controls(row)}
        </>
      )}
    />
  )
}
