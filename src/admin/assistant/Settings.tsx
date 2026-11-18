import { useState, type FormEvent } from 'react'
import { assistant, type AssistantUsage } from '../api/assistant'
import { ApiError } from '../api/client'
import * as endpoints from '../api/endpoints'
import { AdminButton } from '../components/AdminButton'
import { DataList } from '../components/DataList'
import { SelectField, TextField } from '../components/form'
import { DashboardStatCard, DetailPanel } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { useUnsavedChanges } from '../hooks/useUnsavedChanges'
import { fill, formatDateTime, formatNumber, useInterfaceLanguage, useText } from '../i18n'
import { assistantText } from '../i18n/assistant'
import { dollars, duration, type AiSummary } from '../lib/ai'
import { describeError, fieldErrors } from '../lib/errors'
import ai from '../styles/ai.module.scss'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'

/**
 * The "Admin assistant" tab of the AI screen (PROMPT 31): the switch (it needs the same verified connection as the visitors' assistant: there is no second key and no second
 * model), its own limits, and what it has used, as numbers only (no conversation text, no names). The words are the administration's two languages.
 */

const LIMITS = ['adminMaxRequestsPerHour', 'adminMaxToolCalls', 'adminMaxOutputTokens', 'adminMaxInputChars'] as const
type LimitKey = (typeof LIMITS)[number]
const RANGES: readonly AssistantUsage['range'][] = ['today', 'last_7_days', 'month']

export function AdminAssistantSettings({ summary, onChanged }: { summary: AiSummary; onChanged: (summary: AiSummary) => void }) {
  const language = useInterfaceLanguage()
  const t = assistantText(language).settings
  const text = useText()
  const toast = useToast()
  const [switching, setSwitching] = useState(false)
  const writable = summary.canWrite
  const enabled = summary.settings.adminAssistantEnabled
  const blocker = summary.activation.blocker

  const switchTo = async (next: boolean) => {
    setSwitching(true)
    try {
      onChanged(await endpoints.ai.save({ adminAssistantEnabled: next }))
      toast.success(t.saved)
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 409 ? t.needsVerification : describeError(text, error))
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className={ai.sectionGap}>
      <DetailPanel title={t.title}>
        <p className={ai.note}>{t.lead}</p>
        <p className={ai.state} data-tone={enabled ? 'success' : 'neutral'} role="status">
          <span className={ai.dot} aria-hidden="true" />
          {enabled ? t.on : t.off}
        </p>
        <p className={ai.note}>{t.switchHint}</p>
        {writable ? (
          <div className={page.actions}>
            {enabled ? (
              <AdminButton type="button" variant="secondary" danger loading={switching} onClick={() => void switchTo(false)}>
                {t.off}
              </AdminButton>
            ) : (
              <AdminButton type="button" variant="primary" loading={switching} disabled={blocker !== null} onClick={() => void switchTo(true)}>
                {t.switchLabel}
              </AdminButton>
            )}
            <AdminButton variant="secondary" to="/ai-assistant">
              {t.open}
            </AdminButton>
          </div>
        ) : (
          <p className={ai.note}>{t.needsVerification}</p>
        )}
        {!enabled && blocker !== null && <p className={ai.note}>{fill(text.ai.model.blocked, { reason: text.ai.status.reasons[blocker] })}</p>}
      </DetailPanel>
      <Limits summary={summary} onChanged={onChanged} />
      <Usage />
    </div>
  )
}

function Limits({ summary, onChanged }: { summary: AiSummary; onChanged: (summary: AiSummary) => void }) {
  const language = useInterfaceLanguage()
  const t = assistantText(language).settings
  const text = useText()
  const toast = useToast()
  const labels: Record<LimitKey, string> = { adminMaxRequestsPerHour: t.requestsPerHour, adminMaxToolCalls: t.toolSteps, adminMaxOutputTokens: t.outputTokens, adminMaxInputChars: t.inputChars }
  const initial = Object.fromEntries(LIMITS.map((key) => [key, String(summary.settings[key])])) as Record<LimitKey, string>
  const [form, setForm] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  useUnsavedChanges(dirty)
  const writable = summary.canWrite

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setErrors({})
    try {
      const next = await endpoints.ai.save(Object.fromEntries(LIMITS.map((key) => [key, Number(form[key])])))
      onChanged(next)
      const fresh = Object.fromEntries(LIMITS.map((key) => [key, String(next.settings[key])])) as Record<LimitKey, string>
      setForm(fresh)
      setSaved(fresh)
      toast.success(t.saved)
    } catch (error) {
      setErrors(fieldErrors(text, error))
      toast.error(describeError(text, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailPanel title={t.limitsTitle}>
      <p className={ai.note}>{t.limitsLead}</p>
      <form onSubmit={(event) => void submit(event)} className={styles.stackLg} noValidate>
        <fieldset className={styles.fieldset} disabled={!writable || busy}>
          <legend className={styles.legend}>{t.limitsTitle}</legend>
          <div className={styles.formGrid}>
            {LIMITS.map((key) => (
              <TextField key={key} label={labels[key]} type="text" inputMode="numeric" value={form[key]} error={errors[key] ?? null} onChange={(event) => setForm({ ...form, [key]: event.target.value })} />
            ))}
          </div>
        </fieldset>
        {writable && (
          <div className={page.actions}>
            <AdminButton type="submit" variant="primary" loading={busy} disabled={!dirty}>
              {t.save}
            </AdminButton>
          </div>
        )}
      </form>
    </DetailPanel>
  )
}

function Usage() {
  const language = useInterfaceLanguage()
  const t = assistantText(language).settings
  const [range, setRange] = useState<AssistantUsage['range']>('today')
  const resource = useResource((signal) => assistant.usage(range, signal), [range])
  const fmt = (value: number) => formatNumber(value, language)
  const usage = resource.data
  return (
    <DetailPanel title={t.usageTitle}>
      <p className={ai.note}>{t.usageLead}</p>
      <SelectField label={t.range} value={range} onChange={(event) => setRange(event.target.value as AssistantUsage['range'])} options={RANGES.map((value) => ({ value, label: t.ranges[value] }))} compact />
      {resource.loading && !usage ? (
        <LoadingState />
      ) : resource.error || !usage ? (
        <ErrorState error={resource.error} onRetry={resource.reload} title={t.loadFailed} />
      ) : (
        <>
          <div className={ai.stats}>
            <DashboardStatCard compact label={t.requests} value={fmt(usage.requests)} note={`${fmt(usage.completedRequests)} ✓`} />
            <DashboardStatCard compact label={t.failed} value={fmt(usage.failedRequests)} tone={usage.failedRequests > 0 ? 'warning' : undefined} />
            <DashboardStatCard compact label={t.tokens} value={`${fmt(usage.inputTokens)} / ${fmt(usage.outputTokens)}`} />
            <DashboardStatCard compact label={t.cost} value={dollars(usage.estimatedCostUsd, language)} note={t.costNote} tone="info" />
            <DashboardStatCard compact label={t.response} value={usage.averageResponseMs === null ? '–' : duration(usage.averageResponseMs, language)} />
            <DashboardStatCard compact label={t.toolCalls} value={fmt(usage.toolCalls)} />
            <DashboardStatCard compact label={t.conversations} value={fmt(usage.conversationsStarted)} />
            <DashboardStatCard compact label={t.reports} value={fmt(usage.reportsGenerated)} />
          </div>
          {usage.tools.length === 0 ? (
            <p className={ai.note}>{t.none}</p>
          ) : (
            <DataList
              caption={t.toolsTitle}
              rows={usage.tools}
              rowKey={(row) => row.tool}
              columns={[
                { key: 'tool', header: t.tool, cell: (row) => (assistantText(language).tools.names as Record<string, string>)[row.tool] ?? row.tool },
                { key: 'calls', header: t.calls, cell: (row) => fmt(row.calls) },
                { key: 'errors', header: t.errors, cell: (row) => fmt(row.failed) },
                { key: 'time', header: t.response, cell: (row) => (row.averageMs === null ? '–' : duration(row.averageMs, language)) },
              ]}
              card={(row) => (
                <div className={styles.cellMain}>
                  <span className={styles.cellTitle}>{(assistantText(language).tools.names as Record<string, string>)[row.tool] ?? row.tool}</span>
                  <span>
                    {t.calls}: {fmt(row.calls)} · {t.errors}: {fmt(row.failed)}
                  </span>
                </div>
              )}
            />
          )}
          <h3 className={ai.subheading}>{t.recentFailures}</h3>
          {usage.recentFailures.length === 0 ? (
            <p className={ai.note}>{t.noFailures}</p>
          ) : (
            <ul className={ai.alerts}>
              {usage.recentFailures.map((failure, index) => (
                <li key={index} className={ai.alert} data-level="warning">
                  <div className={ai.alertBody}>
                    <p className={ai.alertText}>
                      <code>{failure.code}</code>
                    </p>
                    <p className={ai.statusMeta}>{formatDateTime(failure.at, language)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </DetailPanel>
  )
}
