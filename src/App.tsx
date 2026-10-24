import { lazy, Suspense, type ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { DEFAULT_LANGUAGE } from './i18n/config'
import { localizedPath } from './i18n/paths'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { PAGES, type PageId } from './routes/pages'
import { LanguageLayout } from './routes/LanguageLayout'
import { ThemeProvider } from './theme/ThemeProvider'

// Internal showcase of the design system. `import.meta.env.DEV` is a build-time
// constant, so this page and its code are dropped from production bundles.
const DesignSystemPage = import.meta.env.DEV ? lazy(() => import('./pages/DesignSystemPage')) : null

// What renders at each registered page. Paths and languages live in routes/pages.ts.
// Work, Services, About, Lab and Contact are placeholders until their pages are built.
const PAGE_ELEMENTS: Record<PageId, ReactElement | null> = {
  home: <HomePage />,
  work: <PlaceholderPage pageId="work" />,
  services: <PlaceholderPage pageId="services" />,
  about: <PlaceholderPage pageId="about" />,
  lab: <PlaceholderPage pageId="lab" />,
  contact: <PlaceholderPage pageId="contact" />,
  designSystem: DesignSystemPage && (
    <Suspense fallback={null}>
      <DesignSystemPage />
    </Suspense>
  ),
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to={localizedPath(DEFAULT_LANGUAGE)} replace />} />
          <Route path=":lang" element={<LanguageLayout />}>
            {PAGES.map((page) =>
              page.path === '/' ? (
                <Route key={page.id} index element={PAGE_ELEMENTS[page.id]} />
              ) : (
                <Route key={page.id} path={page.path.slice(1)} element={PAGE_ELEMENTS[page.id]} />
              ),
            )}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
