import { Component, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { ThemeProvider } from '../theme/ThemeProvider'
import { ConfirmProvider } from './components/Confirm'
import { AdminShell } from './components/AdminShell'
import { ToastProvider } from './components/Toast'
import { ErrorState, LoadingState } from './components/states'
import { useText } from './i18n'
import { ContentPage } from './pages/ContentPage'
import { DashboardPage } from './pages/DashboardPage'
import { FaqEditPage } from './pages/FaqEditPage'
import { InquiriesPage } from './pages/InquiriesPage'
import { InquiryDetailPage } from './pages/InquiryDetailPage'
import { LoginPage } from './pages/LoginPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { NotificationsPage } from './pages/NotificationsPage'
import { QuoteDetailPage } from './pages/QuoteDetailPage'
import { ProjectEditPage } from './pages/ProjectEditPage'
import { ProjectSettingsPage } from './pages/ProjectSettingsPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { QuotesPage } from './pages/QuotesPage'
import { TextsPage } from './pages/TextsPage'
import { ExtraEditPage, PackageEditPage, ServiceEditPage } from './pages/CatalogEditPages'
import { AiPage } from './pages/AiPage'
import { ShopComparisonPage } from './pages/ShopComparisonPage'
import { ShopOfferPage } from './pages/ShopOfferPage'
import { ServicesPage } from './pages/ServicesPage'
import { SettingsPage } from './pages/SettingsPage'
import { TranslationsPage } from './pages/TranslationsPage'
import { SessionProvider, useGate } from './session/SessionProvider'
import shell from './styles/shell.module.scss'

/**
 * A screen that throws must not take the application down with a blank page: the rest of the frame stays, and the person
 * is told, in their language, with a way to reload. (The error itself goes to the browser's console, not to the screen.)
 */
class Boundary extends Component<{ fallback: () => ReactNode; children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  override componentDidCatch(error: unknown) {
    console.error('The administration screen failed', error)
  }
  override render() {
    return this.state.failed ? this.props.fallback() : this.props.children
  }
}

function Crashed() {
  const t = useText()
  return (
    <div className={shell.fullScreen}>
      <ErrorState level={1} error={null} title={t.errorBoundary.title} onRetry={() => window.location.reload()} />
    </div>
  )
}

function Gate() {
  const { state, session, retry } = useGate()
  const t = useText()

  if (state.status === 'loading') {
    return (
      <div className={shell.fullScreen}>
        <LoadingState label={t.app.loading} />
      </div>
    )
  }
  if (state.status === 'failed') {
    return (
      <div className={shell.fullScreen}>
        <ErrorState level={1} error={state.error} title={t.app.startFailed} onRetry={retry} />
      </div>
    )
  }
  if (state.status === 'anonymous' || !session) return <LoginPage reason={state.status === 'anonymous' ? state.reason : null} />

  return (
    <Boundary fallback={() => <Crashed />}>
      <Routes>
        <Route element={<AdminShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="inquiries" element={<InquiriesPage />} />
          <Route path="inquiries/:id" element={<InquiryDetailPage />} />
          <Route path="quotes" element={<QuotesPage />} />
          <Route path="quotes/:id" element={<QuoteDetailPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="services/new/service" element={<ServiceEditPage />} />
          <Route path="services/service/:slug" element={<ServiceEditPage />} />
          <Route path="services/new/package" element={<PackageEditPage />} />
          <Route path="services/package/:code" element={<PackageEditPage />} />
          <Route path="services/new/extra" element={<ExtraEditPage />} />
          <Route path="services/extra/:code" element={<ExtraEditPage />} />
          <Route path="comparison" element={<ShopComparisonPage />} />
          <Route path="full-experience" element={<ShopOfferPage />} />
          <Route path="ai" element={<AiPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/new" element={<ProjectEditPage />} />
          <Route path="projects/settings" element={<ProjectSettingsPage />} />
          <Route path="projects/:id" element={<ProjectEditPage />} />
          <Route path="texts" element={<TextsPage />} />
          <Route path="content" element={<ContentPage />} />
          <Route path="content/new" element={<FaqEditPage />} />
          <Route path="content/faq/:slug" element={<FaqEditPage />} />
          <Route path="translations" element={<TranslationsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          {/* The sign-in is a gate, not a page: someone who signed in at /admin/login (a bookmark, a typed address) goes on to the dashboard. */}
          <Route path="login" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Boundary>
  )
}

/** Everything the administration is, from the theme to the routes. The router comes first: even the sign-in uses links and buttons that navigate. */
export function AdminApp() {
  return (
    <ThemeProvider>
      <BrowserRouter basename="/admin">
        <SessionProvider>
          <ToastProvider>
            <ConfirmProvider>
              <Gate />
            </ConfirmProvider>
          </ToastProvider>
        </SessionProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

