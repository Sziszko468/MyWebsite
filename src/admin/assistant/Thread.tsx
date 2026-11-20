import type { UIMessage } from 'ai'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react'
import { cx } from '../../utils/cx'
import { AdminButton } from '../components/AdminButton'
import { fill } from '../i18n'
import { DraftCard, OutlineCard, ProposalCard, ReportCard } from './Cards'
import { RichText } from './Markup'
import { NEEDS_NEW_CONVERSATION, NOT_RETRIABLE, chatErrorCode } from './useAssistantChat'
import { draftOf, outlineOf, proposalOf, reportOf, textOf, toolCallsOf, type ToolCall } from './model'
import { copyText } from './exporters'
import { useAssistantText } from './text'
import styles from '../styles/assistant.module.scss'

/**
 * The middle of the screen (PROMPT 31): what has been said, the suggested questions while nothing has, which tools the assistant is using and what they found, the stop /
 * retry / copy controls, the error in words, and the box to write in. It owns no conversation: that is `useAssistantChat`'s.
 */

function ToolChip({ call }: { call: ToolCall }) {
  const t = useAssistantText()
  const label = (t.tools.names as Record<string, string>)[call.name] ?? call.name
  const word = call.state === 'done' ? t.tools.done : call.state === 'failed' ? t.tools.failed : t.tools.running
  return (
    <li className={styles.tool} data-state={call.state}>
      <span className={styles.toolMark} aria-hidden="true" />
      <span>
        {word}: {label}
        {call.state === 'running' ? '…' : ''}
      </span>
    </li>
  )
}

export function MessageView({ message, links, last, busy, onCopy, onRegenerate }: { message: UIMessage; links: ReadonlyMap<string, string>; last: boolean; busy: boolean; onCopy: (text: string) => Promise<boolean>; onRegenerate: () => void }) {
  const t = useAssistantText()
  const [copied, setCopied] = useState(false)
  const body = textOf(message)
  if (message.role === 'user') {
    return (
      <li className={cx(styles.message, styles.user)} data-role="user">
        <span className={styles.who}>{t.conversation.you}</span>
        <div className={styles.bubble}>
          <p>{body}</p>
        </div>
      </li>
    )
  }
  const calls = toolCallsOf(message)
  const truncated = (message.metadata as { finishReason?: string } | undefined)?.finishReason === 'length'
  const copy = async () => {
    if (await onCopy(body)) {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    }
  }
  return (
    <li className={cx(styles.message, styles.assistant)} data-role="assistant">
      <span className={styles.who}>
        <span className={styles.avatar} aria-hidden="true">
          AI
        </span>
        {t.conversation.assistant}
      </span>
      {calls.length > 0 && (
        <ul className={styles.tools} aria-label={t.tools.label}>
          {calls.map((call) => (
            <ToolChip key={call.id} call={call} />
          ))}
        </ul>
      )}
      {body && (
        <div className={styles.bubble}>
          <RichText text={body} links={links} />
        </div>
      )}
      {calls.map((call) => {
        const report = reportOf(call)
        if (report) return <ReportCard key={call.id} report={report} />
        const draft = draftOf(call)
        if (draft) return <DraftCard key={call.id} draft={draft} />
        const outline = outlineOf(call)
        if (outline) return <OutlineCard key={call.id} outline={outline} />
        const proposal = proposalOf(call)
        if (proposal) return <ProposalCard key={call.id} proposal={proposal} />
        return null
      })}
      {truncated && (
        <p className={styles.notice} role="status">
          {t.status.truncated}
        </p>
      )}
      {last && !busy && body && (
        <div className={styles.messageActions}>
          <button type="button" className={styles.linkButton} onClick={() => void copy()}>
            {copied ? t.actions.copied : t.actions.copy}
          </button>
          <button type="button" className={styles.linkButton} onClick={onRegenerate}>
            {t.actions.regenerate}
          </button>
        </div>
      )}
    </li>
  )
}

export function Composer({ disabled, max, busy, onSend, onStop, inputRef }: { disabled: boolean; max: number; busy: boolean; onSend: (text: string) => void; onStop: () => void; inputRef: RefObject<HTMLTextAreaElement | null> }) {
  const t = useAssistantText()
  const id = useId()
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const used = [...value].length

  const resize = useCallback(() => {
    const element = inputRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 160)}px`
  }, [inputRef])
  useLayoutEffect(resize, [value, resize])

  const submit = (event?: FormEvent) => {
    event?.preventDefault()
    const message = value.trim()
    if (busy || disabled) return
    if (!message) return setProblem(t.errors.empty)
    if ([...message].length > max) return setProblem(fill(t.errors.tooLong, { max }))
    setProblem(null)
    setValue('')
    onSend(message)
  }
  const keys = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }
  return (
    <form className={styles.composer} onSubmit={submit} noValidate>
      <label htmlFor={id} className={styles.srOnly}>
        {t.composer.label}
      </label>
      <textarea
        id={id}
        ref={inputRef}
        className={styles.input}
        rows={1}
        value={value}
        placeholder={t.composer.placeholder}
        aria-describedby={`${id}-hint`}
        aria-invalid={problem ? true : undefined}
        enterKeyHint="send"
        autoComplete="off"
        spellCheck
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value)
          if (problem) setProblem(null)
        }}
        onKeyDown={keys}
      />
      {/* Two buttons with keys of their own, never one element whose type changes: a click on "Stop" that ends the answer would otherwise land on a "Send" button and submit the empty box. */}
      {busy ? (
        <AdminButton key="stop" type="button" variant="secondary" onClick={onStop}>
          {t.composer.stop}
        </AdminButton>
      ) : (
        <AdminButton key="send" type="submit" variant="primary" disabled={disabled}>
          {t.composer.send}
        </AdminButton>
      )}
      <p id={`${id}-hint`} className={styles.hint}>
        <span>{t.composer.hint}</span>
        <span className={cx(styles.counter, used > max * 0.8 && styles.counterWarn)}>{fill(t.composer.counter, { used, max })}</span>
      </p>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </form>
  )
}

export interface ThreadProps {
  messages: UIMessage[]
  status: string
  error: Error | undefined
  links: ReadonlyMap<string, string>
  max: number
  suggestions: readonly string[]
  /** The conversation cannot continue: closed, or its record is gone. */
  locked: 'closed' | 'context' | null
  /** The administrator had a context the assistant is answering about: the heading of the thread says which. */
  contextLabel: string
  title: string | null
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  onRegenerate: () => void
  onNew: () => void
  onClear: () => void
  onCopySummary: () => void
  onExport: () => void
  composerRef: RefObject<HTMLTextAreaElement | null>
  copied: boolean
}

export function Thread(props: ThreadProps) {
  const t = useAssistantText()
  const { messages, status, error, links, max, suggestions, locked } = props
  const log = useRef<HTMLDivElement | null>(null)
  const stick = useRef(true)
  const busy = status === 'submitted' || status === 'streaming'
  const last = messages.at(-1)
  const empty = messages.length === 0
  const headingId = useId()

  useEffect(() => {
    const element = log.current
    if (element && stick.current) element.scrollTop = element.scrollHeight
  }, [messages, status])
  const onScroll = () => {
    const element = log.current
    if (element) stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48
  }

  const code = chatErrorCode(error)
  const errorText = code ? fill(((t.errors as Record<string, string>)[code] ?? t.errors.generic) as string, { max }) : null
  const working = last?.role === 'assistant' && toolCallsOf(last).some((call) => call.state === 'running')
  const phase = status === 'submitted' || working ? t.status.thinking : status === 'streaming' ? t.status.writing : null
  const announce = status === 'ready' && last?.role === 'assistant' ? t.status.ready : ''
  const send = (text: string) => {
    stick.current = true
    props.onSend(text)
  }

  return (
    <section className={styles.thread} aria-labelledby={headingId}>
      <header className={styles.threadHead}>
        <div className={styles.threadTitle}>
          <h2 id={headingId}>{props.title ?? t.conversation.label}</h2>
          <p className={styles.contextChip}>{props.contextLabel}</p>
        </div>
        <div className={styles.threadActions}>
          <AdminButton variant="secondary" onClick={props.onCopySummary} disabled={empty}>
            {props.copied ? t.actions.copied : t.actions.copySummary}
          </AdminButton>
          <AdminButton variant="secondary" onClick={props.onExport} disabled={empty}>
            {t.actions.exportSummary}
          </AdminButton>
          <AdminButton variant="secondary" onClick={props.onClear} disabled={empty && !props.title}>
            {t.conversation.clear}
          </AdminButton>
        </div>
      </header>

      <div ref={log} className={styles.log} role="log" aria-live="off" tabIndex={0} aria-label={t.conversation.label} onScroll={onScroll}>
        <div className={styles.intro}>
          <div className={styles.bubble}>
            <p>{t.conversation.welcome}</p>
          </div>
        </div>
        {empty && !locked && (
          <div className={styles.chips} role="group" aria-label={t.conversation.suggestions}>
            {suggestions.map((label) => (
              <button key={label} type="button" className={styles.chip} disabled={busy} onClick={() => send(label)}>
                {label}
              </button>
            ))}
          </div>
        )}
        <ul className={styles.messages}>
          {messages.map((message, index) => (
            <MessageView key={message.id} message={message} links={links} last={index === messages.length - 1} busy={busy} onCopy={copyText} onRegenerate={props.onRegenerate} />
          ))}
        </ul>
        {phase && (
          <p className={styles.phase}>
            <span className={styles.dots} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            {phase}
          </p>
        )}
        {errorText && (
          <div className={styles.error} role="alert">
            <p>{errorText}</p>
            {code && !NOT_RETRIABLE.includes(code) && (
              <AdminButton variant="secondary" onClick={props.onRetry}>
                {t.errors.retry}
              </AdminButton>
            )}
            {code && NEEDS_NEW_CONVERSATION.includes(code) && (
              <AdminButton variant="secondary" onClick={props.onNew}>
                {t.history.new}
              </AdminButton>
            )}
          </div>
        )}
        {locked && (
          <div className={styles.locked} role="status">
            <p>{locked === 'closed' ? t.conversation.closed : t.conversation.contextGone}</p>
            <AdminButton variant="secondary" onClick={props.onNew}>
              {t.history.new}
            </AdminButton>
          </div>
        )}
      </div>
      <p className={styles.srOnly} role="status" aria-live="polite">
        {announce}
      </p>
      <div className={styles.footer}>
        <Composer disabled={locked !== null} max={max} busy={busy} onSend={send} onStop={props.onStop} inputRef={props.composerRef} />
      </div>
    </section>
  )
}
