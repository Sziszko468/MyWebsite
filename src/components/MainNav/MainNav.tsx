import type { MouseEventHandler } from 'react'
import { NavLink } from 'react-router'
import { localizedPath } from '../../i18n/paths'
import { useI18n } from '../../i18n/useI18n'
import { NAV_PAGES } from '../../routes/pages'
import { cx } from '../../utils/cx'
import styles from './MainNav.module.scss'

interface MainNavProps {
  /** `bar`: inline header navigation. `panel`: large stacked list for the mobile menu. `footer`: compact column. */
  variant: 'bar' | 'panel' | 'footer'
  /** Accessible name of the landmark; defaults to the main navigation label. */
  label?: string
  /** Called when a link is activated (the mobile menu closes itself here). */
  onNavigate?: MouseEventHandler<HTMLAnchorElement>
}

/** The six main pages, generated from the page registry. The current page gets aria-current="page". */
export function MainNav({ variant, label, onNavigate }: MainNavProps) {
  const { lang, t } = useI18n()

  return (
    <nav aria-label={label ?? t.nav.primary} className={cx(styles.nav, styles[variant])}>
      <ul className={styles.list}>
        {NAV_PAGES.map((page, position) => (
          <li key={page.id}>
            <NavLink
              to={localizedPath(lang, page.path)}
              // Only Home matches exactly; Work stays current on a project's page beneath it.
              end={page.path === '/'}
              className={({ isActive }) => cx(styles.link, isActive && styles.active)}
              onClick={onNavigate}
            >
              {variant === 'panel' && (
                <span className={styles.index} aria-hidden="true">
                  {String(position).padStart(2, '0')}
                </span>
              )}
              <span className={styles.label}>{t.nav[page.id]}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
