import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { ApiError } from '../api/client'
import { clients } from '../api/clients'
import { ADMIN_FILTERS, CONTEXT_TYPES, communications, type AdminFilter, type ContextType, type ConversationRow } from '../api/communications'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { CheckField, SelectField, TextAreaField, TextField } from '../components/form'
import { DashboardStatCard, DetailPanel, PageHeader } from '../components/layout'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { Tag } from '../components/work/parts'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import c from '../styles/communications.module.scss'
import styles from '../styles/ui.module.scss'
import w from '../styles/work.module.scss'

/**
 * The communication center (PROMPT 28): what is going on across every conversation (real counts), the inbox with its filters and its search, and the form that starts a
 * conversation. The server decides every rule; a refusal says why in words and changes nothing. Searching reads private notes too, which is why this is the administration's.
 */

const STATUS_TONE = { open: 'info', waiting_owner: 'warning', waiting_customer: 'neutral', resolved: 'success', archived: 'neutral' } as const
const MAX = 4000

/** What a refusal's reason code says in words (the server sends the reason; the words live here, in both languages). */
export function useRefusal() {
  const t = useText().communications
  return (error: unknown): string => {
    if (error instanceof ApiError) {
      const reason = typeof error.details.reason === 'string' ? error.details.reason : ''
      return (t.refused as Record<string, string>)[reason] ?? error.message
    }
    return String(error)
  }
}

const makeToken = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 40).padEnd(12, 'x')

function NewConversation({ onClose }: { onClose: () => void }) {
  const t = useText().communications
  const toast = useToast()
  const confirm = useConfirm()
  const refusal = useRefusal()
  const navigate = useNavigate()
  const customers = useResource((signal) => clients.list({ pageSize: 100 }, signal), [])
  const [customerId, setCustomerId] = useState('')
  const contexts = useResource(async (signal) => (customerId ? (await communications.contexts(customerId, signal)).items : []), [customerId])
  const [subject, setSubject] = useState('')
  const [about, setAbout] = useState('')
  const [kind, setKind] = useState<'reply' | 'announcement'>('reply')
  const [important, setImportant] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const token = useRef(makeToken())

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const found: Record<string, string> = {}
    if (!customerId) found.customerId = t.new.chooseCustomer
    if (!subject.trim()) found.subject = t.composer.required
    if (!body.trim()) found.body = t.composer.required
    if (body.trim().length > MAX) found.body = t.composer.tooLong
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (kind === 'announcement' && !(await confirm({ title: t.new.announcementTitle, body: t.new.announcementBody, confirmLabel: t.new.announcementConfirm }))) return
    const [type, ...rest] = about.split(':')
    setBusy(true)
    try {
      const made = await communications.start({
        customerId,
        subject: subject.trim(),
        body: body.trim(),
        kind,
        important: kind === 'reply' ? important : undefined,
        confirm: kind === 'announcement' ? true : undefined,
        context: about ? { type: type as ContextType, reference: rest.join(':') } : null,
        clientToken: token.current,
      })
      token.current = makeToken()
      toast.success(t.new.created)
      void navigate(`/communications/${made.reference}`)
    } catch (error) {
      toast.error(refusal(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DetailPanel title={t.new.title}>
      <form className={styles.stack} noValidate aria-label={t.new.title} onSubmit={(event) => void submit(event)}>
        <SelectField
          label={t.new.customer}
          value={customerId}
          required
          error={errors.customerId}
          onChange={(event) => {
            setCustomerId(event.target.value)
            setAbout('')
          }}
          options={[{ value: '', label: t.new.chooseCustomer }, ...(customers.data?.rows ?? []).map((row) => ({ value: row.id, label: `${row.name || row.email}${row.company ? ` · ${row.company}` : ''}` }))]}
        />
        <TextField label={t.new.subject} value={subject} maxLength={200} required error={errors.subject} onChange={(event) => setSubject(event.target.value)} />
        <div className={styles.formGrid}>
          <SelectField
            label={t.new.about}
            value={about}
            disabled={!customerId}
            onChange={(event) => setAbout(event.target.value)}
            options={[{ value: '', label: t.new.aboutNone }, ...(contexts.data ?? []).map((option) => ({ value: `${option.type}:${option.reference}`, label: `${t.contextTypes[option.type]}: ${option.label}` }))]}
          />
          <SelectField label={t.new.kind} value={kind} onChange={(event) => setKind(event.target.value as 'reply' | 'announcement')} options={[{ value: 'reply', label: t.new.kinds.reply }, { value: 'announcement', label: t.new.kinds.announcement }]} />
        </div>
        {kind === 'reply' && <CheckField label={t.new.important} checked={important} onChange={setImportant} />}
        <TextAreaField label={t.new.body} hint={t.composer.attachments} rows={5} maxLength={MAX + 400} value={body} required error={errors.body} onChange={(event) => setBody(event.target.value)} />
        <div className={styles.formActions}>
          <AdminButton type="submit" variant="primary" loading={busy}>
            {t.new.send}
          </AdminButton>
          <AdminButton variant="text" onClick={onClose}>
            {t.workspace.cancel}
          </AdminButton>
        </div>
      </form>
    </DetailPanel>
  )
}

export function CommunicationsPage() {
  const text = useText()
  const t = text.communications
  const language = useInterfaceLanguage()
  const overview = useResource((signal) => communications.overview(signal), [])
  const customers = useResource((signal) => clients.list({ pageSize: 100 }, signal), [])
  const [params] = useSearchParams()
  // The analytics link here with `?filter=waiting_owner` (and the like): a known filter in the address is where the list starts.
  const [filter, setFilter] = useState<AdminFilter>(() => ((ADMIN_FILTERS as readonly string[]).includes(params.get('filter') ?? '') ? (params.get('filter') as AdminFilter) : 'all'))
  const [customerId, setCustomerId] = useState(params.get('customerId') ?? '')
  const [projectId, setProjectId] = useState(params.get('projectId') ?? '')
  const [context, setContext] = useState<ContextType | ''>('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  const [queryError, setQueryError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [extra, setExtra] = useState<{ key: string; rows: ConversationRow[]; next: string | null } | null>(null)
  const [more, setMore] = useState(false)
  const projects = useResource(async (signal) => (customerId ? (await clients.get(customerId, signal)).projects : []), [customerId])
  const key = JSON.stringify({ filter, customerId, projectId, context, from, to, query })
  const list = useResource(
    async (signal) => {
      if (query) return { items: (await communications.search(query, signal)).items, next: null as string | null }
      return communications.list({ filter, customerId, projectId, context, from, to }, signal)
    },
    [key],
  )

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const term = typed.replace(/\s+/g, ' ').trim()
    if (term.length === 0) return clear()
    if (term.length < 2) return setQueryError(t.search.tooShort)
    if (term.length > 100) return setQueryError(t.search.tooLong)
    setQueryError(null)
    setQuery(term)
  }
  const clear = () => {
    setTyped('')
    setQuery('')
    setQueryError(null)
  }
  const reset = () => {
    setFilter('all')
    setCustomerId('')
    setProjectId('')
    setContext('')
    setFrom('')
    setTo('')
  }
  const loadMore = async (next: string) => {
    setMore(true)
    try {
      const page = await communications.list({ filter, customerId, projectId, context, from, to, cursor: next })
      setExtra((current) => ({ key, rows: [...(current?.key === key ? current.rows : []), ...page.items], next: page.next }))
    } finally {
      setMore(false)
    }
  }

  if (overview.loading || list.loading) return <LoadingState />
  if (overview.error && !overview.data) return <ErrorState error={overview.error} onRetry={overview.reload} />
  if (list.error && !list.data) return <ErrorState error={list.error} onRetry={list.reload} />
  const summary = overview.data!
  const base = list.data!.items
  const extension = extra && extra.key === key ? extra : null
  const rows = [...base, ...(extension?.rows ?? [])]
  const next = extension ? extension.next : list.data!.next

  const row = (entry: ConversationRow) => (
    <tr key={entry.reference}>
      <td>
        <div className={styles.cellMain}>
          <Link to={`/communications/${entry.reference}`} className={styles.cellLink}>
            <span className={styles.cellTitle}>{entry.subject}</span>
          </Link>
          <span className={styles.mono}>{entry.reference}</span>
          <span className={c.hint}>{entry.startedBy === 'customer' ? t.list.startedBy.customer : t.list.startedBy.admin}</span>
          {entry.preview && <span className={c.hint}>{entry.preview}</span>}
          {entry.snippet && <span className={c.snippet}>{entry.snippet}</span>}
          {entry.inNote && <Tag tone="info">{t.search.inNote}</Tag>}
        </div>
      </td>
      <td>
        {entry.customer.name || entry.customer.email}
        {entry.customer.company ? <span className={c.hint}> · {entry.customer.company}</span> : null}
      </td>
      <td>
        {entry.project ? entry.project.name : t.list.none}
        {entry.context && entry.context.type !== 'project' ? <span className={c.hint}> · {t.contextTypes[entry.context.type]}: {entry.context.title ?? entry.context.reference}</span> : null}
      </td>
      <td>
        <Tag tone={STATUS_TONE[entry.status]}>{t.status[entry.status]}</Tag>
        {entry.resolutionRequested && <span className={c.hint}> {t.list.resolutionRequested}</span>}
      </td>
      <td>
        {formatDateTime(entry.lastActivityAt, language)}
        {entry.lastSender && <span className={c.hint}> · {t.list.lastBy[entry.lastSender]}</span>}
      </td>
      <td>
        {entry.unread > 0 ? <Tag tone="accent">{fill(t.list.unread, { count: entry.unread })}</Tag> : t.list.none}
        {entry.notes > 0 && <span className={c.hint}> · {fill(t.list.notes, { count: entry.notes })}</span>}
      </td>
    </tr>
  )

  return (
    <>
      <PageHeader
        title={t.title}
        lead={t.lead}
        actions={
          <AdminButton variant="primary" onClick={() => setCreating((open) => !open)} aria-expanded={creating}>
            {creating ? t.new.close : t.new.open}
          </AdminButton>
        }
      />
      <div className={styles.stackLg}>
        <DetailPanel title={t.overview.title}>
          <ul className={c.stats}>
            <li>
              <DashboardStatCard label={t.overview.open} value={String(summary.open)} compact />
            </li>
            <li>
              <DashboardStatCard label={t.overview.waitingOwner} value={String(summary.waitingOwner)} tone="warning" compact />
            </li>
            <li>
              <DashboardStatCard label={t.overview.waitingCustomer} value={String(summary.waitingCustomer)} compact />
            </li>
            <li>
              <DashboardStatCard label={t.overview.unread} value={String(summary.unreadMessages)} note={fill(t.overview.unreadNote, { threads: summary.unreadThreads })} tone="accent" compact />
            </li>
            <li>
              <DashboardStatCard label={t.overview.resolved} value={String(summary.resolved)} tone="success" compact />
            </li>
          </ul>
        </DetailPanel>

        {creating && <NewConversation onClose={() => setCreating(false)} />}

        <DetailPanel title={query ? fill(t.search.results, { count: rows.length }) : t.list.title}>
          <div className={styles.stack}>
            <form className={c.searchRow} role="search" aria-label={t.search.label} onSubmit={submitSearch} noValidate>
              <TextField label={t.search.label} hint={t.search.hint} error={queryError ?? undefined} type="search" value={typed} maxLength={120} onChange={(event) => setTyped(event.target.value)} />
              <AdminButton type="submit" variant="secondary">
                {t.search.submit}
              </AdminButton>
              {query && (
                <AdminButton variant="text" onClick={clear}>
                  {t.search.clear}
                </AdminButton>
              )}
            </form>
            {!query && (
              <div className={c.filterGrid}>
                <SelectField label={t.filters.label} value={filter} onChange={(event) => setFilter(event.target.value as AdminFilter)} options={ADMIN_FILTERS.map((value) => ({ value, label: t.filters[value] }))} />
                <SelectField
                  label={t.filters.customer}
                  value={customerId}
                  onChange={(event) => {
                    setCustomerId(event.target.value)
                    setProjectId('')
                  }}
                  options={[{ value: '', label: t.filters.anyCustomer }, ...(customers.data?.rows ?? []).map((entry) => ({ value: entry.id, label: entry.name || entry.email }))]}
                />
                <SelectField label={t.filters.project} value={projectId} disabled={!customerId} onChange={(event) => setProjectId(event.target.value)} options={[{ value: '', label: t.filters.anyProject }, ...(projects.data ?? []).map((entry) => ({ value: entry.id, label: entry.name }))]} />
                <SelectField label={t.filters.context} value={context} onChange={(event) => setContext(event.target.value as ContextType | '')} options={[{ value: '', label: t.filters.anyContext }, ...CONTEXT_TYPES.map((value) => ({ value, label: t.contextTypes[value] }))]} />
                <TextField label={t.filters.from} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
                <TextField label={t.filters.to} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
                <div>
                  <AdminButton variant="text" onClick={reset}>
                    {t.filters.reset}
                  </AdminButton>
                </div>
              </div>
            )}

            {rows.length === 0 ? (
              <EmptyState icon="inbox" title={query ? t.search.none : t.list.empty}>
                {query ? '' : t.list.emptyBody}
              </EmptyState>
            ) : (
              <>
                <div className={w.listWrap} tabIndex={0} role="region" aria-label={t.list.caption}>
                  <table className={w.listTable}>
                    <caption className={styles.srOnly}>{t.list.caption}</caption>
                    <thead>
                      <tr>
                        <th scope="col">{t.list.columns.conversation}</th>
                        <th scope="col">{t.list.columns.customer}</th>
                        <th scope="col">{t.list.columns.about}</th>
                        <th scope="col">{t.list.columns.status}</th>
                        <th scope="col">{t.list.columns.activity}</th>
                        <th scope="col">{t.list.columns.unread}</th>
                      </tr>
                    </thead>
                    <tbody>{rows.map(row)}</tbody>
                  </table>
                </div>
                {next && (
                  <div className={styles.formActions}>
                    <AdminButton variant="secondary" loading={more} onClick={() => void loadMore(next)}>
                      {t.list.loadMore}
                    </AdminButton>
                  </div>
                )}
              </>
            )}
          </div>
        </DetailPanel>

        <DetailPanel title={t.overview.recent}>
          {summary.recent.length === 0 ? (
            <p className={styles.muted}>{t.overview.none}</p>
          ) : (
            <ul className={w.links}>
              {summary.recent.map((entry) => (
                <li key={entry.reference}>
                  <Link to={`/communications/${entry.reference}`}>{entry.subject}</Link> <span className={c.hint}>· {entry.customer.name || entry.customer.email} · {formatDateTime(entry.lastActivityAt, language)}</span>
                </li>
              ))}
            </ul>
          )}
        </DetailPanel>
      </div>
    </>
  )
}
