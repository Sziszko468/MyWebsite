import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { BrandMark } from '../BrandMark/BrandMark'
import { Button } from '../Button/Button'
import { LanguageSwitcher } from '../LanguageSwitcher/LanguageSwitcher'
import { MainNav } from '../MainNav/MainNav'
import { ShopMenuGroup } from '../shop/ShopMenuGroup'
import { ThemeToggle } from '../ThemeToggle/ThemeToggle'
import styles from './MobileMenu.module.scss'

function MenuIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d="M3 6h14M3 10h14M3 14h14" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d="M4.5 4.5l11 11m0-11l-11 11" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="square" />
    </svg>
  )
}

/**
 * Menu button plus a full-screen modal <dialog>. The browser supplies the behaviour that is
 * hard to get right by hand: Escape closes, focus stays inside, the page behind is inert and
 * focus returns to the button on close. Closed, it is display:none and locks nothing.
 */
export function MobileMenu() {
  const { t } = useI18n()
  const { pathname } = useLocation()
  const dialogId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)

  const openMenu = () => {
    const dialog = dialogRef.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    setOpen(true)
    closeRef.current?.focus()
  }

  const closeMenu = useCallback(() => dialogRef.current?.close(), [])

  // Fires for every way of closing: Escape, a link, the close button, route change, resize.
  const handleClosed = () => {
    setOpen(false)
    openerRef.current?.focus()
  }

  // Any navigation, including a language switch, closes the menu.
  useEffect(() => {
    closeMenu()
  }, [pathname, closeMenu])

  // If the window grows until the menu button disappears, the open menu has no way to be
  // closed by the visitor, so it closes itself. CSS decides when the button is hidden.
  useEffect(() => {
    if (!open) return
    const onResize = () => {
      const opener = openerRef.current
      if (opener && getComputedStyle(opener).display === 'none') closeMenu()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open, closeMenu])

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        className={cx(styles.button, styles.opener)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={dialogId}
        aria-label={t.nav.menuOpen}
        onClick={openMenu}
      >
        <MenuIcon />
      </button>

      <dialog ref={dialogRef} id={dialogId} className={styles.dialog} aria-label={t.nav.primary} onClose={handleClosed}>
        <div className={styles.top}>
          <BrandMark onNavigate={closeMenu} />
          <button ref={closeRef} type="button" className={styles.button} aria-label={t.nav.menuClose} onClick={closeMenu}>
            <CloseIcon />
          </button>
        </div>

        <div className={styles.body}>
          <MainNav variant="panel" onNavigate={closeMenu} />
          <ShopMenuGroup onNavigate={closeMenu} />

          <div className={styles.footer}>
            <div className={styles.switches}>
              <ThemeToggle />
              <LanguageSwitcher />
            </div>
            <Button to="/contact" size="lg" fullWidth arrow onClick={closeMenu}>
              {t.cta.startProject}
            </Button>
          </div>
        </div>
      </dialog>
    </>
  )
}
