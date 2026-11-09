import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { track } from '../../../analytics/tracker'
import { quoteConfig } from '../../../config/quote'
import { siteConfig } from '../../../config/site'
import { useCatalogVersion } from '../../../content/liveCatalog'
import { fullExperience as offer } from '../../../content/shop/fullExperience'
import { createTransport } from '../../../forms/submit'
import { useI18n } from '../../../i18n/useI18n'
import { LANGUAGES } from '../../../i18n/config'
import {
  buildSummary,
  emptyDraft,
  firstInvalidStep,
  FE_LIMITS,
  questionOf,
  stepsOf,
  summaryRows,
  toggleAnswer,
  toRequest,
  validateStep,
  type Draft,
  type Errors,
  type FullExperienceRequest,
  type StepKey,
} from '../../../shop/fullExperience/request'
import { SHOP_PATHS } from '../../../shop/paths'
import { useShopText } from '../../../shop/useShopText'
import { fill } from '../../../utils/format'
import { Button } from '../../Button/Button'
import { CheckboxField, ChoiceGroup, FIRST_INVALID, TextField } from '../../form/fields'
import { SentReceipt } from '../../form/SentReceipt'
import { SubmissionNotice, SubmissionResult } from '../../form/Submission'
import { useSubmission } from '../../form/useSubmission'
import { LocalizedLink } from '../../LocalizedLink/LocalizedLink'
import { ChoiceCard, ChoiceFieldset } from '../Choice'
import { ArrowLeftIcon } from '../icons'
import styles from './FullExperienceConfigurator.module.scss'

const OPTIONS = { requireConsent: quoteConfig.requireConsent }

/**
 * The FULL EXPERIENCE configurator: the offer's questions one at a time (each a set of large choices; an optional one can be skipped
 * and any one can be gone back to, with the answers kept), then the idea in the visitor's own words, then the contact details. The
 * questions and their options are the administrator's (content/shop/fullExperience.ts, edited in the administration), not this file's.
 * The answers live only in this page's state until they are sent. Sending is the transport's business (forms/submit.ts): the panel
 * says "sent" only when the server said so, and with no endpoint configured it says up front that nothing can be sent and offers the
 * summary to copy. There is never a price here: the request asks for a tailored proposal.
 */
export function FullExperienceConfigurator() {
  useCatalogVersion()
  const { lang, t } = useI18n()
  const { experience, receipt: receiptWords } = useShopText()
  const c = experience.start
  const steps = stepsOf(offer)

  const transport = useMemo(() => createTransport<FullExperienceRequest>(quoteConfig.endpoint), [])
  const { phase, sending, submit, reset, panelRef, sentRef } = useSubmission(transport)
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(lang))
  const [step, setStep] = useState<StepKey>(steps[0])
  const [tried, setTried] = useState<ReadonlySet<StepKey>>(() => new Set())
  const [attempts, setAttempts] = useState(0)
  // What was sent, as the visitor saw it, kept for the receipt: the draft is cleared when the visitor starts again.
  const [sentRows, setSentRows] = useState<ReadonlyArray<readonly [string, string]>>([])
  const headingRef = useRef<HTMLHeadingElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const movedRef = useRef(false)

  // The offer can change under the page (the live catalogue arrives, or the administrator edits it): stay on a step that still exists.
  const index = Math.max(0, steps.indexOf(step))
  const current = steps[index]
  const isLast = current === 'contact'
  const question = questionOf(offer, current)
  const errors: Errors = tried.has(current) ? validateStep(current, offer, draft, OPTIONS) : {}

  useEffect(() => {
    if (movedRef.current) headingRef.current?.focus()
  }, [current])
  useEffect(() => {
    if (attempts > 0) formRef.current?.querySelector<HTMLElement>(FIRST_INVALID)?.focus()
  }, [attempts])
  const reachedLast = isLast
  useEffect(() => {
    if (reachedLast) track('configurator_completed', { needs: 0 })
  }, [reachedLast])

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((previous) => ({ ...previous, [key]: value }))
  const goTo = (next: StepKey) => {
    movedRef.current = true
    reset()
    setStep(next)
  }
  const mark = (key: StepKey) => setTried((previous) => new Set(previous).add(key))
  const answered = (question?.id && draft.answers[question.id]?.length) || 0

  const next = () => {
    mark(current)
    if (Object.keys(validateStep(current, offer, draft, OPTIONS)).length > 0) {
      setAttempts((count) => count + 1)
      return
    }
    goTo(steps[index + 1])
  }

  const send = async () => {
    const problem = firstInvalidStep(offer, draft, OPTIONS)
    if (problem) {
      mark(problem.step)
      goTo(problem.step)
      setAttempts((count) => count + 1)
      return
    }
    const rows = summaryRows(offer, draft, lang, { skipped: c.reviewSkipped, description: c.summaryDescription, contact: c.summaryContact, heading: c.summaryHeading })
    await submit(toRequest(draft, offer, lang), () => {
      setSentRows(rows)
      // No cart lines: `items: 0` is how a FULL EXPERIENCE request is told apart from the builder's (a count, never what was answered).
      track('quote_request_submitted', { form: 'inquiry', items: 0 })
    })
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    if (isLast) void send()
    else next()
  }

  const summary = buildSummary(offer, draft, lang, { skipped: c.reviewSkipped, description: c.summaryDescription, contact: c.summaryContact, heading: c.summaryHeading })
  const privacyPath = siteConfig.legal.find((entry) => entry.id === 'privacy')?.path ?? null
  // An unanswered required question says what to do, not that a field is required.
  const message = (field: keyof Errors, params: Record<string, string | number> = {}) => (errors[field] ? (field === 'answer' ? c.required : fill(c.errors[errors[field]!], params)) : undefined)

  const startAgain = () => {
    movedRef.current = true
    setDraft(emptyDraft(lang))
    setTried(new Set())
    setAttempts(0)
    setStep(steps[0])
    reset()
  }

  if (phase.kind === 'sent') {
    return (
      <div className={styles.card}>
        <div className={styles.sent} role="status">
          <span className={styles.sentMark} aria-hidden="true">
            <svg viewBox="0 0 16 16" width="1.25rem" height="1.25rem" focusable="false">
              <path d="M3 8.5l3.2 3.2L13 4.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 ref={sentRef} tabIndex={-1} className={styles.stepTitle}>
            {c.sent.title}
          </h2>
          <p>{c.sent.text}</p>
          <SentReceipt receipt={phase.receipt} rows={sentRows} lang={lang} words={receiptWords} />
          <div className={styles.sentActions}>
            <Button type="button" variant="secondary" onClick={startAgain}>
              {c.sent.again}
            </Button>
            <Button to={SHOP_PATHS.home} variant="text">
              {c.sent.home}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.card}>
      {transport.id === 'none' && <SubmissionNotice>{c.unavailable.text}</SubmissionNotice>}

      <div className={styles.progress}>
        <p className={styles.progressText}>
          {fill(c.progress, { n: index + 1, total: steps.length })}
          {question && !question.required && (
            <>
              <span aria-hidden="true"> · </span>
              {c.optional}
            </>
          )}
        </p>
        <div className={styles.bar} role="progressbar" aria-label={c.progressLabel} aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1}>
          <span style={{ '--p': (index + 1) / steps.length } as CSSProperties} />
        </div>
      </div>

      <form ref={formRef} noValidate onSubmit={onSubmit} aria-busy={sending || undefined}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
          {question ? question.title[lang] : current === 'description' ? c.descriptionTitle : c.contactTitle}
        </h2>
        {question?.help[lang] && <p className={styles.help}>{question.help[lang]}</p>}
        {index === 0 && offer.configurator.intro[lang] && <p className={styles.help}>{offer.configurator.intro[lang]}</p>}

        <div className={styles.fields}>
          {question && (
            <ChoiceFieldset
              legend={question.kind === 'single' ? c.chooseOne : c.chooseAny}
              hint={question.kind === 'multi' ? fill(c.selectedCount, { count: answered }) : undefined}
              error={message('answer')}
              columns={question.options.length > 4 ? 2 : 1}
            >
              {question.options.map((option) => (
                <ChoiceCard
                  key={`${question.id}-${option.id}`}
                  type={question.kind === 'single' ? 'radio' : 'checkbox'}
                  name={question.kind === 'single' ? `fe-${question.id}` : undefined}
                  checked={(draft.answers[question.id] ?? []).includes(option.id)}
                  onChange={() => set('answers', toggleAnswer(question, draft.answers, option.id))}
                  title={option.label[lang]}
                  text={option.hint[lang] || undefined}
                />
              ))}
            </ChoiceFieldset>
          )}

          {current === 'description' && (
            <TextField
              multiline
              label={c.descriptionLabel}
              hint={c.descriptionHint}
              rows={7}
              autoComplete="off"
              value={draft.description}
              onChange={(event) => set('description', event.target.value)}
              counter={fill(c.descriptionCount, { count: [...draft.description.trim()].length, max: FE_LIMITS.description.max })}
              error={message('description', { min: FE_LIMITS.description.min, max: FE_LIMITS.description.max })}
            />
          )}

          {current === 'contact' && (
            <>
              <TextField label={c.name} autoComplete="name" value={draft.name} onChange={(event) => set('name', event.target.value)} error={message('name', { min: FE_LIMITS.name.min, max: FE_LIMITS.name.max })} />
              <TextField type="email" inputMode="email" label={c.email} hint={c.emailHint} autoComplete="email" value={draft.email} onChange={(event) => set('email', event.target.value)} error={message('email')} />
              <TextField label={c.company} optionalText={c.optional} autoComplete="organization" value={draft.company} onChange={(event) => set('company', event.target.value)} error={message('company', { max: FE_LIMITS.company.max })} />
              <TextField type="url" inputMode="url" label={c.website} optionalText={c.optional} hint={c.websiteHint} autoComplete="url" value={draft.website} onChange={(event) => set('website', event.target.value)} error={message('website')} />
              <ChoiceGroup
                legend={c.preferredLanguage}
                value={draft.preferredLanguage}
                onChange={(value) => set('preferredLanguage', value)}
                options={LANGUAGES.map((code) => ({ value: code, label: c.languages[code] }))}
              />
              {quoteConfig.requireConsent && (
                <div className={styles.consent}>
                  <CheckboxField label={c.consent} checked={draft.consent} onChange={(checked) => set('consent', checked)} error={message('consent')} />
                  {privacyPath && (
                    <LocalizedLink to={privacyPath} target="_blank" rel="noopener noreferrer" className={styles.privacy}>
                      {c.privacy}
                      <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
                    </LocalizedLink>
                  )}
                </div>
              )}
              <CheckboxField label={c.marketing} checked={draft.marketing} onChange={(checked) => set('marketing', checked)} />
              <p className={styles.memory}>{c.memory}</p>

              <section className={styles.review} aria-label={c.reviewTitle}>
                <h3 className={styles.reviewTitle}>{c.reviewTitle}</h3>
                <ul className={styles.reviewList}>
                  {offer.configurator.questions.map((item) => {
                    const chosen = (draft.answers[item.id] ?? []).map((id) => item.options.find((option) => option.id === id)?.label[lang]).filter(Boolean)
                    return (
                      <li key={item.id} className={styles.reviewLine}>
                        <span className={styles.reviewText}>
                          <span className={styles.reviewLabel}>{item.title[lang]}</span>
                          <span>{chosen.length > 0 ? chosen.join(', ') : c.reviewSkipped}</span>
                        </span>
                        <Button type="button" variant="text" size="sm" onClick={() => goTo(`q:${item.id}`)}>
                          {c.change}
                          <span className="visually-hidden"> — {item.title[lang]}</span>
                        </Button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            </>
          )}
        </div>

        {isLast && (
          <SubmissionResult
            phase={phase}
            text={{ failed: c.failed, unavailable: c.unavailable, summaryLabel: c.summaryHeading }}
            summary={summary}
            headingRef={panelRef}
          />
        )}

        <div className={styles.actions}>
          {index > 0 && (
            <Button type="button" variant="secondary" className={styles.back} onClick={() => goTo(steps[index - 1])}>
              <span className={styles.backIcon}>
                <ArrowLeftIcon />
              </span>
              <span className={styles.backText}>{c.back}</span>
            </Button>
          )}
          <Button type="submit" arrow loading={sending} loadingLabel={isLast ? c.sending : undefined} className={styles.primary}>
            {isLast ? (transport.id === 'none' ? c.prepare : c.send) : question && !question.required && answered === 0 ? c.skip : c.next}
          </Button>
        </div>
      </form>
    </div>
  )
}
