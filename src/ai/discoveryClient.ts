import { request } from './client'
import type { Category, DiscoveryState, FactKey, PlanContent, PlanMeta, Priority, ProjectType, RequirementComplexity, RequirementStatus, Section, Stage } from './discoveryModel'

/**
 * The project discovery's HTTP calls (server/src/modules/ai/discovery/routes.ts). Every write names the version of the draft the visitor saw
 * (`expectedVersion`): a draft that moved on (another tab, or the assistant) answers 409 and nothing is overwritten. Every answer carries the
 * whole new state, so the panel never has to merge anything itself.
 */

const base = (id: string) => `/api/ai/conversations/${encodeURIComponent(id)}/discovery`

export interface Mutation<T = unknown> {
  result?: T
  state: DiscoveryState
}

export interface RequirementFields {
  title: string
  description: string
  category: Category
  priority: Priority
  required: boolean
  complexity: RequirementComplexity
}

export type RequirementChange = Partial<RequirementFields> & { status?: RequirementStatus }

export const readDiscovery = (id: string) => request<DiscoveryState>('GET', base(id), undefined)

export const saveFacts = (id: string, expectedVersion: number, facts: Partial<Record<FactKey, string | null>>, confirm: FactKey[] = []) =>
  request<Mutation>('PUT', `${base(id)}/facts`, { expectedVersion, facts, ...(confirm.length > 0 ? { confirm } : {}) })

export const saveClassification = (id: string, expectedVersion: number, change: { type?: ProjectType; confirm?: boolean }) => request<Mutation>('PUT', `${base(id)}/classification`, { expectedVersion, ...change })

export const saveSignals = (id: string, expectedVersion: number, signals: Record<string, string | number | null>) => request<Mutation>('PUT', `${base(id)}/signals`, { expectedVersion, signals })

export const addRequirement = (id: string, expectedVersion: number, requirement: Partial<RequirementFields>) => request<Mutation>('POST', `${base(id)}/requirements`, { expectedVersion, requirement })

export const changeRequirement = (id: string, expectedVersion: number, requirementId: string, change: RequirementChange) =>
  request<Mutation>('PUT', `${base(id)}/requirements/${encodeURIComponent(requirementId)}`, { expectedVersion, ...change })

export const removeRequirement = (id: string, expectedVersion: number, requirementId: string) =>
  request<Mutation>('DELETE', `${base(id)}/requirements/${encodeURIComponent(requirementId)}?expectedVersion=${expectedVersion}`, undefined)

export const skipStage = (id: string, expectedVersion: number, stage: Stage, skip: boolean) => request<Mutation>('POST', `${base(id)}/skip`, { expectedVersion, stage, skip })

export const saveNote = (id: string, expectedVersion: number, section: Section, note: string) => request<Mutation>('PUT', `${base(id)}/notes`, { expectedVersion, section, note })

export const generatePlan = (id: string, expectedVersion: number, sections?: Section[]) =>
  request<Mutation<{ status: 'created' | 'unchanged'; version: number }>>('POST', `${base(id)}/plan`, { expectedVersion, ...(sections ? { sections } : {}) })

export const readPlanVersion = (id: string, version: number) => request<PlanMeta & { content: PlanContent }>('GET', `${base(id)}/plans/${version}`, undefined)
