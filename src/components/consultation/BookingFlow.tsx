import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { track } from '../../analytics/tracker'
import { fetchConfig, fetchDays, newSubmissionKey, sendBooking, type Day, type Failure, type PublicConfig, type PublicType, type Receipt, type Slot } from '../../booking/api'
import { useMonthDays } from '../../booking/useMonthDays'
import { addDays, addMonths, dayLabel, firstOfMonth, instantClock, instantDay, instantKey, zoneName, type DateKey } from '../../booking/dates'
import { useConsultationText, useRemote, type ConsultationWords } from '../../booking/hooks'
import { siteConfig } from '../../config/site'
import { isEmail, isWebsite } from '../../forms/validate'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { fill } from '../../utils/format'
import { Button } from '../Button/Button'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { CheckboxField, FIRST_INVALID, TextField } from '../form/fields'
import { Calendar } from './Calendar'
import styles from './Consultation.module.scss'

type Step = 'type' | 'time' | 'details' | 'review' | 'done'
const STEPS: readonly Exclude<Step, 'done'>[] = ['type', 'time', 'details', 'review']

interface Draft {
  name: string
  email: string
  company: string
  website: string
  description: string
  relatedReference: string
  consent: boolean
  /** The hidden field no person sees. */
  nickname: string
}

const EMPTY_DRAFT: Draft = { name: '', email: '', company: '', website: '', description: '', relatedReference: '', consent: false, nickname: '' }
const LIMITS = { name: { min: 2, max: 100 }, description: 1500, company: 120, website: 200, reference: 40 } as const

type Errors = Partial<Record<keyof Draft, string>>

const monthOf = (key: DateKey): DateKey => firstOfMonth(key)

/** The visitor's booking, step by step. The server decides what is free and whether the booking is made; this only asks and shows. */
export function BookingFlow() {
  const { lang } = useI18n()
  const words = useConsultationText()
  const { state, reload } = useRemote(lang, () => fetchConfig(lang))

  if (state.status === 'loading') return <p className={styles.muted} role="status">{words.closed.loading}</p>
  if (state.status === 'failed') {
    return (
      <div className={styles.notice} role="alert">
        <p>{words.closed.failed}</p>
        <button type="button" className={styles.linkButton} onClick={reload}>
          {words.closed.retry}
        </button>
      </div>
    )
  }
  if (!state.data.open || state.data.timeZone === null) return <ClosedNotice words={words} />
  return <Flow config={state.data} zone={state.data.timeZone} words={words} onConfigChanged={reload} />
}

function ClosedNotice({ words }: { words: ConsultationWords }) {
  return (
    <div className={styles.closed}>
      <h2 className={styles.panelTitle}>{words.closed.title}</h2>
      <p>{words.closed.body}</p>
      <Button to="/contact" variant="secondary" arrow>
        {words.closed.action}
      </Button>
    </div>
  )
}

function Flow({ config, zone, words, onConfigChanged }: { config: PublicConfig; zone: string; words: ConsultationWords; onConfigChanged: () => void }) {
  const { lang } = useI18n()
  const [step, setStep] = useState<Step>('type')
  const [typeCode, setTypeCode] = useState<string | null>(null)
  const [date, setDate] = useState<DateKey | null>(null)
  const [start, setStart] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<Errors>({})
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [taken, setTaken] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const key = useRef(newSubmissionKey())
  const heading = useRef<HTMLHeadingElement>(null)
  const moved = useRef(false)

  const [today] = useState(() => instantKey(new Date().toISOString(), zone))
  const firstMonth = monthOf(today)
  // The last month a day can be booked in: the one the booking horizon ends in, counted from today in the owner's zone.
  const lastMonth = monthOf(addDays(today, config.horizonDays))
  const [month, setMonth] = useState<DateKey>(firstMonth)

  const type: PublicType | null = config.types.find((candidate) => candidate.code === typeCode) ?? null
  // A language change reloads the types: a choice that the new list no longer has is dropped, never swapped for another.
  const [seen, setSeen] = useState(config)
  if (seen !== config) {
    setSeen(config)
    if (typeCode && !config.types.some((candidate) => candidate.code === typeCode)) {
      setTypeCode(null)
      setDate(null)
      setStart(null)
      setStep('type')
    }
  }

  useEffect(() => track('booking_started', {}), [])

  // ---- the days of the month on show -------------------------------------------------------------------------------------------------
  const advanced = useRef(false)
  // A month with nothing to choose sends the visitor on to the next one, once, instead of leaving them to look for it.
  const onLoaded = useCallback(
    (loaded: DateKey, list: Day[]) => {
      if (advanced.current) return
      advanced.current = true
      if (!list.some((day) => day.status === 'available') && addMonths(loaded, 1) <= lastMonth) setMonth(addMonths(loaded, 1))
    },
    [lastMonth],
  )
  const { days, loading: loadingDays, failed: daysFailed, refresh } = useMonthDays(typeCode, month, fetchDays, onLoaded, step === 'time')

  const slots: Slot[] = date ? (days[date]?.slots ?? []) : []
  // A chosen time that the server no longer lists (the list was refreshed) is not a choice any more.
  const chosen = start && slots.some((slot) => slot.start === start) ? start : null

  // ---- moving between steps ----------------------------------------------------------------------------------------------------------
  const go = (next: Step) => {
    setFailure(null)
    setStep(next)
  }
  useEffect(() => {
    if (!moved.current) {
      moved.current = true
      return
    }
    heading.current?.focus()
  }, [step])

  const chooseType = (code: string) => {
    if (code !== typeCode) {
      setTypeCode(code)
      setDate(null)
      setStart(null)
      advanced.current = false
      setMonth(firstMonth)
      track('consultation_type_viewed', { type: code })
    }
  }

  const chooseDate = (next: DateKey) => {
    setDate(next)
    setStart(null)
    setTaken(false)
  }

  const chooseStart = (slot: Slot) => {
    setStart(slot.start)
    setTaken(false)
    if (typeCode) track('booking_slot_selected', { type: typeCode })
  }

  // ---- the form ----------------------------------------------------------------------------------------------------------------------
  const change = <K extends keyof Draft>(field: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => (field in current ? { ...current, [field]: undefined } : current))
  }

  const validate = (): Errors => {
    const found: Errors = {}
    const e = words.errors
    const name = draft.name.trim()
    if (!name) found.name = e.required
    else if ([...name].length < LIMITS.name.min) found.name = e.tooShort
    else if ([...name].length > LIMITS.name.max) found.name = e.tooLong
    const email = draft.email.trim()
    if (!email) found.email = e.required
    else if (!isEmail(email)) found.email = e.invalidEmail
    if (draft.company.trim().length > LIMITS.company) found.company = e.tooLong
    if (draft.website.trim() && (!isWebsite(draft.website) || draft.website.trim().length > LIMITS.website)) found.website = e.invalidUrl
    if ([...draft.description].length > LIMITS.description) found.description = e.tooLong
    if (draft.relatedReference.trim().length > LIMITS.reference || (draft.relatedReference.trim() && !/^[A-Za-z0-9-]+$/.test(draft.relatedReference.trim()))) found.relatedReference = e.invalid
    if (!draft.consent) found.consent = e.consentRequired
    return found
  }

  const formRef = useRef<HTMLFormElement>(null)
  const submitDetails = (event: FormEvent) => {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(FIRST_INVALID)?.focus())
      return
    }
    go('review')
  }

  const reasonText = (failed: Failure): string => {
    if (failed.kind === 'rate_limited') return words.failures.rate_limited
    if (failed.kind === 'unavailable') return words.failures.unavailable
    if (failed.kind === 'network') return words.failures.network
    if (failed.kind === 'refused' && failed.reason === 'closed') return words.failures.closed
    if (failed.kind === 'refused' && failed.reason === 'key_reused') return words.failures.key_reused
    return words.failures.generic
  }

  const submit = async () => {
    if (!typeCode || !chosen || busy) return
    setBusy(true)
    setFailure(null)
    track('booking_submitted', { type: typeCode })
    const result = await sendBooking({
      language: lang,
      type: typeCode,
      start: chosen,
      name: draft.name.trim(),
      email: draft.email.trim(),
      company: draft.company.trim(),
      website: draft.website.trim(),
      description: draft.description.trim(),
      relatedReference: draft.relatedReference.trim(),
      consent: draft.consent,
      idempotencyKey: key.current,
      nickname: draft.nickname,
    })
    setBusy(false)
    if (result.ok) {
      key.current = newSubmissionKey()
      setReceipt(result.data)
      track('booking_confirmed', { type: typeCode, confirmed: result.data.status === 'confirmed' })
      go('done')
      return
    }
    const failed = result.failure
    if (failed.kind === 'refused' && failed.reason === 'slot_unavailable') {
      // Somebody else took it first: the time is gone, the list is refreshed, and the visitor chooses again.
      key.current = newSubmissionKey()
      setTaken(true)
      setStart(null)
      refresh(month)
      go('time')
      return
    }
    if (failed.kind === 'refused' && Object.keys(failed.fields).length > 0) {
      key.current = newSubmissionKey()
      // A type or a time the server does not accept any more: start again from the types (the list is asked for again).
      if (failed.fields.type || failed.fields.start) {
        onConfigChanged()
        setFailure(words.failures.generic)
        go('type')
        return
      }
      const mapped: Errors = {}
      const known = words.errors as Record<string, string>
      for (const [field, code] of Object.entries(failed.fields)) if (field in EMPTY_DRAFT) mapped[field as keyof Draft] = known[code] ?? words.errors.invalid
      setErrors(mapped)
      go('details')
      return
    }
    if (failed.kind === 'not_found') {
      onConfigChanged()
      setFailure(words.failures.generic)
      go('type')
      return
    }
    // A refusal the server will always repeat gets a new key; a doubtful one (no answer at all) keeps the old one, so a retry cannot book twice.
    if (failed.kind === 'refused') key.current = newSubmissionKey()
    setFailure(reasonText(failed))
  }

  const startAgain = () => {
    setReceipt(null)
    setTypeCode(null)
    setDate(null)
    setStart(null)
    setDraft(EMPTY_DRAFT)
    setErrors({})
    advanced.current = false
    setMonth(firstMonth)
    go('type')
  }

  // ---- what is shown -----------------------------------------------------------------------------------------------------------------
  const stepIndex = step === 'done' ? STEPS.length : STEPS.indexOf(step)
  const summary = (
    <Summary words={words} lang={lang} zone={zone} type={type} start={chosen} end={slots.find((slot) => slot.start === chosen)?.end ?? null} receipt={receipt} />
  )

  if (step === 'done' && receipt) {
    return (
      <Done words={words} lang={lang} receipt={receipt} onAgain={startAgain} />
    )
  }

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <Stepper words={words} current={stepIndex} onGo={(index) => go(STEPS[index])} canGo={(index) => index < stepIndex} />
        <p className={styles.stepOf}>{fill(words.steps.of, { n: stepIndex + 1, total: STEPS.length })}</p>

        {failure && (
          <p className={styles.notice} role="alert">
            {failure}
          </p>
        )}

        {step === 'type' && (
          <Panel heading={words.type.heading} headingRef={heading} hint={words.type.hint}>
            <TypeList words={words} types={config.types} value={typeCode} onChange={chooseType} />
            <Nav words={words} onNext={() => go('time')} nextDisabled={!typeCode} hint={typeCode ? null : words.type.required} />
          </Panel>
        )}

        {step === 'time' && type && (
          <Panel heading={words.time.heading} headingRef={heading} hint={fill(words.time.zone, { zone: zoneName(zone, lang) })} note={words.time.zoneNote}>
            <div className={styles.dateTime}>
              <Calendar
                lang={lang}
                words={words}
                month={month}
                days={days}
                selected={date}
                firstMonth={firstMonth}
                lastMonth={lastMonth}
                loading={loadingDays}
                failed={daysFailed}
                onMonth={setMonth}
                onSelect={chooseDate}
                onRetry={() => refresh(month)}
              />
              <TimeList words={words} lang={lang} zone={zone} date={date} slots={slots} value={chosen} taken={taken} onChange={chooseStart} />
            </div>
            <Nav words={words} onBack={() => go('type')} onNext={() => go('details')} nextDisabled={!chosen} hint={chosen ? null : words.time.required} />
          </Panel>
        )}

        {step === 'details' && (
          <Panel heading={words.details.heading} headingRef={heading} hint={words.details.hint}>
            <DetailsForm words={words} draft={draft} errors={errors} formRef={formRef} onChange={change} onSubmit={submitDetails} onBack={() => go('time')} />
          </Panel>
        )}

        {step === 'review' && type && chosen && (
          <Panel heading={words.review.heading} headingRef={heading}>
            <div className={styles.reviewSummary}>{summary}</div>
            <Review words={words} draft={draft} onEdit={go} />
            <p className={styles.muted}>{config.confirmation === 'automatic' ? words.review.noteAutomatic : words.review.noteManual}</p>
            <div className={styles.actions}>
              <Button variant="text" onClick={() => go('details')} disabled={busy}>
                {words.steps.back}
              </Button>
              <Button variant="primary" arrow onClick={() => void submit()} loading={busy} loadingLabel={words.review.sending}>
                {config.confirmation === 'automatic' ? words.review.confirm : words.review.request}
              </Button>
            </div>
          </Panel>
        )}
      </div>

      {/* A group, not an <aside>: it sits inside the page's own section, and a complementary landmark must not be nested in another landmark. */}
      <div className={styles.aside} role="group" aria-label={words.review.summaryLabel}>
        {summary}
      </div>
    </div>
  )
}

// ---- the pieces -----------------------------------------------------------------------------------------------------------------------

function Stepper({ words, current, onGo, canGo }: { words: ConsultationWords; current: number; onGo: (index: number) => void; canGo: (index: number) => boolean }) {
  const labels = [words.steps.type, words.steps.time, words.steps.details, words.steps.review]
  return (
    <ol className={styles.steps} aria-label={words.steps.label}>
      {labels.map((label, index) => {
        const reachable = canGo(index)
        const state = index === current ? 'current' : index < current ? 'done' : 'todo'
        return (
          <li key={label} className={cx(styles.stepItem, styles[`step_${state}`])} aria-current={state === 'current' ? 'step' : undefined}>
            {reachable ? (
              <button type="button" className={styles.stepButton} onClick={() => onGo(index)}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <span className={styles.stepLabel}>{label}</span>
              </button>
            ) : (
              <span className={styles.stepButton}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {index + 1}
                </span>
                <span className={styles.stepLabel}>{label}</span>
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Panel({ heading, headingRef, hint, note, children }: { heading: string; headingRef: RefObject<HTMLHeadingElement | null>; hint?: string; note?: string; children: ReactNode }) {
  return (
    <section className={styles.panel} aria-labelledby="booking-heading">
      <h2 id="booking-heading" ref={headingRef} tabIndex={-1} className={styles.panelTitle}>
        {heading}
      </h2>
      {hint && <p className={styles.hint}>{hint}</p>}
      {note && <p className={styles.hint}>{note}</p>}
      {children}
    </section>
  )
}

function Nav({ words, onBack, onNext, nextDisabled, hint }: { words: ConsultationWords; onBack?: () => void; onNext: () => void; nextDisabled: boolean; hint: string | null }) {
  const id = useId()
  return (
    <div className={styles.actions}>
      {hint && (
        <p id={id} className={styles.muted}>
          {hint}
        </p>
      )}
      {onBack && (
        <Button variant="text" onClick={onBack}>
          {words.steps.back}
        </Button>
      )}
      {/* A button that is not ready says so (aria-disabled) and keeps its place and its focus; the sentence beside it says why. */}
      <Button variant="primary" arrow onClick={nextDisabled ? undefined : onNext} aria-disabled={nextDisabled || undefined} aria-describedby={hint ? id : undefined} className={cx(nextDisabled && styles.softDisabled)}>
        {words.steps.next}
      </Button>
    </div>
  )
}

function TypeList({ words, types, value, onChange }: { words: ConsultationWords; types: PublicType[]; value: string | null; onChange: (code: string) => void }) {
  const group = useId()
  return (
    <fieldset className={styles.types}>
      <legend className={styles.visuallyHidden}>{words.type.heading}</legend>
      {types.map((type) => (
        <div key={type.code} className={styles.typeOption}>
          <input type="radio" id={`${group}-${type.code}`} name={group} value={type.code} checked={value === type.code} onChange={() => onChange(type.code)} />
          <label htmlFor={`${group}-${type.code}`} className={styles.typeCard}>
            <span className={styles.typeName}>{type.name}</span>
            <span className={styles.typeDuration}>{fill(words.type.duration, { minutes: type.durationMinutes })}</span>
            <span className={styles.typeText}>{type.description}</span>
          </label>
        </div>
      ))}
    </fieldset>
  )
}

function TimeList({ words, lang, zone, date, slots, value, taken, onChange }: { words: ConsultationWords; lang: ReturnType<typeof useI18n>['lang']; zone: string; date: DateKey | null; slots: Slot[]; value: string | null; taken: boolean; onChange: (slot: Slot) => void }) {
  const group = useId()
  const t = words.time
  return (
    <div className={styles.times} aria-live="polite">
      {taken && <p className={styles.notice} role="alert">{t.taken}</p>}
      {!date ? (
        <p className={styles.muted}>{t.pickDay}</p>
      ) : (
        <fieldset className={styles.slotGroup}>
          <legend className={styles.timesTitle}>{fill(t.timesHeading, { date: dayLabel(date, lang, 'long') })}</legend>
          {slots.length === 0 ? (
            <p className={styles.muted}>{t.noTimes}</p>
          ) : (
            <>
              <div className={styles.slots}>
                {slots.map((slot) => (
                  <div key={slot.start} className={styles.slot}>
                    <input type="radio" id={`${group}-${slot.start}`} name={group} value={slot.start} checked={value === slot.start} onChange={() => onChange(slot)} />
                    <label htmlFor={`${group}-${slot.start}`} className={styles.slotLabel}>
                      {instantClock(slot.start, zone, lang, slot.ambiguous)}
                    </label>
                  </div>
                ))}
              </div>
              {slots.some((slot) => slot.ambiguous) && <p className={styles.muted}>{t.ambiguous}</p>}
            </>
          )}
        </fieldset>
      )}
    </div>
  )
}

function DetailsForm({ words, draft, errors, formRef, onChange, onSubmit, onBack }: { words: ConsultationWords; draft: Draft; errors: Errors; formRef: RefObject<HTMLFormElement | null>; onChange: <K extends keyof Draft>(field: K, value: Draft[K]) => void; onSubmit: (event: FormEvent) => void; onBack: () => void }) {
  const d = words.details
  const privacy = siteConfig.legal.find((entry) => entry.id === 'privacy')?.path ?? null
  const failed = Object.values(errors).some(Boolean)
  return (
    <form ref={formRef} className={styles.form} onSubmit={onSubmit} noValidate>
      {failed && (
        <p className={styles.notice} role="alert">
          {words.errors.summary}
        </p>
      )}
      <TextField label={d.name} name="name" autoComplete="name" value={draft.name} error={errors.name} maxLength={LIMITS.name.max + 20} onChange={(event) => onChange('name', event.target.value)} />
      <TextField label={d.email} name="email" type="email" autoComplete="email" inputMode="email" value={draft.email} error={errors.email} onChange={(event) => onChange('email', event.target.value)} />
      <div className={styles.twoColumns}>
        <TextField label={d.company} optionalText={d.optional} name="company" autoComplete="organization" value={draft.company} error={errors.company} onChange={(event) => onChange('company', event.target.value)} />
        <TextField label={d.website} optionalText={d.optional} name="website" autoComplete="url" inputMode="url" value={draft.website} error={errors.website} onChange={(event) => onChange('website', event.target.value)} />
      </div>
      <TextField
        multiline
        rows={5}
        label={d.description}
        optionalText={d.optional}
        hint={d.descriptionHint}
        name="description"
        value={draft.description}
        error={errors.description}
        counter={fill(d.counter, { n: [...draft.description].length, max: LIMITS.description })}
        onChange={(event) => onChange('description', event.target.value)}
      />
      <TextField label={d.reference} optionalText={d.optional} hint={d.referenceHint} name="reference" value={draft.relatedReference} error={errors.relatedReference} onChange={(event) => onChange('relatedReference', event.target.value)} />
      {/* A field no person sees or reaches: a script that fills it is refused. */}
      <div className={styles.trap} aria-hidden="true">
        <input type="text" name="nickname" tabIndex={-1} autoComplete="off" value={draft.nickname} onChange={(event) => onChange('nickname', event.target.value)} />
      </div>
      <CheckboxField
        checked={draft.consent}
        error={errors.consent}
        onChange={(checked) => onChange('consent', checked)}
        label={
          <>
            {d.consent}{' '}
            {privacy && (
              <LocalizedLink to={privacy} target="_blank" rel="noopener noreferrer">
                {d.privacy}
              </LocalizedLink>
            )}
          </>
        }
      />
      <div className={styles.actions}>
        <Button variant="text" onClick={onBack}>
          {words.steps.back}
        </Button>
        <Button type="submit" variant="primary" arrow>
          {words.steps.next}
        </Button>
      </div>
    </form>
  )
}

function Summary({ words, lang, zone, type, start, end, receipt }: { words: ConsultationWords; lang: ReturnType<typeof useI18n>['lang']; zone: string; type: PublicType | null; start: string | null; end: string | null; receipt: Receipt | null }) {
  const r = words.review
  return (
    <dl className={styles.summary}>
      <div>
        <dt>{r.consultation}</dt>
        <dd>{type ? type.name : '—'}</dd>
      </div>
      <div>
        <dt>{r.when}</dt>
        <dd>{start ? `${instantDay(start, zone, lang, 'full')}, ${instantClock(start, zone, lang)}${end ? `–${instantClock(end, zone, lang)}` : ''}` : '—'}</dd>
      </div>
      <div>
        <dt>{r.zone}</dt>
        <dd>{zone}</dd>
      </div>
      {type && (
        <div>
          <dt>{r.duration}</dt>
          <dd>{fill(words.type.duration, { minutes: type.durationMinutes })}</dd>
        </div>
      )}
      {receipt && (
        <div>
          <dt>{words.done.reference}</dt>
          <dd>{receipt.reference}</dd>
        </div>
      )}
    </dl>
  )
}

function Review({ words, draft, onEdit }: { words: ConsultationWords; draft: Draft; onEdit: (step: Step) => void }) {
  const r = words.review
  const d = words.details
  return (
    <section className={styles.review} aria-label={r.you}>
      <div className={styles.reviewHead}>
        <h3 className={styles.reviewTitle}>{r.you}</h3>
        <button type="button" className={styles.linkButton} onClick={() => onEdit('details')}>
          {r.change}
        </button>
      </div>
      <dl className={styles.summary}>
        <div>
          <dt>{d.name}</dt>
          <dd>{draft.name.trim()}</dd>
        </div>
        <div>
          <dt>{d.email}</dt>
          <dd>{draft.email.trim()}</dd>
        </div>
        {draft.company.trim() && (
          <div>
            <dt>{d.company}</dt>
            <dd>{draft.company.trim()}</dd>
          </div>
        )}
        {draft.website.trim() && (
          <div>
            <dt>{d.website}</dt>
            <dd>{draft.website.trim()}</dd>
          </div>
        )}
        {draft.description.trim() && (
          <div>
            <dt>{r.message}</dt>
            <dd className={styles.pre}>{draft.description.trim()}</dd>
          </div>
        )}
      </dl>
    </section>
  )
}

function Done({ words, lang, receipt, onAgain }: { words: ConsultationWords; lang: ReturnType<typeof useI18n>['lang']; receipt: Receipt; onAgain: () => void }) {
  const confirmed = receipt.status === 'confirmed'
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const d = words.done
  return (
    <section className={styles.done} aria-labelledby="booking-done" role="status">
      <p className={styles.doneBadge}>{confirmed ? words.manage.statuses.confirmed : words.manage.statuses.pending}</p>
      <h2 id="booking-done" ref={ref} tabIndex={-1} className={styles.panelTitle}>
        {confirmed ? d.confirmedTitle : d.pendingTitle}
      </h2>
      <p>{receipt.duplicate ? d.duplicate : confirmed ? d.confirmedBody : d.pendingBody}</p>
      <dl className={styles.summary}>
        <div>
          <dt>{d.reference}</dt>
          <dd className={styles.reference}>{receipt.reference}</dd>
        </div>
        <div>
          <dt>{words.review.consultation}</dt>
          <dd>{receipt.type.name}</dd>
        </div>
        <div>
          <dt>{words.review.when}</dt>
          <dd>{`${instantDay(receipt.startAt, receipt.timeZone, lang, 'full')}, ${instantClock(receipt.startAt, receipt.timeZone, lang)}–${instantClock(receipt.endAt, receipt.timeZone, lang)}`}</dd>
        </div>
        <div>
          <dt>{words.review.zone}</dt>
          <dd>{receipt.timeZone}</dd>
        </div>
        <div>
          <dt>{words.review.duration}</dt>
          <dd>{fill(words.type.duration, { minutes: receipt.durationMinutes })}</dd>
        </div>
      </dl>
      <p className={styles.muted}>{receipt.confirmationEmail ? d.emailSent : d.emailNotSent}</p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onAgain}>
          {d.another}
        </Button>
      </div>
    </section>
  )
}
