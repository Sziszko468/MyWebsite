import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { fill } from '../../utils/format'
import { ASSISTANT_LANGUAGES, assistant, type AssistantConfig, type AssistantLanguage, type ConversationSummary, type UnavailableReason } from '../api/assistant'
import { ApiError } from '../api/client'
import { AdminButton } from '../components/AdminButton'
import { useConfirm } from '../components/Confirm'
import { SelectField } from '../components/form'
import { EmptyState, ErrorState, LoadingState } from '../components/states'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/layout'
import { copyText, conversationSummary, downloadText, exportFileName } from '../assistant/exporters'
import { contextFromParams, contextPath, GENERAL_CONTEXT, sourcesOf, type ContextChoice } from '../assistant/model'
import { History, Insights } from '../assistant/Panes'
import { AssistantTextProvider, readStoredLanguage, storeLanguage, useAssistantText } from '../assistant/text'
import { Thread } from '../assistant/Thread'
import { useAssistantChat } from '../assistant/useAssistantChat'
import { useResource } from '../hooks/useResource'
import { useInterfaceLanguage, useText } from '../i18n'
import { describeError } from '../lib/errors'
import { useSession } from '../session/SessionProvider'
import styles from '../styles/assistant.module.scss'

/**
 * `/admin/ai-assistant` (PROMPT 31): the read-only AI copilot of the administration. Desktop: the history on the left, the conversation in the middle, the context and the
 * insights on the right. Narrower than that: one column, with a small navigation to move between the three. Everything it says is in the language the administrator picked for
 * the assistant (Hungarian, English or Dutch); everything it does is a read: the assistant has no tool that changes anything, and this screen has no button that would make
 * it. The server decides what the administrator may read, again, on every question.
 */

type View = 'history' | 'chat' | 'context'
const VIEWS: readonly View[] = ['chat', 'history', 'context']

export function AiAssistantPage() {
  const session = useSession()
  const interfaceLanguage = useInterfaceLanguage()
  const resource = useResource((signal) => assistant.config(signal), [])
  const [language, setLanguage] = useState<AssistantLanguage>(() => readStoredLanguage(interfaceLanguage))
  const choose = (next: AssistantLanguage) => {
    setLanguage(next)
    storeLanguage(next)
  }
  if (!session.can('assistant:use')) return <ErrorState error={new ApiError(403, 'forbidden', '')} level={1} />
  return (
    <AssistantTextProvider language={language}>
      {resource.loading || !resource.data ? resource.error ? <ErrorState error={resource.error} onRetry={resource.reload} level={1} /> : <Loading /> : <Frame config={resource.data} language={language} onLanguage={choose} />}
    </AssistantTextProvider>
  )
}

function Loading() {
  const t = useAssistantText()
  return <LoadingState label={t.unavailable.loading} />
}

function Frame({ config, language, onLanguage }: { config: AssistantConfig; language: AssistantLanguage; onLanguage: (language: AssistantLanguage) => void }) {
  const t = useAssistantText()
  const names = t.language.names as Record<string, string>
  const picker = <SelectField label={t.language.label} hint={t.language.note} value={language} onChange={(event) => onLanguage(event.target.value as AssistantLanguage)} options={ASSISTANT_LANGUAGES.map((code) => ({ value: code, label: names[code] }))} />
  return (
    <>
      <PageHeader title={t.title} lead={t.lead} actions={picker} />
      {config.available ? <Screen config={config} language={language} /> : <Unavailable config={config} />}
    </>
  )
}

function Unavailable({ config }: { config: AssistantConfig }) {
  const t = useAssistantText()
  const reason = (config.reason ?? 'admin_disabled') as UnavailableReason
  return (
    <EmptyState icon="alert" title={t.unavailable.title} action={config.canManage ? <AdminButton variant="primary" to="/ai?tab=assistant">{t.unavailable.manage}</AdminButton> : undefined}>
      {(t.errors as Record<string, string>)[reason] ?? t.errors.generic} {config.canManage ? '' : t.unavailable.contactOwner}
    </EmptyState>
  )
}

function Screen({ config, language }: { config: AssistantConfig; language: AssistantLanguage }) {
  const t = useAssistantText()
  const text = useText()
  const toast = useToast()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>('chat')
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null)
  const [listError, setListError] = useState(false)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const composer = useRef<HTMLTextAreaElement | null>(null)
  const queryRef = useRef(query)
  const finished = useRef<() => void>(() => undefined)

  const refresh = useCallback(async (q: string) => {
    try {
      setConversations(await assistant.list(q))
      setListError(false)
    } catch {
      setListError(true)
    }
  }, [])

  const chat = useAssistantChat({ language, onFinished: () => finished.current() })
  const { active } = chat

  finished.current = () => void refresh(queryRef.current)
  useEffect(() => {
    queryRef.current = query
    void refresh(query)
  }, [query, refresh])

  // The title the server gave a conversation (from its first question) is in the list: the heading follows it.
  const { setActive } = chat
  useEffect(() => {
    const row = conversations?.find((conversation) => conversation.id === active.id)
    if (row && (row.title !== active.title || active.isNew)) setActive({ title: row.title, isNew: false })
  }, [conversations, active.id, active.title, active.isNew, setActive])

  const focusComposer = () => window.requestAnimationFrame(() => composer.current?.focus())

  const startNew = useCallback(
    (context: ContextChoice) => {
      chat.startNew(context)
      setView('chat')
      focusComposer()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chat.startNew],
  )

  // A link from somewhere else (`?context=project&ref=PRJ-…`) starts a conversation about that record, once; the address is then cleaned.
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const requested = contextFromParams(params.get('context'), params.get('ref'))
    if (!requested) return
    chat.startNew(requested)
    setParams({}, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const open = async (id: string) => {
    try {
      chat.open(await assistant.read(id))
      setView('chat')
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 404 ? t.errors.not_found : describeError(text, error))
      void refresh(query)
    }
  }

  const remove = async (conversation: ConversationSummary) => {
    const ok = await confirm({ title: t.history.deleteTitle, body: t.history.deleteBody, confirmLabel: t.history.deleteConfirm, danger: true })
    if (!ok) return
    try {
      await assistant.remove(conversation.id)
      if (conversation.id === active.id) chat.startNew(active.context)
      void refresh(query)
    } catch (error) {
      toast.error(describeError(text, error))
    }
  }

  const clear = async () => {
    const ok = await confirm({ title: t.conversation.clearTitle, body: t.conversation.clearBody, confirmLabel: t.conversation.clearConfirm, danger: true })
    if (!ok) return
    try {
      // Always asked, never skipped on a guess about whether the server has it yet (an answer that has just finished is stored before the list knows): a conversation that
      // does not exist answers 404, which is fine.
      await assistant.remove(active.id).catch((error: unknown) => {
        if (!(error instanceof ApiError && error.status === 404)) throw error
      })
      startNew(active.context)
      void refresh(query)
    } catch (error) {
      toast.error(describeError(text, error))
    }
  }

  const sources = useMemo(() => sourcesOf(chat.messages), [chat.messages])
  const links = useMemo(() => new Map(sources.map((source) => [source.reference, source.path])), [sources])
  const names = t.context.types as Record<string, string>
  const contextLabel = active.context.type === 'general' ? names.general : `${names[active.context.type]} · ${active.context.ref}`
  const suggestions = (t.suggestions as Record<string, string[]>)[active.context.type]
  const locked = active.closed ? 'closed' : active.contextAvailable ? null : 'context'

  const summaryText = () => conversationSummary({ messages: chat.messages, contextLabel, sources, title: active.title, now: new Date() }, t, language)
  const copySummary = async () => {
    if (await copyText(summaryText())) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }
  const exportSummary = () => downloadText(exportFileName(t, new Date(), 'md'), summaryText())
  const send = (message: string) => {
    void chat.send(message)
    setView('chat')
  }

  return (
    <div className={styles.root} data-view={view}>
      <nav className={styles.switch} aria-label={t.panes.label}>
        <ul>
          {VIEWS.map((id) => (
            <li key={id}>
              <button type="button" className={styles.switchButton} aria-current={view === id ? 'true' : undefined} onClick={() => setView(id)}>
                {t.panes[id]}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className={styles.panes}>
        <div className={styles.paneHistory} data-pane="history">
          <History conversations={conversations} error={listError} query={query} onQuery={setQuery} activeId={active.id} onOpen={(id) => void open(id)} onNew={() => startNew(GENERAL_CONTEXT)} onDelete={(conversation) => void remove(conversation)} />
        </div>
        <div className={styles.paneChat} data-pane="chat">
          <Thread
            messages={chat.messages}
            status={chat.status}
            error={chat.error}
            links={links}
            max={config.maxInputChars}
            suggestions={suggestions}
            locked={locked}
            contextLabel={contextLabel}
            title={active.title}
            onSend={send}
            onStop={chat.stop}
            onRetry={() => void chat.retry()}
            onRegenerate={() => void chat.regenerate()}
            onNew={() => startNew(active.context)}
            onClear={() => void clear()}
            onCopySummary={() => void copySummary()}
            onExport={exportSummary}
            composerRef={composer}
            copied={copied}
          />
        </div>
        <div className={styles.paneContext} data-pane="context">
          <Insights config={config} context={active.context} contextPath={contextPath(active.context, sources)} sources={sources} suggestions={suggestions} busy={chat.busy} locked={locked !== null} onAsk={send} onStart={startNew} />
        </div>
      </div>
      <p className={styles.privacy}>
        {fill(t.privacy.notice, { provider: config.model.provider, model: config.model.name, days: config.retentionDays })}{' '}
        <a href={`/${language}/privacy`} target="_blank" rel="noopener noreferrer">
          {t.privacy.link}
        </a>
      </p>
    </div>
  )
}
