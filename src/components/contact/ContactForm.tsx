import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { track } from '../../analytics/tracker'
import { contactConfig } from '../../config/contact'
import { siteConfig } from '../../config/site'
import { contactErrorText } from '../../contact/messages'
import { buildContactSummary } from '../../contact/summary'
import { CONTACT_KINDS, type ContactDraft, type ContactField, type ContactRequest } from '../../contact/types'
import { CONTACT_LIMITS, toContactRequest, validateContact } from '../../contact/validation'
import { createTransport, type Transport } from '../../forms/submit'
import { useI18n } from '../../i18n/useI18n'
import { fill } from '../../utils/format'
import { Button } from '../Button/Button'
import { ChoiceGroup, CheckboxField, FIRST_INVALID, TextField } from '../form/fields'
import { SentPanel, SubmissionNotice, SubmissionResult } from '../form/Submission'
import { useSubmission } from '../form/useSubmission'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import styles from './ContactForm.module.scss'

// A muted note that shows where a missing piece goes: development only, nothing in production.
const SHOW_PENDING = import.meta.env.DEV

interface ContactFormProps {
  draft: ContactDraft
  onChange: <K extends ContactField>(field: K, value: ContactDraft[K]) => void
  onReset: () => void
  /** Replaces the configured transport; used by tests and previews. */
  transport?: Transport<ContactRequest>
}

/**
 * The contact message: name, e-mail, what it is about, a subject, the message and, where the
 * configuration asks for it, an acknowledgement of how the data is used. The answers live in the
 * draft the page keeps (so the two doors above can choose the topic). The form is checked when it is
 * sent; once it has been tried, its errors follow the answers, so a message goes away as soon as it
 * is put right, and the first wrong answer takes focus.
 *
 * Sending is the transport's business (forms/submit.ts). The form says "sent" only when the
 * transport says so. With no endpoint configured nothing can be sent: the form says that up front,
 * and its button prepares a summary to copy instead. A failure keeps the message and says why.
 */
export function ContactForm({ draft, onChange, onReset, transport: given }: ContactFormProps) {
  const { lang, t } = useI18n()
  const c = t.contactPage.form
  const options = { requireConsent: contactConfig.requireConsent }

  const transport = useMemo(() => given ?? createTransport<ContactRequest>(contactConfig.endpoint), [given])
  const submission = useSubmission(transport)

  const [tried, setTried] = useState(false)
  const [attempts, setAttempts] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)

  const errors = tried ? validateContact(draft, options) : {}
  const message = (field: ContactField) => contactErrorText(c, field, errors[field])

  // A failed attempt puts focus on the first answer that needs attention.
  useEffect(() => {
    if (attempts === 0) return
    formRef.current?.querySelector<HTMLElement>(FIRST_INVALID)?.focus()
  }, [attempts])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submission.sending) return
    setTried(true)
    if (Object.keys(validateContact(draft, options)).length > 0) {
      submission.reset()
      setAttempts((count) => count + 1)
      return
    }
    await submission.submit(toContactRequest(draft, lang), () => {
      track('quote_request_submitted', { form: 'contact', items: 0 })
      onReset()
    })
  }

  const startAgain = () => {
    setTried(false)
    setAttempts(0)
    submission.reset()
  }

  if (submission.phase.kind === 'sent') {
    return (
      <div className={styles.card}>
        <SentPanel title={c.sent.title} text={c.sent.text} again={c.sent.again} onAgain={startAgain} headingRef={submission.sentRef} />
      </div>
    )
  }

  const privacyPath = siteConfig.legal.find((entry) => entry.id === 'privacy')?.path ?? null
  const sending = submission.sending

  return (
    <div className={styles.card}>
      {transport.id === 'none' && <SubmissionNotice>{c.unavailable.notice}</SubmissionNotice>}

      <form ref={formRef} noValidate onSubmit={onSubmit} aria-busy={sending || undefined}>
        <div className={styles.fields}>
          <TextField
            label={c.fields.name.label}
            hint={c.fields.name.hint}
            autoComplete="name"
            value={draft.name}
            onChange={(event) => onChange('name', event.target.value)}
            error={message('name')}
          />
          <TextField
            type="email"
            inputMode="email"
            label={c.fields.email.label}
            hint={c.fields.email.hint}
            autoComplete="email"
            value={draft.email}
            onChange={(event) => onChange('email', event.target.value)}
            error={message('email')}
          />
          <ChoiceGroup
            legend={c.fields.kind.label}
            value={draft.kind}
            onChange={(value) => onChange('kind', value)}
            options={CONTACT_KINDS.map((value) => ({ value, label: c.fields.kind.options[value] }))}
            error={message('kind')}
          />
          <TextField
            label={c.fields.subject.label}
            hint={c.fields.subject.hint}
            autoComplete="off"
            value={draft.subject}
            onChange={(event) => onChange('subject', event.target.value)}
            error={message('subject')}
          />
          <TextField
            multiline
            label={c.fields.message.label}
            hint={c.fields.message.hint}
            rows={7}
            autoComplete="off"
            value={draft.message}
            onChange={(event) => onChange('message', event.target.value)}
            counter={fill(c.fields.message.count, { count: draft.message.trim().length, max: CONTACT_LIMITS.message.max })}
            error={message('message')}
          />

          {contactConfig.requireConsent && (
            <div className={styles.consent}>
              <CheckboxField
                label={c.fields.consent.label}
                checked={draft.consent}
                onChange={(checked) => onChange('consent', checked)}
                error={message('consent')}
              />
              {privacyPath ? (
                <LocalizedLink to={privacyPath} target="_blank" rel="noopener noreferrer" className={styles.privacy}>
                  {c.fields.consent.privacy}
                  <span className="visually-hidden"> {t.a11y.opensInNewTab}</span>
                </LocalizedLink>
              ) : (
                SHOW_PENDING && <p className={styles.pending}>{c.fields.consent.pending}</p>
              )}
            </div>
          )}
        </div>

        <SubmissionResult
          phase={submission.phase}
          text={{ failed: c.failed, unavailable: c.unavailable, summaryLabel: c.summary.heading }}
          summary={buildContactSummary(draft, lang, c)}
          headingRef={submission.panelRef}
        />

        <div className={styles.actions}>
          <Button type="submit" arrow loading={sending} loadingLabel={c.actions.sending} className={styles.primary}>
            {transport.id === 'none' ? c.actions.prepare : c.actions.send}
          </Button>
        </div>
      </form>
    </div>
  )
}
