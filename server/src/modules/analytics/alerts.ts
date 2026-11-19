import { emptySection, type Section } from './model.ts'
import type { Ctx } from './quotes.ts'

/**
 * Operational alerts (PROMPT 32): fixed rules over stored records, every one with a severity, a reason code, the source record's public reference, the relevant date and a suggested
 * next action (codes the screen words). An alert is identified by its kind and its record, so a condition is listed once; nothing here changes a status or a task, and an alert
 * that is not allowed to this role is not built (the section says which areas were left out, never "no alerts").
 */

export interface Alert {
  id: string
  kind: string
  severity: 'high' | 'medium' | 'low'
  reason: string
  reference: string
  date: string
  nextAction: string
  /** A page of the administration (relative to `/admin`). */
  path: string
}

const ORDER = { high: 0, medium: 1, low: 2 } as const
const TOTAL = 100
const LIMIT = 25
const sql = {
  status: '(? IS NULL OR p.status = ?)',
  live: "c.kind = 'thread' AND c.status IN ('open', 'waiting_owner', 'waiting_customer') AND c.archived_at IS NULL",
  active: "p.status NOT IN ('completed', 'cancelled')",
}

export function alertsSection(ctx: Ctx, allowed: { requests: boolean; clients: boolean }): Section {
  const section = emptySection('alerts')
  const found = new Map<string, Alert>()
  const add = (alert: Omit<Alert, 'id'>) => {
    const id = `${alert.kind}:${alert.reference}`
    if (!found.has(id)) found.set(id, { id, ...alert })
  }
  const today = ctx.period.today
  // The selected project status (PROMPT 32.1) scopes the alerts ABOUT PROJECTS to projects whose current status it is; the other alerts are not about projects and are not filtered.
  const selected = ctx.f.projectStatus
  const status: Array<string | null> = [selected, selected]
  const ago = (days: number) => new Date(ctx.now.getTime() - days * 86_400_000).toISOString()
  const left: string[] = []

  if (allowed.clients) {
    for (const row of ctx.db.all<{ pid: string; reference: string; due_on: string }>(
      `SELECT p.id AS pid, p.reference AS reference, MIN(m.due_on) AS due_on FROM client_milestones m JOIN client_projects p ON p.id = m.project_id
        WHERE ${sql.active} AND m.completed_at IS NULL AND m.status NOT IN ('completed', 'cancelled') AND m.due_on IS NOT NULL AND m.due_on < ? AND ${sql.status} GROUP BY p.id ORDER BY due_on LIMIT ?`,
      [today, ...status, LIMIT],
    ))
      add({ kind: 'overdue_milestone', severity: 'high', reason: 'milestone_past_due', reference: row.reference, date: row.due_on, nextAction: 'review_project_schedule', path: `/client-projects/${row.pid}/work` })
    for (const row of ctx.db.all<{ pid: string; reference: string; updated_at: string }>(`SELECT p.id AS pid, p.reference AS reference, p.updated_at AS updated_at FROM client_projects p WHERE p.status = 'on_hold' AND ${sql.status} ORDER BY p.updated_at LIMIT ?`, [...status, LIMIT]))
      add({ kind: 'project_on_hold', severity: 'medium', reason: 'project_is_on_hold', reference: row.reference, date: row.updated_at, nextAction: 'decide_about_held_project', path: `/client-projects/${row.pid}` })
    for (const row of ctx.db.all<{ pid: string; reference: string; updated_at: string }>(
      `SELECT p.id AS pid, t.reference AS reference, t.updated_at AS updated_at FROM project_tasks t JOIN client_projects p ON p.id = t.project_id WHERE ${sql.active} AND t.status = 'blocked' AND ${sql.status} ORDER BY t.updated_at LIMIT ?`,
      [...status, LIMIT],
    ))
      add({ kind: 'blocked_task', severity: 'high', reason: 'task_is_blocked', reference: row.reference, date: row.updated_at, nextAction: 'unblock_the_task', path: `/client-projects/${row.pid}/work` })
    for (const row of ctx.db.all<{ reference: string; at: string }>(
      `SELECT x.reference AS reference, x.at AS at FROM (
         SELECT c.reference AS reference,
                (SELECT m.created_at FROM conversation_messages m WHERE m.conversation_id = c.id AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL ORDER BY m.seq DESC LIMIT 1) AS at,
                (SELECT m.sender_type FROM conversation_messages m WHERE m.conversation_id = c.id AND m.visibility = 'customer' AND m.message_type = 'text' AND m.deleted_at IS NULL ORDER BY m.seq DESC LIMIT 1) AS last
           FROM conversations c WHERE ${sql.live}) x
        WHERE x.last = 'customer' AND x.at < ? ORDER BY x.at LIMIT ?`,
      [ago(2), LIMIT],
    ))
      add({ kind: 'unanswered_customer_message', severity: row.at < ago(4) ? 'high' : 'medium', reason: 'customer_waiting_two_days', reference: row.reference, date: row.at, nextAction: 'reply_to_the_customer', path: `/communications/${row.reference}` })
    for (const row of ctx.db.all<{ pid: string; reference: string; requested_at: string }>(
      `SELECT d.project_id AS pid, d.reference AS reference, ap.requested_at AS requested_at FROM deliverable_approvals ap JOIN deliverables d ON d.id = ap.deliverable_id JOIN client_projects p ON p.id = d.project_id
        WHERE ap.state = 'requested' AND ap.requested_at < ? AND ${sql.active} AND ${sql.status} ORDER BY ap.requested_at LIMIT ?`,
      [ago(7), ...status, LIMIT],
    ))
      add({ kind: 'pending_customer_approval', severity: 'low', reason: 'approval_unanswered_a_week', reference: row.reference, date: row.requested_at, nextAction: 'remind_the_customer', path: `/client-projects/${row.pid}` })
  } else left.push('projects_and_communication')

  if (allowed.requests) {
    for (const row of ctx.db.all<{ rid: string; reference: string; sent_at: string; valid_until: string | null }>(
      `SELECT r.id AS rid, q.reference AS reference, q.sent_at AS sent_at, q.valid_until AS valid_until FROM quotes q JOIN quote_requests r ON r.id = q.quote_request_id
        WHERE q.status = 'sent' AND (q.sent_at < ? OR (q.valid_until IS NOT NULL AND q.valid_until < ?)) ORDER BY q.sent_at LIMIT ?`,
      [ago(14), today, LIMIT],
    )) {
      const expired = row.valid_until !== null && row.valid_until < today
      add({ kind: 'quotation_waiting_long', severity: expired ? 'high' : 'medium', reason: expired ? 'quotation_validity_passed' : 'quotation_waiting_two_weeks', reference: row.reference, date: row.sent_at, nextAction: 'follow_up_the_quotation', path: `/quotes/${row.rid}` })
    }
    for (const row of ctx.db.all<{ id: string; reference: string; created_at: string }>("SELECT r.id AS id, r.reference AS reference, r.created_at AS created_at FROM quote_requests r WHERE r.status = 'new' AND r.archived_at IS NULL AND r.created_at < ? ORDER BY r.created_at LIMIT ?", [ago(2), LIMIT]))
      add({ kind: 'request_not_reviewed', severity: 'medium', reason: 'request_new_for_two_days', reference: row.reference, date: row.created_at, nextAction: 'review_the_request', path: `/quotes/${row.id}` })
    for (const row of ctx.db.all<{ id: string; reference: string; start_at: string }>(
      "SELECT b.id AS id, b.reference AS reference, b.start_at AS start_at FROM bookings b WHERE b.status = 'pending' AND b.start_at >= ? AND b.start_at < ? ORDER BY b.start_at LIMIT ?",
      [ctx.now.toISOString(), new Date(ctx.now.getTime() + 3 * 86_400_000).toISOString(), LIMIT],
    ))
      add({ kind: 'consultation_requires_attention', severity: 'high', reason: 'consultation_unconfirmed_soon', reference: row.reference, date: row.start_at, nextAction: 'confirm_or_answer_the_consultation', path: `/bookings/${row.id}` })
  } else left.push('quotes_and_consultations')

  const list = [...found.values()].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.date.localeCompare(b.date)).slice(0, TOTAL)
  section.extra = { items: list, leftOut: left, truncated: found.size > TOTAL }
  section.distributions.push({ id: 'alertsBySeverity', total: list.length, items: (['high', 'medium', 'low'] as const).map((key) => ({ key, value: list.filter((item) => item.severity === key).length })) })
  if (selected !== null) section.filterSummary = { projectStatus: { status: selected, effect: 'partial', appliedKinds: ['overdue_milestone', 'project_on_hold', 'blocked_task', 'pending_customer_approval'], notAppliedKinds: ['unanswered_customer_message', 'quotation_waiting_long', 'request_not_reviewed', 'consultation_requires_attention'] } }
  section.limitations.push('fixed_rules', 'no_status_changes', 'one_alert_per_record_and_kind')
  return section
}
