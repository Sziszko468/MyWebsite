import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { DEFAULT_LANGUAGE } from './i18n/config'
import { localizedPath } from './i18n/paths'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { LanguageLayout } from './routes/LanguageLayout'
import { ThemeProvider } from './theme/ThemeProvider'

// Internal showcase of the design system. `import.meta.env.DEV` is a build-time
// constant, so this page and its code are dropped from production bundles.
const DesignSystemPage = import.meta.env.DEV ? lazy(() => import('./pages/DesignSystemPage')) : null

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to={localizedPath(DEFAULT_LANGUAGE)} replace />} />
          <Route path=":lang" element={<LanguageLayout />}>
            <Route index element={<HomePage />} />
            {DesignSystemPage && (
              <Route
                path="design-system"
                element={
                  <Suspense fallback={null}>
                    <DesignSystemPage />
                  </Suspense>
                }
              />
            )}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
