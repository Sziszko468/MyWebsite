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
import { AI_RANGES, dollars, duration, formFrom, payloadFrom, sameForm, share, type AiForm, type AiRange, type AiSummary, type AiUsage, type NumericSetting } from '../lib/ai'
import { describeError, fieldErrors } from '../lib/errors'
import { useSession } from '../session/SessionProvider'
import ai from '../styles/ai.module.scss'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

const TABS = ['overview', 'settings', 'knowledge'] as const
type Tab = (typeof TABS)[number]

/**
 * The AI assistant's screen: real usage, the budgets and what is left of them, the settings (enforced by the server), and the
 * sources the assistant reads. Reading needs the system-read permission and changing needs system-write, which only an
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
  const tab: Tab = requested && TABS.includes(requested) ? requested : 'overview'
  const base = useId()
  return (
    <>
      <PageHeader title={t.ai.title} lead={t.ai.lead} />
      <div className={styles.stackLg}>
        <Availability summary={summary} />
        <Tabs label={t.ai.tabs.label} idBase={base} value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} tabs={TABS.map((id) => ({ id, label: t.ai.tabs[id] }))} />
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

function Availability({ summary }: { summary: AiSummary }) {
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
        {s.model}: <strong>{summary.model.id}</strong> · {s.provider}: {summary.model.provider} · {s.key}: {summary.apiKey === 'set' ? s.keySet : s.keyMissing}
      </p>
      <p className={ai.statusMeta}>{s.modelNote}</p>
    </section>
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
  { title: 'budgets', keys: ['dailyBudgetUsd', 'monthlyBudgetUsd', 'dailyTokenBudget', 'dailyRequests', 'maxDailyConversations'] },
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
          <SwitchField label={a.enabled} checked={form.enabled} onChange={(enabled) => setForm({ ...form, enabled })} />
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

