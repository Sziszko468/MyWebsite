import { fill, formatNumber, useInterfaceLanguage, useText } from '../i18n'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { Icon } from './Icon'

/** Where the list is, how much there is, and the way to the next and previous page; nothing shows when everything fits on one. */
export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(total, page * pageSize)
  const count = total === 1 ? t.common.resultCountOne : fill(t.common.resultCount, { count: formatNumber(total, language) })

  return (
    <nav className={styles.pagination} aria-label={t.list.pagination}>
      <p className={styles.muted} role="status" aria-live="polite">
        {total > pageSize ? `${formatNumber(first, language)}–${formatNumber(last, language)} · ${count}` : count}
      </p>
      {pages > 1 && (
        <div className={styles.pageButtons}>
          <AdminButton variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t.list.previousPage}>
            <Icon name="left" />
            <span className={styles.small}>{t.common.previous}</span>
          </AdminButton>
          <span className={styles.row} aria-current="page">
            {fill(t.common.pageOf, { page, pages })}
          </span>
          <AdminButton variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t.list.nextPage}>
            <span className={styles.small}>{t.common.next}</span>
            <Icon name="right" />
          </AdminButton>
        </div>
      )}
    </nav>
  )
}
