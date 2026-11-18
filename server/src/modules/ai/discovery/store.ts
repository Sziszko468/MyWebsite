import type { Database } from '../../../db/database.ts'
import { newId } from '../../../lib/crypto.ts'
import { iso, type Clock } from '../../../lib/time.ts'
import { isCategory, isComplexity, isPriority, isProjectType, isRequirementStatus, isSection, isStage, readStoredSignals, type Basis, type Facts, type FactKey, type Origin, type ProjectType, type Requirement, type RequirementPatch, type Section, type Signals, type Stage, FACT_KEYS } from './model.ts'

/**
 * Everything project discovery stores, in one place (the module's SQL). Every function takes the CONVERSATION id; the callers (the routes
 * and the tools) have already proved that the conversation belongs to the visitor's session, and nothing here ever takes an id from the
 * browser alone: a requirement is looked up by its id AND its conversation, a plan by its version AND its conversation.
 *
 * Nothing here decides anything: validation is in model.ts, the rules in complexity.ts / stages.ts / planner.ts, and the order of things
 * (versions, approvals, staleness) in service.ts, which runs these functions inside one transaction.
 */

export interface DiscoveryRow {
  conversation_id: string
  stage: string
  project_type: string | null
  type_origin: string | null
  type_confirmed: number
  skipped: string
  signals: string
  plan_stale: number
  version: number
  created_at: string
  updated_at: string
}

export interface Draft {
  conversationId: string
  stage: Stage
  type: ProjectType | null
  typeOrigin: Origin | null
  typeConfirmed: boolean
  skipped: Stage[]
  signals: Signals
  planStale: boolean
  version: number
  createdAt: string
  updatedAt: string
}

export function readDraft(row: DiscoveryRow): Draft {
  let skipped: Stage[] = []
  try {
    const parsed: unknown = JSON.parse(row.skipped)
    if (Array.isArray(parsed)) skipped = parsed.filter(isStage)
  } catch {
    skipped = []
  }
  return {
    conversationId: row.conversation_id,
    stage: isStage(row.stage) ? row.stage : 'idea',
    type: isProjectType(row.project_type) ? row.project_type : null,
    typeOrigin: row.type_origin === 'visitor' || row.type_origin === 'assistant' ? row.type_origin : null,
    typeConfirmed: row.type_confirmed === 1,
    skipped,
    signals: readStoredSignals(row.signals),
    planStale: row.plan_stale === 1,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const findDiscovery = (db: Database, conversationId: string): Draft | null => {
  const row = db.get<DiscoveryRow>('SELECT * FROM ai_discovery WHERE conversation_id = ?', [conversationId])
  return row ? readDraft(row) : null
}

export function createDiscovery(db: Database, clock: Clock, conversationId: string): Draft {
  const now = iso(clock.now())
  db.run('INSERT OR IGNORE INTO ai_discovery (conversation_id, created_at, updated_at) VALUES (?, ?, ?)', [conversationId, now, now])
  return findDiscovery(db, conversationId)!
}

/** Every change of the working draft calls this: the version moves on (optimistic concurrency) and the plan is marked out of date. */
export function touch(db: Database, clock: Clock, conversationId: string, stage: Stage): void {
  db.run('UPDATE ai_discovery SET version = version + 1, plan_stale = 1, stage = ?, updated_at = ? WHERE conversation_id = ?', [stage, iso(clock.now()), conversationId])
}

export function setStage(db: Database, conversationId: string, stage: Stage): void {
  db.run('UPDATE ai_discovery SET stage = ? WHERE conversation_id = ?', [stage, conversationId])
}

export function markPlanFresh(db: Database, conversationId: string): void {
  db.run('UPDATE ai_discovery SET plan_stale = 0 WHERE conversation_id = ?', [conversationId])
}

export function setClassification(db: Database, conversationId: string, type: ProjectType, origin: Origin, confirmed: boolean): void {
  db.run('UPDATE ai_discovery SET project_type = ?, type_origin = ?, type_confirmed = ? WHERE conversation_id = ?', [type, origin, confirmed ? 1 : 0, conversationId])
}

export function setSkipped(db: Database, conversationId: string, skipped: readonly Stage[]): void {
  db.run('UPDATE ai_discovery SET skipped = ? WHERE conversation_id = ?', [JSON.stringify([...new Set(skipped)]), conversationId])
}

export function setSignals(db: Database, conversationId: string, signals: Signals): void {
  db.run('UPDATE ai_discovery SET signals = ? WHERE conversation_id = ?', [JSON.stringify(signals), conversationId])
}

// ---- facts --------------------------------------------------------------------------------------------------------------------------

export function readFacts(db: Database, conversationId: string): Facts {
  const facts: Facts = {}
  for (const row of db.all<{ key: string; value: string; origin: string; confirmed: number }>('SELECT key, value, origin, confirmed FROM ai_discovery_facts WHERE conversation_id = ?', [conversationId])) {
    if ((FACT_KEYS as string[]).includes(row.key) && (row.origin === 'visitor' || row.origin === 'assistant')) facts[row.key as FactKey] = { value: row.value, origin: row.origin, confirmed: row.confirmed === 1 }
  }
  return facts
}

export function upsertFact(db: Database, clock: Clock, conversationId: string, key: FactKey, value: string, origin: Origin, confirmed: boolean): void {
  db.run(
    `INSERT INTO ai_discovery_facts (conversation_id, key, value, origin, confirmed, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (conversation_id, key) DO UPDATE SET value = excluded.value, origin = excluded.origin, confirmed = excluded.confirmed, updated_at = excluded.updated_at`,
    [conversationId, key, value, origin, confirmed ? 1 : 0, iso(clock.now())],
  )
}

export function deleteFact(db: Database, conversationId: string, key: FactKey): void {
  db.run('DELETE FROM ai_discovery_facts WHERE conversation_id = ? AND key = ?', [conversationId, key])
}

// ---- requirements -------------------------------------------------------------------------------------------------------------------

interface RequirementRow {
  id: string
  position: number
  title: string
  description: string
  category: string
  priority: string
  required: number
  origin: string
  basis: string
  status: string
  complexity: string
  depends_on: string
  created_at: string
  updated_at: string
}

function readRequirement(row: RequirementRow): Requirement | null {
  if (!isCategory(row.category) || !isPriority(row.priority) || !isRequirementStatus(row.status) || !isComplexity(row.complexity)) return null
  if (row.origin !== 'visitor' && row.origin !== 'assistant') return null
  let dependsOn: string[] = []
  try {
    const parsed: unknown = JSON.parse(row.depends_on)
    if (Array.isArray(parsed)) dependsOn = parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    dependsOn = []
  }
  return { id: row.id, position: row.position, title: row.title, description: row.description, category: row.category, priority: row.priority, required: row.required === 1, origin: row.origin, basis: row.basis === 'stated' ? 'stated' : 'suggested', status: row.status, complexity: row.complexity, dependsOn, createdAt: row.created_at, updatedAt: row.updated_at }
}

export function readRequirements(db: Database, conversationId: string): Requirement[] {
  return db
    .all<RequirementRow>('SELECT * FROM ai_discovery_requirements WHERE conversation_id = ? ORDER BY position, created_at', [conversationId])
    .map(readRequirement)
    .filter((requirement): requirement is Requirement => requirement !== null)
}

export const countRequirements = (db: Database, conversationId: string): number => db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_discovery_requirements WHERE conversation_id = ?', [conversationId])?.n ?? 0

export function insertRequirement(
  db: Database,
  clock: Clock,
  conversationId: string,
  value: { title: string; description: string; category: string; priority: string; required: boolean; complexity: string; dependsOn: string[] },
  origin: Origin,
  basis: Basis,
  status: 'unconfirmed' | 'confirmed',
): string {
  const id = newId()
  const now = iso(clock.now())
  const position = (db.get<{ p: number | null }>('SELECT MAX(position) AS p FROM ai_discovery_requirements WHERE conversation_id = ?', [conversationId])?.p ?? 0) + 1
  db.run(
    `INSERT INTO ai_discovery_requirements (id, conversation_id, position, title, description, category, priority, required, origin, basis, status, complexity, depends_on, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, conversationId, position, value.title, value.description, value.category, value.priority, value.required ? 1 : 0, origin, basis, status, value.complexity, JSON.stringify(value.dependsOn), now, now],
  )
  return id
}

/** Applies a patch to one requirement of THIS conversation. Returns false when there is no such requirement here (another visitor's id is simply "not found"). */
export function patchRequirement(db: Database, clock: Clock, conversationId: string, id: string, patch: RequirementPatch & { required: boolean }): boolean {
  const current = db.get<RequirementRow>('SELECT * FROM ai_discovery_requirements WHERE id = ? AND conversation_id = ?', [id, conversationId])
  if (!current) return false
  db.run(
    `UPDATE ai_discovery_requirements SET title = ?, description = ?, category = ?, priority = ?, required = ?, complexity = ?, status = ?, depends_on = ?, updated_at = ? WHERE id = ? AND conversation_id = ?`,
    [
      patch.title ?? current.title,
      patch.description ?? current.description,
      patch.category ?? current.category,
      patch.priority ?? current.priority,
      patch.required ? 1 : 0,
      patch.complexity ?? current.complexity,
      patch.status ?? current.status,
      JSON.stringify(patch.dependsOn ?? JSON.parse(current.depends_on)),
      iso(clock.now()),
      id,
      conversationId,
    ],
  )
  return true
}

export function removeRequirement(db: Database, conversationId: string, id: string): boolean {
  const removed = db.run('DELETE FROM ai_discovery_requirements WHERE id = ? AND conversation_id = ?', [id, conversationId]).changes > 0
  if (removed) {
    // Nobody depends on a requirement that is gone.
    for (const row of db.all<{ id: string; depends_on: string }>('SELECT id, depends_on FROM ai_discovery_requirements WHERE conversation_id = ? AND depends_on LIKE ?', [conversationId, `%${id}%`])) {
      try {
        const kept = (JSON.parse(row.depends_on) as string[]).filter((other) => other !== id)
        db.run('UPDATE ai_discovery_requirements SET depends_on = ? WHERE id = ? AND conversation_id = ?', [JSON.stringify(kept), row.id, conversationId])
      } catch {
        db.run("UPDATE ai_discovery_requirements SET depends_on = '[]' WHERE id = ? AND conversation_id = ?", [row.id, conversationId])
      }
    }
  }
  return removed
}

// ---- plan versions ------------------------------------------------------------------------------------------------------------------

export interface PlanRow {
  id: string
  version: number
  content: string
  content_hash: string
  origin: string
  reason: string
  summary: string
  created_at: string
}

export const latestPlan = (db: Database, conversationId: string): PlanRow | null => db.get<PlanRow>('SELECT id, version, content, content_hash, origin, reason, summary, created_at FROM ai_discovery_plans WHERE conversation_id = ? ORDER BY version DESC LIMIT 1', [conversationId]) ?? null
export const planByVersion = (db: Database, conversationId: string, version: number): PlanRow | null => db.get<PlanRow>('SELECT id, version, content, content_hash, origin, reason, summary, created_at FROM ai_discovery_plans WHERE conversation_id = ? AND version = ?', [conversationId, version]) ?? null
export const listPlans = (db: Database, conversationId: string): PlanRow[] => db.all<PlanRow>('SELECT id, version, content, content_hash, origin, reason, summary, created_at FROM ai_discovery_plans WHERE conversation_id = ? ORDER BY version DESC', [conversationId])

export function insertPlan(db: Database, clock: Clock, conversationId: string, version: number, content: string, hash: string, origin: Origin, reason: string, summary: string): void {
  db.run('INSERT INTO ai_discovery_plans (id, conversation_id, version, content, content_hash, origin, reason, summary, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [newId(), conversationId, version, content, hash, origin, reason, summary, iso(clock.now())])
}

/** Keeps the newest `keep` versions (the quote request that was sent holds its own copy of the version it was approved at). */
export function prunePlans(db: Database, conversationId: string, keep: number): void {
  db.run('DELETE FROM ai_discovery_plans WHERE conversation_id = ? AND version <= (SELECT MAX(version) FROM ai_discovery_plans WHERE conversation_id = ?) - ?', [conversationId, conversationId, keep])
}

// ---- the visitor's notes on plan sections -------------------------------------------------------------------------------------------

export function readNotes(db: Database, conversationId: string): Partial<Record<Section, string>> {
  const notes: Partial<Record<Section, string>> = {}
  for (const row of db.all<{ section: string; note: string }>('SELECT section, note FROM ai_discovery_notes WHERE conversation_id = ?', [conversationId])) if (isSection(row.section)) notes[row.section] = row.note
  return notes
}

export function writeNote(db: Database, clock: Clock, conversationId: string, section: Section, note: string): void {
  if (note === '') {
    db.run('DELETE FROM ai_discovery_notes WHERE conversation_id = ? AND section = ?', [conversationId, section])
    return
  }
  db.run(
    'INSERT INTO ai_discovery_notes (conversation_id, section, note, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (conversation_id, section) DO UPDATE SET note = excluded.note, updated_at = excluded.updated_at',
    [conversationId, section, note, iso(clock.now())],
  )
}

// ---- deletion and counts ------------------------------------------------------------------------------------------------------------

/** Removes everything discovery holds for a conversation (its facts, requirements, plans and notes go with the draft). Used by "start over", by the visitor deleting the conversation and by retention. */
export function eraseDiscovery(db: Database, conversationId: string): void {
  db.run('DELETE FROM ai_discovery WHERE conversation_id = ?', [conversationId])
}

/** Counts only, for the administration: how many discoveries began and how many plan versions were made in a period. */
export function discoveryCounts(db: Database, fromDay: string): { discoveries: number; plans: number } {
  const from = `${fromDay}T00:00:00.000Z`
  return {
    discoveries: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_discovery WHERE created_at >= ?', [from])?.n ?? 0,
    plans: db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_discovery_plans WHERE created_at >= ?', [from])?.n ?? 0,
  }
}
