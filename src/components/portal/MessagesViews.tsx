import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { localizedPath } from '../../i18n/paths'
import { useI18n } from '../../i18n/useI18n'
import {
  fetchConversation,
  fetchInbox,
  fetchMessageContexts,
  fetchMessagePreferences,
  markConversationRead,
  requestResolution,
  saveMessagePreferences,
  searchInbox,
  sendMessage,
  startConversation,
  type ContextOption,
  type ConversationDetail,
  type ConversationMessage,
  type ConversationSummary,
  type Failure,
  type InboxFilter,
  type MessagePreferences,
  type Result,
} from '../../portal/api'
import { failureText, usePortalText, type PortalWords } from '../../portal/text'
import { useUnread } from '../../portal/unreadContext'
import { useLoad, usePortal, type Loaded } from '../../portal/usePortal'
import { fill, formatMoment, formatZoned } from '../../utils/format'
import { Button } from '../Button/Button'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import m from './Messages.module.scss'
import styles from './Portal.module.scss'
import { Load, PageHeader, StatusBadge } from './ui'

/**
 * What the customer reads and does about their conversations with the owner (PROMPT 28). Everything shown is what the server returned for THIS customer: their own conversations,
 * only the words that are customer-visible, and the system events of their projects. The customer never says who they are, whose conversation it is, or what its status is: each
 * thing they do goes to one endpoint that names the conversation (and nothing else), and the server decides. A conversation is marked read only AFTER its messages have been
 * drawn and the page is in front of the customer; looking at it is a request that changes nothing.
 */

const TONE: Record<ConversationSummary['status'], 'attention' | 'active' | 'done' | 'muted'> = { open: 'active', waiting_owner: 'muted', waiting_customer: 'attention', resolved: 'done', archived: 'muted' }
const FILTERS: readonly InboxFilter[] = ['all', 'unread', 'open', 'resolved']
const MAX = 4000

/** A token this screen makes for one message: sending it twice (a double click, a retry) stores it once. */
const makeToken = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 10)}`.slice(0, 40).padEnd(12, 'x')

function problemText(failure: Failure, words: PortalWords): string {
  const w = words.messages
  if (failure.kind === 'refused') {
    if (failure.reason === 'archived') return w.conversation.errors.archived
    if (failure.reason === 'too_many') return w.start.tooMany
    if (failure.reason === 'start_closed') return w.start.closedNote
    if (failure.reason === 'read_only' || failure.reason === 'closed') return w.conversation.errors.closed
    return w.conversation.errors.failed
  }
  return failureText(failure, words)
}

/** What an event says, in the reader's language, from the key and the few facts the server kept. */
function eventText(words: PortalWords, event: NonNullable<ConversationMessage['event']>, lang: ReturnType<typeof useI18n>['lang']): string {
  const w = words.messages.events as Record<string, string>
  const template = w[event.key] ?? w.fallback
  const values: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(event.params)) values[name] = value === null || typeof value === 'boolean' ? '' : value
  if (typeof event.params.status === 'string') values.status = (words.status as Record<string, string>)[event.params.status] ?? event.params.status
  if (typeof event.params.at === 'string' && typeof event.params.zone === 'string') values.when = formatZoned(event.params.at, event.params.zone, lang)
  return fill(template, values)
}

function contextPath(conversation: Pick<ConversationDetail, 'context' | 'project'>): string | null {
  const context = conversation.context
  if (!context) return null
  switch (context.type) {
    case 'project':
      return `/client-portal/projects/${context.reference}`
    case 'deliverable':
      return conversation.project ? `/client-portal/projects/${conversation.project.reference}/deliverables/${context.reference}` : null
    case 'task':
      return conversation.project ? `/client-portal/projects/${conversation.project.reference}/tasks/${context.reference}` : null
    case 'booking':
      return `/client-portal/bookings/${context.reference}`
    case 'quote':
      return `/client-portal/requests/${context.reference}`
    default:
      return null
  }
}

// ============================================ the inbox ===============================================================================

export function Card({ entry }: { entry: ConversationSummary }) {
  const { lang } = useI18n()
  const words = usePortalText()
  const w = words.messages
  const activity = entry.kind === 'activity'
  const title = activity ? (entry.project ? `${w.list.activityTitle}: ${entry.project.name}` : w.list.activityGeneral) : (entry.subject ?? '')
  return (
    <li className={m.card} data-unread={entry.unread > 0} data-kind={entry.kind}>
      <div className={m.cardHead}>
        <h3 className={m.cardTitle}>
          <LocalizedLink to={`/client-portal/messages/${entry.reference}`} className={m.link}>
            {title}
          </LocalizedLink>
        </h3>
        <span className={m.actions}>
          {entry.unread > 0 && <span className={m.unreadBadge}>{fill(w.list.unread, { count: entry.unread })}</span>}
          {!activity && <StatusBadge status={entry.status} label={w.status[entry.status]} tone={TONE[entry.status]} />}
        </span>
      </div>
      <p className={m.meta}>
        {entry.project && !activity && <span>{fill(w.list.project, { name: entry.project.name })}</span>}
        {entry.context && entry.context.type !== 'project' && <span>{fill(w.list.about, { title: entry.context.title ?? `${w.contextTypes[entry.context.type]} ${entry.context.reference}` })}</span>}
        {entry.lastSender && <span>{w.list.lastBy[entry.lastSender]}</span>}
        <span>{formatMoment(entry.lastActivityAt, lang)}</span>
        {entry.resolutionRequested && <span>{w.list.resolutionAsked}</span>}
      </p>
      {activity ? <p className={m.hint}>{w.list.activityNote}</p> : entry.removed ? <p className={m.removed}>{w.list.removed}</p> : entry.preview ? <p className={m.preview}>{entry.preview}</p> : null}
      {entry.snippet && <p className={m.snippet}>{entry.snippet}</p>}
    </li>
  )
}

function Preferences() {
  const words = usePortalText()
  const w = words.messages.preferences
  const { state, reload } = useLoad(fetchMessagePreferences, 'message-preferences')
  const [saved, setSaved] = useState<string | null>(null)
  const [pending, setPending] = useState<Partial<Record<'replies' | 'announcements' | 'important' | 'resolution', boolean>>>({})
  const busy = useRef(false)
  const legend = useId()
  // The box changes the moment it is pressed (and goes back if the server says no); it is never disabled meanwhile, so focus stays where it was.
  const change = async (key: 'replies' | 'announcements' | 'important' | 'resolution', value: boolean) => {
    if (busy.current) return
    busy.current = true
    setSaved(null)
    setPending((current) => ({ ...current, [key]: value }))
    const result = await saveMessagePreferences({ [key]: value })
    busy.current = false
    if (result.ok) {
      setSaved(w.saved)
      reload()
    } else setSaved(w.failed)
    setPending((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }
  return (
    <section className={styles.section} aria-labelledby="prefs-title">
      <h2 id="prefs-title" className={styles.sectionTitle}>
        {w.title}
      </h2>
      <p className={styles.muted}>{w.lead}</p>
      <Load state={state} onRetry={reload}>
        {(prefs: MessagePreferences) => (
          <fieldset className={m.checks} aria-describedby={legend}>
            <legend className={m.srOnly}>{w.title}</legend>
            {(['replies', 'announcements', 'important', 'resolution'] as const).map((key) => (
              <label key={key} className={m.check}>
                <input type="checkbox" checked={pending[key] ?? prefs[key]} onChange={(event) => void change(key, event.target.checked)} />
                <span>{w[key]}</span>
              </label>
            ))}
          </fieldset>
        )}
      </Load>
      <p id={legend} className={styles.muted} role="status">
        {saved}
      </p>
    </section>
  )
}

function NewConversation({ initialAbout, onDone }: { initialAbout: string; onDone: () => void }) {
  const words = usePortalText()
  const w = words.messages
  const { lang } = useI18n()
  const navigate = useNavigate()
  const { refresh } = useUnread()
  const contexts = useLoad(fetchMessageContexts, 'message-contexts')
  const token = useRef(makeToken())
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [about, setAbout] = useState(initialAbout)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => first.current?.focus(), [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    if (!subject.trim() || !body.trim()) return setError(w.conversation.errors.required)
    if (body.trim().length > MAX) return setError(w.conversation.errors.tooLong)
    const [type, ...rest] = about.split(':')
    const context = about ? ({ type, reference: rest.join(':') } as { type: ContextOption['type']; reference: string }) : null
    setBusy(true)
    setError(null)
    const result = await startConversation({ subject: subject.trim(), body: body.trim(), context, clientToken: token.current })
    setBusy(false)
    if (!result.ok) return setError(problemText(result.failure, words))
    token.current = makeToken()
    refresh()
    onDone()
    void navigate(localizedPath(lang, `/client-portal/messages/${result.data.reference}`))
  }

  return (
    <form className={m.form} onSubmit={(event) => void submit(event)} noValidate aria-labelledby="new-title">
      <h2 id="new-title" className={styles.sectionTitle}>
        {w.start.title}
      </h2>
      {error && (
        <div className={m.errors} role="alert">
          <p>{w.conversation.errors.summary}</p>
          <ul>
            <li>{error}</li>
          </ul>
        </div>
      )}
      <div className={m.field}>
        <label className={m.label} htmlFor="new-subject">
          {w.start.subject}
        </label>
        <input id="new-subject" ref={first} className={m.input} value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} />
      </div>
      <div className={m.field}>
        <label className={m.label} htmlFor="new-about">
          {w.start.about}
        </label>
        <select id="new-about" className={m.select} value={about} onChange={(event) => setAbout(event.target.value)}>
          <option value="">{w.start.aboutNone}</option>
          {contexts.state.status === 'ready' &&
            contexts.state.data.items.map((option) => (
              <option key={`${option.type}:${option.reference}`} value={`${option.type}:${option.reference}`}>
                {`${w.contextTypes[option.type]}: ${option.label}`}
              </option>
            ))}
        </select>
      </div>
      <div className={m.field}>
        <label className={m.label} htmlFor="new-body">
          {w.start.body}
        </label>
        <textarea id="new-body" className={m.textarea} value={body} rows={6} maxLength={MAX + 400} aria-describedby="new-hint new-count" onChange={(event) => setBody(event.target.value)} />
        <p id="new-hint" className={m.hint}>
          {w.conversation.composer.hint}
        </p>
        <p id="new-count" className={m.counter}>
          {fill(w.conversation.composer.count, { count: body.trim().length, max: MAX })}
        </p>
      </div>
      <div className={m.actions}>
        <Button type="submit" variant="primary" disabled={busy}>
          {busy ? w.start.sending : w.start.send}
        </Button>
        <Button type="button" variant="text" onClick={onDone}>
          {w.start.close}
        </Button>
      </div>
    </form>
  )
}

export function MessagesView() {
  const words = usePortalText()
  const w = words.messages
  const [params] = useSearchParams()
  const { canStart, refresh } = useUnread()
  const about = params.get('about') ?? ''
  const [filter, setFilter] = useState<InboxFilter>('all')
  const [creating, setCreating] = useState(params.get('new') === '1' || about !== '')
  const [typed, setTyped] = useState('')
  const [query, setQuery] = useState('')
  const [queryError, setQueryError] = useState<string | null>(null)
  const first = useLoad(() => fetchInbox(filter, null), `inbox:${filter}`)
  const [more, setMore] = useState<{ key: string; items: ConversationSummary[]; next: string | null } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const search = useLoad(() => (query ? searchInbox(query) : Promise.resolve({ ok: true, data: { items: [] } } as Result<{ items: ConversationSummary[] }>)), `search:${query}`)

  // Looking again after leaving a conversation: the badge and the list are what the server says now.
  useEffect(() => refresh(), [refresh])

  const submitSearch = (event: FormEvent) => {
    event.preventDefault()
    const term = typed.replace(/\s+/g, ' ').trim()
    if (term.length === 0) return clear()
    if (term.length < 2) return setQueryError(w.search.tooShort)
    if (term.length > 100) return setQueryError(w.search.tooLong)
    setQueryError(null)
    setQuery(term)
  }
  const clear = () => {
    setTyped('')
    setQuery('')
    setQueryError(null)
  }
  const loadMore = async (next: string) => {
    setLoadingMore(true)
    const result = await fetchInbox(filter, next)
    setLoadingMore(false)
    if (result.ok) setMore((current) => ({ key: filter, items: [...(current?.key === filter ? current.items : []), ...result.data.items], next: result.data.next }))
  }

  return (
    <>
      <PageHeader title={w.title} lead={w.lead} focusKey="messages" />
      <div className={m.toolbar}>
        <form className={m.searchRow} role="search" aria-label={w.search.label} onSubmit={submitSearch} noValidate>
          <div className={m.field}>
            <label className={m.label} htmlFor="messages-search">
              {w.search.label}
            </label>
            <input id="messages-search" type="search" className={m.input} value={typed} maxLength={120} aria-describedby="messages-search-hint" aria-invalid={queryError ? true : undefined} onChange={(event) => setTyped(event.target.value)} />
          </div>
          <Button type="submit" variant="secondary">
            {w.search.submit}
          </Button>
          {query && (
            <Button type="button" variant="text" onClick={clear}>
              {w.search.clear}
            </Button>
          )}
        </form>
        <p id="messages-search-hint" className={m.hint}>
          {queryError ? <span role="alert">{queryError}</span> : w.search.hint}
        </p>
        {!query && (
          <ul className={m.filters} aria-label={w.filters.label}>
            {FILTERS.map((entry) => (
              <li key={entry}>
                <button type="button" className={m.filter} aria-pressed={filter === entry} onClick={() => setFilter(entry)}>
                  {w.filters[entry]}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={m.actions}>
          {canStart ? (
            <Button type="button" variant="primary" aria-expanded={creating} onClick={() => setCreating((open) => !open)}>
              {creating ? w.start.close : w.start.open}
            </Button>
          ) : (
            <p className={m.hint}>{w.start.closedNote}</p>
          )}
        </div>
      </div>

      {creating && canStart && <NewConversation initialAbout={about} onDone={() => setCreating(false)} />}

      <section className={styles.section} aria-labelledby="inbox-title">
        <h2 id="inbox-title" className={styles.sectionTitle}>
          {query ? fill(w.search.results, { count: search.state.status === 'ready' ? search.state.data.items.length : 0 }) : w.list.label}
        </h2>
        {query ? (
          <Load state={search.state} onRetry={search.reload}>
            {(data) => (data.items.length === 0 ? <p className={styles.muted}>{w.search.none}</p> : <ul className={m.cards}>{data.items.map((entry) => <Card key={entry.reference} entry={entry} />)}</ul>)}
          </Load>
        ) : (
          <Load state={first.state} onRetry={first.reload}>
            {(data) => {
              const extra = more && more.key === filter ? more : null
              const items = [...data.items, ...(extra?.items ?? [])]
              const next = extra ? extra.next : data.next
              if (items.length === 0) {
                return (
                  <div>
                    <p>{filter === 'all' ? w.list.empty : w.list.noneFiltered}</p>
                    {filter === 'all' && <p className={styles.muted}>{w.list.emptyHint}</p>}
                  </div>
                )
              }
              return (
                <>
                  <ul className={m.cards}>
                    {items.map((entry) => (
                      <Card key={entry.reference} entry={entry} />
                    ))}
                  </ul>
                  {next && (
                    <div className={m.actions}>
                      <Button type="button" variant="secondary" disabled={loadingMore} onClick={() => void loadMore(next)}>
                        {w.list.loadMore}
                      </Button>
                    </div>
                  )}
                </>
              )
            }}
          </Load>
        )}
      </section>
      <Preferences />
    </>
  )
}

// ============================================ one conversation ============================================================================

type Conversation = ConversationDetail

function useConversation(reference: string): { state: Loaded<Conversation>; apply: (next: Conversation) => void; reload: () => void } {
  const { ended } = usePortal()
  const [state, setState] = useState<Loaded<Conversation>>({ status: 'loading' })
  const [round, setRound] = useState(0)
  useEffect(() => {
    let current = true
    void fetchConversation(reference).then((result) => {
      if (!current) return
      if (result.ok) setState({ status: 'ready', data: result.data })
      else if (result.failure.kind === 'unauthorized') ended()
      else setState({ status: 'failed', failure: result.failure })
    })
    return () => {
      current = false
    }
  }, [reference, round, ended])
  const apply = useCallback((next: Conversation) => setState({ status: 'ready', data: next }), [])
  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setRound((value) => value + 1)
  }, [])
  return { state, apply, reload }
}

export function Message({ message, lang }: { message: ConversationMessage; lang: ReturnType<typeof useI18n>['lang'] }) {
  const words = usePortalText()
  const w = words.messages
  if (message.type === 'system_event' && message.event) {
    return (
      <li className={m.event} data-feed={message.feed}>
        <span>{eventText(words, message.event, lang)}</span>
        <time dateTime={message.createdAt}>{formatMoment(message.createdAt, lang)}</time>
      </li>
    )
  }
  return (
    <li className={m.message} data-from={message.from} data-kind={message.type}>
      <p className={m.messageHead}>
        <strong>{message.from === 'you' ? w.conversation.you : w.conversation.studio}</strong>
        {message.type === 'announcement' && <span className={m.tag}>{w.conversation.announcement}</span>}
        {message.important && <span className={m.tag}>{w.conversation.important}</span>}
        <time dateTime={message.createdAt}>{formatMoment(message.createdAt, lang)}</time>
      </p>
      {message.removed ? <p className={m.removed}>{w.conversation.removed}</p> : <p className={m.body}>{message.body}</p>}
    </li>
  )
}

export function ConversationPage({ detail, apply, reference }: { detail: Conversation; apply: (next: Conversation) => void; reference: string }) {
  const { lang } = useI18n()
  const words = usePortalText()
  const w = words.messages
  const { refresh } = useUnread()
  const [older, setOlder] = useState<ConversationMessage[]>([])
  const [hasOlder, setHasOlder] = useState(detail.page.hasOlder)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const token = useRef(makeToken())
  const field = useRef<HTMLTextAreaElement>(null)
  const marked = useRef(detail.marker)
  const newest = useRef(detail.page.newestSeq)

  const messages = useMemo(() => {
    const seen = new Set<number>()
    return [...older, ...detail.messages].filter((entry) => (seen.has(entry.seq) ? false : (seen.add(entry.seq), true)))
  }, [older, detail.messages])

  // Marked read only after the messages have been drawn, and only while the page is in front of the customer.
  const newestSeq = detail.page.newestSeq
  useEffect(() => {
    if (detail.kind !== 'thread' || !newestSeq) return
    const mark = () => {
      if (document.visibilityState !== 'visible' || newestSeq <= marked.current) return
      marked.current = newestSeq
      void markConversationRead(reference, newestSeq).then((result) => {
        if (result.ok) refresh()
        else marked.current = detail.marker
      })
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    return () => document.removeEventListener('visibilitychange', mark)
  }, [detail.kind, detail.marker, newestSeq, reference, refresh])

  // A new message that arrives while the page is open: asked for gently, said politely, never taken over what the customer is typing.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      void fetchConversation(reference).then((result) => {
        if (!result.ok || result.data.page.newestSeq === newest.current) return
        const arrived = result.data.messages.some((entry) => entry.seq > (newest.current ?? 0) && entry.from === 'studio')
        newest.current = result.data.page.newestSeq
        apply(result.data)
        if (arrived) setNotice(w.conversation.newMessages)
      })
    }, 45_000)
    return () => window.clearInterval(timer)
  }, [apply, reference, w.conversation.newMessages])

  const loadOlder = async () => {
    const before = messages[0]?.seq
    if (!before) return
    setLoadingOlder(true)
    const result = await fetchConversation(reference, before)
    setLoadingOlder(false)
    if (!result.ok) return setError(problemText(result.failure, words))
    setOlder((current) => [...result.data.messages, ...current])
    setHasOlder(result.data.page.hasOlder)
  }

  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    const text = body.trim()
    if (!text) {
      setError(w.conversation.errors.required)
      return field.current?.focus()
    }
    if (text.length > MAX) {
      setError(w.conversation.errors.tooLong)
      return field.current?.focus()
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await sendMessage(reference, { body: text, clientToken: token.current })
    setBusy(false)
    if (!result.ok) {
      setError(problemText(result.failure, words))
      return field.current?.focus()
    }
    token.current = makeToken()
    newest.current = result.data.page.newestSeq
    setBody('')
    setOlder([])
    setHasOlder(result.data.page.hasOlder)
    apply(result.data)
    setNotice(w.conversation.composer.sent)
    field.current?.focus()
  }

  const ask = async () => {
    setBusy(true)
    setError(null)
    const result = await requestResolution(reference)
    setBusy(false)
    if (!result.ok) return setError(problemText(result.failure, words))
    apply(result.data)
    setNotice(w.conversation.askResolutionDone)
  }

  const activity = detail.kind === 'activity'
  const link = contextPath(detail)
  const title = activity ? (detail.project ? `${w.list.activityTitle}: ${detail.project.name}` : w.list.activityGeneral) : (detail.subject ?? '')
  const who = detail.startedBy === 'customer' ? w.conversation.whoYou : w.conversation.whoStudio

  return (
    <>
      <PageHeader title={title} focusKey={reference}>
        {!activity && (
          <p className={styles.statusLine}>
            <StatusBadge status={detail.status} label={w.status[detail.status]} tone={TONE[detail.status]} />
            <span>{fill(w.conversation.started, { who, date: formatMoment(detail.createdAt, lang) })}</span>
          </p>
        )}
      </PageHeader>
      <p className={m.meta}>
        {detail.project && detail.context?.type !== 'project' && <span>{fill(w.list.project, { name: detail.project.name })}</span>}
        {detail.context && detail.context.type !== 'project' && (
          <span>
            {link ? (
              <LocalizedLink to={link} className={m.link}>
                {fill(w.list.about, { title: detail.context.title ?? `${w.contextTypes[detail.context.type]} ${detail.context.reference}` })}
              </LocalizedLink>
            ) : (
              fill(w.list.about, { title: detail.context.title ?? detail.context.reference })
            )}
          </span>
        )}
        {detail.context?.type === 'project' && link && (
          <LocalizedLink to={link} className={m.link}>
            {fill(w.list.about, { title: detail.context.title ?? detail.context.reference })}
          </LocalizedLink>
        )}
      </p>

      <section className={styles.section} aria-labelledby="timeline-title">
        <h2 id="timeline-title" className={styles.sectionTitle}>
          {w.conversation.timeline}
        </h2>
        {activity && <p className={styles.muted}>{w.conversation.feedNote}</p>}
        {hasOlder && (
          <div className={m.actions}>
            <Button type="button" variant="secondary" disabled={loadingOlder} onClick={() => void loadOlder()}>
              {loadingOlder ? w.conversation.loadingOlder : w.conversation.older}
            </Button>
          </div>
        )}
        {messages.length === 0 ? (
          <p className={styles.muted}>{w.conversation.noMessages}</p>
        ) : (
          // The log is a region that is announced as it grows; the list inside it stays a plain list (a list cannot carry that role).
          <div role="log" aria-live="polite" aria-relevant="additions" aria-label={w.conversation.timeline}>
            <ol className={m.timeline}>
              {messages.map((entry) => (
                <Message key={entry.id} message={entry} lang={lang} />
              ))}
            </ol>
          </div>
        )}
      </section>

      <p className={m.notice} role="status" hidden={!notice}>
        {notice}
      </p>

      {!activity && detail.status === 'resolved' && <p className={m.hint}>{w.conversation.resolvedNote}</p>}
      {!activity && detail.status === 'archived' && <p className={m.notice}>{w.conversation.closedNote}</p>}

      {detail.can.reply && (
        <form className={m.form} onSubmit={(event) => void send(event)} noValidate aria-labelledby="compose-title">
          <h2 id="compose-title" className={styles.sectionTitle}>
            {w.conversation.composer.label}
          </h2>
          {error && (
            <div className={m.errors} role="alert">
              <p>{w.conversation.errors.summary}</p>
              <ul>
                <li>
                  <a href="#message-text">{error}</a>
                </li>
              </ul>
            </div>
          )}
          <div className={m.field}>
            <label className={m.label} htmlFor="message-text">
              {w.conversation.composer.label}
            </label>
            <textarea id="message-text" ref={field} className={m.textarea} value={body} rows={5} maxLength={MAX + 400} aria-invalid={error ? true : undefined} aria-describedby="message-hint message-count" onChange={(event) => { setBody(event.target.value); if (error) setError(null) }} />
            <p id="message-hint" className={m.hint}>
              {w.conversation.composer.hint}
            </p>
            <p id="message-count" className={m.counter}>
              {fill(w.conversation.composer.count, { count: body.trim().length, max: MAX })}
            </p>
          </div>
          <div className={m.actions}>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? w.conversation.composer.sending : w.conversation.composer.send}
            </Button>
            {detail.can.requestResolution && (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void ask()}>
                {w.conversation.askResolution}
              </Button>
            )}
          </div>
          {detail.can.requestResolution && <p className={m.hint}>{w.conversation.askResolutionHint}</p>}
          {detail.resolutionRequested && <p className={m.hint}>{w.conversation.resolutionAsked}</p>}
        </form>
      )}
    </>
  )
}

export function ConversationView() {
  const { reference = '' } = useParams()
  // One conversation at a time: another reference is a new loader, with a state of its own.
  return <ConversationLoader key={reference} reference={reference} />
}

function ConversationLoader({ reference }: { reference: string }) {
  const words = usePortalText()
  const { state, apply, reload } = useConversation(reference)
  return (
    <>
      <p className={styles.back}>
        <LocalizedLink to="/client-portal/messages">← {words.messages.conversation.back}</LocalizedLink>
      </p>
      <Load state={state} onRetry={reload} heading>
        {(detail) => <ConversationPage key={detail.reference} detail={detail} apply={apply} reference={reference} />}
      </Load>
    </>
  )
}
