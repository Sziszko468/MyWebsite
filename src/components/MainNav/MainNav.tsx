import { useState, type CSSProperties, type MouseEventHandler } from 'react'
import { NavLink, useLocation } from 'react-router'
import { localizedPath } from '../../i18n/paths'
import { useI18n } from '../../i18n/useI18n'
import { useSlidingIndicator } from '../../motion/indicator'
import { followsHere } from '../../motion/navigation'
import { NAV_PAGES } from '../../routes/pages'
import { cx } from '../../utils/cx'
import styles from './MainNav.module.scss'
import { ServicesMenu } from './ServicesMenu'

interface MainNavProps {
  /** `bar`: inline header navigation. `panel`: large stacked list for the mobile menu. `footer`: compact column. */
  variant: 'bar' | 'panel' | 'footer'
  /** Accessible name of the landmark; defaults to the main navigation label. */
  label?: string
  /** Called when a link is activated (the mobile menu closes itself here). */
  onNavigate?: MouseEventHandler<HTMLAnchorElement>
}

/** The marker follows the page being opened while there is one, and the current page otherwise. */
const MARKED = ['a[data-pending] [data-nav-label]', 'a[aria-current="page"] [data-nav-label]']

/**
 * The six main pages, generated from the page registry. The current page gets aria-current="page".
 *
 * In the header bar one red marker glides under it (motion/indicator.ts). A click moves the marker to the chosen page at once, while that page's code may still be
 * on its way, so the answer to a click never waits for the network; `aria-current` stays on the page that is really shown until the new one replaces it. Until the
 * marker is placed (and wherever it does not run) each label draws its own underline, so the current page is marked either way.
 */
export function MainNav({ variant, label, onNavigate }: MainNavProps) {
  const { lang, t } = useI18n()
  const { pathname } = useLocation()
  // What was clicked, and from where: it counts only while the visitor is still on the page they clicked it on.
  const [asked, setAsked] = useState<{ from: string; to: string } | null>(null)
  const pending = asked !== null && asked.from === pathname && asked.to !== pathname ? asked.to : null
  const nav = useSlidingIndicator<HTMLElement>(MARKED, `${pathname} ${pending ?? ''}`, variant === 'bar')

  return (
    <nav ref={nav} aria-label={label ?? t.nav.primary} className={cx(styles.nav, styles[variant])}>
      <ul className={styles.list}>
        {NAV_PAGES.map((page, position) => {
          const to = localizedPath(lang, page.path)
          const link = (
            <NavLink
              to={to}
              // Only Home matches exactly; Work stays current on a project's page beneath it.
              end={page.path === '/'}
              className={({ isActive }) => cx(styles.link, isActive && styles.active)}
              data-pending={pending === to || undefined}
              onClick={(event) => {
                if (variant === 'bar' && followsHere(event)) setAsked({ from: pathname, to })
                onNavigate?.(event)
              }}
            >
              {variant === 'panel' && (
                <span className={styles.index} aria-hidden="true">
                  {String(position).padStart(2, '0')}
                </span>
              )}
              <span className={styles.label} data-nav-label>
                {t.nav[page.id]}
              </span>
            </NavLink>
          )
          // In the header bar Services carries its dropdown; everywhere else it is a plain link.
          if (variant === 'bar' && page.id === 'services') return <ServicesMenu key={page.id}>{link}</ServicesMenu>
          return (
            <li key={page.id} style={variant === 'panel' ? ({ '--i': position } as CSSProperties) : undefined}>
              {link}
            </li>
          )
        })}
      </ul>
      {variant === 'bar' && <span className={styles.indicator} aria-hidden="true" />}
    </nav>
  )
}
