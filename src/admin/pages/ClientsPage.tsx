import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { cx } from '../../utils/cx'
import { clients as api, type ClientListRow } from '../api/clients'
import { ApiError } from '../api/client'
import { AdminButton } from '../components/AdminButton'
import { DataList, type Column } from '../components/DataList'
import { FilterDropdown, SearchInput, SelectField, SwitchField, TextField } from '../components/form'
import { DetailPanel, PageHeader } from '../components/layout'
import { Pagination } from '../components/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { useResource } from '../hooks/useResource'
import { formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import styles from '../styles/ui.module.scss'

const TONES = { invited: styles.toneWarning, active: styles.toneSuccess, disabled: styles.toneNeutral } as const

export function ClientStatusBadge({ status, label }: { status: keyof typeof TONES; label: string }) {
  return (
    <span className={cx(styles.badge, TONES[status])}>
      <span className={styles.badgeDot} aria-hidden="true" />
      {label}
    </span>
  )
}

/** The portal's customers: who has an account, in what state, with the two owner's switches and the invitation on the same screen. */
export function ClientsPage() {
  const t = useText()
  const c = t.clients
  const language = useInterfaceLanguage()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const value = (name: string) => params.get(name) ?? ''
  const pageNumber = Math.max(1, Number.parseInt(value('page') || '1', 10) || 1)
  const query = { q: value('q') || undefined, status: value('status') || undefined, page: pageNumber > 1 ? pageNumber : undefined, pageSize: 20 }
  const list = useResource((signal) => api.list(query, signal), [params.toString()])
  const settings = useResource((signal) => api.settings(signal), [])

  const change = (patch: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams(params)
    for (const [key, entry] of Object.entries(patch)) {
      if (entry === undefined || entry === '' || entry === 1) next.delete(key)
      else next.set(key, String(entry))
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  async function toggle(name: 'registration' | 'selfLinking', checked: boolean) {
    try {
      settings.set(await api.saveSettings({ [name]: checked }))
      toast.success(c.settings.saved)
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : String(error))
    }
  }

  // ---- the invitation
  const [inviting, setInviting] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', company: '', language: 'en' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sending, setSending] = useState(false)
  async function invite(event: FormEvent) {
    event.preventDefault()
    setSending(true)
    setErrors({})
    try {
      const made = await api.invite({ email: form.email.trim(), name: form.name.trim() || undefined, company: form.company.trim() || undefined, language: form.language })
      toast.success(made.emailQueued ? c.invite.done : c.invite.noMail)
      setForm({ email: '', name: '', company: '', language: form.language })
      setInviting(false)
      list.reload()
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) setErrors({ email: c.invite.exists })
      else if (error instanceof ApiError && error.status === 422) setErrors(Object.fromEntries(Object.entries(error.fields).map(([field, code]) => [field, code === 'required' ? t.common.required : c.project.invalid])))
      else toast.error(error instanceof ApiError ? error.message : String(error))
    } finally {
      setSending(false)
    }
  }

  const rows = list.data?.rows ?? []
  const pageInfo = list.data?.page
  const filtered = Boolean(query.q || query.status)
  const statusLabel = (row: ClientListRow) => c.list.statuses[row.status]

  const columns: Column<ClientListRow>[] = [
    {
      key: 'customer',
      header: c.list.columns.customer,
      cell: (row) => (
        <span className={styles.cellMain}>
          <Link className={cx(styles.cellTitle, styles.cellLink)} to={`/clients/${row.id}`}>
            {row.name || row.email}
          </Link>
          <span className={cx(styles.muted, styles.small)}>{row.name ? row.email : row.company}</span>
        </span>
      ),
    },
    { key: 'status', header: c.list.columns.status, cell: (row) => <><ClientStatusBadge status={row.status} label={statusLabel(row)} />{row.deletionRequested && <span className={cx(styles.small, styles.muted)}> · {c.list.statuses.deletion}</span>}</> },
    { key: 'projects', header: c.list.columns.projects, cell: (row) => row.projects },
    { key: 'records', header: c.list.columns.records, cell: (row) => row.records },
    { key: 'last', header: c.list.columns.lastSignIn, cell: (row) => (row.lastSignInAt ? formatDateTime(row.lastSignInAt, language) : c.list.never) },
  ]

  return (
    <>
      <PageHeader
        title={c.title}
        lead={c.lead}
        actions={
          <AdminButton variant="primary" onClick={() => setInviting((open) => !open)} aria-expanded={inviting}>
            {c.invite.open}
          </AdminButton>
        }
      />
      <div className={styles.stackLg}>
        {settings.data && !settings.data.canSendLinks && (
          <div className={cx(styles.notice, styles.noticeWarning)} role="status">
            {c.settings.noMail}
          </div>
        )}

        {inviting && (
          <DetailPanel title={c.invite.title}>
            <form className={styles.stack} onSubmit={invite} noValidate>
              <div className={styles.formGrid}>
                <TextField label={c.invite.email} type="email" autoComplete="off" value={form.email} error={errors.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
                <TextField label={c.invite.name} optional value={form.name} error={errors.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
                <TextField label={c.invite.company} optional value={form.company} error={errors.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
                <SelectField label={c.invite.language} value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} options={[{ value: 'hu', label: 'Magyar' }, { value: 'en', label: 'English' }, { value: 'nl', label: 'Nederlands' }]} />
              </div>
              <div className={styles.formActions}>
                <AdminButton type="submit" variant="primary" loading={sending}>
                  {c.invite.submit}
                </AdminButton>
              </div>
            </form>
          </DetailPanel>
        )}

        <DetailPanel title={c.settings.title}>
          {settings.data ? (
            <div className={styles.stack}>
              <SwitchField label={c.settings.registration} hint={c.settings.registrationHint} checked={settings.data.registration} onChange={(checked) => void toggle('registration', checked)} />
              <SwitchField label={c.settings.selfLinking} hint={c.settings.selfLinkingHint} checked={settings.data.selfLinking} onChange={(checked) => void toggle('selfLinking', checked)} />
            </div>
          ) : (
            <LoadingState />
          )}
        </DetailPanel>

        <form className={styles.toolbar} role="search" aria-label={c.list.search} onSubmit={(event) => event.preventDefault()}>
          <SearchInput className={styles.toolbarSearch} label={c.list.search} value={value('q')} placeholder={c.list.searchPlaceholder} onSearch={(q) => change({ q })} />
          <FilterDropdown label={c.list.status} value={value('status')} onChange={(status) => change({ status })} options={[{ value: '', label: c.list.allStatuses }, ...(['invited', 'active', 'disabled', 'deletion'] as const).map((status) => ({ value: status, label: c.list.statuses[status] }))]} />
        </form>

        {list.loading ? (
          <LoadingState />
        ) : list.error && !list.data ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : rows.length === 0 ? (
          filtered ? (
            <EmptyState icon="search" title={c.list.emptyFiltered} action={<AdminButton onClick={() => setParams(new URLSearchParams(), { replace: true })}>{t.common.clearFilters}</AdminButton>} />
          ) : (
            <EmptyState icon="user" title={c.list.empty}>
              {c.list.emptyBody}
            </EmptyState>
          )
        ) : (
          <>
            <DataList
              rows={rows}
              rowKey={(row) => row.id}
              columns={columns}
              caption={c.list.caption}
              card={(row) => (
                <>
                  <div className={styles.listCardTop}>
                    <span className={styles.cellMain}>
                      <Link className={cx(styles.cellTitle, styles.cellLink)} to={`/clients/${row.id}`}>
                        {row.name || row.email}
                      </Link>
                      <span className={cx(styles.muted, styles.small)}>{row.name ? row.email : row.company}</span>
                    </span>
                    <ClientStatusBadge status={row.status} label={statusLabel(row)} />
                  </div>
                  <div className={styles.listCardMeta}>
                    <span>{c.list.columns.projects}: {row.projects}</span>
                    <span>{c.list.columns.records}: {row.records}</span>
                    {row.deletionRequested && <span>{c.list.statuses.deletion}</span>}
                  </div>
                </>
              )}
            />
            {pageInfo && <Pagination page={pageInfo.page} pageSize={pageInfo.pageSize} total={pageInfo.total} onPage={(next) => change({ page: next })} />}
          </>
        )}
      </div>
    </>
  )
}
