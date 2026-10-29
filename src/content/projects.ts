import type { ProjectStatus } from '../components/Badge/Badge'

/**
 * The projects shown in "Selected work", in this order. Edit this file to change what the home
 * page says; the words (category, description) live in the dictionaries under
 * `home.work.items.<id>`, in all three languages.
 *
 * Nothing here is invented. Where a fact could be checked against the project's own repository
 * it was, and the evidence is noted; where it could not, the field is left empty or on its most
 * cautious value.
 */

export type ProjectId = 'spendly' | 'bookinghub' | 'hollandia' | 'logistics'

/** Which generated concept sketch stands in for a screenshot (see ProjectMockup). */
export type MockupKind = 'finance' | 'booking' | 'guide' | 'logistics'

/** How the card is composed on the home page. */
export type ProjectLayout = 'lead' | 'offset' | 'compact' | 'wide'

export interface ProjectImage {
  /** A real screenshot, served from /public, e.g. '/projects/spendly.webp'. */
  src: string
  width: number
  height: number
}

export interface ProjectEntry {
  id: ProjectId
  /** The project's name: a proper noun, shown as is in every language. */
  name: string
  status: ProjectStatus
  /** Technologies, as proper nouns. Only what the project's own code or documentation confirms. */
  tags: readonly string[]
  layout: ProjectLayout
  mockup: MockupKind
  /**
   * A real screenshot. While `null`, the card shows a generated concept sketch, labelled as
   * one, and never a stock image presented as the app.
   */
  image: ProjectImage | null
  /**
   * Language-free path of the project's details page, e.g. '/work/spendly'. Its content is in
   * content/projectDetails/. `null` until a page exists: the card is then not a link and says so.
   */
  detailPath: string | null
  /** Full https:// address of a live demo. `null` unless one is running. */
  demoUrl: string | null
}

export const projects: readonly ProjectEntry[] = [
  {
    id: 'spendly',
    name: 'Spendly',
    // Spendly/README.md: "a full-stack personal finance app built as a production-style portfolio
    // project"; Django 5.2 REST API + React 19 web app + Expo (React Native) mobile app, PostgreSQL 16,
    // Docker Compose. No live address is documented, so it is not marked live.
    status: 'demo',
    tags: ['React', 'TypeScript', 'Django REST Framework', 'PostgreSQL', 'React Native', 'Docker'],
    layout: 'lead',
    mockup: 'finance',
    image: null,
    detailPath: '/work/spendly',
    demoUrl: null,
  },
  {
    id: 'bookinghub',
    name: 'BookingHub',
    // Bookingsite/booking-app: package.json has next 16, react 19, typescript 5, tailwindcss 3. The
    // README describes demo credentials, a test mode for e-mail and browser-local storage "ready
    // for backend migration": a working demo, not a production system.
    status: 'demo',
    tags: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS'],
    layout: 'offset',
    mockup: 'booking',
    image: null,
    detailPath: '/work/bookinghub',
    demoUrl: null,
  },
  {
    id: 'hollandia',
    name: 'Hollandia Kezdőknek',
    // No repository for this project was found next to this one, so neither its state nor its
    // technologies could be checked. It stays on the most cautious status with no tags until you
    // set them.
    status: 'concept',
    tags: [],
    layout: 'compact',
    mockup: 'guide',
    image: null,
    detailPath: null,
    demoUrl: null,
  },
  {
    id: 'logistics',
    name: 'Logistics Platform',
    // Logextic/README.md: "A portfolio / demo project ... not used in production and has no
    // customers"; FastAPI, PostgreSQL 17, Celery, React 19 + TypeScript + Vite web app, React
    // Native driver app, Docker Compose.
    status: 'demo',
    tags: ['FastAPI', 'React', 'TypeScript', 'PostgreSQL', 'React Native', 'Docker'],
    layout: 'wide',
    mockup: 'logistics',
    image: null,
    detailPath: '/work/logistics-platform',
    demoUrl: null,
  },
]
