import { useLayoutEffect, useRef, type CSSProperties, type MouseEventHandler, type RefObject } from 'react'
import { NavLink, useLocation } from 'react-router'
import { localizedPath } from '../../i18n/paths'
import { useI18n } from '../../i18n/useI18n'
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

/**
 * Keeps the header bar's red indicator under the current page's label. It is one element that glides
 * from the old label to the new one (a transform: it is moved with `--ind-x` and `--ind-w`, never
 * laid out again), measured after layout, again when the bar changes size and again when the fonts
 * arrive. Until it has been placed (and in any browser where this does not run) each label draws its
 * own underline as before, so the current page is marked either way.
 */
function useIndicator(enabled: boolean): RefObject<HTMLElement | null> {
  const { pathname } = useLocation()
  const nav = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const element = nav.current
    if (!enabled || !element) return

    const place = () => {
      const label = element.querySelector<HTMLElement>('a[aria-current="page"] [data-nav-label]')
      if (!label) {
        element.dataset.indicator = 'none'
        return
      }
      const box = label.getBoundingClientRect()
      const frame = element.getBoundingClientRect()
      element.style.setProperty('--ind-x', `${Math.round(box.left - frame.left)}px`)
      element.style.setProperty('--ind-y', `${Math.round(box.bottom - frame.top + 4)}px`)
      element.style.setProperty('--ind-w', String(Math.max(1, Math.round(box.width))))
      element.dataset.indicator = 'on'
    }

    place()
    // The first placement is instant; every later one glides.
    const ready = requestAnimationFrame(() => {
      element.dataset.ready = ''
    })
    const resize = new ResizeObserver(place)
    resize.observe(element)
    void document.fonts?.ready.then(place)
    return () => {
      cancelAnimationFrame(ready)
      resize.disconnect()
    }
  }, [enabled, pathname])

  return nav
}

/** The six main pages, generated from the page registry. The current page gets aria-current="page". */
export function MainNav({ variant, label, onNavigate }: MainNavProps) {
  const { lang, t } = useI18n()
  const nav = useIndicator(variant === 'bar')

  return (
    <nav ref={nav} aria-label={label ?? t.nav.primary} className={cx(styles.nav, styles[variant])}>
      <ul className={styles.list}>
        {NAV_PAGES.map((page, position) => {
          const link = (
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
