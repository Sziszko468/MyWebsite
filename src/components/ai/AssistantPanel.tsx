import { useEffect, useRef, useState } from 'react'
import { controlRoom, useControlRoom } from '../../ai/controlRoom'
import { useAiText } from '../../ai/useAiText'
import { useVisualViewport } from '../../ai/viewport'
import { useI18n } from '../../i18n/useI18n'
import { cx } from '../../utils/cx'
import { LocalizedLink } from '../LocalizedLink/LocalizedLink'
import { ChatSurface } from './ChatSurface'
import { HistoryList } from './HistoryList'
import { PlanPanel } from './PlanPanel'
import styles from './Assistant.module.scss'

/**
 * The floating assistant: a panel in the corner on a large screen, the whole screen on a phone. It is a native <dialog>: on a
 * phone it opens modally (the page behind it is inert, Tab stays inside, Escape closes), on a large screen it opens beside the
 * page without blocking it (Escape still closes it). It shows the SAME conversation as the /control-room page: both read
 * `controlRoom`. This whole file, the AI SDK's client and everything the conversation needs are loaded only when it is opened.
 */

const PHONE = '(max-width: 47.99rem)'
type View = 'chat' | 'plan' | 'history'

export default function AssistantPanel({ onClose }: { onClose: () => void }) {
  const text = useAiText()
  const { lang } = useI18n()
  const room = useControlRoom()
  const dialog = useRef<HTMLDialogElement | null>(null)
  const composer = useRef<HTMLTextAreaElement | null>(null)
  const [element, setElement] = useState<HTMLDialogElement | null>(null)
  const [view, setView] = useState<View>('chat')
  const [large, setLarge] = useState(false)
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches)

  useVisualViewport(element, phone)

  useEffect(() => {
    const query = window.matchMedia(PHONE)
    const update = () => setPhone(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  // Open (modally on a phone), start the conversation, put the cursor in the box. Closing returns focus to the button that opened it.
  useEffect(() => {
    const node = dialog.current
    if (!node) return
    setElement(node)
    if (!node.open) {
      if (phone) node.showModal()
      else node.show()
    }
    controlRoom.language = lang
    void controlRoom.start().then(() => composer.current?.focus({ preventScroll: true }))
    return () => {
      if (node.open) node.close()
    }
    // The panel is opened once per mount; a change of breakpoint is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const node = dialog.current
    if (!node || !node.open) return
    // Crossing the phone breakpoint while open: reopen in the other mode.
    const modal = node.matches(':modal')
    if (phone && !modal) {
      node.close()
      node.showModal()
    } else if (!phone && modal) {
      node.close()
      node.show()
    }
  }, [phone])

  const close = () => onClose()
  const planReady = Boolean(room.plan?.ready && !room.plan.sent)

  return (
    <dialog
      ref={dialog}
      className={cx(styles.panel, large && styles.large)}
      data-theme="dark"
      aria-labelledby="assistant-title"
      onClick={(event) => {
        // A link in an answer leads to another page: a panel that is the whole screen must not stay over it.
        const link = (event.target as HTMLElement).closest('a[href]')
        if (link && !link.hasAttribute('target')) close()
      }}
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          close()
        }
      }}
    >
      {/* A div, not a <header>: outside a section a <header> is the page's banner, and the page already has one. */}
      <div className={styles.header}>
        <span className={styles.status} aria-hidden="true" />
        <h2 id="assistant-title" className={styles.title}>
          {text.panel.title}
        </h2>
        <div className={styles.tools}>
          <button type="button" className={cx(styles.tool, view === 'history' && styles.active)} aria-pressed={view === 'history'} onClick={() => setView(view === 'history' ? 'chat' : 'history')} aria-label={text.history.toggle} title={text.history.toggle}>
            <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />
            </svg>
          </button>
          <button type="button" className={styles.tool} onClick={() => controlRoom.newConversation()} aria-label={text.actions.newChat} title={text.actions.newChat}>
            <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          {!phone && (
            <button type="button" className={styles.tool} aria-pressed={large} onClick={() => setLarge(!large)} aria-label={large ? text.panel.collapse : text.panel.expand} title={large ? text.panel.collapse : text.panel.expand}>
              <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                {large ? <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /> : <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />}
              </svg>
            </button>
          )}
          <LocalizedLink to="/control-room" className={styles.tool} onClick={close} aria-label={text.panel.openPage} title={text.panel.openPage}>
            <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M14 3h7v7M10 14 21 3M21 14v7H3V3h7" />
            </svg>
          </LocalizedLink>
          <button type="button" className={cx(styles.tool, styles.closer)} onClick={close} aria-label={text.panel.close} title={text.panel.close}>
            <svg viewBox="0 0 24 24" width="1.1em" height="1.1em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
      <p className={styles.tagline}>{text.tagline}</p>

      <div className={styles.tabs} role="tablist" aria-label={text.panel.title}>
        <button type="button" role="tab" id="assistant-tab-chat" aria-selected={view === 'chat'} aria-controls="assistant-view" className={styles.tab} tabIndex={view === 'chat' ? 0 : -1} onClick={() => setView('chat')}>
          {text.actions.chat}
        </button>
        <button type="button" role="tab" id="assistant-tab-plan" aria-selected={view === 'plan'} aria-controls="assistant-view" className={styles.tab} tabIndex={view === 'plan' ? 0 : -1} onClick={() => setView('plan')}>
          {text.actions.plan}
          {planReady && <span className={styles.dot} aria-hidden="true" />}
        </button>
      </div>

      <div id="assistant-view" className={styles.body} role="tabpanel" aria-labelledby={view === 'plan' ? 'assistant-tab-plan' : 'assistant-tab-chat'}>
        {view === 'chat' && <ChatSurface variant="panel" composerRef={composer} />}
        {view === 'plan' && (
          <div className={styles.scroll}>
            <PlanPanel onAsk={() => setView('chat')} />
          </div>
        )}
        {view === 'history' && (
          <div className={styles.scroll}>
            <HistoryList onChosen={() => setView('chat')} />
          </div>
        )}
      </div>
    </dialog>
  )
}
