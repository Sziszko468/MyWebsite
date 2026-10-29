import { lazy, Suspense, type ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { DEFAULT_LANGUAGE } from './i18n/config'
import { localizedPath } from './i18n/paths'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { PAGES, projectIdOfPage, type NavPageId, type PageDef } from './routes/pages'
import { LanguageLayout } from './routes/LanguageLayout'
import { IntroProvider } from './components/intro/IntroProvider'
import { ThemeProvider } from './theme/ThemeProvider'

// Internal showcase of the design system. `import.meta.env.DEV` is a build-time
// constant, so this page and its code are dropped from production bundles.
const DesignSystemPage = import.meta.env.DEV ? lazy(() => import('./pages/DesignSystemPage')) : null

// A project's page and its three-language content are their own chunk: the home page and the rest of
// the site do not pay for them, and they load when a project is opened.
const ProjectPage = lazy(() => import('./pages/ProjectPage').then((module) => ({ default: module.ProjectPage })))

// The services page carries the packages, the questions and the quote form in three languages, so
// it is a chunk of its own too: the home page does not pay for it.
const ServicesPage = lazy(() => import('./pages/ServicesPage').then((module) => ({ default: module.ServicesPage })))

// What renders at each registered page. Paths and languages live in routes/pages.ts.
// Work, About, Lab and Contact are placeholders until their pages are built; a project's
// details page is the same component for every project, fed by content/projectDetails.
const PAGE_ELEMENTS: Record<NavPageId | 'designSystem', ReactElement | null> = {
  home: <HomePage />,
  work: <PlaceholderPage pageId="work" />,
  services: (
    <Suspense fallback={<div style={{ minHeight: '70svh' }} aria-hidden="true" />}>
      <ServicesPage />
    </Suspense>
  ),
  about: <PlaceholderPage pageId="about" />,
  lab: <PlaceholderPage pageId="lab" />,
  contact: <PlaceholderPage pageId="contact" />,
  designSystem: DesignSystemPage && (
    <Suspense fallback={null}>
      <DesignSystemPage />
    </Suspense>
  ),
}

function elementFor(page: PageDef): ReactElement | null {
  const project = projectIdOfPage(page.id)
  if (project) {
    return (
      <Suspense fallback={<div style={{ minHeight: '70svh' }} aria-hidden="true" />}>
        <ProjectPage projectId={project} />
      </Suspense>
    )
  }
  return PAGE_ELEMENTS[page.id as NavPageId | 'designSystem']
}

export default function App() {
  return (
    <ThemeProvider>
      <IntroProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to={localizedPath(DEFAULT_LANGUAGE)} replace />} />
            <Route path=":lang" element={<LanguageLayout />}>
              {PAGES.map((page) =>
                page.path === '/' ? (
                  <Route key={page.id} index element={elementFor(page)} />
                ) : (
                  <Route key={page.id} path={page.path.slice(1)} element={elementFor(page)} />
                ),
              )}
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </IntroProvider>
    </ThemeProvider>
  )
}
