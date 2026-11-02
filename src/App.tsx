import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { DEFAULT_LANGUAGE } from './i18n/config'
import { localizedPath } from './i18n/paths'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { lazyRoute } from './motion/loading'
import { PAGES, labIdOfPage, projectIdOfPage, serviceIdOfPage, type NavPageId, type PageDef, type ShopPageId } from './routes/pages'
import { LanguageLayout } from './routes/LanguageLayout'
import { IntroProvider } from './components/intro/IntroProvider'
import { ThemeProvider } from './theme/ThemeProvider'

// Internal showcase of the design system. `import.meta.env.DEV` is a build-time
// constant, so this page and its code are dropped from production bundles.
const DesignSystemPage = import.meta.env.DEV ? lazyRoute(() => import('./pages/DesignSystemPage')) : null

// A project's page and its three-language content are their own chunk: the home page and the rest of
// the site do not pay for them, and they load when a project is opened.
const ProjectPage = lazyRoute(() => import('./pages/ProjectPage').then((module) => ({ default: module.ProjectPage })))

// The shop (the services page, a service's product page, the request builder and the cart) carries
// its texts in three languages, so each page is a chunk of its own: the home page does not pay for
// them, and none of them loads Three.js or any other 3D code.
const ServicesPage = lazyRoute(() => import('./pages/ServicesPage').then((module) => ({ default: module.ServicesPage })))
const ServiceDetailPage = lazyRoute(() => import('./pages/ServiceDetailPage').then((module) => ({ default: module.ServiceDetailPage })))
const ConfiguratorPage = lazyRoute(() => import('./pages/ConfiguratorPage').then((module) => ({ default: module.ConfiguratorPage })))
const CartPage = lazyRoute(() => import('./pages/CartPage').then((module) => ({ default: module.CartPage })))

// The About and Contact pages are chunks of their own too: the story, the skills and the two forms
// load when one of them is opened.
const AboutPage = lazyRoute(() => import('./pages/AboutPage').then((module) => ({ default: module.AboutPage })))
const ContactPage = lazyRoute(() => import('./pages/ContactPage').then((module) => ({ default: module.ContactPage })))

// The Lab (its interactive first screen, the gallery) and each experiment are chunks of their own;
// Three.js loads only once a Lab stage is on screen, and the home page never pays for any of it.
const LabPage = lazyRoute(() => import('./pages/LabPage').then((module) => ({ default: module.LabPage })))
const LabExperimentPage = lazyRoute(() =>
  import('./pages/LabExperimentPage').then((module) => ({ default: module.LabExperimentPage })),
)

// What renders at each registered page. Paths and languages live in routes/pages.ts.
// Work is a placeholder until its page is built; a project's
// details page is the same component for every project, fed by content/projectDetails.
// The pages that are chunks carry no Suspense of their own: the one boundary above the page frame
// (routes/LanguageLayout.tsx) stays mounted from page to page, so a navigation keeps the page on
// screen until the next one's code has arrived instead of swapping it for a blank placeholder.
const PAGE_ELEMENTS: Record<NavPageId | ShopPageId | 'designSystem', ReactElement | null> = {
  home: <HomePage />,
  work: <PlaceholderPage pageId="work" />,
  services: <ServicesPage />,
  configure: <ConfiguratorPage />,
  cart: <CartPage />,
  about: <AboutPage />,
  lab: <LabPage />,
  contact: <ContactPage />,
  designSystem: DesignSystemPage && <DesignSystemPage />,
}

function elementFor(page: PageDef): ReactElement | null {
  const project = projectIdOfPage(page.id)
  if (project) return <ProjectPage projectId={project} />
  const service = serviceIdOfPage(page.id)
  if (service) return <ServiceDetailPage serviceId={service} />
  const experiment = labIdOfPage(page.id)
  if (experiment) return <LabExperimentPage id={experiment} />
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
