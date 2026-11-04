import { fill, useText } from '../i18n'
import { useTheme } from '../../theme/useTheme'
import { useSession } from '../session/SessionProvider'
import shell from '../styles/shell.module.scss'
import styles from '../styles/ui.module.scss'
import { AdminButton } from './AdminButton'
import { Icon } from './Icon'

/** The strip above the work: the menu button (wide and tablet screens), the theme switch and who is signed in. */
export function AdminHeader({ collapsed, onToggleMenu }: { collapsed: boolean; onToggleMenu: () => void }) {
  const t = useText()
  const session = useSession()
  const { theme, toggleTheme } = useTheme()
  return (
    <header className={shell.header}>
      <button type="button" id="admin-menu-toggle" className={`${styles.iconButton} ${shell.menuToggle}`} onClick={onToggleMenu} aria-expanded={!collapsed} aria-controls="admin-sidebar" aria-label={collapsed ? t.nav.expand : t.nav.collapse}>
        <Icon name="menu" />
      </button>
      <span className={shell.headerBrand}>
        <span className={shell.brandMark} aria-hidden="true" />
        {t.app.name}
      </span>
      <span className={shell.headerSpacer} />
      <span className={shell.headerWho}>{fill(t.header.account, { email: session.user.email })}</span>
      <button type="button" className={styles.iconButton} onClick={toggleTheme} aria-label={theme === 'dark' ? t.header.themeToLight : t.header.themeToDark}>
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      <AdminButton variant="text" className={shell.headerSignOut} onClick={() => void session.signOut()}>
        <Icon name="logout" />
        {t.nav.signOut}
      </AdminButton>
    </header>
  )
}
