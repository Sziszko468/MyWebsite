import { NavLink } from 'react-router'
import { cx } from '../../utils/cx'
import { useText } from '../i18n'
import { useSession } from '../session/SessionProvider'
import shell from '../styles/shell.module.scss'
import styles from '../styles/ui.module.scss'
import { Icon } from './Icon'
import { NAVIGATION, navLabel } from './navigation'

/**
 * The side navigation: every place in the administration, the way to the website, and who is signed in. On a wide screen
 * it can fold into a rail of icons (the words stay for screen readers and as tooltips); on a tablet the rail is the
 * default and it opens over the page when asked. On a phone it does not exist: the bottom bar takes its place.
 */
export function AdminSidebar({ collapsed, onNavigate, onClose }: { collapsed: boolean; onNavigate: () => void; onClose: () => void }) {
  const t = useText()
  const session = useSession()
  return (
    <aside className={shell.sidebar} id="admin-sidebar" aria-label={t.nav.label}>
      <div className={shell.brand}>
        <span className={shell.brandMark} aria-hidden="true" />
        <span className={shell.brandText}>{t.app.name}</span>
        {/* Only while the sidebar is open as a layer over the page (a tablet): it covers the menu button that opened it. */}
        <button type="button" className={cx(styles.iconButton, shell.sidebarClose)} onClick={onClose} aria-label={t.nav.close}>
          <Icon name="x" />
        </button>
      </div>
      <nav className={shell.nav} aria-label={t.nav.label}>
        {NAVIGATION.map((item) => (
          <NavLink key={item.id} to={item.path} end={item.path === '/'} className={shell.navLink} title={collapsed ? navLabel(t, item) : undefined} onClick={onNavigate}>
            <Icon name={item.icon} />
            <span className={shell.navLabel}>{navLabel(t, item)}</span>
          </NavLink>
        ))}
      </nav>
      <div className={shell.sidebarFoot}>
        <a className={shell.footButton} href="/" target="_blank" rel="noopener" title={collapsed ? t.app.viewSite : undefined}>
          <Icon name="external" />
          <span className={shell.sidebarText}>{t.app.viewSite}</span>
        </a>
        <div className={cx(shell.who, shell.sidebarText)}>
          <span>{session.user.email}</span>
        </div>
        <button type="button" className={shell.footButton} onClick={() => void session.signOut()} title={collapsed ? t.nav.signOut : undefined}>
          <Icon name="logout" />
          <span className={shell.sidebarText}>{t.nav.signOut}</span>
        </button>
      </div>
    </aside>
  )
}
