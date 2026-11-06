import { useCatalogVersion } from '../../content/liveCatalog'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { serviceAreas } from '../../content/services/areas'
import { useI18n } from '../../i18n/useI18n'
import { useCommonText } from '../../shop/hooks'
import { SHOP_PATHS, servicePath } from '../../shop/paths'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import styles from './ServicesMenu.module.scss'

/** How long the pointer must rest before the menu opens, and how long it may wander off before it closes (ms). */
const OPEN_DELAY = 90
const CLOSE_DELAY = 200

/**
 * The Services entry of the header bar with its dropdown: the four services, the packages, the request
 * builder and the cart one step away. It is a disclosure, not a hover trap: the link itself still goes
 * to the Services page, and a button beside it opens the menu (Enter, Space, a click, or Arrow Down,
 * which also moves into it); a mouse resting on the entry opens it too, after a short pause, and moving
 * away closes it after a short grace. Escape closes it and returns focus to the button, so does
 * leaving it with Tab, a click anywhere else and any navigation. While closed the panel is inert, so it
 * is out of the tab order and the accessibility tree; open, it fades and drops a few pixels in
 * (opacity and transform only, the motion tokens), and with no animation at all it simply appears.
 */
export function ServicesMenu({ children }: { children: ReactNode }) {
  useCatalogVersion()
  const { lang } = useI18n()
  const common = useCommonText()
  const { pathname } = useLocation()
  // Open is remembered together with the page it was opened on: a navigation closes it with no effect to do so.
  const [openedOn, setOpenedOn] = useState<string | null>(null)
  const open = openedOn === pathname
  const setOpen = useCallback((next: boolean) => setOpenedOn(next ? pathname : null), [pathname])
  const root = useRef<HTMLLIElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const timer = useRef(0)
  const id = useId()

  const clear = () => window.clearTimeout(timer.current)
  const schedule = (next: boolean, delay: number) => {
    clear()
    timer.current = window.setTimeout(() => setOpen(next), delay)
  }
  const close = useCallback(
    (restoreFocus = false) => {
      window.clearTimeout(timer.current)
      setOpen(false)
      if (restoreFocus) button.current?.focus()
    },
    [setOpen],
  )

  // A click or a touch anywhere else closes it.
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open, close])

  // A hover that began just before a navigation must not open the menu again on the page that arrives.
  useEffect(() => clear, [pathname])

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      close(root.current?.contains(document.activeElement) === true)
    }
  }

  const links = [
    ...serviceAreas.map((area) => ({ to: servicePath(area.id), label: area.name[lang] })),
    { to: `${SHOP_PATHS.home}#packages`, label: common.nav.packages },
    { to: SHOP_PATHS.configure, label: common.nav.configure },
    { to: SHOP_PATHS.cart, label: common.nav.cart },
  ]

  return (
    <li
      ref={root}
      className={styles.root}
      onKeyDown={onKeyDown}
      onPointerEnter={(event) => event.pointerType === 'mouse' && schedule(true, OPEN_DELAY)}
      onPointerLeave={(event) => event.pointerType === 'mouse' && schedule(false, CLOSE_DELAY)}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) close()
      }}
    >
      {children}
      <button
        ref={button}
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={id}
        aria-label={common.nav.menuHeading}
        onClick={() => {
          clear()
          setOpen(!open)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown') return
          event.preventDefault()
          setOpen(true)
          requestAnimationFrame(() => root.current?.querySelector<HTMLElement>(`#${CSS.escape(id)} a`)?.focus())
        }}
      >
        <svg className={styles.chevron} viewBox="0 0 12 12" width="0.75em" height="0.75em" aria-hidden="true" focusable="false">
          <path d="M2 4.5l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {/* Choosing an entry closes the menu at once, whether or not the pointer is still resting on it. */}
      <div id={id} className={styles.panel} data-open={open || undefined} inert={!open} onClick={() => close()}>
        <ul className={styles.list}>
          {links.map((link, position) => (
            <li key={link.to} className={position === serviceAreas.length ? styles.divided : undefined}>
              <LocalizedLink to={link.to} className={styles.item}>
                {link.label}
              </LocalizedLink>
            </li>
          ))}
        </ul>
      </div>
    </li>
  )
}
