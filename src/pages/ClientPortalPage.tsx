import { Route, Routes } from 'react-router'
import { AccountView } from '../components/portal/AccountView'
import { SignInView, VerifyView } from '../components/portal/AuthViews'
import { PortalShell } from '../components/portal/PortalShell'
import { BookingsView, BookingView, DocumentsView, OverviewView, ProjectsView, ProjectView, RequestsView, RequestView } from '../components/portal/PortalViews'
import styles from '../components/portal/Portal.module.scss'
import { PageHeader } from '../components/portal/ui'
import { TaskView } from '../components/portal/WorkViews'
import { Button } from '../components/Button/Button'
import { Container } from '../components/Container/Container'
import { PortalSessionProvider } from '../portal/session'
import { usePortalText } from '../portal/text'
import { usePortal } from '../portal/usePortal'

/**
 * The client portal (PROMPT 25): `/<lang>/client-portal/…`. One page for every address below it; it asks the server who is signed in and shows either the
 * sign-in or the customer's own pages. It is a private page in every way a page can be: the build ships it as a quiet shell with nothing of anybody's in it,
 * it is never indexed or cached, and nothing on it is sent to the analytics (src/analytics/tracker.ts).
 */

function NotFound() {
  const words = usePortalText()
  return (
    <>
      <PageHeader title={words.problems.notFound} focusKey="not-found" />
      <div>
        <Button to="/client-portal" variant="secondary">
          {words.nav.overview}
        </Button>
      </div>
    </>
  )
}

function SignedInRoutes() {
  return (
    <PortalShell>
      <Routes>
        <Route index element={<OverviewView />} />
        <Route path="projects" element={<ProjectsView />} />
        <Route path="projects/:reference" element={<ProjectView />} />
        <Route path="projects/:reference/tasks/:task" element={<TaskView />} />
        <Route path="requests" element={<RequestsView />} />
        <Route path="requests/:reference" element={<RequestView />} />
        <Route path="bookings" element={<BookingsView />} />
        <Route path="bookings/:reference" element={<BookingView />} />
        <Route path="documents" element={<DocumentsView />} />
        <Route path="account" element={<AccountView />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </PortalShell>
  )
}

function PortalRoutes() {
  const { state } = usePortal()
  const words = usePortalText()
  if (state.status === 'loading') {
    return (
      <Container size="narrow" className={styles.authPage}>
        <p className={styles.loading} role="status">
          {words.common.loading}
        </p>
      </Container>
    )
  }
  if (state.status === 'unusable') {
    return (
      <Container size="narrow" className={styles.authPage}>
        <PageHeader title={words.meta.title} focusKey="unusable" />
        <p role="alert">{words.problems.noBackend}</p>
      </Container>
    )
  }
  return (
    <Routes>
      <Route path="verify" element={<VerifyView />} />
      <Route path="*" element={state.status === 'signedIn' ? <SignedInRoutes /> : <SignInView />} />
    </Routes>
  )
}

export function ClientPortalPage() {
  return (
    <PortalSessionProvider>
      <PortalRoutes />
    </PortalSessionProvider>
  )
}
