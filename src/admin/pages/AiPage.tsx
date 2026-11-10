import { useId, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { LANGUAGES, type Language } from '../../i18n/config'
import { ApiError } from '../api/client'
import * as endpoints from '../api/endpoints'
import { AdminButton } from '../components/AdminButton'
import { BarChart, Meter } from '../components/AiCharts'
import { DataList } from '../components/DataList'
import { CheckField, SelectField, SwitchField, TextAreaField, TextField } from '../components/form'
import { DashboardStatCard, DetailPanel, PageHeader, TabPanel, Tabs, useLanguageName } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { fill, formatDateTime, formatNumber, useInterfaceLanguage, useText } from '../i18n'
import { AI_RANGES, dollars, duration, formFrom, payloadFrom, sameForm, share, type AiAlert, type AiForm, type AiRange, type AiSummary, type AiTestResult, type AiUsage, type ConnectionStatus, type NumericSetting } from '../lib/ai'
import { describeError, fieldErrors } from '../lib/errors'
import { useSession } from '../session/SessionProvider'
import ai from '../styles/ai.module.scss'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

const TABS = ['model', 'overview', 'settings', 'knowledge'] as const
type Tab = (typeof TABS)[number]

/**
 * The AI assistant's screen: the required model and the state of its connection (with the connection test and the activation
 * switch), real usage, the budgets and what is left of them, the alerts, the settings (enforced by the server), and the sources the
 * assistant reads. The model itself cannot be changed here. Reading needs the system-read permission and changing needs system-write, which only an
 * administrator has; the server checks both regardless of what this screen shows.
 */
export function AiPage() {
  const session = useSession()
  const resource = useResource((signal) => endpoints.ai.summary(signal), [])
  if (!session.can('system:read')) return <ErrorState error={new ApiError(403, 'forbidden', '')} level={1} />
  if (resource.loading || !resource.data) return resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} level={1} /> : <LoadingState />
  return <Screen summary={resource.data} onChanged={(next) => resource.set(next)} reload={resource.reload} />
}

function Screen({ summary, onChanged, reload }: { summary: AiSummary; onChanged: (summary: AiSummary) => void; reload: () => void }) {
  const t = useText()
  // The tab is in the address (?tab=settings), like the Settings screen's, so a link can point at it.
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && TABS.includes(requested) ? requested : 'model'
  const base = useId()
  return (
    <>
      <PageHeader title={t.ai.title} lead={t.ai.lead} />
      <div className={styles.stackLg}>
        <Availability summary={summary} onAlerts={() => setParams({ tab: 'model' }, { replace: true })} />
        <Tabs label={t.ai.tabs.label} idBase={base} value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} tabs={TABS.map((id) => ({ id, label: t.ai.tabs[id] }))} />
        <TabPanel id="model" idBase={base} active={tab === 'model'}>
          <ModelPanel summary={summary} onChanged={onChanged} />
        </TabPanel>
        <TabPanel id="overview" idBase={base} active={tab === 'overview'}>
          <Overview summary={summary} />
        </TabPanel>
        <TabPanel id="settings" idBase={base} active={tab === 'settings'}>
          <SettingsForm summary={summary} onSaved={onChanged} />
        </TabPanel>
        <TabPanel id="knowledge" idBase={base} active={tab === 'knowledge'}>
          <Knowledge summary={summary} onRefreshed={onChanged} reload={reload} />
        </TabPanel>
      </div>
    </>
  )
}

function Availability({ summary, onAlerts }: { summary: AiSummary; onAlerts: () => void }) {
  const t = useText()
  const s = t.ai.status
  const on = summary.availability.available
  return (
    <section className={ai.status} data-state={on ? 'on' : 'off'} aria-label={t.ai.title}>
      <p className={ai.statusText} role="status">
        {on ? s.on : s.off}
        {!summary.availability.available && ` ${s.reasons[summary.availability.reason]}`}
      </p>
      <p className={ai.statusMeta}>
        {s.model}: <strong>{summary.model.requiredName}</strong> (<code>{summary.model.id}</code>) · {s.provider}: {summary.model.provider} · {s.key}: {summary.apiKey === 'set' ? s.keySet : s.keyMissing}
      </p>
      <p className={ai.statusMeta}>{s.modelNote}</p>
      {summary.alerts.open > 0 && (
        <p className={ai.statusMeta} role="status">
          <button type="button" className={ai.linkButton} onClick={onAlerts}>
            {fill(s.openAlerts, { count: summary.alerts.open })}
          </button>
        </p>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------------------------------------------- model

const TONE: Record<ConnectionStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { connected: 'success', not_tested: 'neutral', failed: 'danger', stale: 'warning', no_key: 'danger', model_lock: 'danger' }

/** The required model, the state of the connection, the connection test, the activation switch, usage against budget, and the alerts. */
function ModelPanel({ summary, onChanged }: { summary: AiSummary; onChanged: (summary: AiSummary) => void }) {
  const t = useText()
  const toast = useToast()
  const language = useInterfaceLanguage()
  const m = t.ai.model
  const [testing, setTesting] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [result, setResult] = useState<AiTestResult | null>(null)
  const c = summary.connection
  const fmt = (value: number) => formatNumber(value, language)
  const when = (value: string | null) => (value ? formatDateTime(value, language) : m.never)
  const reasonText = (code: string | null) => (code ? ((m.reasons as Record<string, string>)[code] ?? code) : m.none)
  const writable = summary.canWrite
  const enabled = summary.settings.enabled
  const blocker = summary.activation.blocker

  const runTest = async () => {
    setTesting(true)
    try {
      const answer = await endpoints.ai.test()
      setResult(answer.result)
      onChanged(answer.summary)
      if (answer.result.ok) toast.success(m.testOk)
      else toast.error(m.testFailed)
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setTesting(false)
    }
  }

  const switchTo = async (next: boolean) => {
    setSwitching(true)
    try {
      onChanged(await endpoints.ai.setEnabled(next))
      toast.success(next ? m.switchedOn : m.switchedOff)
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 409 ? m.needsVerification : describeError(t, error))
    } finally {
      setSwitching(false)
    }
  }

  const acknowledge = async (id?: string) => {
    try {
      onChanged(await endpoints.ai.acknowledge(id))
      toast.success(m.acknowledged)
    } catch (error) {
      toast.error(describeError(t, error))
    }
  }

  const alertText = (alert: AiAlert): string => {
    const detail = alert.detail ?? {}
    const money = alert.kind.startsWith('cost_')
    const amount = (value: number | undefined) => (value === undefined ? '' : money ? dollars(value, language) : fmt(value))
    return fill((m.alertKinds as Record<string, string>)[alert.kind] ?? alert.kind, { percent: detail.percent ?? '', used: amount(detail.used), limit: amount(detail.limit), reason: reasonText(detail.reason ?? null), reported: detail.reported ?? '' })
  }

  const b = summary.budget
  const totals = summary.totals
  return (
    <div className={ai.sectionGap}>
      <div className={ai.twoColumns}>
        <DetailPanel title={m.requiredTitle}>
          <Rows
            empty=""
            rows={[
              { name: m.required, value: summary.model.requiredName },
              { name: m.configured, value: summary.model.id },
              { name: m.provider, value: summary.model.provider },
            ]}
          />
          <p className={ai.note}>{m.fixed}</p>
          {summary.model.overrideRejected && (
            <p className={ai.warning} role="alert">
              {m.override}
            </p>
          )}
        </DetailPanel>

        <DetailPanel title={m.connectionTitle}>
          <p className={ai.state} data-tone={TONE[c.status]} role="status">
            <span className={ai.dot} aria-hidden="true" />
            {m.connection[c.status]}
          </p>
          <Rows
            empty=""
            rows={[
              { name: m.key, value: c.keyConfigured ? m.keySet : m.keyMissing },
              { name: m.endpoint, value: c.endpoint },
              { name: m.reported, value: c.verification.reportedModel ?? m.never },
              { name: m.lastTest, value: c.lastSuccessfulTest ? `${when(c.lastSuccessfulTest.at)}${c.lastSuccessfulTest.latencyMs === null ? '' : ` · ${fill(m.latency, { ms: fmt(c.lastSuccessfulTest.latencyMs) })}`}` : m.never },
              { name: m.lastError, value: c.lastError ? fill(m.errorLine, { code: reasonText(c.lastError.code), source: m.source[c.lastError.source], time: when(c.lastError.at) }) : m.none },
            ]}
          />
        </DetailPanel>
      </div>

      <div className={ai.twoColumns}>
        <DetailPanel title={m.testTitle}>
          <p className={ai.note}>{m.testLead}</p>
          {writable ? (
            <div className={page.actions}>
              <AdminButton type="button" variant="secondary" loading={testing} loadingLabel={m.running} onClick={() => void runTest()}>
                {m.run}
              </AdminButton>
            </div>
          ) : (
            <p className={ai.note}>{m.readOnly}</p>
          )}
          {result && (
            <p className={ai.state} data-tone={result.ok ? 'success' : 'danger'} role="status">
              <span className={ai.dot} aria-hidden="true" />
              {result.ok ? m.testOk : `${m.testFailed} ${reasonText(result.reason)}.`}
              {result.latencyMs !== null && ` ${fill(m.latency, { ms: fmt(result.latencyMs) })}`}
            </p>
          )}
        </DetailPanel>

        <DetailPanel title={m.activationTitle}>
          <p className={ai.state} data-tone={enabled ? 'success' : 'neutral'} role="status">
            <span className={ai.dot} aria-hidden="true" />
            {enabled ? m.on : m.off}
          </p>
          <p className={ai.note}>{m.activationLead}</p>
          {writable ? (
            <div className={page.actions}>
              {enabled ? (
                <AdminButton type="button" variant="secondary" danger loading={switching} loadingLabel={m.switching} onClick={() => void switchTo(false)}>
                  {m.switchOff}
                </AdminButton>
              ) : (
                <AdminButton type="button" variant="primary" loading={switching} loadingLabel={m.switching} disabled={blocker !== null} onClick={() => void switchTo(true)}>
                  {m.switchOn}
                </AdminButton>
              )}
            </div>
          ) : (
            <p className={ai.note}>{m.readOnly}</p>
          )}
          {!enabled && blocker !== null && <p className={ai.note}>{fill(m.blocked, { reason: t.ai.status.reasons[blocker] })}</p>}
        </DetailPanel>
      </div>

      <DetailPanel title={m.usageTitle}>
        <section aria-label={m.usageTitle} className={ai.stats}>
          <DashboardStatCard
            compact
            label={m.requests}
            value={fmt(totals.requests)}
            note={[fmt(totals.modelVerifiedRequests) + ' ' + m.verified, totals.modelUnreportedRequests > 0 ? `${fmt(totals.modelUnreportedRequests)} ${m.unreported}` : '', totals.modelMismatchedRequests > 0 ? `${fmt(totals.modelMismatchedRequests)} ${m.mismatched}` : ''].filter(Boolean).join(' · ')}
            tone={totals.modelMismatchedRequests > 0 ? 'warning' : undefined}
          />
          <DashboardStatCard compact label={m.tokens} value={fmt(totals.tokens)} note={fill(m.tokensNote, { month: fmt(totals.monthTokens) })} />
          <DashboardStatCard compact label={m.cost} value={dollars(totals.estimatedCostUsd, language)} note={m.costNote} tone="info" />
          <DashboardStatCard compact label={`${m.today} · ${m.cost}`} value={fill(m.budgetValue, { used: dollars(b.day.spentUsd, language), budget: dollars(b.day.budgetUsd, language) })} note={m.states[b.day.state]} tone={b.day.state === 'ok' ? undefined : 'warning'} />
          <DashboardStatCard compact label={`${m.month} · ${m.cost}`} value={fill(m.budgetValue, { used: dollars(b.month.spentUsd, language), budget: dollars(b.month.budgetUsd, language) })} note={m.states[b.month.state]} tone={b.month.state === 'ok' ? undefined : 'warning'} />
        </section>
        <p className={ai.note}>{fill(m.alertAt, { percent: b.alertPercent })}</p>
      </DetailPanel>

      <DetailPanel title={m.alertsTitle}>
        {summary.alerts.items.length === 0 ? (
          <p className={ai.note}>{m.alertsNone}</p>
        ) : (
          <ul className={ai.alerts}>
            {summary.alerts.items.map((alert) => (
              <li key={alert.id} className={ai.alert} data-level={alert.level} data-seen={alert.acknowledgedAt ? 'true' : 'false'}>
                <div className={ai.alertBody}>
                  <p className={ai.alertText}>
                    <strong>{m.level[alert.level]}</strong> {alertText(alert)}
                  </p>
                  <p className={ai.statusMeta}>
                    {when(alert.createdAt)}
                    {alert.acknowledgedAt ? ` · ${m.seen}` : ''}
                  </p>
                </div>
                {writable && !alert.acknowledgedAt && (
                  <AdminButton type="button" variant="text" onClick={() => void acknowledge(alert.id)}>
                    {m.acknowledge}
                  </AdminButton>
                )}
              </li>
            ))}
          </ul>
        )}
        {writable && summary.alerts.open > 1 && (
          <div className={page.actions}>
            <AdminButton type="button" variant="secondary" onClick={() => void acknowledge()}>
              {m.acknowledgeAll}
            </AdminButton>
          </div>
        )}
      </DetailPanel>

      <DetailPanel title={m.testsTitle}>
        {c.tests.length === 0 && <p className={ai.note}>{m.testsNone}</p>}
        <DataList
          caption={m.testsTitle}
          rows={c.tests}
          rowKey={(row) => row.id}
          columns={[
            { key: 'when', header: m.when, cell: (row) => when(row.at) },
            { key: 'outcome', header: m.outcome, cell: (row) => m.outcomes[row.outcome] },
            { key: 'reason', header: m.reason, cell: (row) => (row.reason ? reasonText(row.reason) : m.none) },
            { key: 'model', header: m.modelColumn, cell: (row) => row.reportedModel ?? m.none },
            { key: 'time', header: m.time, cell: (row) => (row.latencyMs === null ? '–' : fill(m.latency, { ms: fmt(row.latencyMs) })) },
            { key: 'tokens', header: m.tokensColumn, cell: (row) => (row.inputTokens === null ? '–' : `${fmt(row.inputTokens)} + ${fmt(row.outputTokens ?? 0)}`) },
          ]}
          card={(row) => (
            <div className={styles.cellMain}>
              <span className={styles.cellTitle}>
                {m.outcomes[row.outcome]} · {when(row.at)}
              </span>
              <span>{row.reason ? reasonText(row.reason) : (row.reportedModel ?? m.none)}</span>
            </div>
          )}
        />
      </DetailPanel>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------------------------- overview

function Overview({ summary }: { summary: AiSummary }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const [range, setRange] = useState<AiRange>('daily')
  const usage = useResource((signal) => endpoints.ai.usage(range, signal), [range])
  const o = usage.data ?? { ...summary.overview, series: { range: 'daily' as const, points: [] } }
  const fmt = (value: number) => formatNumber(value, language)
  const a = t.ai
  const b = summary.budget
  const tone = (used: number, budget: number) => (share(used, budget) >= 0.9 ? 'danger' : share(used, budget) >= 0.7 ? 'warning' : 'normal')

  return (
    <div className={ai.sectionGap}>
      <div className={styles.formGrid}>
        <SelectField label={a.range.label} value={range} options={AI_RANGES.map((value) => ({ value, label: a.range[value] }))} onChange={(event) => setRange(event.target.value as AiRange)} compact />
      </div>
      {usage.error ? <ErrorState error={usage.error} onRetry={usage.reload} level={2} /> : null}

      <section aria-label={a.stats.requests} className={ai.stats}>
        <DashboardStatCard compact label={a.stats.conversations} value={fmt(o.conversations)} />
        <DashboardStatCard compact label={a.stats.requests} value={fmt(o.requests)} note={fill(a.stats.requestsNote, { reported: fmt(o.requestsWithReportedUsage) })} />
        <DashboardStatCard compact label={a.stats.inputTokens} value={fmt(o.inputTokens)} />
        <DashboardStatCard compact label={a.stats.outputTokens} value={fmt(o.outputTokens)} />
        <DashboardStatCard compact label={a.stats.cost} value={dollars(o.estimatedCostUsd, language)} note={a.stats.costNote} tone="info" />
        <DashboardStatCard compact label={a.stats.response} value={o.averageResponseMs === null ? '–' : `${fmt(o.averageResponseMs)} ms`} note={o.averageFirstTokenMs === null ? undefined : fill(a.stats.responseNote, { first: `${fmt(o.averageFirstTokenMs)} ms` })} />
        <DashboardStatCard compact label={a.stats.failed} value={fmt(o.failedRequests)} note={a.stats.failedNote} tone={o.failedRequests > 0 ? 'warning' : undefined} />
        <DashboardStatCard compact label={a.stats.tools} value={fmt(o.toolCalls)} />
      </section>

      <DetailPanel title={a.budget.title}>
        <p className={ai.note}>{a.budget.lead}</p>
        <div className={ai.meters}>
          <Meter label={`${a.budget.day} · ${a.stats.cost}`} value={b.day.spentUsd} max={b.day.budgetUsd} text={fill(a.budget.money, { used: dollars(b.day.spentUsd, language), budget: dollars(b.day.budgetUsd, language) })} tone={tone(b.day.spentUsd, b.day.budgetUsd)} />
          <Meter label={`${a.budget.month} · ${a.stats.cost}`} value={b.month.spentUsd} max={b.month.budgetUsd} text={fill(a.budget.money, { used: dollars(b.month.spentUsd, language), budget: dollars(b.month.budgetUsd, language) })} tone={tone(b.month.spentUsd, b.month.budgetUsd)} />
          <Meter label={a.budget.tokens} value={b.day.tokens} max={b.day.tokenBudget} text={fill(a.budget.tokensValue, { used: fmt(b.day.tokens), limit: fmt(b.day.tokenBudget) })} tone={tone(b.day.tokens, b.day.tokenBudget)} />
          <Meter label={a.budget.requests} value={b.day.requests} max={b.day.requestLimit} text={fill(a.budget.requestsValue, { used: fmt(b.day.requests), limit: fmt(b.day.requestLimit) })} tone={tone(b.day.requests, b.day.requestLimit)} />
        </div>
        <p className={ai.note}>{summary.pricing.note}</p>
      </DetailPanel>

      <Charts usage={o} />

      <div className={ai.twoColumns}>
        <DetailPanel title={a.analytics.topics}>
          <p className={ai.note}>{a.analytics.lead}</p>
          <Rows empty={a.analytics.none} rows={o.topics.map((row) => ({ name: (a.analytics.topic as Record<string, string>)[row.topic] ?? row.topic, value: fmt(row.n) }))} />
        </DetailPanel>
        <DetailPanel title={a.analytics.tools}>
          <Rows empty={a.analytics.none} rows={o.tools.map((row) => ({ name: row.tool, value: fill(a.analytics.toolRow, { calls: fmt(row.calls), failed: fmt(row.failed), ms: row.averageMs === null ? '–' : fmt(row.averageMs) }) }))} />
        </DetailPanel>
        <DetailPanel title={a.analytics.title}>
          <Rows
            empty={a.analytics.none}
            rows={[
              { name: a.analytics.planner, value: fmt(o.plannerCompleted) },
              { name: a.analytics.quotes, value: fmt(o.quoteRequestsSent) },
              { name: a.analytics.session, value: duration(o.averageConversationSeconds, language) },
            ]}
          />
        </DetailPanel>
        <DetailPanel title={a.analytics.errors}>
          <Rows empty={a.analytics.none} rows={o.errors.map((row) => ({ name: (a.analytics.error as Record<string, string>)[row.code] ?? row.code, value: fmt(row.n) }))} />
        </DetailPanel>
      </div>
    </div>
  )
}

function Charts({ usage }: { usage: AiUsage }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const a = t.ai.charts
  const points = usage.series.points
  const label = (bucket: string) => (usage.series.range === 'monthly' ? bucket : bucket.slice(5))
  const number = (value: number) => formatNumber(Math.round(value), language)
  return (
    <div className={ai.charts}>
      <BarChart title={a.requests} series={[{ label: a.requests, tone: 0 }]} points={points.map((p) => ({ label: label(p.bucket), values: [p.requests] }))} format={number} empty={a.empty} />
      <BarChart title={a.conversations} series={[{ label: a.conversations, tone: 0 }]} points={points.map((p) => ({ label: label(p.bucket), values: [p.conversations] }))} format={number} empty={a.empty} />
      <BarChart title={a.tokens} series={[{ label: a.input, tone: 0 }, { label: a.output, tone: 1 }]} points={points.map((p) => ({ label: label(p.bucket), values: [p.inputTokens, p.outputTokens] }))} format={number} empty={a.empty} />
      <BarChart title={a.cost} series={[{ label: a.costSeries, tone: 1 }]} points={points.map((p) => ({ label: label(p.bucket), values: [p.costUsd] }))} format={(value) => dollars(value, language)} empty={a.empty} />
    </div>
  )
}

function Rows({ rows, empty }: { rows: { name: string; value: string }[]; empty: string }) {
  if (rows.length === 0) return <p className={ai.note}>{empty}</p>
  return (
    <dl className={ai.rows}>
      {rows.map((row) => (
        <div key={row.name} className={ai.row}>
          <dt>{row.name}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

// ---------------------------------------------------------------------------------------------------------------- settings

const GROUPS: { title: 'budgets' | 'limits'; keys: NumericSetting[] }[] = [
  { title: 'budgets', keys: ['dailyBudgetUsd', 'monthlyBudgetUsd', 'alertPercent', 'dailyTokenBudget', 'dailyRequests', 'maxDailyConversations'] },
  { title: 'limits', keys: ['maxRequestsPerSession', 'maxRequestsPerIp', 'maxInputChars', 'maxHistoryMessages', 'maxConversationMessages', 'maxOutputTokens', 'maxToolCalls', 'conversationMaxHours', 'retentionDays'] },
]

function SettingsForm({ summary, onSaved }: { summary: AiSummary; onSaved: (summary: AiSummary) => void }) {
  const t = useText()
  const toast = useToast()
  const name = useLanguageName()
  const a = t.ai.settings
  const initial = formFrom(summary.settings)
  const [form, setForm] = useState<AiForm>(initial)
  const [saved, setSaved] = useState<AiForm>(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const dirty = !sameForm(form, saved)
  useUnsavedChanges(dirty)
  const writable = summary.canWrite

  const setNumber = (key: NumericSetting, value: string) => setForm({ ...form, numbers: { ...form.numbers, [key]: value } })
  const toggleLanguage = (language: Language, on: boolean) => setForm({ ...form, languages: LANGUAGES.filter((code) => (code === language ? on : form.languages.includes(code))) })

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const next = await endpoints.ai.save(payloadFrom(form))
      onSaved(next)
      const fresh = formFrom(next.settings)
      setForm(fresh)
      setSaved(fresh)
      toast.success(a.saved)
    } catch (error) {
      setErrors(fieldErrors(t, error))
      toast.error(error instanceof ApiError && error.status === 422 ? a.invalid : describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className={styles.stackLg} noValidate>
      <p className={ai.note}>{writable ? a.lead : a.readOnly}</p>
      <fieldset className={styles.fieldset} disabled={!writable || busy}>
        <legend className={styles.legend}>{a.availability}</legend>
        <div className={ai.checks}>
          <SwitchField label={a.planner} checked={form.plannerEnabled} onChange={(plannerEnabled) => setForm({ ...form, plannerEnabled })} />
          <SwitchField label={a.quote} checked={form.quoteEnabled} onChange={(quoteEnabled) => setForm({ ...form, quoteEnabled })} />
        </div>
      </fieldset>
      <fieldset className={styles.fieldset} disabled={!writable || busy}>
        <legend className={styles.legend}>{a.languages}</legend>
        <div className={ai.checks}>
          {LANGUAGES.map((language) => (
            <CheckField key={language} label={name(language)} checked={form.languages.includes(language)} onChange={(on) => toggleLanguage(language, on)} />
          ))}
        </div>
        {errors.languages && (
          <p className={styles.fieldError} role="alert">
            {errors.languages}
          </p>
        )}
      </fieldset>

      {GROUPS.map((group) => (
        <fieldset key={group.title} className={styles.fieldset} disabled={!writable || busy}>
          <legend className={styles.legend}>{a[group.title]}</legend>
          <div className={styles.formGrid}>
            {group.keys.map((key) => (
              <TextField key={key} label={a[key]} type="text" inputMode="decimal" value={form.numbers[key]} error={errors[key] ?? null} onChange={(event) => setNumber(key, event.target.value)} />
            ))}
          </div>
        </fieldset>
      ))}

      <fieldset className={styles.fieldset} disabled={!writable || busy}>
        <legend className={styles.legend}>{a.model}</legend>
        <div className={styles.formGrid}>
          <SelectField label={a.effort} value={form.effort} error={errors.effort ?? null} options={[{ value: 'low', label: a.effortLow }, { value: 'medium', label: a.effortMedium }, { value: 'high', label: a.effortHigh }]} onChange={(event) => setForm({ ...form, effort: event.target.value as AiForm['effort'] })} />
          <SelectField label={a.thinking} value={form.thinking} error={errors.thinking ?? null} options={[{ value: 'adaptive', label: a.thinkingAdaptive }, { value: 'disabled', label: a.thinkingDisabled }]} onChange={(event) => setForm({ ...form, thinking: event.target.value as AiForm['thinking'] })} />
        </div>
      </fieldset>

      <fieldset className={styles.fieldset} disabled={!writable || busy}>
        <legend className={styles.legend}>{a.prices}</legend>
        <p className={ai.note}>{a.pricesLead}</p>
        <div className={styles.formGrid}>
          {(['priceInputPerMTok', 'priceOutputPerMTok'] as const).map((key) => (
            <TextField key={key} label={a[key]} type="text" inputMode="decimal" value={form.numbers[key]} error={errors[key] ?? null} onChange={(event) => setNumber(key, event.target.value)} />
          ))}
          <TextField label={a.pricesAsOf} type="text" value={form.pricesAsOf} error={errors.pricesAsOf ?? null} onChange={(event) => setForm({ ...form, pricesAsOf: event.target.value })} />
        </div>
      </fieldset>

      <fieldset className={styles.fieldset} disabled={!writable || busy}>
        <legend className={styles.legend}>{a.texts}</legend>
        <div className={styles.formGrid}>
          {LANGUAGES.map((language) => (
            <TextAreaField key={`w-${language}`} label={`${a.welcome} · ${name(language)}`} hint={a.welcomeHint} lang={language} rows={3} maxLength={400} value={form.welcome[language]} error={errors[`welcome.${language}`] ?? null} onChange={(event) => setForm({ ...form, welcome: { ...form.welcome, [language]: event.target.value } })} />
          ))}
          {LANGUAGES.map((language) => (
            <TextAreaField key={`s-${language}`} label={`${a.suggestions} · ${name(language)}`} hint={a.suggestionsHint} lang={language} rows={4} value={form.suggestions[language]} error={errors[`suggestions.${language}`] ?? null} onChange={(event) => setForm({ ...form, suggestions: { ...form.suggestions, [language]: event.target.value } })} />
          ))}
        </div>
      </fieldset>

      {writable && (
        <div className={page.actions}>
          <AdminButton type="submit" variant="primary" loading={busy} loadingLabel={a.saving} disabled={!dirty}>
            {a.save}
          </AdminButton>
          <AdminButton type="button" variant="text" disabled={!dirty || busy} onClick={() => { setForm(saved); setErrors({}) }}>
            {a.reset}
          </AdminButton>
        </div>
      )}
    </form>
  )
}

// ---------------------------------------------------------------------------------------------------------------- knowledge

function Knowledge({ summary, onRefreshed, reload }: { summary: AiSummary; onRefreshed: (summary: AiSummary) => void; reload: () => void }) {
  const t = useText()
  const toast = useToast()
  const language = useInterfaceLanguage()
  const [busy, setBusy] = useState(false)
  const k = t.ai.knowledge
  const s = summary.knowledge.sources
  const yesNo = (published: boolean) => (published ? k.yes : k.no)
  const rows = [
    { name: k.projects, value: fill(k.projectsValue, { published: s.projects.published, total: s.projects.total }), where: k.whereProjects },
    { name: k.services, value: fill(k.published, { count: s.services.published }), where: k.whereShop },
    { name: k.packages, value: fill(k.published, { count: s.packages.published }), where: k.whereShop },
    { name: k.addOns, value: fill(k.published, { count: s.addOns.published }), where: k.whereShop },
    { name: k.comparison, value: yesNo(s.comparison.published), where: k.whereShop },
    { name: k.fullExperience, value: yesNo(s.fullExperience.published), where: k.whereShop },
    { name: k.profile, value: s.developerProfile.available ? (s.developerProfile.nameSet ? k.profileValue : k.profileNoName) : k.profileMissing, where: k.whereProfile },
  ]
  const refresh = async () => {
    setBusy(true)
    try {
      onRefreshed(await endpoints.ai.refresh())
      toast.success(k.refreshed)
      reload()
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={ai.sectionGap}>
      <p className={ai.note}>{k.lead}</p>
      <DetailPanel title={k.title}>
        {/* A table where there is room for three columns, a card for each source where there is not (the administration's usual list). */}
        <DataList
          caption={k.title}
          rows={rows}
          rowKey={(row) => row.name}
          columns={[
            { key: 'source', header: k.source, cell: (row) => <span className={styles.cellTitle}>{row.name}</span> },
            { key: 'state', header: k.state, cell: (row) => row.value },
            { key: 'where', header: k.where, cell: (row) => row.where },
          ]}
          card={(row) => (
            <div className={styles.cellMain}>
              <span className={styles.cellTitle}>{row.name}</span>
              <span>{row.value}</span>
              <span className={ai.note}>{row.where}</span>
            </div>
          )}
        />
        <Rows
          empty=""
          rows={[
            { name: k.fingerprint, value: summary.knowledge.fingerprint },
            { name: k.builds, value: formatNumber(summary.knowledge.builds, language) },
            { name: k.lastBuilt, value: summary.knowledge.lastBuiltAt ? formatDateTime(summary.knowledge.lastBuiltAt, language) : k.never },
          ]}
        />
        {summary.canWrite && (
          <div className={page.actions}>
            <AdminButton type="button" variant="secondary" loading={busy} loadingLabel={k.refreshing} onClick={() => void refresh()}>
              {k.refresh}
            </AdminButton>
          </div>
        )}
      </DetailPanel>
    </div>
  )
}

