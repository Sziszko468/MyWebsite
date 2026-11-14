import { useParams } from 'react-router'
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { track } from '../analytics/tracker'
import { fetchBooking, fetchRescheduleDays, sendAction, type ActionResult, type BookingPage as BookingData, type CustomerAction, type Failure, type Slot } from '../booking/api'
import { addMonths, dayLabel, firstOfMonth, instantClock, instantDay, instantKey, instantMoment, instantRange, zoneName, type DateKey } from '../booking/dates'
import { useConsultationText, useRemote, type ConsultationWords } from '../booking/hooks'
import { useMonthDays } from '../booking/useMonthDays'
import { Button } from '../components/Button/Button'
import { Calendar } from '../components/consultation/Calendar'
import consult from '../components/consultation/Consultation.module.scss'
import { Container } from '../components/Container/Container'
import { TextField } from '../components/form/fields'
import { useI18n } from '../i18n/useI18n'
import { fill } from '../utils/format'
import styles from './ConsultationPage.module.scss'

/**
 * The customer's own booking page (`/<lang>/consultation/booking/<secret>`). The secret in the address is the only thing that opens it; the page
 * asks the API with it and shows the booking in the booking's own language and in the owner's time zone. It never shows the owner's notes. What the
 * customer can do here (ask to cancel, ask to move, answer a proposal) is what the owner's settings allow right now, and the server decides it: a
 * button that is shown is a button the server will accept, and one it would refuse is shown with the reason instead.
 */

const TERMINAL: readonly string[] = ['cancelled', 'completed', 'no_show']

function Frame({ words, children }: { words: ConsultationWords; children: ReactNode }) {
  return (
    <div className={styles.private}>
      <Container size="narrow">
        <div className={consult.manage}>{children}</div>
        <p className={styles.note}>{words.manage.eyebrow}</p>
      </Container>
    </div>
  )
}

function problemText(failure: Failure, words: ConsultationWords): string {
  const l = words.manage.link
  switch (failure.kind) {
    case 'not_found':
      return l.not_found
    case 'expired':
      return l.expired
    case 'replaced':
      return l.replaced
    case 'rate_limited':
      return l.rate_limited
    case 'unavailable':
      return l.unavailable
    default:
      return l.network
  }
}

export function BookingPage() {
  const { token = '' } = useParams()
  const words = useConsultationText()
  const { state, reload } = useRemote(token, () => fetchBooking(token))
  const [notice, setNotice] = useState<string | null>(null)

  if (state.status === 'loading') {
    return (
      <Frame words={words}>
        <p className={consult.muted} role="status">
          {words.manage.loading}
        </p>
      </Frame>
    )
  }
  if (state.status === 'failed') {
    return (
      <Frame words={words}>
        <div className={consult.notice} role="alert">
          <p>{problemText(state.failure, words)}</p>
          {(state.failure.kind === 'network' || state.failure.kind === 'unavailable' || state.failure.kind === 'rate_limited') && (
            <button type="button" className={consult.linkButton} onClick={reload}>
              {words.manage.link.retry}
            </button>
          )}
        </div>
      </Frame>
    )
  }
  return (
    <Frame words={words}>
      <Booking token={token} booking={state.data} words={words} notice={notice} onChanged={(message) => { setNotice(message); reload() }} />
    </Frame>
  )
}

export function IncompleteBookingLinkPage() {
  const words = useConsultationText()
  return (
    <Frame words={words}>
      <div className={consult.card}>
        <h1>{words.manage.incomplete.title}</h1>
        <p>{words.manage.incomplete.body}</p>
      </div>
    </Frame>
  )
}

type Panel = null | 'cancel' | 'move'

function Booking({ token, booking, words, notice, onChanged }: { token: string; booking: BookingData; words: ConsultationWords; notice: string | null; onChanged: (message: string) => void }) {
  const { lang } = useI18n()
  const m = words.manage
  const [panel, setPanel] = useState<Panel>(null)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const done = TERMINAL.includes(booking.status)
  const pageTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => pageTitle.current?.focus(), [])
  const open = booking.change

  const run = async (action: CustomerAction, success: (result: ActionResult) => string) => {
    setBusy(true)
    setProblem(null)
    const result = await sendAction(token, action)
    setBusy(false)
    if (result.ok) {
      if (action.action === 'cancel') track('booking_cancel_requested', {})
      if (action.action === 'reschedule') track('booking_reschedule_requested', {})
      setPanel(null)
      onChanged(success(result.data))
      return
    }
    const failed = result.failure
    if (failed.kind === 'refused') setProblem((m.unavailable as Record<string, string>)[failed.reason] ?? words.failures.generic)
    else setProblem(problemText(failed, words))
  }

  const reason = (kind: 'cancel' | 'reschedule'): string | null => {
    const verdict = booking.policy[kind]
    return verdict.allowed ? null : ((m.unavailable as Record<string, string>)[verdict.reason ?? 'state'] ?? m.unavailable.state)
  }

  const tone = booking.status === 'confirmed' || booking.status === 'rescheduled' ? 'good' : done ? 'ended' : 'open'

  return (
    <>
      <header className={consult.manageHeader}>
        <p className={consult.eyebrow}>{m.eyebrow}</p>
        <h1 ref={pageTitle} tabIndex={-1} className={consult.panelTitle}>
          {booking.type.name}
        </h1>
        <p className={consult.statusBadge} data-tone={tone}>
          {m.statuses[booking.status]}
        </p>
      </header>

      {notice && (
        <p className={consult.notice} role="status">
          {notice}
        </p>
      )}

      <dl className={consult.summary}>
        <div>
          <dt>{m.when}</dt>
          <dd>{`${instantDay(booking.startAt, booking.timeZone, lang, 'full')}, ${instantRange(booking.startAt, booking.endAt, booking.timeZone, lang)}`}</dd>
        </div>
        <div>
          <dt>{m.zone}</dt>
          <dd>{zoneName(booking.timeZone, lang, booking.startAt)}</dd>
        </div>
        <div>
          <dt>{m.duration}</dt>
          <dd>{fill(words.type.duration, { minutes: booking.durationMinutes })}</dd>
        </div>
        <div>
          <dt>{m.reference}</dt>
          <dd className={consult.reference}>{booking.reference}</dd>
        </div>
      </dl>

      {booking.cancellation && (
        <div className={consult.card}>
          <h2>{m.cancelled.title}</h2>
          {booking.cancellation.note && <p>{fill(m.cancelled.note, { note: booking.cancellation.note })}</p>}
        </div>
      )}

      {open && open.kind === 'cancel' && (
        <div className={consult.card}>
          <h2>{m.pending.cancelTitle}</h2>
          <p>{m.pending.cancelBody}</p>
          {open.canWithdraw && <Button variant="secondary" onClick={() => void run({ action: 'withdraw' }, () => m.actions.withdrawn)} loading={busy} loadingLabel={m.actions.sending}>{m.pending.withdraw}</Button>}
        </div>
      )}

      {open && open.kind === 'reschedule' && open.newStartAt && open.initiator === 'customer' && (
        <div className={consult.card}>
          <h2>{m.pending.moveTitle}</h2>
          <p>{fill(m.pending.moveBody, { time: instantMoment(open.newStartAt, booking.timeZone, lang) })}</p>
          {open.canWithdraw && <Button variant="secondary" onClick={() => void run({ action: 'withdraw' }, () => m.actions.withdrawn)} loading={busy} loadingLabel={m.actions.sending}>{m.pending.withdraw}</Button>}
        </div>
      )}

      {open && open.kind === 'reschedule' && open.newStartAt && open.initiator === 'owner' && (
        <div className={consult.card}>
          <h2>{m.proposal.title}</h2>
          <p>{fill(m.proposal.body, { time: instantMoment(open.newStartAt, booking.timeZone, lang) })}</p>
          {open.expiresAt && <p>{fill(m.proposal.until, { time: instantMoment(open.expiresAt, booking.timeZone, lang) })}</p>}
          {open.message && <p className={consult.pre}>{fill(m.proposal.message, { message: open.message })}</p>}
          {open.canAnswer && (
            <div className={consult.choices}>
              <Button variant="primary" onClick={() => void run({ action: 'accept' }, () => m.actions.accepted)} loading={busy} loadingLabel={m.actions.sending}>
                {m.proposal.accept}
              </Button>
              <Button variant="secondary" onClick={() => void run({ action: 'decline' }, () => m.actions.declined)} disabled={busy}>
                {m.proposal.decline}
              </Button>
            </div>
          )}
        </div>
      )}

      {problem && (
        <p className={consult.notice} role="alert">
          {problem}
        </p>
      )}

      {booking.active && !open && (
        <section className={consult.card} aria-labelledby="booking-actions">
          <h2 id="booking-actions">{m.actions.heading}</h2>
          {panel === null && (
            <div className={consult.choices}>
              {(['cancel', 'reschedule'] as const).map((kind) => {
                const why = reason(kind)
                // A change the owner does not offer is not a button at all; one that is offered but closed right now shows why.
                if (why && booking.policy[kind].reason === 'not_offered') return null
                const label = kind === 'cancel' ? (booking.policy.approvalRequired ? m.actions.cancelAsk : m.actions.cancelNow) : booking.policy.approvalRequired ? m.actions.moveAsk : m.actions.moveNow
                return (
                  <div key={kind} className={consult.manage}>
                    <Button variant="secondary" onClick={() => setPanel(kind === 'cancel' ? 'cancel' : 'move')} aria-disabled={why ? true : undefined} className={why ? consult.softDisabled : undefined} {...(why ? { onClick: () => undefined } : {})}>
                      {label}
                    </Button>
                    {why && <p className={consult.muted}>{why}</p>}
                  </div>
                )
              })}
            </div>
          )}
          {panel === 'cancel' && (
            <CancelForm
              words={words}
              asks={booking.policy.approvalRequired}
              busy={busy}
              onBack={() => setPanel(null)}
              onSend={(message) => void run({ action: 'cancel', message }, (result) => (result.outcome === 'done' ? m.actions.cancelled : m.actions.requestedCancel))}
            />
          )}
          {panel === 'move' && (
            <MoveForm
              words={words}
              token={token}
              booking={booking}
              busy={busy}
              onBack={() => setPanel(null)}
              onSend={(start, message) => void run({ action: 'reschedule', start, message }, (result) => (result.outcome === 'done' ? m.actions.moved : m.actions.requestedMove))}
            />
          )}
        </section>
      )}

      <section className={consult.card} aria-labelledby="booking-you">
        <h2 id="booking-you">{m.yourDetails}</h2>
        <dl className={consult.summary}>
          <div>
            <dt>{words.details.name}</dt>
            <dd>{booking.name}</dd>
          </div>
          {booking.company && (
            <div>
              <dt>{words.details.company}</dt>
              <dd>{booking.company}</dd>
            </div>
          )}
          {booking.website && (
            <div>
              <dt>{words.details.website}</dt>
              <dd>{booking.website}</dd>
            </div>
          )}
          {booking.description && (
            <div>
              <dt>{words.review.message}</dt>
              <dd className={consult.pre}>{booking.description}</dd>
            </div>
          )}
        </dl>
      </section>

      <section className={consult.card} aria-labelledby="booking-history">
        <h2 id="booking-history">{m.history}</h2>
        <ul className={consult.history}>
          {booking.history.map((entry, index) => (
            <li key={`${entry.at}-${index}`}>
              <span>{historyText(entry, booking, words, lang)}</span>
              <time dateTime={entry.at}>{instantMoment(entry.at, booking.timeZone, lang)}</time>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}

function historyText(entry: BookingData['history'][number], booking: BookingData, words: ConsultationWords, lang: ReturnType<typeof useI18n>['lang']): string {
  const events = words.manage.events as Record<string, string>
  const text = events[entry.type] ?? entry.type
  return entry.type === 'rescheduled' && entry.toStart ? fill(text, { time: instantMoment(entry.toStart, booking.timeZone, lang) }) : text
}

function CancelForm({ words, asks, busy, onBack, onSend }: { words: ConsultationWords; asks: boolean; busy: boolean; onBack: () => void; onSend: (message: string) => void }) {
  const [message, setMessage] = useState('')
  const a = words.manage.actions
  return (
    <form
      className={consult.form}
      onSubmit={(event) => {
        event.preventDefault()
        onSend(message.trim())
      }}
    >
      <TextField multiline rows={3} label={a.reason} value={message} maxLength={600} onChange={(event) => setMessage(event.target.value)} />
      <div className={consult.actions}>
        <Button variant="text" onClick={onBack} disabled={busy}>
          {a.keep}
        </Button>
        <Button type="submit" variant="primary" loading={busy} loadingLabel={a.sending}>
          {asks ? a.sendCancelAsk : a.sendCancelNow}
        </Button>
      </div>
    </form>
  )
}

function MoveForm({ words, token, booking, busy, onBack, onSend }: { words: ConsultationWords; token: string; booking: BookingData; busy: boolean; onBack: () => void; onSend: (start: string, message: string) => void }) {
  const { lang } = useI18n()
  const a = words.manage.actions
  const zone = booking.timeZone
  const [today] = useState(() => instantKey(new Date().toISOString(), zone))
  const first = firstOfMonth(today)
  const [month, setMonth] = useState<DateKey>(first)
  const [date, setDate] = useState<DateKey | null>(null)
  const [start, setStart] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const group = useId()
  const load = useCallback((_scope: string, from: DateKey, to: DateKey) => fetchRescheduleDays(token, from, to), [token])
  const { days, loading, failed, refresh } = useMonthDays(booking.reference, month, load)

  const slots: Slot[] = date ? (days[date]?.slots ?? []) : []
  // The booking can be moved as far ahead as the owner's horizon allows; the server refuses a day beyond it, and shows it closed.
  const last = addMonths(first, 12)
  return (
    <div className={consult.form}>
      <h3>{a.chooseTime}</h3>
      <p className={consult.hint}>{fill(words.time.zone, { zone: zoneName(zone, lang) })}</p>
      <Calendar lang={lang} words={words} month={month} days={days} selected={date} firstMonth={first} lastMonth={last} loading={loading} failed={failed} onMonth={setMonth} onSelect={(next) => { setDate(next); setStart(null) }} onRetry={() => refresh(month)} />
      {date && (
        <fieldset className={consult.slotGroup}>
          <legend className={consult.timesTitle}>{fill(words.time.timesHeading, { date: dayLabel(date, lang, 'long') })}</legend>
          {slots.length === 0 ? (
            <p className={consult.muted}>{words.time.noTimes}</p>
          ) : (
            <div className={consult.slots}>
              {slots.map((slot) => (
                <div key={slot.start} className={consult.slot}>
                  <input type="radio" id={`${group}-${slot.start}`} name={group} value={slot.start} checked={start === slot.start} onChange={() => setStart(slot.start)} />
                  <label htmlFor={`${group}-${slot.start}`} className={consult.slotLabel}>
                    {instantClock(slot.start, zone, lang, slot.ambiguous)}
                  </label>
                </div>
              ))}
            </div>
          )}
        </fieldset>
      )}
      <TextField multiline rows={3} label={a.reason} value={message} maxLength={600} onChange={(event) => setMessage(event.target.value)} />
      <div className={consult.actions}>
        <Button variant="text" onClick={onBack} disabled={busy}>
          {a.keep}
        </Button>
        <Button variant="primary" onClick={() => start && onSend(start, message.trim())} aria-disabled={!start || undefined} className={!start ? consult.softDisabled : undefined} loading={busy} loadingLabel={a.sending}>
          {a.sendMove}
        </Button>
      </div>
    </div>
  )
}
