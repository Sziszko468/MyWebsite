import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { communications, CONVERSATION_STATUSES, type Conversation, type ConversationStatus, type Message } from '../api/communications'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { CheckField, SelectField, TextAreaField, TextField } from '../components/form'
import { DetailPanel, PageHeader } from '../components/layout'
import { ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { Tag } from '../components/work/parts'
import { useResource } from '../hooks/useResource'
import { fill, formatDateTime, useInterfaceLanguage, useText } from '../i18n'
import { formatZoned } from '../../utils/format'
import c from '../styles/communications.module.scss'
import styles from '../styles/ui.module.scss'
import { useRefusal } from './CommunicationsPage'

/**
 * One conversation (PROMPT 28): the whole timeline (the customer's words, yours, your private notes in a clearly different look, and the system events of the project), the
 * composer for a reply, an announcement or a private note, the status control, and a search inside the conversation. The server decides every rule; a refusal says why in words.
 * The conversation is marked read for THIS administrator only after the timeline has been drawn.
 */

const STATUS_TONE = { open: 'info', waiting_owner: 'warning', waiting_customer: 'neutral', resolved: 'success', archived: 'neutral' } as const
const MAX = 4000
type Kind = 'reply' | 'announcement' | 'note'
const KINDS: readonly Kind[] = ['reply', 'announcement', 'note']

const makeToken = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 40).padEnd(12, 'x')

function eventText(t: ReturnType<typeof useText>['communications'], event: NonNullable<Message['event']>, language: 'hu' | 'en'): string {
  const template = (t.events as Record<string, string>)[event.key] ?? t.events.fallback
  const values: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(event.params)) values[name] = value === null || typeof value === 'boolean' ? '' : value
  if (typeof event.params.status === 'string') values.status = (t.projectStatus as Record<string, string>)[event.params.status] ?? event.params.status
  if (typeof event.params.at === 'string' && typeof event.params.zone === 'string') values.when = formatZoned(event.params.at, event.params.zone, language)
  return fill(template, values)
}

export function Entry({ message, busy, onEdit, onRemove, editing, onCancel, onSave }: { message: Message; busy: string | null; onEdit: () => void; onRemove: () => void; editing: boolean; onCancel: () => void; onSave: (body: string) => void }) {
  const t = useText().communications
  const language = useInterfaceLanguage()
  const [draft, setDraft] = useState(message.body ?? '')
  const internal = message.visibility === 'internal'
  if (message.type === 'system_event' && message.event) {
    return (
      <li className={c.event}>
        <span>{eventText(t, message.event, language)}</span>
        <time dateTime={message.createdAt}>{formatDateTime(message.createdAt, language)}</time>
      </li>
    )
  }
  const who = message.from === 'customer' ? t.workspace.customerLabel : message.mine ? t.workspace.ownerLabel : (message.adminEmail ?? t.workspace.ownerLabel)
  return (
    <li className={c.message} data-from={message.from} data-kind={message.type} data-visibility={message.visibility} id={`message-${message.id}`}>
      <p className={c.head}>
        <strong>{who}</strong>
        {internal && <span className={`${c.tag} ${c.private}`}>{t.workspace.note}</span>}
        {message.type === 'announcement' && <span className={c.tag}>{t.workspace.announcement}</span>}
        {message.important && <span className={c.tag}>{t.workspace.important}</span>}
        {message.edited && <span>({t.workspace.edited})</span>}
        <time dateTime={message.createdAt}>{formatDateTime(message.createdAt, language)}</time>
      </p>
      {internal && <p className={c.hint}>{t.workspace.noteHint}</p>}
      {message.removed ? (
        <p className={c.removed}>{t.workspace.removed}</p>
      ) : editing ? (
        <form
          className={styles.stack}
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            onSave(draft)
          }}
        >
          <TextAreaField label={t.workspace.note} rows={4} maxLength={MAX + 400} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div className={styles.formActions}>
            <AdminButton type="submit" variant="primary" loading={busy === `edit-${message.id}`}>
              {t.workspace.saveNote}
            </AdminButton>
            <AdminButton variant="text" onClick={onCancel}>
              {t.workspace.cancel}
            </AdminButton>
          </div>
        </form>
      ) : (
        <p className={c.body}>{message.body}</p>
      )}
      {message.mine && !message.removed && !editing && (
        <div className={styles.formActions}>
          {internal && (
            <AdminButton variant="text" onClick={onEdit}>
              {t.workspace.edit}
            </AdminButton>
          )}
          <AdminButton variant="text" danger loading={busy === `remove-${message.id}`} onClick={onRemove}>
            {t.workspace.remove}
          </AdminButton>
        </div>
      )}
    </li>
  )
}

export function CommunicationPage() {
  const { reference = '' } = useParams()
  const t = useText().communications
  const language = useInterfaceLanguage()
  const toast = useToast()
  const confirm = useConfirm()
  const refusal = useRefusal()
  const resource = useResource((signal) => communications.get(reference, null, signal), [reference])
  // What a change answered with is shown instead of what was loaded, but only until the next load: both are tied to the load they came from.
  const [local, setLocal] = useState<{ source: Conversation | null; value: Conversation } | null>(null)
  const [pages, setPages] = useState<{ source: Conversation | null; items: Message[]; hasOlder: boolean } | null>(null)
  const [readUpTo, setReadUpTo] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const [kind, setKind] = useState<Kind>('reply')
  const [body, setBody] = useState('')
  const [important, setImportant] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [status, setStatus] = useState<ConversationStatus | ''>('')
  const [typed, setTyped] = useState('')
  const [found, setFound] = useState<{ query: string; items: Message[] } | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const token = useRef(makeToken())
  const marked = useRef(0)

  const loaded = resource.data
  const conversation = local && local.source === loaded ? local.value : loaded
  const fresh = pages && pages.source === loaded ? pages : null
  const older = fresh?.items ?? []
  const hasOlder = fresh ? fresh.hasOlder : (conversation?.page.hasOlder ?? false)

  // Marked read for this administrator only after the timeline has been drawn (this runs after the render that shows it), and only while the page is in front of them.
  const newestSeq = conversation?.page.newestSeq ?? null
  const marker = conversation?.marker ?? 0
  useEffect(() => {
    if (!newestSeq || document.visibilityState !== 'visible' || newestSeq <= Math.max(marked.current, marker)) return
    marked.current = newestSeq
    void communications
      .read(reference, newestSeq)
      .then(() => setReadUpTo(newestSeq))
      .catch(() => {
        marked.current = 0
      })
  }, [marker, newestSeq, reference])

  const seen = new Set<number>()
  const messages = conversation ? [...older, ...conversation.messages].filter((entry) => (seen.has(entry.seq) ? false : (seen.add(entry.seq), true))) : []

  if (resource.loading && !conversation) return <LoadingState />
  if (resource.error && !conversation) return <ErrorState error={resource.error} onRetry={resource.reload} />
  if (!conversation) return <LoadingState />

  async function run<T>(name: string, job: () => Promise<T>, done: string | null): Promise<T | null> {
    setBusy(name)
    try {
      const result = await job()
      if (done) toast.success(done)
      return result
    } catch (failure) {
      toast.error(refusal(failure))
      resource.reload()
      return null
    } finally {
      setBusy(null)
    }
  }
  const take = (next: Conversation | null) => {
    if (!next) return false
    setLocal({ source: loaded, value: next })
    setPages(null)
    return true
  }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    const text = body.trim()
    if (!text) return setError(t.composer.required)
    if (text.length > MAX) return setError(t.composer.tooLong)
    setError(null)
    if (kind === 'announcement' && !(await confirm({ title: t.new.announcementTitle, body: t.new.announcementBody, confirmLabel: t.new.announcementConfirm }))) return
    const next = await run('send', () => communications.post(reference, { kind, body: text, important: kind === 'reply' ? important : undefined, confirm: kind === 'announcement' ? true : undefined, clientToken: token.current }), kind === 'note' ? t.composer.noted : t.composer.sent)
    if (take(next)) {
      setBody('')
      setImportant(false)
      token.current = makeToken()
    }
  }

  const loadOlder = async () => {
    const before = messages[0]?.seq
    if (!before) return
    const page = await run('older', () => communications.get(reference, before), null)
    if (page) setPages({ source: loaded, items: [...page.messages, ...older], hasOlder: page.page.hasOlder })
  }

  const search = async (event: FormEvent) => {
    event.preventDefault()
    const term = typed.replace(/\s+/g, ' ').trim()
    if (term.length === 0) return clearSearch()
    if (term.length < 2) return setSearchError(t.search.tooShort)
    if (term.length > 100) return setSearchError(t.search.tooLong)
    setSearchError(null)
    const result = await run('search', () => communications.within(reference, term), null)
    if (result) setFound({ query: term, items: result.items })
  }
  const clearSearch = () => {
    setTyped('')
    setFound(null)
    setSearchError(null)
  }

  const changeStatus = async () => {
    if (!status) return
    take(await run('status', () => communications.status(reference, status, conversation.revision), t.statusPanel.changed))
    setStatus('')
  }

  const customerName = conversation.customer.name || conversation.customer.email
  const unreadNow = conversation.unread > 0 && conversation.page.newestSeq !== null && conversation.page.newestSeq > Math.max(readUpTo, conversation.marker)
  const started = fill(t.workspace.started, { who: conversation.startedBy === 'customer' ? t.workspace.whoCustomer : t.workspace.whoOwner, date: formatDateTime(conversation.createdAt, language) })

  return (
    <>
      <PageHeader
        title={conversation.subject}
        lead={
          <span className={styles.rowTight}>
            <span className={styles.mono}>{conversation.reference}</span>
            <Tag tone={STATUS_TONE[conversation.status]}>{t.status[conversation.status]}</Tag>
            <span>{started}</span>
          </span>
        }
        back={{ to: '/communications', label: t.back }}
        actions={
          <AdminButton variant="secondary" onClick={resource.reload}>
            {t.refresh}
          </AdminButton>
        }
      />
      <div className={c.workspace}>
        <div className={c.main}>
          {conversation.resolutionRequested && (
            <p className={`${styles.notice} ${styles.noticeWarning}`} role="status">
              {t.workspace.resolutionRequested}
            </p>
          )}
          {unreadNow && (
            <p className={styles.notice} role="status">
              {fill(t.workspace.unread, { count: conversation.unread })}
            </p>
          )}
          <DetailPanel title={t.workspace.timeline}>
            <div className={styles.stack}>
              {hasOlder && (
                <div className={styles.formActions}>
                  <AdminButton variant="secondary" loading={busy === 'older'} onClick={() => void loadOlder()}>
                    {t.workspace.older}
                  </AdminButton>
                </div>
              )}
              {messages.length === 0 ? (
                <p className={styles.muted}>{t.workspace.noMessages}</p>
              ) : (
                <ol className={c.timeline} aria-label={t.workspace.timeline}>
                  {messages.map((message) => (
                    <Entry
                      key={message.id}
                      message={message}
                      busy={busy}
                      editing={editing === message.id}
                      onEdit={() => setEditing(message.id)}
                      onCancel={() => setEditing(null)}
                      onSave={(text) =>
                        void run(`edit-${message.id}`, () => communications.editNote(reference, message.id, text), t.workspace.noteSaved).then((next) => {
                          if (take(next)) setEditing(null)
                        })
                      }
                      onRemove={async () => {
                        if (await confirm({ title: t.workspace.removeTitle, body: t.workspace.removeBody, confirmLabel: t.workspace.removeConfirm, danger: true })) take(await run(`remove-${message.id}`, () => communications.remove(reference, message.id), t.workspace.removedDone))
                      }}
                    />
                  ))}
                </ol>
              )}
            </div>
          </DetailPanel>

          <DetailPanel title={t.composer.title}>
            <form className={styles.stack} noValidate onSubmit={(event) => void send(event)}>
              <fieldset className={c.kinds}>
                <legend className={styles.srOnly}>{t.composer.kind}</legend>
                {KINDS.map((value) => (
                  <button key={value} type="button" className={c.kind} aria-pressed={kind === value} onClick={() => setKind(value)}>
                    {t.composer.kinds[value]}
                  </button>
                ))}
              </fieldset>
              <p className={c.hint}>{t.composer.kindHint[kind]}</p>
              {kind === 'reply' && <CheckField label={t.composer.important} checked={important} onChange={setImportant} />}
              <TextAreaField label={kind === 'note' ? t.workspace.note : t.composer.label} hint={t.composer.attachments} rows={5} maxLength={MAX + 400} value={body} error={error ?? undefined} onChange={(event) => { setBody(event.target.value); if (error) setError(null) }} />
              <div className={styles.formActions}>
                <AdminButton type="submit" variant="primary" loading={busy === 'send'}>
                  {t.composer.send[kind]}
                </AdminButton>
              </div>
            </form>
          </DetailPanel>
        </div>

        <aside className={c.aside} aria-label={t.workspace.customerDetails}>
          <DetailPanel title={t.workspace.customerDetails}>
            <div className={styles.stack}>
              <p>
                <strong>{customerName}</strong>
                {conversation.customer.company ? <span className={c.hint}> · {conversation.customer.company}</span> : null}
                <br />
                <span className={styles.mono}>{conversation.customer.email}</span>
              </p>
              <ul className={styles.stack}>
                <li>
                  <Link to={`/clients/${conversation.customer.id}`}>{t.workspace.openCustomer}</Link>
                </li>
                {conversation.project && (
                  <li>
                    <Link to={`/client-projects/${conversation.project.id}`}>{`${t.workspace.openProject}: ${conversation.project.name}`}</Link>
                  </li>
                )}
              </ul>
              {conversation.context && <p className={c.hint}>{`${t.workspace.about}: ${t.contextTypes[conversation.context.type]}${conversation.context.title ? ` · ${conversation.context.title}` : ` · ${conversation.context.reference}`}`}</p>}
            </div>
          </DetailPanel>

          <DetailPanel title={t.statusPanel.title}>
            <div className={styles.stack}>
              <p className={c.hint}>{t.statusPanel.hint}</p>
              <SelectField
                label={t.statusPanel.label}
                value={status}
                onChange={(event) => setStatus(event.target.value as ConversationStatus | '')}
                options={[{ value: '', label: '–' }, ...CONVERSATION_STATUSES.filter((value) => value !== conversation.status).map((value) => ({ value, label: t.status[value] }))]}
              />
              <div className={styles.formActions}>
                <AdminButton variant="primary" disabled={!status} loading={busy === 'status'} onClick={() => void changeStatus()}>
                  {t.statusPanel.change}
                </AdminButton>
              </div>
            </div>
          </DetailPanel>

          <DetailPanel title={t.workspace.searchWithin}>
            <form className={styles.stack} role="search" aria-label={t.workspace.searchWithin} noValidate onSubmit={(event) => void search(event)}>
              <TextField label={t.search.label} hint={t.workspace.searchWithinHint} error={searchError ?? undefined} type="search" value={typed} maxLength={120} onChange={(event) => setTyped(event.target.value)} />
              <div className={styles.formActions}>
                <AdminButton type="submit" variant="secondary" loading={busy === 'search'}>
                  {t.search.submit}
                </AdminButton>
                {found && (
                  <AdminButton variant="text" onClick={clearSearch}>
                    {t.workspace.searchClear}
                  </AdminButton>
                )}
              </div>
            </form>
            {found && (
              <div className={styles.stack} role="status">
                <p>{fill(t.workspace.searchResults, { count: found.items.length })}</p>
                {found.items.length === 0 ? (
                  <p className={styles.muted}>{t.workspace.searchNone}</p>
                ) : (
                  <ul className={styles.stack}>
                    {found.items.map((item) => (
                      <li key={item.id}>
                        <a href={`#message-${item.id}`}>
                          {item.visibility === 'internal' ? `${t.workspace.privateMark}: ` : ''}
                          {(item.body ?? '').slice(0, 120)}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </DetailPanel>
        </aside>
      </div>
    </>
  )
}
