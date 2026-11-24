import type { ReactElement } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { localizedPath } from './i18n/paths'
import { startingLanguage } from './i18n/preference'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { lazyRoute } from './motion/loading'
import { PAGES, demoSlugOfPage, labIdOfPage, packageIdOfPage, projectIdOfPage, serviceIdOfPage, type AiPageId, type ConsultationPageId, type CustomerPageId, type LegalPageId, type NavPageId, type PageDef, type PlaygroundPageId, type PortalPageId, type ShopPageId } from './routes/pages'
import { LanguageLayout } from './routes/LanguageLayout'
import { IntroProvider } from './components/intro/IntroProvider'
import { ThemeProvider } from './theme/ThemeProvider'

// Internal showcase of the design system. `import.meta.env.DEV` is a build-time
// constant, so this page and its code are dropped from production bundles.
const DesignSystemPage = import.meta.env.DEV ? lazyRoute(() => import('./pages/DesignSystemPage')) : null

// A project's page and its three-language content are their own chunk: the home page and the rest of
// the site do not pay for them, and they load when a project is opened.
const ProjectRoute = lazyRoute(() => import('./pages/ProjectPage').then((module) => ({ default: module.ProjectRoute })))

// A project's interactive demo (PROMPT 35): the frame and each demo are chunks of their own, loaded only when a demo page is opened.
const DemoRoute = lazyRoute(() => import('./demos/DemoPage').then((module) => ({ default: module.DemoRoute })))

// The portfolio page: the published projects as cards, filtered by category.
const WorkPage = lazyRoute(() => import('./pages/WorkPage').then((module) => ({ default: module.WorkPage })))

// The shop (the services page, a service's product page, the request builder and the cart) carries
// its texts in three languages, so each page is a chunk of its own: the home page does not pay for
// them, and none of them loads Three.js or any other 3D code.
const ServicesPage = lazyRoute(() => import('./pages/ServicesPage').then((module) => ({ default: module.ServicesPage })))
const ServiceDetailPage = lazyRoute(() => import('./pages/ServiceDetailPage').then((module) => ({ default: module.ServiceDetailPage })))
const PackagePage = lazyRoute(() => import('./pages/PackagePage').then((module) => ({ default: module.PackagePage })))
const FullExperiencePage = lazyRoute(() => import('./pages/FullExperiencePage').then((module) => ({ default: module.FullExperiencePage })))
const FullExperienceStartPage = lazyRoute(() => import('./pages/FullExperienceStartPage').then((module) => ({ default: module.FullExperienceStartPage })))
const ConfiguratorPage = lazyRoute(() => import('./pages/ConfiguratorPage').then((module) => ({ default: module.ConfiguratorPage })))
const CartPage = lazyRoute(() => import('./pages/CartPage').then((module) => ({ default: module.CartPage })))

// The About and Contact pages are chunks of their own too: the story, the skills and the two forms
// load when one of them is opened.
const AboutPage = lazyRoute(() => import('./pages/AboutPage').then((module) => ({ default: module.AboutPage })))
const ContactPage = lazyRoute(() => import('./pages/ContactPage').then((module) => ({ default: module.ContactPage })))

// CONTROL ROOM AI's page: the workspace, the AI SDK's client and the conversation load only here (or when the floating assistant is opened).
const ControlRoomPage = lazyRoute(() => import('./pages/ControlRoomPage').then((module) => ({ default: module.ControlRoomPage })))

// The customer's private pages (a quotation, a request's status): their own chunk, loaded only when one of their links is opened.
const QuotePage = lazyRoute(() => import('./pages/CustomerPages').then((module) => ({ default: module.QuotePage })))
const RequestStatusPage = lazyRoute(() => import('./pages/CustomerPages').then((module) => ({ default: module.RequestStatusPage })))
const IncompleteLinkPage = lazyRoute(() => import('./pages/CustomerPages').then((module) => ({ default: module.IncompleteLinkPage })))

// The consultation booking (the booking page, and a customer's own booking behind a secret link): their own chunks.
const ConsultationPage = lazyRoute(() => import('./pages/ConsultationPage').then((module) => ({ default: module.ConsultationPage })))
const BookingPage = lazyRoute(() => import('./pages/BookingPage').then((module) => ({ default: module.BookingPage })))
const IncompleteBookingLinkPage = lazyRoute(() => import('./pages/BookingPage').then((module) => ({ default: module.IncompleteBookingLinkPage })))

// The client portal (PROMPT 25): a signed-in customer's own pages, a chunk of its own, loaded only when /client-portal is opened.
const ClientPortalPage = lazyRoute(() => import('./pages/ClientPortalPage').then((module) => ({ default: module.ClientPortalPage })))

// The privacy and cookie notice carries its text in three languages: its own chunk too.
const PrivacyPage = lazyRoute(() => import('./pages/PrivacyPage').then((module) => ({ default: module.PrivacyPage })))

// The Lab (its interactive first screen, the gallery) and each experiment are chunks of their own;
// Three.js loads only once a Lab stage is on screen, and the home page never pays for any of it.
const LabPage = lazyRoute(() => import('./pages/LabPage').then((module) => ({ default: module.LabPage })))
const LabExperimentPage = lazyRoute(() =>
  import('./pages/LabExperimentPage').then((module) => ({ default: module.LabExperimentPage })),
)

// The Design System Playground (PROMPT 36): a tool of the Lab with its own chunk, loaded only when /lab/design-system is opened.
const DesignPlaygroundPage = lazyRoute(() => import('./pages/DesignPlaygroundPage').then((module) => ({ default: module.DesignPlaygroundPage })))

// What renders at each registered page. Paths and languages live in routes/pages.ts.
// Work is a placeholder until its page is built; a project's
// details page is the same component for every project, fed by content/projectDetails.
// The pages that are chunks carry no Suspense of their own: the one boundary above the page frame
// (routes/LanguageLayout.tsx) stays mounted from page to page, so a navigation keeps the page on
// screen until the next one's code has arrived instead of swapping it for a blank placeholder.
const PAGE_ELEMENTS: Record<NavPageId | ShopPageId | LegalPageId | AiPageId | CustomerPageId | ConsultationPageId | PortalPageId | PlaygroundPageId | 'designSystem', ReactElement | null> = {
  home: <HomePage />,
  work: <WorkPage />,
  services: <ServicesPage />,
  configure: <ConfiguratorPage />,
  cart: <CartPage />,
  'full-experience': <FullExperiencePage />,
  'full-experience-start': <FullExperienceStartPage />,
  about: <AboutPage />,
  lab: <LabPage />,
  'design-playground': <DesignPlaygroundPage />,
  contact: <ContactPage />,
  privacy: <PrivacyPage />,
  'control-room': <ControlRoomPage />,
  // The registered paths are the bare ones: a visit without the secret says where to find it. The real ones, with the secret, are the two routes below.
  'customer-quote': <IncompleteLinkPage />,
  'customer-request': <IncompleteLinkPage />,
  consultation: <ConsultationPage />,
  'customer-booking': <IncompleteBookingLinkPage />,
  // The portal is one route with a splat (below): this entry only says the page exists.
  'client-portal': null,
  designSystem: DesignSystemPage && <DesignSystemPage />,
}

function elementFor(page: PageDef): ReactElement | null {
  const service = serviceIdOfPage(page.id)
  if (service) return <ServiceDetailPage serviceId={service} />
  const pack = packageIdOfPage(page.id)
  if (pack) return <PackagePage packageId={pack} />
  const experiment = labIdOfPage(page.id)
  if (experiment) return <LabExperimentPage id={experiment} />
  return PAGE_ELEMENTS[page.id as NavPageId | ShopPageId | LegalPageId | AiPageId | CustomerPageId | ConsultationPageId | PortalPageId | PlaygroundPageId | 'designSystem']
}

export default function App() {
  return (
    <ThemeProvider>
      <IntroProvider>
        <BrowserRouter>
          <Routes>
            {/*
              "/" names no language. At the edge the Worker already sent the visitor to the language of their saved choice or their
              country (worker/); this is the same rule for a host without it: the saved choice, else English.
            */}
            <Route path="/" element={<Navigate to={localizedPath(startingLanguage())} replace />} />
            <Route path=":lang" element={<LanguageLayout />}>
              {/* A project's page is one route for every slug: the data decides which project (or "not found") it shows. */}
              <Route path="work/preview/link/:token" element={<ProjectRoute linkPreview />} />
              <Route path="work/preview/:id" element={<ProjectRoute preview />} />
              <Route path="work/:slug" element={<ProjectRoute />} />
              <Route path="work/:slug/demo" element={<DemoRoute />} />
              <Route path="quote/:token" element={<QuotePage />} />
              <Route path="request/:token" element={<RequestStatusPage />} />
              <Route path="consultation/booking/:token" element={<BookingPage />} />
              {/* The client portal and everything below it: one page, so the signed-in state stays mounted while a customer moves around. */}
              <Route path="client-portal/*" element={<ClientPortalPage />} />
              {PAGES.filter((page) => projectIdOfPage(page.id) === null && demoSlugOfPage(page.id) === null && page.id !== 'client-portal').map((page) =>
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
