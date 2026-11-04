import { Fragment, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import * as endpoints from '../api/endpoints'
import type { InterfaceLanguage, ThemePreference } from '../api/types'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { SelectField, TextField } from '../components/form'
import { Icon } from '../components/Icon'
import { DetailPanel, PageHeader, TabPanel, Tabs } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, formatNumber, useInterfaceLanguage, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { useSession } from '../session/SessionProvider'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import { NotificationTypes } from './NotificationsPage'


function Profile() {
  const t = useText()
  const language = useInterfaceLanguage()
  const resource = useResource((signal) => endpoints.settings.profile(signal).then((answer) => answer.data.profile), [])
  const p = t.settings.profile
  if (resource.loading) return <LoadingState />
  if (resource.error || !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />
  const me = resource.data
  return (
    <DetailPanel title={p.title}>
      <dl className={styles.definitions}>
        <dt>{p.email}</dt>
        <dd>{me.email}</dd>
        <dt>{p.role}</dt>
        <dd>
          {p.roles[me.role]}
          <br />
          <span className={styles.muted}>{p.roleHelp[me.role]}</span>
        </dd>
        <dt>{p.lastSignIn}</dt>
        <dd>{me.lastLoginAt ? formatDateTime(me.lastLoginAt, language) : p.never}</dd>
        <dt>{p.created}</dt>
        <dd>{formatDateTime(me.createdAt, language)}</dd>
      </dl>
    </DetailPanel>
  )
}

function NotificationPreferences() {
  const t = useText()
  const session = useSession()
  const resource = useResource((signal) => endpoints.notifications.overview(signal).then((answer) => answer.data), [])
  if (resource.loading) return <LoadingState />
  if (resource.error || !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />
  return (
    <DetailPanel title={t.settings.preferences.notifications}>
      <NotificationTypes data={resource.data} canChange={session.can('system:write')} onSaved={resource.reload} />
    </DetailPanel>
  )
}

function Preferences() {
  const t = useText()
  const toast = useToast()
  const session = useSession()
  const p = t.settings.preferences
  const [language, setLanguage] = useState<string>(session.user.preferences.language ?? '')
  const [theme, setTheme] = useState<string>(session.user.preferences.theme ?? '')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      await session.savePreferences({ language: (language || null) as InterfaceLanguage | null, theme: (theme || null) as ThemePreference | null })
      toast.success(p.saved)
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.stackLg}>
      <DetailPanel title={p.title}>
        <form className={styles.stack} onSubmit={(event) => void submit(event)}>
          <SelectField label={p.language} hint={p.languageHelp} value={language} onChange={(event) => setLanguage(event.target.value)} options={[{ value: '', label: p.languageBrowser }, ...session.meta.interfaceLanguages.map((code) => ({ value: code, label: (t.languages as Record<string, string>)[code] }))]} />
          <SelectField label={p.theme} hint={p.themeHelp} value={theme} onChange={(event) => setTheme(event.target.value)} options={[{ value: '', label: p.themeSystem }, { value: 'light', label: p.themeLight }, { value: 'dark', label: p.themeDark }]} />
          <div className={styles.formActions}>
            <AdminButton type="submit" variant="primary" loading={busy} loadingLabel={t.common.saving}>
              {t.common.save}
            </AdminButton>
          </div>
        </form>
      </DetailPanel>
      <NotificationPreferences />
    </div>
  )
}

function Security() {
  const t = useText()
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const session = useSession()
  const s = t.settings.security
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [repeat, setRepeat] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const sessions = useResource((signal) => endpoints.settings.sessions(signal).then((answer) => answer.data), [])

  const change = async (event: FormEvent) => {
    event.preventDefault()
    if (next !== repeat) return setErrors({ repeat: s.mismatch })
    setErrors({})
    setBusy(true)
    try {
      const { data } = await endpoints.settings.changePassword(current, next)
      setCurrent('')
      setNext('')
      setRepeat('')
      toast.success(data.otherSessionsClosed > 0 ? fill(s.changedOthers, { count: data.otherSessionsClosed }) : s.changed)
      sessions.reload()
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) setErrors({ ...(error.fields.current ? { current: s.currentWrong } : {}), ...(error.fields.next ? { next: s.passwordHelp } : {}) })
      else toast.error(describeError(t, error))
    } finally {
      setBusy(false)
    }
  }

  const end = async (id: string, isCurrent: boolean) => {
    if (isCurrent && !(await confirm({ title: s.endThisTitle, body: s.endThisBody }))) return
    try {
      await endpoints.settings.endSession(id)
      if (isCurrent) return void session.signOut()
      toast.success(s.ended)
      sessions.reload()
    } catch (error) {
      toast.error(describeError(t, error))
    }
  }

  const endOthers = async () => {
    try {
      const { data } = await endpoints.settings.endOtherSessions()
      toast.success(fill(s.endedOthers, { count: data.closed }))
      sessions.reload()
    } catch (error) {
      toast.error(describeError(t, error))
    }
  }

  const others = sessions.data?.filter((entry) => !entry.current) ?? []

  return (
    <div className={styles.stackLg}>
      <DetailPanel title={s.passwordTitle}>
        <form className={styles.stack} onSubmit={(event) => void change(event)} noValidate>
          <TextField label={s.current} type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} error={errors.current} required />
          <TextField label={s.next} type="password" autoComplete="new-password" hint={s.passwordHelp} value={next} onChange={(event) => setNext(event.target.value)} error={errors.next} required />
          <TextField label={s.repeat} type="password" autoComplete="new-password" value={repeat} onChange={(event) => setRepeat(event.target.value)} error={errors.repeat} required />
          <div className={styles.formActions}>
            <AdminButton type="submit" variant="primary" loading={busy} loadingLabel={s.submitting} disabled={!current || !next || !repeat}>
              {s.submit}
            </AdminButton>
          </div>
        </form>
      </DetailPanel>

      <DetailPanel title={s.sessionsTitle}>
        <p className={styles.hint}>{fill(s.sessionsHelp, { minutes: session.meta.idleMinutes, hours: session.meta.sessionHours })}</p>
        {sessions.loading ? (
          <LoadingState />
        ) : sessions.error || !sessions.data ? (
          <ErrorState error={sessions.error} onRetry={sessions.reload} />
        ) : (
          <div className={styles.stack}>
            <ul className={page.items}>
              {sessions.data.map((entry) => (
                <li key={entry.id} className={page.item}>
                  <span className={styles.spread}>
                    <span className={page.itemTitle}>{entry.browser || s.unknownBrowser}</span>
                    {entry.current && <span className={`${styles.badge} ${styles.toneInfo}`}>{s.thisOne}</span>}
                  </span>
                  <span className={`${styles.muted} ${styles.small}`}>
                    {fill(s.since, { when: formatDateTime(entry.createdAt, language) })} · {fill(s.lastUsed, { when: formatDateTime(entry.lastSeenAt, language) })}
                  </span>
                  <span>
                    <AdminButton onClick={() => void end(entry.id, entry.current)}>{s.end}</AdminButton>
                  </span>
                </li>
              ))}
            </ul>
            <div className={styles.formActions}>
              <AdminButton onClick={() => void endOthers()} disabled={others.length === 0}>
                {s.endOthers}
              </AdminButton>
              {others.length === 0 && <span className={styles.hint}>{s.noOthers}</span>}
            </div>
          </div>
        )}
      </DetailPanel>
    </div>
  )
}

function System() {
  const t = useText()
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const s = t.settings.system
  const resource = useResource((signal) => endpoints.system.get(signal).then((answer) => answer.data), [])
  const [busy, setBusy] = useState<'maintenance' | 'publish' | null>(null)

  const maintenance = async () => {
    if (!(await confirm({ title: s.maintenanceTitle, body: s.maintenanceBody }))) return
    setBusy('maintenance')
    try {
      const { data } = await endpoints.system.maintenance()
      toast.success(fill(s.maintenanceDone, { sessions: data.expiredSessions, inquiries: data.inquiries, quotes: data.quoteRequests, deliveries: data.deliveries }))
      resource.reload()
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(null)
    }
  }

  const publish = async () => {
    if (!(await confirm({ title: s.publishTitle, body: s.publishBody }))) return
    setBusy('publish')
    try {
      await endpoints.system.publish()
      toast.success(s.published)
      resource.reload()
    } catch (error) {
      toast.error(describeError(t, error))
    } finally {
      setBusy(null)
    }
  }

  if (resource.loading) return <LoadingState />
  if (resource.error || !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />
  const data = resource.data
  const show = (value: unknown): string => (value === null || value === undefined ? t.common.noValue : typeof value === 'object' ? JSON.stringify(value) : String(value))

  return (
    <div className={styles.stackLg}>
      <DetailPanel title={s.server}>
        <dl className={styles.definitions}>
          <dt>{s.schema}</dt>
          <dd>{fill(s.schemaValue, { current: data.migrations.current, latest: data.migrations.latest })}</dd>
          <dt>{s.running}</dt>
          <dd>{formatDateTime(new Date(data.stats.startedAt).toISOString(), language)}</dd>
          <dt>{s.requests}</dt>
          <dd>{formatNumber(data.stats.requests, language)}</dd>
          <dt>{s.clientErrors}</dt>
          <dd>{formatNumber(data.stats.clientErrors, language)}</dd>
          <dt>{s.serverErrors}</dt>
          <dd>{formatNumber(data.stats.serverErrors, language)}</dd>
          <dt>{s.rateLimited}</dt>
          <dd>{formatNumber(data.stats.rateLimited, language)}</dd>
        </dl>
      </DetailPanel>

      <DetailPanel title={s.configuration}>
        <dl className={page.configList}>
          {Object.entries(data.config).map(([key, value]) => (
            <Fragment key={key}>
              <dt>{key}</dt>
              <dd>{show(value)}</dd>
            </Fragment>
          ))}
        </dl>
      </DetailPanel>

      <DetailPanel title={s.failed}>
        {data.failedDeliveries.length === 0 ? (
          <p className={styles.muted}>{s.noFailed}</p>
        ) : (
          <ul className={page.items}>
            {data.failedDeliveries.map((row) => (
              <li key={row.id} className={page.item}>
                <span className={styles.spread}>
                  <span className={page.itemTitle}>{(t.notifications.log.kinds as Record<string, string>)[row.kind] ?? row.kind}</span>
                  <span className={styles.muted}>{formatDateTime(row.updatedAt, language)}</span>
                </span>
                {row.lastError && <span className={page.deliveryError}>{row.lastError}</span>}
              </li>
            ))}
          </ul>
        )}
      </DetailPanel>

      <DetailPanel title={s.audit}>
        <ul className={page.miniList}>
          {data.audit.map((row) => (
            <li key={row.id}>
              <span>
                {(t.activity.actions as Record<string, string>)[row.action]?.replace(/\s*\{\w+\}/g, '') ?? row.action}
                {row.entity_id ? ` · ${row.entity_type}` : ''}
              </span>
              <span className={styles.muted}>
                {formatDateTime(row.created_at, language)}
                {row.actor ? ` · ${row.actor}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </DetailPanel>

      <DetailPanel title={s.housekeeping}>
        <div className={styles.stack}>
          <p className={styles.hint}>{s.maintenanceHelp}</p>
          <div className={styles.formActions}>
            <AdminButton onClick={() => void maintenance()} loading={busy === 'maintenance'} loadingLabel={t.common.saving}>
              <Icon name="refresh" />
              {s.maintenance}
            </AdminButton>
          </div>
          <p className={styles.hint}>{data.hasDeployHook ? s.publishHelp : s.publishNone}</p>
          <div className={styles.formActions}>
            <AdminButton onClick={() => void publish()} disabled={!data.hasDeployHook} loading={busy === 'publish'} loadingLabel={t.common.saving}>
              <Icon name="external" />
              {s.publish}
            </AdminButton>
          </div>
        </div>
      </DetailPanel>
    </div>
  )
}

/** The administrator's own settings, and (for an administrator) the server's state and the two controls that act on it. */
export function SettingsPage() {
  const t = useText()
  const session = useSession()
  const [params, setParams] = useSearchParams()
  type TabId = 'profile' | 'preferences' | 'security' | 'system'
  const tabs: TabId[] = session.can('system:read') ? ['profile', 'preferences', 'security', 'system'] : ['profile', 'preferences', 'security']
  const requested = params.get('tab') as TabId | null
  const tab: TabId = requested && tabs.includes(requested) ? requested : 'profile'

  return (
    <>
      <PageHeader title={t.settings.title} lead={t.settings.lead} />
      <Tabs idBase="settings" label={t.settings.title} value={tab} onChange={(id) => setParams({ tab: id }, { replace: true })} tabs={tabs.map((id) => ({ id, label: t.settings.tabs[id] }))} />
      <div className={page.tabPanelGap}>
        <TabPanel id="profile" idBase="settings" active={tab === 'profile'}>
          <Profile />
        </TabPanel>
        <TabPanel id="preferences" idBase="settings" active={tab === 'preferences'}>
          <Preferences />
        </TabPanel>
        <TabPanel id="security" idBase="settings" active={tab === 'security'}>
          <Security />
        </TabPanel>
        {tabs.includes('system') && (
          <TabPanel id="system" idBase="settings" active={tab === 'system'}>
            <System />
          </TabPanel>
        )}
      </div>
    </>
  )
}
