import { projectDetails } from '../content/projectDetails'
import { projects } from '../content/projects'
import { SEED_CATEGORIES, slugOf } from '../content/projectsExport'
import type { Trilingual } from '../content/trilingual'
import { LANGUAGES, type Language } from '../i18n/config'
import { dictionaries } from '../i18n/dictionaries'
import type { ProjectCard, ProjectCategory, ProjectRecord } from './types'

/**
 * The website's own four projects as `ProjectCard`s and `ProjectRecord`s: what it shows before the backend has answered and
 * when no backend is configured or reachable. It is built from the same static content the backend's seed is made from, so
 * a site with no backend is exactly the site it was before projects were managed in the administration.
 */

const tri = (read: (lang: Language) => string): Trilingual => Object.fromEntries(LANGUAGES.map((lang) => [lang, read(lang)])) as Trilingual
const items = (lang: Language) => dictionaries[lang].home.work.items as Record<string, { category: string; description: string }>

const CATEGORY_OF: Record<string, string> = { spendly: 'apps', bookinghub: 'apps', logistics: 'platforms', hollandia: 'concepts' }

export const staticCategories: readonly ProjectCategory[] = SEED_CATEGORIES.map((category) => ({ key: category.key, label: { ...category.label } }))

export const staticCards: readonly ProjectCard[] = projects.map((entry) => ({
  slug: slugOf(entry),
  name: tri(() => entry.name),
  label: tri((lang) => items(lang)[entry.id].category),
  description: tri((lang) => items(lang)[entry.id].description),
  category: CATEGORY_OF[entry.id] ?? 'apps',
  status: entry.status,
  tags: entry.tags,
  layout: entry.layout,
  mockup: entry.mockup,
  image: entry.image ? { ...entry.image, alt: tri((lang) => dictionaries[lang].home.work.imageAlt.replace('{name}', entry.name)) } : null,
  detailPath: entry.detailPath !== null && projectDetails[entry.id] !== undefined ? `/work/${slugOf(entry)}` : null,
  demoUrl: entry.demoUrl,
  featured: true,
}))

const withPage = staticCards.filter((card) => card.detailPath !== null)

export function staticRecord(slug: string): ProjectRecord | null {
  const card = staticCards.find((candidate) => candidate.slug === slug)
  const entry = projects.find((candidate) => slugOf(candidate) === slug)
  const detail = entry ? projectDetails[entry.id] : undefined
  if (!card || !detail || card.detailPath === null) return null
  const index = withPage.findIndex((candidate) => candidate.slug === slug)
  const neighbours = withPage.length > 1 ? { previous: withPage[(index - 1 + withPage.length) % withPage.length], next: withPage[(index + 1) % withPage.length] } : null
  return { card, detail: { ...detail, id: slug }, neighbours, preview: false }
}
