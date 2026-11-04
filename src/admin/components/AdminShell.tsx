import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useText } from '../i18n'
import shell from '../styles/shell.module.scss'
import { AdminHeader } from './AdminHeader'
import { AdminMobileNavigation } from './AdminMobileNavigation'
import { AdminSidebar } from './AdminSidebar'

const STORAGE_KEY = 'admin-sidebar'
const DESKTOP = '(min-width: 64rem)'

function initialCollapsed(): boolean {
  if (!window.matchMedia(DESKTOP).matches) return true
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'collapsed'
  } catch {
    return false
  }
}

/**
 * The frame every signed-in screen sits in: sidebar, header, the page, and the phone's bottom bar. It also looks after
 * what a page change must do for people who do not see it: move focus to the new page's title (so a screen reader reads
 * where it is), and start at the top.
 */
export function AdminShell() {
  const t = useText()
  const location = useLocation()
  const main = useRef<HTMLElement>(null)
  const firstRender = useRef(true)
  const [collapsed, setCollapsed] = useState(initialCollapsed)
  // Set when the menu button opens the sidebar as a layer: the sidebar comes before the header in the page, so a keyboard user who
  // pressed the button would otherwise have to go backwards to reach it.
  const focusSidebar = useRef(false)

  const toggle = useCallback(() => {
    const overlay = !window.matchMedia(DESKTOP).matches
    if (overlay && collapsed) focusSidebar.current = true
    setCollapsed(!collapsed)
    if (!overlay) {
      try {
        window.localStorage.setItem(STORAGE_KEY, collapsed ? 'open' : 'collapsed')
      } catch {
        // The choice then lasts for this visit only.
      }
    }
  }, [collapsed])

  // Below the desktop width the opened sidebar is a layer over the page: choosing a place closes it (focus goes to the new page).
  const closeIfOverlay = useCallback(() => {
    if (!window.matchMedia(DESKTOP).matches) setCollapsed(true)
  }, [])

  // The sidebar's own close button: closes the layer and gives focus back to the menu button.
  const closeAndReturn = useCallback(() => {
    closeIfOverlay()
    document.getElementById('admin-menu-toggle')?.focus()
  }, [closeIfOverlay])

  // Opened as a layer by the button: focus moves into it, on the place the administrator is at.
  useEffect(() => {
    if (collapsed || !focusSidebar.current) return
    focusSidebar.current = false
    const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>('#admin-sidebar a[aria-current="page"], #admin-sidebar a')?.focus())
    return () => cancelAnimationFrame(frame)
  }, [collapsed])

  // Escape closes the layer and gives focus back to the button that opened it.
  useEffect(() => {
    if (collapsed) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || window.matchMedia(DESKTOP).matches) return
      setCollapsed(true)
      document.getElementById('admin-menu-toggle')?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [collapsed])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    window.scrollTo(0, 0)
    const frame = requestAnimationFrame(() => (document.getElementById('page-title') ?? main.current)?.focus({ preventScroll: true }))
    return () => cancelAnimationFrame(frame)
  }, [location.pathname])

  return (
    <div className={shell.root} data-collapsed={collapsed || undefined}>
      <a
        className={shell.skip}
        href="#main"
        onClick={(event) => {
          event.preventDefault()
          main.current?.focus()
        }}
      >
        {t.app.skip}
      </a>
      <AdminSidebar collapsed={collapsed} onNavigate={closeIfOverlay} onClose={closeAndReturn} />
      <div className={shell.backdrop} data-open={!collapsed || undefined} onClick={closeIfOverlay} aria-hidden="true" />
      <div className={shell.main}>
        <AdminHeader collapsed={collapsed} onToggleMenu={toggle} />
        <main id="main" ref={main} className={shell.content} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <AdminMobileNavigation />
    </div>
  )
}
