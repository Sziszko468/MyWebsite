import { useCommonText } from '../../shop/hooks'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { ArrowLeftIcon } from './icons'
import styles from './Breadcrumbs.module.scss'

export interface Crumb {
  label: string
  /** Language-free path; the last crumb is the page itself and has none. */
  to?: string
}

/**
 * Where the visitor is, and the way back. From `md` the whole trail is shown; on a phone only the
 * step above this page is, as a back link with an arrow, so there is one obvious way back and no
 * crumbs to squeeze into the width.
 */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  const common = useCommonText()

  return (
    <nav aria-label={common.nav.breadcrumb} className={styles.nav}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={item.label} className={styles.item} data-last={last || undefined} data-parent={index === items.length - 2 || undefined}>
              {item.to && !last ? (
                <LocalizedLink to={item.to} className={styles.link}>
                  <span className={styles.arrow}>
                    <ArrowLeftIcon />
                  </span>
                  {item.label}
                </LocalizedLink>
              ) : (
                <span aria-current={last ? 'page' : undefined}>{item.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
