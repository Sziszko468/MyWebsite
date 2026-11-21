import { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from 'react'
import { bookingText } from '../../content/demos/booking'
import { demoText } from '../../content/demos/shell'
import { FIRST_INVALID, SelectField, TextField } from '../../components/form/fields'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { fill } from '../../utils/format'
import { formatCents, formatShortDay, formatWeekdayDay } from '../format'
import { ChipRadioGroup } from '../ui/ChipRadioGroup'
import ui from '../ui/demoUi.module.scss'
import { useDemoText } from '../useDemoText'
import styles from './BookingDemo.module.scss'
import {
  BOOKINGS_MAX,
  EMAIL_MAX,
  NAME_MAX,
  SERVICES,
  SERVICE_IDS,
  blockTime,
  initialState,
  localToday,
  reduce,
  slotsFor,
  validateBooking,
  visibleBookings,
  weekdaysFrom,
  type BookingField,
  type BookingInput,
  type BookingStatus,
  type ServiceId,
} from './model'

const EMPTY: BookingInput = { name: '', email: '', service: '', day: '', time: '' }
const STATUSES: readonly BookingStatus[] = ['scheduled', 'completed', 'cancelled']

/**
 * The booking demo: BookingHub's booking form and appointment list on sample data. The state is this component's own; a "booking" is a row in a list on this
 * page, nothing is sent anywhere, and the free and taken times are a labelled illustration (see model.ts), not a feature of the real project.
 */
export default function BookingDemo() {
  const { lang } = useI18n()
  const t = useDemoText(bookingText)
  const shell = useDemoText(demoText)
  const [state, dispatch] = useReducer(reduce, undefined, initialState)
  const [form, setForm] = useState<BookingInput>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<BookingField, string>>>({})
  const [message, setMessage] = useState('')
  const formRef = useRef<HTMLFormElement | null>(null)
  const summaryRef = useRef<HTMLHeadingElement | null>(null)
  // The day the demo was opened: stable for the life of this mount, so what is "past" and what is "too far" does not shift under the visitor.
  const today = useMemo(() => localToday(), [])
  const days = useMemo(() => weekdaysFrom(today), [today])

  const serviceName = (id: ServiceId) => t.services[id]
  const price = (id: ServiceId) => formatCents(SERVICES[id].dollars * 100, 'USD', lang)
  const when = (day: string, block: number) => `${formatWeekdayDay(day, lang)}, ${blockTime(block)}`
  const service = (SERVICE_IDS as readonly string[]).includes(form.service) ? (form.service as ServiceId) : null
  const slots = service && form.day ? slotsFor(form.day, service, state.bookings) : []
  const shown = visibleBookings(state, serviceName)

  useEffect(() => {
    if (state.last) summaryRef.current?.focus()
  }, [state.last])

  const change = (patch: Partial<BookingInput>) =>
    setForm((current) => {
      const next = { ...current, ...patch }
      // A different service or day changes which times are free, so the chosen time no longer means the same thing.
      if (('service' in patch && patch.service !== current.service) || ('day' in patch && patch.day !== current.day)) next.time = ''
      return next
    })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (state.bookings.length >= BOOKINGS_MAX) {
      setMessage(t.list.full)
      return
    }
    const result = validateBooking(form, today, state.bookings)
    if (!result.ok) {
      const next: Partial<Record<BookingField, string>> = {}
      for (const [field, code] of Object.entries(result.errors)) next[field as BookingField] = t.form.errors[code]
      setErrors(next)
      setMessage(t.form.fixErrors)
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(FIRST_INVALID)?.focus())
      return
    }
    dispatch({ type: 'book', value: result.value })
    setErrors({})
    setForm(EMPTY)
    setMessage(fill(t.summary.booked, { service: serviceName(result.value.service), when: when(result.value.day, result.value.block) }))
  }

  const setStatus = (id: number, name: string, status: BookingStatus) => {
    dispatch({ type: 'status', id, status })
    setMessage(fill(t.list.changed, { name, status: t.list.statuses[status] }))
  }

  return (
    <div className={styles.layout}>
      <section className={cx(ui.panel, styles.formPanel)} aria-labelledby="book-form">
        <div className={ui.panelHead}>
          <h3 id="book-form" className={ui.title}>
            {t.form.title}
          </h3>
          <span className={ui.sample}>{shell.labels.sample}</span>
        </div>
        <p className={ui.note}>{t.form.sampleNote}</p>
        <form ref={formRef} className={styles.form} onSubmit={submit} noValidate autoComplete="off">
          <TextField label={t.form.name} value={form.name} maxLength={NAME_MAX + 20} onChange={(event) => change({ name: event.target.value })} error={errors.name} />
          <TextField label={t.form.email} type="email" inputMode="email" value={form.email} maxLength={EMAIL_MAX + 20} onChange={(event) => change({ email: event.target.value })} error={errors.email} />
          <SelectField
            label={t.form.service}
            value={form.service}
            onChange={(value) => change({ service: value })}
            placeholder={t.form.choose}
            options={SERVICE_IDS.map((id) => ({
              value: id,
              label: `${serviceName(id)}: ${fill(t.duration, { minutes: SERVICES[id].minutes })}, ${price(id)}`,
            }))}
            error={errors.service}
          />
          <ChipRadioGroup
            legend={t.form.day}
            hint={t.form.dayHelp}
            value={form.day}
            onChange={(day) => change({ day })}
            options={days.map((day) => ({ value: day, label: formatWeekdayDay(day, lang) }))}
            error={errors.day}
          />
          {service && form.day ? (
            <ChipRadioGroup
              legend={t.form.time}
              hint={t.form.timeHelp}
              value={form.time}
              onChange={(time) => change({ time })}
              options={slots.map((slot) => ({
                value: String(slot.block),
                label: slot.time,
                disabled: !slot.free,
                extra: slot.free ? t.form.free : t.form.taken,
              }))}
              error={errors.time}
            />
          ) : (
            <div className={ui.fieldset} data-invalid={errors.time ? 'true' : undefined}>
              <p className={ui.legend}>{t.form.time}</p>
              <p className={ui.hint}>{!service ? t.form.pickService : t.form.pickDay}</p>
              {errors.time && (
                <p className={ui.error}>
                  <span aria-hidden="true">!</span>
                  <span>{errors.time}</span>
                </p>
              )}
            </div>
          )}
          <button type="submit" className={cx(ui.action, styles.submit)}>
            {t.form.submit}
          </button>
        </form>
        <p className={ui.live} role="status">
          {message}
        </p>
      </section>

      <div className={styles.side}>
        {state.last && (
          <section className={cx(ui.panel, styles.summary)} aria-labelledby="book-summary">
            <h3 id="book-summary" ref={summaryRef} tabIndex={-1} className={ui.title}>
              {t.summary.title}
            </h3>
            <p className={styles.banner}>{t.summary.banner}</p>
            <dl className={styles.details}>
              <div>
                <dt>{t.summary.service}</dt>
                <dd>{serviceName(state.last.service)}</dd>
              </div>
              <div>
                <dt>{t.summary.when}</dt>
                <dd>{when(state.last.day, state.last.block)}</dd>
              </div>
              <div>
                <dt>{t.summary.name}</dt>
                <dd>{state.last.name}</dd>
              </div>
              <div>
                <dt>{t.summary.email}</dt>
                <dd>{state.last.email}</dd>
              </div>
              <div>
                <dt>{t.summary.price}</dt>
                <dd>{price(state.last.service)}</dd>
              </div>
            </dl>
            <button type="button" className={ui.action} onClick={() => dispatch({ type: 'dismiss' })}>
              {t.summary.dismiss}
            </button>
          </section>
        )}

        <section className={cx(ui.panel, styles.listPanel)} aria-labelledby="book-list">
          <div className={ui.panelHead}>
            <h3 id="book-list" className={ui.title}>
              {t.list.title}
            </h3>
            <p className={ui.note} role="status">
              {shown.length === 1 ? t.list.countOne : fill(t.list.count, { count: shown.length })}
            </p>
          </div>
          <p className={ui.note}>{t.list.note}</p>

          {state.bookings.length === 0 ? (
            <p className={ui.note}>{t.list.empty}</p>
          ) : (
            <>
              <div className={ui.chips} role="group" aria-label={t.list.filter}>
                {(['all', ...STATUSES] as const).map((status) => (
                  <button key={status} type="button" className={ui.chip} aria-pressed={state.statusFilter === status} onClick={() => dispatch({ type: 'filter', status })}>
                    {status === 'all' ? t.list.all : t.list.statuses[status]}
                  </button>
                ))}
              </div>
              <TextField label={t.list.search} type="search" value={state.search} maxLength={60} onChange={(event) => dispatch({ type: 'search', text: event.target.value })} />
              {shown.length === 0 ? (
                <p className={ui.note}>{t.list.noMatch}</p>
              ) : (
                <ul className={cx(ui.list, styles.bookings)}>
                  {shown.map((booking) => (
                    <li key={booking.id} className={styles.booking} data-status={booking.status}>
                      <div className={styles.bookingHead}>
                        <span className={styles.bookingService}>{serviceName(booking.service)}</span>
                        <span className={ui.badge}>
                          <span className={cx(ui.glyph, booking.status === 'scheduled' ? ui.glyphRing : booking.status === 'completed' ? ui.glyphRound : ui.glyphSquare)} aria-hidden="true" />
                          {t.list.statuses[booking.status]}
                        </span>
                      </div>
                      <p className={ui.note}>
                        {formatShortDay(booking.day, lang)}, {blockTime(booking.block)} · {booking.name}
                      </p>
                      <div className={styles.rowActions}>
                        {booking.status === 'scheduled' ? (
                          <>
                            <button
                              type="button"
                              className={ui.action}
                              aria-label={fill(t.list.actionFor, { action: t.list.complete, name: booking.name, service: serviceName(booking.service) })}
                              onClick={() => setStatus(booking.id, booking.name, 'completed')}
                            >
                              {t.list.complete}
                            </button>
                            <button
                              type="button"
                              className={cx(ui.action, ui.danger)}
                              aria-label={fill(t.list.actionFor, { action: t.list.cancel, name: booking.name, service: serviceName(booking.service) })}
                              onClick={() => setStatus(booking.id, booking.name, 'cancelled')}
                            >
                              {t.list.cancel}
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className={ui.action}
                            aria-label={fill(t.list.actionFor, { action: t.list.reopen, name: booking.name, service: serviceName(booking.service) })}
                            onClick={() => setStatus(booking.id, booking.name, 'scheduled')}
                          >
                            {t.list.reopen}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
