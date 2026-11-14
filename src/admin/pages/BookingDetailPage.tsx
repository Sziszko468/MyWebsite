import { useEffect, useId, useState } from 'react'
import { Link, useParams } from 'react-router'
import { cx } from '../../utils/cx'
import * as endpoints from '../api/endpoints'
import type { FreeDay } from '../api/bookingTypes'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { TextAreaField, TextField } from '../components/form'
import { InternalNotes } from '../components/InternalNotes'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, formatInZone, useInterfaceLanguage, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import { BookingStatusBadge } from './BookingsPage'

const FINAL = ['cancelled', 'completed', 'no_show']

/** One booking: who, what, when, what is waiting for an answer, what can be done, what happened, and what was e-mailed. */
export function BookingDetailPage() {
  const { id = '' } = useParams()
  const t = useText()
  const b = t.booking
  const d = b.detail
  const language = useInterfaceLanguage()
  const toast = useToast()
  const session = useSession()
  const confirm = useConfirm()
  const resource = useResource((signal) => endpoints.bookings.get(id, signal), [id])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposing, setProposing] = useState(false)
  // The moment the page was opened: a booking can be closed only after it started (the server checks again).
  const [now] = useState(() => Date.now())
  const canWork = session.can('requests:write')
  const detail = resource.data

  const act = async (body: Record<string, unknown>, done: string) => {
    setBusy(true)
    try {
      const next = await endpoints.bookings.act(id, body)
      resource.set(next)
      setMessage('')
      setProposing(false)
      toast.success(done)
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  if (resource.loading) return <LoadingState />
  if (resource.error && !detail) return <ErrorState error={resource.error} onRetry={resource.reload} />
  if (!detail) return null

  const { booking } = detail
  const zone = booking.time_zone
  const when = (value: string | null) => formatInZone(value, zone, language)
  const range = `${when(booking.start_at)} – ${formatInZone(booking.end_at, zone, language, 'clock')}`
  const final = FINAL.includes(booking.status)
  const open = detail.openChange
  const typeName = detail.type?.translations[language]?.name || detail.type?.code || ''
  const minutes = Math.round((Date.parse(booking.end_at) - Date.parse(booking.start_at)) / 60_000)
  const started = Date.parse(booking.start_at) <= now

  const cancel = async () => {
    if (!(await confirm({ title: d.cancelTitle, body: d.cancelBody, confirmLabel: d.cancelConfirm, danger: true }))) return
    await act({ action: 'cancel', message }, d.cancelDone)
  }
  const revoke = async () => {
    if (!(await confirm({ title: d.revokeLinks, body: d.revokeLinksBody, confirmLabel: d.revokeLinks }))) return
    await act({ action: 'revoke_links' }, d.revoked)
  }

  return (
    <>
      <PageHeader title={booking.name} lead={<span className={styles.mono}>{booking.reference}</span>} back={{ to: '/bookings', label: d.back }} actions={<BookingStatusBadge status={booking.status} />} />
      <div className={page.detail}>
        <div className={page.detailMain}>
          <DetailPanel title={d.booking}>
            <dl className={styles.definitions}>
              <dt>{d.consultation}</dt>
              <dd>{typeName}</dd>
              <dt>{d.when}</dt>
              <dd>{range}</dd>
              <dt>{d.zone}</dt>
              <dd>{zone}</dd>
              <dt>{d.duration}</dt>
              <dd>{fill(d.minutes, { count: minutes })}</dd>
              <dt>{d.created}</dt>
              <dd>{formatDateTime(booking.created_at, language)}</dd>
              <dt>{d.language}</dt>
              <dd>{(t.languages as Record<string, string>)[booking.language] ?? booking.language}</dd>
            </dl>
            {booking.cancellation_note && <p className={styles.small}>{booking.cancellation_note}</p>}
          </DetailPanel>

          {open && (
            <DetailPanel title={d.changeTitle}>
              <div className={styles.stack}>
                <p>
                  {open.kind === 'cancel'
                    ? d.changeCancel
                    : open.initiator === 'customer'
                      ? fill(d.changeMove, { time: when(open.new_start_at) })
                      : fill(d.changeProposal, { time: when(open.new_start_at), until: when(open.expires_at) })}
                </p>
                {open.message && <p className={styles.muted}>{fill(d.changeWhy, { message: open.message })}</p>}
                {canWork && open.initiator === 'customer' && (
                  <>
                    <TextAreaField label={d.messageToCustomer} hint={d.messageHint} value={message} maxLength={600} rows={3} onChange={(event) => setMessage(event.target.value)} />
                    <div className={styles.rowButtons}>
                      <AdminButton variant="primary" loading={busy} onClick={() => void act({ action: 'approve', message }, d.approveDone)}>
                        {d.approve}
                      </AdminButton>
                      <AdminButton disabled={busy} onClick={() => void act({ action: 'reject', message }, d.rejectDone)}>
                        {d.reject}
                      </AdminButton>
                    </div>
                  </>
                )}
              </div>
            </DetailPanel>
          )}

          <DetailPanel title={d.actions}>
            {final ? (
              <p className={styles.muted}>{d.noActions}</p>
            ) : !canWork ? null : (
              <div className={styles.stack}>
                <TextAreaField label={d.messageToCustomer} hint={d.messageHint} value={message} maxLength={600} rows={3} onChange={(event) => setMessage(event.target.value)} />
                <div className={styles.rowButtons}>
                  {booking.status === 'pending' && (
                    <AdminButton variant="primary" loading={busy} onClick={() => void act({ action: 'confirm' }, d.confirmDone)}>
                      {d.confirm}
                    </AdminButton>
                  )}
                  {detail.next.includes('rescheduled') && !open && (
                    <AdminButton disabled={busy} onClick={() => setProposing((value) => !value)} aria-expanded={proposing}>
                      {d.propose}
                    </AdminButton>
                  )}
                  {detail.next.includes('completed') && (
                    <AdminButton disabled={busy || !started} onClick={() => void act({ action: 'complete' }, d.completeDone)} title={started ? undefined : d.notStarted}>
                      {d.complete}
                    </AdminButton>
                  )}
                  {detail.next.includes('no_show') && (
                    <AdminButton disabled={busy || !started} onClick={() => void act({ action: 'no_show' }, d.noShowDone)} title={started ? undefined : d.notStarted}>
                      {d.noShow}
                    </AdminButton>
                  )}
                  <AdminButton danger disabled={busy} onClick={() => void cancel()}>
                    {d.cancel}
                  </AdminButton>
                </div>
                {proposing && <Proposal id={id} busy={busy} zone={zone} onSend={(start) => void act({ action: 'propose', start, message }, d.proposeDone)} />}
              </div>
            )}
          </DetailPanel>

          <DetailPanel title={d.history}>
            <ol className={styles.timeline}>
              {[...detail.events].reverse().map((event) => (
                <li key={event.id} className={styles.timelineItem}>
                  <span>
                    {(d.historyEvents as Record<string, string>)[event.type] ?? event.type}
                    {event.fromStart && event.toStart ? ` · ${fill(d.from, { time: when(event.fromStart) })} ${fill(d.to, { time: when(event.toStart) })}` : ''}
                    {event.from && event.to && event.from !== event.to ? ` · ${b.statuses[event.from]} → ${b.statuses[event.to]}` : ''}
                  </span>
                  <span className={styles.timelineWhen}>
                    <time dateTime={event.at}>{formatDateTime(event.at, language)}</time> · {event.actorType === 'admin' && event.actor ? event.actor : d.actors[event.actorType]}
                  </span>
                </li>
              ))}
            </ol>
          </DetailPanel>
        </div>

        <div className={page.detailSide}>
          <DetailPanel title={d.customer}>
            <dl className={styles.definitions}>
              <dt>{d.name}</dt>
              <dd>{booking.name}</dd>
              <dt>{d.email}</dt>
              <dd>
                <a href={`mailto:${booking.email}?subject=${encodeURIComponent(booking.reference)}`}>{booking.email}</a>
              </dd>
              {booking.company && (
                <>
                  <dt>{d.company}</dt>
                  <dd>{booking.company}</dd>
                </>
              )}
              {booking.website && (
                <>
                  <dt>{d.website}</dt>
                  <dd>
                    <a href={booking.website} target="_blank" rel="noopener noreferrer">
                      {booking.website}
                    </a>
                  </dd>
                </>
              )}
              <dt>{d.quote}</dt>
              <dd>
                {detail.quote ? (
                  <Link to={`/quotes/${detail.quote.id}`}>{detail.quote.reference}</Link>
                ) : booking.related_reference ? (
                  fill(d.quoteMissing, { reference: booking.related_reference })
                ) : (
                  d.noQuote
                )}
              </dd>
            </dl>
            {booking.description && (
              <div>
                <h3 className={styles.cardTitleTight}>{d.message}</h3>
                <p className={styles.prose} style={{ whiteSpace: 'pre-wrap' }}>
                  {booking.description}
                </p>
              </div>
            )}
          </DetailPanel>

          <DetailPanel>
            <InternalNotes
              notes={detail.notes.map((note, index) => ({ id: index, author_email: note.author, body: note.body, created_at: note.created_at }))}
              canAdd={canWork}
              onAdd={async (body) => {
                const next = await endpoints.bookings.act(id, { action: 'note', text: body })
                resource.set(next)
                toast.success(d.noteDone)
              }}
            />
          </DetailPanel>

          <DetailPanel title={d.emails}>
            {detail.deliveries.length === 0 ? (
              <p className={styles.muted}>{d.emailsNone}</p>
            ) : (
              <ul className={page.miniList}>
                {detail.deliveries.map((delivery) => (
                  <li key={delivery.id}>
                    <span className={page.miniTop}>
                      <span>{(d.emailKinds as Record<string, string>)[delivery.kind] ?? delivery.kind}</span>
                      <span className={cx(styles.badge, delivery.status === 'failed' || delivery.status === 'bounced' ? styles.toneDanger : delivery.status === 'delivered' ? styles.toneSuccess : styles.toneNeutral)}>{(d.emailStates as Record<string, string>)[delivery.status] ?? delivery.status}</span>
                    </span>
                    <span className={cx(styles.muted, styles.small)}>{delivery.recipient}</span>
                  </li>
                ))}
              </ul>
            )}
          </DetailPanel>

          {canWork && (
            <DetailPanel>
              <p className={styles.small}>{fill(d.links, { count: detail.activeLinks })}</p>
              <AdminButton disabled={busy || detail.activeLinks === 0} onClick={() => void revoke()}>
                {d.revokeLinks}
              </AdminButton>
            </DetailPanel>
          )}
        </div>
      </div>
    </>
  )
}

/** Free times for a date, as the availability rules would offer them (the booking's own time is not in the way); one is chosen and proposed. */
function Proposal({ id, busy, zone, onSend }: { id: string; busy: boolean; zone: string; onSend: (start: string) => void }) {
  const t = useText()
  const d = t.booking.detail
  const language = useInterfaceLanguage()
  const group = useId()
  const [date, setDate] = useState('')
  const [days, setDays] = useState<FreeDay[] | null>(null)
  const [start, setStart] = useState<string | null>(null)
  const [failed, setFailed] = useState<unknown>(null)
  const config = useResource((signal) => endpoints.bookings.config(signal), [])
  const ownerConfirms = config.data?.settings.ownerChangeNeedsConfirmation ?? true

  useEffect(() => {
    if (!date) return
    const controller = new AbortController()
    void endpoints.bookings
      .days(id, date, date, controller.signal)
      .then((found) => {
        setDays(found)
        setFailed(null)
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setFailed(error)
      })
    return () => controller.abort()
  }, [id, date])

  const slots = date && days ? (days.find((day) => day.date === date)?.slots ?? []) : []
  return (
    <div className={styles.stack}>
      <h3 className={styles.cardTitleTight}>{d.proposeTitle}</h3>
      <p className={styles.hint}>{d.proposeLead}</p>
      <p className={styles.hint}>{ownerConfirms ? d.proposeNeedsConfirmation : d.proposeMoves}</p>
      <TextField
        label={d.proposeDate}
        type="date"
        value={date}
        onChange={(event) => {
          setDate(event.target.value)
          setDays(null)
          setStart(null)
        }}
      />
      {date && !days && !failed && <p className={styles.muted}>{d.proposeLoading}</p>}
      {failed !== null && <ErrorState error={failed} level={3} />}
      {date && days && (
        <fieldset className={styles.fieldsetReset}>
          <legend className={styles.label}>{d.proposeTimes}</legend>
          {slots.length === 0 ? (
            <p className={styles.muted}>{d.proposeNone}</p>
          ) : (
            <div className={styles.rowButtons} role="radiogroup" aria-label={d.proposeTimes}>
              {slots.map((slot) => (
                <label key={slot.start} className={cx(styles.badge, start === slot.start ? styles.toneAccent : styles.toneNeutral)}>
                  <input type="radio" name={group} value={slot.start} checked={start === slot.start} onChange={() => setStart(slot.start)} className={styles.srOnly} />
                  {formatInZone(slot.start, zone, language, 'clock')}
                </label>
              ))}
            </div>
          )}
        </fieldset>
      )}
      <div className={styles.formActions}>
        <AdminButton variant="primary" loading={busy} disabled={!start} onClick={() => start && onSend(start)}>
          {d.proposeSend}
        </AdminButton>
      </div>
    </div>
  )
}
