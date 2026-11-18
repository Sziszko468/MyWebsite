import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { cx } from '../../utils/cx'
import { assistant, RECORD_CONTEXTS, type AssistantConfig, type ContextOption, type ContextType, type ConversationSummary } from '../api/assistant'
import { AdminButton } from '../components/AdminButton'
import { SearchInput, SelectField } from '../components/form'
import { Icon } from '../components/Icon'
import { fill } from '../i18n'
import { formatMoment } from './exporters'
import type { ContextChoice, RecordLink } from './model'
import { useAssistantLanguage, useAssistantText } from './text'
import styles from '../styles/assistant.module.scss'

/**
 * The two side panes of the screen (PROMPT 31): the history on the left (new, search, open, delete) and the context and insights on the right (what this conversation is
 * about and a way to start one about something else, the records the assistant used as links, suggested questions, and how to read an answer).
 */

export function History({ conversations, error, query, onQuery, activeId, onOpen, onNew, onDelete }: { conversations: ConversationSummary[] | null; error: boolean; query: string; onQuery: (value: string) => void; activeId: string; onOpen: (id: string) => void; onNew: () => void; onDelete: (conversation: ConversationSummary) => void }) {
  const t = useAssistantText()
  const language = useAssistantLanguage()
  const titleId = useId()
  const short = t.context.short as Record<string, string>
  return (
    <section className={styles.history} aria-labelledby={titleId}>
      <div className={styles.paneHead}>
        <h2 id={titleId}>{t.history.title}</h2>
        <AdminButton variant="primary" onClick={onNew}>
          <Icon name="plus" className={styles.buttonIcon} />
          {t.history.new}
        </AdminButton>
      </div>
      <SearchInput label={t.history.searchLabel} value={query} onSearch={onQuery} placeholder={t.history.searchPlaceholder} />
      {error && (
        <p className={styles.problem} role="alert">
          {t.history.loadFailed}
        </p>
      )}
      {conversations && conversations.length === 0 && <p className={styles.muted}>{query ? t.history.noMatch : t.history.none}</p>}
      {conversations && conversations.length > 0 && (
        <ul className={styles.historyList} aria-label={t.history.list}>
          {conversations.map((conversation) => {
            const title = conversation.title ?? t.history.untitled
            return (
              <li key={conversation.id} className={styles.historyItem} data-active={conversation.id === activeId ? 'true' : undefined}>
                <button type="button" className={styles.historyOpen} aria-current={conversation.id === activeId ? 'true' : undefined} onClick={() => onOpen(conversation.id)}>
                  <span className={styles.historyTitle}>{title}</span>
                  <span className={styles.historyMeta}>
                    {short[conversation.contextType]}
                    {conversation.contextRef ? ` · ${conversation.contextRef}` : ''} · {fill(t.history.messages, { count: conversation.messageCount })}
                  </span>
                  <span className={styles.historyMeta}>{formatMoment(conversation.updatedAt, language)}</span>
                </button>
                <button type="button" className={styles.iconButton} onClick={() => onDelete(conversation)}>
                  <Icon name="trash" />
                  <span className={styles.srOnly}>
                    {t.history.delete}: {title}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

const ACCESS: Record<Exclude<ContextType, 'general'>, keyof AssistantConfig['access']> = { project: 'projects', quote: 'quotes', customer: 'customers', conversation: 'conversations', consultation: 'consultations' }

function ContextPicker({ config, disabled, onStart }: { config: AssistantConfig; disabled: boolean; onStart: (context: ContextChoice) => void }) {
  const t = useAssistantText()
  const kinds = RECORD_CONTEXTS.filter((kind) => config.access[ACCESS[kind]])
  const [kind, setKind] = useState<Exclude<ContextType, 'general'>>(kinds[0] ?? 'project')
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<ContextOption[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (kinds.length === 0) return
    const controller = new AbortController()
    setFailed(false)
    assistant
      .contexts(kind, query, controller.signal)
      .then((found) => setOptions(found))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setFailed(true)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, query, kinds.length])

  const names = t.context.types as Record<string, string>
  return (
    <div className={styles.picker}>
      <AdminButton variant="secondary" onClick={() => onStart({ type: 'general', ref: null, label: null })} disabled={disabled}>
        {t.context.startGeneral}
      </AdminButton>
      {kinds.length > 0 && (
        <>
          <SelectField
            label={t.context.kind}
            value={kind}
            onChange={(event) => {
              const next = event.target.value as Exclude<ContextType, 'general'>
              // Choosing the kind that is already chosen changes nothing (the list is not asked for again, so it must not be emptied).
              if (next === kind) return
              setKind(next)
              setOptions(null)
              setQuery('')
            }}
            options={kinds.map((value) => ({ value, label: names[value] }))}
          />
          <SearchInput label={t.context.search} value={query} onSearch={setQuery} placeholder={t.context.searchPlaceholder} />
          {failed && (
            <p className={styles.problem} role="alert">
              {t.context.loadFailed}
            </p>
          )}
          {options && options.length === 0 && <p className={styles.muted}>{t.context.none}</p>}
          {options && options.length > 0 && (
            <ul className={styles.options} aria-label={t.context.pick}>
              {options.map((option) => (
                <li key={option.ref}>
                  <button type="button" className={styles.option} disabled={disabled} onClick={() => onStart({ type: kind, ref: option.ref, label: option.label })}>
                    <span>{option.label}</span>
                    <span className={styles.optionAction}>{t.context.start}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

export function Insights({ config, context, contextPath, sources, suggestions, busy, locked, onAsk, onStart }: { config: AssistantConfig; context: ContextChoice; contextPath: string | null; sources: readonly RecordLink[]; suggestions: readonly string[]; busy: boolean; locked: boolean; onAsk: (text: string) => void; onStart: (context: ContextChoice) => void }) {
  const t = useAssistantText()
  const titleId = useId()
  const names = t.context.types as Record<string, string>
  const kinds = t.insights.kinds as Record<string, string>
  return (
    <section className={styles.insights} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.srOnly}>
        {t.insights.title}
      </h2>

      <div className={styles.card}>
        <h3>{t.context.title}</h3>
        <p className={styles.contextNow}>
          <span className={styles.muted}>{t.context.current}</span>
          <strong>{names[context.type]}</strong>
          {context.ref && (
            <span className={styles.contextRef}>
              {contextPath ? <Link to={contextPath}>{context.ref}</Link> : context.ref}
            </span>
          )}
        </p>
        <p className={styles.badge}>
          <span className={styles.readOnlyBadge}>{t.readOnly}</span>
        </p>
        <p className={styles.muted}>{t.readOnlyNote}</p>
        <p className={styles.muted}>{t.context.note}</p>
      </div>

      <div className={styles.card}>
        <h3>{t.insights.actions}</h3>
        <p className={styles.muted}>{t.insights.actionsNote}</p>
        <ul className={styles.actionList}>
          {suggestions.map((label) => (
            <li key={label}>
              <button type="button" className={styles.action} disabled={busy || locked} onClick={() => onAsk(label)}>
                {label}
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.card}>
        <h3>{t.insights.sources}</h3>
        {sources.length === 0 ? (
          <p className={styles.muted}>{t.insights.noSources}</p>
        ) : (
          <ul className={styles.sourceList}>
            {sources.map((source) => (
              <li key={`${source.type}:${source.reference}`}>
                <span className={styles.muted}>{kinds[source.type] ?? source.type}</span>{' '}
                <Link to={source.path}>{source.reference}</Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.card}>
        <h3>{t.context.changeTitle}</h3>
        <p className={styles.muted}>{t.context.changeNote}</p>
        <ContextPicker config={config} disabled={busy} onStart={onStart} />
      </div>

      <div className={cx(styles.card, styles.legend)}>
        <h3>{t.insights.legend}</h3>
        <ul className={styles.bullets}>
          <li>{t.insights.legendFacts}</li>
          <li>{t.insights.legendAi}</li>
          <li>{t.insights.legendDrafts}</li>
        </ul>
        <p className={styles.muted}>
          {t.insights.model}: {config.model.name} ({config.model.provider})
        </p>
      </div>
    </section>
  )
}
