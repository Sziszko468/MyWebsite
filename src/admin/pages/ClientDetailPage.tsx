import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { cx } from '../../utils/cx'
import { ApiError } from '../api/client'
import { clients as api, PROJECT_CATEGORIES, type ClientDetail } from '../api/clients'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { CheckField, SelectField, TextField } from '../components/form'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import page from '../styles/pages.module.scss'
import styles from '../styles/ui.module.scss'
import { ClientStatusBadge } from './ClientsPage'

type Action = 'disable' | 'enable' | 'revoke_sessions' | 'send_link' | 'clear_deletion_request'

/** One customer: the account and what the owner can do to it, which records are theirs, their projects and the history of the account. */
export function ClientDetailPage() {
  const { id = '' } = useParams()
  const t = useText()
  const c = t.clients
  const d = c.detail
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const resource = useResource((signal) => api.get(id, signal), [id])
  const [busy, setBusy] = useState<string | null>(null)

  const fail = (error: unknown) => toast.error(error instanceof ApiError ? error.message : String(error))

  async function act(action: Action) {
    if (action === 'disable' && !(await confirm({ title: d.actions.disable, body: d.confirmDisable, confirmLabel: d.actions.disable, danger: true }))) return
    if (action === 'revoke_sessions' && !(await confirm({ title: d.actions.revoke_sessions, body: d.confirmRevoke, confirmLabel: d.actions.revoke_sessions }))) return
    setBusy(action)
    try {
      const result = await api.act(id, action)
      toast.success(action === 'revoke_sessions' ? fill(d.done.revoke_sessions, { count: result.sessionsClosed ?? 0 }) : d.done[action])
      resource.reload()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }

  async function link(type: 'quote_request' | 'booking', recordId: string) {
    setBusy(`link-${recordId}`)
    try {
      await api.link(id, type, recordId)
      toast.success(d.linked)
      resource.reload()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }

  async function unlink(linkId: string) {
    if (!(await confirm({ title: d.unlink, body: d.confirmUnlink, confirmLabel: d.unlink, danger: true }))) return
    setBusy(`unlink-${linkId}`)
    try {
      await api.unlink(id, linkId)
      toast.success(d.unlinked)
      resource.reload()
    } catch (error) {
      fail(error)
    } finally {
      setBusy(null)
    }
  }

  // ---- a new project
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'website', quoteRequestId: '', startedOn: '', expectedOn: '', notify: true })
  const [errors, setErrors] = useState<Record<string, string>>({})
  async function createProject(event: FormEvent) {
    event.preventDefault()
    setErrors({})
    setBusy('project')
    try {
      const made = await api.createProject(id, { name: form.name.trim(), category: form.category, quoteRequestId: form.quoteRequestId || undefined, startedOn: form.startedOn || undefined, expectedOn: form.expectedOn || undefined, notify: form.notify })
      toast.success(c.project.new.done)
      void navigate(`/client-projects/${made.id}`)
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const reason = String(error.details.reason ?? '') as keyof typeof c.project.new.reasons
        toast.error(c.project.new.reasons[reason] ?? error.message)
      } else if (error instanceof ApiError && error.status === 422) {
        setErrors(Object.fromEntries(Object.entries(error.fields).map(([field, code]) => [field, code === 'required' ? c.project.required : c.project.invalid])))
      } else fail(error)
    } finally {
      setBusy(null)
    }
  }

  if (resource.loading) return <LoadingState />
  if (resource.error && !resource.data) return <ErrorState error={resource.error} onRetry={resource.reload} />
  const data: ClientDetail = resource.data!
  const customer = data.customer
  const requestLinks = data.links.filter((link) => link.type === 'quote_request')

  return (
    <>
      <PageHeader title={customer.name || customer.email} lead={customer.name ? customer.email : customer.company} back={{ to: '/clients', label: d.back }} actions={<AdminButton variant="secondary" to={`/communications?customerId=${customer.id}`}>{t.communications.title}</AdminButton>} />
      <div className={styles.stackLg}>
        {customer.deletionRequestedAt && (
          <div className={cx(styles.notice, styles.noticeDanger)} role="status">
            {fill(d.deletionRequested, { date: formatDateTime(customer.deletionRequestedAt, language) })}
          </div>
        )}

        <DetailPanel title={d.account}>
          <dl className={styles.definitions}>
            <div>
              <dt>{d.status}</dt>
              <dd>
                <ClientStatusBadge status={customer.status} label={d.statuses[customer.status]} />
              </dd>
            </div>
            <div>
              <dt>{d.verified}</dt>
              <dd>{customer.verifiedAt ? formatDateTime(customer.verifiedAt, language) : d.notVerified}</dd>
            </div>
            <div>
              <dt>{d.origin}</dt>
              <dd>{d.origins[customer.origin]}{customer.invitedBy ? ` · ${d.invitedBy}: ${customer.invitedBy}` : ''}</dd>
            </div>
            <div>
              <dt>{d.lastSignIn}</dt>
              <dd>{customer.lastSignInAt ? formatDateTime(customer.lastSignInAt, language) : d.never}</dd>
            </div>
            <div>
              <dt>{d.created}</dt>
              <dd>{formatDateTime(customer.createdAt, language)}</dd>
            </div>
            <div>
              <dt>{d.language}</dt>
              <dd>{customer.language.toUpperCase()}</dd>
            </div>
          </dl>
          <div className={styles.row}>
            {customer.status !== 'disabled' && (
              <AdminButton onClick={() => void act('send_link')} loading={busy === 'send_link'}>
                {d.actions.send_link}
              </AdminButton>
            )}
            {customer.status !== 'disabled' && (
              <AdminButton onClick={() => void act('revoke_sessions')} loading={busy === 'revoke_sessions'}>
                {d.actions.revoke_sessions}
              </AdminButton>
            )}
            {customer.status === 'disabled' ? (
              <AdminButton onClick={() => void act('enable')} loading={busy === 'enable'}>
                {d.actions.enable}
              </AdminButton>
            ) : (
              <AdminButton danger onClick={() => void act('disable')} loading={busy === 'disable'}>
                {d.actions.disable}
              </AdminButton>
            )}
            {customer.deletionRequestedAt && (
              <AdminButton onClick={() => void act('clear_deletion_request')} loading={busy === 'clear_deletion_request'}>
                {d.actions.clear_deletion_request}
              </AdminButton>
            )}
          </div>
        </DetailPanel>

        <DetailPanel title={d.sessions}>
          {data.sessions.length === 0 ? (
            <p className={styles.muted}>{d.noSessions}</p>
          ) : (
            <ul className={page.textList}>
              {data.sessions.map((session) => (
                <li key={session.id}>
                  {session.browser || '–'} · {fill(d.sessionLine, { created: formatDateTime(session.createdAt, language), used: formatDateTime(session.lastSeenAt, language) })}
                </li>
              ))}
            </ul>
          )}
        </DetailPanel>

        <DetailPanel title={d.records}>
          <p className={styles.muted}>{d.recordsNote}</p>
          {data.links.length === 0 ? (
            <p>{d.noRecords}</p>
          ) : (
            <ul className={styles.stack}>
              {data.links.map((entry) => (
                <li key={entry.id} className={styles.spread}>
                  <span>
                    {d.kinds[entry.type]} <span className={styles.mono}>{entry.reference}</span> · <span className={styles.muted}>{d.methods[entry.method]} · {formatDateTime(entry.linkedAt, language)}</span>
                  </span>
                  <AdminButton variant="text" danger onClick={() => void unlink(entry.id)} loading={busy === `unlink-${entry.id}`}>
                    {d.unlink}
                  </AdminButton>
                </li>
              ))}
            </ul>
          )}
          {data.candidates.length > 0 && (
            <>
              <h3 className={styles.sectionTitle}>{d.candidates}</h3>
              <p className={styles.muted}>{d.candidatesNote}</p>
              <ul className={styles.stack}>
                {data.candidates.map((entry) => (
                  <li key={entry.id} className={styles.spread}>
                    <span>
                      {d.kinds[entry.type]} <span className={styles.mono}>{entry.reference}</span> · <span className={styles.muted}>{formatDateTime(entry.createdAt, language)}</span>
                    </span>
                    <AdminButton onClick={() => void link(entry.type, entry.id)} loading={busy === `link-${entry.id}`}>
                      {d.link}
                    </AdminButton>
                  </li>
                ))}
              </ul>
            </>
          )}
        </DetailPanel>

        <DetailPanel
          title={d.projects}
          actions={
            customer.status !== 'disabled' && (
              <AdminButton onClick={() => setCreating((open) => !open)} aria-expanded={creating}>
                {d.newProject}
              </AdminButton>
            )
          }
        >
          {creating && (
            <form className={styles.stack} onSubmit={createProject} noValidate>
              <div className={styles.formGrid}>
                <TextField label={c.project.new.name} value={form.name} error={errors.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                <SelectField label={c.project.new.category} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} options={PROJECT_CATEGORIES.map((category) => ({ value: category, label: c.project.categories[category] }))} />
                <SelectField label={c.project.new.from} value={form.quoteRequestId} onChange={(event) => setForm({ ...form, quoteRequestId: event.target.value })} options={[{ value: '', label: c.project.new.none }, ...requestLinks.map((entry) => ({ value: entry.recordId, label: entry.reference }))]} />
                <TextField label={c.project.new.started} type="date" optional value={form.startedOn} error={errors.startedOn} onChange={(event) => setForm({ ...form, startedOn: event.target.value })} />
                <TextField label={c.project.new.expected} type="date" optional value={form.expectedOn} error={errors.expectedOn} onChange={(event) => setForm({ ...form, expectedOn: event.target.value })} />
              </div>
              <CheckField label={c.project.new.notify} checked={form.notify} onChange={(notify) => setForm({ ...form, notify })} />
              <div className={styles.formActions}>
                <AdminButton type="submit" variant="primary" loading={busy === 'project'}>
                  {c.project.new.submit}
                </AdminButton>
              </div>
            </form>
          )}
          {data.projects.length === 0 ? (
            !creating && <p className={styles.muted}>{d.noProjects}</p>
          ) : (
            <ul className={styles.stack}>
              {data.projects.map((project) => (
                <li key={project.id} className={styles.spread}>
                  <Link className={styles.cellLink} to={`/client-projects/${project.id}`}>
                    {project.name}
                  </Link>
                  <span className={styles.muted}>
                    <span className={styles.mono}>{project.reference}</span> · {c.project.statuses[project.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DetailPanel>

        <DetailPanel title={d.audit}>
          <ol className={styles.timeline}>
            {data.audit.map((entry) => (
              <li key={entry.id} className={styles.timelineItem}>
                <span className={styles.timelineWhen}>{formatDateTime(entry.at, language)}</span>
                <span>
                  {d.auditTypes[entry.type as keyof typeof d.auditTypes] ?? entry.type} · {entry.actor === 'admin' && entry.adminEmail ? entry.adminEmail : d.actors[entry.actor]}
                  {entry.detail ? <span className={cx(styles.muted, styles.small)}> · {entry.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </DetailPanel>
      </div>
    </>
  )
}
