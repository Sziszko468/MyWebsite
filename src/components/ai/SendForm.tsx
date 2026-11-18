import { useEffect, useId, useState, type FormEvent } from 'react'
import { AiError } from '../../ai/client'
import { controlRoom, useControlRoom } from '../../ai/controlRoom'
import { useAiText } from '../../ai/useAiText'
import { quoteConfig } from '../../config/quote'
import { cx } from '../../utils/cx'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import styles from './Plan.module.scss'

/**
 * The form where the visitor approves sending the plan as a quote request (shared by the plan panel and the project discovery panel). The
 * approval (name, e-mail address, the acknowledgement) goes straight to the server and never through the chat, so the model never sees the
 * visitor's contact details; the assistant is then asked to send, and the server sends only what was approved.
 */

/** Says, once the approval has been waiting a few seconds with no request sent, that the visitor can ask again. A child so that its timer starts fresh with every approval. */
function WaitingHint() {
  const text = useAiText()
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setWaited(true), 6000)
    return () => window.clearTimeout(timer)
  }, [])
  if (!waited) return null
  return (
    <div className={styles.actions}>
      <p className={styles.small}>{text.send.waiting}</p>
      <button type="button" className={styles.secondary} onClick={() => void controlRoom.send(text.send.asked)}>
        {text.send.retry}
      </button>
    </div>
  )
}

/** The form is keyed by the plan's version: an edit gives a fresh form, because an approval is for the plan as it is. */
export function SendForm() {
  const room = useControlRoom()
  const text = useAiText()
  const id = useId()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [consent, setConsent] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [problem, setProblem] = useState<string | null>(null)
  const approval = room.approval

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (name.trim().length < 2) found.name = text.send.required
    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email.trim())) found.email = text.send.invalidEmail
    if (quoteConfig.requireConsent && !consent) found.consent = text.send.consentRequired
    setErrors(found)
    if (Object.keys(found).length > 0) return
    setProblem(null)
    try {
      await controlRoom.approve({ name: name.trim(), email: email.trim(), company: company.trim() || null, consent })
    } catch (error) {
      if (error instanceof AiError && error.status === 409) {
        setProblem(text.send.conflict)
        void controlRoom.refreshPlan()
      } else if (error instanceof AiError && error.status === 422) {
        const fields = error.fields
        setErrors({ ...(fields.name ? { name: text.send.required } : {}), ...(fields.email ? { email: text.send.invalidEmail } : {}), ...(fields.consent ? { consent: text.send.consentRequired } : {}) })
        if (fields.plan) setProblem(text.send.needsPlan)
      } else if (error instanceof AiError && error.status === 503) setProblem(text.send.disabled)
      else setProblem(text.errors.generic)
    }
  }

  const locked = approval === 'approving' || approval === 'approved'
  return (
    <form className={cx(styles.send, locked && styles.locked)} onSubmit={(event) => void submit(event)} noValidate aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.subtitle}>
        {text.send.title}
      </h3>
      <p className={styles.small}>{text.send.lead}</p>
      <div className={styles.control}>
        <label htmlFor={`${id}-name`}>{text.send.name}</label>
        <input id={`${id}-name`} type="text" autoComplete="name" value={name} disabled={locked} aria-invalid={errors.name ? true : undefined} aria-describedby={errors.name ? `${id}-name-e` : undefined} onChange={(event) => setName(event.target.value)} />
        {errors.name && (
          <p id={`${id}-name-e`} className={styles.problem}>
            {errors.name}
          </p>
        )}
      </div>
      <div className={styles.control}>
        <label htmlFor={`${id}-email`}>{text.send.email}</label>
        <input id={`${id}-email`} type="email" autoComplete="email" inputMode="email" value={email} disabled={locked} aria-invalid={errors.email ? true : undefined} aria-describedby={errors.email ? `${id}-email-e` : undefined} onChange={(event) => setEmail(event.target.value)} />
        {errors.email && (
          <p id={`${id}-email-e`} className={styles.problem}>
            {errors.email}
          </p>
        )}
      </div>
      <div className={styles.control}>
        <label htmlFor={`${id}-company`}>{text.send.company}</label>
        <input id={`${id}-company`} type="text" autoComplete="organization" value={company} disabled={locked} onChange={(event) => setCompany(event.target.value)} />
      </div>
      {quoteConfig.requireConsent && (
        <div className={styles.check}>
          <input id={`${id}-consent`} type="checkbox" checked={consent} disabled={locked} aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? `${id}-consent-e` : undefined} onChange={(event) => setConsent(event.target.checked)} />
          <label htmlFor={`${id}-consent`}>{text.send.consent}</label>
        </div>
      )}
      {quoteConfig.requireConsent && (
        // Outside the label: a link inside a label is a second control in the first one's target.
        <p className={styles.small}>
          <LocalizedLink to="/privacy" className={styles.link}>
            {text.privacy.more}
          </LocalizedLink>
        </p>
      )}
      {errors.consent && (
        <p id={`${id}-consent-e`} className={styles.problem}>
          {errors.consent}
        </p>
      )}
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
      {approval === 'approved' && (
        <p className={styles.notice} role="status">
          {text.send.approved}
        </p>
      )}
      {approval === 'approved' && room.status === 'ready' && <WaitingHint />}
      {!locked && (
        <button type="submit" className={styles.primary}>
          {text.send.approve}
        </button>
      )}
      {approval === 'approving' && (
        <button type="submit" className={styles.primary} disabled>
          {text.send.approving}
        </button>
      )}
    </form>
  )
}
