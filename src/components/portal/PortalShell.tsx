import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { localizedPath } from '../../i18n/paths'
import { useI18n } from '../../i18n/useI18n'
import { usePortalText } from '../../portal/text'
import { usePortal } from '../../portal/usePortal'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import styles from './Portal.module.scss'

/** The frame around a signed-in customer's pages: who is signed in, the six places, and a way out. */
export function PortalShell({ children }: { children: ReactNode }) {
  const words = usePortalText()
  const { lang } = useI18n()
  const { state, signOut } = usePortal()
  if (state.status !== 'signedIn') return null
  const items = [
    { to: '/client-portal', label: words.nav.overview, end: true },
    { to: '/client-portal/projects', label: words.nav.projects, end: false },
    { to: '/client-portal/requests', label: words.nav.requests, end: false },
    { to: '/client-portal/bookings', label: words.nav.bookings, end: false },
    { to: '/client-portal/documents', label: words.nav.documents, end: false },
    { to: '/client-portal/account', label: words.nav.account, end: false },
  ]
  return (
    <Container className={styles.shell}>
      <aside className={styles.side}>
        <p className={styles.who}>
          <span className={styles.whoLabel}>{words.nav.signedInAs}</span>
          <span className={styles.whoEmail}>{state.session.customer.email}</span>
        </p>
        <nav aria-label={words.nav.label}>
          <ul className={styles.nav}>
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={localizedPath(lang, item.to)} end={item.end}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <Button type="button" variant="text" size="sm" onClick={() => void signOut()}>
            {words.nav.signOut}
          </Button>
        </div>
      </aside>
      <div className={styles.content}>{children}</div>
    </Container>
  )
}
