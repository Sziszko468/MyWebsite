import { useState, type ReactNode, type RefObject } from 'react'
import { siteConfig } from '../../config/site'
import { mailtoHref } from '../../forms/mailto'
import { Button } from '../Button/Button'
import type { SubmissionPhase } from './useSubmission'
import styles from './Submission.module.scss'

/** The words a form hands to its result panels: its own dictionary block says what was not sent. */
export interface SubmissionText {
  failed: { title: string; network: string; timeout: string; rejected: string }
  unavailable: {
    title: string
    text: string
    copy: string
    copied: string
    copyFailed: string
    mail: string
    mailNote: string
    subject: string
  }
  /** The label of the summary box. */
  summaryLabel: string
}

/** Said before the first question, so nobody fills in a form that cannot send without knowing it. */
export function SubmissionNotice({ children }: { children: ReactNode }) {
  return (
    <p className={styles.notice} role="note">
      {children}
    </p>
  )
}

function Panel({
  tone,
  title,
  headingRef,
  children,
}: {
  tone: 'error' | 'info'
  title: string
  headingRef: RefObject<HTMLHeadingElement | null>
  children: ReactNode
}) {
  return (
    <section className={styles.panel} data-tone={tone}>
      <h4 ref={headingRef} tabIndex={-1} className={styles.panelTitle}>
        {title}
      </h4>
      {children}
    </section>
  )
}

/**
 * A result that is not a success. A failure says why and that the answers are still there. When
 * nothing can be sent at all, the panel shows what would have been sent, to copy (and, once an
 * e-mail address is configured, to open as a draft that only leaves when the visitor sends it).
 */
export function SubmissionResult({
  phase,
  text,
  summary,
  headingRef,
}: {
  phase: SubmissionPhase
  text: SubmissionText
  summary: string
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const email = siteConfig.contact.email

  if (phase.kind === 'failed') {
    return (
      <Panel tone="error" title={text.failed.title} headingRef={headingRef}>
        <p>{text.failed[phase.reason]}</p>
      </Panel>
    )
  }
  if (phase.kind !== 'unavailable') return null

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary)
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }

  return (
    <Panel tone="info" title={text.unavailable.title} headingRef={headingRef}>
      <p>{text.unavailable.text}</p>
      <label className={styles.summaryLabel}>
        <span>{text.summaryLabel}</span>
        <textarea
          readOnly
          className={styles.summaryText}
          rows={Math.min(14, summary.split('\n').length + 1)}
          value={summary}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <div className={styles.panelActions}>
        <Button type="button" variant="secondary" onClick={() => void copySummary()}>
          {text.unavailable.copy}
        </Button>
        {email && (
          <Button href={mailtoHref(email, text.unavailable.subject, summary)} variant="secondary">
            {text.unavailable.mail}
          </Button>
        )}
      </div>
      <p role="status" className={styles.copyState}>
        {copy === 'copied' && text.unavailable.copied}
        {copy === 'failed' && text.unavailable.copyFailed}
      </p>
      {email && <p className={styles.small}>{text.unavailable.mailNote}</p>}
    </Panel>
  )
}

/** The confirmation. Rendered only when the transport reported the request as sent. */
export function SentPanel({
  title,
  text,
  again,
  onAgain,
  headingRef,
}: {
  title: string
  text: string
  again: string
  onAgain: () => void
  headingRef: RefObject<HTMLHeadingElement | null>
}) {
  return (
    <div className={styles.sent} role="status">
      <h3 ref={headingRef} tabIndex={-1} className={styles.sentTitle}>
        {title}
      </h3>
      <p>{text}</p>
      <Button type="button" variant="secondary" onClick={onAgain}>
        {again}
      </Button>
    </div>
  )
}
