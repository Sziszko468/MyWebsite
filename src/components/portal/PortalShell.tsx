import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { localizedPath } from '../../i18n/paths'
import { useI18n } from '../../i18n/useI18n'
import { usePortalText } from '../../portal/text'
import { UnreadProvider } from '../../portal/unread'
import { useUnread } from '../../portal/unreadContext'
import { usePortal } from '../../portal/usePortal'
import { fill } from '../../utils/format'
import { Button } from '../Button/Button'
import { Container } from '../Container/Container'
import styles from './Portal.module.scss'

/** The frame around a signed-in customer's pages: who is signed in, the places, and a way out. */
export function PortalShell({ children }: { children: ReactNode }) {
  return (
    <UnreadProvider>
      <Frame>{children}</Frame>
    </UnreadProvider>
  )
}

function Frame({ children }: { children: ReactNode }) {
  const { unread } = useUnread()
  const words = usePortalText()
  const { lang } = useI18n()
  const { state, signOut } = usePortal()
  if (state.status !== 'signedIn') return null
  const items = [
    { to: '/client-portal', label: words.nav.overview, end: true },
    { to: '/client-portal/projects', label: words.nav.projects, end: false },
    { to: '/client-portal/messages', label: words.nav.messages, end: false, badge: unread },
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
                  {item.badge ? (
                    <span className={styles.navBadge}>
                      <span aria-hidden="true">{item.badge}</span>
                      <span className={styles.srOnly}>{fill(words.messages.list.unread, { count: item.badge })}</span>
                    </span>
                  ) : null}
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
