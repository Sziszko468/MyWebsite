import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from 'react'
import { track } from '../../analytics/tracker'
import { quoteConfig } from '../../config/quote'
import { siteConfig } from '../../config/site'
import { getPackage } from '../../content/packages'
import { addonsFor } from '../../content/services/addons'
import { afterInquirySteps } from '../../content/services/process'
import { NEED_IDS, PLAN_IDS, type NeedId, type PlanId } from '../../content/services/ids'
import { createTransport } from '../../forms/submit'
import { useI18n } from '../../i18n/useI18n'
import { clearCart } from '../../shop/cart'
import { cartActions, cartStore } from '../../shop/cartStore'
import { planForNeed, suggestedPlans } from '../../shop/flow'
import { useCart, useInquiry } from '../../shop/hooks'
import {
  OBJECTIVES,
  STEPS,
  TIMINGS,
  LIMITS,
  buildSummary,
  describeLine,
  errorText,
  firstInvalidStep,
  toRequest,
  validateStep,
  type FieldKey,
  type QuoteRequest,
  type StepId,
} from '../../shop/inquiry'
import { inquiryActions } from '../../shop/inquiryStore'
import { SHOP_PATHS, pathOfNeed } from '../../shop/paths'
import { useShopText } from '../../shop/useShopText'
import { fill, pad } from '../../utils/format'
import { Button } from '../Button/Button'
import { CheckboxField, ChoiceGroup, FIRST_INVALID, TextField } from '../form/fields'
import { SubmissionNotice, SubmissionResult } from '../form/Submission'
import { useSubmission } from '../form/useSubmission'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { ChoiceCard, ChoiceFieldset } from './Choice'
import { ArrowLeftIcon } from './icons'
import styles from './Configurator.module.scss'

const OPTIONS = { requireConsent: quoteConfig.requireConsent }

/**
 * The request builder: six short steps from "what do you need" to "request the quote", in one
 * card. It edits the cart (which services, which package, which add-ons) and the request's
 * answers (details and contact) that live beside it; both survive going back, another page and a
 * change of language. A step is checked when the visitor moves on, and once tried its errors
 * follow the answers. Sending is the transport's business (forms/submit.ts): the card says "sent"
 * only when the transport says so, and with no endpoint configured it says up front that nothing
 * can be sent and offers the summary to copy.
 */
export function Configurator() {
  const { lang, t } = useI18n()
  const text = useShopText()
  const { configurator: c, common } = text
  const cart = useCart()
  const { details, step: storedStep, pendingPlan } = useInquiry()

  const transport = useMemo(() => createTransport<QuoteRequest>(quoteConfig.endpoint), [])
  const { phase, sending, submit, reset: resetSubmission, panelRef, sentRef } = useSubmission(transport)

  const [tried, setTried] = useState<ReadonlySet<StepId>>(() => new Set())
  const [attempts, setAttempts] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const movedRef = useRef(false)

  // The answers of the steps before this one must still hold (the cart can change on another page);
  // if one does not, the builder opens on that step instead.
  const index = STEPS.indexOf(storedStep)
  const blocking = STEPS.slice(0, index).find((id) => Object.keys(validateStep(id, cart, details, OPTIONS)).length > 0)
  const step: StepId = blocking ?? storedStep
  const stepIndex = STEPS.indexOf(step)
  const isLast = step === 'send'

  const errors = tried.has(step) ? validateStep(step, cart, details, OPTIONS) : {}
  const message = (field: FieldKey, name?: string) => errorText(c, field, errors[field], { name })
  const summaryText = { configurator: c, common }
  const summary = buildSummary(cart, details, lang, summaryText)

  useEffect(() => {
    if (movedRef.current) headingRef.current?.focus()
  }, [step])

  // The builder was taken all the way to its last step: one count, never what was answered.
  const reachedLast = step === 'send'
  const requested = cart.lines.length
  useEffect(() => {
    if (reachedLast) track('configurator_completed', { needs: requested })
  }, [reachedLast, requested])

  useEffect(() => {
    if (attempts > 0) formRef.current?.querySelector<HTMLElement>(FIRST_INVALID)?.focus()
  }, [attempts])

  const goTo = (next: StepId) => {
    movedRef.current = true
    resetSubmission()
    inquiryActions.setStep(next)
  }
  const markTried = (id: StepId) => setTried((current) => new Set(current).add(id))

  const next = () => {
    markTried(step)
    if (Object.keys(validateStep(step, cart, details, OPTIONS)).length > 0) {
      setAttempts((count) => count + 1)
      return
    }
    goTo(STEPS[stepIndex + 1])
  }

  const send = async () => {
    // Every step was checked on the way here; this is the last line of defence.
    const problem = firstInvalidStep(cart, details, OPTIONS)
    if (problem) {
      markTried(problem.step)
      goTo(problem.step)
      setAttempts((count) => count + 1)
      return
    }
    const items = cart.lines.length
    await submit(toRequest(cart, details, lang), () => {
      track('quote_request_submitted', { form: 'inquiry', items })
      cartStore.update(clearCart)
      inquiryActions.reset()
      setTried(new Set())
    })
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (sending) return
    if (isLast) void send()
    else next()
  }

  const startAgain = () => {
    movedRef.current = true
    setTried(new Set())
    setAttempts(0)
    resetSubmission()
    inquiryActions.reset()
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
          <h3 className={styles.subTitle}>{c.sent.next}</h3>
          <ol className={styles.after}>
            {afterInquirySteps.map((item, position) => (
              <li key={item.title.hu}>
                <span className={styles.afterNumber} aria-hidden="true">
                  {pad(position + 1)}
                </span>
                <span>
                  <strong>{item.title[lang]}</strong> {item.text[lang]}
                </span>
              </li>
            ))}
          </ol>
          <div className={styles.sentActions}>
            <Button type="button" variant="secondary" onClick={startAgain}>
              {c.sent.again}
            </Button>
            <Button to={SHOP_PATHS.home} variant="text">
              {c.sent.browse}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const privacyPath = siteConfig.legal.find((entry) => entry.id === 'privacy')?.path ?? null
  const needTitle = (need: NeedId) => common.needs[need].title
  const planName = (id: PlanId) => (id === 'custom' ? common.plans.custom.name : getPackage(id).name)

  return (
    <div className={styles.card}>
      {transport.id === 'none' && <SubmissionNotice>{c.unavailable.notice}</SubmissionNotice>}

      <div className={styles.progress}>
        <div className={styles.compact}>
          <p className={styles.compactText}>
            {fill(c.stepOf, { current: stepIndex + 1, total: STEPS.length })}
            <span aria-hidden="true"> · </span>
            {c.steps[step]}
          </p>
          <div className={styles.bar} aria-hidden="true">
            <span style={{ '--p': (stepIndex + 1) / STEPS.length } as CSSProperties} />
          </div>
        </div>
        <ol className={styles.list} aria-label={c.progressLabel}>
          {STEPS.map((id, position) => {
            const state = position < stepIndex ? 'done' : position === stepIndex ? 'current' : 'todo'
            const content = (
              <>
                <span className={styles.stepMark} aria-hidden="true">
                  {state === 'done' ? '✓' : pad(position + 1)}
                </span>
                <span>{c.steps[id]}</span>
                {state === 'done' && <span className="visually-hidden"> ({c.stepDone})</span>}
                {state === 'current' && <span className="visually-hidden"> ({c.stepCurrent})</span>}
              </>
            )
            return (
              <li key={id} data-state={state}>
                {state === 'done' ? (
                  <button type="button" className={styles.stepItem} onClick={() => goTo(id)}>
                    {content}
                  </button>
                ) : (
                  <span className={styles.stepItem} aria-current={state === 'current' ? 'step' : undefined}>
                    {content}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      <form ref={formRef} noValidate onSubmit={onSubmit} aria-busy={sending || undefined}>
        <h2 ref={headingRef} tabIndex={-1} className={styles.stepTitle}>
          {c.titles[step]}
        </h2>
        <p className={styles.help}>{c.help[step]}</p>

        <div className={styles.fields}>
          {step === 'need' && (
            <ChoiceFieldset legend={c.need.legend} hint={fill(c.need.selected, { count: cart.lines.length })} error={message('need')}>
              {NEED_IDS.map((need) => (
                <ChoiceCard
                  key={need}
                  type="checkbox"
                  checked={cart.lines.some((line) => line.need === need)}
                  onChange={(on) => {
                    const needs = on ? [...cart.lines.map((line) => line.need), need] : cart.lines.map((line) => line.need).filter((id) => id !== need)
                    cartActions.setNeeds(needs, (added) => planForNeed(added, pendingPlan))
                  }}
                  title={common.needs[need].title}
                  text={common.needs[need].text}
                />
              ))}
            </ChoiceFieldset>
          )}

          {step === 'plan' &&
            (cart.lines.length === 0 ? (
              <p className={styles.empty}>
                {c.plan.noLines}{' '}
                <Button type="button" variant="text" onClick={() => goTo('need')}>
                  {c.plan.backToNeed}
                </Button>
              </p>
            ) : (
              cart.lines.map((line) => (
                <ChoiceFieldset
                  key={line.need}
                  legend={fill(c.plan.legend, { name: needTitle(line.need) })}
                  columns={2}
                  error={message(`plan:${line.need}`, needTitle(line.need))}
                >
                  {PLAN_IDS.map((id) => (
                    <ChoiceCard
                      key={id}
                      type="radio"
                      name={`plan-${line.need}`}
                      value={id}
                      checked={line.plan === id}
                      onChange={() => cartActions.setPlan(line.need, id)}
                      title={planName(id)}
                      text={id === 'custom' ? common.plans.custom.tagline : getPackage(id).tagline[lang]}
                      tag={suggestedPlans(line.need).includes(id) ? c.plan.suggested : undefined}
                    />
                  ))}
                </ChoiceFieldset>
              ))
            ))}

          {step === 'extras' &&
            cart.lines.map((line) => {
              const available = addonsFor(line.need)
              return available.length === 0 ? (
                <div key={line.need} className={styles.noExtras}>
                  <h3 className={styles.subTitle}>{fill(c.extras.forNeed, { name: needTitle(line.need) })}</h3>
                  <p>{c.extras.none}</p>
                </div>
              ) : (
                <ChoiceFieldset
                  key={line.need}
                  legend={fill(c.extras.forNeed, { name: needTitle(line.need) })}
                  hint={fill(c.extras.selected, { count: line.extras.length })}
                  columns={2}
                >
                  {available.map((addon) => (
                    <ChoiceCard
                      key={addon.id}
                      type="checkbox"
                      checked={line.extras.includes(addon.id)}
                      onChange={(on) => cartActions.toggleExtra(line.need, addon.id, on)}
                      title={addon.name[lang]}
                      text={addon.summary[lang]}
                    />
                  ))}
                </ChoiceFieldset>
              )
            })}
          {step === 'extras' && <p className={styles.skip}>{c.extras.skipHint}</p>}

          {step === 'details' && (
            <>
              <TextField
                multiline
                label={c.details.description.label}
                hint={c.details.description.hint}
                rows={6}
                autoComplete="off"
                value={details.description}
                onChange={(event) => inquiryActions.setDetail('description', event.target.value)}
                counter={fill(c.details.description.count, { count: details.description.trim().length, max: LIMITS.description.max })}
                error={message('description')}
              />
              <ChoiceGroup
                legend={c.details.objective.label}
                optionalText={common.optional}
                value={details.objective}
                onChange={(value) => inquiryActions.setDetail('objective', value)}
                options={OBJECTIVES.map((value) => ({ value, label: c.details.objective.options[value] }))}
              />
              <TextField
                label={c.details.reference.label}
                optionalText={common.optional}
                hint={c.details.reference.hint}
                autoComplete="off"
                value={details.reference}
                onChange={(event) => inquiryActions.setDetail('reference', event.target.value)}
                error={message('reference')}
              />
              <ChoiceGroup
                legend={c.details.timing.label}
                optionalText={common.optional}
                value={details.timing}
                onChange={(value) => inquiryActions.setDetail('timing', value)}
                options={TIMINGS.map((value) => ({ value, label: c.details.timing.options[value] }))}
                error={message('timing')}
              />
              <TextField
                multiline
                label={c.details.requirements.label}
                optionalText={common.optional}
                hint={c.details.requirements.hint}
                rows={4}
                autoComplete="off"
                value={details.requirements}
                onChange={(event) => inquiryActions.setDetail('requirements', event.target.value)}
                error={message('requirements')}
              />
            </>
          )}

          {step === 'review' && (
            <div className={styles.review}>
              <section aria-labelledby="review-lines" className={styles.reviewBlock}>
                <h3 id="review-lines" className={styles.subTitle}>
                  {c.review.lines}
                </h3>
                <ul className={styles.reviewList}>
                  {cart.lines.map((line) => {
                    const described = describeLine(line, lang, summaryText)
                    return (
                      <li key={line.need} className={styles.reviewLine}>
                        <div className={styles.reviewText}>
                          <p className={styles.reviewName}>
                            <LocalizedLink to={pathOfNeed(line.need)}>{described.title}</LocalizedLink>
                          </p>
                          <p>
                            <span className={styles.reviewLabel}>{c.review.package}:</span> {described.plan}
                          </p>
                          <p>
                            <span className={styles.reviewLabel}>{c.review.addons}:</span>{' '}
                            {described.extras.length > 0 ? described.extras.join(', ') : c.review.none}
                          </p>
                        </div>
                        <div className={styles.reviewButtons}>
                          <Button type="button" variant="text" size="sm" onClick={() => goTo('plan')}>
                            {c.review.change}
                            <span className="visually-hidden"> — {fill(c.review.changePlan, { name: described.title })}</span>
                          </Button>
                          <Button type="button" variant="text" size="sm" onClick={() => goTo('extras')}>
                            {c.review.addons}
                            <span className="visually-hidden"> — {fill(c.review.changeExtras, { name: described.title })}</span>
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <div className={styles.reviewButtons}>
                  <Button type="button" variant="secondary" size="sm" onClick={() => goTo('need')}>
                    {c.review.addAnother}
                  </Button>
                </div>
                <p className={styles.reviewNote}>{c.review.priceNote}</p>
              </section>

              <section aria-labelledby="review-details" className={styles.reviewBlock}>
                <h3 id="review-details" className={styles.subTitle}>
                  {c.review.details}
                </h3>
                <dl className={styles.facts}>
                  <div>
                    <dt>{c.summary.labels.description}</dt>
                    <dd>{details.description.trim() || c.summary.empty}</dd>
                  </div>
                  <div>
                    <dt>{c.summary.labels.objective}</dt>
                    <dd>{details.objective ? c.details.objective.options[details.objective] : c.summary.empty}</dd>
                  </div>
                  <div>
                    <dt>{c.summary.labels.reference}</dt>
                    <dd>{details.reference.trim() || c.summary.empty}</dd>
                  </div>
                  <div>
                    <dt>{c.summary.labels.timing}</dt>
                    <dd>{details.timing ? c.details.timing.options[details.timing] : c.summary.empty}</dd>
                  </div>
                  <div>
                    <dt>{c.summary.labels.requirements}</dt>
                    <dd>{details.requirements.trim() || c.summary.empty}</dd>
                  </div>
                </dl>
                <div className={styles.reviewButtons}>
                  <Button type="button" variant="secondary" size="sm" onClick={() => goTo('details')}>
                    {c.review.changeDetails}
                  </Button>
                </div>
              </section>
            </div>
          )}

          {step === 'send' && (
            <>
              <TextField
                label={c.send.name.label}
                hint={c.send.name.hint}
                autoComplete="name"
                value={details.name}
                onChange={(event) => inquiryActions.setDetail('name', event.target.value)}
                error={message('name')}
              />
              <TextField
                type="email"
                inputMode="email"
                label={c.send.email.label}
                hint={c.send.email.hint}
                autoComplete="email"
                value={details.email}
                onChange={(event) => inquiryActions.setDetail('email', event.target.value)}
                error={message('email')}
              />
              <TextField
                type="tel"
                inputMode="tel"
                label={c.send.phone.label}
                optionalText={common.optional}
                hint={c.send.phone.hint}
                autoComplete="tel"
                value={details.phone}
                onChange={(event) => inquiryActions.setDetail('phone', event.target.value)}
                error={message('phone')}
              />
              {quoteConfig.requireConsent && (
                <div className={styles.consent}>
                  <CheckboxField
                    label={c.send.consent.label}
                    checked={details.consent}
                    onChange={(checked) => inquiryActions.setDetail('consent', checked)}
                    error={message('consent')}
                  />
                  {privacyPath ? (
                    <LocalizedLink to={privacyPath} target="_blank" rel="noopener noreferrer" className={styles.privacy}>
                      {c.send.consent.privacy}
                      <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
                    </LocalizedLink>
                  ) : (
                    import.meta.env.DEV && <p className={styles.pending}>{c.send.consent.pending}</p>
                  )}
                </div>
              )}
              <p className={styles.memory}>{c.send.memory}</p>
            </>
          )}
        </div>

        {isLast && (
          <SubmissionResult
            phase={phase}
            text={{ failed: c.failed, unavailable: c.unavailable, summaryLabel: c.summary.heading }}
            summary={summary}
            headingRef={panelRef}
          />
        )}

        <div className={styles.actions}>
          {stepIndex > 0 && (
            <Button type="button" variant="secondary" className={styles.back} onClick={() => goTo(STEPS[stepIndex - 1])}>
              <span className={styles.backIcon}>
                <ArrowLeftIcon />
              </span>
              <span className={styles.backText}>{c.actions.back}</span>
            </Button>
          )}
          <Button type="submit" arrow loading={sending} loadingLabel={isLast ? c.actions.sending : undefined} className={styles.primary}>
            {isLast ? (transport.id === 'none' ? c.actions.prepare : c.actions.send) : c.actions.next}
          </Button>
        </div>
      </form>
    </div>
  )
}
