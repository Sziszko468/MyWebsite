import type { AiSettings } from '../../config.ts'
import type { AppContext, SessionInfo } from '../../context.ts'
import { notFound } from '../../http/errors.ts'
import { newId } from '../../lib/crypto.ts'
import { iso } from '../../lib/time.ts'
import { requirePermission } from '../auth/permissions.ts'
import { audit } from '../system/audit.ts'
import { spent } from './budget.ts'
import { dayOf, monthOf } from './store.ts'

/**
 * Alerts for the administration. The assistant tells the people who run it when something needs a decision: a budget is nearly
 * or fully used, the required model could not be verified, the provider refuses the key or the account. An alert is a row with a
 * KIND and a PERIOD (a day or a month) and there is at most one per kind per period, so a limit that stays exceeded raises one
 * alert, not one per request. The row holds codes and numbers only; the administration words them in its own language.
 *
 * Alerts are shown in the administration (the AI screen and its badge). They are not e-mailed: the e-mail outbox is for messages
 * to customers and the owner's quote notifications, and a second kind of unattended message would be a second thing that can fail.
 */

export type AlertLevel = 'info' | 'warning' | 'critical'

export type AlertKind =
  | 'cost_day_warning'
  | 'cost_day_exhausted'
  | 'cost_month_warning'
  | 'cost_month_exhausted'
  | 'tokens_day_warning'
  | 'tokens_day_exhausted'
  | 'requests_day_warning'
  | 'requests_day_exhausted'
  | 'model_unverified'
  | 'model_mismatch'
  | 'model_not_found'
  | 'provider_auth'
  | 'provider_billing'

export interface AlertRow {
  id: string
  kind: AlertKind
  level: AlertLevel
  period: string
  detail: string | null
  created_at: string
  acknowledged_at: string | null
}

/** Raises an alert unless this kind already has one for this period. Returns whether a new one was written. */
export function raiseAlert(app: AppContext, kind: AlertKind, level: AlertLevel, period: string, detail: Record<string, number | string | null> = {}): boolean {
  const result = app.db.run('INSERT OR IGNORE INTO ai_alerts (id, kind, level, period, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)', [newId(), kind, level, period, JSON.stringify(detail), iso(app.clock.now())])
  if (result.changes > 0) app.log.warn('assistant alert', { kind, level, period })
  return result.changes > 0
}

/** An alert about the model or the provider; once per day. */
export function raiseProviderAlert(app: AppContext, kind: Extract<AlertKind, 'model_unverified' | 'model_mismatch' | 'model_not_found' | 'provider_auth' | 'provider_billing'>, detail: Record<string, number | string | null> = {}): void {
  raiseAlert(app, kind, 'critical', dayOf(app.clock.now()), detail)
}

/**
 * Compares today's and this month's use with the limits and raises an alert for each one that has reached the warning
 * percentage (a warning) or the whole limit (critical). Cheap enough to run after every finished request.
 */
export function checkThresholds(app: AppContext, settings: AiSettings): void {
  const now = app.clock.now()
  const day = dayOf(now)
  const month = monthOf(now)
  const used = spent(app, now)
  const warnAt = settings.alertPercent / 100
  const rows: Array<{ stem: 'cost_day' | 'cost_month' | 'tokens_day' | 'requests_day'; used: number; limit: number; period: string }> = [
    { stem: 'cost_day', used: used.dayCostUsd, limit: settings.dailyBudgetUsd, period: day },
    { stem: 'cost_month', used: used.monthCostUsd, limit: settings.monthlyBudgetUsd, period: month },
    { stem: 'tokens_day', used: used.dayTokens, limit: settings.dailyTokenBudget, period: day },
    { stem: 'requests_day', used: used.dayRequests, limit: settings.dailyRequests, period: day },
  ]
  for (const row of rows) {
    if (row.limit <= 0) continue
    const ratio = row.used / row.limit
    const detail = { used: Math.round(row.used * 10000) / 10000, limit: row.limit, percent: Math.round(ratio * 100) }
    if (ratio >= 1) raiseAlert(app, `${row.stem}_exhausted`, 'critical', row.period, detail)
    else if (ratio >= warnAt) raiseAlert(app, `${row.stem}_warning`, 'warning', row.period, detail)
  }
}

/** A request was refused because a limit was reached: the alert for that limit (the others are the visitor's own limits). */
export function alertForRefusal(app: AppContext, settings: AiSettings, reason: string): void {
  const stem = reason === 'daily_budget' ? 'cost_day' : reason === 'monthly_budget' ? 'cost_month' : reason === 'daily_tokens' ? 'tokens_day' : reason === 'daily_requests' ? 'requests_day' : null
  if (!stem) return
  checkThresholds(app, settings)
  const period = stem === 'cost_month' ? monthOf(app.clock.now()) : dayOf(app.clock.now())
  raiseAlert(app, `${stem}_exhausted`, 'critical', period, { reason })
}

export const listAlerts = (app: AppContext, limit = 30): AlertRow[] => app.db.all<AlertRow>('SELECT id, kind, level, period, detail, created_at, acknowledged_at FROM ai_alerts ORDER BY created_at DESC, rowid DESC LIMIT ?', [limit])

export const openAlertCount = (app: AppContext): number => app.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM ai_alerts WHERE acknowledged_at IS NULL')?.n ?? 0

/** Marks one alert (or, without an id, every open one) as seen. */
export function acknowledgeAlerts(app: AppContext, session: SessionInfo | null, id: string | null): number {
  const actor = requirePermission(session, 'system:write')
  const now = iso(app.clock.now())
  const result =
    id === null
      ? app.db.run('UPDATE ai_alerts SET acknowledged_at = ?, acknowledged_by = ? WHERE acknowledged_at IS NULL', [now, actor.userId])
      : app.db.run('UPDATE ai_alerts SET acknowledged_at = ?, acknowledged_by = ? WHERE id = ? AND acknowledged_at IS NULL', [now, actor.userId, id])
  if (id !== null && result.changes === 0 && !app.db.get('SELECT 1 FROM ai_alerts WHERE id = ?', [id])) throw notFound('The alert')
  audit(app, actor, 'ai.alerts.acknowledge', 'ai_alert', id, { count: result.changes })
  return result.changes
}
