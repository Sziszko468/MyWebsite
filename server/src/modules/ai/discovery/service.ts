import type { AppContext } from '../../../context.ts'
import { HttpError } from '../../../http/errors.ts'
import { dropLiveApprovals, getConversation, markPlannerCompleted, savePlan, type ConversationRow } from '../store.ts'
import { assess, type Assessment } from './complexity.ts'
import {
  LIMITS,
  requiredFor,
  sameTitle,
  SECTIONS,
  type Basis,
  type FactKey,
  type Facts,
  type Origin,
  type ProjectType,
  type Requirement,
  type RequirementInput,
  type RequirementPatch,
  type Section,
  type Signals,
  type Stage,
} from './model.ts'
import { contentHash, generate, projectToPlan, readPlanContent, staleSections, summarise, withDiscovery, type PlanContent, type PlanSource, type RevisionSummary } from './planner.ts'
import { currentStage, guidance, missingForApproval, missingForPlan, progress, type Guidance, type Missing, type StageProgress, type StageState } from './stages.ts'
import * as store from './store.ts'
import type { Brief } from '../../shop/brief.ts'
import { isReady, type ProjectPlan } from '../plan.ts'

/**
 * Project discovery's rules of conduct, in one place (PROMPT 30). The routes (the visitor's panel) and the assistant's tools both call these
 * functions and nothing else touches the tables, so the rules hold whoever asks:
 *
 *  - ONE ACTOR AT A TIME is recorded: `visitor` or `assistant`. The assistant PROPOSES (its writes are unconfirmed); the visitor CONFIRMS. A value the visitor
 *    wrote or confirmed is never overwritten by the assistant: the write is refused and reported, never thrown at the model.
 *  - EVERY change to the working draft runs in ONE transaction that checks the version the caller saw (optimistic concurrency), moves the stage along,
 *    marks the plan out of date and removes any approval that was waiting: an approval is always for the plan as it is now.
 *  - A PLAN VERSION is an immutable snapshot made by "generate"; it is projected into the existing quote workflow's plan (with its version and hash), so the
 *    approval and the request are for exactly that snapshot.
 *  - A request that has been SENT freezes the draft: nothing changes after it, except by starting over.
 */

export type Actor = Origin

const conflict = (version: number) => new HttpError(409, 'conflict', 'The project draft changed. Reload it and try again.', { details: { reason: 'discovery_conflict', version } })
const sent = () => new HttpError(409, 'conflict', 'This plan has already been sent.', { details: { reason: 'sent' } })

// ---- reading the state ----------------------------------------------------------------------------------------------------------------

export interface PlanMeta {
  version: number
  hash: string
  origin: Origin
  reason: string
  summary: RevisionSummary | null
  createdAt: string
}

export interface DiscoveryState {
  exists: boolean
  /** The working draft's version: a change must name the version it saw. */
  version: number
  stage: Stage
  progress: StageProgress[]
  guidance: Guidance
  type: { value: ProjectType | null; origin: Origin | null; confirmed: boolean }
  facts: Facts
  requirements: Requirement[]
  signals: Signals
  skipped: Stage[]
  notes: Partial<Record<Section, string>>
  complexity: Assessment
  plan: { stale: boolean; staleSections: Section[]; latest: (PlanMeta & { content: PlanContent }) | null; versions: PlanMeta[] }
  missingForPlan: Missing[]
  missingForApproval: Missing[]
  sent: boolean
}

interface Loaded {
  draft: store.Draft | null
  facts: Facts
  requirements: Requirement[]
  notes: Partial<Record<Section, string>>
  latest: store.PlanRow | null
}

function load(app: AppContext, conversationId: string): Loaded {
  const { db } = app
  const draft = store.findDiscovery(db, conversationId)
  if (!draft) return { draft: null, facts: {}, requirements: [], notes: {}, latest: null }
  return { draft, facts: store.readFacts(db, conversationId), requirements: store.readRequirements(db, conversationId), notes: store.readNotes(db, conversationId), latest: store.latestPlan(db, conversationId) }
}

const stageStateOf = (loaded: Loaded): StageState => ({
  type: loaded.draft?.type ?? null,
  facts: loaded.facts,
  requirements: loaded.requirements,
  signals: loaded.draft?.signals ?? {},
  skipped: loaded.draft?.skipped ?? [],
  hasPlan: loaded.latest !== null,
  planStale: loaded.draft?.planStale ?? true,
})

const metaOf = (row: store.PlanRow): PlanMeta => {
  let summary: RevisionSummary | null = null
  try {
    summary = JSON.parse(row.summary) as RevisionSummary
  } catch {
    summary = null
  }
  return { version: row.version, hash: row.content_hash, origin: row.origin === 'visitor' ? 'visitor' : 'assistant', reason: row.reason, summary, createdAt: row.created_at }
}

export function stateOf(app: AppContext, conversation: ConversationRow): DiscoveryState {
  const loaded = load(app, conversation.id)
  const stages = stageStateOf(loaded)
  const draft = loaded.draft
  const latestContent = loaded.latest ? readPlanContent(loaded.latest.content) : null
  const version = draft?.version ?? 0
  return {
    exists: draft !== null,
    version,
    stage: currentStage(stages),
    progress: progress(stages),
    guidance: guidance(stages),
    type: { value: draft?.type ?? null, origin: draft?.typeOrigin ?? null, confirmed: draft?.typeConfirmed ?? false },
    facts: loaded.facts,
    requirements: loaded.requirements,
    signals: draft?.signals ?? {},
    skipped: draft?.skipped ?? [],
    notes: loaded.notes,
    complexity: assess({ type: draft?.type ?? null, facts: loaded.facts, requirements: loaded.requirements, signals: draft?.signals ?? {} }),
    plan: {
      stale: draft?.planStale ?? true,
      staleSections: latestContent ? staleSections(latestContent, version) : [],
      latest: loaded.latest && latestContent ? { ...metaOf(loaded.latest), content: latestContent } : null,
      versions: store.listPlans(app.db, conversation.id).map(metaOf),
    },
    missingForPlan: missingForPlan(stages),
    missingForApproval: missingForApproval(stages),
    sent: conversation.quote_reference !== null,
  }
}

/** A plan version, read-only (the revision history). */
export function planVersion(app: AppContext, conversationId: string, version: number): (PlanMeta & { content: PlanContent }) | null {
  const row = store.planByVersion(app.db, conversationId, version)
  const content = row ? readPlanContent(row.content) : null
  return row && content ? { ...metaOf(row), content } : null
}

// ---- changing the draft ---------------------------------------------------------------------------------------------------------------

/**
 * Runs `work` on the draft in one transaction. `work` returns what it did; when it changed the draft, the version moves on, the plan is out
 * of date, the stage is recomputed and a waiting approval is removed. A caller that names a version other than the current one gets a 409.
 */
function change<T>(app: AppContext, conversation: ConversationRow, expected: number | undefined, work: (draft: store.Draft) => { changed: boolean; value: T }): T {
  const { db, clock } = app
  return db.transaction(() => {
    const row = getConversation(db, conversation.session_id, conversation.id)
    if (!row || row.deleted_at) throw new HttpError(404, 'not_found', 'The conversation was not found.')
    if (row.quote_reference) throw sent()
    const found = store.findDiscovery(db, conversation.id)
    const draft = found ?? store.createDiscovery(db, clock, conversation.id)
    if (expected !== undefined && draft.version !== expected) throw conflict(draft.version)
    const result = work(draft)
    // A change that did nothing (a refused write, an id that is not here) leaves no draft behind: asking never creates anything.
    if (!result.changed && !found) store.eraseDiscovery(db, conversation.id)
    if (result.changed) {
      const loaded = load(app, conversation.id)
      store.touch(db, clock, conversation.id, currentStage(stageStateOf(loaded)))
      dropLiveApprovals(db, conversation.id)
    }
    return result.value
  })
}

export type Refused = { key: string; reason: 'confirmed_by_visitor' | 'visitor_wrote_it' | 'rejected_by_visitor' | 'duplicate' | 'limit' | 'not_found' | 'unknown_dependency' }

/** Facts: the visitor's edits are theirs and confirmed; the assistant's are proposals, and never replace what the visitor wrote or confirmed. */
export function applyFacts(app: AppContext, conversation: ConversationRow, input: { facts: Partial<Record<FactKey, string | null>>; confirm?: FactKey[] }, actor: Actor, expected?: number): { applied: FactKey[]; refused: Refused[] } {
  return change(app, conversation, expected, () => {
    const { db, clock } = app
    const existing = store.readFacts(db, conversation.id)
    const applied: FactKey[] = []
    const refused: Refused[] = []
    for (const [key, value] of Object.entries(input.facts) as [FactKey, string | null][]) {
      const current = existing[key]
      if (actor === 'assistant') {
        if (value === null) continue
        if (current && (current.origin === 'visitor' || current.confirmed)) {
          if (current.value !== value) refused.push({ key, reason: current.origin === 'visitor' ? 'visitor_wrote_it' : 'confirmed_by_visitor' })
          continue
        }
        if (current && current.value === value) continue
        store.upsertFact(db, clock, conversation.id, key, value, 'assistant', false)
        applied.push(key)
      } else if (value === null) {
        if (current) {
          store.deleteFact(db, conversation.id, key)
          applied.push(key)
        }
      } else {
        store.upsertFact(db, clock, conversation.id, key, value, 'visitor', true)
        applied.push(key)
      }
    }
    if (actor === 'visitor') {
      for (const key of input.confirm ?? []) {
        const current = existing[key] ?? store.readFacts(db, conversation.id)[key]
        if (current && !current.confirmed) {
          store.upsertFact(db, clock, conversation.id, key, current.value, current.origin, true)
          applied.push(key)
        }
      }
    }
    return { changed: applied.length > 0, value: { applied, refused } }
  })
}

export function applyClassification(app: AppContext, conversation: ConversationRow, input: { type?: ProjectType; confirm?: boolean }, actor: Actor, expected?: number): { applied: boolean; refused: Refused | null } {
  return change<{ applied: boolean; refused: Refused | null }>(app, conversation, expected, (draft) => {
    const { db } = app
    if (actor === 'assistant') {
      if (!input.type) return { changed: false, value: { applied: false, refused: null } }
      if (draft.typeConfirmed && draft.type !== input.type) return { changed: false, value: { applied: false, refused: { key: 'projectType', reason: 'confirmed_by_visitor' as const } } }
      if (draft.type === input.type) return { changed: false, value: { applied: false, refused: null } }
      store.setClassification(db, conversation.id, input.type, 'assistant', false)
      return { changed: true, value: { applied: true, refused: null } }
    }
    if (input.type) {
      if (draft.type === input.type && draft.typeConfirmed && draft.typeOrigin === 'visitor') return { changed: false, value: { applied: false, refused: null } }
      store.setClassification(db, conversation.id, input.type, 'visitor', true)
      return { changed: true, value: { applied: true, refused: null } }
    }
    // Only "confirm": the visitor accepts the type the assistant proposed.
    if (draft.type && !draft.typeConfirmed) {
      store.setClassification(db, conversation.id, draft.type, draft.typeOrigin ?? 'assistant', true)
      return { changed: true, value: { applied: true, refused: null } }
    }
    return { changed: false, value: { applied: false, refused: null } }
  })
}

export function applySignals(app: AppContext, conversation: ConversationRow, input: Record<string, string | number | null>, actor: Actor, expected?: number): { applied: string[]; refused: Refused[] } {
  return change(app, conversation, expected, (draft) => {
    const signals: Signals = { ...draft.signals }
    const applied: string[] = []
    const refused: Refused[] = []
    for (const [key, value] of Object.entries(input)) {
      const current = signals[key as keyof Signals]
      if (actor === 'assistant') {
        if (value === null) continue
        if (current && current.origin === 'visitor') {
          if (current.value !== value) refused.push({ key, reason: 'visitor_wrote_it' })
          continue
        }
        if (current && current.value === value) continue
        signals[key as keyof Signals] = { value, origin: 'assistant' }
        applied.push(key)
      } else if (value === null) {
        if (current) {
          delete signals[key as keyof Signals]
          applied.push(key)
        }
      } else {
        signals[key as keyof Signals] = { value, origin: 'visitor' }
        applied.push(key)
      }
    }
    if (applied.length > 0) store.setSignals(app.db, conversation.id, signals)
    return { changed: applied.length > 0, value: { applied, refused } }
  })
}

/** Turns what a caller wrote as "depends on" (ids, or for the assistant also titles) into ids of requirements of THIS conversation; the rest is dropped. */
function resolveDependencies(wanted: readonly string[], known: readonly { id: string; title: string }[]): string[] {
  const ids: string[] = []
  for (const item of wanted) {
    const hit = known.find((requirement) => requirement.id === item) ?? known.find((requirement) => sameTitle(requirement.title, item))
    if (hit && !ids.includes(hit.id)) ids.push(hit.id)
  }
  return ids
}

export interface NewRequirement {
  value: RequirementInput
  /** For the assistant: did the visitor STATE it, or is it the assistant's own suggestion? (The interface labels the two differently; both start unconfirmed.) */
  basis?: Basis
}

export function addRequirements(app: AppContext, conversation: ConversationRow, items: readonly NewRequirement[], actor: Actor, expected?: number): { added: string[]; skipped: Refused[] } {
  return change(app, conversation, expected, () => {
    const { db, clock } = app
    const added: string[] = []
    const skipped: Refused[] = []
    let known = store.readRequirements(db, conversation.id).map((requirement) => ({ id: requirement.id, title: requirement.title, status: requirement.status }))
    for (const item of items) {
      const title = item.value.title
      const same = known.find((requirement) => sameTitle(requirement.title, title))
      if (same) {
        skipped.push({ key: title, reason: actor === 'assistant' && same.status === 'rejected' ? 'rejected_by_visitor' : 'duplicate' })
        continue
      }
      if (known.length >= LIMITS.requirements) {
        skipped.push({ key: title, reason: 'limit' })
        continue
      }
      const id = store.insertRequirement(
        db,
        clock,
        conversation.id,
        { ...item.value, dependsOn: resolveDependencies(item.value.dependsOn, known) },
        actor,
        actor === 'visitor' ? 'stated' : (item.basis ?? 'suggested'),
        actor === 'visitor' ? 'confirmed' : 'unconfirmed',
      )
      known = [...known, { id, title, status: actor === 'visitor' ? 'confirmed' : 'unconfirmed' }]
      added.push(id)
    }
    return { changed: added.length > 0, value: { added, skipped } }
  })
}

export function changeRequirement(app: AppContext, conversation: ConversationRow, id: string, patch: RequirementPatch, actor: Actor, expected?: number): { applied: boolean; refused: Refused | null } {
  return change<{ applied: boolean; refused: Refused | null }>(app, conversation, expected, () => {
    const { db, clock } = app
    const current = store.readRequirements(db, conversation.id).find((requirement) => requirement.id === id)
    if (!current) return { changed: false, value: { applied: false, refused: { key: id, reason: 'not_found' as const } } }
    // The assistant may refine ITS OWN unconfirmed suggestions (description, priority, category, complexity); it can never touch what the visitor wrote, confirmed or rejected.
    if (actor === 'assistant' && (current.origin === 'visitor' || current.status !== 'unconfirmed')) return { changed: false, value: { applied: false, refused: { key: id, reason: current.origin === 'visitor' ? 'visitor_wrote_it' : 'confirmed_by_visitor' } } }
    const next = actor === 'assistant' ? { ...patch, status: undefined, title: undefined } : patch
    const priority = next.priority ?? current.priority
    const required = requiredFor(priority, next.required ?? (next.priority ? undefined : current.required))
    let dependsOn = next.dependsOn
    if (dependsOn) dependsOn = resolveDependencies(dependsOn, store.readRequirements(db, conversation.id).filter((requirement) => requirement.id !== id))
    if (next.title !== undefined && store.readRequirements(db, conversation.id).some((requirement) => requirement.id !== id && sameTitle(requirement.title, next.title!))) return { changed: false, value: { applied: false, refused: { key: next.title, reason: 'duplicate' as const } } }
    store.patchRequirement(db, clock, conversation.id, id, { ...next, ...(dependsOn ? { dependsOn } : {}), required })
    return { changed: true, value: { applied: true, refused: null } }
  })
}

export function deleteRequirement(app: AppContext, conversation: ConversationRow, id: string, expected?: number): boolean {
  return change(app, conversation, expected, () => {
    const removed = store.removeRequirement(app.db, conversation.id, id)
    return { changed: removed, value: removed }
  })
}

export function setSkip(app: AppContext, conversation: ConversationRow, stage: Stage, skip: boolean, expected?: number): void {
  change(app, conversation, expected, (draft) => {
    const has = draft.skipped.includes(stage)
    if (skip === has) return { changed: false, value: undefined }
    store.setSkipped(app.db, conversation.id, skip ? [...draft.skipped, stage] : draft.skipped.filter((item) => item !== stage))
    return { changed: true, value: undefined }
  })
}

export function setNote(app: AppContext, conversation: ConversationRow, section: Section, note: string, expected?: number): void {
  change(app, conversation, expected, () => {
    store.writeNote(app.db, app.clock, conversation.id, section, note)
    return { changed: true, value: undefined }
  })
}

/** "Start over": every discovery row of the conversation is deleted, and the plan that was projected into the quote workflow is cleared. */
export function startOver(app: AppContext, conversation: ConversationRow): void {
  app.db.transaction(() => {
    const row = getConversation(app.db, conversation.session_id, conversation.id)
    if (!row || row.deleted_at) throw new HttpError(404, 'not_found', 'The conversation was not found.')
    if (row.quote_reference) throw sent()
    store.eraseDiscovery(app.db, conversation.id)
    dropLiveApprovals(app.db, conversation.id)
    savePlan(app.db, app.clock, conversation.id, null, row.plan_version + 1)
  })
}

// ---- plan versions ----------------------------------------------------------------------------------------------------------------------

export type GenerateResult = { status: 'created' | 'unchanged'; version: number; hash: string } | { status: 'not_enough_information'; missing: Missing[] }

/**
 * Makes a plan version from the working draft: all sections, or only the ones named (the others are carried over unchanged, so the visitor's
 * confirmed information and notes are never lost). The version is immutable; it is projected into the quote workflow's plan, and the plan is
 * fresh again only when every section is at the draft's version. A regeneration that changes nothing makes no new version.
 */
export function makePlan(app: AppContext, conversation: ConversationRow, sections: readonly Section[] | 'all', actor: Actor, reason: string, expected?: number): GenerateResult {
  const { db, clock } = app
  return db.transaction(() => {
    const row = getConversation(db, conversation.session_id, conversation.id)
    if (!row || row.deleted_at) throw new HttpError(404, 'not_found', 'The conversation was not found.')
    if (row.quote_reference) throw sent()
    const loaded = load(app, conversation.id)
    if (!loaded.draft) return { status: 'not_enough_information' as const, missing: missingForPlan(stageStateOf(loaded)) }
    if (expected !== undefined && loaded.draft.version !== expected) throw conflict(loaded.draft.version)
    const missing = missingForPlan(stageStateOf(loaded))
    if (missing.length > 0) return { status: 'not_enough_information' as const, missing }
    const previous = loaded.latest ? readPlanContent(loaded.latest.content) : null
    const source: PlanSource = {
      type: loaded.draft.type,
      typeOrigin: loaded.draft.typeOrigin,
      typeConfirmed: loaded.draft.typeConfirmed,
      facts: loaded.facts,
      requirements: loaded.requirements,
      signals: loaded.draft.signals,
      skipped: loaded.draft.skipped,
      notes: loaded.notes,
      language: row.language,
      discoveryVersion: loaded.draft.version,
      now: clock.now().toISOString(),
    }
    const content = generate(source, previous, sections)
    const hash = contentHash(content)
    const version = (loaded.latest?.version ?? 0) + 1
    if (previous && loaded.latest && hash === loaded.latest.content_hash) {
      // Same content: no new version, but if everything is current the plan is fresh again.
      if (staleSections(content, loaded.draft.version).length === 0) store.markPlanFresh(db, conversation.id)
      return { status: 'unchanged' as const, version: loaded.latest.version, hash }
    }
    store.insertPlan(db, clock, conversation.id, version, JSON.stringify(content), hash, actor, reason, JSON.stringify(summarise(previous, content, sections)))
    store.prunePlans(db, conversation.id, LIMITS.planVersions)
    if (staleSections(content, loaded.draft.version).length === 0) store.markPlanFresh(db, conversation.id)
    // The plan the quote workflow knows: projected from this snapshot, bound to its version and hash, in the conversation's language.
    const plan = projectToPlan(content, version, hash, row.language)
    savePlan(db, clock, conversation.id, plan, row.plan_version + 1)
    dropLiveApprovals(db, conversation.id)
    if (isReady(plan)) markPlannerCompleted(db, clock, conversation.id)
    return { status: 'created' as const, version, hash }
  })
}

// ---- the quote workflow's side ----------------------------------------------------------------------------------------------------------------

/**
 * Whether a plan that came from discovery may be approved now: its snapshot must be the newest and the draft must not have moved on, and at
 * least one requirement must be confirmed by the visitor. Returns `null` when it may, otherwise the codes of what is missing. A plan that
 * did not come from discovery (the older planner) has nothing to check here.
 */
export function approvalProblem(app: AppContext, conversation: ConversationRow, plan: ProjectPlan): Missing[] | null {
  if (plan.discoveryVersion === 0) return null
  const state = stateOf(app, conversation)
  const latest = state.plan.latest
  if (!latest || latest.version !== plan.discoveryVersion || latest.hash !== plan.discoveryHash) return ['planStale']
  const missing = state.missingForApproval
  return missing.length > 0 ? missing : null
}

/** The immutable snapshot a discovery plan was projected from, verified against its hash, or `null` (none, or it no longer matches: nothing is sent from it). */
export function snapshotOf(app: AppContext, conversationId: string, plan: ProjectPlan): PlanContent | null {
  if (plan.discoveryVersion === 0) return null
  const row = store.planByVersion(app.db, conversationId, plan.discoveryVersion)
  if (!row || row.content_hash !== plan.discoveryHash) return null
  const content = readPlanContent(row.content)
  return content && contentHash(content) === row.content_hash ? content : null
}

/** The plan's own brief with the discovery questions added (the request carries the structured plan). */
export const briefWithDiscovery = (brief: Brief, content: PlanContent, version: number): Brief => withDiscovery(brief, content, version)

export { SECTIONS }
