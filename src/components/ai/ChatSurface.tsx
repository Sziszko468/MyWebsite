import type { UIMessage } from 'ai'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { chatErrorCode, controlRoom, useControlRoom } from '../../ai/controlRoom'
import { useAiText } from '../../ai/useAiText'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { fill } from '../../utils/format'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { RichText } from './RichText'
import styles from './Chat.module.scss'

/**
 * The conversation itself, drawn the same way in the floating assistant and on the /control-room page: what has been said, the
 * suggested questions while nothing has, the state of the answer being written (and of each tool it uses), the stop / retry /
 * copy controls, the error, and the box to write in. It owns no conversation: that lives in `controlRoom` and is shared.
 */

const textOf = (message: UIMessage): string => message.parts.map((part) => (part.type === 'text' ? part.text : '')).join('')

type ToolPart = { type: string; state?: string }
const isTool = (part: { type: string }): part is ToolPart => part.type.startsWith('tool-')

function ToolChip({ part }: { part: ToolPart }) {
  const text = useAiText()
  const name = part.type.slice(5)
  const label = (text.status.tool as Record<string, string>)[name] ?? name
  const state = part.state === 'output-available' ? 'done' : part.state === 'output-error' ? 'failed' : 'working'
  return (
    <li className={styles.tool} data-state={state}>
      <span className={styles.toolMark} aria-hidden="true" />
      <span>{state === 'done' ? fill(text.status.toolDone, { name: label.replace(/…$/, '') }) : state === 'failed' ? text.status.toolFailed : label}</span>
    </li>
  )
}

function MessageView({ message, last, busy }: { message: UIMessage; last: boolean; busy: boolean }) {
  const text = useAiText()
  const [copied, setCopied] = useState(false)
  const body = textOf(message)
  const tools = message.parts.filter(isTool)
  if (message.role === 'user') {
    return (
      <li className={cx(styles.message, styles.user)}>
        <span className={styles.who}>{text.conversation.you}</span>
        <div className={styles.bubble}>
          <p>{body}</p>
        </div>
      </li>
    )
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      // The browser refused: nothing to show.
    }
  }
  return (
    <li className={cx(styles.message, styles.assistant)}>
      <span className={styles.who}>
        <span className={styles.avatar} aria-hidden="true">
          CR
        </span>
        {text.conversation.assistant}
      </span>
      {tools.length > 0 && (
        <ul className={styles.tools} aria-label={text.status.thinking}>
          {tools.map((part, index) => (
            <ToolChip key={index} part={part} />
          ))}
        </ul>
      )}
      {body && (
        <div className={styles.bubble}>
          <RichText text={body} />
        </div>
      )}
      {last && !busy && body && (
        <div className={styles.messageActions}>
          <button type="button" className={styles.link} onClick={() => void copy()}>
            {copied ? text.actions.copied : text.actions.copy}
          </button>
        </div>
      )}
    </li>
  )
}

function Composer({ disabled, max, onSend, onStop, busy, inputRef }: { disabled: boolean; max: number; onSend: (text: string) => void; onStop: () => void; busy: boolean; inputRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const text = useAiText()
  const [value, setValue] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const id = useId()
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
    if (!message) return setProblem(text.errors.empty)
    if ([...message].length > max) return setProblem(fill(text.errors.tooLong, { max }))
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
        {text.composer.label}
      </label>
      <textarea
        id={id}
        ref={inputRef}
        className={styles.input}
        rows={1}
        value={value}
        placeholder={text.composer.placeholder}
        aria-describedby={`${id}-hint`}
        aria-invalid={problem ? true : undefined}
        enterKeyHint="send"
        autoComplete="off"
        autoCapitalize="sentences"
        spellCheck
        disabled={disabled}
        onChange={(event) => {
          setValue(event.target.value)
          if (problem) setProblem(null)
        }}
        onKeyDown={keys}
      />
      {busy ? (
        <button type="button" className={cx(styles.send, styles.stop)} onClick={onStop}>
          <span className={styles.stopMark} aria-hidden="true" />
          {text.composer.stop}
        </button>
      ) : (
        <button type="submit" className={styles.send} disabled={disabled}>
          {text.composer.send}
        </button>
      )}
      <p id={`${id}-hint`} className={styles.hint}>
        <span className={styles.hintKeys}>{text.composer.hint}</span>
        <span className={cx(styles.counter, used > max * 0.8 && styles.counterWarn)} aria-live={used > max ? 'polite' : 'off'}>
          {fill(text.composer.counter, { used, max })}
        </span>
      </p>
      {problem && (
        <p className={styles.problem} role="alert">
          {problem}
        </p>
      )}
    </form>
  )
}

export function ChatSurface({ variant, composerRef }: { variant: 'panel' | 'page'; composerRef?: React.RefObject<HTMLTextAreaElement | null> }) {
  const room = useControlRoom()
  const text = useAiText()
  const { lang } = useI18n()
  const own = useRef<HTMLTextAreaElement | null>(null)
  const input = composerRef ?? own
  const log = useRef<HTMLDivElement | null>(null)
  const stick = useRef(true)
  const busy = room.status === 'submitted' || room.status === 'streaming'
  const max = room.config?.maxInputChars ?? 1200

  useEffect(() => {
    controlRoom.language = lang
  }, [lang])

  const lastMessage = room.messages.at(-1)
  const empty = room.messages.length === 0

  // Stay at the bottom while an answer is written, unless the visitor scrolled up to read.
  useEffect(() => {
    const element = log.current
    if (element && stick.current) element.scrollTop = element.scrollHeight
  }, [room.messages, room.status])
  const onScroll = () => {
    const element = log.current
    if (element) stick.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48
  }
  // Read out once an answer is complete (not while it streams, which would be a stream of interruptions).
  const announce = room.status === 'ready' && lastMessage?.role === 'assistant' ? text.status.ready : ''

  const code = chatErrorCode(room.error)
  const errorText = code ? ((text.errors as Record<string, string>)[code] ?? text.errors.generic) : null
  const welcome = room.config?.welcome[lang]?.trim() || text.welcome
  const chips = room.config?.suggestions[lang]?.length ? room.config.suggestions[lang].map((label) => ({ id: label, label, prompt: label })) : text.chips
  const days = room.config?.retentionDays ?? 7

  const writing = room.status === 'streaming' && lastMessage?.role === 'assistant'
  const working = lastMessage?.role === 'assistant' ? lastMessage.parts.some((part) => isTool(part) && part.state !== 'output-available' && part.state !== 'output-error') : false
  const phase = room.status === 'submitted' ? text.status.thinking : working ? text.status.thinking : writing ? text.status.writing : null

  const send = (message: string) => {
    stick.current = true
    room.clearError()
    void room.send(message)
  }
  const retry = () => {
    room.clearError()
    void room.controlRoom.regenerate()
  }

  if (room.loading) return <p className={styles.loading}>{text.status.connecting}</p>
  if (room.unavailable) {
    return (
      <div className={styles.unavailable} role="status">
        <p>{room.unavailable === 'budget' ? text.errors.budget : room.unavailable === 'model_unverified' ? text.errors.model_unverified : text.errors.unavailable}</p>
        <LocalizedLink to="/contact" className={styles.link}>
          {text.page.contact}
        </LocalizedLink>
      </div>
    )
  }

  return (
    <section className={cx(styles.surface, variant === 'page' && styles.page)} aria-label={text.conversation.label}>
      <div ref={log} className={styles.log} role="log" aria-live="off" tabIndex={0} aria-label={text.conversation.label} onScroll={onScroll}>
        <div className={styles.intro}>
          <div className={styles.bubble}>
            <p>{welcome}</p>
          </div>
          <p className={styles.identity}>{text.identity}</p>
        </div>
        {empty && (
          <div className={styles.chips} role="group" aria-label={text.conversation.suggestions}>
            {chips.map((chip) => (
              <button key={chip.id} type="button" className={styles.chip} disabled={busy} onClick={() => send(chip.prompt)}>
                {chip.label}
              </button>
            ))}
          </div>
        )}
        <ul className={styles.messages}>
          {room.messages.map((message, index) => (
            <MessageView key={message.id} message={message} last={index === room.messages.length - 1} busy={busy} />
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
            {code !== 'unavailable' && code !== 'budget' && code !== 'model_unverified' && code !== 'model_mismatch' && code !== 'model_not_found' && code !== 'conversation_expired' && code !== 'conversation_full' && (
              <button type="button" className={styles.retry} onClick={retry}>
                {text.actions.retry}
              </button>
            )}
            {(code === 'conversation_expired' || code === 'conversation_full') && (
              <button type="button" className={styles.retry} onClick={() => room.controlRoom.newConversation()}>
                {text.actions.newChat}
              </button>
            )}
          </div>
        )}
        {!busy && !errorText && lastMessage?.role === 'assistant' && textOf(lastMessage) && (
          <div className={styles.regenerate}>
            <button type="button" className={styles.link} onClick={retry}>
              {text.actions.regenerate}
            </button>
          </div>
        )}
      </div>
      <p className={styles.srOnly} role="status" aria-live="polite">
        {announce}
      </p>
      <div className={styles.footer}>
        <Composer disabled={false} max={max} busy={busy} onSend={send} onStop={() => room.controlRoom.stop()} inputRef={input} />
        <p className={styles.privacy}>
          {fill(text.privacy.notice, { days })}{' '}
          <LocalizedLink to="/privacy" className={styles.link}>
            {text.privacy.more}
          </LocalizedLink>
        </p>
      </div>
    </section>
  )
}
