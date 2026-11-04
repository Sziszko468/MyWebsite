import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router'
import { useTheme } from '../../theme/useTheme'
import { useText } from '../i18n'
import { useSession } from '../session/SessionProvider'
import shell from '../styles/shell.module.scss'
import styles from '../styles/ui.module.scss'
import { Icon } from './Icon'
import { NAVIGATION, navLabel, shortNavLabel } from './navigation'

/**
 * Navigation for a phone: a bar along the bottom with the four places used most, within reach of a thumb, and "More"
 * for the rest, which opens a sheet (a modal dialog: focus stays in it, Escape and the close button leave it).
 */
export function AdminMobileNavigation() {
  const t = useText()
  const session = useSession()
  const { theme, toggleTheme } = useTheme()
  const sheet = useRef<HTMLDialogElement>(null)
  const location = useLocation()
  // The sheet is open for the screen it was opened on: going anywhere (a link, the back button) closes it.
  const [openPath, setOpenPath] = useState<string | null>(null)
  const open = openPath === location.pathname
  const setOpen = (value: boolean) => setOpenPath(value ? location.pathname : null)

  const primary = NAVIGATION.filter((item) => item.primary)
  const more = NAVIGATION.filter((item) => !item.primary)
  const inMore = more.some((item) => location.pathname.startsWith(item.path))

  useEffect(() => {
    const element = sheet.current
    if (!element) return
    if (open && !element.open) element.showModal()
    if (!open && element.open) element.close()
  }, [open])

  return (
    <>
      <nav className={shell.bottom} aria-label={t.nav.label}>
        {primary.map((item) => (
          <NavLink key={item.id} to={item.path} end={item.path === '/'} className={shell.bottomItem}>
            <Icon name={item.icon} />
            <span className={shell.bottomLabel}>{shortNavLabel(t, item)}</span>
          </NavLink>
        ))}
        <button type="button" className={shell.bottomItem} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-current={inMore ? 'page' : undefined}>
          <Icon name="more" />
          <span className={shell.bottomLabel}>{t.nav.more}</span>
        </button>
      </nav>
      <dialog ref={sheet} className={shell.sheet} aria-label={t.nav.menu} onClose={() => setOpen(false)} onClick={(event) => event.target === event.currentTarget && setOpen(false)}>
        <div className={shell.sheetBody}>
          <div className={shell.sheetHead}>
            <h2 className={shell.sheetTitle}>{t.nav.menu}</h2>
            <button type="button" className={styles.iconButton} onClick={() => setOpen(false)} aria-label={t.nav.close}>
              <Icon name="x" />
            </button>
          </div>
          {more.map((item) => (
            <NavLink key={item.id} to={item.path} className={shell.navLink}>
              <Icon name={item.icon} />
              <span className={shell.navLabel}>{navLabel(t, item)}</span>
            </NavLink>
          ))}
          <button type="button" className={shell.footButton} onClick={toggleTheme}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            {theme === 'dark' ? t.header.themeToLight : t.header.themeToDark}
          </button>
          <a className={shell.footButton} href="/" target="_blank" rel="noopener">
            <Icon name="external" />
            {t.app.viewSite}
          </a>
          <div className={shell.who}>{session.user.email}</div>
          <button type="button" className={shell.footButton} onClick={() => void session.signOut()}>
            <Icon name="logout" />
            {t.nav.signOut}
          </button>
        </div>
      </dialog>
    </>
  )
}
