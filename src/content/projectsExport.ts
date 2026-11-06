import { LANGUAGES, type Language } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import { projectDetails } from './projectDetails'
import type { ProjectDetail } from './projectDetails/types'
import { projects, type ProjectEntry } from './projects'
import type { Trilingual } from './trilingual'

/**
 * The website's own projects as data for the backend (server/seed/projects.seed.json): the cards of the home page and the
 * pages in content/projectDetails, in the shape the server's project document has (server/src/modules/projects/content.ts).
 * The static content stays the source of the FIRST load: `npm run catalog:seed-export` writes the JSON, a test
 * (server/test/contract.test.ts) fails when the file is out of date, and the server loads it into an empty projects table.
 * After that the database is the master copy and the administrator edits the projects there. The same function is the
 * website's own fallback when no backend answers (src/projects/static.ts), so there is one description of these four projects.
 */

const tri = (read: (lang: Language) => string): Trilingual => Object.fromEntries(LANGUAGES.map((lang) => [lang, read(lang)])) as Trilingual
const same = (value: string): Trilingual => tri(() => value)
const empty = (): Trilingual => same('')

/** The project categories the site starts with. Starting copy for the owner to confirm; they are edited in the administration. */
export const SEED_CATEGORIES = [
  { key: 'apps', label: { hu: 'Webes és mobilalkalmazások', en: 'Web and mobile apps', nl: 'Web- en mobiele apps' } },
  { key: 'platforms', label: { hu: 'Platformok és rendszerek', en: 'Platforms and systems', nl: 'Platformen en systemen' } },
  { key: 'concepts', label: { hu: 'Koncepciók és útmutatók', en: 'Concepts and guides', nl: 'Concepten en gidsen' } },
] as const

const CATEGORY_OF: Record<string, string> = { spendly: 'apps', bookinghub: 'apps', logistics: 'platforms', hollandia: 'concepts' }

/** The address of a project's page, without `/work/`: what the router and the database call its slug. */
export const slugOf = (entry: ProjectEntry): string => (entry.detailPath ? entry.detailPath.replace(/^\/work\//, '') : entry.id)

export interface SeedProject {
  slug: string
  status: 'published'
  featured: boolean
  position: number
  category: string
  content: Record<string, unknown>
}

const cardText = (id: string, lang: Language, field: 'category' | 'description'): string =>
  (dictionaries[lang].home.work.items as Record<string, { category: string; description: string }>)[id][field]

function content(entry: ProjectEntry, detail: ProjectDetail | undefined): Record<string, unknown> {
  const description = tri((lang) => cardText(entry.id, lang, 'description'))
  const galleryPath = (id: string | undefined) => detail?.gallery.find((image) => image.id === id)?.src
  return {
    title: same(entry.name),
    cardLabel: tri((lang) => cardText(entry.id, lang, 'category')),
    cardDescription: description,
    summary: detail ? detail.summary : description,
    detailPage: detail !== undefined,
    projectStatus: entry.status,
    accent: detail?.accent ?? 'blue',
    hero: detail?.hero ?? 'split',
    mockup: entry.mockup,
    layout: entry.layout,
    tags: [...entry.tags],
    stack: detail ? detail.stack.map((row) => ({ group: row.group, items: [...row.items] })) : [],
    repoName: detail?.repoName ?? '',
    role: detail?.role ?? empty(),
    thumbnail: entry.image ? { mediaPath: entry.image.src, alt: tri((lang) => dictionaries[lang].home.work.imageAlt.replace('{name}', entry.name)) } : null,
    gallery: (detail?.gallery ?? []).map((image) => ({ mediaPath: image.src, device: image.device, alt: image.alt, caption: image.caption, hero: image.hero === true })),
    galleryNote: detail?.galleryNote ?? empty(),
    overview: detail ? detail.overview : { what: empty(), audience: empty(), problem: empty(), goal: empty() },
    challenges: (detail?.challenges ?? []).map((item) => ({ title: item.title, problem: item.problem, solution: item.solution, source: item.source })),
    approach: (detail?.approach ?? []).map((item) => ({ title: item.title, text: item.text })),
    architectureText: empty(),
    architecture: detail?.architecture ? JSON.parse(JSON.stringify(detail.architecture)) : null,
    features: (detail?.features ?? []).map((item) => ({ title: item.title, text: item.text, status: item.status, ...(galleryPath(item.image) ? { imageMediaPath: galleryPath(item.image) } : {}) })),
    limits: [...(detail?.limits ?? [])],
    decisions: (detail?.decisions ?? []).map((item) => ({ title: item.title, text: item.text })),
    learned: [...(detail?.learned ?? [])],
    results: [],
    next: [...(detail?.next ?? [])],
    // A link is only shown once it has been marked as checked; the website's own pages have no demo, and a source address only where the owner gave one.
    links: { demo: entry.demoUrl ? { url: entry.demoUrl, verified: true } : null, source: detail?.sourceUrl ? { url: detail.sourceUrl, verified: true } : null, extra: null, video: null },
    hidden: [],
  }
}

export interface ProjectsSeed {
  categories: typeof SEED_CATEGORIES
  /** Pictures that ship with the website; the script adds each file's size and hash. */
  media: Array<{ path: string; mime: 'image/webp'; width: number; height: number }>
  projects: SeedProject[]
}

export function buildProjectsSeed(): ProjectsSeed {
  const media = new Map<string, { path: string; mime: 'image/webp'; width: number; height: number }>()
  const out: SeedProject[] = projects.map((entry, index) => {
    const detail = projectDetails[entry.id]
    for (const image of detail?.gallery ?? []) media.set(image.src, { path: image.src, mime: 'image/webp', width: image.width, height: image.height })
    if (entry.image) media.set(entry.image.src, { path: entry.image.src, mime: 'image/webp', width: entry.image.width, height: entry.image.height })
    return { slug: slugOf(entry), status: 'published', featured: true, position: index + 1, category: CATEGORY_OF[entry.id] ?? 'apps', content: content(entry, detail) }
  })
  return { categories: SEED_CATEGORIES, media: [...media.values()], projects: out }
}
