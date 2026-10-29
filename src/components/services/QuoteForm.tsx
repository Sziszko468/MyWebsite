import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { packages } from '../../content/packages'
import { quoteConfig } from '../../config/quote'
import { siteConfig } from '../../config/site'
import { useI18n } from '../../i18n/useI18n'
import { errorText } from '../../quote/messages'
import { buildSummary, mailtoHref, packageLabel, summaryRows, type QuoteText } from '../../quote/summary'
import { createTransport, type QuoteTransport } from '../../quote/submit'
import {
  PACKAGE_CHOICES,
  PROJECT_TYPES,
  STEPS,
  TIMINGS,
  type FieldId,
  type QuoteDraft,
  type StepId,
} from '../../quote/types'
import type { QuoteDraftApi } from '../../quote/useQuoteDraft'
import { LIMITS, firstInvalidStep, toRequest, validateStep } from '../../quote/validation'
import { fill } from '../../utils/format'
import { Button } from '../Button/Button'
import { ChoiceGroup, CheckboxField, SelectField, TextField } from '../form/fields'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { QuoteSteps } from './QuoteSteps'
import styles from './QuoteForm.module.scss'

// A muted note that shows where a missing piece goes: development only, nothing in production.
const SHOW_PENDING = import.meta.env.DEV

type Phase =
  | { kind: 'editing' }
  | { kind: 'sending' }
  | { kind: 'failed'; reason: 'network' | 'timeout' | 'rejected' }
  | { kind: 'unavailable' }
  | { kind: 'sent' }

interface QuoteFormProps {
  draft: QuoteDraft
  onChange: QuoteDraftApi['set']
  onReset: () => void
  /** Replaces the configured transport; used by tests and previews. */
  transport?: QuoteTransport
}

/** Where focus goes when a step is not acceptable: the first control that says it is invalid. */
const FIRST_INVALID =
  'input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"], fieldset[data-invalid="true"] input'

/**
 * The quote request: seven questions in four steps. The answers live in the draft the page keeps
 * (so the package picker and the service buttons can fill it in), and survive going back and
 * forth. A step is checked when the visitor moves on; once it has been tried, its errors follow
 * the answers, so a message goes away as soon as it is put right.
 *
 * Sending is the transport's business (quote/submit.ts). The form says "sent" only when the
 * transport says so. With no endpoint configured nothing can be sent: the form says that up front,
 * and its last step offers the summary to copy instead.
 */
export function QuoteForm({ draft, onChange, onReset, transport: given }: QuoteFormProps) {
  const { lang, t } = useI18n()
  const q = t.servicesPage.quote
  const formId = useId()

  const transport = useMemo(() => given ?? createTransport(quoteConfig.endpoint), [given])
  const options = { requireConsent: quoteConfig.requireConsent }

  const [stepIndex, setStepIndex] = useState(0)
  const [tried, setTried] = useState<ReadonlySet<StepId>>(() => new Set())
  const [attempts, setAttempts] = useState(0)
  const [phase, setPhase] = useState<Phase>({ kind: 'editing' })
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')

  const step = STEPS[stepIndex]
  const isLast = stepIndex === STEPS.length - 1
  const errors = tried.has(step) ? validateStep(step, draft, options) : {}
  const message = (field: FieldId) => errorText(q, field, errors[field])

  const formRef = useRef<HTMLFormElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLHeadingElement>(null)
  const sentRef = useRef<HTMLHeadingElement>(null)
  const movedRef = useRef(false)

  // A new step starts at its heading, so a keyboard or screen-reader user lands where the questions are.
  useEffect(() => {
    if (!movedRef.current) return
    headingRef.current?.focus()
  }, [stepIndex])

  // A failed attempt puts focus on the first answer that needs attention.
  useEffect(() => {
    if (attempts === 0) return
    formRef.current?.querySelector<HTMLElement>(FIRST_INVALID)?.focus()
  }, [attempts])

  // A result (not sent, or sent) is announced by moving focus to its heading.
  useEffect(() => {
    if (phase.kind === 'sent') sentRef.current?.focus()
    else if (phase.kind === 'failed' || phase.kind === 'unavailable') panelRef.current?.focus()
  }, [phase.kind])

  const goTo = (index: number) => {
    movedRef.current = true
    setPhase({ kind: 'editing' })
    setCopy('idle')
    setStepIndex(index)
  }

  const markTried = (id: StepId) => setTried((current) => new Set(current).add(id))

  const next = () => {
    markTried(step)
    if (Object.keys(validateStep(step, draft, options)).length > 0) {
      setAttempts((count) => count + 1)
      return
    }
    goTo(stepIndex + 1)
  }

  const send = async () => {
    // Every step was checked on the way here; this is the last line of defence.
    const problem = firstInvalidStep(draft, options)
    if (problem) {
      markTried(problem.step)
      goTo(STEPS.indexOf(problem.step))
      setAttempts((count) => count + 1)
      return
    }
    if (transport.id === 'none') {
      setPhase({ kind: 'unavailable' })
      return
    }

    setPhase({ kind: 'sending' })
    const outcome = await transport.submit(toRequest(draft, lang))
    if (outcome.status === 'sent') {
      onReset()
      setPhase({ kind: 'sent' })
    } else if (outcome.status === 'unavailable') {
      setPhase({ kind: 'unavailable' })
    } else {
      setPhase({ kind: 'failed', reason: outcome.reason })
    }
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (phase.kind === 'sending') return
    if (isLast) void send()
    else next()
  }

  const startAgain = () => {
    setTried(new Set())
    setAttempts(0)
    movedRef.current = true
    setStepIndex(0)
    setCopy('idle')
    setPhase({ kind: 'editing' })
  }

  if (phase.kind === 'sent') {
    return (
      <div className={styles.card}>
        <div className={styles.sent} role="status">
          <h3 ref={sentRef} tabIndex={-1} className={styles.stepTitle}>
            {q.sent.title}
          </h3>
          <p>{q.sent.text}</p>
          <Button type="button" variant="secondary" onClick={startAgain}>
            {q.sent.again}
          </Button>
        </div>
      </div>
    )
  }

  const privacyPath = siteConfig.legal.find((entry) => entry.id === 'privacy')?.path ?? null
  const sending = phase.kind === 'sending'
  const summary = buildSummary(draft, lang, q)
  const email = siteConfig.contact.email

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(summary)
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }

  return (
    <div className={styles.card}>
      {transport.id === 'none' && (
        <p className={styles.notice} role="note">
          {q.unavailable.notice}
        </p>
      )}

      <QuoteSteps current={stepIndex} onGoTo={goTo} />

      <form ref={formRef} id={formId} noValidate onSubmit={onSubmit} aria-busy={sending || undefined}>
        <h3 ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
          {q.stepTitles[step]}
        </h3>

        <div className={styles.fields}>
          {step === 'project' && (
            <>
              <ChoiceGroup
                legend={q.fields.projectType.label}
                value={draft.projectType}
                onChange={(value) => onChange('projectType', value)}
                options={PROJECT_TYPES.map((value) => ({ value, label: q.fields.projectType.options[value] }))}
                error={message('projectType')}
              />
              <ChoiceGroup
                legend={q.fields.package.label}
                hint={q.fields.package.hint}
                value={draft.package}
                onChange={(value) => onChange('package', value)}
                options={PACKAGE_CHOICES.map((value) => ({
                  value,
                  label: packageLabel(value, q),
                  note: value === 'unsure' ? undefined : packages.find((pkg) => pkg.id === value)?.tagline[lang],
                }))}
                error={message('package')}
              />
            </>
          )}

          {step === 'details' && (
            <>
              <TextField
                multiline
                label={q.fields.description.label}
                hint={q.fields.description.hint}
                rows={6}
                autoComplete="off"
                value={draft.description}
                onChange={(event) => onChange('description', event.target.value)}
                counter={fill(q.fields.description.count, { count: draft.description.trim().length, max: LIMITS.description.max })}
                error={message('description')}
              />
              <TextField
                label={q.fields.reference.label}
                optionalText={q.optional}
                hint={q.fields.reference.hint}
                autoComplete="off"
                value={draft.reference}
                onChange={(event) => onChange('reference', event.target.value)}
                error={message('reference')}
              />
            </>
          )}

          {step === 'extras' && (
            <>
              <TextField
                label={q.fields.budget.label}
                optionalText={q.optional}
                hint={q.fields.budget.hint}
                autoComplete="off"
                value={draft.budget}
                onChange={(event) => onChange('budget', event.target.value)}
                error={message('budget')}
              />
              <SelectField
                label={q.fields.timing.label}
                optionalText={q.optional}
                placeholder={q.fields.timing.placeholder}
                value={draft.timing ?? ''}
                onChange={(value) => onChange('timing', TIMINGS.find((timing) => timing === value) ?? null)}
                options={TIMINGS.map((value) => ({ value, label: q.fields.timing.options[value] }))}
                error={message('timing')}
              />
            </>
          )}

          {step === 'contact' && (
            <>
              <TextField
                label={q.fields.name.label}
                hint={q.fields.name.hint}
                autoComplete="name"
                value={draft.name}
                onChange={(event) => onChange('name', event.target.value)}
                error={message('name')}
              />
              <TextField
                type="email"
                inputMode="email"
                label={q.fields.email.label}
                hint={q.fields.email.hint}
                autoComplete="email"
                value={draft.email}
                onChange={(event) => onChange('email', event.target.value)}
                error={message('email')}
              />
              <TextField
                type="tel"
                inputMode="tel"
                label={q.fields.phone.label}
                optionalText={q.optional}
                hint={q.fields.phone.hint}
                autoComplete="tel"
                value={draft.phone}
                onChange={(event) => onChange('phone', event.target.value)}
                error={message('phone')}
              />

              <Review draft={draft} q={q} />

              {quoteConfig.requireConsent && (
                <div className={styles.consent}>
                  <CheckboxField
                    label={q.fields.consent.label}
                    checked={draft.consent}
                    onChange={(checked) => onChange('consent', checked)}
                    error={message('consent')}
                  />
                  {privacyPath ? (
                    <LocalizedLink to={privacyPath} target="_blank" rel="noopener noreferrer" className={styles.privacy}>
                      {q.fields.consent.privacy}
                      <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
                    </LocalizedLink>
                  ) : (
                    SHOW_PENDING && <p className={styles.pending}>{q.fields.consent.pending}</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {phase.kind === 'failed' && (
          <Panel tone="error" title={q.failed.title} headingRef={panelRef}>
            <p>{q.failed[phase.reason]}</p>
          </Panel>
        )}

        {phase.kind === 'unavailable' && (
          <Panel tone="info" title={q.unavailable.title} headingRef={panelRef}>
            <p>{q.unavailable.text}</p>
            <label className={styles.summaryLabel}>
              <span>{q.summary.heading}</span>
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
                {q.unavailable.copy}
              </Button>
              {email && (
                <Button href={mailtoHref(email, q.unavailable.subject, summary)} variant="secondary">
                  {q.unavailable.mail}
                </Button>
              )}
            </div>
            <p role="status" className={styles.copyState}>
              {copy === 'copied' && q.unavailable.copied}
              {copy === 'failed' && q.unavailable.copyFailed}
            </p>
            {email && <p className={styles.small}>{q.unavailable.mailNote}</p>}
          </Panel>
        )}

        <div className={styles.actions}>
          {stepIndex > 0 && (
            <Button type="button" variant="secondary" onClick={() => goTo(stepIndex - 1)}>
              {q.actions.back}
            </Button>
          )}
          <Button type="submit" arrow disabled={sending} className={styles.primary}>
            {isLast ? (sending ? q.actions.sending : transport.id === 'none' ? q.actions.prepare : q.actions.send) : q.actions.next}
          </Button>
        </div>
      </form>
    </div>
  )
}

/** What the visitor has said so far, to read through before sending. */
function Review({ draft, q }: { draft: QuoteDraft; q: QuoteText }) {
  return (
    <section className={styles.review} aria-label={q.summary.heading}>
      <h4 className={styles.reviewTitle}>{q.summary.heading}</h4>
      <p className={styles.small}>{q.summary.reviewHint}</p>
      <dl>
        {summaryRows(draft, q, { contact: false }).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
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
