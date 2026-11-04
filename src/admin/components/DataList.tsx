import type { ReactNode } from 'react'
import styles from '../styles/ui.module.scss'

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
}

/**
 * One list, drawn two ways: a real table where there is room for columns, and a stack of cards where there is not
 * (a phone). Both are in the page and CSS shows one, so the one on screen is always the one that fits, and a desktop
 * table is never squeezed onto a small screen. Rows are links to their detail; quick controls sit inside them.
 */
export function DataList<T>({ rows, rowKey, columns, card, caption }: { rows: readonly T[]; rowKey: (row: T) => string; columns: readonly Column<T>[]; card: (row: T) => ReactNode; caption: string }) {
  return (
    <>
      {/* A table wider than its box scrolls sideways: the box is a labelled group the keyboard can reach and scroll (axe: scrollable-region-focusable). A group, not a region: a region is a landmark, and its name would repeat the heading of the panel around it. */}
      <div className={styles.tableWrap} role="group" aria-label={caption} tabIndex={0}>
        <table className={styles.table}>
          <caption className={styles.srOnly}>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.cell(row)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={styles.cards} aria-label={caption}>
        {rows.map((row) => (
          <li key={rowKey(row)} className={styles.listCard}>
            {card(row)}
          </li>
        ))}
      </ul>
    </>
  )
}
