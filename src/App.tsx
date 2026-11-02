import { lazy, Suspense, type ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { DEFAULT_LANGUAGE } from './i18n/config'
import { localizedPath } from './i18n/paths'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { PAGES, labIdOfPage, projectIdOfPage, serviceIdOfPage, type NavPageId, type PageDef, type ShopPageId } from './routes/pages'
import { LanguageLayout } from './routes/LanguageLayout'
import { IntroProvider } from './components/intro/IntroProvider'
import { ShopFallback } from './components/shop/ShopFallback'
import { ThemeProvider } from './theme/ThemeProvider'

// Internal showcase of the design system. `import.meta.env.DEV` is a build-time
// constant, so this page and its code are dropped from production bundles.
const DesignSystemPage = import.meta.env.DEV ? lazy(() => import('./pages/DesignSystemPage')) : null

// A project's page and its three-language content are their own chunk: the home page and the rest of
// the site do not pay for them, and they load when a project is opened.
const ProjectPage = lazy(() => import('./pages/ProjectPage').then((module) => ({ default: module.ProjectPage })))

// The shop (the services page, a service's product page, the request builder and the cart) carries
// its texts in three languages, so each page is a chunk of its own: the home page does not pay for
// them, and none of them loads Three.js or any other 3D code.
const ServicesPage = lazy(() => import('./pages/ServicesPage').then((module) => ({ default: module.ServicesPage })))
const ServiceDetailPage = lazy(() => import('./pages/ServiceDetailPage').then((module) => ({ default: module.ServiceDetailPage })))
const ConfiguratorPage = lazy(() => import('./pages/ConfiguratorPage').then((module) => ({ default: module.ConfiguratorPage })))
const CartPage = lazy(() => import('./pages/CartPage').then((module) => ({ default: module.CartPage })))

// The About and Contact pages are chunks of their own too: the story, the skills and the two forms
// load when one of them is opened.
const AboutPage = lazy(() => import('./pages/AboutPage').then((module) => ({ default: module.AboutPage })))
const ContactPage = lazy(() => import('./pages/ContactPage').then((module) => ({ default: module.ContactPage })))

// The Lab (its interactive first screen, the gallery) and each experiment are chunks of their own;
// Three.js loads only once a Lab stage is on screen, and the home page never pays for any of it.
const LabPage = lazy(() => import('./pages/LabPage').then((module) => ({ default: module.LabPage })))
const LabExperimentPage = lazy(() =>
  import('./pages/LabExperimentPage').then((module) => ({ default: module.LabExperimentPage })),
)

const PageFallback = () => <div style={{ minHeight: '70svh' }} aria-hidden="true" />

// What renders at each registered page. Paths and languages live in routes/pages.ts.
// Work is a placeholder until its page is built; a project's
// details page is the same component for every project, fed by content/projectDetails.
const PAGE_ELEMENTS: Record<NavPageId | ShopPageId | 'designSystem', ReactElement | null> = {
  home: <HomePage />,
  work: <PlaceholderPage pageId="work" />,
  services: (
    <Suspense fallback={<ShopFallback />}>
      <ServicesPage />
    </Suspense>
  ),
  configure: (
    <Suspense fallback={<ShopFallback />}>
      <ConfiguratorPage />
    </Suspense>
  ),
  cart: (
    <Suspense fallback={<ShopFallback />}>
      <CartPage />
    </Suspense>
  ),
  about: (
    <Suspense fallback={<PageFallback />}>
      <AboutPage />
    </Suspense>
  ),
  lab: (
    <Suspense fallback={<PageFallback />}>
      <LabPage />
    </Suspense>
  ),
  contact: (
    <Suspense fallback={<PageFallback />}>
      <ContactPage />
    </Suspense>
  ),
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
      <Suspense fallback={<PageFallback />}>
        <ProjectPage projectId={project} />
      </Suspense>
    )
  }
  const service = serviceIdOfPage(page.id)
  if (service) {
    return (
      <Suspense fallback={<ShopFallback />}>
        <ServiceDetailPage serviceId={service} />
      </Suspense>
    )
  }
  const experiment = labIdOfPage(page.id)
  if (experiment) {
    return (
      <Suspense fallback={<PageFallback />}>
        <LabExperimentPage id={experiment} />
      </Suspense>
    )
  }
  return PAGE_ELEMENTS[page.id as NavPageId | ShopPageId | 'designSystem']
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
