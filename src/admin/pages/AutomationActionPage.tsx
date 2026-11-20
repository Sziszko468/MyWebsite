import { useState } from 'react'
import { useParams } from 'react-router'
import { fill } from '../../utils/format'
import { automation } from '../api/automation'
import { ApiError } from '../api/client'
import { AdminButton } from '../components/AdminButton'
import { SelectField } from '../components/form'
import { PageHeader } from '../components/layout'
import { EmptyState, LoadingState } from '../components/states'
import { useResource } from '../hooks/useResource'
import { useInterfaceLanguage } from '../i18n'
import { AUTOMATION_LANGUAGES, type AutomationLanguage } from '../i18n/automation'
import { moment, REFERENCE, typeName, word } from '../automation/model'
import { DecisionPanel, Notice, PreviewView, StatusPill, Timeline } from '../automation/Parts'
import { AutomationTextProvider, readStoredLanguage, storeLanguage, useAutomationLanguage, useAutomationText } from '../automation/text'
import styles from '../styles/automation.module.scss'

/**
 * `/admin/automation/:reference` (PROMPT 33): one proposed action, read in full before it is decided: why the assistant proposes it, exactly what would change (before and after), every side
 * effect, whether it can be undone, whether the customer sees it, the fingerprint your approval is bound to, the decision controls, and the history of every step (who proposed, who approved,
 * what the server did). Nothing here runs by itself.
 */

export function AutomationActionPage() {
  const interfaceLanguage = useInterfaceLanguage()
  const [language, setLanguage] = useState<AutomationLanguage>(() => readStoredLanguage(interfaceLanguage))
  const choose = (next: AutomationLanguage) => {
    setLanguage(next)
    storeLanguage(next)
  }
  return (
    <AutomationTextProvider language={language}>
      <Screen language={language} onLanguage={choose} />
    </AutomationTextProvider>
  )
}

function Screen({ language, onLanguage }: { language: AutomationLanguage; onLanguage: (language: AutomationLanguage) => void }) {
  const t = useAutomationText()
  const { reference = '' } = useParams()
  const valid = REFERENCE.test(reference)
  const names = t.language.names as Record<string, string>
  const picker = <SelectField label={t.language.label} hint={t.language.note} value={language} onChange={(event) => onLanguage(event.target.value as AutomationLanguage)} options={AUTOMATION_LANGUAGES.map((code) => ({ value: code, label: names[code] }))} />
  return (
    <>
      <PageHeader title={valid ? reference : t.title} lead={valid ? undefined : t.detail.notFound} back={{ to: '/automation', label: t.detail.back }} actions={picker} />
      {valid ? <Detail reference={reference} /> : <EmptyState icon="alert" title={t.detail.notFound} />}
    </>
  )
}

function Detail({ reference }: { reference: string }) {
  const t = useAutomationText()
  const language = useAutomationLanguage()
  const resource = useResource((signal) => automation.detail(reference, signal), [reference])
  const [message, setMessage] = useState<string | null>(null)
  const action = resource.data

  if (resource.loading) return <LoadingState label={t.loading} />
  if (!action) {
    const missing = resource.error instanceof ApiError && resource.error.status === 404
    return (
      <EmptyState icon="alert" title={missing ? t.detail.notFound : t.errors.generic} action={missing ? undefined : <AdminButton variant="secondary" type="button" onClick={resource.reload}>{t.errors.retry}</AdminButton>}>
        {missing ? undefined : t.errors.generic}
      </EmptyState>
    )
  }
  const by = action.administrator.email ?? t.detail.unknownAdmin
  return (
    <div className={styles.detail}>
      <header className={styles.detailHead}>
        <h2 className={styles.detailTitle}>{typeName(t, action.type)}</h2>
        <StatusPill status={action.status} />
      </header>
      <p className={styles.muted}>
        {(t.types as Record<string, { summary: string }>)[action.type]?.summary}
      </p>
      <p className={styles.muted}>
        {fill(t.detail.forAdmin, { who: by })} · <time dateTime={action.createdAt}>{moment(action.createdAt, language)}</time>
        {action.retryOf ? ` · ${fill(t.detail.retryOf, { reference: action.retryOf })}` : ''}
      </p>

      {message && <Notice tone="info">{message}</Notice>}
      <Notice tone={action.status === 'failed' ? 'alert' : 'info'}>{statusLine(t, action.status, action.expiresAt, language)}</Notice>
      {action.status === 'failed' && action.execution.failureCode && (
        <section aria-labelledby="failure-title" className={styles.block}>
          <h3 id="failure-title" className={styles.blockTitle}>
            {t.detail.failureTitle}
          </h3>
          <p>{word(t.failures, action.execution.failureCode)}</p>
        </section>
      )}

      {action.reason && (
        <section aria-labelledby="reason-title" className={styles.block}>
          <h3 id="reason-title" className={styles.blockTitle}>
            {t.detail.reasonTitle}
          </h3>
          <p className={styles.contentText}>{action.reason}</p>
          <p className={styles.muted}>{t.detail.reasonNote}</p>
        </section>
      )}

      {action.preview && <PreviewView preview={action.preview} expiresAt={action.expiresAt} requiresSecond={action.requiresSecondConfirmation} />}

      <dl className={styles.facts}>
        <div>
          <dt>{t.detail.permissionTitle}</dt>
          <dd>
            <code>{action.definition.permission}</code>
          </dd>
        </div>
        <div>
          <dt>{t.detail.fingerprintTitle}</dt>
          <dd>
            <code className={styles.hash}>{action.payloadHash.slice(0, 16)}…</code>
            <span className={styles.muted}> {t.detail.fingerprintNote}</span>
          </dd>
        </div>
      </dl>

      {action.decision && (
        <p className={styles.muted}>
          {fill(t.detail.decision, { who: action.decision.by.email ?? t.detail.unknownAdmin, when: moment(action.decision.at, language) })}
          {action.decision.note ? ` · ${fill(t.detail.decisionNote, { note: action.decision.note })}` : ''}
        </p>
      )}

      {action.status === 'completed' && (
        <section aria-labelledby="result-title" className={styles.block}>
          <h3 id="result-title" className={styles.blockTitle}>
            {t.detail.resultTitle}
          </h3>
          <p>{action.preview && action.preview.changes.length > 0 ? t.statusLine.completed : t.detail.resultNone}</p>
        </section>
      )}

      <DecisionPanel
        key={`${action.reference}-${action.status}`}
        action={action}
        onChanged={(next) => {
          setMessage(next)
          resource.reload()
        }}
      />

      <section aria-labelledby="history-title" className={styles.block}>
        <h2 id="history-title" className={styles.panelTitle}>
          {t.detail.historyTitle}
        </h2>
        <p className={styles.muted}>{t.detail.historyNote}</p>
        <Timeline lines={action.history} />
        {action.integrity && (
          <p className={styles.muted} role="status">
            <strong>{action.integrity.ok ? t.detail.integrityOk : t.detail.integrityBroken}</strong>
          </p>
        )}
      </section>
    </div>
  )
}

function statusLine(t: ReturnType<typeof useAutomationText>, status: string, expiresAt: string, language: AutomationLanguage): string {
  const line = (t.statusLine as Record<string, string>)[status] ?? ''
  return fill(line, { when: moment(expiresAt, language) })
}
