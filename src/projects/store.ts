import { useEffect, useSyncExternalStore } from 'react'
import { API_BASE } from '../config/api'
import { getJson, parseCard, parseCategories, parseRecord } from './api'
import { staticCards, staticCategories, staticRecord } from './static'
import type { ProjectCard, ProjectCategory, ProjectRecord } from './types'

/**
 * Where the website's projects come from at run time. With a backend the answer of `/api/projects` is the truth: a project the
 * administrator unpublished is gone, one they published is there, whatever the website was built with. The website's own static
 * content is used only when there is NO answer at all (no backend configured, the network failed, the server errored): then the
 * site still works, as it did before. A 404 is an answer, never a reason to fall back (an unpublished project must not come back
 * from the static copy). One small store, read by `useSyncExternalStore`, so every card and page sees the same data.
 */

export interface ListState {
  status: 'loading' | 'ready'
  cards: readonly ProjectCard[]
  categories: readonly ProjectCategory[]
  /** `api`: the backend answered; `static`: the website's own content. */
  source: 'api' | 'static'
  /** `true` when the list was read through an administrator's preview (drafts included). */
  preview: boolean
}

export type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; record: ProjectRecord; source: 'api' | 'static' }
  | { status: 'missing' }
  | { status: 'unauthorized' }

const STATIC_LIST: ListState = { status: 'ready', cards: staticCards, categories: staticCategories, source: 'static', preview: false }
const LOADING: ListState = { status: 'loading', cards: [], categories: [], source: 'api', preview: false }

let list: ListState = API_BASE === null ? STATIC_LIST : LOADING
const details = new Map<string, DetailState>()
const listeners = new Set<() => void>()
let listKey: 'public' | 'preview' | null = null
const loadingDetails = new Map<string, Promise<void>>()
/** A version number the head (title, description) reads, so it follows a project's data when it arrives. */
let version = 0

function emit(): void {
  version += 1
  for (const listener of listeners) listener()
}
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Loads the list once per mode (public, or the administrator's preview with drafts). */
export function ensureList(preview: boolean): void {
  const wanted = preview ? 'preview' : 'public'
  if (listKey === wanted || API_BASE === null) return
  listKey = wanted
  void (async () => {
    if (preview) {
      const outcome = await getJson('/api/admin/project-preview', { credentials: true })
      if (outcome.kind === 'ok' && typeof outcome.data === 'object' && outcome.data !== null) {
        const data = outcome.data as { projects?: unknown; categories?: unknown }
        const cards = (Array.isArray(data.projects) ? data.projects : []).map(parseCard).filter((card): card is ProjectCard => card !== null)
        list = { status: 'ready', cards, categories: parseCategories(data.categories), source: 'api', preview: true }
        return emit()
      }
      // Not signed in as an administrator (or the preview failed): the public list, as any visitor sees it.
      listKey = 'public'
    }
    const outcome = await getJson('/api/projects')
    if (outcome.kind === 'ok' && Array.isArray(outcome.data)) {
      const cards = outcome.data.map(parseCard).filter((card): card is ProjectCard => card !== null)
      const meta = outcome.meta as { categories?: unknown } | undefined
      list = { status: 'ready', cards, categories: parseCategories(meta?.categories), source: 'api', preview: false }
    } else {
      list = STATIC_LIST
    }
    emit()
  })()
}

export function useProjectList(preview = false): ListState {
  useEffect(() => ensureList(preview), [preview])
  return useSyncExternalStore(subscribe, () => list, () => list)
}

/** One project in full. `previewId` reads the administrator's preview of that project (any state) instead of the public one. */
export function ensureDetail(slug: string, previewId: string | null): void {
  const key = previewId ?? slug
  if (details.has(key) || API_BASE === null) {
    if (API_BASE === null && !details.has(key)) {
      const record = staticRecord(slug)
      details.set(key, record ? { status: 'ready', record, source: 'static' } : { status: 'missing' })
      emit()
    }
    return
  }
  details.set(key, { status: 'loading' })
  loadingDetails.set(
    key,
    (async () => {
      const outcome = previewId ? await getJson(`/api/admin/projects/${encodeURIComponent(previewId)}/preview`, { credentials: true }) : await getJson(`/api/projects/${encodeURIComponent(slug)}`)
      if (outcome.kind === 'ok') {
        const data = outcome.data as { project?: unknown; neighbours?: unknown } | undefined
        const source = previewId ? data?.project : outcome.data
        const around = previewId ? undefined : outcome.meta && typeof outcome.meta === 'object' ? (outcome.meta as { neighbours?: unknown }).neighbours : undefined
        const record = parseRecord(source, around, previewId !== null)
        const state = (data as { status?: unknown } | undefined)?.status
        if (record && previewId && (state === 'draft' || state === 'published' || state === 'archived')) record.state = state
        details.set(key, record ? { status: 'ready', record, source: 'api' } : { status: 'missing' })
      } else if (outcome.kind === 'missing') {
        details.set(key, { status: 'missing' })
      } else if (outcome.kind === 'unauthorized') {
        details.set(key, { status: 'unauthorized' })
      } else {
        // No answer at all: the website's own copy, for the projects it has.
        const record = previewId ? null : staticRecord(slug)
        details.set(key, record ? { status: 'ready', record, source: 'static' } : { status: 'missing' })
      }
      emit()
    })(),
  )
}

/** With no backend there is nothing to wait for: the website's own copy, at once (and the same on the server, as tests render it). */
const offline = new Map<string, DetailState>()
function offlineState(slug: string): DetailState {
  let state = offline.get(slug)
  if (!state) {
    const record = staticRecord(slug)
    state = record ? { status: 'ready', record, source: 'static' } : { status: 'missing' }
    offline.set(slug, state)
  }
  return state
}

export function useProjectDetail(slug: string, previewId: string | null = null): DetailState {
  useEffect(() => ensureDetail(slug, previewId), [slug, previewId])
  const key = previewId ?? slug
  const state = useSyncExternalStore(subscribe, () => details.get(key) ?? LOADING_DETAIL, () => LOADING_DETAIL)
  return API_BASE === null ? (previewId ? ({ status: 'unauthorized' } as DetailState) : offlineState(slug)) : state
}
const LOADING_DETAIL: DetailState = { status: 'loading' }

/** What the head knows about a project's title and description: the data's own once it has arrived. */
export function runtimeProject(slug: string): ProjectCard | null {
  const state = details.get(slug)
  if (state?.status === 'ready') return state.record.card
  return list.cards.find((card) => card.slug === slug) ?? null
}

/** What the list holds right now (for tests and for code outside React). */
export const listSnapshot = (): ListState => list

/** Whether the project is known not to exist (the API said 404): its address then says "not found", not a project. */
export function isMissingProject(slug: string): boolean {
  return details.get(slug)?.status === 'missing'
}

export const useProjectsVersion = (): number => useSyncExternalStore(subscribe, () => version, () => version)

/** For tests: back to the start. */
export function resetProjectStore(): void {
  list = API_BASE === null ? STATIC_LIST : LOADING
  listKey = null
  details.clear()
  loadingDetails.clear()
  emit()
}
