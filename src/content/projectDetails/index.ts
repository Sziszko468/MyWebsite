import { projects, type ProjectEntry, type ProjectId } from '../projects'
import { bookinghub } from './bookinghub'
import { logistics } from './logistics'
import { spendly } from './spendly'
import type { ProjectDetail } from './types'

/**
 * The projects that have a page of their own. A project is missing here (and has `detailPath:
 * null` in projects.ts) until its repository can back a page: Hollandia Kezdőknek has none yet,
 * so its card says "the details page is not ready" and links nowhere.
 */
export const projectDetails: Partial<Record<ProjectId, ProjectDetail>> = { spendly, bookinghub, logistics }

export function getProjectDetail(id: ProjectId): ProjectDetail | undefined {
  return projectDetails[id]
}

/** The projects with a details page, in the order of the home page: the order of "previous" and "next". */
export function publishedProjects(): ProjectEntry[] {
  return projects.filter((project) => project.detailPath !== null && projectDetails[project.id] !== undefined)
}

/** The project before and after `id` among the published ones, wrapping round. `null` when there is no other one. */
export function neighbours(id: ProjectId): { previous: ProjectEntry; next: ProjectEntry } | null {
  const list = publishedProjects()
  const index = list.findIndex((project) => project.id === id)
  if (index === -1 || list.length < 2) return null
  return { previous: list[(index - 1 + list.length) % list.length], next: list[(index + 1) % list.length] }
}
