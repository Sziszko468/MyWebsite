import { useState } from 'react'
import { LANGUAGES } from '../../i18n/config'
import { cx } from '../../utils/cx'
import { ApiError } from '../api/client'
import * as endpoints from '../api/endpoints'
import type { BookingConfig, BookingSettings, ConsultationType, Lang, ScheduleException, WeeklyHour } from '../api/bookingTypes'
import { AdminButton } from '../components/AdminButton'
import { SelectField, SwitchField, TextAreaField, TextField } from '../components/form'
import { DetailPanel, PageHeader, Tabs } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import { describeError, fieldErrors } from '../lib/errors'
import { useSession } from '../session/SessionProvider'
import styles from '../styles/ui.module.scss'

type Tab = 'settings' | 'types' | 'hours'

/**
 * The owner's set-up of the consultation booking: the settings (the master switch, the time zone, the rules about confirming and changing), the
 * consultation types, and the weekly hours and exceptions. Nothing is offered to visitors until the owner has switched booking on, chosen a zone, switched
 * on a type and given it hours; the page says which of those is still missing. Only an administrator can change anything here.
 */
export function BookingSetupPage() {
  const t = useText()
  const s = t.booking.setup
  const session = useSession()
  const [tab, setTab] = useState<Tab>('settings')
  const resource = useResource((signal) => endpoints.bookings.config(signal), [])
  const canEdit = session.can('system:write')
  const config = resource.data

  if (resource.loading) return <LoadingState />
  if (resource.error && !config) return <ErrorState error={resource.error} onRetry={resource.reload} />
  if (!config) return null
  const tabs = [
    { id: 'settings', label: s.tabs.settings },
    { id: 'types', label: s.tabs.types },
    { id: 'hours', label: s.tabs.hours },
  ] as const

  return (
    <>
      <PageHeader title={s.title} lead={s.lead} back={{ to: '/bookings', label: s.back }} />
      <div className={styles.stackLg}>
        {config.closedReasons.length > 0 && (
          <div className={cx(styles.notice, styles.noticeWarning)} role="status">
            <strong>{t.booking.closed.title}</strong>
            <ul>
              {config.closedReasons.map((reason) => (
                <li key={reason}>{t.booking.closed.reasons[reason]}</li>
              ))}
            </ul>
          </div>
        )}
        {!canEdit && <p className={styles.hint}>{s.readOnly}</p>}
        <Tabs tabs={tabs} value={tab} onChange={(id) => setTab(id as Tab)} label={s.tabs.label} idBase="booking-setup" />
        <div role="tabpanel" id={`booking-setup-panel-${tab}`} aria-labelledby={`booking-setup-tab-${tab}`}>
          {tab === 'settings' && <SettingsTab config={config} canEdit={canEdit} onSaved={resource.set} />}
          {tab === 'types' && <TypesTab config={config} canEdit={canEdit} onSaved={resource.reload} />}
          {tab === 'hours' && <HoursTab config={config} canEdit={canEdit} onSaved={resource.set} />}
        </div>
      </div>
    </>
  )
}

// ---- settings ----------------------------------------------------------------------------------------------------------------------

const INTEGERS = ['slotStepMinutes', 'bufferMinutes', 'minNoticeHours', 'horizonDays', 'changeMinNoticeHours', 'proposalValidHours'] as const

function SettingsTab({ config, canEdit, onSaved }: { config: BookingConfig; canEdit: boolean; onSaved: (config: BookingConfig) => void }) {
  const t = useText()
  const language = useInterfaceLanguage()
  const toast = useToast()
  const g = t.booking.setup.settings
  const [form, setForm] = useState<BookingSettings>(config.settings)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const set = <K extends keyof BookingSettings>(key: K, value: BookingSettings[K]) => setForm((current) => ({ ...current, [key]: value }))
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      const { configuredAt: _saved, ...body } = form
      onSaved(await endpoints.bookings.saveSettings({ ...body, timeZone: form.timeZone ?? '' }))
      toast.success(g.saved)
    } catch (error) {
      setErrors(fieldErrors(t, error))
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const number = (key: (typeof INTEGERS)[number], label: string, hint?: string) => (
    <TextField label={label} hint={hint} type="number" inputMode="numeric" min={0} value={String(form[key])} disabled={!canEdit} error={errors[key]} onChange={(event) => set(key, Number(event.target.value))} />
  )

  return (
    <DetailPanel>
      <form
        className={styles.stackLg}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        {config.settings.configuredAt === null && <p className={styles.notice}>{t.booking.setup.startingValues}</p>}
        <SwitchField label={g.enabled} hint={g.enabledHint} checked={form.enabled} disabled={!canEdit} onChange={(value) => set('enabled', value)} />
        <div>
          <TextField label={g.timeZone} hint={g.timeZoneHint} list="booking-zones" value={form.timeZone ?? ''} disabled={!canEdit} error={errors.timeZone} autoComplete="off" onChange={(event) => set('timeZone', event.target.value || null)} />
          <datalist id="booking-zones">
            {zones.map((zone) => (
              <option key={zone} value={zone} />
            ))}
          </datalist>
        </div>
        <SelectField
          label={g.confirmation}
          value={form.confirmation}
          disabled={!canEdit}
          options={[
            { value: 'automatic', label: g.confirmationAutomatic },
            { value: 'manual', label: g.confirmationManual },
          ]}
          onChange={(event) => set('confirmation', event.target.value as BookingSettings['confirmation'])}
        />
        <div className={styles.grid2}>
          {number('slotStepMinutes', g.slotStep, g.slotStepHint)}
          {number('bufferMinutes', g.buffer, g.bufferHint)}
          {number('minNoticeHours', g.minNotice, g.minNoticeHint)}
          {number('horizonDays', g.horizon, g.horizonHint)}
        </div>
        <fieldset className={styles.fieldsetReset}>
          <legend className={styles.cardTitleTight}>{g.changesTitle}</legend>
          <div className={styles.stack}>
            <SwitchField label={g.allowCancel} checked={form.allowCancelRequests} disabled={!canEdit} onChange={(value) => set('allowCancelRequests', value)} />
            <SwitchField label={g.allowReschedule} checked={form.allowRescheduleRequests} disabled={!canEdit} onChange={(value) => set('allowRescheduleRequests', value)} />
            {number('changeMinNoticeHours', g.changeNotice)}
            <SwitchField label={g.approval} hint={g.approvalHint} checked={form.approvalRequired} disabled={!canEdit} onChange={(value) => set('approvalRequired', value)} />
            <SwitchField label={g.ownerConfirmation} hint={g.ownerConfirmationHint} checked={form.ownerChangeNeedsConfirmation} disabled={!canEdit} onChange={(value) => set('ownerChangeNeedsConfirmation', value)} />
            {number('proposalValidHours', g.proposalHours)}
          </div>
        </fieldset>
        <p className={styles.hint}>{config.settings.configuredAt ? fill(g.lastSaved, { time: formatDateTime(config.settings.configuredAt, language) }) : g.neverSaved}</p>
        {canEdit && (
          <div className={styles.formActions}>
            <AdminButton type="submit" variant="primary" loading={busy} loadingLabel={t.common.saving}>
              {g.save}
            </AdminButton>
          </div>
        )}
      </form>
    </DetailPanel>
  )
}

// ---- the types ---------------------------------------------------------------------------------------------------------------------

function TypesTab({ config, canEdit, onSaved }: { config: BookingConfig; canEdit: boolean; onSaved: () => void }) {
  const t = useText()
  const g = t.booking.setup.types
  const [adding, setAdding] = useState(false)
  return (
    <div className={styles.stackLg}>
      <p className={styles.hint}>{g.lead}</p>
      {config.types.map((type) => (
        <TypeEditor key={type.id} type={type} canEdit={canEdit} onSaved={onSaved} />
      ))}
      {canEdit &&
        (adding ? (
          <TypeEditor
            type={null}
            canEdit
            onSaved={() => {
              setAdding(false)
              onSaved()
            }}
            onCancel={() => setAdding(false)}
          />
        ) : (
          <div className={styles.formActions}>
            <AdminButton onClick={() => setAdding(true)}>{g.add}</AdminButton>
          </div>
        ))}
    </div>
  )
}

const BLANK: Record<Lang, { name: string; description: string }> = { hu: { name: '', description: '' }, en: { name: '', description: '' }, nl: { name: '', description: '' } }

function TypeEditor({ type, canEdit, onSaved, onCancel }: { type: ConsultationType | null; canEdit: boolean; onSaved: () => void; onCancel?: () => void }) {
  const t = useText()
  const toast = useToast()
  const g = t.booking.setup.types
  const [code, setCode] = useState('')
  const [duration, setDuration] = useState(type?.durationMinutes === null || type === null ? '' : String(type.durationMinutes))
  const [enabled, setEnabled] = useState(type?.enabled ?? false)
  const [order, setOrder] = useState(String(type?.sortOrder ?? 0))
  const [words, setWords] = useState(type?.translations ?? BLANK)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      const body = { durationMinutes: duration === '' ? null : Number(duration), enabled, sortOrder: Number(order) || 0, translations: words }
      if (type) await endpoints.bookings.saveType(type.code, body)
      else await endpoints.bookings.createType({ ...body, code })
      toast.success(type ? g.saved : g.created)
      onSaved()
    } catch (error) {
      setErrors(fieldErrors(t, error))
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailPanel title={type ? type.translations.en.name || type.code : g.addTitle} actions={type ? <span className={cx(styles.badge, type.enabled ? styles.toneSuccess : styles.toneNeutral)}>{type.enabled ? g.on : g.off}</span> : undefined}>
      <form
        className={styles.stackLg}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        {type ? (
          <p className={styles.hint} data-testid="type-readiness" data-complete={type.complete}>
            {type.complete ? g.complete : g.incomplete}
          </p>
        ) : <TextField label={g.code} hint={g.codeHint} value={code} error={errors.code} autoComplete="off" onChange={(event) => setCode(event.target.value.toLowerCase())} />}
        <div className={styles.grid2}>
          <TextField label={g.duration} hint={duration === '' ? g.durationNone : undefined} type="number" inputMode="numeric" min={5} max={480} value={duration} disabled={!canEdit} error={errors.durationMinutes} onChange={(event) => setDuration(event.target.value)} />
          <TextField label={g.order} type="number" inputMode="numeric" min={0} value={order} disabled={!canEdit} error={errors.sortOrder} onChange={(event) => setOrder(event.target.value)} />
        </div>
        <SwitchField label={g.enabled} checked={enabled} disabled={!canEdit} onChange={setEnabled} />
        {LANGUAGES.map((lang) => {
          const name = (t.languages as Record<string, string>)[lang] ?? lang
          return (
            <div key={lang} className={styles.stack}>
              <TextField label={fill(g.name, { language: name })} value={words[lang].name} disabled={!canEdit} error={errors[`translations.${lang}.name`]} maxLength={80} onChange={(event) => setWords({ ...words, [lang]: { ...words[lang], name: event.target.value } })} />
              <TextAreaField label={fill(g.description, { language: name })} value={words[lang].description} rows={3} disabled={!canEdit} error={errors[`translations.${lang}.description`]} maxLength={600} onChange={(event) => setWords({ ...words, [lang]: { ...words[lang], description: event.target.value } })} />
            </div>
          )
        })}
        {canEdit && (
          <div className={styles.formActions}>
            {onCancel && <AdminButton onClick={onCancel}>{g.cancel}</AdminButton>}
            <AdminButton type="submit" variant="primary" loading={busy} loadingLabel={t.common.saving}>
              {type ? g.save : g.create}
            </AdminButton>
          </div>
        )}
      </form>
    </DetailPanel>
  )
}

// ---- weekly hours and exceptions -----------------------------------------------------------------------------------------------------

function HoursTab({ config, canEdit, onSaved }: { config: BookingConfig; canEdit: boolean; onSaved: (config: BookingConfig) => void }) {
  const t = useText()
  const toast = useToast()
  const h = t.booking.setup.hours
  const [hours, setHours] = useState<WeeklyHour[]>(config.hours)
  const [exceptions, setExceptions] = useState<ScheduleException[]>(config.exceptions)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const typeOptions = [{ value: '', label: h.allTypes }, ...config.types.map((type) => ({ value: type.code, label: type.translations.en.name || type.code }))]

  const changeHour = (index: number, patch: Partial<WeeklyHour>) => {
    setHours((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)))
    setDirty(true)
  }
  const changeException = (index: number, patch: Partial<ScheduleException>) => {
    setExceptions((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)))
    setDirty(true)
  }
  const words = t.services.errors as Record<string, string>
  const messageFor = (path: string): string | undefined => (errors[path] ? (words[errors[path]] ?? words.invalid) : undefined)

  const save = async () => {
    setBusy(true)
    setErrors({})
    try {
      const body = {
        hours: hours.map((row) => ({ weekday: row.weekday, start: row.start, end: row.end, type: row.type || null })),
        exceptions: exceptions.map((row) => ({ kind: row.kind, startDate: row.startDate, endDate: row.kind === 'open' ? row.startDate : row.endDate, start: row.start || null, end: row.end || null, label: row.label || null })),
      }
      const next = await endpoints.bookings.saveHours(body)
      onSaved(next)
      setHours(next.hours)
      setExceptions(next.exceptions)
      setDirty(false)
      toast.success(h.saved)
    } catch (error) {
      // The codes the server gave, by the path of the row and the field; each is worded where it belongs.
      setErrors(error instanceof ApiError ? error.fields : {})
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.stackLg}>
      <DetailPanel title={h.weeklyTitle}>
        <p className={styles.hint}>{h.weeklyLead}</p>
        {hours.length === 0 && <p className={styles.muted}>{h.none}</p>}
        {h.weekdays.map((dayName, dayIndex) => {
          const weekday = dayIndex + 1
          const rows = hours.map((row, index) => ({ row, index })).filter(({ row }) => row.weekday === weekday)
          return (
            <fieldset key={weekday} className={styles.fieldsetReset}>
              <legend className={styles.cardTitleTight}>{dayName}</legend>
              <div className={styles.stack}>
                {rows.map(({ row, index }) => (
                  <div key={row.id || index} className={styles.grid2}>
                    <TextField label={h.from} type="time" value={row.start} disabled={!canEdit} error={messageFor(`hours.${index}.start`)} onChange={(event) => changeHour(index, { start: event.target.value })} />
                    <TextField label={h.to} type="time" value={row.end} disabled={!canEdit} error={messageFor(`hours.${index}.end`)} onChange={(event) => changeHour(index, { end: event.target.value })} />
                    <SelectField label={h.appliesTo} value={row.type ?? ''} options={typeOptions} disabled={!canEdit} error={messageFor(`hours.${index}.type`)} onChange={(event) => changeHour(index, { type: event.target.value || null })} />
                    {canEdit && (
                      <div className={styles.formActions}>
                        <AdminButton
                          onClick={() => {
                            setHours((current) => current.filter((_, at) => at !== index))
                            setDirty(true)
                          }}
                        >
                          {h.remove}
                        </AdminButton>
                      </div>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <div>
                    <AdminButton
                      onClick={() => {
                        setHours((current) => [...current, { id: '', type: null, weekday, start: '09:00', end: '17:00' }])
                        setDirty(true)
                      }}
                    >
                      {h.addWindow}
                    </AdminButton>
                  </div>
                )}
              </div>
            </fieldset>
          )
        })}
      </DetailPanel>

      <DetailPanel title={h.exceptionsTitle}>
        <p className={styles.hint}>{h.exceptionsLead}</p>
        <p className={styles.hint}>{h.timeNote}</p>
        {exceptions.length === 0 && <p className={styles.muted}>{h.noExceptions}</p>}
        {exceptions.map((row, index) => (
          <div key={row.id || index} className={styles.stack}>
            <div className={styles.grid2}>
              <SelectField
                label={h.kind}
                value={row.kind}
                disabled={!canEdit}
                options={[
                  { value: 'closed', label: h.kinds.closed },
                  { value: 'open', label: h.kinds.open },
                ]}
                error={messageFor(`exceptions.${index}.kind`)}
                onChange={(event) => changeException(index, { kind: event.target.value as ScheduleException['kind'] })}
              />
              <TextField label={row.kind === 'open' ? h.date : h.startDate} type="date" value={row.startDate} disabled={!canEdit} error={messageFor(`exceptions.${index}.startDate`)} onChange={(event) => changeException(index, { startDate: event.target.value, endDate: row.kind === 'open' || !row.endDate || row.endDate < event.target.value ? event.target.value : row.endDate })} />
              {row.kind === 'closed' && <TextField label={h.endDate} type="date" value={row.endDate} min={row.startDate} disabled={!canEdit} error={messageFor(`exceptions.${index}.endDate`)} onChange={(event) => changeException(index, { endDate: event.target.value })} />}
              <TextField label={row.kind === 'open' ? h.from : h.partFrom} type="time" value={row.start ?? ''} disabled={!canEdit} error={messageFor(`exceptions.${index}.start`)} onChange={(event) => changeException(index, { start: event.target.value || null })} />
              <TextField label={row.kind === 'open' ? h.to : h.partTo} type="time" value={row.end ?? ''} disabled={!canEdit} error={messageFor(`exceptions.${index}.end`)} onChange={(event) => changeException(index, { end: event.target.value || null })} />
              <TextField label={h.label} value={row.label ?? ''} maxLength={120} disabled={!canEdit} onChange={(event) => changeException(index, { label: event.target.value || null })} />
            </div>
            {canEdit && (
              <div>
                <AdminButton
                  onClick={() => {
                    setExceptions((current) => current.filter((_, at) => at !== index))
                    setDirty(true)
                  }}
                >
                  {h.remove}
                </AdminButton>
              </div>
            )}
          </div>
        ))}
        {canEdit && (
          <div>
            <AdminButton
              onClick={() => {
                setExceptions((current) => [...current, { id: '', kind: 'closed', startDate: '', endDate: '', start: null, end: null, label: null }])
                setDirty(true)
              }}
            >
              {h.addException}
            </AdminButton>
          </div>
        )}
      </DetailPanel>

      {canEdit && (
        <div className={styles.formActions}>
          {dirty && <span className={styles.muted}>{h.unsaved}</span>}
          <AdminButton variant="primary" loading={busy} loadingLabel={t.common.saving} onClick={() => void save()}>
            {h.save}
          </AdminButton>
        </div>
      )}
    </div>
  )
}
